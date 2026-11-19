/**
 * F07 — estaciones e instrumental sobre la mesada de 340 × 64 cm (decisión F07-1). El riel de 200 cm con sus dos
 * lanzadores, el nivel, las fotopuertas y la regla de posición ocupa casi toda la mesada, delante; la cámara lateral
 * mira el riel desde el fondo; balanza, estante de pesas, calibre y estuche de paragolpes quedan en el extremo derecho
 * y el registrador en el izquierdo.
 * A: riel · B: carros y paragolpes · C: fotopuertas y sensor de fuerza · D: masas · E: cámara y regla · F: resultados.
 */
import type { F07Object, F07ObjKind, Pose } from '../../simulation/f07-world/types';
import { CART_A_START, GEOF07, trackPoint } from '../../simulation/f07-world/geometry';

export type F07Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F07 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F07Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const TR = GEOF07.track;

export const F07_STATIONS: F07Station[] = [
  { id: 'A', target: [180, TR.y, 12], dist: 250, elevation: 0.3 },
  { id: 'B', target: [170, TR.y, 14], dist: 110, elevation: 0.35, azimuth: -0.2 },
  { id: 'C', target: [210, TR.y + 4, 16], dist: 90, elevation: 0.3, azimuth: 0.25 },
  { id: 'D', target: [312, 30, 8], dist: 95, elevation: 0.45 },
  { id: 'E', target: [180, 30, 20], dist: 190, elevation: 0.12 },
  { id: 'F', target: [170, 32, 30], dist: 320, elevation: 0.3 },
];

type ObjSpec = { id: string; kind: F07ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F07Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = GEOF07.massRack;

export function buildObjectsF07(): F07Object[] {
  const t = (s: number) => trackPoint(s);
  return [
    O({ id: 'track01', kind: 'track', pose: P(TR.x0 + TR.len * 50, TR.y, 0) }),
    O({ id: 'ends01', kind: 'endStop', pose: P(TR.x0, TR.y, TR.z0), support: 'track' }),
    O({ id: 'launcherA', kind: 'launcher', pose: P(t(0.03).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'launcherB', kind: 'launcher', pose: P(t(1.97).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'level01', kind: 'level', pose: P(t(GEOF07.level.s).x, TR.y + GEOF07.level.dy, TR.z0), support: 'track' }),
    O({ id: 'cartA', kind: 'cart', pose: P(t(CART_A_START).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'cartB', kind: 'cart', pose: P(t(GEOF07.cartB0).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'cw100a', kind: 'cartMass', pose: P(R.x - 9, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'cw100b', kind: 'cartMass', pose: P(R.x, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'cw200', kind: 'cartMass', pose: P(R.x + 9, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'massRack01', kind: 'massRack', pose: P(R.x, R.y, 0) }),
    O({ id: 'balance01', kind: 'balance', pose: P(GEOF07.balance.x, GEOF07.balance.y, 0) }),
    O({ id: 'caliper01', kind: 'caliper', pose: P(GEOF07.caliper.x, GEOF07.caliper.y, 0) }),
    O({ id: 'bumpers01', kind: 'bumperKit', pose: P(GEOF07.bumperKit.x, GEOF07.bumperKit.y, 0) }),
    O({ id: 'gateA', kind: 'gate', pose: P(t(GEOF07.gate.sA).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'gateB', kind: 'gate', pose: P(t(GEOF07.gate.sB).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'force01', kind: 'forceSensor', pose: P(t(GEOF07.cartB0).x, TR.y, TR.z0 + 3), support: 'cartB' }),
    O({ id: 'logger01', kind: 'logger', pose: P(GEOF07.logger.x, GEOF07.logger.y, 0) }),
    O({ id: 'camera01', kind: 'camera', pose: P(GEOF07.camera.x, GEOF07.camera.y, 0) }),
    O({ id: 'ruler01', kind: 'posRuler', pose: P(TR.x0 + TR.len * 50, GEOF07.posRuler.y, 0) }),
  ];
}
