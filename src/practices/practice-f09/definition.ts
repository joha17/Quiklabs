/**
 * F09 — estaciones e instrumental sobre la mesada de 340 × 64 cm (decisión F09-1). La mesa giratoria con su guarda
 * ocupa el tercio izquierdo, con el carro del dinamómetro en el canto frontal, el motor a la derecha de la base y la
 * palanca del cordón central a la izquierda; el registrador detrás a la izquierda; la balanza y el estante de masas en
 * el extremo derecho.
 * A: mesa y guarda · B: masa orbitante · C: torque · D: momento angular · E: sensores · F: análisis.
 */
import type { F09Object, F09ObjKind, Pose } from '../../simulation/f09-world/types';
import { GEOF09, TABLE_TOP } from '../../simulation/f09-world/geometry';

export type F09Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F09 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F09Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const AX = GEOF09.axis;

export const F09_STATIONS: F09Station[] = [
  { id: 'A', target: [AX.x, AX.y, 12], dist: 150, elevation: 0.45 },
  { id: 'B', target: [AX.x + 12, AX.y, TABLE_TOP + 3], dist: 85, elevation: 0.75, azimuth: 0.15 },
  { id: 'C', target: [AX.x - 14, 4, 6], dist: 95, elevation: 0.32, azimuth: -0.3 },
  { id: 'D', target: [AX.x, AX.y, TABLE_TOP], dist: 80, elevation: 1.05 },
  { id: 'E', target: [AX.x + 22, 36, 10], dist: 120, elevation: 0.35, azimuth: 0.35 },
  { id: 'F', target: [180, 32, 10], dist: 330, elevation: 0.3 },
];

type ObjSpec = { id: string; kind: F09ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F09Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = GEOF09.massRack;

export function buildObjectsF09(): F09Object[] {
  return [
    O({ id: 'base01', kind: 'base', pose: P(AX.x, AX.y, 0) }),
    O({ id: 'level01', kind: 'level', pose: P(GEOF09.level.x, GEOF09.level.y, GEOF09.base.h), support: 'base01' }),
    O({ id: 'guard01', kind: 'guard', pose: P(AX.x, AX.y, GEOF09.base.h), support: 'base01' }),
    O({ id: 'hub01', kind: 'hub', pose: P(AX.x, AX.y, GEOF09.table.z), support: 'base01' }),
    O({ id: 'guide01', kind: 'guide', pose: P(AX.x, AX.y, TABLE_TOP), support: 'hub01' }),
    O({ id: 'orbit01', kind: 'orbitMass', pose: P(R.x - 9, R.y, R.h), support: 'rack' }),
    O({ id: 'slide1', kind: 'radialMass', pose: P(AX.x, AX.y + 15, TABLE_TOP), support: 'bar' }),
    O({ id: 'slide2', kind: 'radialMass', pose: P(AX.x, AX.y - 15, TABLE_TOP), support: 'bar' }),
    O({ id: 'pull01', kind: 'pullRing', pose: P(GEOF09.pull.x, GEOF09.pull.y, 0) }),
    O({ id: 'drum01', kind: 'drum', pose: P(AX.x, AX.y, GEOF09.drum.z), support: 'hub01' }),
    O({ id: 'dyn01', kind: 'dynamometer', pose: P(AX.x - 10, GEOF09.dyn.y, GEOF09.drum.z) }),
    O({ id: 'brake01', kind: 'brake', pose: P(AX.x + 22, AX.y + 22, GEOF09.table.z), support: 'base01' }),
    O({ id: 'motor01', kind: 'motor', pose: P(GEOF09.motor.x, GEOF09.motor.y, 0) }),
    O({ id: 'force01', kind: 'forceSensor', pose: P(AX.x, AX.y, TABLE_TOP + GEOF09.mast.h), support: 'hub01' }),
    O({ id: 'gate01', kind: 'gate', pose: P(AX.x + Math.cos(GEOF09.gate.angle) * GEOF09.table.r, AX.y + Math.sin(GEOF09.gate.angle) * GEOF09.table.r, GEOF09.table.z), support: 'base01' }),
    O({ id: 'encoder01', kind: 'encoder', pose: P(AX.x, AX.y, 3), support: 'base01' }),
    O({ id: 'logger01', kind: 'logger', pose: P(GEOF09.logger.x, GEOF09.logger.y, 0) }),
    O({ id: 'balance01', kind: 'balance', pose: P(GEOF09.balance.x, GEOF09.balance.y, 0) }),
    O({ id: 'ruler01', kind: 'radialRuler', pose: P(AX.x, AX.y, TABLE_TOP), support: 'hub01' }),
    O({ id: 'massRack01', kind: 'massRack', pose: P(R.x, R.y, 0) }),
  ];
}
