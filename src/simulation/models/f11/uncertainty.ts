/**
 * Incertidumbre de F11 (§3): tipo A de las repeticiones y del ajuste, tipo B del instrumento (no se divide entre √n) y
 * propagación de primer orden para ρ = m / V y para ρ desde la pendiente p–h.
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(ρ) de ρ = m / V: ρ √((u_m/m)² + (u_V/V)²). */
export function uDensity(rho: number, m: number, um: number, V: number, uV: number): number {
  if (!finite(rho, m, um, V, uV) || m <= 0 || V <= 0) return NaN;
  return Math.abs(rho) * Math.hypot(um / m, uV / V);
}

/**
 * Parte tipo B de u(ρ) desde la pendiente p–h: la resolución de la sonda (Pa) y la de la regla (m) sobre el tramo
 * recorrido: ρ √((√2 u_p / Δp)² + (√2 u_h / Δh)²).
 */
export function uRhoSlopeB(rho: number, uP: number, dP: number, uH: number, dH: number): number {
  if (!finite(rho, uP, dP, uH, dH) || dP <= 0 || dH <= 0) return NaN;
  return Math.abs(rho) * Math.hypot((Math.SQRT2 * uP) / dP, (Math.SQRT2 * uH) / dH);
}
