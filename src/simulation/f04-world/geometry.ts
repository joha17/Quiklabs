/**
 * Geometría física de F04 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada; el suelo está en z = −88). Un único perfil por aparato gobierna la física y el dibujo: la escena
 * 3D lee estas mismas medidas (carril, carro, polea, portapesas, freno, tope, compuertas, balanza y pista de la pareja).
 *
 * El carril de 160 cm corre a lo largo de la mesada: su extremo de liberación (s = 0) está en x = 166 y la polea queda
 * fuera del borde izquierdo (x = −1,5), de modo que el portapesas cuelga libre hasta el suelo. La coordenada del carril
 * s (m) crece hacia la polea: x = 166 − 100 s.
 */
export const FLOOR_Z = -88;

export const GEOF04 = {
  /** Carril nivelable de 160 × 12 cm: cara superior del riel a 5 cm; patas con tornillo de nivel en el extremo de liberación. */
  track: { xRelease: 166, y: 22, railZ: 5, w: 12, length: 160, footReleaseX: 160, footFarX: 12 },
  /** Carro de 16 × 10 × 5 cm (cuerpo 400 g) con bandera de 1,0 cm sobre su centro y gancho del sensor A en el frente. */
  cart: { len: 16, w: 10, h: 5, halfLenM: 0.08, wheelR: 1.4, flagH: 9, flagW: 1, hookZ: 3 },
  /** Pestillo de liberación sin impulso en el extremo de liberación. */
  latch: { s: 0.02 },
  /** Tope con amortiguador: posición de su cara (m de carril); el centro del carro llega hasta `stopS − halfLen`. */
  stop: { s: 1.54 },
  /** Freno magnético (corrientes de Foucault): zona de 30 cm que termina 12 cm antes del tope por defecto. */
  brake: { len: 0.3, gapToStop: 0.12 },
  /** Polea Ø 5 cm fuera del borde: eje a 5,5 cm sobre la mesada, el cordel sale horizontal por su parte superior. */
  pulley: { x: -1.5, r: 2.5, axisZ: 5.5 },
  /** Portapesas: gancho y platillo de 7 cm de alto. */
  hanger: { h: 7, r: 1.6 },
  /** Fotopuertas: haz a 9 cm sobre el riel, base de 3 cm. */
  gate: { beamDz: 9, baseHalfCm: 1.5, w: 16, h: 16 },
  /** Interfaz de adquisición (registrador) y balanza de 1 g sobre la mesada. */
  logger: { x: 205, y: 48, w: 18, d: 12, h: 7 },
  balance: { x: 238, y: 42, w: 18, d: 20, h: 6, pan: 7 },
  massRack: { x: 40, y: 50, w: 20, d: 8, h: 6 },
  /** Pista corta de la pareja de carros (estación D): 90 cm, de x = 252 a 342. */
  pairTrack: { x0: 252, x1: 342, y: 24, railZ: 3, w: 10 },
  pairCart: { len: 12, w: 8, h: 5, bumper: 1.5 },
};

/** Posición x de la mesada para una coordenada del carril s (m). */
export const trackX = (s: number) => GEOF04.track.xRelease - s * 100;
/** Coordenada del carril (m) para una x de la mesada. */
export const trackS = (x: number) => (GEOF04.track.xRelease - x) / 100;
/** s del punto donde el cordel deja el carril y toca la polea (su vertical) (m). */
export const PULLEY_S = trackS(GEOF04.pulley.x);
/** Centro de partida del carro retenido por el pestillo (m). */
export const CART_START_S = GEOF04.latch.s + GEOF04.cart.halfLenM;
/** Altura (cm) del cordel horizontal: cara superior de la polea. */
export const STRING_Z = GEOF04.pulley.axisZ + GEOF04.pulley.r;
/** Profundidad (m bajo el cordel horizontal) a la que la base del portapesas toca el suelo. */
export const FLOOR_DEPTH = (STRING_Z - FLOOR_Z - GEOF04.hanger.h) / 100;
/** Largo libre del cordel (m): con el carro en la partida el gancho queda 12 cm bajo la polea. */
export const STRING_FREE_M = 0.12 + PULLEY_S - (CART_START_S + GEOF04.cart.halfLenM);
/** x (m de la pista de la pareja) del contacto en reposo: los parachoques apenas se tocan. */
export const PAIR_TOUCH_M = (GEOF04.pairCart.len + 2 * GEOF04.pairCart.bumper) / 100;
