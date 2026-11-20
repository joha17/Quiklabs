/**
 * Oráculos numéricos de F10 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F10_REFERENCE = {
  /** Viga de 1,00 m y peso 4,00 N apoyada en sus extremos, carga de 2,00 N en el centro ⇒ R_A = R_B = 3,00 N. */
  beam: { L: 1, Wb: 4, W: 2, R: 3, tolPct: 0.1 },
  /** La misma viga con la carga en x = 0,75 m: R_B = (4·0,5 + 2·0,75)/1 = 3,50 N; R_A = 2,50 N. */
  offset: { x: 0.75, RA: 2.5, RB: 3.5, tolPct: 0.1 },
  /** Hooke: F = 300 N, L₀ = 0,50 m, E = 200 GPa, A = 1,00e-4 m² ⇒ ΔL = 7,5e-6 m (< 0,1 %). */
  hooke: { F: 300, L0: 0.5, E: 200e9, A: 1e-4, dL: 7.5e-6, tolPct: 0.1 },
} as const;
