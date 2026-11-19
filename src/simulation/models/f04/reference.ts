/**
 * Oráculos numéricos de F04 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F04_REFERENCE = {
  /** m_c = 0,45 kg, m_h = 0,05 kg: a = 0,981 m/s² y T = 0,44145 N (error relativo < 0,3 % sin fricción). */
  ideal: { mc: 0.45, mh: 0.05, g: 9.81, a: 0.981, T: 0.44145, relTol: 0.003 },
  /** Tercera ley: el sensor A lee +3,00 N y el B −3,00 N en el mismo contacto: |F_A + F_B| < 0,03 N. */
  thirdLaw: { FA: 3.0, FB: -3.0, tol: 0.03 },
} as const;
