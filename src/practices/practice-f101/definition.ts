/**
 * F101 — estaciones, instrumental y posiciones iniciales sobre la mesada de 560 × 64 cm (§4, §6).
 * A: seguridad y patrones · B: medición dimensional · C: gravimetría y volumen · D: mesa de fuerzas ·
 * E: observación (dinamómetro, sensor 2D) · F: libreta. Los anclajes son objetivos de cámara: ningún montaje se
 * superpone a otro ni a la campana de la pared (x 352–552, y > 52,5).
 */
import type { F101Object, F101ObjKind, Pose } from '../../simulation/f101-world/types';
import { GEOF101, TABLE_CENTER } from '../../simulation/f101-world/geometry';
import { HANGERS, SLOT_MASSES } from '../../simulation/f101-world/world';

export type F101Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F101 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F101Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
}

export const F101_STATIONS: F101Station[] = [
  { id: 'A', target: [52, 30, 4], dist: 70, elevation: 0.55 },
  { id: 'B', target: [140, 26, 4], dist: 55, elevation: 0.6 },
  { id: 'C', target: [232, 30, 8], dist: 70, elevation: 0.4 },
  { id: 'D', target: [TABLE_CENTER.x, TABLE_CENTER.y, GEOF101.forceTable.topZ], dist: 75, elevation: 0.95 },
  { id: 'E', target: [334, 40, 10], dist: 60, elevation: 0.5 },
  { id: 'F', target: [460, 30, 10], dist: 90, elevation: 0.4 },
];

export const BALANCE_POS = { x: 215, y: 34 };
export const GRADCYL_POS = { x: 250, y: 36 };
export const RACK_POS = { x: 334, y: 14 };
export const SENSOR_POS = { x: 342, y: 48 };

type ObjSpec = { id: string; kind: F101ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F101Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? true });

/** Posición de reposo de una pesa ranurada en el portapesas (cm). */
export function rackSlot(i: number): Pose {
  return P(RACK_POS.x - 6 + (i % 6) * 2.4, RACK_POS.y - 2 + Math.floor(i / 6) * 4, GEOF101.massRack.h);
}

export function buildObjectsF101(): F101Object[] {
  return [
    // A — seguridad, patrones y devolución
    O({ id: 'gaugeBlock01', kind: 'gaugeBlock', pose: P(36, 20, 0) }),
    O({ id: 'massStd01', kind: 'massStd', pose: P(54, 20, 0) }),
    O({ id: 'tissue01', kind: 'tissue', pose: P(28, 42, 0) }),
    O({ id: 'level01', kind: 'level', pose: P(48, 44, 0) }),
    O({ id: 'tray01', kind: 'returnTray', pose: P(74, 40, 0), movable: false }),
    // B — medición dimensional
    O({ id: 'caliper01', kind: 'caliper', pose: P(128, 18, 0.6), movable: false }),
    O({ id: 'micrometer01', kind: 'micrometer', pose: P(152, 26, 0), movable: false }),
    O({ id: 'ruler01', kind: 'ruler', pose: P(122, 42, 0.15), movable: false }),
    { ...O({ id: 'metalCyl01', kind: 'metalCyl', pose: P(166, 14, 0) }), orient: 'upright' },
    O({ id: 'steelBall01', kind: 'steelBall', pose: P(174, 30, 0) }),
    // C — gravimetría y volumen
    O({ id: 'balance01', kind: 'balance', pose: P(BALANCE_POS.x, BALANCE_POS.y), movable: false }),
    O({ id: 'dish01', kind: 'dish', pose: P(236, 16, 0) }),
    O({ id: 'gradCyl01', kind: 'gradCyl', pose: P(GRADCYL_POS.x, GRADCYL_POS.y), movable: false }),
    // D — mesa de fuerzas
    O({ id: 'forceTable01', kind: 'forceTable', pose: P(TABLE_CENTER.x, TABLE_CENTER.y), movable: false }),
    O({ id: 'pulley1', kind: 'pulley', pose: P(TABLE_CENTER.x, TABLE_CENTER.y, GEOF101.forceTable.topZ), support: 'rim', movable: false }),
    O({ id: 'pulley2', kind: 'pulley', pose: P(TABLE_CENTER.x, TABLE_CENTER.y, GEOF101.forceTable.topZ), support: 'rim', movable: false }),
    O({ id: 'pulley3', kind: 'pulley', pose: P(TABLE_CENTER.x, TABLE_CENTER.y, GEOF101.forceTable.topZ), support: 'rim', movable: false }),
    O({ id: 'massRack01', kind: 'massRack', pose: P(RACK_POS.x, RACK_POS.y), movable: false }),
    ...HANGERS.map((id, i) => O({ id, kind: 'hanger', pose: P(RACK_POS.x + 9.5, RACK_POS.y - 3 + i * 3, 0), support: 'rack' })),
    ...SLOT_MASSES.map(([id], i) => O({ id, kind: 'slotMass', pose: rackSlot(i), support: 'rack' })),
    // E — observación
    O({ id: 'dynamometer01', kind: 'dynamometer', pose: P(330, 34, 0.9) }),
    O({ id: 'sensorBox01', kind: 'sensorBox', pose: P(SENSOR_POS.x, SENSOR_POS.y), movable: false }),
  ];
}
