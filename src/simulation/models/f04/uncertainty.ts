/**
 * Incertidumbre de F04 (§3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n, F04-E38) y
 * propagación de primer orden para entradas independientes.
 */
import { idealAccel } from './equations';

export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(v) de v = w/Δt: v √((u_w/w)² + (u_t/Δt)²). */
export function uGateSpeed(w: number, uw: number, dt: number, ut: number): number {
  if (!finite(w, uw, dt, ut) || w <= 0 || dt <= 0) return NaN;
  return (w / dt) * Math.hypot(uw / w, ut / dt);
}

/** u(a_pred) de a = m_h g/(m_c + m_h) por derivadas parciales respecto de las dos masas. */
export function uIdealAccel(mc: number, umc: number, mh: number, umh: number, g: number): number {
  if (!finite(mc, umc, mh, umh, g)) return NaN;
  const M = mc + mh;
  if (M <= 0) return NaN;
  const da_dmh = (g * mc) / (M * M);
  const da_dmc = (-g * mh) / (M * M);
  return Math.hypot(da_dmh * umh, da_dmc * umc);
}

export { idealAccel };
