/**
 * Geometría física de F06 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada). Un único perfil por aparato gobierna la física y el dibujo: la escena 3D lee estas mismas
 * medidas (soporte con su regla, riel con el lanzador, la subida, la parte alta, el freno y el tope, compuertas,
 * medidor de altura, péndulo con su compuerta).
 *
 * El riel de 180 cm va de x = 100 a x = 280 sobre patas de 8 cm. La coordenada del carro s (m) es HORIZONTAL desde la
 * cara trasera del lanzador; la altura del riel sobre el tramo del lanzador es z(s): llano hasta 0,60 m, una subida
 * suave (cosenoidal) de 0,50 m de largo y la parte alta llana a la altura h hasta el tope del extremo (1,78 m).
 */
export const GEOF06 = {
  /** Soporte de 120 cm (estación A): gancho del resorte en el brazo, regla de 1 mm junto al puntero. */
  stand: { x: 30, y: 40, rodY: 48, hookY: 28, hookZ: 118, rodH: 125, baseW: 22, baseD: 22 },
  ruler: { x: 38, y: 28, z0: 40, z1: 116 },
  /** Largo natural del resorte (cm) colgado y en el lanzador. */
  spring: { natCm: 15, launcherNatM: 0.2, coilD: 2.4 },
  hanger: { h: 6, d: 4 },
  massRack: { x: 58, y: 50, w: 30, d: 10, h: 4 },
  balance: { x: 80, y: 46, w: 18, d: 20, h: 6, pan: 7 },
  /** Riel: inicio x = 100, ancho 12 cm centrado en y = 24, cara del riel a 8 cm de la mesada. */
  track: { x0: 100, y: 24, w: 12, z0: 8, len: 1.8, flat1: 0.6, rise: 0.5, end: 1.78, maxH: 0.4, riserS: 1.45 },
  /** Lanzador: placa trasera en s = 0,02 m; el émbolo libre queda en s = 0,22 m. */
  launcher: { back: 0.02, plunger0: 0.22, maxComp: 0.25 },
  /** Carro de 16 cm con bandera de 2,0 cm para las compuertas. */
  cart: { len: 16, w: 9, h: 5, halfM: 0.08, flagW: 2, flagH: 7 },
  /** Tramo de pérdidas (patín de roce y amortiguador magnético) y freno del extremo alto (m de s). */
  loss: { s0: 0.62, s1: 1.3 },
  brake: { s0: 1.52, s1: 1.7 },
  /** Fotopuertas: haz a 3 cm sobre el riel. */
  gate: { beamDz: 3, w: 18, h: 14, s1: 0.5, s2: 1.4, min: 0.3, max: 1.65 },
  /** Tramo del lanzador donde una compuerta tapa el haz del sensor de posición (m de s). */
  posBeam: { s1: 0.4 },
  gauge: { s: 1.25, y: 38 },
  logger: { x: 150, y: 52, w: 18, d: 12, h: 7 },
  /** Péndulo: pivote a 140 cm; oscila a lo largo de x en y = 52; alcance horizontal máximo 36 cm. */
  pend: { x: 306, y: 52, pivotZ: 140, minL: 0.4, maxL: 1.2, reach: 0.36, standX: 330 },
};

const T = GEOF06.track;
/** Centro del carro con el émbolo libre (cara trasera contra el émbolo). */
export const CART_START_S = GEOF06.launcher.plunger0 + GEOF06.cart.halfM;
/** Centro máximo del carro contra el tope del extremo alto. */
export const CART_MAX_S = T.end - GEOF06.cart.halfM;

/** Altura del riel (m sobre el tramo del lanzador) en s para una parte alta a h. */
export function trackZ(s: number, h: number): number {
  if (s <= T.flat1) return 0;
  if (s >= T.flat1 + T.rise) return h;
  const u = (s - T.flat1) / T.rise;
  return (h * (1 - Math.cos(Math.PI * u))) / 2;
}

/** Pendiente dz/ds. */
export function trackSlope(s: number, h: number): number {
  if (s <= T.flat1 || s >= T.flat1 + T.rise) return 0;
  const u = (s - T.flat1) / T.rise;
  return ((h * Math.PI) / (2 * T.rise)) * Math.sin(Math.PI * u);
}

/** Curvatura d²z/ds². */
export function trackCurv(s: number, h: number): number {
  if (s <= T.flat1 || s >= T.flat1 + T.rise) return 0;
  const u = (s - T.flat1) / T.rise;
  return ((h * Math.PI * Math.PI) / (2 * T.rise * T.rise)) * Math.cos(Math.PI * u);
}

/** Punto de la mesada (cm) sobre la cara del riel para s y la altura h. */
export function trackPoint(s: number, h: number, up = 0): { x: number; z: number } {
  return { x: T.x0 + s * 100, z: T.z0 + trackZ(s, h) * 100 + up };
}

/** ¿La compuerta está sobre un tramo llano (abajo para gate1, arriba para gate2)? */
export const onBottomFlat = (s: number) => s <= T.flat1 - 0.02;
export const onTopFlat = (s: number) => s >= T.flat1 + T.rise + 0.02;

/** Amplitud máxima del péndulo para un largo L (°): el alcance horizontal no supera 36 cm. */
export function maxAmplitudeDeg(L: number): number {
  return Math.min(70, (Math.asin(Math.min(1, GEOF06.pend.reach / Math.max(0.01, L))) * 180) / Math.PI);
}
