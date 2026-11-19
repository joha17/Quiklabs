/**
 * Oráculos numéricos de F103 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F103_REFERENCE = {
  /** v₀ = 8,00 m/s a 45° sobre suelo nivelado, sin aire: R = 6,524 m y T = 1,153 s (error relativo < 0,2 %). */
  level45: { v0: 8, thetaDeg: 45, g: 9.81, R: 6.524, T: 1.153, relTol: 0.002 },
  /** Ángulos complementarios (30° y 60°) dan el mismo alcance a nivel. */
  complementary: { v0: 8, a: 30, b: 60, g: 9.81 },
} as const;
