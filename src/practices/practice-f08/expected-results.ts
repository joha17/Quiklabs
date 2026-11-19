/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus masas pesadas, los diámetros que midió, los coeficientes de su encoder, su tensión,
 * sus tiempos), su incertidumbre y el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan
 * como evidencia.
 */
import type { F08World, ReadingF8 } from '../../simulation/f08-world/types';
import { discI, inertiaFromRun, parallelAxis, rotKE, rpmToRad, tensionOf } from '../../simulation/models/f08/equations';
import { combinedMean, mean } from '../../simulation/models/f08/uncertainty';
import { parseNum, type Entry, type F08Notebook, type RunRow } from './notebook';

export const readingsOfF8 = (w: F08World): ReadingF8[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF8, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF8 = (w: F08World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF8(w: F08World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

/** Banderas comunes de un ensayo que lo invalidan como evidencia de τ = I α. */
export const BAD_SETUP = [
  'UNPLUGGED', 'ECCENTRIC', 'ASYMMETRIC', 'OVERLAP', 'STRING_INCLINED', 'SPINNING_START', 'SUPPORT_MOVED', 'POST_IMPACT', 'MASS_SLID', 'TOUCHED', 'GROUND_HIT', 'OVERSPEED', 'CONFIG_CHANGED',
];
export const BAD_ENCODER = [...BAD_SETUP, 'ENC_OFFSET', 'REVERSED', 'UNCALIBRATED', 'LOW_RATE', 'NO_SLACK'];
export const BAD_TENSION = [...BAD_SETUP, 'NOT_ZEROED', 'TILTED_SENSOR', 'CLIPPED', 'NO_DATA'];
export const BAD_GATE = [...BAD_SETUP, 'OCCLUDED', 'NO_PASS'];
export const BAD_TACH = [...BAD_SETUP, 'CLIPPED', 'UNSTABLE'];

export type RunKind = 'axle' | 'disc' | 'ring' | 'bar' | 'parallel' | 'other';

/** Qué montaje registró un ensayo (desde la copia del montaje guardada con la lectura). */
export function runKindF8(r: ReadingF8 | null): RunKind {
  const su = r?.setup;
  if (!su) return 'other';
  if (!su.solid) return 'axle';
  if (su.solid === 'disc01') return (su.hole ?? 0) > 0 ? 'parallel' : 'disc';
  if (su.solid === 'ring01') return 'ring';
  if (su.solid === 'bar01') return su.locked?.every(Boolean) && !su.asym ? 'bar' : 'other';
  return 'other';
}

export const validEncoders = (w: F08World) => readingsOfF8(w).filter((r) => r.kind === 'encoder' && r.fit?.c !== null && r.fit?.cc !== null && !bad(r, BAD_ENCODER));
export const validRuns = (w: F08World, kind: RunKind) => validEncoders(w).filter((r) => runKindF8(r) === kind);
export const validTensions = (w: F08World) => readingsOfF8(w).filter((r) => r.kind === 'tension' && Number.isFinite(r.value) && !bad(r, BAD_TENSION));
export const validGates = (w: F08World) => readingsOfF8(w).filter((r) => r.kind === 'gate' && Number.isFinite(r.value) && !bad(r, BAD_GATE));
export const validTachs = (w: F08World) => readingsOfF8(w).filter((r) => r.kind === 'tach' && r.tach?.peak && Number.isFinite(r.value) && !bad(r, BAD_TACH));
export const massReading = (w: F08World, target: string) => lastOf(readingsOfF8(w).filter((r) => r.kind === 'mass' && r.target === target && !r.qualityFlags.length));
export const lengthReading = (w: F08World, target: string) => lastOf(readingsOfF8(w).filter((r) => r.kind === 'length' && r.target === target));
export const radiusReadings = (w: F08World) => readingsOfF8(w).filter((r) => r.kind === 'radius' && !r.qualityFlags.length);

// ─────────────────────────── Valores esperados ───────────────────────────

/** Medidas que usa el estudiante en SI: masas (kg), radios (m), bandera (m) y distancia del agujero (m). */
export function setupF8(w: F08World, nb: F08Notebook) {
  const v = (k: keyof F08Notebook['setup']) => cellValueF8(w, nb.setup[k]);
  return {
    mDisc: v('mDisc') / 1000, RDisc: v('dDisc') / 200, mRing: v('mRing') / 1000, RRing: v('dRing') / 200, m: v('mDrop') / 1000, r: v('dDrum') / 200, wFlag: v('wFlag') / 100,
    d: v('dHole') / 100, mSlide: v('mSlide') / 1000, g: w.params.g,
  };
}

/** α, α_c, T e I de un ensayo con las medidas del estudiante (y variantes de errores típicos). */
export function expectedRunF8(w: F08World, nb: F08Notebook, r: ReadingF8 | null) {
  const s = setupF8(w, nb);
  const c = r?.fit?.c ?? NaN;
  const cc = r?.fit?.cc ?? NaN;
  const alpha = 2 * c;
  const alphaC = Math.abs(2 * cc);
  const T = tensionOf(s.m, alpha, s.r, s.g);
  const I = inertiaFromRun(T, s.r, alpha, alphaC);
  const alphaR = Math.round(alpha * 10) / 10;
  return {
    alpha, alphaC, T, I, c,
    /** Variantes erróneas: T = m g (E08), sin corregir el roce (E13), c como α (E17), α redondeada (E35). */
    Tmg: s.m * s.g,
    Inofric: inertiaFromRun(T, s.r, alpha, 0),
    Ihalf: inertiaFromRun(tensionOf(s.m, c, s.r, s.g), s.r, c, alphaC),
    Irounded: inertiaFromRun(tensionOf(s.m, alphaR, s.r, s.g), s.r, alphaR, alphaC),
    roundedDiffers: Math.abs(alphaR - alpha) > 0.002 * Math.abs(alpha),
  };
}

const rowI = (w: F08World, nb: F08Notebook, row: RunRow) => expectedRunF8(w, nb, rdF8(w, row.readingId)).I;

/** I₀ (eje solo) e I del disco (promedio de las filas menos I₀), del aro, del eje desplazado y la pendiente I vs r². */
export function expectedCalcF8(w: F08World, nb: F08Notebook) {
  const s = setupF8(w, nb);
  const I0 = rowI(w, nb, nb.axle);
  const disks = nb.diskRows.map((x) => rowI(w, nb, x)).filter(Number.isFinite);
  const Itot = mean(disks);
  const Idisk = Itot - (Number.isFinite(I0) ? I0 : 0);
  const Iring = rowI(w, nb, nb.ring) - (Number.isFinite(I0) ? I0 : 0);
  const Ipred = discI(s.mDisc, s.RDisc);
  const IparMeas = rowI(w, nb, nb.parallel) - (Number.isFinite(I0) ? I0 : 0);
  const IparPred = parallelAxis(Idisk, s.mDisc, s.d);
  // Masas corredizas: pendiente de I frente a r² entre las dos filas (≈ 2 m).
  const mr = nb.massRows.map((x) => ({ I: rowI(w, nb, x), r: (rdF8(w, x.rId)?.value ?? NaN) / 100 }));
  const slope = mr.length >= 2 ? (mr[1].I - mr[0].I) / (mr[1].r ** 2 - mr[0].r ** 2) : NaN;
  // Tipo B de I = T r / α: tensión (u_B del sensor), radio del tambor (calibre) y α (cuantización del encoder ≈ 0,1 %).
  const T0 = expectedRunF8(w, nb, rdF8(w, nb.diskRows[0]?.readingId ?? null)).T;
  const relB = Math.hypot(w.params.uB.tensionN / (Number.isFinite(T0) && T0 > 0 ? T0 : 0.5), w.params.uB.caliperCm / 2 / (s.r * 100 || 2), 0.002);
  const uBI = Math.abs(Itot) * relB;
  const en = expectedEnergyF8(w, nb, Itot);
  return {
    I0, Itot, Idisk, uIdisk: combinedMean(disks, uBI) * (disks.length ? 1 : NaN), uBI, Ipred, Iring, uIring: Math.abs(Iring + I0) * relB, ratio: Iring / Idisk,
    IparMeas, IparPred, parDisc: (100 * (IparMeas - IparPred)) / IparPred, slope, uSlope: Math.abs(slope) * relB * Math.SQRT2 * 3, Ebal: en.bal, nDisk: disks.length,
    /** Variantes erróneas: I previsto con el diámetro (E02), I del disco sin restar I₀ (E09), Steiner sin M d² (E15). */
    IpredDiam: discI(s.mDisc, s.RDisc * 2), IdiskNoI0: Itot, IparNoMd2: Idisk,
  };
}

/** Tensión medida frente a la del modelo del mismo ensayo. */
export function expectedTensionF8(w: F08World, nb: F08Notebook) {
  const tr = rdF8(w, nb.tension.readingId);
  const er = rdF8(w, nb.tension.encId);
  const e = expectedRunF8(w, nb, er);
  const T = tr && tr.kind === 'tension' ? tr.value : NaN;
  return { tr, er, T, Tmodel: e.T, Tmg: e.Tmg, diff: (100 * (T - e.T)) / e.T };
}

/** Energía: v = w/Δt en la fotopuerta, ω = v/r, K = ½ I ω² + ½ m v², U = m g h y balance K/U (%). */
export function expectedEnergyF8(w: F08World, nb: F08Notebook, Itot?: number) {
  const s = setupF8(w, nb);
  const gr = rdF8(w, nb.energy.readingId);
  const tr = rdF8(w, nb.energy.tachId);
  const I = Itot ?? mean(nb.diskRows.map((x) => rowI(w, nb, x)).filter(Number.isFinite));
  const dt = gr && gr.kind === 'gate' ? gr.value : NaN;
  const v = s.wFlag / dt;
  const h = gr?.setup?.z0 !== undefined && gr.setup.gateZ !== undefined ? gr.setup.z0 - gr.setup.gateZ : NaN;
  const rpm = tr && tr.kind === 'tach' ? tr.value : NaN;
  const omega = rpmToRad(rpm);
  const K = rotKE(I, v / s.r) + 0.5 * s.m * v * v;
  const U = s.m * s.g * (h / 100);
  return { gr, tr, h, v, omega, rpm, K, U, bal: (100 * K) / U };
}
