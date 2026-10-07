/**
 * Actividades de aprendizaje resueltas por el motor (§25): Charles, Boyle y gas ideal, siempre en kelvin.
 */
import { R_REF, toKelvin } from './ideal-gas';

/** Ley de Charles: V₂ = V₁·T₂/T₁ (temperaturas en °C, convertidas a K). */
export const charlesV2 = (v1: number, t1C: number, t2C: number) => (v1 * toKelvin(t2C)) / toKelvin(t1C);

/** Ley de Boyle: V₂ = P₁·V₁/P₂. */
export const boyleV2 = (p1: number, v1: number, p2: number) => (p1 * v1) / p2;

/** Moles de gas ideal: n = P·V/(R·T) con P en atm, V en L y T en °C (convertida a K). */
export const idealN = (pAtm: number, vL: number, tC: number, r = R_REF) => (pAtm * vL) / (r * toKelvin(tC));

export const ACTIVITIES = {
  charles: { v1L: 36.4, t1C: 25, t2C: 88 },
  boyle: { p1Atm: 0.97, v1Ml: 725, p2Atm: 0.541 },
  ideal: { pAtm: 4.7, vL: 2.3, tC: 32 },
} as const;

export function activityAnswers() {
  const a = ACTIVITIES;
  return {
    charlesV2L: charlesV2(a.charles.v1L, a.charles.t1C, a.charles.t2C),
    boyleV2Ml: boyleV2(a.boyle.p1Atm, a.boyle.v1Ml, a.boyle.p2Atm),
    idealNMol: idealN(a.ideal.pAtm, a.ideal.vL, a.ideal.tC),
  };
}
