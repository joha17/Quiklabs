/**
 * Gas ideal y unidades (§1.2, §14.5, §17). `PV = nRT` solo con temperatura absoluta: las funciones que reciben
 * temperatura en kelvin rechazan valores que parecen grados Celsius (< 150 K en condiciones de laboratorio).
 */

/** R en las unidades de la guía y en otras coherentes (CODATA 2018). */
export const R_L_ATM = 0.082057366;
export const R_J = 8.314462618;
/** kPa·L·mol⁻¹·K⁻¹ (numéricamente igual a J·mol⁻¹·K⁻¹). */
export const R_KPA_L = 8.314462618;
/** Valor de referencia de la guía para el error porcentual. */
export const R_REF = 0.082057;

export const MMHG_PER_ATM = 760;
export const KPA_PER_ATM = 101.325;
export const ZERO_C_K = 273.15;

export const toKelvin = (c: number) => c + ZERO_C_K;
export const mmHgToAtm = (mmHg: number) => mmHg / MMHG_PER_ATM;
export const atmToMmHg = (atm: number) => atm * MMHG_PER_ATM;
export const kPaToAtm = (kPa: number) => kPa / KPA_PER_ATM;
export const atmToKPa = (atm: number) => atm * KPA_PER_ATM;

/** Una temperatura en kelvin plausible para el laboratorio (bloquea °C en `PV = nRT`, §14.5). */
export const looksLikeKelvin = (t: number) => Number.isFinite(t) && t > 150 && t < 500;

export class CelsiusInGasLawError extends Error {
  constructor(public t: number) {
    super('TEMPERATURE_NOT_KELVIN');
  }
}

function assertKelvin(tK: number) {
  if (!looksLikeKelvin(tK)) throw new CelsiusInGasLawError(tK);
}

/** Volumen (L) de `n` mol a `pAtm` y `tK`. */
export function idealVolumeL(n: number, pAtm: number, tK: number): number {
  assertKelvin(tK);
  return (n * R_L_ATM * tK) / pAtm;
}

/** Moles de gas ideal. */
export function idealMoles(pAtm: number, vL: number, tK: number, r = R_L_ATM): number {
  assertKelvin(tK);
  return (pAtm * vL) / (r * tK);
}

/** R experimental (§17.2): presión en atm, volumen en L, cantidad en mol, temperatura en K. */
export function rExperimental(pAtm: number, vL: number, n: number, tK: number): number {
  assertKelvin(tK);
  return (pAtm * vL) / (n * tK);
}

/** Error porcentual respecto de un valor de referencia (§17.3). */
export const errorPct = (value: number, ref = R_REF) => (Math.abs(value - ref) / ref) * 100;

/** Estadística de dos o más réplicas (§17.4). */
export function replicateStats(values: number[]) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const relDiffPct = n === 2 && mean !== 0 ? (Math.abs(values[0] - values[1]) / mean) * 100 : null;
  return { n, mean, sd, relDiffPct };
}
