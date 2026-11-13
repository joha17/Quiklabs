/**
 * Oráculos numéricos de F06 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F06_REFERENCE = {
  /** Resorte: k = 100 N/m y x = 0,10 m ⇒ U_el = 0,5 · 100 · 0,01 = 0,500 J (< 0,5 % ideal). */
  spring: { k: 100, x: 0.1, U: 0.5, tolRel: 0.005 },
  /** Gravitatoria: m = 0,20 kg, h = 0,25 m ⇒ U_g = 0,20 · 9,81 · 0,25 = 0,4905 J (< 0,2 %). */
  grav: { m: 0.2, g: 9.81, h: 0.25, U: 0.4905, tolRel: 0.002 },
} as const;
