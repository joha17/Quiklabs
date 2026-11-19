/**
 * Oráculos numéricos de F07 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F07_REFERENCE = {
  /** Elástico: m₁ = 0,20 kg, m₂ = 0,30 kg, u₁ = 1,00 m/s, u₂ = 0 ⇒ v₁ = −0,20 m/s, v₂ = 0,80 m/s, |Δp| < 0,001. */
  elastic: { m1: 0.2, m2: 0.3, u1: 1, u2: 0, v1: -0.2, v2: 0.8, dpTol: 0.001 },
  /** Impulso sobre el carro 1: J₁ = m₁ (v₁ − u₁) = −0,240 N·s ± 0,003. */
  impulse: { J1: -0.24, tol: 0.003 },
} as const;
