/**
 * Geometría física de F102 (cm de mesada salvo que se indique). Un único perfil por aparato gobierna la física y el
 * dibujo: la escena 3D lee estas mismas medidas (carril, carro, bandera, polea, torre, haz de la fotocelda, sensor).
 *
 * El carril corre a lo largo de x con su propia coordenada s (m): s = 0 en la cara del lanzador (x = 162) y crece
 * hacia la polea, que sobresale del extremo izquierdo de la mesada para que la masa cuelgue hasta el suelo.
 */
export const GEOF102 = {
  /** Carril de 150 × 12 cm: cara del lanzador en x = 162, tope final en s = 1,50 m (x = 12), riel a 5 cm. */
  track: { xLauncher: 162, y: 24, railZ: 5, w: 12, length: 150, endS: 1.5, footLauncherX: 156, footFarX: 16, feetSpanCm: 140 },
  /** Carro de 10 × 8 × 4 cm; bandera de 2 cm sobre su centro; gancho del cordel en el frente. */
  cart: { len: 10, w: 8, h: 4, halfLenM: 0.05, wheelR: 1.2, flagH: 6, hookZ: 2.5 },
  /** Émbolo del lanzador: carrera máxima 4 cm; muescas a 1, 2 y 3 cm. */
  launcher: { maxM: 0.04, len: 8 },
  /** Compuertas: haz a 8 cm sobre el riel; base de 3 cm (el borde queda a 1,5 cm del índice). */
  gate: { beamDz: 8, baseHalfCm: 1.5, w: 16, h: 14 },
  /** Polea fuera del borde (x = −1,5): eje a la altura del gancho, radio 2,5 cm. */
  pulley: { x: -1.5, r: 2.5 },
  /** Torre de caída de 160 cm con base de 30 × 24 cm, columna atrás y eje de caída adelante. */
  tower: { x: 262, y: 26, baseW: 30, baseD: 24, baseH: 1, colY: 36, height: 160, padR: 6, padTop: 2.5, beamZ: 6.5, beamHalfCm: 3, sensorZ: 165 },
  /** Filtro cónico: radio 6 cm, alto 3 cm, cada filtro anidado suma 0,3 cm. */
  filter: { r: 6, h: 3, nest: 0.3 },
  tray: { w: 22, d: 14, h: 2.5 },
  massRack: { w: 16, d: 8, h: 6 },
  gateTimer: { w: 12, d: 8, h: 5 },
  tapeTimer: { w: 8, d: 6, h: 5 },
};

/** Posición x de la mesada para una coordenada del carril s (m). */
export const trackX = (s: number) => GEOF102.track.xLauncher - s * 100;
/** Coordenada del carril (m) para una x de la mesada. */
export const trackS = (x: number) => (GEOF102.track.xLauncher - x) / 100;
/** Coordenada s del punto de tangencia del cordel sobre la polea (m). */
export const PULLEY_S = trackS(GEOF102.pulley.x);
/** Posición del centro del carro apoyado en el tope final (m). */
export const CART_END_S = GEOF102.track.endS - GEOF102.cart.halfLenM;
