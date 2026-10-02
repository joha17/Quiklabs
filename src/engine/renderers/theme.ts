/** Paleta y tamaños del arte procedural (§3.5). Sustituible sin tocar el dominio. */
export const THEME = {
  background: 0xe9eef3,
  wall: 0xdfe6ec,
  wallTile: 0xd3dbe3,
  benchTop: 0x4a5560,
  benchTopLight: 0x56626e,
  benchEdge: 0x343c44,
  benchFront: 0x2b3238,
  stationLine: 0x6b7784,
  glass: 0xdfefff,
  glassEdge: 0x7f9bb3,
  glassHighlight: 0xffffff,
  porcelain: 0xf6f3ec,
  porcelainEdge: 0xb8b1a3,
  metal: 0x9aa4ad,
  metalDark: 0x5d666f,
  plastic: 0xf2f4f6,
  plasticBlue: 0x2f7fd1,
  wood: 0xb68b5e,
  water: 0xbfe0ff,
  waterEdge: 0x7fb4e0,
  selection: 0xffb000,
  hover: 0x5aa9ff,
  snapOk: 0x2ecc71,
  danger: 0xe0453a,
  warning: 0xf5a623,
  text: 0x1d2329,
  label: 0xfffdf3,
  steam: 0xffffff,
  shadow: 0x000000,
} as const;

/** Píxeles por cm con zoom 1. */
export const PX_PER_CM = 7;
/** Proyección a ~30°: la profundidad se acorta por sen(30°) y la altura por cos(30°). */
export const DEPTH_FACTOR = 0.5;
export const HEIGHT_FACTOR = 0.87;
/** Relación de aspecto de las elipses de bocas/superficies vistas a 30°. */
export const ELLIPSE_RATIO = 0.42;

export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
