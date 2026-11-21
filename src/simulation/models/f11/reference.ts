/**
 * Oráculos numéricos de F11 (§8). Son casos de PRUEBA UNITARIA, no las respuestas con que se califica al estudiante.
 */
export const F11_REFERENCE = {
  /** Presión relativa: agua ρ = 1000 kg/m³, h = 0,40 m ⇒ p = ρ g h = 3924 Pa (±15 Pa). */
  pressure: { rho: 1000, g: 9.81, h: 0.4, p: 3924, tolPa: 15 },
  /** Empuje: bloque totalmente sumergido V = 5×10⁻⁴ m³ ⇒ F_b = 1000·9,81·0,0005 = 4,905 N (±0,01 N). */
  buoyancy: { rho: 1000, g: 9.81, V: 5e-4, Fb: 4.905, tolN: 0.01 },
} as const;
