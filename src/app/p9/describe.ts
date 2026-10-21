/**
 * Nombres y descripciones accesibles de la Práctica 9: lo OBSERVABLE de cada objeto (volumen en palabras, rótulo,
 * turbidez y sedimento con su color, tapa, estado de la campana, la llama, la centrífuga y el asa). Nunca revela qué
 * cationes hay ni cantidades no medidas; en Evaluación tampoco da valores exactos.
 */
import type { P09World } from '../../simulation/cation-analysis-world/types';
import { flameView, flowStatus, sashOK, solidSplit, vesselMl } from '../../simulation/cation-analysis-world/world';
import { massG, volumeMl } from '../../simulation/cation-analysis-world/species';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

/** Categoría de color observada en palabras (las observaciones de tubos traen «sólido|tinte»). */
export function colorWords(cat: string | undefined): string {
  return (cat || 'none').split('|').map((c) => t(`p9.color.${c}`)).join(', ');
}

export function p09NameOf(w: P09World, id: string): string {
  if (has(`p9.obj.${id}`)) return t(`p9.obj.${id}`);
  const o = w.objects[id];
  return o ? t(`p9.kind.${o.kind}`) : id;
}

export function p09NameTag(w: P09World, id: string): string {
  const v = w.vessels[id];
  // Los tubos muestran el rótulo que les escribió el estudiante (el de fábrica es solo «tubo n»).
  if (v?.shape === 'tube') return v.label ? `${p09NameOf(w, id)} · ${v.label}` : p09NameOf(w, id);
  if (has(`p9.tag.${id}`)) return t(`p9.tag.${id}`);
  return p09NameOf(w, id);
}

/** Volumen en palabras: aproximado en práctica; en evaluación solo «poco / mitad / casi lleno». */
export function volumeWords(ml: number, capacity: number, mode: string): string {
  if (ml < 0.005) return t('p9.desc.empty');
  if (mode === 'EVALUATION') return ml / capacity < 0.25 ? t('p9.desc.little') : ml / capacity < 0.75 ? t('p9.desc.half') : t('p9.desc.full');
  return t('p9.desc.ml', { ml: fmt(ml, ml < 10 ? 1 : 0) });
}

/** Aspecto de los sólidos (color observable, sin nombrar la especie). */
function solidWords(w: P09World, id: string): string[] {
  const v = w.vessels[id];
  if (!v) return [];
  const fe = v.solid['FeOH3(s)'] ?? 0;
  const sr = v.solid['SrSO4(s)'] ?? 0;
  if ((fe + sr) * 150 < 1e-6) return [];
  const color = fe * 107 > 1e-6 && sr * 184 > 1e-6 ? 'brownAndWhite' : fe * 107 > sr * 184 ? 'brown' : 'white';
  const sp = solidSplit(v);
  const out: string[] = [];
  if (sp.susp > sp.pellet * 0.2) out.push(t('p9.desc.turbid', { c: t(`p9.color.${color}`) }));
  if (sp.pellet > 1e-8) out.push(t('p9.desc.pellet', { c: t(`p9.color.${color}`) }));
  return out;
}

export function describeObject(w: P09World, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const v = w.vessels[id];
  if (v) {
    const parts: string[] = [];
    if (v.label && v.shape === 'tube') parts.push(t('p9.desc.label', { l: v.label }));
    if (v.capped) parts.push(t('p9.desc.capped'));
    parts.push(volumeWords(vesselMl(v), v.capacityMl, mode));
    parts.push(...solidWords(w, id));
    if (v.shape !== 'tube' && massG(v.solid) > 1e-6 && vesselMl(v) < 0.005) parts.push(t('p9.desc.dryResidue'));
    if (v.stir01 > 0) parts.push(t('p9.desc.stirring'));
    if (o.support.startsWith('cf:')) parts.push(t('p9.desc.inRotor', { n: Number(o.support.slice(3)) + 1 }));
    if (o.support.startsWith('rack:')) parts.push(t('p9.desc.inRack', { n: Number(o.support.slice(5)) + 1 }));
    if (o.support === 'flamePad') parts.push(t('p9.desc.onFlame'));
    if (o.kind === 'watchGlass') parts.push(t(w.flame.glassCracked ? 'p9.desc.cracked' : 'p9.desc.virtual'));
    return parts.filter(Boolean).join(' · ');
  }
  switch (o.kind) {
    case 'balance': {
      const b = w.balance;
      if (!b.powered) return t('p9.desc.off');
      return [b.stable ? t('p9.desc.stable') : t('p9.desc.unstable'), b.panIds.length ? t('p9.desc.onPan', { o: b.panIds.map((x) => p09NameOf(w, x)).join(', ') }) : t('p9.desc.panEmpty')].join(' · ');
    }
    case 'hood':
      return [t('p9.desc.flow', { f: t(`p9.flow.${flowStatus(w)}`) }), t(sashOK(w) ? 'p9.desc.sashOk' : 'p9.desc.sashHigh', { cm: Math.round(w.hood.sashCm) }), t('p9.desc.light', { pct: w.hood.lightPct })].join(' · ');
    case 'emitter': {
      if (!w.flame.ignited) return t('p9.desc.flameOff');
      const fv = flameView(w);
      return [t('p9.desc.flameOn'), t('p9.desc.flameColor', { c: t(`p9.color.${fv.category}`) })].join(' · ');
    }
    case 'centrifuge': {
      const c = w.centrifuge;
      const n = Object.values(w.objects).filter((x) => x.support.startsWith('cf:')).length;
      return [t(c.lidClosed ? 'p9.desc.lidClosed' : 'p9.desc.lidOpen'), c.rpm > 1 ? t('p9.desc.spinning', { rpm: Math.round(c.rpm) }) : t('p9.desc.stopped'), t('p9.desc.tubesIn', { n })].join(' · ');
    }
    case 'loop': {
      const l = w.loop;
      return [massG(l.load) > 1e-9 ? t('p9.desc.loopLoaded') : t('p9.desc.loopEmpty'), l.tempC > 200 ? t('p9.desc.glowing') : '', o.support === 'flame' ? t('p9.desc.inFlame') : o.support === 'clean01' ? t('p9.desc.inClean') : ''].filter(Boolean).join(' · ');
    }
    case 'pipette': {
      const ml = volumeMl(w.pipette.content);
      return [volumeWords(ml, 3, mode), w.vessels[o.support] ? t('p9.desc.tipIn', { o: p09NameOf(w, o.support) }) : ''].filter(Boolean).join(' · ');
    }
    case 'turbidimeter':
      return o.id && Object.values(w.objects).some((x) => x.support === 'turb01') ? t('p9.desc.cellLoaded') : t('p9.desc.cellEmpty');
    case 'spectroCam':
      return t('p9.desc.spectroCam');
    case 'rack':
      return t('p9.desc.rack', { n: Object.values(w.objects).filter((x) => x.support.startsWith('rack:')).length });
    default:
      return '';
  }
}
