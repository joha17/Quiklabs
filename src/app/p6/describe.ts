/**
 * Nombres y descripciones accesibles de la Práctica 6: volumen y masa en palabras (en evaluación sin valores exactos),
 * temperatura del baño y del tubo en categorías, estado del calorímetro, de la plantilla y de la bomba.
 * No completa observaciones ni revela la masa del objeto en la balanza.
 */
import type { P6World } from '../../simulation/calorimetry-world/types';
import { displayedValue, metalGAt, piecesAt, tubeInBath, tubeTempC } from '../../simulation/calorimetry-world/world';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function p6NameOf(w: P6World, id: string): string {
  if (t(`p6.obj.${id}`) !== `p6.obj.${id}`) return id === 'jar_x' || id === 'tube_x' ? t(`p6.obj.${id}`, { code: w.params.unknownCode }) : t(`p6.obj.${id}`);
  const o = w.objects[id];
  return o ? t(`p6.kind.${o.kind}`) : id;
}

export function p6NameTag(w: P6World, id: string): string {
  if (t(`p6.tag.${id}`) !== `p6.tag.${id}`) return t(`p6.tag.${id}`, { code: w.params.unknownCode });
  return p6NameOf(w, id);
}

export function tempWords6(c: number, amb: number): string {
  if (c < amb + 3) return t('p6.temp.room');
  if (c < 45) return t('p6.temp.warm');
  if (c < 80) return t('p6.temp.hot');
  return t('p6.temp.veryHot');
}

/** Agua en palabras: aproximada en práctica; en evaluación solo «poca / a media altura / casi llena». */
export function waterWords(g: number, capacity: number, mode: string): string {
  if (g < 0.3) return t('p6.desc.empty');
  if (mode === 'EVALUATION') return g / capacity < 0.25 ? t('p6.desc.little') : g / capacity < 0.75 ? t('p6.desc.half') : t('p6.desc.full');
  return t('p6.desc.ml', { ml: fmt(g, g < 10 ? 1 : 0) });
}

export function describeObject(w: P6World, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const amb = w.params.ambientC;
  const v = w.vessels[id];
  switch (o.kind) {
    case 'balance': {
      const b = w.balance;
      const parts = [t('p6.desc.riders', { a: b.riders[0], b: b.riders[1], c: fmt(b.riders[2], 2), sum: fmt(b.riders[0] + b.riders[1] + b.riders[2], 2) })];
      parts.push(Math.abs(b.pointer) < 0.06 && b.stable ? t('p6.desc.pointerCentered') : !b.stable && Math.abs(b.pointerVel) > 0.08 ? t('p6.desc.pointerSwinging') : b.pointer > 0 ? t('p6.desc.pointerUp') : t('p6.desc.pointerDown'));
      parts.push(b.panObjectId ? t('p6.desc.onPan', { o: p6NameOf(w, b.panObjectId) }) : t('p6.desc.panEmpty'));
      if (b.calibratedAt === null) parts.push(t('p6.desc.notCalibrated'));
      if (b.touchingHousing) parts.push(t('p6.desc.touching'));
      return parts.join(' · ');
    }
    case 'cylinder':
    case 'waterBottle':
    case 'beaker': {
      const parts = [waterWords(v.waterG, v.capacityMl, mode)];
      if (v.wetG > 0.05 && v.waterG < 0.5) parts.push(t('p6.desc.wet'));
      if (id === 'beaker') {
        parts.push(tempWords6(v.waterC, amb));
        if (w.bath.vigor > 0.6) parts.push(t('p6.desc.boilingHard'));
        else if (w.bath.vigor > 0.02) parts.push(t('p6.desc.boiling'));
        parts.push(o.support === 'plate' ? t('p6.desc.onPlate') : t('p6.desc.offPlate'));
      }
      return parts.join(' · ');
    }
    case 'cup': {
      const parts = [waterWords(w.vessels.cup.waterG, 250, mode), w.cal.lidClosed ? t('p6.desc.lidClosed') : t('p6.desc.lidOpen')];
      const n = piecesAt(w, 'cup').length;
      if (n) parts.push(t('p6.desc.piecesIn', { n }));
      parts.push(t(`p6.calState.${w.cal.state}`));
      return parts.join(' · ');
    }
    case 'thermometer': {
      const th = w.thermos[id];
      const where = o.support === 'cup' ? t('p6.desc.inCup') : o.support === 'bath' ? t('p6.desc.inBath') : t('p6.desc.inAir');
      const depth = th.depth > 0.92 ? t('p6.desc.touchingBottom') : th.depth < 0.15 ? t('p6.desc.bulbOut') : t('p6.desc.bulbOk');
      return [t('p6.desc.reads', { c: fmt(displayedValue(w, id), 1) }), where, o.support === 'bench' ? '' : depth].filter(Boolean).join(' · ');
    }
    case 'tube': {
      const tb = w.tubes[id];
      const parts: string[] = [];
      const n = piecesAt(w, `tube:${id}`).length;
      parts.push(n ? t('p6.desc.pieces', { n }) : t('p6.desc.empty'));
      if (mode !== 'EVALUATION' && n) parts.push(t('p6.desc.metalG', { g: fmt(metalGAt(w, `tube:${id}`), 1) }));
      parts.push(tempWords6(tubeTempC(tb), amb));
      if (o.support === 'bath') {
        const g = tubeInBath(w, id);
        parts.push(g.onBottom ? t('p6.desc.tubeBottom') : g.metalSubmerged < 0.95 ? t('p6.desc.metalAbove') : t('p6.desc.metalUnder'));
        if (g.mouthUnder) parts.push(t('p6.desc.mouthUnder'));
      }
      if (tb.waterG > 0.05) parts.push(t('p6.desc.waterInTube'));
      if (tb.cracked && tb.inspected) parts.push(t('p6.desc.cracked'));
      parts.push(t(`p6.support.${o.support}`));
      return parts.join(' · ');
    }
    case 'hotplate':
      return [t('p6.desc.knob', { k: fmt(w.plate.knob * 5, 1) }), w.plate.knob > 0.01 ? t('p6.desc.plateOn') : t('p6.desc.plateOff'), tempWords6(w.plate.plateC, amb)].join(' · ');
    case 'jar':
      return t('p6.desc.jar', { n: piecesAt(w, `jar:${id}`).length });
    case 'spatula':
      return piecesAt(w, 'spatula').length ? t('p6.desc.spatulaLoaded') : '';
    case 'stirrer':
      return o.support === 'cup' ? (w.cal.stir > 0.85 ? t('p6.desc.stirViolent') : w.cal.stir > 0.1 ? t('p6.desc.stirring') : t('p6.desc.stirIdle')) : '';
    case 'bombUnit':
    case 'bomb': {
      const b = w.bomb;
      return [t(`p6.bombStage.${b.stage}`), b.profile ? t(`p6.profile.${b.profile}`) : t('p6.desc.noProfile'), t('p6.desc.pressure', { p: fmt(b.pressureAtm, 0) })].join(' · ');
    }
    case 'oxygen':
      return t('p6.desc.pressure', { p: fmt(w.bomb.pressureAtm, 0) });
    default:
      return '';
  }
}
