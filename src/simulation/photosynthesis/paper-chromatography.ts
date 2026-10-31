/**
 * Cromatografía en papel (§3.4, caso 8.1): frente con ascenso capilar ilustrativo `x = min(L, k√t)`, bandas `x = origen +
 * Rf·(frente − origen)` y Rf siempre desde el ORIGEN de la misma corrida. Dominio puro.
 */
export const frontDistance = (kMmPerSqrtS: number, seconds: number, maxMm: number) => Math.min(maxMm, kMmPerSqrtS * Math.sqrt(Math.max(0, seconds)));
export const rfOf = (bandMm: number, originMm: number, frontMm: number) => (bandMm - originMm) / (frontMm - originMm);
/** u(Rf) ≈ Rf·√[(u/d_banda)² + (u/d_frente)²]: aproximación que ignora la correlación por el origen compartido. */
export function rfUncertainty(bandMm: number, originMm: number, frontMm: number, uMm: number) {
  const db = bandMm - originMm;
  const df = frontMm - originMm;
  return Math.abs(db / df) * Math.sqrt((uMm / db) ** 2 + (uMm / df) ** 2);
}
export const bandAt = (rf: number, originMm: number, frontMm: number) => originMm + rf * (frontMm - originMm);
