/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus masas pesadas, sus tirones, sus ángulos y su bajada), su incertidumbre y el modo
 * activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia.
 */
import type { F05World, ReadingF5 } from '../../simulation/f05-world/types';
import { criticalAngle, frictionWork, gateSpeed, kinematicAccel, linFit, muFromAngle, muKFromSlide } from '../../simulation/models/f05/equations';
import { combinedMean, mean } from '../../simulation/models/f05/uncertainty';
import { parseNum, type Entry, type F05Notebook } from './notebook';

export const readingsOfF5 = (w: F05World): ReadingF5[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF5, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF5 = (w: F05World, id: string | null) => (id ? (w.readings[id] ?? null) : null);
const RAD = Math.PI / 180;

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF5(w: F05World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

/** Defectos que invalidan cualquier tirón horizontal. */
export const BAD_PULL = [
  'CABLE_TILTED', 'INCLINED', 'JERK', 'LOAD_SHIFT', 'CONFIG_CHANGED', 'WORN', 'UNPLUGGED', 'NOT_ZEROED', 'UNCALIBRATED', 'TILTED_SENSOR', 'PERPENDICULAR', 'CLIPPED', 'LOW_RATE', 'NO_SLIP',
  'FEW_SAMPLES',
];
/** Además, la meseta cinética debe ser posterior al arranque, sin aceleración ni oscilación. */
export const BAD_MEAN = [...BAD_PULL, 'BEFORE_SLIP', 'ACCELERATING', 'OSCILLATING'];
export const BAD_ANGLE = ['PARALLAX', 'SUPPORT_SCALE', 'DRIFT', 'UNSTABLE', 'COARSE', 'SUPPORT_SHIFT', 'WORN'];
export const BAD_SLIDE = ['NOT_SLID', 'POST_IMPACT', 'OCCLUDED', 'UNPLUGGED', 'LOW_RATE', 'DRIFT', 'BASE_SLIP', 'LOAD_SHIFT', 'CONFIG_CHANGED', 'WORN', 'FEW_SAMPLES'];

export const validPeaks = (w: F05World) => readingsOfF5(w).filter((r) => r.kind === 'pull' && r.pull?.Fpeak !== null && r.pull?.Fpeak !== undefined && !bad(r, BAD_PULL));
export const validMeans = (w: F05World) => readingsOfF5(w).filter((r) => r.kind === 'pull' && Number.isFinite(r.value) && r.pull?.Fmean !== null && !bad(r, BAD_MEAN));
export const validAngles = (w: F05World) => readingsOfF5(w).filter((r) => r.kind === 'angle' && r.target === 'plane' && r.angle?.slipped && Number.isFinite(r.value) && !bad(r, BAD_ANGLE));
export const validSlides = (w: F05World) => readingsOfF5(w).filter((r) => r.kind === 'slide' && Number.isFinite(r.value) && r.slide && r.slide.dt1 !== null && r.slide.dt2 !== null && !bad(r, BAD_SLIDE));
export const massReading = (w: F05World, target: string) => lastOf(readingsOfF5(w).filter((r) => r.kind === 'mass' && r.target === target && !r.qualityFlags.length && (target !== 'block01' || r.setup?.load === 0)));
export const scaleReading = (w: F05World, target: string) => lastOf(readingsOfF5(w).filter((r) => r.kind === 'length' && r.target === target && !r.qualityFlags.length));
export const tempReading = (w: F05World) => lastOf(readingsOfF5(w).filter((r) => r.kind === 'temp'));

// ─────────────────────────── Valores esperados ───────────────────────────

/** Masas (kg) que usa el estudiante: bloque y un lastre de la balanza importados. */
export function setupMassesKg(w: F05World, nb: F05Notebook) {
  return { mb: cellValueF5(w, nb.setup.blockM) / 1000, mw: cellValueF5(w, nb.setup.ballastM) / 1000 };
}

/** Masa (kg) bloque + lastres de un tirón, con la masa pesada del bloque y del lastre (cargas de 250 g nominales). */
export function pullMassKg(w: F05World, nb: F05Notebook, r: ReadingF5 | null): number {
  if (!r) return NaN;
  const { mb, mw } = setupMassesKg(w, nb);
  const n = Math.round((r.setup?.loadG ?? 0) / 250);
  return mb + n * (Number.isFinite(mw) ? mw : 0.25);
}

/** Normal (N) de un tirón horizontal: N = m g. */
export const pullNormal = (w: F05World, nb: F05Notebook, r: ReadingF5 | null) => pullMassKg(w, nb, r) * w.params.g;

const peakOf = (r: ReadingF5 | null) => r?.pull?.Fpeak ?? NaN;
const meanOf = (r: ReadingF5 | null) => (r?.pull?.Fmean ?? NaN);

export function expectedStaticRow(w: F05World, nb: F05Notebook, r: ReadingF5 | null) {
  const N = pullNormal(w, nb, r);
  return { N, muS: peakOf(r) / N, F: peakOf(r) };
}

export function expectedKineticRow(w: F05World, nb: F05Notebook, r: ReadingF5 | null) {
  const N = pullNormal(w, nb, r);
  return { N, muK: meanOf(r) / N, muFromPeak: peakOf(r) / N, F: meanOf(r) };
}

/** Promedios de μ_s y μ_k de las réplicas importadas, con u combinada (tipo A de la dispersión y tipo B de la célula). */
export function expectedMus(w: F05World, nb: F05Notebook) {
  const sRows = nb.staticRows.map((x) => expectedStaticRow(w, nb, rdF5(w, x.readingId)));
  const kRows = nb.kineticRows.map((x) => expectedKineticRow(w, nb, rdF5(w, x.readingId)));
  const muSs = sRows.map((x) => x.muS).filter(Number.isFinite);
  const muKs = kRows.map((x) => x.muK).filter(Number.isFinite);
  const N0 = mean(sRows.map((x) => x.N).filter(Number.isFinite));
  const uBmu = w.params.uB.forceN / (Number.isFinite(N0) && N0 > 0 ? N0 : 4.9);
  return { sRows, kRows, muS: mean(muSs), uS: combinedMean(muSs, uBmu), muK: mean(muKs), uK: combinedMean(muKs, uBmu), uBmu, nS: muSs.length, nK: muKs.length };
}

/** Recta F_k contra N del barrido de carga: su pendiente es μ_k. */
export function expectedSlopeF5(w: F05World, nb: F05Notebook) {
  const pts = nb.loadRows
    .map((x) => rdF5(w, x.readingId))
    .filter((r): r is ReadingF5 => !!r && r.kind === 'pull')
    .map((r) => [pullNormal(w, nb, r), meanOf(r)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const fit = linFit(pts);
  return { pts, slope: fit.m, intercept: fit.b, inverse: linFit(pts.map(([N, F]) => [F, N] as [number, number])).m };
}

export function expectedAngleRow(r: ReadingF5 | null) {
  const th = r && r.kind === 'angle' ? r.value : NaN;
  return { theta: th, muS: muFromAngle(th), muRounded: muFromAngle(Math.round(th)), material: r?.angle?.material ?? '' };
}

/** Ancho de la bandera (m) que usa el estudiante: el rotulado que escribió; si falta, el nominal de 1,0 cm. */
export function flagWidthM(nb: F05Notebook): number {
  const d = parseNum(nb.flagW);
  return Number.isFinite(d) && d > 0 ? d / 100 : 0.01;
}

/** Ángulo de la bajada (°): el leído en el goniómetro e importado; si no, el del montaje de la lectura. */
export function slideThetaDeg(w: F05World, nb: F05Notebook, r: ReadingF5 | null): number {
  const t = cellValueF5(w, nb.setup.slideTheta);
  if (Number.isFinite(t)) return t;
  return r?.setup?.thetaDeg ?? NaN;
}

/** Bajada: v en cada compuerta, a cinemática entre ellas y μ_k = tan θ − a/(g cos θ). */
export function expectedSlide(w: F05World, nb: F05Notebook) {
  const r = rdF5(w, nb.slide.readingId);
  const g = w.params.g;
  if (!r || r.kind !== 'slide' || !r.slide) return { r: null, v1: NaN, v2: NaN, a: NaN, muK: NaN, muKFlat: NaN, theta: NaN, d: NaN };
  const fw = flagWidthM(nb);
  const g1 = cellValueF5(w, nb.setup.g1);
  const g2 = cellValueF5(w, nb.setup.g2);
  const d = Number.isFinite(g1) && Number.isFinite(g2) ? Math.abs(g1 - g2) / 100 : r.setup?.g1 !== undefined && r.setup.g2 !== undefined ? Math.abs(r.setup.g1 - r.setup.g2) / 100 : NaN;
  // El bloque pasa primero por la compuerta alta (gate1) y luego por la baja (gate2).
  const v1 = gateSpeed(fw, r.slide.dt1 ?? NaN);
  const v2 = gateSpeed(fw, r.slide.dt2 ?? NaN);
  const a = kinematicAccel(v1, v2, d);
  const theta = slideThetaDeg(w, nb, r);
  return { r, v1, v2, a, muK: muKFromSlide(a, g, theta), muKFlat: Math.sin(theta * RAD) - a / g, theta, d };
}

/** Modelo: ángulo crítico predicho con μ_s horizontal, discrepancia con el medido en el mismo material y trabajo del roce. */
export function expectedModelF5(w: F05World, nb: F05Notebook) {
  const em = expectedMus(w, nb);
  const thetaPred = criticalAngle(em.muS);
  const mat = nb.material;
  const ang = nb.angleRows.map((x) => rdF5(w, x.readingId)).find((r) => r?.kind === 'angle' && r.angle?.material === mat) ?? null;
  const thetaMeas = ang ? ang.value : NaN;
  const es = expectedSlide(w, nb);
  const { mb } = setupMassesKg(w, nb);
  const m = mb + Math.round((es.r?.setup?.loadG ?? 0) / 250) * (setupMassesKg(w, nb).mw || 0.25);
  const muKs = Number.isFinite(es.muK) ? es.muK : em.muK;
  const N = m * w.params.g * Math.cos(es.theta * RAD);
  return {
    thetaPred, thetaMeas,
    thetaDisc: (100 * (thetaMeas - thetaPred)) / thetaPred,
    muKSlide: es.muK,
    Wfr: frictionWork(muKs, N, es.d),
    WfrFlat: frictionWork(muKs, m * w.params.g, es.d),
  };
}
