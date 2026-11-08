/**
 * F103 — estaciones e instrumental. La pista de vuelo es una ESTACIÓN INDEPENDIENTE sobre el suelo delante de la mesada
 * (8,0 × 1,2 m, decisión F103-1); en la mesada quedan la interfaz de adquisición y la libreta.
 * A: seguridad, soporte, nivel, plomada y cinta · B: lanzador, transportador y fotopuerta · C: plataforma de impacto ·
 * D: pantalla vertical (trayectoria) · E: ventilador y condiciones · F: libreta.
 */
import type { F103Object, F103ObjKind, Pose } from '../../simulation/f103-world/types';
import { FLOOR_Z, GEOF103, MUZZLE0 } from '../../simulation/f103-world/geometry';
import { BALLS_F3 } from '../../simulation/f103-world/world';

export type F103Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F103 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F103Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  /** Azimut de la cámara (rad, 0 = de frente desde el operador; −π/2 = desde detrás del lanzador). */
  azimuth?: number;
}

const L = GEOF103.lane;
const F = FLOOR_Z;

export const F103_STATIONS: F103Station[] = [
  { id: 'A', target: [MUZZLE0.x - 10, L.yc, F + 35], dist: 130, elevation: 0.3 },
  { id: 'B', target: [MUZZLE0.x, L.yc, F + 42], dist: 60, elevation: 0.1 },
  { id: 'C', target: [300, L.yc, F + 5], dist: 130, elevation: 0.75 },
  { id: 'D', target: [20, L.yc, F + 45], dist: 235, elevation: 0.62, azimuth: 0.62 },
  { id: 'E', target: [330, L.yc, F + 30], dist: 430, elevation: 0.32, azimuth: -1.45 },
  { id: 'F', target: [GEOF103.timer.x + 30, 30, 8], dist: 100, elevation: 0.45 },
];

type ObjSpec = { id: string; kind: F103ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F103Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'floor', movable: s.movable ?? false });

/** Esferas sobre la bandeja del soporte (pose inicial con el soporte a 30 cm). */
const ballPose = (i: number, standCm: number): Pose => P(MUZZLE0.x - 40 + (i % 5) * 3.6 - GEOF103.tray.w / 2 + 3, MUZZLE0.y + 14, F + standCm + 0.6);

export function buildObjectsF103(standCm = 30): F103Object[] {
  return [
    O({ id: 'lane01', kind: 'lane', pose: P(L.x0, L.yc, F) }),
    O({ id: 'stand01', kind: 'stand', pose: P(MUZZLE0.x - 20, L.yc, F) }),
    O({ id: 'launcher01', kind: 'launcher', pose: P(MUZZLE0.x, L.yc, F + standCm + GEOF103.stand.pivotDz) }),
    O({ id: 'gate01', kind: 'gate', pose: P(MUZZLE0.x + 2, L.yc, F + standCm + GEOF103.stand.pivotDz) }),
    O({ id: 'tray01', kind: 'tray', pose: P(MUZZLE0.x - 35, MUZZLE0.y + 14, F + standCm) }),
    O({ id: 'timer01', kind: 'timer', pose: P(GEOF103.timer.x, GEOF103.timer.y, 0), support: 'bench' }),
    O({ id: 'platform01', kind: 'platform', pose: P(300, L.yc, F) }),
    O({ id: 'screen01', kind: 'screen', pose: P(MUZZLE0.x + 100, L.yc - 75, F) }),
    O({ id: 'barrier01', kind: 'barrier', pose: P(GEOF103.barrier.x, GEOF103.barrier.y, F) }),
    O({ id: 'fan01', kind: 'fan', pose: P(GEOF103.fan.x, GEOF103.fan.y, F) }),
    O({ id: 'floorTape01', kind: 'floorTape', pose: P(L.x0, GEOF103.floorTape.y, F) }),
    O({ id: 'plumb01', kind: 'plumb', pose: P(MUZZLE0.x, L.yc, F + standCm + GEOF103.stand.pivotDz) }),
    O({ id: 'heightRuler01', kind: 'heightRuler', pose: P(MUZZLE0.x + GEOF103.heightRuler.dx, L.yc + GEOF103.heightRuler.dy, F) }),
    ...BALLS_F3.map((id, i) => O({ id, kind: 'ball', pose: ballPose(i, standCm), support: 'tray', movable: true })),
  ];
}
