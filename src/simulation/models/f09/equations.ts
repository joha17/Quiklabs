/**
 * Ecuaciones de F09 (§3): fuerza centrípeta F_c = m ω² r = 4π² m r / T², rapidez tangencial v = ω r, torque de una
 * fuerza τ = r F sen φ, segunda ley de rotación τ = I α con corrección por roce, momento de inercia de masas puntuales,
 * momento angular L = I ω y energía cinética de rotación ½ I ω².
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** F_c = m ω² r (N). */
export const centripetalForce = (m: number, omega: number, r: number) => (finite(m, omega, r) && m >= 0 ? m * omega * omega * r : NaN);
/** F_c = 4π² m r / T² (N). */
export const centripetalFromPeriod = (m: number, r: number, T: number) => (finite(m, r, T) && T > 0 ? (4 * Math.PI ** 2 * m * r) / (T * T) : NaN);
/** ω = 2π / T (rad/s). */
export const omegaFromPeriod = (T: number) => (finite(T) && T > 0 ? (2 * Math.PI) / T : NaN);
/** v = ω r (m/s). */
export const tangentialSpeed = (omega: number, r: number) => (finite(omega, r) ? omega * r : NaN);

/** τ = r F sen φ, con φ el ángulo entre r⃗ y F⃗ (90° = tangencial). */
export const torqueOf = (r: number, F: number, phiDeg = 90) => (finite(r, F, phiDeg) ? r * F * Math.sin((phiDeg * Math.PI) / 180) : NaN);
/** α con torque neto constante: α = τ / I. */
export const angularAccel = (tau: number, I: number) => (finite(tau, I) && I > 0 ? tau / I : NaN);
/** I inferido de un tirón con corrección de roce: I = τ / (α + |α_c|), con α_c la desaceleración libre. */
export function inertiaFromTorque(tau: number, alpha: number, alphaC = 0): number {
  if (!finite(tau, alpha, alphaC) || alpha + Math.abs(alphaC) <= 0) return NaN;
  return tau / (alpha + Math.abs(alphaC));
}

/** Masa puntual a distancia r: I = m r². */
export const pointI = (m: number, r: number) => (finite(m, r) && m >= 0 ? m * r * r : NaN);
/** L = I ω (kg·m²/s). */
export const angularMomentumOf = (I: number, omega: number) => (finite(I, omega) ? I * omega : NaN);
/** K_rot = ½ I ω² (J). */
export const rotKE = (I: number, omega: number) => (finite(I, omega) && I >= 0 ? 0.5 * I * omega * omega : NaN);
/** ω final al cambiar I sin torque externo: ω₂ = I₁ ω₁ / I₂. */
export const omegaAfter = (I1: number, w1: number, I2: number) => (finite(I1, w1, I2) && I2 > 0 ? (I1 * w1) / I2 : NaN);

/** Discrepancia relativa (%) de a respecto de b. */
export function relDiff(a: number, b: number): number {
  if (!finite(a, b) || b === 0) return NaN;
  return (100 * (a - b)) / b;
}

/** Pendiente por mínimos cuadrados por el origen y = k x (para F_c frente a ω²). */
export function slopeThroughOrigin(xs: number[], ys: number[]): number {
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (!finite(xs[i], ys[i])) continue;
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  return sxx > 0 ? sxy / sxx : NaN;
}
