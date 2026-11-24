/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus diámetros, sus presiones, sus caudales, su volumen y su tiempo), su incertidumbre y
 * el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia.
 */
import type { F12World, ReadingF12 } from '../../simulation/f12-world/types';
import { originFit, relDiff } from '../../simulation/models/f12/equations';
import { mean, typeA, uRhoSlopeB, uVolumetric } from '../../simulation/models/f12/uncertainty';
import { parseNum, type Entry, type F12Notebook, type FlowRow, type LossRow } from './notebook';

export const readingsOfF12 = (w: F12World): ReadingF12[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF12, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF12 = (w: F12World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF12(w: F12World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

export const BAD_PRESSURE = [
  'UNPLUGGED', 'NO_ZERO', 'UNCALIBRATED', 'AIR', 'LEAK', 'TRANSIENT', 'BLOCKED', 'PITOT', 'CROSSED', 'SPOOL_CHANGED', 'ABSOLUTE', 'BELOW', 'OBSTRUCTED', 'CLIPPED',
  'LOW_RATE', 'DRIFT', 'UNSTABLE', 'CONFIG_CHANGED', 'POST_DAMAGE',
];
export const BAD_FLOW = ['TRANSIENT', 'LEAK', 'OBSTRUCTED', 'DRIFT', 'SPOOL_CHANGED', 'UNSTABLE', 'CLIPPED'];
export const BAD_DIAMETER = ['OBLIQUE', 'OUTER'];
export const BAD_HEIGHT = ['PARALLAX'];
export const BAD_LEVEL = ['PARALLAX', 'UNSTABLE', 'UNPURGED'];
export const BAD_VOLUME = ['PARALLAX', 'EMPTY', 'OCCLUDED', 'UNSTABLE', 'OVERFLOW', 'NO_TIMER', 'TIMING'];
export const BAD_TIME = ['RUNNING'];

const valid = (w: F12World, kind: ReadingF12['kind'], flags: string[]) => readingsOfF12(w).filter((r) => r.kind === kind && Number.isFinite(r.value) && r.valid !== false && !bad(r, flags));
export const validPressures = (w: F12World) => valid(w, 'pressure', BAD_PRESSURE);
export const validFlows = (w: F12World) => valid(w, 'flow', BAD_FLOW);
export const validDiameters = (w: F12World, section?: 'D1' | 'D2') => valid(w, 'diameter', BAD_DIAMETER).filter((r) => !section || r.target === section);
export const validHeights = (w: F12World, port?: 1 | 2 | 3) => valid(w, 'height', BAD_HEIGHT).filter((r) => !port || r.target === `port${port}`);
export const validLevels = (w: F12World) => valid(w, 'level', BAD_LEVEL);
export const validVolumes = (w: F12World) => valid(w, 'volume', BAD_VOLUME);
export const validTimes = (w: F12World) => valid(w, 'time', BAD_TIME).filter((r) => r.value > 0);

export interface PressureSet {
  p1: ReadingF12;
  p2: ReadingF12;
  p3: ReadingF12;
}

/** Juegos de tres canales tomados en la misma lectura del registrador (mismo tick), todos válidos. */
export function pressureSets(w: F12World): PressureSet[] {
  const ok = new Set(validPressures(w).map((r) => r.id));
  const byTick = new Map<number, ReadingF12[]>();
  for (const r of readingsOfF12(w)) {
    if (r.kind !== 'pressure') continue;
    const a = byTick.get(r.tick) ?? [];
    a.push(r);
    byTick.set(r.tick, a);
  }
  const out: PressureSet[] = [];
  for (const rs of byTick.values()) {
    const ch = (k: number) => rs.filter((r) => r.target === `ch${k}`).pop();
    const p1 = ch(1);
    const p2 = ch(2);
    const p3 = ch(3);
    if (p1 && p2 && p3 && ok.has(p1.id) && ok.has(p2.id) && ok.has(p3.id)) out.push({ p1, p2, p3 });
  }
  return out;
}

export interface FlowPoint extends PressureSet {
  q: ReadingF12;
}

/** Puntos (caudal + tres presiones) válidos del mismo ensayo con caudal, uno por ensayo, con el tramo dado. */
export function flowPoints(w: F12World, spool: 'smooth' | 'rough'): FlowPoint[] {
  const qs = validFlows(w);
  const out: FlowPoint[] = [];
  const seen = new Set<string>();
  for (const s of pressureSets(w)) {
    if (!s.p1.flowing || s.p1.spool !== spool || seen.has(s.p1.trialId)) continue;
    const q = qs.find((r) => r.trialId === s.p1.trialId && r.flowing && r.value > 0);
    if (q) {
      out.push({ ...s, q });
      seen.add(s.p1.trialId);
    }
  }
  return out;
}

/** Caudales distintos (de a 0,05 L/s) de una serie. */
export const distinctFlows = (pts: FlowPoint[]) => new Set(pts.map((x) => Math.round(x.q.value * 20)));

/** Referencia con la bomba detenida (presiones de cero documentadas). */
export const staticSets = (w: F12World) => pressureSets(w).filter((s) => !s.p1.flowing);

export const diameterOf = (w: F12World, s: 'D1' | 'D2') => lastOf(validDiameters(w, s));
export const heightOf = (w: F12World, port: 1 | 3) => lastOf(validHeights(w, port));
export const sumpLevelOf = (w: F12World) => lastOf(validLevels(w).filter((r) => !r.flowing));
export const volumeOf = (w: F12World) => lastOf(validVolumes(w).filter((r) => r.value >= 100));
export const timeOf = (w: F12World) => lastOf(validTimes(w));
/** Caudalímetro leído durante una recolección. */
export function meterDuringCollect(w: F12World): ReadingF12 | null {
  const c = w.collect;
  return lastOf(validFlows(w).filter((r) => r.flowing && r.t >= c.startT - 0.01 && (c.endT < c.startT || r.t <= c.endT + 0.01)));
}

// ─────────────────────────── Valores esperados ───────────────────────────

/** Medidas del montaje que usa el estudiante. */
export function setupF12(w: F12World, nb: F12Notebook) {
  const v = (k: keyof F12Notebook['setup']) => cellValueF12(w, nb.setup[k]);
  return { D1: v('D1'), D2: v('D2'), z1: v('z1'), z3: v('z3'), V: v('V'), t: v('t'), Qm: v('Qm') };
}

const areaCm = (Dcm: number) => (Math.PI * (Dcm / 100) ** 2) / 4;
const pr = (w: F12World, id: string | null) => {
  const r = rdF12(w, id);
  return r && r.kind === 'pressure' ? r.value : NaN;
};
const qv = (w: F12World, id: string | null) => {
  const r = rdF12(w, id);
  return r && r.kind === 'flow' ? r.value : NaN;
};

/** v1, v2 (m/s), Δp12 medida y de Bernoulli (Pa) de un caudal, y variantes de errores. */
export function expectedFlowRowF12(w: F12World, nb: F12Notebook, row: FlowRow) {
  const s = setupF12(w, nb);
  const rho = w.params.rho;
  const Q = qv(w, row.qId) / 1000;
  const v1 = Q / areaCm(s.D1);
  const v2 = Q / areaCm(s.D2);
  const dp12 = (pr(w, row.p1Id) - pr(w, row.p2Id)) * 1000;
  return {
    Q, v1, v2, dp12, dp12Pred: 0.5 * rho * (v2 * v2 - v1 * v1), x: 0.5 * (v2 * v2 - v1 * v1),
    /** Variantes: velocidades en cm/s (E15) y redondeadas a 0,1 m/s (E35). */
    v1cm: v1 * 100,
    v2cm: v2 * 100,
    v1r: Math.round(v1 * 10) / 10,
    v2r: Math.round(v2 * 10) / 10,
    predRounded: 0.5 * rho * ((Math.round(v2 * 10) / 10) ** 2 - (Math.round(v1 * 10) / 10) ** 2),
  };
}

/** v1 (m/s), Δp13 corregida por la altura de las tomas (Pa), K y potencia (W) de un caudal con pérdidas. */
export function expectedLossRowF12(w: F12World, nb: F12Notebook, row: LossRow) {
  const s = setupF12(w, nb);
  const p = w.params;
  const Q = qv(w, row.qId) / 1000;
  const v1 = Q / areaCm(s.D1);
  const raw = (pr(w, row.p1Id) - pr(w, row.p3Id)) * 1000;
  const dz = (s.z3 - s.z1) / 100;
  const dp13 = raw - p.rho * p.g * (Number.isFinite(dz) ? dz : 0);
  const K = dp13 / (0.5 * p.rho * v1 * v1);
  return {
    Q, v1, raw, dz, dp13, K, P: Q * dp13,
    /** Variante: sin la corrección de altura (E09). */
    dp13NoZ: raw,
    KNoZ: raw / (0.5 * p.rho * v1 * v1),
  };
}

/** Ajuste por el origen de Δp12 frente a ½(v₂² − v₁²) de la serie escrita: la pendiente es ρ (sin pérdidas). */
export function rhoFitF12(w: F12World, nb: F12Notebook) {
  const p = w.params;
  const s = setupF12(w, nb);
  const rows = nb.flowRows.map((r) => expectedFlowRowF12(w, nb, r)).filter((e) => Number.isFinite(e.x) && Number.isFinite(e.dp12));
  const fit = originFit(rows.map((e) => e.x), rows.map((e) => e.dp12));
  const inv = originFit(rows.map((e) => e.dp12), rows.map((e) => e.x));
  const top = rows.reduce<(typeof rows)[number] | null>((a, e) => (!a || e.dp12 > a.dp12 ? e : a), null);
  const rho = fit ? fit.b : NaN;
  const uB = top ? uRhoSlopeB(rho, p.uB.sensorKPa * 1000, top.dp12, p.uB.meterLs / 1000, top.Q, p.uB.caliperCm, s.D2) : NaN;
  const u = fit ? Math.hypot(fit.ub, Number.isFinite(uB) ? uB : 0) : NaN;
  return { rho, u, uB, inv: inv ? inv.b : NaN, n: rows.length };
}

/** Caudal volumétrico, desvío del caudalímetro, ρ del ajuste y K medio. */
export function expectedCalcF12(w: F12World, nb: F12Notebook) {
  const s = setupF12(w, nb);
  const p = w.params;
  const Qvol = s.V / 1000 / s.t;
  const uQvol = uVolumetric(Qvol, s.V, p.uB.beakerML, s.t, p.uB.timerS);
  const fit = rhoFitF12(w, nb);
  const Ks = nb.lossRows.map((r) => expectedLossRowF12(w, nb, r)).filter((e) => Number.isFinite(e.K));
  const Kmean = mean(Ks.map((e) => e.K));
  const uK = Ks.length >= 2 ? typeA(Ks.map((e) => e.K)) : NaN;
  return {
    Qvol, uQvol, QDev: relDiff(s.Qm, Qvol), rhoFit: fit.rho, uRho: fit.u, uRhoB: fit.uB, invRho: fit.inv, K: Kmean, uK, nFlow: fit.n, nLoss: Ks.length,
    KNoZ: mean(Ks.map((e) => e.KNoZ)),
  };
}
