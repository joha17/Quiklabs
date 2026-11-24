/**
 * Incertidumbre de F12 (§3): tipo A de las repeticiones y del ajuste, tipo B del instrumento (no se divide entre √n) y
 * propagación de primer orden para Q = V/t, v = Q/A y ρ desde la pendiente Δp–½(v₂² − v₁²).
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(Q) de Q = V/t: Q √((u_V/V)² + (u_t/t)²). */
export function uVolumetric(Q: number, V: number, uV: number, t: number, ut: number): number {
  if (!finite(Q, V, uV, t, ut) || V <= 0 || t <= 0) return NaN;
  return Math.abs(Q) * Math.hypot(uV / V, ut / t);
}

/** u(v) de v = 4Q/(πD²): v √((u_Q/Q)² + (2u_D/D)²). */
export function uVelocity(v: number, Q: number, uQ: number, D: number, uD: number): number {
  if (!finite(v, Q, uQ, D, uD) || Q <= 0 || D <= 0) return NaN;
  return Math.abs(v) * Math.hypot(uQ / Q, (2 * uD) / D);
}

/**
 * Parte tipo B de u(ρ) desde la pendiente: la de la diferencia de dos sensores (√2 u_p) sobre la caída mayor y la del
 * término cinético por el caudalímetro (2u_Q/Q) y el calibre en la garganta (4u_D/D).
 */
export function uRhoSlopeB(rho: number, uP: number, dP: number, uQ: number, Q: number, uD: number, D: number): number {
  if (!finite(rho, uP, dP, uQ, Q, uD, D) || dP <= 0 || Q <= 0 || D <= 0) return NaN;
  return Math.abs(rho) * Math.hypot((Math.SQRT2 * uP) / dP, (2 * uQ) / Q, (4 * uD) / D);
}
