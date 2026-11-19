/**
 * Geometría visual de F103 (cm de la sala, z = 0 en la cara de la mesada, suelo en z = −88): dónde están la boca del
 * lanzador, el deck del soporte, la esfera (en la bandeja, en el cañón o en vuelo), la plataforma, la pantalla y la
 * cinta del suelo. La usan la cámara (lectura de frente), el controlador (paralaje real) y las vistas, con las MISMAS
 * medidas que el dominio (`GEOF103`).
 */
import type { F103World } from '../../simulation/f103-world/types';
import { FLOOR_Z, GEOF103 } from '../../simulation/f103-world/geometry';
import { elevationF3, muzzleF3 } from '../../simulation/f103-world/world';

export const LANE = GEOF103.lane;
export const DEG = Math.PI / 180;
/** Pantalla fuera de la pista: se guarda de canto junto a la pared lateral de la zona. */
export const SCREEN_PARK_Y = -205;

/** Boca (eje de giro) del lanzador en cm de la sala. */
export function muzzleRoom(w: F103World) {
  const m = muzzleF3(w);
  return { x: m.x * 100, y: m.y * 100, z: FLOOR_Z + m.z * 100 };
}

/** Dirección del cañón (vector unitario en la sala) con la elevación real y el azimut. */
export function barrelDir(w: F103World) {
  const e = elevationF3(w) * DEG;
  const a = w.launcher.yawDeg * DEG;
  return { x: Math.cos(e) * Math.cos(a), y: Math.cos(e) * Math.sin(a), z: Math.sin(e) };
}

/** Cara superior del deck (cm de la sala) y su centro (el deck se extiende detrás de la boca). */
export function deckRoom(w: F103World) {
  const m = muzzleRoom(w);
  return { x: m.x - 20, y: m.y, z: FLOOR_Z + w.stand.heightCm };
}

/** Pose visible de una esfera: en vuelo sigue al dominio; dentro del cañón, 3 cm detrás de la boca. */
export function ballRoom(w: F103World, id: string): { x: number; y: number; z: number } | null {
  const o = w.objects[id];
  if (!o) return null;
  const f = w.flight;
  if (o.support === 'air' && f && f.ball === id) return { x: f.x * 100, y: f.y * 100, z: FLOOR_Z + f.z * 100 };
  if (o.support === 'launcher') {
    const m = muzzleRoom(w);
    const d = barrelDir(w);
    return { x: m.x - d.x * 3, y: m.y - d.y * 3, z: m.z - d.z * 3 };
  }
  return null;
}

export const platformRoom = (w: F103World) => ({ x: w.platform.x * 100, y: w.platform.y * 100, z: FLOOR_Z });
/** Borde de origen de la escala de la plataforma (lo que se lee en la cinta). */
export const platformIndexRoom = (w: F103World) => ({ x: w.platform.x * 100 - GEOF103.platform.size / 2, y: w.platform.y * 100 + GEOF103.platform.size / 2, z: FLOOR_Z });
export const screenRoom = (w: F103World) => ({ x: w.screen.x * 100, y: w.screen.inLane ? LANE.yc : SCREEN_PARK_Y, z: FLOOR_Z });
export const rulerRoom = (w: F103World) => {
  const m = muzzleRoom(w);
  return { x: m.x + GEOF103.heightRuler.dx, y: m.y + GEOF103.heightRuler.dy, z: FLOOR_Z };
};

/** Punto que se mira de frente para leer cada escala. */
export function eyePoint(w: F103World, target: string): { x: number; y: number; z: number } {
  const m = muzzleRoom(w);
  switch (target) {
    case 'heightRuler01': {
      const r = rulerRoom(w);
      return { x: r.x, y: r.y, z: m.z };
    }
    case 'screen01': {
      const s = screenRoom(w);
      const mk = w.screen.marks[w.screen.marks.length - 1];
      return { x: s.x, y: s.y, z: FLOOR_Z + (mk ? mk.z * 100 : 80) };
    }
    case 'floorTape01':
      return { ...platformIndexRoom(w), y: GEOF103.floorTape.y };
    case 'platform01':
      return platformIndexRoom(w);
    case 'timer01':
      return { x: GEOF103.timer.x, y: GEOF103.timer.y, z: GEOF103.timer.h };
    case 'stand01':
      return deckRoom(w);
    default:
      return { x: m.x, y: m.y - 13, z: m.z };
  }
}
