/**
 * Incertidumbre de F07 (§3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n) y propagación
 * de primer orden para v = d/Δt, p = m v y e = −Δv_f/Δv_i.
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(v) de v = d/Δt: |v| √((u_d/d)² + (u_t/Δt)²). */
export function uSpeed(d: number, ud: number, dt: number, ut: number): number {
  if (!finite(d, ud, dt, ut) || d <= 0 || dt <= 0) return NaN;
  return (d / dt) * Math.hypot(ud / d, ut / dt);
}

/** u(p) de p = m v: |p| √((u_m/m)² + (u_v/v)²). */
export function uMomentum(m: number, um: number, v: number, uv: number): number {
  if (!finite(m, um, v, uv) || m <= 0 || v === 0) return NaN;
  return Math.abs(m * v) * Math.hypot(um / m, uv / v);
}
