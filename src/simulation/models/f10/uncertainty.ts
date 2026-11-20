/**
 * Incertidumbre de F10 (§3): tipo A de las repeticiones, tipo B del instrumento (no se divide entre √n) y propagación
 * de primer orden para R_B = Στ / (x_B − x_A) y E = F L₀ / (A ΔL).
 */
export { mean, sampleStd, typeA, combinedMean, quantize, decimalsOf, uDifference } from '../f101/uncertainty';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** u(E)/E de E = 4 F L₀ / (π d² ΔL): √((u_F/F)² + (u_L/L₀)² + (2 u_d/d)² + (u_ΔL/ΔL)²). */
export function relUYoung(F: number, uF: number, L0: number, uL: number, d: number, ud: number, dL: number, udL: number): number {
  if (!finite(F, uF, L0, uL, d, ud, dL, udL) || F <= 0 || L0 <= 0 || d <= 0 || dL <= 0) return NaN;
  return Math.hypot(uF / F, uL / L0, (2 * ud) / d, udL / dL);
}

/** u(R) de una reacción predicha con brazos medidos con cinta: domina la incertidumbre de los pesos y de las posiciones. */
export function uReactionB(Wb: number, uWb: number, W1: number, uW1: number, armCg: number, armL: number, span: number, ux: number): number {
  if (!finite(Wb, uWb, W1, uW1, armCg, armL, span, ux) || span <= 0) return NaN;
  const R = (Wb * armCg + W1 * armL) / span;
  return Math.hypot((uWb * armCg) / span, (uW1 * armL) / span, ((Wb + W1) * ux) / span, (R * ux * Math.SQRT2) / span);
}
