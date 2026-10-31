/**
 * Lo que la capa de interacción necesita de la vista (3D u otra): proyección del puntero sobre la mesada,
 * selección por rayo y navegación de cámara. El controlador trabaja en cm de mesada (x, y, z) y nunca
 * conoce Three.js.
 */
/**
 * Límites de la mesada para lo que se mueve con la mano (cm): la pared queda en y = 66,5 y el borde frontal en y = 0.
 * Sin ellos, el rayo del puntero sigue más allá de la pared y el objeto se pierde detrás de ella.
 */
const REACH = { xMin: -8, xMax: 631, yMin: 3, yMax: 61 } as const;

/** Campana de extracción: sus laterales llegan hasta la mesada desde la pared. */
export const HOOD = { x0: 352, x1: 552, sideW: 4, sideD: 14 } as const;
const WALL_Y = 66.5;

/** Lo que forma parte de la sala y descansa en la mesada (cm): los laterales de la campana y el grifo del fregadero. */
export const ROOM_SOLIDS = [
  { x0: HOOD.x0 - HOOD.sideW, x1: HOOD.x0, y0: WALL_Y - HOOD.sideD, y1: WALL_Y },
  { x0: HOOD.x1, x1: HOOD.x1 + HOOD.sideW, y0: WALL_Y - HOOD.sideD, y1: WALL_Y },
  { x0: 599, x1: 601, y0: 59, y1: 61 },
] as const;

const ORIGIN_MARGIN = 0.6;

export function clampToBench(x: number, y: number): { x: number; y: number } {
  let px = Math.max(REACH.xMin, Math.min(REACH.xMax, x));
  let py = Math.max(REACH.yMin, Math.min(REACH.yMax, y));
  for (const s of ROOM_SOLIDS) {
    const left = px - (s.x0 - ORIGIN_MARGIN);
    const right = s.x1 + ORIGIN_MARGIN - px;
    const front = py - (s.y0 - ORIGIN_MARGIN);
    if (left <= 0 || right <= 0 || front <= 0 || py >= s.y1 + ORIGIN_MARGIN) continue;
    const least = Math.min(left, right, front);
    if (least === left) px = s.x0 - ORIGIN_MARGIN;
    else if (least === right) px = s.x1 + ORIGIN_MARGIN;
    else py = s.y0 - ORIGIN_MARGIN;
  }
  return { x: px, y: py };
}

/** Rectángulo en planta sobre la mesada (cm). */
export interface BenchRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const SWEEP_STEP = 0.4;
const SWEEP_MAX_STEPS = 400;

/**
 * Choque de todos los laboratorios: recorre el movimiento paso a paso desde `cur`, por eje, con el cuerpo `body` (en su
 * posición actual). Se detiene al tocar un obstáculo o un sólido de la sala y se desliza por su cara, sin saltar al otro
 * lado aunque el destino ya esté detrás. Lo que ya estaba solapado al empezar no retiene (se puede sacar lo atascado).
 */
export function sweepOnBench(cur: { x: number; y: number }, x: number, y: number, body: readonly BenchRect[], obstacles: readonly BenchRect[]): { x: number; y: number } {
  const hits = (px: number, py: number, o: BenchRect) => {
    const dx = px - cur.x;
    const dy = py - cur.y;
    return body.some((b) => b.x0 + dx < o.x1 && b.x1 + dx > o.x0 && b.y0 + dy < o.y1 && b.y1 + dy > o.y0);
  };
  const solid = [...obstacles, ...ROOM_SOLIDS].filter((o) => !hits(cur.x, cur.y, o));
  const blocked = (px: number, py: number) => solid.some((o) => hits(px, py, o));
  const steps = Math.min(SWEEP_MAX_STEPS, Math.ceil(Math.hypot(x - cur.x, y - cur.y) / SWEEP_STEP));
  const stepX = steps ? (x - cur.x) / steps : 0;
  const stepY = steps ? (y - cur.y) / steps : 0;
  let px = cur.x;
  let py = cur.y;
  let stoppedX = steps === SWEEP_MAX_STEPS;
  let stoppedY = steps === SWEEP_MAX_STEPS;
  for (let i = 0; i < steps; i++) {
    if (!blocked(px + stepX, py)) px += stepX;
    else stoppedX = true;
    if (!blocked(px, py + stepY)) py += stepY;
    else stoppedY = true;
  }
  return { x: stoppedX ? px : x, y: stoppedY ? py : y };
}

export interface PickHit {
  id: string;
  /** Parte del objeto (p. ej. 'knob' de la placa, 'tare' de la balanza). */
  part?: string;
}

export interface ViewAdapter {
  /** Intersección del rayo del puntero (px del lienzo) con el plano horizontal de altura z (cm). */
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  /** Detiene el movimiento contra lo que no se puede sobrevolar (ver `solidPushOf`). */
  solidPush?(id: string, cur: { x: number; y: number }, x: number, y: number, resting: readonly string[], grounded: boolean, point?: boolean): { x: number; y: number };
  /** Objeto bajo el puntero (raycast sobre volúmenes simples). */
  pick(sx: number, sy: number, excludeId?: string | null): PickHit | null;
  /** Ancho del lienzo en px (para el desplazamiento en los bordes). */
  viewW(): number;
  /** Desplaza la vista lateralmente (arrastre cerca de los bordes). */
  edgePan(dir: -1 | 1, dt: number): void;
  zoomBy(f: number): void;
  /** Asegura que la posición x (cm) sea visible. */
  reveal(x: number): void;
  /** Activa/desactiva la órbita de cámara (se desactiva mientras se sostiene un objeto). */
  setOrbitEnabled(on: boolean): void;
  /**
   * Coloca un objeto suelto sobre la mesada. Si la vista tiene física, el objeto cae y se apoya solo
   * (devuelve true); si no, el controlador busca un hueco libre.
   */
  releaseToPhysics?(id: string, isProp: boolean): boolean;
}
