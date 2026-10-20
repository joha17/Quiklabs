/**
 * Nombres y descripciones accesibles de la Práctica 7 (§15.1): lo OBSERVABLE de cada objeto (volumen en palabras,
 * fases, sólido remanente, turbidez, tapa, contacto de las puntas, inmersión de la sonda, estado del indicador). Nunca
 * revela la identidad de una incógnita ni su composición; en Evaluación tampoco da valores exactos (§15.1).
 */
import type { P07World } from '../../simulation/bonding-world/types';
import { vesselMl } from '../../simulation/bonding-world/world';
import { compTotal, liquidMl } from '../../simulation/solution-properties/conservation';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

/** Código visible de una incógnita (frasco o pieza). */
export function unknownCodeOf(w: P07World, id: string): string | null {
  for (const u of Object.values(w.unknowns)) if (u.jarId === id || u.specimenId === id) return u.code;
  return null;
}

export function p07NameOf(w: P07World, id: string): string {
  const code = unknownCodeOf(w, id);
  if (code) return t(w.specimens[id] ? 'p7.unknownPiece' : 'p7.unknownJar', { code });
  if (has(`p7.obj.${id}`)) return t(`p7.obj.${id}`);
  const o = w.objects[id];
  if (o?.kind === 'tube') return o.label ? t('p7.tubeLabeled', { n: id.replace('tube', ''), label: o.label }) : t('p7.tubeN', { n: id.replace('tube', '') });
  if (o?.kind === 'beaker') return t('p7.beakerN', { n: id.replace('bk', '') });
  return o ? t(`p7.kind.${o.kind}`) : id;
}

export function p07NameTag(w: P07World, id: string): string {
  const code = unknownCodeOf(w, id);
  if (code) return code;
  if (has(`p7.tag.${id}`)) return t(`p7.tag.${id}`);
  const o = w.objects[id];
  if (o?.kind === 'tube') return o.label || `T${id.replace('tube', '')}`;
  if (o?.kind === 'beaker') return `V${id.replace('bk', '')}`;
  return p07NameOf(w, id);
}

/** Volumen en palabras: aproximado en práctica; en evaluación solo «poco / mitad / casi lleno». */
export function volumeWords(ml: number, capacity: number, mode: string): string {
  if (ml < 0.02) return t('p7.desc.empty');
  if (mode === 'EVALUATION') return ml / capacity < 0.25 ? t('p7.desc.little') : ml / capacity < 0.75 ? t('p7.desc.half') : t('p7.desc.full');
  return t('p7.desc.ml', { ml: fmt(ml, ml < 10 ? 1 : 0) });
}

export function describeObject(w: P07World, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const v = w.vessels[id];
  if (v) {
    const parts: string[] = [];
    if (v.capped) parts.push(t('p7.desc.capped'));
    const ml = vesselMl(v);
    if (ml >= 0.02 || compTotal(v.solid) < 0.001) parts.push(volumeWords(ml, v.capacityMl, mode));
    const phases = (liquidMl(v.polar) > 0.05 ? 1 : 0) + (liquidMl(v.apolar) > 0.05 ? 1 : 0);
    if (phases === 2) parts.push(t('p7.desc.twoPhases'));
    if (compTotal(v.solid) > 0.002) parts.push(t(o.kind === 'jar' || o.kind === 'watchGlass' ? 'p7.desc.solidContent' : 'p7.desc.solidRemains'));
    if (v.emulsion01 > 0.2 || (compTotal(v.solid) > 0.002 && v.stir01 > 0.2)) parts.push(t('p7.desc.turbid'));
    if ((v.polar.CuSO4_5H2O ?? 0) > 0.01 && ml > 0.5) parts.push(t('p7.desc.blue'));
    if (v.stir01 > 0) parts.push(t('p7.desc.stirring'));
    if (w.meter.vesselId === id) parts.push(t('p7.desc.probeIn'));
    return parts.join(' · ');
  }
  switch (o.kind) {
    case 'balance': {
      const b = w.balance;
      if (!b.powered) return t('p7.desc.off');
      return [b.stable ? t('p7.desc.stable') : t('p7.desc.unstable'), b.panIds.length ? t('p7.desc.onPan', { o: b.panIds.map((x) => p07NameOf(w, x)).join(', ') }) : t('p7.desc.panEmpty')].join(' · ');
    }
    case 'detector': {
      const d = w.detector;
      if (!d.powered) return t('p7.desc.off');
      // Estado del indicador en texto, sin depender del color (§15.1).
      const range = d.range === 'LOW' ? { max: 2 } : { max: 20 };
      const sig = d.currentMA > range.max ? t('p7.desc.signalOver') : d.indicator01 <= 0 ? t('p7.desc.signalNone') : d.indicator01 < 0.4 ? t('p7.desc.signalLow') : t('p7.desc.signalHigh');
      return [t('p7.desc.range', { r: d.range }), sig, d.cablesOk ? '' : t('p7.desc.cableOff'), d.controlTest === 'passed' ? t('p7.desc.controlOk') : d.controlTest === 'failed' ? t('p7.desc.controlFailed') : ''].filter(Boolean).join(' · ');
    }
    case 'meter': {
      const m = w.meter;
      if (!m.powered) return t('p7.desc.off');
      return [t('p7.desc.range', { r: m.range }), m.atc ? t('p7.desc.atc') : t('p7.desc.noAtc'), m.calibratedWith ? t('p7.desc.calibrated') : t('p7.desc.notCalibrated'), m.stable ? t('p7.desc.stable') : t('p7.desc.unstable')].join(' · ');
    }
    case 'probe': {
      const m = w.meter;
      if (!m.vesselId) return o.support === 'cond01' ? t('p7.desc.inHolder') : t('p7.desc.inAir');
      return [t('p7.desc.immersedIn', { o: p07NameOf(w, m.vesselId), cm: mode === 'EVALUATION' ? '…' : fmt(m.immersionCm, 1) }), m.bottomContact ? t('p7.desc.bottom') : ''].filter(Boolean).join(' · ');
    }
    case 'tip': {
      const h = id === 'tipA' ? w.detector.a : w.detector.b;
      if (!h) return t('p7.desc.tipFree');
      if (h.targetId === 'det01pad') return t('p7.desc.tipOnPad');
      if (h.targetId === 'tipA' || h.targetId === 'tipB') return t('p7.desc.tipsTouching');
      return h.gapCm > 0.02 ? t('p7.desc.tipNear', { o: p07NameOf(w, h.targetId) }) : t('p7.desc.tipOn', { o: p07NameOf(w, h.targetId) });
    }
    case 'specimen': {
      const sp = w.specimens[id];
      return [sp.surfaceWaterG > 0.002 ? t('p7.desc.wet') : t('p7.desc.dry'), sp.material === 'graphite' ? t(sp.orientation === 'edge' ? 'p7.desc.edge' : 'p7.desc.flat') : ''].filter(Boolean).join(' · ');
    }
    case 'dropper': {
      const d = w.droppers[id];
      const ml = liquidMl(d.content);
      return [volumeWords(ml, 5, mode), w.vessels[o.support] ? t('p7.desc.tipIn', { o: p07NameOf(w, o.support) }) : ''].filter(Boolean).join(' · ');
    }
    case 'spatula':
      return [compTotal(w.spatula.load) > 0.001 ? t('p7.desc.loaded') : t('p7.desc.emptyTool'), compTotal(w.spatula.residue) > 1e-5 ? t('p7.desc.residue') : '', w.vessels[o.support] ? t('p7.desc.tipIn', { o: p07NameOf(w, o.support) }) : ''].filter(Boolean).join(' · ');
    case 'stirRod':
      return w.vessels[o.support] ? t('p7.desc.tipIn', { o: p07NameOf(w, o.support) }) : '';
    default:
      return '';
  }
}
