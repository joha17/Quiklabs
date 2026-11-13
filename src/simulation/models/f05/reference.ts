/**
 * Oráculos numéricos de F05 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F05_REFERENCE = {
  /** Madera sobre madera μ_s = 0,45, bloque de 0,500 kg: F_max = 0,45 · 0,500 · 9,81 = 2,207 N (±0,02 N). */
  staticPeak: { m: 0.5, g: 9.81, muS: 0.45, F: 2.207, tol: 0.02 },
  /** Ángulo crítico θ_c = arctan 0,45 = 24,23° (±0,1°). */
  critical: { muS: 0.45, deg: 24.23, tol: 0.1 },
  /** Bajada a 30° con μ_k = 0,30: a = 9,81 (sen 30° − 0,30 cos 30°) = 2,356 m/s². */
  slide: { g: 9.81, deg: 30, muK: 0.3, a: 2.356, tol: 0.005 },
} as const;
