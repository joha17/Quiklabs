/**
 * §9 — Resultados de referencia. Sirven para pruebas y retroalimentación, NO para forzar cifras.
 */
export const EXPECTED = {
  filtrateBeforeSplitMl: [10.8, 11.6],
  carbonDryRecoverableG: [0.36, 0.41],
  kno3InWholeFiltrateG: [1.95, 2.06],
  kno3FromAliquotEvaporationG: [0.32, 0.38],
  kno3CrystallizedFromRestG: [0.3, 0.55],
  purityEvaporation: [0.97, 0.99],
  purityCrystallization: [0.98, 0.995],
} as const;

export type ExpectedKey = keyof typeof EXPECTED;

export function inRange(key: ExpectedKey, v: number): boolean {
  const [a, b] = EXPECTED[key];
  return v >= a && v <= b;
}
