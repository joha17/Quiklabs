/**
 * Protección visual durante la combustión del Mg (§13.1, §26, §28.5-6): la luz se ve muy intensa en relación con la
 * sala, pero la exposición de la cámara baja y la intensidad está acotada; con «reducir movimiento» no hay
 * parpadeo. Nunca se produce un destello real capaz de incomodar a la persona usuaria.
 */
export interface MgViewState {
  burning: boolean;
  shielded: boolean;
  reduced: boolean;
}

/** Exposición del tono de la cámara (1,05 normal). */
export function mgExposure(s: MgViewState): number {
  if (!s.burning) return 1.05;
  return s.reduced ? 0.6 : 0.72;
}

/** Intensidad máxima de la luz puntual de la cinta (unidades de la escena) y su parpadeo. */
export const MG_LIGHT_MAX = 2700;

export function mgLightIntensity(s: MgViewState, t: number): number {
  if (!s.burning) return 0;
  const base = s.reduced ? 1500 : 2200 + 500 * Math.sin(t * 40);
  return Math.min(MG_LIGHT_MAX, base) * (s.shielded ? 0.45 : 1);
}
