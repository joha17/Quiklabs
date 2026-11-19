/**
 * Geometría física de F08 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada; bajo la mesada z es negativa y el piso está en z = −88). Un único perfil gobierna la física y el
 * dibujo: la escena 3D lee estas mismas medidas.
 *
 * El soporte giratorio está centrado en AX = (130, 32): base de 60 × 60 cm con transportador impreso, columna con el
 * tambor escalonado (radios de 1,5, 2 y 3 cm) a 6 cm de altura y la plataforma de Ø 20 cm a 12–13 cm, donde apoyan los
 * sólidos. La cuerda sale del tambor hacia el frente (−y) en horizontal, pasa por la polea fijada al canto (y = −2) y
 * baja hasta la masa colgante, que cae junto a la columna de caída con su tope blando y su fotopuerta.
 */
export const GEOF08 = {
  axis: { x: 130, y: 32 },
  base: { w: 60, d: 60, h: 1.5 },
  /** Guarda cilíndrica con puerta frontal (radio 31 cm, alto 22 cm). */
  guard: { r: 31, h: 22 },
  drum: { z: 6, h: 1.2 },
  table: { r: 10, z: 12, h: 1 },
  /** Polea en el canto frontal: centro a la altura del tambor; la cuerda baja por su cara delantera. */
  pulley: { y: -2, r: 2.5, dist: 0.34 },
  /** Columna de caída: varilla junto a la masa, piso, largo de cuerda (la base de la masa llegaría a −92 cm con la
   *  cuerda desenrollada del todo, así que sin tope la masa golpea el piso en −88). */
  column: { dx: 8, floor: -88, zFull: -92, zMin: -84, zMax: -20, zTop: -8 },
  mass: { h: 4, r: 1.6, flag: 1 },
  /** Bandeja de sólidos, estante de pesas, balanza, calibre y registrador. */
  rack: { x: 220, y: 34, w: 76, d: 46 },
  slots: { disc01: { x: 200, y: 44 }, ring01: { x: 236, y: 44 }, bar01: { x: 220, y: 20 } },
  massRack: { x: 300, y: 16, w: 30, d: 10, h: 4 },
  balance: { x: 302, y: 44, w: 18, d: 20, h: 6, pan: 7 },
  caliper: { x: 328, y: 40 },
  tach: { x: 172, y: 10, h: 18 },
  logger: { x: 72, y: 48, w: 18, d: 12, h: 7 },
};

const AX = GEOF08.axis;
/** Punto de la mesada (cm) a una distancia radial r (m) del eje con el ángulo θ (rad) del rotor. */
export function rotorPoint(rM: number, theta: number, z = GEOF08.table.z + GEOF08.table.h): { x: number; y: number; z: number } {
  return { x: AX.x + Math.cos(theta) * rM * 100, y: AX.y + Math.sin(theta) * rM * 100, z };
}

/** Alto de arranque de la base de la masa (cm) para n vueltas en el escalón de radio r (m). */
export const massStartZ = (rM: number, turns: number) => GEOF08.column.zFull + 2 * Math.PI * rM * turns * 100;

/** Vueltas máximas para que la masa quede por debajo de la polea. */
export const maxTurns = (rM: number) => Math.floor(((GEOF08.column.zTop - GEOF08.column.zFull) / (2 * Math.PI * rM * 100)) * 10) / 10;
