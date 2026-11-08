/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (su ancho de bandera, sus posiciones, sus alturas, sus cintas), su incertidumbre y el
 * modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia de cada etapa.
 */
import type { F102World, ReadingF2 } from '../../simulation/f102-world/types';
import { accelFromGates, atwoodAccel, gateVelocity, gFromFall, meanVelocity, quadraticFit } from '../../simulation/models/f102/equations';
import { combinedMean, mean, uGFromFall } from '../../simulation/models/f102/uncertainty';
import { movingDots } from '../../simulation/f102-world/world';
import { parseNum, type Entry, type F102Notebook } from './notebook';

export const readingsOfF2 = (w: F102World): ReadingF2[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF2, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF2(w: F102World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

const BAD_GATES = ['MISSED', 'OVERLAP', 'MOVING', 'IMPACT', 'POST_IMPACT', 'CONFIG_CHANGED', 'UNPLUGGED', 'PUSHED', 'UNLEVELED', 'SLACK_TAPE'];
const BAD_TAPE = ['LATE_START', 'SLACK_TAPE', 'OFF_WHEEL', 'CONFIG_CHANGED', 'PUSHED'];
const BAD_FALL = ['LATERAL', 'LOOSE_CLAMP', 'DRAG', 'TUMBLING'];
const BAD_MOTION = ['CLIPPED', 'OCCLUDED', 'TILTED', 'UNCALIBRATED', 'CONFIG_CHANGED', 'LOW_RATE', 'MIXED', 'TUMBLING', 'NO_BODY'];

/** Corridas de MRU válidas: sin masa colgante, con los cuatro tiempos y sin defectos de técnica. */
export const gateRuns = (w: F102World) =>
  readingsOfF2(w).filter((r) => r.kind === 'gates' && !bad(r, BAD_GATES) && (r.setup?.hangG ?? 0) === 0 && r.gates && Object.values(r.gates).every((x) => x !== null));

/** Cintas de MRUA válidas: con masa colgante y al menos 8 puntos en movimiento antes del corte. */
export function tapeRuns(w: F102World) {
  return readingsOfF2(w).filter((r) => r.kind === 'tape' && !bad(r, BAD_TAPE) && (r.setup?.hangG ?? 0) > 0 && tapePoints(r, true).length >= 8);
}

export const fallRuns = (w: F102World) => readingsOfF2(w).filter((r) => r.kind === 'fall' && !bad(r, BAD_FALL) && Number.isFinite(r.value));
export const motionRuns = (w: F102World) => readingsOfF2(w).filter((r) => r.kind === 'motion' && !bad(r, BAD_MOTION) && (r.setup?.filters ?? 0) > 0);
export const heightReadings = (w: F102World) => readingsOfF2(w).filter((r) => r.kind === 'length' && r.instrumentId === 'tower01' && !r.qualityFlags.includes('PARALLAX'));
export const angleReading = (w: F102World) => lastOf(readingsOfF2(w).filter((r) => r.kind === 'angle' && r.target === 'track' && !bad(r, ['UNSTABLE', 'NOT_ZEROED'])));
export const rulerReading = (w: F102World, target: string) => lastOf(readingsOfF2(w).filter((r) => r.kind === 'length' && r.instrumentId === 'track01' && r.target === target && !bad(r, ['EDGE', 'PARALLAX'])));

// ─────────────────────────── Cinta ───────────────────────────

/** Puntos (s, m) de una cinta en movimiento; recortados antes del choque o del aterrizaje si `cut`. */
export function tapePoints(r: ReadingF2, cut: boolean): Array<[number, number]> {
  // El estudiante toma como origen el último punto superpuesto (el carro aún quieto): t y x se cuentan desde allí.
  const mv = movingDots(r.samples ?? []);
  if (!mv.length) return [];
  const [t0, x0] = mv[0];
  const pts = mv.map(([t, cm]) => [Math.round((t - t0) * 1e6) / 1e6, (cm - x0) / 100] as [number, number]);
  if (!cut || r.cutS === undefined) return pts;
  // Margen de un punto: el último antes del corte puede incluir el comienzo del choque.
  return pts.filter(([t]) => t + t0 < r.cutS! - 0.02);
}

export function tapeFit(r: ReadingF2, cut = true) {
  return quadraticFit(tapePoints(r, cut));
}

// ─────────────────────────── Valores esperados ───────────────────────────

/** Ancho de bandera (m) y separación de compuertas (m) que el estudiante midió; si faltan, los nominales. */
export function setupGeometry(w: F102World, nb: F102Notebook) {
  const flagCm = cellValueF2(w, nb.setup.flag);
  const g1 = cellValueF2(w, nb.setup.gate1);
  const g2 = cellValueF2(w, nb.setup.gate2);
  return {
    flagM: Number.isFinite(flagCm) && flagCm > 0 ? flagCm / 100 : w.params.flagWidthM,
    sepM: Number.isFinite(g1) && Number.isFinite(g2) ? Math.abs(g2 - g1) / 100 : NaN,
  };
}

/** v₁, v₂ (compuertas) y v̄ (entre compuertas) de una corrida con las medidas del estudiante. */
export function expectedUniform(w: F102World, nb: F102Notebook, r: ReadingF2 | null) {
  const nan = { v1: NaN, v2: NaN, vAvg: NaN, a: NaN, sepM: NaN };
  const g = r?.gates;
  if (!r || !g || g.t1In === null || g.t1Out === null || g.t2In === null || g.t2Out === null) return nan;
  const geo = setupGeometry(w, nb);
  // La separación de esa corrida queda en su montaje; la de la libreta vale si coincide (misma configuración).
  const sepRun = (r.setup?.gateSepCm ?? NaN) / 100;
  const sepM = Number.isFinite(geo.sepM) && Math.abs(geo.sepM - sepRun) < 0.01 ? geo.sepM : sepRun;
  const v1 = gateVelocity(geo.flagM, g.t1Out - g.t1In);
  const v2 = gateVelocity(geo.flagM, g.t2Out - g.t2In);
  return { v1, v2, vAvg: meanVelocity(sepM, g.t2In - g.t1In), a: accelFromGates(v1, v2, sepM), sepM };
}

export function expectedAccelRow(r: ReadingF2 | null) {
  if (!r || r.kind !== 'tape') return { a: NaN, ua: NaN, v0: NaN, aAll: NaN };
  const f = tapeFit(r, true);
  const all = tapeFit(r, false);
  return { a: f.a, ua: f.ua, v0: f.v0, aAll: all.a };
}

/** Predicción a = m g/(M + m) con las masas rotuladas del montaje de la primera corrida importada. */
export function expectedPrediction(w: F102World, nb: F102Notebook) {
  const r = nb.accel.map((x) => (x.readingId ? w.readings[x.readingId] : null)).find((x) => x?.setup);
  const mh = (r?.setup?.hangG ?? NaN) / 1000;
  const mc = (r?.setup?.cartG ?? NaN) / 1000;
  return { aPred: atwoodAccel(mc, mh, w.params.g), mh, mc };
}

export function expectedAccel(w: F102World, nb: F102Notebook) {
  const rows = nb.accel.map((x) => expectedAccelRow(x.readingId ? w.readings[x.readingId] : null));
  const as = rows.map((x) => x.a).filter(Number.isFinite);
  const uFit = mean(rows.map((x) => x.ua).filter(Number.isFinite));
  return { rows, as, aMean: mean(as), uA: combinedMean(as, Number.isFinite(uFit) ? uFit : 0) };
}

/** g de cada corrida de caída con la altura que el estudiante leyó en la escala (cm → m). */
export function expectedFall(w: F102World, nb: F102Notebook) {
  const p = w.params;
  const rows = nb.fall.map((row) => {
    const r = row.readingId ? w.readings[row.readingId] : null;
    const h = cellValueF2(w, row.h) / 100;
    const t = r?.kind === 'fall' ? r.value : NaN;
    return { h, t, g: gFromFall(h, t) };
  });
  const gs = rows.map((x) => x.g).filter(Number.isFinite);
  const hs = rows.map((x) => x.h).filter(Number.isFinite);
  const ts = rows.map((x) => x.t).filter(Number.isFinite);
  // u_B de g con la escala (cm → m) y el cronómetro; la tipo A sale de la dispersión entre corridas.
  const uB = uGFromFall(mean(hs), p.uB.towerCm / 100, mean(ts), p.uB.fallS);
  const gMean = mean(gs);
  return { rows, gs, gMean, uB, uG: combinedMean(gs, Number.isFinite(uB) ? uB : 0), relErr: (100 * (gMean - 9.81)) / 9.81 };
}

/**
 * Velocidad límite de una captura: pendiente de la distancia en la segunda mitad del tramo en movimiento (después del
 * transitorio y antes de llegar a la almohadilla).
 */
export function terminalFromSamples(samples: Array<[number, number]>): number {
  const pts = samples.map(([t, mm]) => [t, mm / 1000] as [number, number]);
  if (pts.length < 6) return NaN;
  // La suelta es el eco más cercano (el cuerpo arriba); antes de ella el sensor ve la almohadilla.
  const i0 = pts.reduce((m, p, i) => (p[1] < pts[m][1] ? i : m), 0);
  const after = pts.slice(i0);
  const d0 = after[0][1];
  const dEnd = Math.max(...after.map((p) => p[1]));
  const moving = after.filter(([, d]) => d > d0 + 0.02 && d < dEnd - 0.03);
  const tail = moving.slice(Math.floor(moving.length / 2));
  if (tail.length < 3) return NaN;
  const n = tail.length;
  const mt = tail.reduce((s, p) => s + p[0], 0) / n;
  const md = tail.reduce((s, p) => s + p[1], 0) / n;
  const sxy = tail.reduce((s, p) => s + (p[0] - mt) * (p[1] - md), 0);
  const sxx = tail.reduce((s, p) => s + (p[0] - mt) ** 2, 0);
  return sxx > 0 ? sxy / sxx : NaN;
}

export function expectedDrag(w: F102World, nb: F102Notebook) {
  const rows = nb.drag.map((row) => {
    const r = row.readingId ? w.readings[row.readingId] : null;
    return { n: r?.setup?.filters ?? NaN, vt: r?.kind === 'motion' ? terminalFromSamples(r.samples ?? []) : NaN };
  });
  const ok = rows.filter((x) => Number.isFinite(x.n) && Number.isFinite(x.vt));
  const lo = ok.reduce<(typeof ok)[number] | null>((m, x) => (!m || x.n < m.n ? x : m), null);
  const hi = ok.reduce<(typeof ok)[number] | null>((m, x) => (!m || x.n > m.n ? x : m), null);
  const ratio = lo && hi && hi.n !== lo.n ? hi.vt / lo.vt : NaN;
  return { rows, ratio, theory: lo && hi && hi.n !== lo.n ? Math.sqrt(hi.n / lo.n) : NaN };
}
