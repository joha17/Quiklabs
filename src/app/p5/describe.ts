/**
 * Nombres y descripciones accesibles de la Práctica 5: posición de las pesas y del fiel en palabras, estado del tubo
 * (capas o mezcla, color, fusión), temperatura en categorías, montaje y mechero. En evaluación no se muestra la masa
 * que equilibra la balanza: la lectura se hace con las pesas (§6.3). No completa observaciones.
 */
import type { P5World } from '../../simulation/stoich-world/types';
import { conversion, tubeTempC, yawDistance } from '../../simulation/stoich-world/world';
import { MOLAR_MASS } from '../../simulation/stoichiometry/stoich';
import { describeFlame, valveWords } from '../p3/describe';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function p5NameOf(w: P5World, id: string): string {
  if (id === 'hose') return t('p3.obj.hose');
  const g = w.gas.objects[id];
  if (g) return t(`p3.obj.${g.kind}`);
  const o = w.objects[id];
  if (!o) return id;
  if (t(`p5.obj.${id}`) !== `p5.obj.${id}`) return t(`p5.obj.${id}`);
  return t(`p5.obj.${o.kind}`);
}

/** Texto corto de la etiqueta flotante. */
export function p5NameTag(w: P5World, id: string): string {
  if (t(`p5.tag.${id}`) !== `p5.tag.${id}`) return t(`p5.tag.${id}`);
  return p5NameOf(w, id);
}

export function tempWords5(c: number): string {
  if (c < 30) return t('p5.temp.room');
  if (c < 45) return t('p5.temp.warm');
  if (c < 120) return t('p5.temp.hot');
  if (c < 480) return t('p5.temp.veryHot');
  return t('p5.temp.glowing');
}

/** Posición del fiel en palabras (arriba / abajo / en la marca / oscilando). */
export function pointerWords(w: P5World): string {
  const b = w.balance;
  if (!b.stable && Math.abs(b.pointerVel) > 0.08) return t('p5.desc.pointerSwinging');
  if (Math.abs(b.pointer) < 0.06) return t('p5.desc.pointerCentered');
  return b.pointer > 0 ? t('p5.desc.pointerUp') : t('p5.desc.pointerDown');
}

export function ridersWords(w: P5World): string {
  const r = w.balance.riders;
  return t('p5.desc.riders', { a: r[0], b: r[1], c: fmt(r[2], 2), sum: fmt(r[0] + r[1] + r[2], 2) });
}

/** Contenido del tubo en palabras: capas o mezcla gris, fundido, residuo. */
export function tubeContentWords(w: P5World): string {
  const c = w.tube.contents;
  const gM = c.MnO2 * MOLAR_MASS.MnO2;
  const gK = c.KClO3 * MOLAR_MASS.KClO3;
  const gC = c.KCl * MOLAR_MASS.KCl;
  if (gM + gK + gC < 0.005) return c.waterG > 0.01 ? t('p5.desc.tubeWet') : t('p5.desc.tubeEmpty');
  const parts: string[] = [];
  if (gK + gC < 0.005) parts.push(t('p5.desc.blackPowder'));
  else if (gM < 0.005) parts.push(t('p5.desc.whitePowder'));
  else parts.push(w.tube.homogeneity >= 0.6 ? t('p5.desc.grayMix') : t('p5.desc.layers'));
  if (w.tube.sampleC > 356 && gK > 0.01) parts.push(t('p5.desc.molten'));
  if (w.tube.o2RateMolS > 1e-6) parts.push(t('p5.desc.gas'));
  if (w.tube.cycles.length && gK > 0 && conversion(w) > 0.98) parts.push(t('p5.desc.residue'));
  if (c.waterG > 0.01) parts.push(t('p5.desc.moisture'));
  return parts.join(' · ');
}

export function describeObject(w: P5World, id: string, mode: string): string {
  if (id === 'hose') {
    const parts = [w.gas.burner.hoseConnected ? t('p3.desc.hoseConnected') : t('p3.desc.hoseLoose')];
    if (w.gas.hose.crackFound) parts.push(t('p3.desc.hoseCrack'));
    return parts.join(' · ');
  }
  const b = w.gas.burner;
  if (id === 'burner') return `${describeFlame(w.gas)} · ${t('p3.desc.valves', { needle: valveWords(b.needleGasValve), air: valveWords(b.airCollar) })}`;
  if (id === 'gas_tap') return t('p3.desc.tap', { v: valveWords(b.tableGasValve) }) + (b.supplyOn ? '' : ` · ${t('p3.desc.supplyCut')}`);
  if (id === 'lighter') return w.gas.lighter.sparking ? t('p3.desc.sparking') : '';
  if (id === 'extractor') return w.gas.room.extractionOn ? t('p3.desc.extractionOn') : t('p3.desc.extractionOff');
  if (id === 'co_detector') return t('p3.desc.detector', { co: Math.round(w.gas.room.coPpm), gas: Math.round(w.gas.room.gasAccumMl) });
  const o = w.objects[id];
  if (!o) return '';
  switch (o.kind) {
    case 'balance': {
      const bal = w.balance;
      const parts = [ridersWords(w), pointerWords(w)];
      parts.push(bal.panObjectId ? t('p5.desc.onPan', { o: p5NameOf(w, bal.panObjectId) }) : t('p5.desc.panEmpty'));
      if (bal.calibratedAt === null) parts.push(t('p5.desc.notCalibrated'));
      if (Math.abs(bal.levelErrorDeg) > 0.2) parts.push(t('p5.desc.unlevel'));
      if (bal.airCurrent > 0.3) parts.push(t('p5.desc.draft'));
      if (bal.panResidueMol.KClO3 + bal.panResidueMol.MnO2 + bal.panResidueMol.KCl > 0) parts.push(t('p5.desc.panDust'));
      return parts.join(' · ');
    }
    case 'tube': {
      const T = tubeTempC(w.tube);
      const parts = [tubeContentWords(w), tempWords5(T)];
      if (mode !== 'EVALUATION' && T > 40) parts.push(`${Math.round(T)} °C`);
      if (w.tube.stoppered) parts.push(t('p5.desc.stoppered'));
      if (w.tube.cracked) parts.push(t('p5.desc.cracked'));
      else if (w.tube.preCracked && w.tube.inspected) parts.push(t('p5.desc.crackFound'));
      parts.push(t(`p5.support.${o.support}`));
      return parts.filter(Boolean).join(' · ');
    }
    case 'stand': {
      const c = w.clamp;
      const parts = [t('p5.desc.clamp', { a: Math.round(c.angleDeg), h: Math.round(c.heightCm) }), c.nutTight ? t('p5.desc.nutTight') : t('p5.desc.nutLoose')];
      parts.push(c.grip < 0.25 ? t('p5.desc.gripLoose') : c.grip > 0.8 ? t('p5.desc.gripTight') : t('p5.desc.gripOk'));
      parts.push(yawDistance(c.mouthYawDeg, 180) < 60 ? t('p5.desc.mouthPerson') : t('p5.desc.mouthAway'));
      return parts.join(' · ');
    }
    case 'bottle': {
      const bt = w.bottles[id];
      return [bt?.open ? t('p5.desc.open') : t('p5.desc.closed'), bt?.contaminated ? t('p5.desc.contaminated') : ''].filter(Boolean).join(' · ');
    }
    case 'spatula': {
      const s = w.spatulas[id];
      if (!s) return '';
      const g = s.loadMol.KClO3 * MOLAR_MASS.KClO3 + s.loadMol.MnO2 * MOLAR_MASS.MnO2;
      const parts = [t('p5.desc.dedicated', { r: s.dedicatedTo === 'KClO3' ? 'KClO₃' : 'MnO₂' })];
      if (g > 0.005) parts.push(g > 0.45 ? t('p5.desc.loadLevel') : g > 0.2 ? t('p5.desc.loadSmall') : t('p5.desc.loadTip'));
      else if (s.residueMol.KClO3 + s.residueMol.MnO2 > 0) parts.push(t('p5.desc.residueFilm'));
      if (s.contaminant) parts.push(t('p5.desc.greasy'));
      return parts.join(' · ');
    }
    case 'shield':
      return w.safety.shieldPlaced ? t('p5.desc.shieldPlaced') : t('p5.desc.shieldIdle');
    case 'irThermometer':
      return '';
    case 'waste':
      return w.evidence.disposed ? t('p5.desc.wasteUsed') : '';
    default:
      return '';
  }
}
