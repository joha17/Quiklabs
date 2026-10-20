/**
 * Conductividad de disoluciones (§3.4). Unidades internas: κ en S/m, c en mol/m³, λ° en S·m²/mol.
 *   κ_ideal = Σ λ°_j·c_j                    (dilución infinita, `idealInfiniteDilution`)
 *   κ(c) = Σ λ°_j·c_j·f(I)                  (concentración finita; f es un MODELO CURRICULAR, ver abajo)
 *   κ(T) = κ(25 °C)·[1 + α(T − 25)]         (solo 20–30 °C, α por familia de solución)
 * Conversiones exigidas: 1 S/m = 10 mS/cm = 10 000 µS/cm; 1 mol/L = 1000 mol/m³.
 */
import { CHARGE, LAMBDA0, type IonId } from './materials';

export const S_PER_M_TO_MS_PER_CM = 10;
export const S_PER_M_TO_US_PER_CM = 10000;
export const MOL_L_TO_MOL_M3 = 1000;

export const sPerMToMsPerCm = (k: number) => k * S_PER_M_TO_MS_PER_CM;
export const sPerMToUsPerCm = (k: number) => k * S_PER_M_TO_US_PER_CM;
export const msPerCmToSPerM = (k: number) => k / S_PER_M_TO_MS_PER_CM;
export const molLToMolM3 = (c: number) => c * MOL_L_TO_MOL_M3;

/** Concentraciones de iones en mol/L. */
export type IonConcentrations = Partial<Record<IonId, number>>;

/** κ ideal a dilución infinita (S/m). */
export function idealInfiniteDilution(ions: IonConcentrations): number {
  let k = 0;
  for (const [ion, cM] of Object.entries(ions) as Array<[IonId, number]>) k += LAMBDA0[ion] * molLToMolM3(cM ?? 0);
  return k;
}

/** Fuerza iónica I = ½ Σ c_j z_j² (mol/L). */
export function ionicStrength(ions: IonConcentrations): number {
  let s = 0;
  for (const [ion, cM] of Object.entries(ions) as Array<[IonId, number]>) s += (cM ?? 0) * CHARGE[ion] ** 2;
  return s / 2;
}

/**
 * Corrección por concentración finita `[MODELO] [PENDIENTE]`: f(I) = 1 − 0,23·√I, acotada a I ≤ 0,5 mol/L. Es una
 * aproximación tipo Kohlrausch para que la relación κ–c no sea lineal; debe reemplazarse por datos validados (§3.4).
 * La diferencia con el valor ideal es visible en el modo docente y no se penaliza al estudiante (§8.2).
 */
export const CONCENTRATION_MODEL = { k: 0.23, maxIonicStrengthM: 0.5 } as const;

export function concentrationFactor(ions: IonConcentrations): number {
  const I = Math.min(ionicStrength(ions), CONCENTRATION_MODEL.maxIonicStrengthM);
  return Math.max(0.3, 1 - CONCENTRATION_MODEL.k * Math.sqrt(I));
}

export function conductivityAtConcentration(ions: IonConcentrations): number {
  return idealInfiniteDilution(ions) * concentrationFactor(ions);
}

/** Coeficiente térmico α (1/K) del modelo: válido solo en 20–30 °C `[PENDIENTE]`. */
export const TEMP_ALPHA_PER_K = 0.02;
export const TEMP_MODEL_RANGE_C: [number, number] = [20, 30];

export function temperatureFactor(tC: number, alpha = TEMP_ALPHA_PER_K): number {
  const t = Math.max(TEMP_MODEL_RANGE_C[0] - 5, Math.min(TEMP_MODEL_RANGE_C[1] + 5, tC));
  return 1 + alpha * (t - 25);
}

/** κ = K_celda·G (K en m⁻¹, G en S → κ en S/m). Nunca se aplica el factor dos veces (§3.4). */
export const kappaFromConductance = (cellConstantPerM: number, conductanceS: number) => cellConstantPerM * conductanceS;
