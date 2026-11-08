/**
 * Oráculos numéricos de F102 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al
 * estudiante (que se evalúa con sus propias lecturas).
 */
export const F102_REFERENCE = {
  /** MRUA desde el reposo: a = 1,50 m/s², t = 2,00 s → x = 3,00 m y v = 3,00 m/s (error relativo < 0,2 %). */
  mrua: { a: 1.5, t: 2, x: 3, v: 3, relTol: 0.002 },
  /** Caída libre: h = 1,25 m, g = 9,81 m/s² → t = 0,5048 s (±0,002 s). */
  freeFall: { h: 1.25, g: 9.81, t: 0.5048, tolS: 0.002 },
} as const;
