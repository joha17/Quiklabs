/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus masas pesadas, sus alargamientos, sus disparos, sus tiempos y sus alturas), su
 * incertidumbre y el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia.
 */
import type { F06World, ReadingF6 } from '../../simulation/f06-world/types';
import { elasticEnergy, gateSpeed, gravEnergy, kineticEnergy, linFit, pendulumDrop } from '../../simulation/models/f06/equations';
import { combinedMean, mean } from '../../simulation/models/f06/uncertainty';
import { parseNum, type Entry, type F06Notebook } from './notebook';

export const readingsOfF6 = (w: F06World): ReadingF6[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF6, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF6 = (w: F06World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF6(w: F06World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

export const BAD_LAUNCH = ['UNPLUGGED', 'NOT_ZEROED', 'UNCALIBRATED', 'TILTED_SENSOR', 'UNSYNCED', 'OCCLUDED', 'CLIPPED', 'LOW_RATE', 'DETACHED', 'PUSHED', 'DAMAGED', 'NONLINEAR', 'MASS_CHANGED', 'CONFIG_CHANGED'];
export const BAD_GATES = ['UNPLUGGED', 'OFF_FLAT', 'POST_IMPACT', 'BASE_SLIP', 'NOT_CRESTED', 'NO_PASS', 'DETACHED', 'PUSHED', 'DAMAGED', 'NONLINEAR', 'MASS_CHANGED', 'CONFIG_CHANGED'];

export const validRulers = (w: F06World) => readingsOfF6(w).filter((r) => r.kind === 'length' && r.target === 'ruler01' && r.setup?.hanger && !r.qualityFlags.length && Number.isFinite(r.value));
export const validLaunches = (w: F06World) => readingsOfF6(w).filter((r) => r.kind === 'launch' && Number.isFinite(r.value) && !bad(r, BAD_LAUNCH));
export const validGates = (w: F06World) => readingsOfF6(w).filter((r) => r.kind === 'gates' && r.gates && r.gates.dt1 !== null && r.gates.dt2 !== null && !bad(r, BAD_GATES));
export const validHeights = (w: F06World) => readingsOfF6(w).filter((r) => r.kind === 'height' && !r.qualityFlags.length);
export const validPendulums = (w: F06World) => readingsOfF6(w).filter((r) => r.kind === 'pendulum' && Number.isFinite(r.value) && r.pend?.dt !== null && !r.qualityFlags.length);
export const massReading = (w: F06World, target: string) => lastOf(readingsOfF6(w).filter((r) => r.kind === 'mass' && r.target === target && !r.qualityFlags.length && (target !== 'cart01' || r.setup?.cartLoadG === 0)));
export const pendScaleReading = (w: F06World) => lastOf(readingsOfF6(w).filter((r) => r.kind === 'length' && r.target === 'pendulum' && !r.qualityFlags.length));

// ─────────────────────────── Valores esperados ───────────────────────────

/** Masas (kg) que usa el estudiante: carro, porta-pesas y una pesa de la balanza importados. */
export function setupMassesKg(w: F06World, nb: F06Notebook) {
  return { mc: cellValueF6(w, nb.setup.cartM) / 1000, mh: cellValueF6(w, nb.setup.hangerM) / 1000, ms: cellValueF6(w, nb.setup.slotM) / 1000 };
}

/** Ancho de la bandera (m) y diámetro de la esfera (m) que usa el estudiante; si faltan, los nominales. */
export function flagWidthM(nb: F06Notebook): number {
  const d = parseNum(nb.flagW);
  return Number.isFinite(d) && d > 0 ? d / 100 : 0.02;
}
export function bobDiameterM(nb: F06Notebook): number {
  const d = parseNum(nb.bobD);
  return Number.isFinite(d) && d > 0 ? d / 100 : 0.025;
}

/** Fila de calibración: x (m) de la regla, F = (m_porta + n m_pesa) g y la que omite el porta-pesas. */
export function expectedSpringRow(w: F06World, nb: F06Notebook, r: ReadingF6 | null) {
  const { mh, ms } = setupMassesKg(w, nb);
  const n = r?.setup?.slots ?? 0;
  const g = w.params.g;
  const x = r && r.kind === 'length' ? r.value / 100 : NaN;
  return { x, F: (mh + n * ms) * g, Fnoh: n * ms * g, n };
}

/** Recta F contra x de la calibración: su pendiente es k. */
export function expectedSpring(w: F06World, nb: F06Notebook) {
  const rows = nb.springRows.map((x) => expectedSpringRow(w, nb, rdF6(w, x.readingId))).filter((e) => Number.isFinite(e.x) && Number.isFinite(e.F));
  const pts = rows.map((e) => [e.x, e.F] as [number, number]);
  const fit = linFit(pts);
  const inverse = linFit(pts.map(([x, F]) => [F, x] as [number, number])).m;
  // u(k): error estándar de la pendiente y la resolución de la regla sobre el recorrido.
  const n = pts.length;
  let se = NaN;
  if (n > 2 && Number.isFinite(fit.m)) {
    const xm = mean(pts.map((p) => p[0]));
    const sxx = pts.reduce((s, [x]) => s + (x - xm) ** 2, 0);
    const ss = pts.reduce((s, [x, F]) => s + (F - (fit.m * x + fit.b)) ** 2, 0);
    se = Math.sqrt(ss / (n - 2) / Math.max(1e-12, sxx));
  }
  const span = n ? Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) : NaN;
  const uB = Number.isFinite(fit.m) && span > 0 ? (fit.m * Math.SQRT2 * (w.params.uB.rulerCm / 100)) / span : NaN;
  return { pts, k: fit.m, intercept: fit.b, inverse, uk: Number.isFinite(se) ? Math.hypot(se, uB) : uB, uB };
}

/** k que usa el estudiante en U_el: la de su recta; si no hay recta, la que escribió. */
export function studentK(w: F06World, nb: F06Notebook): number {
  const k = expectedSpring(w, nb).k;
  return Number.isFinite(k) ? k : parseNum(nb.calc.k.value);
}

export function expectedLaunchRow(w: F06World, nb: F06Notebook, r: ReadingF6 | null) {
  if (!r || r.kind !== 'launch' || !r.launch) return { W: NaN, Uel: NaN, FmaxX: NaN, x: NaN, Pmax: NaN, Pavg: NaN };
  const x = r.launch.xmax ?? NaN;
  return { W: r.value, Uel: elasticEnergy(studentK(w, nb), x), FmaxX: (r.launch.Fmax ?? NaN) * x, x, Pmax: r.launch.Pmax ?? NaN, Pavg: r.launch.Pavg ?? NaN };
}

const dtOf = (r: ReadingF6 | null, which: 'dt1' | 'dt2') => (r && r.kind === 'gates' && r.gates ? (r.gates[which] ?? NaN) : NaN);

export function expectedRepRow(w: F06World, nb: F06Notebook, r: ReadingF6 | null) {
  const { mc } = setupMassesKg(w, nb);
  const fw = flagWidthM(nb);
  const dt = dtOf(r, 'dt1');
  const v1 = gateSpeed(fw, dt);
  return { v1, K1: kineticEnergy(mc, v1), K1double: mc * v1 * v1, v1rounded: gateSpeed(fw, Math.round(dt * 1000) / 1000) };
}

export function expectedHeightRow(w: F06World, nb: F06Notebook, r: ReadingF6 | null, hr: ReadingF6 | null) {
  const { mc } = setupMassesKg(w, nb);
  const fw = flagWidthM(nb);
  const v2 = gateSpeed(fw, dtOf(r, 'dt2'));
  const h = hr && hr.kind === 'height' ? hr.value / 100 : NaN;
  const v1 = gateSpeed(fw, dtOf(r, 'dt1'));
  return { v1, v2, h, Ug: gravEnergy(mc, w.params.g, h), K2: kineticEnergy(mc, v2), K1: kineticEnergy(mc, v1), K2double: mc * v2 * v2 };
}

/** Ensayo con pérdidas: W_nc = (K₂ + U_g) − K₁ y el trabajo neto ΔK = K₂ − K₁. */
export function expectedLoss(w: F06World, nb: F06Notebook) {
  const r = rdF6(w, nb.loss.readingId);
  const hr = rdF6(w, nb.loss.heightId);
  const e = expectedHeightRow(w, nb, r, hr);
  return { ...e, r, Wnc: e.K2 + e.Ug - e.K1, Wnet: e.K2 - e.K1 };
}

export function expectedPendRow(w: F06World, nb: F06Notebook, r: ReadingF6 | null) {
  const L = cellValueF6(w, nb.setup.pendL) / 100;
  const L0 = Number.isFinite(L) ? L : (r?.pend?.L ?? NaN);
  if (!r || r.kind !== 'pendulum' || !r.pend) return { v: NaN, h: NaN, disc: NaN };
  const v = gateSpeed(bobDiameterM(nb), r.pend.dt ?? NaN);
  const h = pendulumDrop(L0, r.value);
  const g = w.params.g;
  return { v, h, disc: (100 * (0.5 * v * v - g * h)) / (g * h) };
}

/** Promedios con su incertidumbre: W (área), K₁, eficiencia de la transferencia, trabajo neto, potencia y péndulo. */
export function expectedCalcF6(w: F06World, nb: F06Notebook) {
  const sp = expectedSpring(w, nb);
  const lRows = nb.launchRows.map((x) => expectedLaunchRow(w, nb, rdF6(w, x.readingId)));
  const rRows = nb.repRows.map((x) => expectedRepRow(w, nb, rdF6(w, x.readingId)));
  const Ws = lRows.map((e) => e.W).filter(Number.isFinite);
  const Ks = rRows.map((e) => e.K1).filter(Number.isFinite);
  const xMax = mean(lRows.map((e) => e.x).filter(Number.isFinite));
  const uBW = w.params.uB.forceN * (Number.isFinite(xMax) ? xMax : 0.15);
  const K1 = mean(Ks);
  const uBK = Number.isFinite(K1) ? 2 * K1 * (w.params.uB.gateS / 0.006) : 1e-4;
  const W = mean(Ws);
  const loss = expectedLoss(w, nb);
  const pend = nb.pendRows.map((x) => expectedPendRow(w, nb, rdF6(w, x.readingId))).map((e) => e.disc).filter(Number.isFinite);
  const first = lRows.find((e) => Number.isFinite(e.Pmax));
  return {
    sp, lRows, rRows,
    W, uW: combinedMean(Ws, uBW), uBW,
    K1, uK1: combinedMean(Ks, uBK), uBK,
    eff: (100 * K1) / W,
    Wnet: loss.Wnet, Wnc: loss.Wnc, Wgrav: -loss.Ug,
    Pmax: first?.Pmax ?? NaN, Pavg: first?.Pavg ?? NaN,
    pendDisc: mean(pend),
    nW: Ws.length, nK: Ks.length,
  };
}
