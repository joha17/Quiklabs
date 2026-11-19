/**
 * Oráculos numéricos de F09 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F09_REFERENCE = {
  /** Centrípeta: m = 0,20 kg, r = 0,50 m, T = 2,00 s ⇒ F_c = 4π²·0,20·0,50/4 = 0,987 N (< 0,5 %). */
  centripetal: { m: 0.2, r: 0.5, T: 2, F: 0.987, tolPct: 0.5 },
  /** Torque tangencial: F = 2,00 N perpendicular a r = 0,20 m ⇒ τ = 0,400 N·m (< 0,2 %). */
  torque: { F: 2, r: 0.2, tau: 0.4, tolPct: 0.2 },
} as const;
