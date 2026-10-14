/**
 * Acople para verter (Prácticas 6 y 10): con el recipiente inclinado, su pico (el borde que queda más bajo) se
 * mantiene sobre la boca del receptor, y el chorro se dibuja desde ese mismo punto. Antes el cuerpo quedaba sobre la
 * boca y, al inclinarlo, el borde se iba 5–10 cm hacia un lado: el chorro caía fuera del receptor aunque el dominio
 * sí vertía dentro. El giro es alrededor del eje de profundidad con pivote en el centro de la base, igual que la vista.
 */

/** Borde de vertido del recipiente: radio y altura sobre la base (cm). */
export interface LipGeo {
  r: number;
  h: number;
}

/** Desplazamiento [dx, dz] del pico respecto del pivote con la inclinación `tiltRad` (borde del lado hacia el que se inclina). */
export function lipOffset(g: LipGeo, tiltRad: number): [number, number] {
  const lx = Math.sign(tiltRad || 1) * g.r;
  const c = Math.cos(tiltRad);
  const s = Math.sin(tiltRad);
  return [lx * c + g.h * s, -lx * s + g.h * c];
}

/** Altura del pico sobre la boca del receptor (cm). */
const LIP_ABOVE_MOUTH_CM = 1;
/** Si la mano se aleja más que esto de la boca (además de su radio), el recipiente se desacopla (cm). */
const RELEASE_CM = 6;

/** Pose del pivote que deja el pico sobre la boca, o null si la mano ya no está sobre el receptor. */
export function pourDockPose(
  g: LipGeo,
  tiltRad: number,
  mouth: { x: number; y: number; z: number; r: number },
  hand: { x: number; y: number },
): { x: number; y: number; z: number } | null {
  if (Math.hypot(hand.x - mouth.x, hand.y - mouth.y) > mouth.r + RELEASE_CM) return null;
  const [dx, dz] = lipOffset(g, tiltRad);
  return { x: mouth.x - dx, y: mouth.y, z: mouth.z + LIP_ABOVE_MOUTH_CM - dz };
}
