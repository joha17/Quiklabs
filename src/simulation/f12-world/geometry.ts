/**
 * Geometría física de F12 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada). Un único perfil gobierna la física y el dibujo: la escena 3D lee estas mismas medidas.
 *
 * - A (izquierda): depósito colector de 40 × 32 × 30 cm con visor de nivel; la bomba de caudal variable aspira de él y
 *   descarga por el caudalímetro de turbina hacia la junta J1. La tubería corre a 18 cm sobre la mesada.
 * - B: tubo Venturi transparente de 60 cm (entrada Ø 4 cm de 10 cm, cono convergente de 12 cm, garganta Ø 2 cm de 6 cm
 *   y difusor de 32 cm) entre J1 y J2, con la toma 1 en la entrada y la toma 2 en la garganta; dos abrazaderas lo fijan
 *   a sus soportes.
 * - Tramo intercambiable de 30 cm (liso o rugoso) entre J2 y la pieza de la toma 3, que lleva la purga en su punto alto,
 *   y la junta J3.
 * - C: válvula rotativa de seis posiciones y retorno con desviador sobre el vaso volumétrico; el retorno vuelve al
 *   depósito por detrás.
 * - D: panel de tres sensores 0–25 kPa con sus tubos a las tomas y el registrador; regla de cotas junto a la toma 3.
 * - E: vaso volumétrico de 1 L, cronómetro, calibre y pieza de corte del Venturi, caja de juntas, tramo rugoso de
 *   repuesto, sonda de Pitot, tapón de goma y toalla.
 */
export const GEOF12 = {
  /** Eje de la tubería sobre la mesada y profundidad del tramo de ensayo. */
  axisZ: 18,
  pipeY: 26,
  sump: { x: 30, y: 34, w: 40, d: 32, h: 30 },
  pump: { x: 66, y: 32, w: 16, d: 14, h: 14 },
  meter: { x: 88, len: 10 },
  j1: 103,
  /** Venturi: comienzo, largo de cada tramo (entrada, cono, garganta, difusor) y diámetros nominales. */
  venturi: { x0: 106, inlet: 10, conv: 12, throat: 6, diff: 32, wall: 0.3 },
  tapX: { 1: 111, 2: 131, 3: 206 } as Record<1 | 2 | 3, number>,
  j2: 168,
  spool: { x0: 170, L: 30 },
  purgeX: 210,
  j3: 214,
  valve: { x: 228 },
  /** Desviador del retorno sobre el vaso volumétrico. */
  outlet: { x: 252, y: 18, z: 30 },
  beaker: { r: 5.8, h: 17 },
  beakerOutlet: { x: 252, y: 18 },
  beakerBench: { x: 270, y: 14 },
  timer: { x: 286, y: 12 },
  panel: { x: 150, y: 54, w: 50, d: 8, h: 26 },
  ruler: { x: 200, y: 18, h: 40 },
  gaskets: { x: 300, y: 18 },
  spoolRack: { x: 304, y: 44 },
  caliper: { x: 322, y: 40 },
  sample: { x: 324, y: 22 },
  pitot: { x: 312, y: 10 },
  stopper: { x: 290, y: 48 },
  towel: { x: 334, y: 12 },
  /** Sobre-elevación de la toma 3 en el escenario de desnivel (cm). */
  riserCm: 10,
};

export const VENTURI_END = GEOF12.venturi.x0 + GEOF12.venturi.inlet + GEOF12.venturi.conv + GEOF12.venturi.throat + GEOF12.venturi.diff;

/** Diámetro interior nominal del Venturi (cm) en la x de la mesada (D1 fuera de los conos). */
export function venturiD(x: number, D1: number, D2: number): number {
  const v = GEOF12.venturi;
  const a = v.x0 + v.inlet;
  const b = a + v.conv;
  const c = b + v.throat;
  const d = c + v.diff;
  if (x <= a || x >= d) return D1;
  if (x < b) return D1 + ((D2 - D1) * (x - a)) / v.conv;
  if (x <= c) return D2;
  return D2 + ((D1 - D2) * (x - c)) / v.diff;
}
