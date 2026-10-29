/**
 * Nombres y descripciones accesibles de B04 (§14): lo OBSERVABLE de cada objeto. El microscopio, los portaobjetos y la
 * pinza se describen como en B02 (mismo equipo); aquí se agregan los frascos, beakers, probetas, pipetas y tubos
 * (rótulo, nivel aproximado, aspecto: color, turbidez, fases, precipitado, espuma), las placas, los baños, la balanza
 * y el hígado. Nunca da concentraciones ni cifras internas: masas, volúmenes y temperaturas se LEEN con el instrumento.
 */
import type { BioVessel, BioWorld } from '../../simulation/bio-world/types';
import { observeVessel } from '../../simulation/bio-world/world';
import { b02NameOf, describeObject as describeB02, microscopeStatus as microscopeStatusB02, stereoStatus } from '../b02/describe';
import { t } from '../i18n';

const has = (k: string) => t(k) !== k;

export function b04NameOf(w: BioWorld, id: string): string {
  if (has(`b04.obj.${id}`)) return t(`b04.obj.${id}`);
  const o = w.objects[id];
  if (o?.label) return o.label;
  if (has(`b02.obj.${id}`)) return t(`b02.obj.${id}`);
  return b02NameOf(w, id);
}

export const b04NameTag = b04NameOf;
export const microscopeStatus = microscopeStatusB02;
export { stereoStatus };

/** Nivel aproximado en palabras (lo que se ve sin instrumento). */
const level = (v: BioVessel) => {
  const f = v.volumeMl / Math.max(1e-6, v.capacityMl);
  return t(f < 0.01 ? 'b04.desc.empty' : f < 0.25 ? 'b04.desc.low' : f < 0.7 ? 'b04.desc.half' : f < 0.95 ? 'b04.desc.high' : 'b04.desc.brim');
};

/** Aspecto visible de un recipiente: el mismo estado que da la lectura con el ojo, en palabras. */
export function lookOf(w: BioWorld, id: string): string {
  const v = w.bio.vessels[id];
  if (!v || v.volumeMl < 1e-3) return '';
  const q = observeVessel(w, id).quality;
  // i18next corta en «:»: la clave usa «_».
  const k = `b04.look.${q.replace(/:/g, '_')}`;
  return has(k) ? t(k) : q;
}

export function describeObject(w: BioWorld, id: string, mode: string): string {
  const o = w.objects[id];
  const B = w.bio;
  if (!o || !B) return describeB02(w, id, mode);
  const parts: string[] = [];
  const tube = B.tubes[id];
  if (tube) {
    parts.push(tube.label ? t('b04.desc.labelled', { l: tube.label }) : t('b04.desc.unlabelled'));
    if (tube.discarded) return [...parts, t('b04.desc.discarded')].join(' · ');
    if (tube.capped) parts.push(t('b04.desc.capped'));
    if (tube.collector) parts.push(t(tube.collector.sealed ? 'b04.desc.collectorSealed' : 'b04.desc.collectorLoose'));
    if (tube.bath) parts.push(t('b04.desc.inBath', { b: b04NameOf(w, tube.bath.id) }));
    if (tube.foamMl > 0.5) parts.push(t('b04.desc.foam'));
  }
  const v = B.vessels[id];
  if (v && id !== 'spill') {
    parts.push(level(v));
    const lk = lookOf(w, id);
    if (lk) parts.push(lk);
    if (v.s.starchSolid > 1) parts.push(t('b04.desc.sediment'));
    if (B.pours[id]) parts.push(t('b04.desc.pouring', { to: b04NameOf(w, B.pours[id].targetId) }));
    const prep = Object.values(B.preps).find((p) => p?.vesselId === id);
    if (prep) parts.push(t(prep.labeled ? 'b04.desc.prepLabeled' : 'b04.desc.prepUnlabeled', { p: prep.id }));
    const bar = Object.entries(B.bars).find(([, vid]) => vid === id);
    if (bar) parts.push(t('b04.desc.withBar'));
    if (v.tK > 318) parts.push(t('b04.desc.hot'));
    return parts.join(' · ');
  }
  const pl = B.plates[id];
  if (pl) {
    parts.push(t(pl.on ? 'b04.desc.heatOn' : 'b04.desc.heatOff'));
    parts.push(t('b04.desc.setpoint', { c: Math.round(pl.setK - 273.15) }));
    parts.push(t('b04.desc.rpm', { n: pl.rpm }));
    if (pl.plateK > 333) parts.push(t('b04.desc.hotSurface'));
    return parts.join(' · ');
  }
  const bath = B.baths[id];
  if (bath) {
    parts.push(t(bath.on ? 'b04.desc.heatOn' : 'b04.desc.heatOff'));
    parts.push(t('b04.desc.setpoint', { c: Math.round(bath.setK - 273.15) }));
    if (bath.on) parts.push(t(bath.readyAt !== null ? 'b04.desc.bathReady' : 'b04.desc.bathHeating'));
    return parts.join(' · ');
  }
  if (id === 'bal') return t(B.balance.tared ? 'b04.desc.tared' : 'b04.desc.notTared');
  if (id === 'liv') {
    const lv = B.liver;
    if (lv.inVessel && lv.inVessel !== 'waste') return t('b04.desc.liverIn', { b: b04NameOf(w, lv.inVessel) });
    return t(lv.sizeCm !== null && lv.sizeCm < 2.5 ? 'b04.desc.liverCut' : 'b04.desc.liverWhole');
  }
  if (id === 'bt') {
    const g = Object.values(B.boat.load).reduce((a, b) => a + b, 0);
    return t(g > 0.01 ? 'b04.desc.boatLoaded' : 'b04.desc.boatEmpty');
  }
  if (id === 'spa') {
    const g = Object.values(B.spatula.load).reduce((a, b) => a + b, 0);
    return [t(g > 0.01 ? 'b04.desc.spatulaLoaded' : 'b04.desc.spatulaEmpty'), ...(B.spatula.wet ? [t('b04.desc.wet')] : [])].join(' · ');
  }
  if (id === 'ph') return t(B.photometer.blanked ? 'b04.desc.zeroed' : 'b04.desc.notZeroed');
  if (id === 'bu') return t(B.burnerLit ? 'b04.desc.flameOn' : 'b04.desc.flameOff');
  return describeB02(w, id, mode);
}
