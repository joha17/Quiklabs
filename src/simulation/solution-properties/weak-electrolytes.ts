/**
 * Electrolito débil monoprótico (§3.3, §8.5): HA + H₂O ⇌ H₃O⁺ + A⁻ con balance de materia y de carga.
 *   x = (√(Ka² + 4·Ka·C) − Ka) / 2      [H₃O⁺] ≈ [A⁻] ≈ x
 * Supuestos: solución diluida e ideal, autoionización del agua despreciable. Solución física no negativa.
 */

export function weakAcidIonizedM(ka: number, formalM: number): number {
  if (!(formalM > 0) || !(ka > 0)) return 0;
  return (Math.sqrt(ka * ka + 4 * ka * formalM) - ka) / 2;
}

/** Fracción ionizada α = x/C. */
export const ionizedFraction = (ka: number, formalM: number) => (formalM > 0 ? weakAcidIonizedM(ka, formalM) / formalM : 0);
