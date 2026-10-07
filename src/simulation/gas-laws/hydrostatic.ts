/**
 * Corrección hidrostática con signo (§15). `h = nivel interno de la bureta − nivel externo del beaker`:
 * h > 0 → la presión del gas es menor que la atmosférica; h < 0 → mayor. La ecuación vale en ambos sentidos.
 */
import { MMHG_PER_ATM } from './ideal-gas';

/** Relación de densidades Hg/agua de la guía (modo curricular). */
export const CURRICULAR_DENSITY_RATIO = 13.5;

/** Densidad del agua (kg/m³) en función de la temperatura (Thiesen, 0–40 °C). */
export function waterDensity(tC: number): number {
  return 1000 * (1 - ((tC + 288.9414) / (508929.2 * (tC + 68.12963))) * (tC - 3.9863) ** 2);
}

/** Densidad del mercurio (kg/m³) en función de la temperatura. */
export const mercuryDensity = (tC: number) => 13595.08 / (1 + 1.8e-4 * tC);

/** Relación ρ_Hg/ρ_agua a la temperatura dada (≈ 13,6 a 25 °C; modo avanzado). */
export const densityRatio = (tC: number) => mercuryDensity(tC) / waterDensity(tC);

/** ΔP (mmHg) de una columna de agua de `hMm` mm con la relación de densidades dada. Conserva el signo de h. */
export const hydroMmHg = (hMm: number, ratio = CURRICULAR_DENSITY_RATIO) => hMm / ratio;

/** ΔP (atm) de la columna de agua `hMm` (con signo). */
export const hydroAtm = (hMm: number, ratio = CURRICULAR_DENSITY_RATIO) => hydroMmHg(hMm, ratio) / MMHG_PER_ATM;

/** ΔP físico (Pa) = ρ·g·h, con h en m (con signo). */
export const hydroPa = (hM: number, tC: number) => waterDensity(tC) * 9.80665 * hM;

/** Presión total del gas de la bureta: P_total = P_atm − ΔP_hidro (§15.2). */
export const gasPressureAtm = (pAtmAtm: number, hMm: number, ratio = CURRICULAR_DENSITY_RATIO) => pAtmAtm - hydroAtm(hMm, ratio);

/** Presión seca del CO₂ (§15.4): P_CO₂ = P_atm − ΔP_hidro − P_H₂O (sin aire residual). */
export const dryCo2PressureAtm = (pAtmAtm: number, hMm: number, pH2OAtm: number, ratio = CURRICULAR_DENSITY_RATIO) => gasPressureAtm(pAtmAtm, hMm, ratio) - pH2OAtm;
