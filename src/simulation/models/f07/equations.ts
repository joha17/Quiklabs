/**
 * Ecuaciones de F07 (§3): momento lineal p = m v, impulso J = ∫F dt = Δp, conservación de Σp en un sistema aislado,
 * coeficiente de restitución, velocidades finales de un choque elástico y de uno perfectamente inelástico, centro de
 * masa y energía cinética perdida.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** p = m v (kg·m/s). */
export function momentum(m: number, v: number): number {
  if (!finite(m, v) || m < 0) return NaN;
  return m * v;
}

/** J = ∫ F dt por trapecios sobre puntos (t, F) ordenados (N·s). */
export function impulseArea(pts: Array<[number, number]>): number {
  if (pts.length < 2 || !pts.every(([t, F]) => finite(t, F))) return NaN;
  let J = 0;
  for (let i = 0; i + 1 < pts.length; i++) J += ((pts[i][1] + pts[i + 1][1]) / 2) * (pts[i + 1][0] - pts[i][0]);
  return J;
}

/** e = −(v₂f − v₁f) / (v₂i − v₁i): velocidades RELATIVAS de separación y de acercamiento. */
export function restitution(v1i: number, v2i: number, v1f: number, v2f: number): number {
  if (!finite(v1i, v2i, v1f, v2f) || v2i === v1i) return NaN;
  return -(v2f - v1f) / (v2i - v1i);
}

/** Velocidades finales de un choque unidimensional con restitución e (e = 1 elástico, e = 0 se pegan). */
export function finalVelocities(m1: number, m2: number, u1: number, u2: number, e = 1): [number, number] {
  if (!finite(m1, m2, u1, u2, e) || m1 + m2 <= 0) return [NaN, NaN];
  const M = m1 + m2;
  const v1 = (m1 * u1 + m2 * u2 + m2 * e * (u2 - u1)) / M;
  const v2 = (m1 * u1 + m2 * u2 + m1 * e * (u1 - u2)) / M;
  return [v1, v2];
}

/** Perfectamente inelástico: v_f = (m₁ v₁ + m₂ v₂) / (m₁ + m₂). */
export function stickVelocity(m1: number, m2: number, v1: number, v2: number): number {
  if (!finite(m1, m2, v1, v2) || m1 + m2 <= 0) return NaN;
  return (m1 * v1 + m2 * v2) / (m1 + m2);
}

/** x_CM = Σ m x / Σ m. */
export function centerOfMass(ms: number[], xs: number[]): number {
  if (ms.length !== xs.length || !ms.length || !finite(...ms, ...xs)) return NaN;
  const M = ms.reduce((s, x) => s + x, 0);
  return M > 0 ? ms.reduce((s, m, i) => s + m * xs[i], 0) / M : NaN;
}

/** K = ½ m v² (J). */
export function kineticEnergy(m: number, v: number): number {
  if (!finite(m, v) || m < 0) return NaN;
  return 0.5 * m * v * v;
}

/** Fracción de energía cinética perdida (%): 100 (K_i − K_f) / K_i. */
export function keLostPct(Ki: number, Kf: number): number {
  if (!finite(Ki, Kf) || Ki <= 0) return NaN;
  return (100 * (Ki - Kf)) / Ki;
}

/** Velocidad en una fotopuerta con el sentido observado: s · ancho / tiempo (m/s). */
export function gateVelocity(flagW: number, dt: number, dir = 1): number {
  if (!finite(flagW, dt, dir) || dt <= 0) return NaN;
  return (dir >= 0 ? 1 : -1) * (flagW / dt);
}

/** Discrepancia relativa (%) de a respecto de b. */
export function relDiff(a: number, b: number): number {
  if (!finite(a, b) || b === 0) return NaN;
  return (100 * (a - b)) / b;
}

export { linFit } from '../f04/equations';
