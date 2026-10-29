/**
 * Nombres y descripciones accesibles de B05 (§14): lo OBSERVABLE de cada objeto. El microscopio, los portaobjetos, la
 * pinza y los goteros del montaje de papa se describen como en B02 (mismo equipo); aquí se agregan los frascos, los
 * lotes (aspecto, pastilla, si sedimentó), los tubos (rótulo, nivel, color, espuma, tapón, baño), las placas, los
 * baños (encendido, estable o calentando), el captador y el fotómetro. Nunca da concentraciones ni cifras internas:
 * los volúmenes, masas y temperaturas se LEEN con el instrumento.
 */
import type { EnzVessel, EnzWorld } from '../../simulation/enz-world/types';
import { benedictColor, lugolSignal } from '../../simulation/enz-world/chemistry';
import { b02NameOf, describeObject as describeB02, microscopeStatus as microscopeStatusB02, stereoStatus } from '../b02/describe';
import { t } from '../i18n';

const has = (k: string) => t(k) !== k;

export function b05NameOf(w: EnzWorld, id: string): string {
  // Lecturas del colector con su tubo («gc:t1»): i18next lee «:» como separador de espacio de nombres.
  const [obj, sub] = id.split(':');
  if (sub && w.objects[sub]) return `${b05NameOf(w, obj)} — ${b05NameOf(w, sub)}`;
  if (has(`b05.obj.${id}`)) return t(`b05.obj.${id}`);
  const o = w.objects[id];
  if (o?.label) return o.label;
  if (has(`b02.obj.${id}`)) return t(`b02.obj.${id}`);
  return b02NameOf(w, id);
}

/** Nombre con el rótulo del tubo, si lo tiene. */
export function b05TubeName(w: EnzWorld, id: string): string {
  const tube = w.enz?.tubes[id];
  return tube?.label ? `${b05NameOf(w, id)} «${tube.label}»` : b05NameOf(w, id);
}

export const b05NameTag = (w: EnzWorld, id: string) => (w.enz?.tubes[id] ? b05TubeName(w, id) : b05NameOf(w, id));
export const microscopeStatus = microscopeStatusB02;
export { stereoStatus };

/** Nivel aproximado en palabras (lo que se ve sin instrumento). */
const level = (v: EnzVessel) => {
  const f = v.volumeMl / Math.max(1e-6, v.capacityMl);
  return t(f < 0.01 ? 'b05.desc.empty' : f < 0.25 ? 'b05.desc.low' : f < 0.7 ? 'b05.desc.half' : f < 0.95 ? 'b05.desc.high' : 'b05.desc.brim');
};

/** Aspecto del líquido: lechoso (almidón), pardo rojizo (extracto), color de Lugol o de Benedict, sedimento. */
function look(w: EnzWorld, v: EnzVessel): string {
  if (v.volumeMl < 1e-3) return '';
  const p = w.params.enz!;
  const out: string[] = [];
  const vol = v.volumeMl;
  const s = v.s;
  if ((s.starch + s.starchSolid) / vol > 0.05) out.push(t('b05.desc.milky'));
  if (s.tissueMg / vol > 1) out.push(t('b05.desc.extract'));
  if (s.starchSolid + s.tissueMg > 1e-3 && v.homog01 < 0.6) out.push(t('b05.desc.settled'));
  if (s.iodine > 1e-9) {
    const sig = lugolSignal(p.lugol, s, vol);
    out.push(t(`b05.desc.lugol_${sig.color}`));
    if (sig.localized) out.push(t('b05.desc.granules'));
  }
  if (s.cu + s.cu2o > 1e-9) out.push(t(`b05.desc.benedict_${benedictColor(p.benedict, s, vol)}`));
  return out.join(', ') || t('b05.desc.clear');
}

export function describeObject(w: EnzWorld, id: string, mode: string): string {
  const o = w.objects[id];
  const E = w.enz;
  if (!o || !E) return describeB02(w, id, mode);
  const parts: string[] = [];
  const tube = E.tubes[id];
  if (tube) {
    parts.push(tube.label ? t('b05.desc.labelled', { l: tube.label }) : t('b05.desc.unlabelled'));
    if (tube.bath) parts.push(t('b05.desc.inBath', { b: b05NameOf(w, tube.bath.id) }));
    if (tube.stoppered) parts.push(t('b05.desc.stoppered'));
    if (tube.foamMl > 0.3) parts.push(t('b05.desc.foam'));
    if (E.collector.tubeId === id) parts.push(t('b05.desc.collector'));
  }
  const v = E.vessels[id];
  if (v && id !== 'spill') {
    parts.push(level(v));
    const lk = look(w, v);
    if (lk) parts.push(lk);
    if (E.pours[id]) parts.push(t('b05.desc.pouring', { to: b05NameOf(w, E.pours[id].targetId) }));
    if (Object.values(E.bars).includes(id)) parts.push(t('b05.desc.bar'));
    const pip = E.pipettes[id];
    if (pip?.residueFrom) parts.push(t('b05.desc.residueFrom', { s: b05NameOf(w, pip.residueFrom) }));
    return parts.join(' · ');
  }
  const plate = E.plates[id];
  if (plate) return [t(plate.heatOn ? 'b05.desc.heatOn' : 'b05.desc.heatOff'), t('b05.desc.rpm', { n: plate.rpm })].join(' · ');
  const bath = E.baths[id];
  if (bath) return t(!bath.on ? 'b05.desc.bathOff' : bath.stableSince !== null ? 'b05.desc.bathStable' : 'b05.desc.bathHeating', { c: (bath.setK - 273.15).toFixed(1).replace('.', ',') });
  if (id === 'gc') return E.collector.tubeId ? t('b05.desc.collectorOn', { t: b05TubeName(w, E.collector.tubeId) }) : t('b05.desc.collectorOff');
  if (id === 'uv') return t(!E.adhEnabled ? 'b05.desc.uvLocked' : E.uv.blankA !== null ? 'b05.desc.uvBlank' : 'b05.desc.uvNoBlank');
  if (id === 'bn') return t(E.burnerLit ? 'b05.desc.burnerOn' : 'b05.desc.burnerOff');
  if (E.liver[id]) return t('b05.desc.liver');
  if (id === 'bdL') return E.board && E.board.massG > 0 ? t('b05.desc.board', { n: E.board.pieces }) : t('b05.desc.boardEmpty');
  if (id === 'wb') return Object.values(E.boat).some((g) => g > 0.005) || E.boatTissue ? t('b05.desc.boatLoaded') : t('b05.desc.boatEmpty');
  if (id === 'sp2') return Object.values(E.spatula).some((g) => g > 0.005) ? t('b05.desc.spatulaLoaded') : t('b05.desc.spatulaClean');
  return describeB02(w, id, mode);
}
