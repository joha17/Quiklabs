/**
 * Geometría física de F11 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada). Un único perfil gobierna la física y el dibujo: la escena 3D lee estas mismas medidas.
 *
 * - A (izquierda): tanque transparente de 60 × 35 × 45 cm interiores (fondo a 1 cm de la mesada) con la escala de nivel
 *   impresa en la pared frontal, el grifo de agua detrás, la llave de vaciado abajo a la derecha con su manguera al
 *   balde de residuos y el agitador en la esquina trasera derecha. A su derecha, el depósito de salmuera con su bomba.
 * - B: puente-guía que corre sobre los bordes del tanque con la sonda hidrostática en una varilla vertical y su regla
 *   de 1 mm; porta-sonda con el puerto de calibración y el registrador detrás.
 * - C: estante de objetos (bloque de 10 × 10 × 5 cm, botella lastrable de Ø 6 × 15 cm y bloque de aluminio) con la caja
 *   de lastres.
 * - D: balanza de 0–2 kg, probeta de 250 mL y vaso de rebose de Ø 16 cm con su pico a 12 cm y el colector.
 * - E: soporte con brazo de altura regulable, dinamómetro de 0–20 N y guía de inmersión sobre el vaso de rebose.
 */
export const GEOF11 = {
  /** Tanque: esquina interior izquierda-frontal (x0, y0), medidas interiores, fondo y espesor de pared. */
  tank: { x0: 21, y0: 15, L: 60, W: 35, H: 45, floorZ: 1, wall: 1 },
  /** Escala de nivel en la pared frontal (x local). */
  scaleX: 3,
  /** Puente-guía: y de la sonda y altura del carro sobre el borde. */
  guide: { y: 26, carriageH: 4, rodLen: 56 },
  tap: { x: 77, y: 56, z: 62 },
  reservoir: { x: 100, y: 46, w: 24, d: 20, h: 40 },
  drain: { x: 82.5, y: 20, z: 3 },
  waste: { x: 94, y: 10, r: 9, h: 22 },
  agitator: { lx: 54, y: 45 },
  holder: { x: 118, y: 16 },
  logger: { x: 124, y: 50, w: 18, d: 12, h: 7 },
  towel: { x: 136, y: 10 },
  rack: { x: 168, y: 14, w: 44, d: 14, h: 8 },
  ballast: { x: 196, y: 12 },
  balance: { x: 216, y: 22, w: 20, d: 22, h: 6 },
  cylinder: { x: 236, y: 16, r: 2.6, h: 30 },
  can: { x: 278, y: 32, r: 8, h: 15 },
  catchRack: { x: 300, y: 14 },
  catchSpout: { x: 291, y: 32 },
  stand: { x: 262, y: 48, armZ: 70, dynLen: 20, hook: 4 },
};

/** Punto de la mesada (cm) de un punto del tanque en su coordenada local (x local, z sobre el fondo). */
export function tankPoint(lx: number, lz: number, y: number = GEOF11.tank.y0 + GEOF11.tank.W / 2): { x: number; y: number; z: number } {
  return { x: GEOF11.tank.x0 + lx, y, z: GEOF11.tank.floorZ + lz };
}

/** x local del tanque desde la x de la mesada. */
export const tankLocalX = (x: number) => x - GEOF11.tank.x0;
