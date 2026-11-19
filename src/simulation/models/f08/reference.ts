/**
 * Oráculos numéricos de F08 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F08_REFERENCE = {
  /** Disco: M = 0,50 kg, R = 0,10 m ⇒ I = ½·0,50·0,10² = 0,0025 kg·m² (< 0,1 %). */
  disc: { M: 0.5, R: 0.1, I: 0.0025, tolPct: 0.1 },
  /** τ = 0,010 N·m sobre I = 0,0025 kg·m² ⇒ α = 4,00 rad/s²; a los 2,00 s ω = 8,00 rad/s y Δθ = 8,00 rad (< 0,5 %). */
  torque: { tau: 0.01, I: 0.0025, alpha: 4, t: 2, omega: 8, theta: 8, tolPct: 0.5 },
} as const;
