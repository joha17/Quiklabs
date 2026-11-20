/**
 * F10 — estaciones e instrumental sobre la mesada de 340 × 64 cm. El riel con los dos apoyos y la viga ocupa la
 * izquierda (con la cuña de equilibrio delante), el pórtico del dinamómetro y el estante de cargas el centro, y la prensa
 * de tracción con su protector, el comparador y el registrador la derecha.
 * A: viga y apoyos · B: cargas y dinamómetro · C: prensa y probeta · D: comparador, celda y registrador · E: cuña,
 * nivel, cinta y calibre · F: análisis.
 */
import type { F10Object, F10ObjKind, Pose } from '../../simulation/f10-world/types';
import { GEOF10 } from '../../simulation/f10-world/geometry';

export type F10Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F10 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F10Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const G = GEOF10;

export const F10_STATIONS: F10Station[] = [
  { id: 'A', target: [G.beam.x0 + 60, G.beam.y, 22], dist: 175, elevation: 0.32 },
  { id: 'B', target: [238, 26, 30], dist: 230, elevation: 0.3, azimuth: 0.05 },
  { id: 'C', target: [G.press.x + 4, G.press.y, 40], dist: 175, elevation: 0.22, azimuth: -0.2 },
  { id: 'D', target: [G.press.x - 6, G.press.y - 4, G.press.gaugeZ], dist: 70, elevation: 0.25, azimuth: 0.3 },
  { id: 'E', target: [G.wedge.x + 5, 14, 6], dist: 230, elevation: 0.6 },
  { id: 'F', target: [170, 32, 20], dist: 340, elevation: 0.3 },
];

type ObjSpec = { id: string; kind: F10ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F10Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const R = G.loadRack;
const PR = G.press;

export function buildObjectsF10(): F10Object[] {
  return [
    O({ id: 'rail01', kind: 'rail', pose: P((G.rail.x0 + G.rail.x1) / 2, G.rail.y, 0) }),
    O({ id: 'beam01', kind: 'beam', pose: P(G.beam.x0 + G.beam.len / 2, G.store.y, G.store.z), movable: true }),
    O({ id: 'supportA', kind: 'support', pose: P(G.beam.x0 + 30, G.rail.y, G.rail.h), support: 'rail01' }),
    O({ id: 'supportB', kind: 'support', pose: P(G.beam.x0 + 90, G.rail.y, G.rail.h), support: 'rail01' }),
    O({ id: 'wedge01', kind: 'wedge', pose: P(G.wedge.x, G.wedge.y, 0) }),
    O({ id: 'level01', kind: 'level', pose: P(G.level.x, G.level.y, 0), movable: true }),
    O({ id: 'tape01', kind: 'tape', pose: P(G.tape.x, G.tape.y, 0), movable: true }),
    O({ id: 'gantry01', kind: 'gantry', pose: P(G.gantry.x, G.gantry.y, 0) }),
    O({ id: 'dyn01', kind: 'dynamometer', pose: P(G.gantry.x, G.gantry.y, G.gantry.hookZ - G.gantry.dynLen), support: 'gantry01' }),
    O({ id: 'rack01', kind: 'rack', pose: P(R.x, R.y, 0) }),
    O({ id: 'load1', kind: 'load', pose: P(R.x - 8, R.y, R.h), support: 'rack', movable: true }),
    O({ id: 'caliper01', kind: 'caliper', pose: P(G.caliper.x, G.caliper.y, 0), movable: true }),
    O({ id: 'spec1', kind: 'specimen', pose: P(R.x + 6, R.y, R.h), support: 'rack' }),
    O({ id: 'spec2', kind: 'specimen', pose: P(R.x + 10, R.y, R.h), support: 'rack' }),
    O({ id: 'press01', kind: 'press', pose: P(PR.x, PR.y, 0) }),
    O({ id: 'gripTop', kind: 'grip', pose: P(PR.x, PR.y, PR.gripTop), support: 'press01' }),
    O({ id: 'gripBottom', kind: 'grip', pose: P(PR.x, PR.y, PR.gripBot), support: 'press01' }),
    O({ id: 'crank01', kind: 'crank', pose: P(PR.crankX, PR.y, PR.crankZ), support: 'press01' }),
    O({ id: 'loadCell01', kind: 'loadCell', pose: P(PR.x, PR.y, PR.cellTop), support: 'press01' }),
    O({ id: 'gauge01', kind: 'gauge', pose: P(PR.x - 3, PR.y - 3, PR.gaugeZ), support: 'press01' }),
    O({ id: 'shield01', kind: 'shield', pose: P(PR.x, G.shield.y, 0), support: 'press01' }),
    O({ id: 'logger01', kind: 'logger', pose: P(G.logger.x, G.logger.y, 0) }),
  ];
}
