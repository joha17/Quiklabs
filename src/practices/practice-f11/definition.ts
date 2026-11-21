/**
 * F11 — estaciones e instrumental sobre la mesada de 340 × 64 cm. El tanque con su grifo, la llave de vaciado, el
 * agitador y el puente-guía de la sonda ocupa la izquierda (con el depósito de salmuera y su bomba al lado), el
 * porta-sonda, el registrador y el estante de objetos el centro, y la balanza, la probeta, el vaso de rebose y el
 * soporte con el dinamómetro la derecha.
 * A: tanque · B: sonda y regla · C: flotación · D: densidad (balanza, probeta, vaso de rebose) · E: fuerzas
 * (dinamómetro y guía de inmersión) · F: análisis.
 */
import type { F11Object, F11ObjKind, Pose } from '../../simulation/f11-world/types';
import { GEOF11 } from '../../simulation/f11-world/geometry';

export type F11Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F11 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F11Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const G = GEOF11;
const T = G.tank;

export const F11_STATIONS: F11Station[] = [
  { id: 'A', target: [T.x0 + 34, T.y0 + 10, 24], dist: 175, elevation: 0.3, azimuth: 0.05 },
  { id: 'B', target: [T.x0 + 30, G.guide.y, 26], dist: 95, elevation: 0.12 },
  { id: 'C', target: [T.x0 + 30, T.y0 + T.W / 2, 40], dist: 120, elevation: 0.75 },
  { id: 'D', target: [G.balance.x + 12, 22, 12], dist: 120, elevation: 0.42 },
  { id: 'E', target: [G.can.x, G.can.y, 28], dist: 110, elevation: 0.2, azimuth: -0.1 },
  { id: 'F', target: [170, 32, 20], dist: 340, elevation: 0.3 },
];

type ObjSpec = { id: string; kind: F11ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F11Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = G.rack;

export function buildObjectsF11(): F11Object[] {
  return [
    O({ id: 'tank01', kind: 'tank', pose: P(T.x0 + T.L / 2, T.y0 + T.W / 2, 0) }),
    O({ id: 'tapA', kind: 'tap', pose: P(G.tap.x, G.tap.y, G.tap.z) }),
    O({ id: 'resB', kind: 'reservoir', pose: P(G.reservoir.x, G.reservoir.y, 0) }),
    O({ id: 'pumpB', kind: 'pump', pose: P(G.reservoir.x, G.reservoir.y, G.reservoir.h) }),
    O({ id: 'drain01', kind: 'drain', pose: P(G.drain.x, G.drain.y, G.drain.z) }),
    O({ id: 'waste01', kind: 'waste', pose: P(G.waste.x, G.waste.y, 0) }),
    O({ id: 'agitator01', kind: 'agitator', pose: P(T.x0 + G.agitator.lx, G.agitator.y, T.floorZ + T.H) }),
    O({ id: 'scale01', kind: 'scale', pose: P(T.x0 + G.scaleX, T.y0, T.floorZ) }),
    O({ id: 'guide01', kind: 'guide', pose: P(T.x0 + 30, T.y0 + T.W / 2, T.floorZ + T.H) }),
    O({ id: 'probe01', kind: 'probe', pose: P(G.holder.x, G.holder.y, 10), support: 'holder01', movable: true }),
    O({ id: 'ruler01', kind: 'ruler', pose: P(T.x0 + 30, G.guide.y, T.floorZ + T.H), support: 'guide01' }),
    O({ id: 'holder01', kind: 'holder', pose: P(G.holder.x, G.holder.y, 0) }),
    O({ id: 'logger01', kind: 'logger', pose: P(G.logger.x, G.logger.y, 0) }),
    O({ id: 'towel01', kind: 'towel', pose: P(G.towel.x, G.towel.y, 0), movable: true }),
    O({ id: 'rack01', kind: 'rack', pose: P(R.x, R.y, 0) }),
    O({ id: 'float1', kind: 'floater', pose: P(R.x - 14, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'bottle1', kind: 'bottle', pose: P(R.x, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'alu1', kind: 'block', pose: P(R.x + 14, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'ballast01', kind: 'ballast', pose: P(G.ballast.x, G.ballast.y, 0) }),
    O({ id: 'balance01', kind: 'balance', pose: P(G.balance.x, G.balance.y, 0) }),
    O({ id: 'cyl01', kind: 'cylinder', pose: P(G.cylinder.x, G.cylinder.y, 0), movable: true }),
    O({ id: 'can01', kind: 'can', pose: P(G.can.x, G.can.y, 0) }),
    O({ id: 'catch01', kind: 'catch', pose: P(G.catchRack.x, G.catchRack.y, 0), movable: true }),
    O({ id: 'stand01', kind: 'stand', pose: P(G.stand.x, G.stand.y, 0) }),
    O({ id: 'dyn01', kind: 'dynamometer', pose: P(G.can.x, G.can.y, G.stand.armZ - G.stand.dynLen), support: 'stand01' }),
  ];
}
