/**
 * Incertidumbre de F08 (§3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n) y propagación
 * de primer orden para I = T r / α.
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(I) de I = T r / α: |I| √((u_T/T)² + (u_r/r)² + (u_α/α)²). */
export function uInertia(T: number, uT: number, r: number, ur: number, alpha: number, ua: number): number {
  if (!finite(T, uT, r, ur, alpha, ua) || T <= 0 || r <= 0 || alpha <= 0) return NaN;
  return ((T * r) / alpha) * Math.hypot(uT / T, ur / r, ua / alpha);
}
