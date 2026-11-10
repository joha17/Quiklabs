/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus masas pesadas, sus posiciones de compuerta, sus ensayos y pares), su incertidumbre y
 * el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia.
 */
import type { F04World, ReadingF4 } from '../../simulation/f04-world/types';
import { effectiveMass, gateSpeed, idealAccel, kinematicAccel, linFit } from '../../simulation/models/f04/equations';
import { combinedMean, mean } from '../../simulation/models/f04/uncertainty';
import { parseNum, type Entry, type F04Notebook } from './notebook';

export const readingsOfF4 = (w: F04World): ReadingF4[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF4, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF4 = (w: F04World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF4(w: F04World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

export const BAD_RUN = [
  'SLACK', 'LANDED', 'BRAKING', 'POST_IMPACT', 'TILTED', 'HAND_RELEASE', 'AXLE', 'CABLE_DRAG', 'LOOSE_CLAMP', 'OCCLUDED', 'NOT_ZEROED', 'UNCALIBRATED', 'TILTED_SENSOR', 'PERPENDICULAR',
  'CLIPPED', 'LOW_RATE', 'UNPLUGGED', 'CONFIG_CHANGED', 'FEW_SAMPLES',
];
export const BAD_PAIR = ['CLIPPED', 'NOT_ZEROED', 'UNCALIBRATED', 'SAME_SIGN', 'LOW_RATE', 'UNPLUGGED', 'TILTED_SENSOR', 'PERPENDICULAR', 'NO_CONTACT'];

/** Ensayos válidos del carro: aceleración, tensión y tiempos de las dos compuertas, sin defectos de técnica. */
export const validRuns = (w: F04World) =>
  readingsOfF4(w).filter((r) => r.kind === 'run' && Number.isFinite(r.value) && r.run && Number.isFinite(r.run.T) && Number.isFinite(r.run.dt1) && Number.isFinite(r.run.dt2) && !bad(r, BAD_RUN));
export const validPairs = (w: F04World) => readingsOfF4(w).filter((r) => r.kind === 'pair' && r.pair && Number.isFinite(r.pair.FA) && Number.isFinite(r.pair.FB) && !bad(r, BAD_PAIR));
export const massReading = (w: F04World, target: string) => lastOf(readingsOfF4(w).filter((r) => r.kind === 'mass' && r.target === target && !r.qualityFlags.length));
export const scaleReading = (w: F04World, target: string) => lastOf(readingsOfF4(w).filter((r) => r.kind === 'length' && r.target === target && !r.qualityFlags.length));
export const tiltReading = (w: F04World) => lastOf(readingsOfF4(w).filter((r) => r.kind === 'accelRest' && !r.qualityFlags.length));

// ─────────────────────────── Valores esperados ───────────────────────────

/** Ancho de la bandera (m) que usa el estudiante: el rotulado que escribió; si falta, el nominal de 1,0 cm. */
export function flagWidthM(nb: F04Notebook): number {
  const d = parseNum(nb.flagW);
  return Number.isFinite(d) && d > 0 ? d / 100 : 0.01;
}

/** Separación (m) entre las compuertas: de las lecturas de la escala importadas; si no, del montaje del ensayo. */
export function gateSeparationM(w: F04World, nb: F04Notebook, r: ReadingF4 | null): number {
  const g1 = cellValueF4(w, nb.setup.g1);
  const g2 = cellValueF4(w, nb.setup.g2);
  if (Number.isFinite(g1) && Number.isFinite(g2)) return (g2 - g1) / 100;
  return r?.setup?.g1 !== undefined && r.setup.g2 !== undefined ? (r.setup.g2 - r.setup.g1) / 100 : NaN;
}

export function expectedRunRow(w: F04World, nb: F04Notebook, r: ReadingF4 | null) {
  if (!r || r.kind !== 'run' || !r.run) return { v1: NaN, v2: NaN, aGates: NaN, v1Rounded: NaN, v2Rounded: NaN };
  const fw = flagWidthM(nb);
  const d = gateSeparationM(w, nb, r);
  const v1 = gateSpeed(fw, r.run.dt1);
  const v2 = gateSpeed(fw, r.run.dt2);
  return {
    v1, v2, aGates: kinematicAccel(v1, v2, d),
    v1Rounded: gateSpeed(fw, Math.round(r.run.dt1 * 1000) / 1000), v2Rounded: gateSpeed(fw, Math.round(r.run.dt2 * 1000) / 1000),
  };
}

/** Masas del montaje (kg) que usa el estudiante: las de la balanza importadas. */
export function setupMassesKg(w: F04World, nb: F04Notebook) {
  return { mc: cellValueF4(w, nb.setup.cartM) / 1000, mh: cellValueF4(w, nb.setup.hangerM) / 1000 };
}

/** a y T medias de los ensayos importados, con u combinada (tipo A de la dispersión y tipo B del sensor). */
export function expectedRuns(w: F04World, nb: F04Notebook) {
  const rs = nb.runs.map((x) => rdF4(w, x.readingId)).filter((r): r is ReadingF4 => !!r && r.kind === 'run');
  const as = rs.map((r) => r.value).filter(Number.isFinite);
  const Ts = rs.map((r) => r.run?.T ?? NaN).filter(Number.isFinite);
  const uBa = w.params.uB.accel;
  const uBT = w.params.uB.forceN;
  return { rows: nb.runs.map((x) => expectedRunRow(w, nb, rdF4(w, x.readingId))), aMean: mean(as), uA: combinedMean(as, uBa), TMean: mean(Ts), uT: combinedMean(Ts, uBT), uBa, uBT, n: as.length };
}

/** Predicciones a partir de las masas del estudiante y de la polea rotulada (r, I). */
export function expectedModel(w: F04World, nb: F04Notebook) {
  const p = w.params;
  const { mc, mh } = setupMassesKg(w, nb);
  const ev = expectedRuns(w, nb);
  const aPred = idealAccel(mc, mh, p.g);
  const mEff = effectiveMass(mc, mh, p.pulleyI, p.pulleyR);
  const aPredI = Number.isFinite(mEff) && mEff > 0 ? (mh * p.g) / mEff : NaN;
  return {
    mc, mh, aPred, Tpred: mc * aPred,
    aPredCartOnly: Number.isFinite(mc) && mc > 0 ? (mh * p.g) / mc : NaN,
    discrepancy: (100 * (ev.aMean - aPred)) / aPred,
    mEff, mEffNoI: mc + mh, aPredI,
    mSys: Number.isFinite(ev.aMean) && ev.aMean > 0 ? (mh * p.g) / ev.aMean : NaN,
  };
}

/** Fila del barrido de masa colgante: la m_h que corresponde (kg) y su a_pred ideal con el carro pesado. */
export function expectedMassRow(w: F04World, nb: F04Notebook, i: number) {
  const r = rdF4(w, nb.massRuns[i].readingId);
  const { mc } = setupMassesKg(w, nb);
  const mh = r?.setup?.hangLoad !== undefined ? r.setup.hangLoad / 1000 : NaN;
  return { r, mh, aPred: idealAccel(mc, mh, w.params.g), mhNoHanger: Number.isFinite(mh) ? mh - w.params.hangerKg : NaN, a: r?.value ?? NaN, T: r?.run?.T ?? NaN };
}

/** Pendiente de T contra a (kg) de los ensayos del barrido: la masa inercial del carro. */
export function expectedSlope(w: F04World, nb: F04Notebook) {
  const pts = nb.massRuns.map((_, i) => expectedMassRow(w, nb, i)).filter((x) => x.r && Number.isFinite(x.a) && Number.isFinite(x.T)).map((x) => [x.a, x.T] as [number, number]);
  const fit = linFit(pts);
  return { pts, slope: fit.m, intercept: fit.b, inverse: linFit(pts.map(([a, T]) => [T, a] as [number, number])).m };
}

export function expectedPairs(w: F04World, nb: F04Notebook) {
  const sums = nb.pairs.map((x) => rdF4(w, x.readingId)).map((r) => (r?.pair ? r.pair.FA + r.pair.FB : NaN));
  return { sums, sumF: mean(sums.filter(Number.isFinite)) };
}
