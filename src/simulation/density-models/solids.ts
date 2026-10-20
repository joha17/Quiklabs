/**
 * Densidad de sólidos (Práctica 1, §3.2): cilindro regular por geometría y sólido irregular por desplazamiento.
 * Unidades declaradas: longitudes en cm, volúmenes geométricos en cm³, volúmenes de líquido en mL, masas en g.
 * Las funciones devuelven NaN ante entradas fuera de dominio (V ≤ 0, d ≤ 0, m < 0), nunca un número engañoso.
 */

const pos = (x: number) => Number.isFinite(x) && x > 0;

/** Volumen de un cilindro (cm³) a partir del diámetro y la altura (cm): V = π (d/2)² h. */
export function cylinderVolumeCm3(dCm: number, hCm: number): number {
  if (!pos(dCm) || !pos(hCm)) return NaN;
  return Math.PI * (dCm / 2) ** 2 * hCm;
}

/** Masa (g) de un cilindro de densidad ρ (g/cm³). */
export function cylinderMassG(dCm: number, hCm: number, rhoGPerCm3: number): number {
  if (!pos(rhoGPerCm3)) return NaN;
  return cylinderVolumeCm3(dCm, hCm) * rhoGPerCm3;
}

/** Volumen desplazado (mL) por una masa m (g) de un material de densidad ρ (g/mL), totalmente sumergido. */
export function displacementMl(massG: number, rhoGPerMl: number): number {
  if (!Number.isFinite(massG) || massG < 0 || !pos(rhoGPerMl)) return NaN;
  return massG / rhoGPerMl;
}

/** Densidad ρ = m / V; NaN si V ≤ 0 o m < 0 (un ΔV negativo es un error físico, no una densidad). */
export function density(massG: number, volume: number): number {
  if (!Number.isFinite(massG) || massG < 0 || !pos(volume)) return NaN;
  return massG / volume;
}

/** Error porcentual en magnitud: 100 |x − ref| / ref (ref > 0). */
export function errorPctAbs(x: number, ref: number): number {
  if (!Number.isFinite(x) || !pos(ref)) return NaN;
  return (100 * Math.abs(x - ref)) / ref;
}

/** Error relativo con signo (x − ref) / ref: explica la dirección del sesgo. */
export function errorRelSigned(x: number, ref: number): number {
  if (!Number.isFinite(x) || !pos(ref)) return NaN;
  return (x - ref) / ref;
}
