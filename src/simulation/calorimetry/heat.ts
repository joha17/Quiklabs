/**
 * Calorimetría (§1.2, §14–§19): ecuaciones puras del modelo ideal y corregido, calor específico experimental,
 * incertidumbre por propagación y Monte Carlo, detección del máximo, punto de ebullición según la presión,
 * conversión de unidades de energía e identificación de un metal con incertidumbre. Sin estado ni efectos.
 */

/** Calor específico curricular del agua (J·g⁻¹·°C⁻¹). */
export const C_WATER = 4.18;
/** 1 cal termoquímica = 4,184 J (exacto). */
export const CAL_J = 4.184;

/** q = m·c·ΔT (J). */
export const heat = (massG: number, cpJPerGC: number, dT: number) => massG * cpJPerGC * dT;

/** §14.4 — equilibrio ideal de agua y metal sin calorímetro ni pérdidas. */
export function equilibriumIdeal(mw: number, Tw: number, mm: number, cm: number, Tm: number, cw = C_WATER): number {
  return (mw * cw * Tw + mm * cm * Tm) / (mw * cw + mm * cm);
}

/** §14.5 — equilibrio con la capacidad calorífica del calorímetro (que parte a la temperatura del agua). */
export function equilibriumCorrected(mw: number, Tw: number, mm: number, cm: number, Tm: number, Ccal: number, cw = C_WATER): number {
  return (mw * cw * Tw + mm * cm * Tm + Ccal * Tw) / (mw * cw + mm * cm + Ccal);
}

/** §16.3 — calor específico experimental (modelo ideal). */
export function specificHeatIdeal(mw: number, TiW: number, Tf: number, mm: number, TiM: number, cw = C_WATER): number {
  return -(mw * cw * (Tf - TiW)) / (mm * (Tf - TiM));
}

/** §16.3 — calor específico con la corrección del calorímetro. */
export function specificHeatCorrected(mw: number, TiW: number, Tf: number, mm: number, TiM: number, Ccal: number, cw = C_WATER): number {
  return -((mw * cw + Ccal) * (Tf - TiW)) / (mm * (Tf - TiM));
}

export const errorPct = (exp: number, ref: number) => (Math.abs(exp - ref) / ref) * 100;

/** °F → °C. */
export const fToC = (f: number) => ((f - 32) * 5) / 9;

/**
 * §12.4 — temperatura de ebullición del agua a una presión dada (ecuación de Antoine, 1–100 °C; mmHg).
 * 101,325 kPa → 100,0 °C.
 */
export function boilingPointC(pressureKPa: number): number {
  const mmHg = (pressureKPa * 760) / 101.325;
  return 1730.63 / (8.07131 - Math.log10(mmHg)) - 233.426;
}

// ─────────────────────────── Incertidumbre (§17) ───────────────────────────

/** u de una diferencia de dos medidas independientes. */
export const uDiff = (u1: number, u2: number) => Math.hypot(u1, u2);

export interface SpecificHeatInputs {
  mw: number;
  uMw: number;
  mm: number;
  uMm: number;
  TiW: number;
  TiM: number;
  Tf: number;
  uT: number;
  cw?: number;
  uCw?: number;
  Ccal?: number;
}

/** §17.3 — incertidumbre relativa del calor específico (propagación de primer orden, modelo ideal). */
export function uSpecificHeat(x: SpecificHeatInputs): { c: number; u: number } {
  const cw = x.cw ?? C_WATER;
  const c = x.Ccal ? specificHeatCorrected(x.mw, x.TiW, x.Tf, x.mm, x.TiM, x.Ccal, cw) : specificHeatIdeal(x.mw, x.TiW, x.Tf, x.mm, x.TiM, cw);
  const dTw = x.Tf - x.TiW;
  const dTm = x.Tf - x.TiM;
  const uDT = Math.SQRT2 * x.uT;
  const rel = Math.sqrt((x.uMw / x.mw) ** 2 + (x.uMm / x.mm) ** 2 + (uDT / dTw) ** 2 + (uDT / dTm) ** 2 + ((x.uCw ?? 0) / cw) ** 2);
  return { c, u: Math.abs(c) * rel };
}

/** Generador normal reproducible (Box–Muller sobre mulberry32). */
function normalGen(seed: number) {
  let s = seed >>> 0 || 1;
  const u = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967297;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/** §17.4 — Monte Carlo del calor específico: media, desviación y percentiles 2,5 / 97,5. */
export function monteCarloSpecificHeat(x: SpecificHeatInputs, n = 4000, seed = 1) {
  const g = normalGen(seed);
  const cw = x.cw ?? C_WATER;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const mw = x.mw + g() * x.uMw;
    const mm = x.mm + g() * x.uMm;
    const TiW = x.TiW + g() * x.uT;
    const TiM = x.TiM + g() * x.uT;
    const Tf = x.Tf + g() * x.uT;
    const c = x.Ccal ? specificHeatCorrected(mw, TiW, Tf, mm, TiM, x.Ccal, cw) : specificHeatIdeal(mw, TiW, Tf, mm, TiM, cw);
    if (Number.isFinite(c)) out.push(c);
  }
  out.sort((a, b) => a - b);
  const mean = out.reduce((s, v) => s + v, 0) / out.length;
  const sd = Math.sqrt(out.reduce((s, v) => s + (v - mean) ** 2, 0) / (out.length - 1));
  const q = (p: number) => out[Math.min(out.length - 1, Math.max(0, Math.round(p * (out.length - 1))))];
  return { mean, sd, p025: q(0.025), p975: q(0.975), n: out.length };
}

// ─────────────────────────── Identificación (§15.2) ───────────────────────────

export type Compatibility = 'COMPATIBLE' | 'POSSIBLE' | 'UNLIKELY';

export interface Candidate {
  id: string;
  cp: number;
  uCp: number;
}

export function identify(cExp: number, uExp: number, candidates: Candidate[]) {
  const rows = candidates.map((k) => {
    const z = Math.abs(cExp - k.cp) / Math.sqrt(uExp ** 2 + k.uCp ** 2);
    const cls: Compatibility = z <= 1 ? 'COMPATIBLE' : z <= 2 ? 'POSSIBLE' : 'UNLIKELY';
    return { id: k.id, z, cls };
  }).sort((a, b) => a.z - b.z);
  const compatible = rows.filter((r) => r.cls === 'COMPATIBLE');
  return { rows, unique: compatible.length === 1 ? compatible[0].id : null, ambiguous: compatible.length > 1 };
}

// ─────────────────────────── Máximo de temperatura (§9.4) ───────────────────────────

export interface TempSample {
  t: number;
  c: number;
}

export interface PeakResult {
  /** Hubo aumento previo, un máximo y el registro posterior bajó o se estabilizó. */
  valid: boolean;
  peakC: number;
  peakT: number;
  /** Aumento desde el inicio de la serie hasta el máximo. */
  riseC: number;
  reason?: 'TOO_FEW' | 'NO_RISE' | 'STILL_RISING';
}

/** Detecta el máximo medido: exige aumento previo, suficientes muestras y estabilización o descenso posterior. */
export function detectPeak(samples: TempSample[], minRise = 0.3): PeakResult {
  if (samples.length < 6) return { valid: false, peakC: NaN, peakT: NaN, riseC: 0, reason: 'TOO_FEW' };
  let k = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i].c > samples[k].c) k = i;
  const peak = samples[k];
  const rise = peak.c - samples[0].c;
  if (rise < minRise) return { valid: false, peakC: peak.c, peakT: peak.t, riseC: rise, reason: 'NO_RISE' };
  const after = samples.filter((s) => s.t > peak.t);
  const settled = after.length >= 3 && after[after.length - 1].t - peak.t >= 10;
  return { valid: settled, peakC: peak.c, peakT: peak.t, riseC: rise, reason: settled ? undefined : 'STILL_RISING' };
}

// ─────────────────────────── Unidades de energía (§20.7) ───────────────────────────

export type EnergyPerMassUnit = 'J/g' | 'kJ/g' | 'cal/g' | 'kcal/g';

const TO_J: Record<EnergyPerMassUnit, number> = { 'J/g': 1, 'kJ/g': 1000, 'cal/g': CAL_J, 'kcal/g': CAL_J * 1000 };

export const convertEnergyPerMass = (v: number, from: EnergyPerMassUnit, to: EnergyPerMassUnit) => (v * TO_J[from]) / TO_J[to];

// ─────────────────────────── Actividades de aprendizaje (§19) ───────────────────────────

/** §19.2 — calor para calentar un metal desde la temperatura ambiente supuesta. */
export const heatToWarm = (massG: number, cp: number, fromC: number, toC: number) => massG * cp * (toC - fromC);

/** §19.3 — temperatura inicial de un metal a partir del balance ideal. */
export function initialMetalTemp(mw: number, TiW: number, Tf: number, mm: number, cm: number, cw = C_WATER): number {
  return Tf + (mw * cw * (Tf - TiW)) / (mm * cm);
}
