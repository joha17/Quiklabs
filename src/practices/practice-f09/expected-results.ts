/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus masas pesadas, los radios que leyó, sus fuerzas, sus tiempos, sus ajustes del
 * encoder), su incertidumbre y el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan
 * como evidencia.
 */
import type { F09World, ReadingF9 } from '../../simulation/f09-world/types';
import { angularMomentumOf, centripetalForce, inertiaFromTorque, omegaFromPeriod, rotKE, slopeThroughOrigin, tangentialSpeed } from '../../simulation/models/f09/equations';
import { combinedMean, mean } from '../../simulation/models/f09/uncertainty';
import { parseNum, type CircRow, type Entry, type F09Notebook, type TorqueRow } from './notebook';

export const readingsOfF9 = (w: F09World): ReadingF9[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF9, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF9 = (w: F09World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF9(w: F09World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

/** Banderas comunes que invalidan una lectura como evidencia del modelo. */
export const BAD_COMMON = ['UNPLUGGED', 'AXIS_TILTED', 'SUPPORT_MOVED', 'POST_IMPACT', 'ASYMMETRIC', 'BRAKING', 'SPEED_JUMP', 'CONFIG_CHANGED', 'UNSTABLE'];
export const BAD_FORCE = [...BAD_COMMON, 'NOT_ZEROED', 'TILTED_SENSOR', 'CLIPPED', 'SLACK', 'EMPTY', 'NO_MASS'];
export const BAD_PERIOD = [...BAD_COMMON, 'HALF_TURN', 'OCCLUDED', 'NO_PASS'];
export const BAD_OMEGA = [...BAD_COMMON, 'UNCALIBRATED', 'MOTOR_TORQUE', 'ASYM_PULL'];
export const BAD_ENCODER = [...BAD_COMMON, 'UNCALIBRATED', 'LOW_RATE', 'OBLIQUE', 'REVERSED', 'OVERSPEED', 'SPINNING_START', 'NO_END'];
export const BAD_DYN = ['OVER_RANGE', 'NOT_ZEROED', 'PARALLAX', 'NO_LOAD', 'OBLIQUE'];

const valid = (w: F09World, kind: ReadingF9['kind'], flags: string[]) => readingsOfF9(w).filter((r) => r.kind === kind && Number.isFinite(r.value) && !bad(r, flags));
export const validForces = (w: F09World) => valid(w, 'force', BAD_FORCE);
export const validPeriods = (w: F09World) => valid(w, 'period', BAD_PERIOD);
export const validOmegas = (w: F09World) => valid(w, 'omega', BAD_OMEGA);
export const validEncoders = (w: F09World) => valid(w, 'encoder', BAD_ENCODER).filter((r) => r.fit?.alpha !== null && r.fit?.alphaC !== null);
export const validDyns = (w: F09World) => valid(w, 'dyn', BAD_DYN);
export const massReading = (w: F09World, target: string) => lastOf(readingsOfF9(w).filter((r) => r.kind === 'mass' && r.target === target && !r.qualityFlags.length));
export const radiusReadings = (w: F09World, target?: string) => readingsOfF9(w).filter((r) => r.kind === 'radius' && !r.qualityFlags.length && (!target || r.target === target));

/** Pares (fuerza, período) válidos del mismo ensayo, uno por ensayo. */
export function circPairs(w: F09World): Array<{ f: ReadingF9; p: ReadingF9 }> {
  const ps = validPeriods(w);
  const out: Array<{ f: ReadingF9; p: ReadingF9 }> = [];
  const seen = new Set<string>();
  for (const f of validForces(w)) {
    if (seen.has(f.trialId)) continue;
    const p = ps.find((x) => x.trialId === f.trialId);
    if (p) {
      out.push({ f, p });
      seen.add(f.trialId);
    }
  }
  return out;
}

/** Pares (dinamómetro, encoder) válidos del mismo tirón. */
export function torquePairs(w: F09World): Array<{ d: ReadingF9; e: ReadingF9 }> {
  const ds = validDyns(w);
  return validEncoders(w).flatMap((e) => {
    const d = ds.find((x) => x.trialId === e.trialId);
    return d ? [{ d, e }] : [];
  });
}

/** Pares (ω₁, ω₂) válidos del mismo giro con las masas recogidas entre ambos (radio menor en al menos 5 cm). */
export function momentumPairs(w: F09World): Array<{ a: ReadingF9; b: ReadingF9 }> {
  const os = validOmegas(w);
  const out: Array<{ a: ReadingF9; b: ReadingF9 }> = [];
  for (const a of os) {
    const b = os.find((x) => x.trialId === a.trialId && x.t > a.t && (a.setup?.slides?.[0] ?? 0) - (x.setup?.slides?.[0] ?? 0) > 0.05);
    if (b) out.push({ a, b });
  }
  return out;
}

// ─────────────────────────── Valores esperados ───────────────────────────

/** Medidas que usa el estudiante en SI: masas (kg) y radios (m). */
export function setupF9(w: F09World, nb: F09Notebook) {
  const v = (k: keyof F09Notebook['setup']) => cellValueF9(w, nb.setup[k]);
  return { mOrb: v('mOrb') / 1000, mSlide: v('mSlide') / 1000, rOrb: v('rOrb') / 100, rArm1: v('rArm1') / 100, rArm2: v('rArm2') / 100, rSlideC: v('rSlideC') / 100 };
}

/** T, ω, v, F medida, F prevista y residuo de una velocidad con las medidas del estudiante (y variantes de errores). */
export function expectedCircF9(w: F09World, nb: F09Notebook, row: CircRow) {
  const s = setupF9(w, nb);
  const fr = rdF9(w, row.forceId);
  const pr = rdF9(w, row.periodId);
  const F = fr && fr.kind === 'force' ? fr.value : NaN;
  const T = pr && pr.kind === 'period' ? pr.value / (pr.turns ?? 1) : NaN;
  const omega = omegaFromPeriod(T);
  const v = tangentialSpeed(omega, s.rOrb);
  const Fpred = centripetalForce(s.mOrb, omega, s.rOrb);
  const Tr = Math.round(T * 10) / 10;
  return {
    fr, pr, F, T, omega, v, Fpred, diff: (100 * (F - Fpred)) / Fpred,
    /** Variantes: período redondeado a 0,1 s (E35) y torque de F_c como F r (E16). */
    FpredRounded: centripetalForce(s.mOrb, omegaFromPeriod(Tr), s.rOrb),
    roundedDiffers: Math.abs(Tr - T) > 0.002 * T,
    Fr: F * s.rOrb,
  };
}

/** τ, α, |α_c| e I de un tirón (fila i usa el brazo i). */
export function expectedTorqueF9(w: F09World, nb: F09Notebook, row: TorqueRow, i: number) {
  const s = setupF9(w, nb);
  const dr = rdF9(w, row.dynId);
  const er = rdF9(w, row.encId);
  const F = dr && dr.kind === 'dyn' ? dr.value : NaN;
  const r = i === 0 ? s.rArm1 : s.rArm2;
  const tau = r * F;
  const alpha = er?.fit?.alpha ?? NaN;
  const alphaC = Math.abs(er?.fit?.alphaC ?? NaN);
  return { dr, er, F, r, tau, alpha, alphaC, I: inertiaFromTorque(tau, alpha, alphaC), Inofric: inertiaFromTorque(tau, alpha, 0) };
}

/** Pendiente F vs ω², m r prevista, I del torque (promedio), I₀ y la conservación del momento angular. */
export function expectedCalcF9(w: F09World, nb: F09Notebook) {
  const s = setupF9(w, nb);
  const p = w.params;
  const circ = nb.circRows.map((x) => expectedCircF9(w, nb, x)).filter((e) => Number.isFinite(e.F) && Number.isFinite(e.omega));
  const mr = slopeThroughOrigin(circ.map((e) => e.omega ** 2), circ.map((e) => e.F));
  const Fm = mean(circ.map((e) => e.F));
  const uMr = Math.abs(mr) * Math.hypot(p.uB.forceN / (Number.isFinite(Fm) && Fm > 0 ? Fm : 1), 0.004);
  const torques = nb.torqueRows.map((x, i) => expectedTorqueF9(w, nb, x, i)).filter((e) => Number.isFinite(e.I));
  const Is = torques.map((e) => e.I);
  const Itorque = mean(Is);
  const F0 = torques[0]?.F ?? 2;
  const relB = Math.hypot(p.uB.dynN / (F0 > 0 ? F0 : 2), p.uB.rulerCm / (s.rArm1 * 100 || 20), 0.002);
  const uI = combinedMean(Is, Math.abs(Itorque) * relB) * (Is.length ? 1 : NaN);
  const I0 = Itorque - 2 * s.mSlide * s.rSlideC ** 2;
  const mo = expectedMomentumF9(w, nb, I0);
  return {
    mr, uMr, mrPred: s.mOrb * s.rOrb, nCirc: circ.length, Itorque, uI, uBI: Math.abs(Itorque) * relB, I0, Lratio: mo.L2 / mo.L1, Kratio: mo.K2 / mo.K1, tauFc: 0,
    FcR: circ[0]?.Fr ?? NaN, nTorque: Is.length,
  };
}

/** I₁, I₂, L₁, L₂ y K₁, K₂ con ω₁, ω₂ del encoder y los radios leídos (y K sin las masas, E14). */
export function expectedMomentumF9(w: F09World, nb: F09Notebook, I0?: number) {
  const s = setupF9(w, nb);
  const m = nb.momentum;
  const base = I0 ?? (() => {
    const Is = nb.torqueRows.map((x, i) => expectedTorqueF9(w, nb, x, i).I).filter(Number.isFinite);
    return mean(Is) - 2 * s.mSlide * s.rSlideC ** 2;
  })();
  const val = (id: string | null, kind: ReadingF9['kind']) => {
    const r = rdF9(w, id);
    return r && r.kind === kind ? r.value : NaN;
  };
  const w1 = val(m.w1Id, 'omega');
  const w2 = val(m.w2Id, 'omega');
  const r1 = val(m.r1Id, 'radius') / 100;
  const r2 = val(m.r2Id, 'radius') / 100;
  const I1 = base + 2 * s.mSlide * r1 * r1;
  const I2 = base + 2 * s.mSlide * r2 * r2;
  const L1 = angularMomentumOf(I1, w1);
  const L2 = angularMomentumOf(I2, w2);
  return {
    w1, w2, r1, r2, I0: base, I1, I2, L1, L2, dL: (100 * (L2 - L1)) / L1, K1: rotKE(I1, w1), K2: rotKE(I2, w2),
    K1nomass: rotKE(base, w1), K2nomass: rotKE(base, w2),
  };
}
