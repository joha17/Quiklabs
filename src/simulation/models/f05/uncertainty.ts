/**
 * Incertidumbre de F05 (§3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n) y propagación
 * de primer orden para μ = F/N y μ = tan θ.
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));
const RAD = Math.PI / 180;

/** u(μ) de μ = F/N: μ √((u_F/F)² + (u_N/N)²). */
export function uMu(F: number, uF: number, N: number, uN: number): number {
  if (!finite(F, uF, N, uN) || F <= 0 || N <= 0) return NaN;
  return (F / N) * Math.hypot(uF / F, uN / N);
}

/** u(μ) de μ = tan θ: u_θ / cos² θ (u_θ en grados, convertido a radianes). */
export function uTan(thetaDeg: number, uDeg: number): number {
  if (!finite(thetaDeg, uDeg)) return NaN;
  const c = Math.cos(thetaDeg * RAD);
  return c > 0 ? (uDeg * RAD) / (c * c) : NaN;
}
