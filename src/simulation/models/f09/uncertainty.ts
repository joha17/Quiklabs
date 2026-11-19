/**
 * Incertidumbre de F09 (§3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n) y propagación
 * de primer orden para F_c = 4π² m r / T², I = τ / α y L = I ω.
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(F_c) relativa de 4π² m r / T²: √((u_m/m)² + (u_r/r)² + (2 u_T/T)²). */
export function relUCentripetal(m: number, um: number, r: number, ur: number, T: number, uT: number): number {
  if (!finite(m, um, r, ur, T, uT) || m <= 0 || r <= 0 || T <= 0) return NaN;
  return Math.hypot(um / m, ur / r, (2 * uT) / T);
}

/** u(I) de I = τ / α con τ = r F: |I| √((u_r/r)² + (u_F/F)² + (u_α/α)²). */
export function uInertia(r: number, ur: number, F: number, uF: number, alpha: number, ua: number): number {
  if (!finite(r, ur, F, uF, alpha, ua) || r <= 0 || F <= 0 || alpha <= 0) return NaN;
  return ((r * F) / alpha) * Math.hypot(ur / r, uF / F, ua / alpha);
}
