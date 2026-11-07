/**
 * F102 — estaciones, instrumental y posiciones iniciales sobre la mesada de 560 × 64 cm (§4, §6).
 * A: seguridad y nivelación · B: carril, compuertas y lanzador (MRU) · C: polea, masa colgante y cinta (MRUA) ·
 * D: torre de caída libre · E: filtros y sensor de movimiento · F: libreta. El carril ocupa x 12–170 con la polea
 * fuera del borde izquierdo; la torre está en x = 262; nada invade la campana de la pared (x 352–552, y > 52,5).
 */
import type { F102Object, F102ObjKind, Pose } from '../../simulation/f102-world/types';
import { GEOF102, trackX } from '../../simulation/f102-world/geometry';
import { BARS, FILTERS, SLOT_MASSES_F2, SPHERES } from '../../simulation/f102-world/world';

export type F102Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F102 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F102Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
}

const T = GEOF102.track;
const TW = GEOF102.tower;

export const F102_STATIONS: F102Station[] = [
  { id: 'A', target: [150, 30, 6], dist: 60, elevation: 0.5 },
  { id: 'B', target: [110, 24, 10], dist: 95, elevation: 0.55 },
  // C: lanzador y primeras compuertas; D: polea, masa colgante y registrador; E: torre con los filtros al lado.
  { id: 'C', target: [145, 26, 8], dist: 95, elevation: 0.35 },
  { id: 'D', target: [30, 28, 2], dist: 120, elevation: 0.4 },
  { id: 'E', target: [TW.x + 12, TW.y, 55], dist: 240, elevation: 0.25 },
  { id: 'F', target: [460, 30, 10], dist: 90, elevation: 0.4 },
];

export const RACK_POS = { x: 48, y: 50 };
export const BAR_POS = { x: 70, y: 50 };
export const TRAY_POS = { x: 232, y: 44 };
export const GATE_TIMER_POS = { x: 120, y: 50 };
export const TAPE_TIMER_POS = { x: T.xLauncher + 14, y: T.y };
export const INCLINOMETER_REST = { x: 182, y: 46 };

type ObjSpec = { id: string; kind: F102ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F102Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? true });

/** Posición de reposo de una pesa ranurada en el portapesas (cm). */
export function rackSlot(i: number): Pose {
  return P(RACK_POS.x - 5 + (i % 5) * 2.6, RACK_POS.y, GEOF102.massRack.h);
}

/** Posición de reposo de un filtro sobre la mesada (cm). */
export const filterRest = (i: number): Pose => P(292 + i * 14, 46, 0);

export function buildObjectsF102(): F102Object[] {
  return [
    // A — seguridad, nivelación y devolución
    O({ id: 'inclinometer01', kind: 'inclinometer', pose: P(INCLINOMETER_REST.x, INCLINOMETER_REST.y) }),
    O({ id: 'tray01', kind: 'returnTray', pose: P(TRAY_POS.x, TRAY_POS.y), movable: false }),
    // B — carril, carro, compuertas y lanzador
    O({ id: 'track01', kind: 'track', pose: P(T.xLauncher - T.length / 2, T.y), movable: false }),
    O({ id: 'launcher01', kind: 'launcher', pose: P(T.xLauncher + 4, T.y, T.railZ), movable: false }),
    O({ id: 'cart01', kind: 'cart', pose: P(trackX(0.3), T.y, T.railZ), support: 'track01', movable: false }),
    O({ id: 'gate1', kind: 'gate', pose: P(trackX(0.2), T.y, T.railZ), support: 'track01', movable: false }),
    O({ id: 'gate2', kind: 'gate', pose: P(trackX(0.25), T.y, T.railZ), support: 'track01', movable: false }),
    O({ id: 'gateTimer01', kind: 'gateTimer', pose: P(GATE_TIMER_POS.x, GATE_TIMER_POS.y), movable: false }),
    ...BARS.map((id, i) => O({ id, kind: 'cartBar', pose: P(BAR_POS.x + i * 9, BAR_POS.y), support: 'rack' })),
    // C — polea, masa colgante y registrador de cinta
    O({ id: 'pulley01', kind: 'pulley', pose: P(GEOF102.pulley.x, T.y, T.railZ + GEOF102.cart.hookZ), movable: false }),
    O({ id: 'massRack01', kind: 'massRack', pose: P(RACK_POS.x, RACK_POS.y), movable: false }),
    O({ id: 'hanger01', kind: 'hanger', pose: P(RACK_POS.x + 9.5, RACK_POS.y, 0), support: 'rack' }),
    ...SLOT_MASSES_F2.map(([id], i) => O({ id, kind: 'slotMass', pose: rackSlot(i), support: 'rack' })),
    O({ id: 'tapeTimer01', kind: 'tapeTimer', pose: P(TAPE_TIMER_POS.x, TAPE_TIMER_POS.y), movable: false }),
    // D — torre de caída
    O({ id: 'tower01', kind: 'tower', pose: P(TW.x, TW.y), movable: false }),
    O({ id: 'magnet01', kind: 'magnet', pose: P(TW.x, TW.y, TW.beamZ + 80), movable: false }),
    O({ id: 'photocell01', kind: 'photocell', pose: P(TW.x, TW.y, TW.beamZ), movable: false }),
    O({ id: 'pad01', kind: 'pad', pose: P(TW.x, TW.y, TW.baseH), support: 'base' }),
    ...SPHERES.map((id, i) => O({ id, kind: 'sphere', pose: P(TRAY_POS.x - 6 + i * 6, TRAY_POS.y, GEOF102.tray.h), support: 'tray' })),
    // E — filtros y sensor de movimiento
    O({ id: 'motionSensor01', kind: 'motionSensor', pose: P(TW.x, TW.y, TW.sensorZ), movable: false }),
    ...FILTERS.map((id, i) => O({ id, kind: 'filter', pose: filterRest(i) })),
  ];
}
