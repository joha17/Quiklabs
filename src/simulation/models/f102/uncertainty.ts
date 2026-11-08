/**
 * Incertidumbre de F102 (§3.3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n, F102-E38)
 * y propagación de primer orden para entradas independientes.
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(g) de g = 2h/t²: g √((u_h/h)² + (2 u_t/t)²). */
export function uGFromFall(h: number, uh: number, t: number, ut: number): number {
  if (!finite(h, uh, t, ut) || h <= 0 || t <= 0) return NaN;
  return ((2 * h) / (t * t)) * Math.hypot(uh / h, (2 * ut) / t);
}

/** u(v) de v = w/Δt: v √((u_w/w)² + (u_t/Δt)²). */
export function uGateVelocity(w: number, uw: number, dt: number, ut: number): number {
  if (!finite(w, uw, dt, ut) || w <= 0 || dt <= 0) return NaN;
  return (w / dt) * Math.hypot(uw / w, ut / dt);
}

/** u(v̄) de v̄ = d/t: v̄ √((u_d/d)² + (u_t/t)²). */
export function uMeanVelocity(d: number, ud: number, t: number, ut: number): number {
  if (!finite(d, ud, t, ut) || d <= 0 || t <= 0) return NaN;
  return (d / t) * Math.hypot(ud / d, ut / t);
}

/** u(a_pred) de a = m g/(M + m): derivadas parciales respecto de m y M (g sin incertidumbre). */
export function uAtwood(M: number, uM: number, m: number, um: number, g: number): number {
  if (!finite(M, uM, m, um, g) || M <= 0 || m <= 0) return NaN;
  const s = M + m;
  return g * Math.hypot((M / (s * s)) * um, (m / (s * s)) * uM);
}
