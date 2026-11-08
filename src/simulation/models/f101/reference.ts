/**
 * Oráculos numéricos de F101 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al
 * estudiante (que se evalúa con sus propias lecturas).
 */
export const F101_REFERENCE = {
  /** F₁ = (3,00; 0,00) N y F₂ = (0,00; 4,00) N → suma (3,00; 4,00) N, módulo 5,00 N (±0,01 N). */
  perpendicular: { f1: { x: 3, y: 0 }, f2: { x: 0, y: 4 }, sum: { x: 3, y: 4 }, modulus: 5, tolN: 0.01 },
  /** d = 20,0 mm, h = 50,0 mm → V = 1,5708 × 10⁻⁵ m³ = 15,708 cm³ (error relativo de referencia < 0,05 %). */
  cylinder: { dMm: 20.0, hMm: 50.0, volumeM3: 1.5708e-5, volumeCm3: 15.708, relTol: 0.0005 },
} as const;
