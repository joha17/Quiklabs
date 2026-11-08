/**
 * Incertidumbre de F103 (§3.3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n, F103-E38) y
 * propagación de primer orden para entradas independientes.
 */
import { DEG, rangeWithDrop } from './equations';

export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(v₀) de v₀ = d/Δt: v₀ √((u_d/d)² + (u_t/Δt)²). */
export function uGateSpeed(d: number, ud: number, dt: number, ut: number): number {
  if (!finite(d, ud, dt, ut) || d <= 0 || dt <= 0) return NaN;
  return (d / dt) * Math.hypot(ud / d, ut / dt);
}

/** u(R_pred) por derivadas numéricas respecto de v₀, θ (°) y la caída (m). */
export function uRangePred(v0: number, uv0: number, thetaDeg: number, uTheta: number, drop: number, uDrop: number, g: number): number {
  if (!finite(v0, uv0, thetaDeg, uTheta, drop, uDrop, g)) return NaN;
  const R = (a: number, b: number, c: number) => rangeWithDrop(a, b, c, g);
  const h = 1e-4;
  const dv = (R(v0 + h, thetaDeg, drop) - R(v0 - h, thetaDeg, drop)) / (2 * h);
  const dt = (R(v0, thetaDeg + h, drop) - R(v0, thetaDeg - h, drop)) / (2 * h);
  const dd = (R(v0, thetaDeg, drop + h) - R(v0, thetaDeg, drop - h)) / (2 * h);
  return Math.hypot(dv * uv0, dt * uTheta, dd * uDrop);
}

export { DEG };
