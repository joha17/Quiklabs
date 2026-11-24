/**
 * Oráculos numéricos de F12 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F12_REFERENCE = {
  /** Q = 0,0010 m³/s, D1 = 0,040 m, D2 = 0,020 m ⇒ v1 = 0,7958 m/s, v2 = 3,1831 m/s (< 0,2 %). */
  velocities: { Q: 0.001, D1: 0.04, D2: 0.02, v1: 0.7958, v2: 3.1831, tolRel: 0.002 },
  /** ρ = 1000 kg/m³, sección horizontal: p1 − p2 = ½ρ(v2² − v1²) = 4749,37 Pa (±10 Pa). La especificación escribe
   *  4774,65 Pa, que no sale de sus propias velocidades (½·1000·(3,1831² − 0,7958²) = 4749,4): ver DECISIONES F12-6. */
  drop: { rho: 1000, dp: 4749.37, specDp: 4774.65, tolPa: 10 },
} as const;
