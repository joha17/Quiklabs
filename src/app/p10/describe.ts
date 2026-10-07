/**
 * Nombres y descripciones accesibles de la Práctica 10 (§32): volúmenes y masas en palabras (en evaluación sin valores
 * exactos), menisco respecto de la marca, estado del reactor, de la bureta, de las conexiones, de la jeringa y del
 * sensor. No completa observaciones ni revela lo que el estudiante debe leer en el instrumento.
 */
import type { P10World } from '../../simulation/gas-world/types';
import { solveBurette } from '../../simulation/gas-world/world';
import { sensorReading } from '../../simulation/instruments/pressure-sensor';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function p10NameOf(w: P10World, id: string): string {
  if (t(`p10.obj.${id}`) !== `p10.obj.${id}`) return t(`p10.obj.${id}`);
  const o = w.objects[id];
  return o ? t(`p10.kind.${o.kind}`) : id;
}

export function p10NameTag(w: P10World, id: string): string {
  if (t(`p10.tag.${id}`) !== `p10.tag.${id}`) return t(`p10.tag.${id}`);
  return p10NameOf(w, id);
}

/** Líquido en palabras: aproximado en práctica; en evaluación solo «poco / a media altura / casi lleno». */
export function liquidWords(ml: number, capacity: number, mode: string): string {
  if (ml < 0.05) return t('p10.desc.empty');
  if (mode === 'EVALUATION') return ml / capacity < 0.25 ? t('p10.desc.little') : ml / capacity < 0.75 ? t('p10.desc.half') : t('p10.desc.full');
  return t('p10.desc.ml', { ml: fmt(ml, ml < 10 ? 1 : 0) });
}

export function describeObject(w: P10World, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const v = w.liquids[id];
  switch (o.kind) {
    case 'abalance': {
      const b = w.balance;
      const parts = [b.doorsOpen ? t('p10.desc.doorsOpen') : t('p10.desc.doorsClosed'), b.stable && !b.doorsOpen ? t('p10.desc.stable') : t('p10.desc.unstable')];
      parts.push(b.panObjectId ? t('p10.desc.onPan', { o: p10NameOf(w, b.panObjectId) }) : t('p10.desc.panEmpty'));
      if (b.taredAt === null) parts.push(t('p10.desc.notTared'));
      if (b.levelErrorDeg > 0.5) parts.push(t('p10.desc.unlevel'));
      return parts.join(' · ');
    }
    case 'watchGlass':
      return [w.solids.watchGlassG > 0.002 ? (mode === 'EVALUATION' ? t('p10.desc.powder') : t('p10.desc.powderG', { g: fmt(w.solids.watchGlassG, 2) })) : t('p10.desc.empty'), w.solids.watchGlassWetG > 0.002 ? t('p10.desc.wet') : ''].filter(Boolean).join(' · ');
    case 'spatula':
      return w.solids.spatulaG > 0.002 ? t('p10.desc.spatulaLoaded') : '';
    case 'flask': {
      const parts = [liquidWords(v.ml, v.capacityMl, mode)];
      const d = v.ml - w.flask.trueMarkMl;
      if (v.ml > w.flask.trueMarkMl - 5) parts.push(Math.abs(d) <= 0.03 ? t('p10.desc.atMark') : d > 0 ? t('p10.desc.overMark') : t('p10.desc.belowMark'));
      parts.push(w.flask.stoppered ? t('p10.desc.stoppered') : t('p10.desc.open'));
      if (v.nBicarb > 0 && w.flask.mix < 0.95) parts.push(t('p10.desc.notMixed'));
      if (w.objects.funnel.support === 'funnel:flask') parts.push(t('p10.desc.withFunnel'));
      return parts.join(' · ');
    }
    case 'pipette': {
      const p = w.pipette;
      const parts = [p.propipette ? t('p10.desc.propipette') : t('p10.desc.noPropipette'), p.conditioned ? t('p10.desc.conditioned') : ''];
      if (p.ml > 0.1) parts.push(p.adjusted ? t('p10.desc.atMark') : p.aboveMarkMl > 0 ? t('p10.desc.overMark') : t('p10.desc.belowMark'));
      else parts.push(t('p10.desc.empty'));
      if (p.bubble) parts.push(t('p10.desc.bubble'));
      return parts.filter(Boolean).join(' · ');
    }
    case 'erlenmeyer': {
      const r = w.reactor;
      const parts = [liquidWords(v.ml, v.capacityMl, mode), t(`p10.reactor.${r.stage}`)];
      if (v.nAcid > 1e-6 && v.nBicarb > 1e-6) parts.push(t('p10.desc.fizzing'));
      if (r.foam > 0.5) parts.push(t('p10.desc.foam'));
      parts.push(r.stoppered ? t('p10.desc.stopperOn') : t('p10.desc.stopperOff'));
      return parts.join(' · ');
    }
    case 'beaker150':
    case 'beaker600':
    case 'cylinder':
    case 'waterBottle':
    case 'vinegarBottle': {
      const parts = [liquidWords(v.ml, v.capacityMl, mode)];
      if (v.solidBicarbG > 0.005) parts.push(t('p10.desc.undissolved'));
      return parts.join(' · ');
    }
    case 'burette': {
      const b = w.burette;
      if (!b.inverted) return b.waterMl > 0 ? t('p10.desc.buretteWater', { ml: mode === 'EVALUATION' ? '…' : fmt(b.waterMl, 0) }) : t('p10.desc.empty');
      const s = solveBurette(w);
      const parts = [t(`p10.burette.${b.stage}`), s.readingMl === null ? (s.gasMl < b.topUngraduatedMl ? t('p10.desc.aboveScale') : t('p10.desc.belowScale')) : t('p10.desc.meniscusOnScale')];
      parts.push(b.clamped ? t('p10.desc.clamped') : t('p10.desc.notClamped'));
      parts.push(s.hMm > 1 ? t('p10.desc.innerHigher') : s.hMm < -1 ? t('p10.desc.innerLower') : t('p10.desc.levelsEqual'));
      if (b.stopcockOpen) parts.push(t('p10.desc.stopcockOpen'));
      return parts.join(' · ');
    }
    case 'syringe': {
      const s = w.syringe;
      return [t('p10.desc.mark', { ml: mode === 'EVALUATION' ? fmt(Math.round(s.markMl), 0) : fmt(s.markMl, 1) }), s.connected ? t('p10.desc.connected') : t('p10.desc.disconnected'), s.held ? t('p10.desc.held') : t('p10.desc.free')].join(' · ');
    }
    case 'sensor':
    case 'datalogger': {
      const r = sensorReading(w.sensor);
      return [Number.isFinite(r) ? t('p10.desc.reads', { kPa: fmt(r, 1) }) : t('p10.desc.noReading'), w.syringe.collecting ? t('p10.desc.collecting', { n: w.points.length }) : '', w.sensor.overload ? t('p10.desc.overload') : ''].filter(Boolean).join(' · ');
    }
    case 'thermometer':
      return [t('p10.desc.tReads', { c: fmt(w.thermometer.displayedC + w.thermometer.offsetC, 1) }), t(`p10.where.${w.thermometer.where}`)].join(' · ');
    case 'stopper':
      return o.support === 'erlenmeyer' ? t('p10.desc.stopperOn') : '';
    default:
      return '';
  }
}
