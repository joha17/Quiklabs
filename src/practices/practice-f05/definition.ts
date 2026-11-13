/**
 * F05 — estaciones e instrumental sobre la mesada de 340 × 64 cm (decisión F05-1). El plano inclinable de 100 cm
 * ocupa el tramo izquierdo con el tirador de husillo en la ménsula de su extremo alto; el registrador, la balanza, el
 * estante de lastres y el termómetro quedan a la derecha, fuera del recorrido del bloque.
 * A: plano, bloque y superficies · B: balanza, lastres y termómetro · C: cable, célula de carga y tirador ·
 * D: goniómetro y elevador · E: compuertas y bajada · F: análisis con diagramas de cuerpo libre.
 */
import type { F05Object, F05ObjKind, Pose } from '../../simulation/f05-world/types';
import { BLOCK_START_S, GEOF05, planePoint } from '../../simulation/f05-world/geometry';

export type F05Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F05 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F05Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const PL = GEOF05.plane;

export const F05_STATIONS: F05Station[] = [
  { id: 'A', target: [112, PL.y, 12], dist: 170, elevation: 0.32 },
  { id: 'B', target: [282, 44, 6], dist: 85, elevation: 0.45 },
  { id: 'C', target: [170, PL.y, 12], dist: 75, elevation: 0.4 },
  { id: 'D', target: [128, PL.y, 16], dist: 95, elevation: 0.3, azimuth: 0.3 },
  { id: 'E', target: [118, PL.y, 20], dist: 125, elevation: 0.3 },
  { id: 'F', target: [140, 30, 12], dist: 165, elevation: 0.28 },
];

type ObjSpec = { id: string; kind: F05ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F05Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = GEOF05.massRack;
const SR = GEOF05.stripRack;
const on = (s: number, up = 0) => planePoint(s, 0, up);

export function buildObjectsF05(): F05Object[] {
  const b = on(BLOCK_START_S, GEOF05.block.h / 2);
  return [
    O({ id: 'plane01', kind: 'plane', pose: P(on(0.5).x, PL.y, PL.hingeZ) }),
    O({ id: 'block01', kind: 'block', pose: P(b.x, PL.y, b.z), support: 'plane' }),
    O({ id: 'w250a', kind: 'ballast', pose: P(R.x - 5, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'w250b', kind: 'ballast', pose: P(R.x + 5, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'massRack01', kind: 'massRack', pose: P(R.x, R.y, 0) }),
    O({ id: 'stripPaper', kind: 'strip', pose: P(SR.x - 6, SR.y, SR.h), support: 'rack', movable: true }),
    O({ id: 'stripRubber', kind: 'strip', pose: P(SR.x + 6, SR.y, SR.h), support: 'rack', movable: true }),
    O({ id: 'stripRack01', kind: 'stripRack', pose: P(SR.x, SR.y, 0) }),
    O({ id: 'puller01', kind: 'puller', pose: P(on(1.1).x, PL.y, PL.hingeZ + 4), support: 'plane' }),
    O({ id: 'load01', kind: 'loadCell', pose: P(on(1.02).x, PL.y, PL.hingeZ + 5), support: 'puller01' }),
    O({ id: 'spring01', kind: 'spring', pose: P(on(0.95).x, PL.y, PL.hingeZ + 5), support: 'puller01' }),
    O({ id: 'gonio01', kind: 'goniometer', pose: P(on(0.6).x, PL.y - PL.w / 2, PL.hingeZ + 2), support: 'plane' }),
    O({ id: 'elevator01', kind: 'elevator', pose: P(on(GEOF05.base.elevatorS).x, PL.y, 0) }),
    O({ id: 'catcher01', kind: 'catcher', pose: P(on(GEOF05.catcher.s).x, PL.y, PL.hingeZ + 3), support: 'plane' }),
    O({ id: 'logger01', kind: 'logger', pose: P(GEOF05.logger.x, GEOF05.logger.y, 0) }),
    O({ id: 'gate1', kind: 'gate', pose: P(on(0.65).x, PL.y, PL.hingeZ), support: 'plane' }),
    O({ id: 'gate2', kind: 'gate', pose: P(on(0.3).x, PL.y, PL.hingeZ), support: 'plane' }),
    O({ id: 'balance01', kind: 'balance', pose: P(GEOF05.balance.x, GEOF05.balance.y, 0) }),
    O({ id: 'thermo01', kind: 'thermometer', pose: P(GEOF05.thermo.x, GEOF05.thermo.y, 0) }),
  ];
}
