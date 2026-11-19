/**
 * F08 — estaciones e instrumental sobre la mesada de 340 × 64 cm (decisión F08-1). El soporte giratorio con su guarda
 * ocupa el tercio izquierdo, con la polea en el canto frontal y la columna de caída bajo ella; la bandeja de sólidos
 * queda al centro y la balanza, el estante de pesas y el calibre en el extremo derecho; el registrador a la izquierda.
 * A: soporte y guarda · B: sólidos y masas · C: cuerda, polea y caída · D: sensores · E: transportador y encoder · F: resultados.
 */
import type { F08Object, F08ObjKind, Pose } from '../../simulation/f08-world/types';
import { GEOF08 } from '../../simulation/f08-world/geometry';

export type F08Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F08 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F08Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const AX = GEOF08.axis;

export const F08_STATIONS: F08Station[] = [
  { id: 'A', target: [AX.x, AX.y, 10], dist: 120, elevation: 0.45 },
  { id: 'B', target: [264, 32, 6], dist: 150, elevation: 0.5 },
  { id: 'C', target: [AX.x + 4, -2, -42], dist: 165, elevation: 0.14, azimuth: 0.35 },
  { id: 'D', target: [AX.x - 8, 26, 8], dist: 120, elevation: 0.35, azimuth: -0.25 },
  { id: 'E', target: [AX.x, AX.y, 12], dist: 70, elevation: 0.9 },
  { id: 'F', target: [180, 32, 10], dist: 330, elevation: 0.3 },
];

type ObjSpec = { id: string; kind: F08ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F08Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = GEOF08.massRack;
const S = GEOF08.slots;
const C = GEOF08.column;

export function buildObjectsF08(): F08Object[] {
  return [
    O({ id: 'base01', kind: 'base', pose: P(AX.x, AX.y, 0) }),
    O({ id: 'guard01', kind: 'guard', pose: P(AX.x, AX.y, GEOF08.base.h), support: 'base01' }),
    O({ id: 'hub01', kind: 'hub', pose: P(AX.x, AX.y, GEOF08.table.z), support: 'base01' }),
    O({ id: 'disc01', kind: 'solid', pose: P(S.disc01.x, S.disc01.y, 1), support: 'rack' }),
    O({ id: 'ring01', kind: 'solid', pose: P(S.ring01.x, S.ring01.y, 1), support: 'rack' }),
    O({ id: 'bar01', kind: 'solid', pose: P(S.bar01.x, S.bar01.y, 1), support: 'rack' }),
    O({ id: 'slide1', kind: 'slideMass', pose: P(S.bar01.x + 15, S.bar01.y, 2), support: 'bar01' }),
    O({ id: 'slide2', kind: 'slideMass', pose: P(S.bar01.x - 15, S.bar01.y, 2), support: 'bar01' }),
    O({ id: 'ruler01', kind: 'radialRuler', pose: P(S.bar01.x, S.bar01.y, 2), support: 'bar01' }),
    O({ id: 'rack01', kind: 'solidRack', pose: P(GEOF08.rack.x, GEOF08.rack.y, 0) }),
    O({ id: 'pulley01', kind: 'pulley', pose: P(AX.x, GEOF08.pulley.y, GEOF08.drum.z) }),
    O({ id: 'drop20', kind: 'dropMass', pose: P(R.x - 9, R.y, R.h), support: 'massRack', movable: true }),
    O({ id: 'drop50', kind: 'dropMass', pose: P(R.x, R.y, R.h), support: 'massRack', movable: true }),
    O({ id: 'drop100', kind: 'dropMass', pose: P(R.x + 9, R.y, R.h), support: 'massRack', movable: true }),
    O({ id: 'massRack01', kind: 'massRack', pose: P(R.x, R.y, 0) }),
    O({ id: 'column01', kind: 'dropColumn', pose: P(AX.x + C.dx, GEOF08.pulley.y - 4, C.floor) }),
    O({ id: 'catch01', kind: 'catch', pose: P(AX.x + 2, GEOF08.pulley.y - 4, -70), support: 'column01' }),
    O({ id: 'gate01', kind: 'gate', pose: P(AX.x + 2, GEOF08.pulley.y - 4, -64), support: 'column01' }),
    O({ id: 'encoder01', kind: 'encoder', pose: P(AX.x, AX.y, 3), support: 'base01' }),
    O({ id: 'tach01', kind: 'tach', pose: P(GEOF08.tach.x, GEOF08.tach.y, 0) }),
    O({ id: 'tension01', kind: 'tensionSensor', pose: P(AX.x + 2, 8, GEOF08.drum.z), support: 'string' }),
    O({ id: 'logger01', kind: 'logger', pose: P(GEOF08.logger.x, GEOF08.logger.y, 0) }),
    O({ id: 'balance01', kind: 'balance', pose: P(GEOF08.balance.x, GEOF08.balance.y, 0) }),
    O({ id: 'caliper01', kind: 'caliper', pose: P(GEOF08.caliper.x, GEOF08.caliper.y, 0) }),
  ];
}
