/**
 * Recorrido visual de la manguera de gas (cm de mesada: x a lo largo, y en profundidad, z arriba). Sale recta de la
 * boquilla de la llave, entra recta en la espiga del mechero (o queda suelta en la mesada) y no atraviesa lo que hay
 * en el camino: pasa por encima de lo bajo y rodea lo alto. Solo es vista: el dominio sigue usando `hosePoints`.
 */
export interface HosePoint {
  x: number;
  y: number;
  z: number;
}

/** Volumen de un objeto de la mesada. */
export interface HoseObstacle {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface HoseEnds {
  /** Principio y fin fijos: los tramos rectos de cada acople. */
  start: HosePoint[];
  end: HosePoint[];
}

export const HOSE_R = 0.55;
/** Hasta esta altura (cm) un objeto se cruza por encima; si es más alto, se rodea. */
const DRAPE_MAX_Z = 6;
const CLEARANCE = HOSE_R + 0.1;
const SMOOTH_PASSES = 4;

function avoid(pts: HosePoint[], obstacles: HoseObstacle[]) {
  for (const b of obstacles) {
    const hit = (p: HosePoint) => p.x > b.x0 - CLEARANCE && p.x < b.x1 + CLEARANCE && p.y > b.y0 - CLEARANCE && p.y < b.y1 + CLEARANCE && p.z - HOSE_R < b.z1 && p.z + HOSE_R > b.z0;
    const inside = pts.filter(hit);
    if (!inside.length) continue;
    if (b.z1 <= DRAPE_MAX_Z) {
      for (const p of inside) p.z = b.z1 + CLEARANCE;
      continue;
    }
    // Todos los puntos salen por la misma cara (la más cercana al tramo), para que no quede un quiebre en medio.
    const mx = inside.reduce((s, p) => s + p.x, 0) / inside.length;
    const my = inside.reduce((s, p) => s + p.y, 0) / inside.length;
    const faces = [
      { d: mx - b.x0, f: (p: HosePoint) => (p.x = b.x0 - CLEARANCE) },
      { d: b.x1 - mx, f: (p: HosePoint) => (p.x = b.x1 + CLEARANCE) },
      { d: my - b.y0, f: (p: HosePoint) => (p.y = b.y0 - CLEARANCE) },
      { d: b.y1 - my, f: (p: HosePoint) => (p.y = b.y1 + CLEARANCE) },
    ];
    const exit = faces.reduce((a, c) => (c.d < a.d ? c : a));
    for (const p of inside) exit.f(p);
  }
}

/** Une los acoples con los puntos intermedios de la curva, esquivando los obstáculos. */
export function routeHose(ends: HoseEnds, mids: HosePoint[], obstacles: HoseObstacle[]): HosePoint[] {
  const free = mids.map((p) => ({ x: p.x, y: p.y, z: Math.max(HOSE_R, p.z) }));
  avoid(free, obstacles);
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const chain = [ends.start[ends.start.length - 1], ...free, ends.end[0]];
    for (let i = 1; i < chain.length - 1; i++) {
      const [a, p, c] = [chain[i - 1], chain[i], chain[i + 1]];
      p.x = (a.x + 2 * p.x + c.x) / 4;
      p.y = (a.y + 2 * p.y + c.y) / 4;
      p.z = Math.max(HOSE_R, (a.z + 2 * p.z + c.z) / 4);
    }
    avoid(free, obstacles);
  }
  return [...ends.start, ...free, ...ends.end];
}
