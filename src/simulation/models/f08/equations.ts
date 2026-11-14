/**
 * Ecuaciones de F08 (§3): momentos de inercia del disco, aro, barra y masas puntuales, teorema de ejes paralelos,
 * segunda ley de rotación τ = I α, aceleración y tensión con una masa colgante, inercia inferida de un ensayo con
 * corrección por roce, cinemática angular, energía cinética de rotación y conversión de rpm.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Disco macizo: I = ½ M R² (kg·m²). */
export const discI = (M: number, R: number) => (finite(M, R) && M >= 0 ? 0.5 * M * R * R : NaN);
/** Aro delgado: I = M R². */
export const ringI = (M: number, R: number) => (finite(M, R) && M >= 0 ? M * R * R : NaN);
/** Barra delgada por su centro: I = M L² / 12. */
export const rodI = (M: number, L: number) => (finite(M, L) && M >= 0 ? (M * L * L) / 12 : NaN);
/** Masa puntual a distancia r: I = m r². */
export const pointI = (m: number, r: number) => (finite(m, r) && m >= 0 ? m * r * r : NaN);
/** Teorema de ejes paralelos: I = I_cm + M d². */
export const parallelAxis = (Icm: number, M: number, d: number) => (finite(Icm, M, d) ? Icm + M * d * d : NaN);

/** α con torque neto constante: α = τ / I. */
export const angularAccel = (tau: number, I: number) => (finite(tau, I) && I > 0 ? tau / I : NaN);

/** Masa colgante m en un tambor de radio r sobre un rotor I con roce τ_f: α = (m g r − τ_f)/(I + m r²). */
export function hangingAlpha(m: number, r: number, I: number, g = 9.81, tauF = 0): number {
  if (!finite(m, r, I, g, tauF) || I + m * r * r <= 0) return NaN;
  return Math.max(0, m * g * r - tauF) / (I + m * r * r);
}

/** Tensión de la cuerda: T = m (g − α r). */
export const tensionOf = (m: number, alpha: number, r: number, g = 9.81) => (finite(m, alpha, r, g) ? m * (g - alpha * r) : NaN);

/** Inercia inferida con corrección de roce: I = T r / (α + |α_c|), con α_c la desaceleración del tramo libre. */
export function inertiaFromRun(T: number, r: number, alpha: number, alphaC = 0): number {
  if (!finite(T, r, alpha, alphaC) || alpha + Math.abs(alphaC) <= 0) return NaN;
  return (T * r) / (alpha + Math.abs(alphaC));
}

/** θ(t) = θ₀ + ω₀ t + ½ α t² y ω(t) = ω₀ + α t. */
export const thetaAt = (t: number, alpha: number, w0 = 0, th0 = 0) => (finite(t, alpha, w0, th0) ? th0 + w0 * t + 0.5 * alpha * t * t : NaN);
export const omegaAt = (t: number, alpha: number, w0 = 0) => (finite(t, alpha, w0) ? w0 + alpha * t : NaN);

/** K_rot = ½ I ω² (J). */
export const rotKE = (I: number, omega: number) => (finite(I, omega) && I >= 0 ? 0.5 * I * omega * omega : NaN);

/** rpm → rad/s. */
export const rpmToRad = (rpm: number) => (finite(rpm) ? (rpm * 2 * Math.PI) / 60 : NaN);

/** Discrepancia relativa (%) de a respecto de b. */
export function relDiff(a: number, b: number): number {
  if (!finite(a, b) || b === 0) return NaN;
  return (100 * (a - b)) / b;
}

export { linFit } from '../f04/equations';
