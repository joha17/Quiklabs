/**
 * Nombres y descripciones accesibles de B03 (§14): lo OBSERVABLE de cada objeto. El microscopio, los portaobjetos, la
 * pinza y los goteros se describen como en B02 (mismo equipo); aquí se agregan las membranas (material rotulado, si
 * está húmeda o rasgada a la vista), las cámaras (membrana, pinza, tapa, nivel y color de cada lado, charco), los
 * frascos, las probetas, la pipeta y los tubos (rótulo, contenido aproximado, color). Nunca da concentraciones ni
 * cifras internas: los volúmenes se LEEN con el instrumento.
 */
import type { PermWorld, Vessel } from '../../simulation/perm-world/types';
import { b02NameOf, describeObject as describeB02, microscopeStatus as microscopeStatusB02, stereoStatus } from '../b02/describe';
import { t } from '../i18n';

const has = (k: string) => t(k) !== k;

export function b03NameOf(w: PermWorld, id: string): string {
  // El lado se separa antes de buscar: i18next lee «:» como separador de espacio de nombres (`c1:A` → «A»).
  const [obj, side] = id.split(':');
  if (side && w.objects[obj]) return `${b03NameOf(w, obj)} — ${t('b03.nb.side', { s: side })}`;
  if (has(`b03.obj.${id}`)) return t(`b03.obj.${id}`);
  // Equipo compartido: el nombre de B02; material propio: el rótulo de la mesada.
  if (has(`b02.obj.${id}`)) return t(`b02.obj.${id}`);
  const o = w.objects[id];
  if (o?.label) return o.label;
  return b02NameOf(w, id);
}

export const b03NameTag = b03NameOf;
export const microscopeStatus = microscopeStatusB02;
export { stereoStatus };

/** Nivel aproximado en palabras (lo que se ve sin instrumento). */
const level = (v: Vessel) => {
  const f = v.volumeMl / Math.max(1e-6, v.capacityMl);
  return t(f < 0.01 ? 'b03.desc.empty' : f < 0.25 ? 'b03.desc.low' : f < 0.7 ? 'b03.desc.half' : f < 0.95 ? 'b03.desc.high' : 'b03.desc.brim');
};

/** Aspecto del líquido: color del trazador, turbidez de proteína o de AgCl, azul o violeta del Biuret. */
function look(w: PermWorld, v: Vessel, tubeId?: string): string {
  if (v.volumeMl < 1e-3) return '';
  const out: string[] = [];
  const vol = v.volumeMl;
  if (v.amounts.tracer / vol > 0.0008) out.push(t('b03.desc.amber'));
  if (v.amounts.protein / vol > 5) out.push(t('b03.desc.milky'));
  if (v.tags.some((x) => x === 'bS' || x === 'bSc' || x === 'bL') || v.amounts.glucose > 0) out.push(t('b03.desc.syrupy'));
  if (v.biuretMl > 0) {
    const tube = tubeId ? w.perm.tubes[tubeId] : null;
    const age = tube?.reagentAt !== null && tube?.reagentAt !== undefined ? w.timeS - tube.reagentAt : 0;
    out.push(t(v.amounts.protein / vol > 1 && age > 30 ? 'b03.desc.violet' : 'b03.desc.blue'));
  }
  if (v.pptMmol > (w.params.perm?.assay.aggVisibleMmol ?? 0.002)) out.push(t('b03.desc.whitePpt'));
  return out.join(', ') || t('b03.desc.clear');
}

export function describeObject(w: PermWorld, id: string, mode: string): string {
  const o = w.objects[id];
  const P = w.perm;
  if (!o || !P) return describeB02(w, id, mode);
  const parts: string[] = [];
  const m = P.membranes[id];
  if (m) {
    parts.push(t(`b03.material.${m.material}`));
    if (m.installedIn) parts.push(t('b03.desc.installedIn', { c: b03NameOf(w, m.installedIn) }));
    else if (o.support === 'sk') parts.push(t('b03.desc.soaking'));
    parts.push(t(m.wet01 >= (w.params.perm?.wetMin ?? 0.6) ? 'b03.desc.wet' : 'b03.desc.dry'));
    // Una rotura de fábrica se ve al inspeccionar; la del apriete, siempre.
    if (!m.intact && (m.tornBy === 'clamp' || w.evidence[`inspected:${id}`] || w.evidence[`residueSeen:${id}`])) parts.push(t('b03.desc.torn'));
    return parts.join(' · ');
  }
  const c = P.cells[id];
  if (c) {
    parts.push(c.membraneId ? t('b03.desc.withMembrane', { m: b03NameOf(w, c.membraneId) }) : t('b03.desc.noMembrane'));
    if (c.membraneId) parts.push(t('b03.desc.clamp', { n: c.clampTurns.toFixed(2).replace('.', ',') }));
    for (const s of ['A', 'B'] as const) {
      const v = c.sides[s];
      parts.push(`${s}: ${level(v)}${v.volumeMl > 1e-3 ? ` (${look(w, v)})` : ''}`);
    }
    parts.push(t(c.lidClosed ? 'b03.desc.lidClosed' : 'b03.desc.lidOpen'));
    if (c.leakOutMl > 0.05) parts.push(t('b03.desc.puddle'));
    if (c.mixing.A > 0 || c.mixing.B > 0) parts.push(t('b03.desc.mixing'));
    return parts.join(' · ');
  }
  const tube = P.tubes[id];
  if (tube) {
    parts.push(tube.label ? t('b03.desc.labelled', { l: t(`b03.tubeLabel.${tube.label}`) }) : t('b03.desc.unlabelled'));
    if (tube.discarded) return [...parts, t('b03.desc.discarded')].join(' · ');
  }
  const v = P.vessels[id];
  if (v && id !== 'spill') {
    parts.push(level(v));
    const lk = look(w, v, id);
    if (lk) parts.push(lk);
    if (P.pours[id]) parts.push(t('b03.desc.pouring', { to: b03NameOf(w, P.pours[id].targetId) }));
    if (id === 'pi' && P.pipette.residueFrom) parts.push(t('b03.desc.residueFrom', { s: b03NameOf(w, P.pipette.residueFrom) }));
    return parts.join(' · ');
  }
  if (id === 'co') return t(P.colorimeterZeroed ? 'b03.desc.zeroed' : 'b03.desc.notZeroed');
  return describeB02(w, id, mode);
}
