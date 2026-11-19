/**
 * Incertidumbre de F06 (§3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n) y propagación
 * de primer orden para K = ½ m v² con v = d/Δt, U_g = m g h y U_el = ½ k x².
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(K) de K = ½ m v²: K √((u_m/m)² + (2 u_v/v)²). */
export function uKinetic(m: number, um: number, v: number, uv: number): number {
  if (!finite(m, um, v, uv) || m <= 0 || v === 0) return NaN;
  const K = 0.5 * m * v * v;
  return K * Math.hypot(um / m, (2 * uv) / Math.abs(v));
}

/** u(U_el) de ½ k x²: U √((u_k/k)² + (2 u_x/x)²). */
export function uElastic(k: number, uk: number, x: number, ux: number): number {
  if (!finite(k, uk, x, ux) || k <= 0 || x === 0) return NaN;
  const U = 0.5 * k * x * x;
  return U * Math.hypot(uk / k, (2 * ux) / Math.abs(x));
}

/** u(v) de v = d/Δt: v √((u_d/d)² + (u_t/Δt)²). */
export function uSpeed(d: number, ud: number, dt: number, ut: number): number {
  if (!finite(d, ud, dt, ut) || d <= 0 || dt <= 0) return NaN;
  return (d / dt) * Math.hypot(ud / d, ut / dt);
}
