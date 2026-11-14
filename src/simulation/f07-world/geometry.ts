/**
 * Geometría física de F07 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada). Un único perfil gobierna la física y el dibujo: la escena 3D lee estas mismas medidas (riel con
 * sus topes amortiguados y lanzadores, carros con paragolpes y bandera, fotopuertas, nivel, regla de posición, cámara).
 *
 * El riel de 200 cm va de x = 80 a x = 280 sobre patas de 8 cm. La coordenada de cada carro s (m) se mide desde el
 * extremo izquierdo; el centro del carro está a 8 cm de cada cara de paragolpes (los carros se tocan cuando
 * s_B − s_A = 0,16 m).
 */
export const GEOF07 = {
  /** Riel: inicio x = 80, ancho 12 cm centrado en y = 26, cara del riel a 8 cm de la mesada. */
  track: { x0: 80, y: 26, w: 12, z0: 8, len: 2.0 },
  /** Lanzadores de émbolo en los dos extremos (con el tope amortiguado detrás): cara libre del émbolo y compresión
   *  máxima (muescas de 1 cm). El émbolo libre es también el tope del extremo para un carro que vuelve. */
  launcher: { left: 0.06, right: 1.94, maxComp: 0.06, refComp: 0.03 },
  /** Carro de 16 cm (cuerpo de 14 cm y paragolpes de 1 cm) con bandera de 2 o 3 cm para las compuertas. */
  cart: { len: 16, w: 9, h: 5, halfM: 0.08, flagH: 7, flags: [2, 3] },
  /** Fotopuertas: haz a 4 cm sobre el riel. */
  gate: { beamDz: 4, w: 18, h: 14, sA: 0.55, sB: 1.45, min: 0.2, max: 1.8 },
  /** Posición inicial del carro B (blanco) y alcance de la mano al colocarlo. */
  cartB0: 1.0,
  /** Nivel de burbuja en el costado del riel, a mitad del recorrido. */
  level: { s: 1.0, dy: -8 },
  /** Regla de posición delante del riel (estación E) y cámara lateral en su trípode. */
  posRuler: { y: 16 },
  camera: { x: 180, y: 58, z: 30 },
  balance: { x: 300, y: 44, w: 18, d: 20, h: 6, pan: 7 },
  massRack: { x: 300, y: 18, w: 30, d: 10, h: 4 },
  caliper: { x: 326, y: 40 },
  bumperKit: { x: 326, y: 18 },
  logger: { x: 40, y: 48, w: 18, d: 12, h: 7 },
};

const T = GEOF07.track;
const C = GEOF07.cart;
/** Centro del carro A apoyado en el émbolo libre del lanzador izquierdo y del carro B en el derecho. */
export const CART_A_START = GEOF07.launcher.left + C.halfM;
export const CART_B_LAUNCH = GEOF07.launcher.right - C.halfM;
export const CART_MIN_S = CART_A_START;
export const CART_MAX_S = CART_B_LAUNCH;
/** Distancia entre centros con los paragolpes en contacto (m). */
export const CONTACT_D = 2 * C.halfM;

/** Punto de la mesada (cm) sobre la cara del riel para s (la inclinación se dibuja aparte, es menor que 2°). */
export function trackPoint(s: number, up = 0): { x: number; z: number } {
  return { x: T.x0 + s * 100, z: T.z0 + up };
}
