/**
 * Resultados esperados de B05 calculados con las lecturas PROPIAS del intento (§13.2): qué lectura importó el
 * estudiante, de qué instrumento, tubo y cronómetro; qué tubos son trazables; qué lotes quedaron listos. La tasa, los
 * moles de O₂, el balance, los glucosilos y el NADH de referencia salen de los datos registrados (con sus fugas,
 * sesgos y retrasos), nunca de un resultado ideal del material.
 */
import type { EnzReading, EnzTube, EnzWorld } from '../../simulation/enz-world/types';
import { gasMol, nadhFromA, slopeIn } from '../../simulation/enz-world/kinetics';
import { amylaseOf, catalaseOf, glucosylOf } from '../../simulation/enz-world/chemistry';
import { TUBE_IDS_B05 } from '../../simulation/enz-world/geometry';
import { observation, validObservations } from '../practice-b01/expected-results';
import { parseNum, type B05Notebook } from './notebook';

export { observation, validObservations };

export const reading = (w: EnzWorld, id: string | null | undefined): EnzReading | null => (id ? w.enz.readings[id] ?? null : null);

/** Tubo con ese rótulo (el último rotulado así si hay varios). */
export function tubeByLabel(w: EnzWorld, label: string): [string, EnzTube] | null {
  const ids = TUBE_IDS_B05.filter((id) => w.enz.tubes[id].label === label);
  const id = ids[ids.length - 1];
  return id ? [id, w.enz.tubes[id]] : null;
}

/** Lecturas del colector tomadas con un tubo conectado, en orden. */
export const gasReadingsOf = (w: EnzWorld, tubeId: string) => w.enz.readingOrder.map((id) => w.enz.readings[id]).filter((r) => r.instrument === 'collector' && r.targetId === `gc:${tubeId}`);

/** Lote listo (§5): P1 con almidón, agua, agitación y temperatura MEDIDA; P2 con hígado agitado sin calor; P3 con amilasa agitada. */
export function batchReady(w: EnzWorld, id: 'P1' | 'P2' | 'P3'): boolean {
  const b = w.enz.batches[id];
  if (!b) return false;
  const p = w.params.enz!.prep;
  const v = w.enz.vessels[b.vesselId];
  const water = b.firstAliquotAt !== null ? b.waterMl : v.volumeMl;
  const stirred = b.stirredS >= p.minStirS;
  if (id === 'P1') return b.solidG > 0 && water > 1 && stirred && b.measuredTK !== null;
  if (id === 'P2') return b.liverG > 0 && water > 1 && stirred;
  return b.solidG > 0 && water > 0.5 && stirred;
}

/** Tubo de catalasa con reacción iniciada (peróxido agregado) y al menos `n` lecturas del colector. */
export function catalaseRun(w: EnzWorld, label: string, n: number, withEnzyme = true): boolean {
  const e = tubeByLabel(w, label);
  if (!e) return false;
  const [id, t] = e;
  const enzymeOk = withEnzyme ? (t.catAtStart ?? 0) > 0 : (t.catAtStart ?? 0) <= 1e-9;
  return t.reactionAt !== null && enzymeOk && gasReadingsOf(w, id).length >= n;
}

/** Incubación de amilasa en marcha (amilasa + almidón en contacto) y control de almidón sin amilasa. */
export function amylaseIncubation(w: EnzWorld): string | null {
  const e = tubeByLabel(w, 'amy');
  return e && e[1].contactAt !== null ? e[0] : null;
}
export function amylaseControl(w: EnzWorld): boolean {
  const e = tubeByLabel(w, 'amy-ctrl');
  if (!e) return false;
  const v = w.enz.vessels[e[0]];
  return glucosylOf(v.s) > 1e-6 && amylaseOf(v.s) <= 1e-9 || (e[1].readAt !== null && e[1].sources.length > 0);
}

/** Alícuotas de la incubación reveladas y leídas: Lugol (con su tiempo real desde el contacto) y Benedict. */
export function aliquotsRead(w: EnzWorld) {
  const inc = amylaseIncubation(w);
  const all = inc ? TUBE_IDS_B05.map((id) => [id, w.enz.tubes[id]] as const).filter(([, t]) => t.aliquotOf === inc && t.readAt !== null) : [];
  const lugol = all.filter(([, t]) => t.drops.lugol > 0);
  const benedict = all.filter(([, t]) => t.drops.benedict > 0);
  const times = [...new Set(lugol.map(([, t]) => Math.round((t.sampledAfterS ?? 0) / 30)))];
  return { lugol, benedict, distinctTimes: times.length };
}

/** Captura propia de la papa con Lugol (gránulos de almidón) a 10X o más. */
export const starchCaptures = (w: EnzWorld) => validObservations(w).filter((o) => o.instrument === 'compound' && (o.assetId ?? '').startsWith('potatoLugol') && (o.objectiveX ?? 0) >= 10);

/** Tasa inicial que corresponde a las lecturas importadas del tubo indicado en la ventana elegida (mL/s con TU reloj). */
export function rateExpected(w: EnzWorld, nb: B05Notebook) {
  const row = nb.gas.find((g) => g.label === nb.rate.label);
  if (!row) return null;
  const pts = row.readingIds.map((id) => reading(w, id)).filter((r): r is EnzReading => !!r && r.instrument === 'collector').map((r) => ({ t: r.clockS ?? r.t, y: r.value }));
  if (pts.length < 2) return null;
  const from = parseNum(nb.rate.fromS);
  const to = parseNum(nb.rate.toS);
  const a = Number.isFinite(from) ? from : pts[0].t;
  const b = Number.isFinite(to) ? to : pts[pts.length - 1].t;
  const s = slopeIn(pts, a, b);
  if (s === null) return null;
  const p = w.params.enz!;
  const last = pts[pts.length - 1].y;
  const nO2Mmol = gasMol(last, p.ambientK, p.pressureKPa) * 1000;
  // La tasa inicial es la de la primera ventana; una ventana tardía da una pendiente menor (N01).
  const early = slopeIn(pts, pts[0].t, pts[Math.min(2, pts.length - 1)].t);
  return { rateMlS: s, rateMlMin: s * 60, nO2Mmol, predictedO2Mmol: (p.catalaseH2O2Ml * p.h2o2M) / 2, early, windowStart: a, firstT: pts[0].t };
}

/** Masa de tejido del tubo de la línea base (g) para normalizar la tasa. */
export function tissueOf(w: EnzWorld, label: string): number | null {
  const e = tubeByLabel(w, label);
  return e && e[1].tissueAtStartMg ? e[1].tissueAtStartMg / 1000 : null;
}

/** Glucosilos de la incubación al contacto (mmol): la referencia del cálculo NB07. */
export function glucosylExpected(w: EnzWorld): number | null {
  const inc = amylaseIncubation(w);
  return inc ? w.enz.tubes[inc].glyAtContact : null;
}

/** NADH (µmol/L) que corresponde a la lectura UV corregida importada y al paso declarado. */
export function nadhExpected(w: EnzWorld, nb: B05Notebook) {
  const last = [...nb.adh.rows].reverse().map((r) => reading(w, r.readingId)).find((r) => r?.instrument === 'uv');
  if (!last) return null;
  const path = w.params.enz!.uv.path[last.targetId] ?? 1;
  return { nadhUM: nadhFromA(last.value, path, w.params.enz!.uv.epsilon) * 1e6, pathCm: path };
}

/** ¿El tubo comparado recibió una cantidad de catalasa claramente distinta de la línea base? */
export function catalaseShare(w: EnzWorld, label: string) {
  const e = tubeByLabel(w, label);
  return e ? catalaseOf(w.enz.vessels[e[0]].s) : 0;
}

/** Temperatura media durante la reacción de un tubo (K) o null. */
export function meanReactionK(w: EnzWorld, label: string): number | null {
  const e = tubeByLabel(w, label);
  return e && e[1].tN > 0 ? e[1].tSum / e[1].tN : null;
}

/** ¿Hubo pérdidas de captación registradas (fuga, desconexión, alivio, saturación)? */
export const captureLosses = (w: EnzWorld) => ['C06', 'C07', 'C10', 'C15', 'S06'].some((c) => !!w.evidence[`err:${c}`]) || w.scenarios.includes('SC05') || w.enz.o2.vented > 0.02;
