/**
 * Geometría física de F103 (cm de la sala, mismas coordenadas que la mesada: x a lo largo, y en profundidad con 0 en el
 * canto frontal de la mesada, z altura con 0 en la cara de la mesada). Un único perfil por aparato gobierna la física y
 * el dibujo: la escena 3D lee estas mismas medidas (soporte, lanzador, plataforma, pantalla, cinta del suelo).
 *
 * La zona de vuelo no cabe en la mesada de 560 × 64 cm: es una ESTACIÓN ESPACIAL INDEPENDIENTE sobre el suelo de la
 * sala, delante de la mesada (§6, ubicación física). La pista mide 8,0 × 1,2 m: empieza en la boca del lanzador
 * (x = −70) y termina en el colchón de impacto del fondo (x = 730). La dinámica se integra en metros con el origen en
 * el suelo: X = x/100, Y = y/100, Z = (z − FLOOR_Z)/100.
 */
export const FLOOR_Z = -88;

export const GEOF103 = {
  /** Pista de vuelo sobre el suelo: eje en y = −95, ancho 120 cm, de la boca (x = −70) al colchón (x = 730). */
  lane: { x0: -70, x1: 730, yc: -95, halfW: 60, backstopX: 730, backstopH: 150 },
  /**
   * Soporte de patas regulables (deck de 60 × 45 cm). La boca del lanzador es también su eje de giro (el punto de
   * lanzamiento no se mueve al cambiar el ángulo) y queda 10 cm sobre el deck.
   */
  stand: { w: 60, d: 45, pivotDz: 10, minCm: 0, maxCm: 100, legSpanCm: 50 },
  /** Lanzador de 60 × 25 cm: cañón de 30 cm detrás de la boca; fotopuerta a 2 cm de la boca. */
  launcher: { len: 60, w: 25, barrel: 30, bore: 1.6, gateDz: 2 },
  /** Plataforma sensora de 40 × 40 × 1 cm (origen de su escala en el borde cercano al lanzador). */
  platform: { size: 40, h: 1 },
  /** Pantalla de impacto: 60 cm de ancho, 150 cm de alto, escala vertical desde el suelo. */
  screen: { w: 60, h: 150, d: 3 },
  /** Cinta métrica del suelo a lo largo del borde de la pista (lado de la mesada). */
  floorTape: { y: -33, len: 800 },
  /** Regla vertical junto a la boca. */
  heightRuler: { dx: 0, dy: 22, h: 150 },
  tray: { w: 20, d: 12, h: 2.5 },
  fan: { x: 300, y: -185, r: 22 },
  barrier: { x: -40, y: -165 },
  timer: { x: 22, y: 9, w: 16, d: 10, h: 6 },
};

/** Posición inicial de la boca (eje de giro) del lanzador sobre la pista (cm). */
export const MUZZLE0 = { x: GEOF103.lane.x0, y: GEOF103.lane.yc };

/** Altura sobre el suelo (m) de una z de la sala (cm). */
export const heightAboveFloor = (zCm: number) => (zCm - FLOOR_Z) / 100;
/** z de la sala (cm) para una altura sobre el suelo (m). */
export const roomZ = (hM: number) => FLOOR_Z + hM * 100;
