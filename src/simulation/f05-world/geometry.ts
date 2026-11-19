/**
 * Geometría física de F05 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada). Un único perfil por aparato gobierna la física y el dibujo: la escena 3D lee estas mismas
 * medidas (plano, bloque, tope inferior con espuma, pasador superior, tirador con su carril, compuertas, balanza).
 *
 * El plano de 100 × 25 cm gira alrededor de la bisagra de su extremo izquierdo (x = 65). La coordenada a lo largo del
 * plano s (m) vale 0 en la bisagra y 1,00 en el extremo alto; el tirador de husillo va en una ménsula que prolonga el
 * tablero más allá del extremo (s de 1,00 a 1,22), así el cable queda paralelo al tablero a cualquier ángulo.
 */
export const GEOF05 = {
  /** Tablero: bisagra en x = 65 a 7 cm sobre la mesada; 2 cm de espesor; escala grabada en el canto frontal. */
  plane: { hingeX: 65, y: 24, hingeZ: 7, length: 100, w: 25, thick: 2, maxDeg: 45 },
  /** Base con su abrazadera a la mesada y el elevador de tornillo bajo el tablero (a 85 cm de la bisagra). */
  base: { len: 104, w: 30, h: 4, elevatorS: 0.85 },
  /** Bloque de 10 × 6 × 4 cm con gancho al frente (lado del tirador) y bandera de 1,0 cm para las compuertas. */
  block: { len: 10, w: 6, h: 4, halfLenM: 0.05, flagW: 1, flagH: 7, hookZ: 2 },
  /** Tope inferior con almohadilla de espuma: su cara (m de plano). */
  catcher: { s: 0.04 },
  /** Pasador del extremo alto que retiene el bloque antes de soltarlo. */
  pin: { s: 0.88 },
  /** Tirador de husillo: carril del gancho de 22 cm sobre la ménsula; 1 mm por vuelta de manivela. */
  puller: { s0: 1.0, s1: 1.22, mPerTurn: 0.001 },
  /** Altura del gancho del bloque sobre el tablero (cm) y alturas posibles del gancho del tirador (cm). */
  cable: { hookZ: 2, minZ: 0.5, maxZ: 12 },
  /** Fotopuertas: haz a 3 cm sobre el tablero, base de 3 cm. */
  gate: { beamDz: 5, w: 30, h: 14 },
  logger: { x: 215, y: 50, w: 18, d: 12, h: 7 },
  balance: { x: 262, y: 40, w: 18, d: 20, h: 6, pan: 7 },
  /** Estante de lastres (junto a la balanza) y de tiras de revestimiento (a la izquierda del plano). */
  massRack: { x: 296, y: 42, w: 22, d: 10, h: 4 },
  stripRack: { x: 30, y: 46, w: 26, d: 14, h: 3 },
  thermo: { x: 318, y: 56 },
};

const P = GEOF05.plane;
/** Posición de partida del centro del bloque (m) y la del bloque retenido por el pasador. */
export const BLOCK_START_S = 0.25;
export const BLOCK_TOP_S = GEOF05.pin.s - GEOF05.block.halfLenM;
/** Centro mínimo del bloque contra el tope inferior. */
export const BLOCK_MIN_S = GEOF05.catcher.s + GEOF05.block.halfLenM;
/** Largo del cable (m): con el bloque en la partida y el tirador al inicio de su carril queda 5 mm flojo. */
export const CABLE_LEN_M = GEOF05.puller.s0 - (BLOCK_START_S + GEOF05.block.halfLenM) + 0.005;

/** Ángulo del cable respecto del tablero (°) para una altura del gancho del tirador y el bloque en s. */
export function cableAngleDeg(heightCm: number, s: number, pullerS: number): number {
  const d = Math.max(0.05, pullerS - (s + GEOF05.block.halfLenM)) * 100;
  return (Math.atan2(heightCm - GEOF05.cable.hookZ, d) * 180) / Math.PI;
}

/** Punto de la mesada (cm) para una coordenada s del plano a una inclinación θ (°), sobre la cara del tablero. */
export function planePoint(s: number, thetaDeg: number, up = 0): { x: number; z: number } {
  const th = (thetaDeg * Math.PI) / 180;
  const d = s * 100;
  return { x: P.hingeX + d * Math.cos(th) - up * Math.sin(th), z: P.hingeZ + P.thick + d * Math.sin(th) + up * Math.cos(th) };
}
