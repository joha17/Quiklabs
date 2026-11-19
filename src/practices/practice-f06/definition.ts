/**
 * F06 — estaciones e instrumental sobre la mesada de 340 × 64 cm (decisión F06-1). El soporte del resorte con su regla
 * ocupa el extremo izquierdo junto al estante de pesas y la balanza; el riel de 180 cm con el lanzador, los sensores
 * de fuerza y posición, las compuertas, el medidor de altura y el tramo de pérdidas va en el centro, delante; el péndulo
 * oscila a lo largo de la mesada en el fondo derecho, fuera del recorrido del carro.
 * A: resortes · B: carro de energía · C: péndulo · D: fuerzas (sensores en el lanzador) · E: disipación · F: libreta.
 */
import type { F06Object, F06ObjKind, Pose } from '../../simulation/f06-world/types';
import { CART_START_S, GEOF06, trackPoint } from '../../simulation/f06-world/geometry';

export type F06Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F06 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F06Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const TR = GEOF06.track;
const ST = GEOF06.stand;
const PD = GEOF06.pend;

export const F06_STATIONS: F06Station[] = [
  { id: 'A', target: [56, 34, 64], dist: 215, elevation: 0.15 },
  { id: 'B', target: [190, TR.y, 18], dist: 200, elevation: 0.3 },
  { id: 'C', target: [300, 40, 72], dist: 250, elevation: 0.12, azimuth: 0.35 },
  { id: 'D', target: [118, TR.y + 6, 14], dist: 70, elevation: 0.35, azimuth: 0.35 },
  { id: 'E', target: [200, TR.y, 22], dist: 110, elevation: 0.32 },
  { id: 'F', target: [170, 32, 40], dist: 300, elevation: 0.25 },
];

type ObjSpec = { id: string; kind: F06ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F06Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = GEOF06.massRack;

export function buildObjectsF06(): F06Object[] {
  const t = (s: number, up = 0) => trackPoint(s, 0, up);
  const lossMid = (GEOF06.loss.s0 + GEOF06.loss.s1) / 2;
  return [
    O({ id: 'stand01', kind: 'stand', pose: P(ST.x, ST.y, 0) }),
    O({ id: 'ruler01', kind: 'ruler', pose: P(GEOF06.ruler.x, GEOF06.ruler.y, GEOF06.ruler.z0), support: 'stand' }),
    O({ id: 'spring01', kind: 'spring', pose: P(ST.x, ST.hookY, ST.hookZ), support: 'stand' }),
    O({ id: 'spring02', kind: 'spring', pose: P(R.x + 12, R.y, R.h), support: 'rack' }),
    O({ id: 'hanger01', kind: 'hanger', pose: P(R.x - 12, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'm100a', kind: 'slotMass', pose: P(R.x - 7, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'm100b', kind: 'slotMass', pose: P(R.x - 2, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'm100c', kind: 'slotMass', pose: P(R.x + 3, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'm100d', kind: 'slotMass', pose: P(R.x + 8, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'massRack01', kind: 'massRack', pose: P(R.x, R.y, 0) }),
    O({ id: 'balance01', kind: 'balance', pose: P(GEOF06.balance.x, GEOF06.balance.y, 0) }),
    O({ id: 'track01', kind: 'track', pose: P(TR.x0 + TR.len * 50, TR.y, 0) }),
    O({ id: 'launcher01', kind: 'launcher', pose: P(t(0.1).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'cart01', kind: 'cart', pose: P(t(CART_START_S).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'cw1', kind: 'cartMass', pose: P(R.x - 9, R.y - 6, R.h), support: 'rack', movable: true }),
    O({ id: 'cw2', kind: 'cartMass', pose: P(R.x + 9, R.y - 6, R.h), support: 'rack', movable: true }),
    O({ id: 'brake01', kind: 'brake', pose: P(t(GEOF06.brake.s0).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'gauge01', kind: 'gauge', pose: P(t(GEOF06.gauge.s).x, GEOF06.gauge.y, 0) }),
    O({ id: 'gate1', kind: 'gate', pose: P(t(GEOF06.gate.s1).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'gate2', kind: 'gate', pose: P(t(GEOF06.gate.s2).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'pad01', kind: 'pad', pose: P(t(lossMid).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'damper01', kind: 'damper', pose: P(t(lossMid).x, TR.y, TR.z0), support: 'track' }),
    O({ id: 'force01', kind: 'forceSensor', pose: P(t(0.01).x, TR.y, TR.z0 + 3), support: 'launcher01' }),
    O({ id: 'pos01', kind: 'posSensor', pose: P(t(0.01).x, TR.y, TR.z0 + 9), support: 'launcher01' }),
    O({ id: 'logger01', kind: 'logger', pose: P(GEOF06.logger.x, GEOF06.logger.y, 0) }),
    O({ id: 'pend01', kind: 'pendulum', pose: P(PD.x, PD.y, 0) }),
    O({ id: 'angle01', kind: 'angleSensor', pose: P(PD.x, PD.y, PD.pivotZ), support: 'pend01' }),
    O({ id: 'gate3', kind: 'gate', pose: P(PD.x, PD.y, PD.pivotZ - PD.maxL * 100), support: 'pend01' }),
  ];
}
