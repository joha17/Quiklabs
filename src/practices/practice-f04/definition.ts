/**
 * F04 — estaciones e instrumental sobre la mesada de 560 × 64 cm (decisión F04-1). El carril de 160 cm ocupa el tramo
 * izquierdo con la polea fuera del borde; la pareja de carros tiene su pista corta a la derecha y la balanza, el
 * registrador y el estante de pesas quedan detrás del carril, fuera de su camino.
 * A: carril, carro, freno y topes · B: polea y masas · C: sensores e interfaz · D: acción-reacción · E: balanza,
 * fotopuertas y pestillo · F: análisis con diagramas de cuerpo libre.
 */
import type { F04Object, F04ObjKind, Pose } from '../../simulation/f04-world/types';
import { CART_START_S, FLOOR_Z, GEOF04, trackX } from '../../simulation/f04-world/geometry';
import { SLOT_MASSES } from '../../simulation/f04-world/world';

export type F04Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F04 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F04Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const T = GEOF04.track;
const PT = GEOF04.pairTrack;

export const F04_STATIONS: F04Station[] = [
  { id: 'A', target: [88, T.y, 6], dist: 175, elevation: 0.35 },
  { id: 'B', target: [12, T.y, -6], dist: 110, elevation: 0.38, azimuth: 0.4 },
  { id: 'C', target: [180, 34, 8], dist: 80, elevation: 0.5 },
  { id: 'D', target: [(PT.x0 + PT.x1) / 2, PT.y, 5], dist: 85, elevation: 0.35 },
  { id: 'E', target: [GEOF04.balance.x - 15, 38, 6], dist: 80, elevation: 0.45 },
  { id: 'F', target: [90, T.y, 10], dist: 150, elevation: 0.25 },
];

type ObjSpec = { id: string; kind: F04ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F04Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = GEOF04.massRack;
const rackPose = (i: number): Pose => P(R.x - R.w / 2 + 3 + i * 4.5, R.y, R.h);

export function buildObjectsF04(): F04Object[] {
  const cx = trackX(CART_START_S);
  return [
    O({ id: 'track01', kind: 'track', pose: P(trackX(0.8), T.y, 0) }),
    O({ id: 'cart01', kind: 'cart', pose: P(cx, T.y, T.railZ), support: 'track' }),
    O({ id: 'latch01', kind: 'latch', pose: P(trackX(GEOF04.latch.s), T.y, T.railZ) }),
    O({ id: 'brake01', kind: 'brake', pose: P(trackX(1.27), T.y, T.railZ) }),
    O({ id: 'stop01', kind: 'stop', pose: P(trackX(GEOF04.stop.s), T.y, T.railZ) }),
    O({ id: 'pulley01', kind: 'pulley', pose: P(GEOF04.pulley.x, T.y, GEOF04.pulley.axisZ) }),
    O({ id: 'hanger01', kind: 'hanger', pose: P(R.x + R.w / 2 + 6, R.y, 0), support: 'rack', movable: true }),
    ...SLOT_MASSES.map((id, i) => O({ id, kind: 'slotMass', pose: rackPose(i), support: 'rack', movable: true })),
    O({ id: 'massRack01', kind: 'massRack', pose: P(R.x, R.y, 0) }),
    O({ id: 'forceA', kind: 'forceSensor', pose: P(cx - 6, T.y, T.railZ + 4), support: 'cart01' }),
    O({ id: 'accel01', kind: 'accelerometer', pose: P(cx + 3, T.y, T.railZ + 4), support: 'cart01' }),
    O({ id: 'logger01', kind: 'logger', pose: P(GEOF04.logger.x, GEOF04.logger.y, 0) }),
    O({ id: 'gate1', kind: 'gate', pose: P(trackX(0.3), T.y, T.railZ), support: 'track' }),
    O({ id: 'gate2', kind: 'gate', pose: P(trackX(0.7), T.y, T.railZ), support: 'track' }),
    O({ id: 'balance01', kind: 'balance', pose: P(GEOF04.balance.x, GEOF04.balance.y, 0) }),
    O({ id: 'pairTrack01', kind: 'pairTrack', pose: P((PT.x0 + PT.x1) / 2, PT.y, 0) }),
    O({ id: 'cartP', kind: 'pairCart', pose: P(PT.x0 + 30, PT.y, PT.railZ), support: 'pairTrack' }),
    O({ id: 'cartQ', kind: 'pairCart', pose: P(PT.x0 + 45, PT.y, PT.railZ), support: 'pairTrack' }),
    O({ id: 'dynP', kind: 'forceSensor', pose: P(PT.x0 + 36, PT.y, PT.railZ + 4), support: 'cartP' }),
    O({ id: 'dynQ', kind: 'forceSensor', pose: P(PT.x0 + 39, PT.y, PT.railZ + 4), support: 'cartQ' }),
  ];
}

export { FLOOR_Z };
