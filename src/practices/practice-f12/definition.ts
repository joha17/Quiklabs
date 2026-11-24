/**
 * F12 — estaciones e instrumental sobre la mesada de 340 × 64 cm. El depósito colector, la bomba y el caudalímetro a
 * la izquierda; el Venturi con sus abrazaderas, el tramo intercambiable y la pieza de la toma 3 con la purga en el
 * centro, con el panel de sensores y el registrador detrás; la válvula, el desviador con el vaso volumétrico y el
 * cronómetro a la derecha, junto a la caja de juntas, el tramo de repuesto, el calibre con la pieza de corte, la sonda
 * de Pitot, el tapón y la toalla.
 * A: circuito · B: Venturi · C: bomba y válvula · D: presiones · E: caudal · F: registro.
 */
import type { F12Object, F12ObjKind, Pose } from '../../simulation/f12-world/types';
import { GEOF12 } from '../../simulation/f12-world/geometry';

export type F12Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH_F12 = { length: 340, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface F12Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

const G = GEOF12;
const Z = G.axisZ;
const Y = G.pipeY;

export const F12_STATIONS: F12Station[] = [
  { id: 'A', target: [70, 30, 16], dist: 175, elevation: 0.35, azimuth: 0.05 },
  { id: 'B', target: [138, Y, Z], dist: 92, elevation: 0.22 },
  { id: 'C', target: [84, 30, 14], dist: 100, elevation: 0.3, azimuth: 0.1 },
  { id: 'D', target: [178, 40, 22], dist: 120, elevation: 0.3 },
  { id: 'E', target: [262, 22, 16], dist: 115, elevation: 0.32, azimuth: -0.05 },
  { id: 'F', target: [170, 32, 20], dist: 340, elevation: 0.3 },
];

type ObjSpec = { id: string; kind: F12ObjKind; pose: Pose; support?: string; movable?: boolean };
const O = (s: ObjSpec): F12Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? false });

const V = G.venturi;

export function buildObjectsF12(): F12Object[] {
  return [
    O({ id: 'sump01', kind: 'sump', pose: P(G.sump.x, G.sump.y, 0) }),
    O({ id: 'pump01', kind: 'pump', pose: P(G.pump.x, G.pump.y, 0) }),
    O({ id: 'meter01', kind: 'meter', pose: P(G.meter.x, Y, Z) }),
    O({ id: 'jointJ1', kind: 'joint', pose: P(G.j1, Y, Z) }),
    O({ id: 'venturi01', kind: 'venturi', pose: P(V.x0 + 30, Y, Z) }),
    O({ id: 'clamp01', kind: 'clamp', pose: P(V.x0 + 30, Y, Z - 4) }),
    O({ id: 'tap1', kind: 'tapPiece', pose: P(G.tapX[1], Y, Z) }),
    O({ id: 'tap2', kind: 'tapPiece', pose: P(G.tapX[2], Y, Z) }),
    O({ id: 'jointJ2', kind: 'joint', pose: P(G.j2, Y, Z) }),
    O({ id: 'spool01', kind: 'spool', pose: P(G.spool.x0 + G.spool.L / 2, Y, Z) }),
    O({ id: 'tap3', kind: 'tapPiece', pose: P(G.tapX[3], Y, Z) }),
    O({ id: 'purge01', kind: 'purge', pose: P(G.purgeX, Y, Z + 3) }),
    O({ id: 'jointJ3', kind: 'joint', pose: P(G.j3, Y, Z) }),
    O({ id: 'valve01', kind: 'valve', pose: P(G.valve.x, Y, Z) }),
    O({ id: 'outlet01', kind: 'outlet', pose: P(G.outlet.x, G.outlet.y, G.outlet.z) }),
    O({ id: 'beaker01', kind: 'beaker', pose: P(G.beakerBench.x, G.beakerBench.y, 0), movable: true }),
    O({ id: 'timer01', kind: 'timer', pose: P(G.timer.x, G.timer.y, 0) }),
    O({ id: 'panel01', kind: 'panel', pose: P(G.panel.x, G.panel.y, 0) }),
    O({ id: 'logger01', kind: 'logger', pose: P(G.panel.x + 36, G.panel.y - 2, 0) }),
    O({ id: 'ruler01', kind: 'ruler', pose: P(G.ruler.x, G.ruler.y, 0) }),
    O({ id: 'gaskets01', kind: 'gaskets', pose: P(G.gaskets.x, G.gaskets.y, 0) }),
    O({ id: 'spare01', kind: 'spare', pose: P(G.spoolRack.x, G.spoolRack.y, 0) }),
    O({ id: 'caliper01', kind: 'caliper', pose: P(G.caliper.x, G.caliper.y, 0) }),
    O({ id: 'sample01', kind: 'sample', pose: P(G.sample.x, G.sample.y, 0) }),
    O({ id: 'pitot01', kind: 'pitot', pose: P(G.pitot.x, G.pitot.y, 0) }),
    O({ id: 'stopper01', kind: 'stopper', pose: P(G.stopper.x, G.stopper.y, 0), movable: true }),
    O({ id: 'towel01', kind: 'towel', pose: P(G.towel.x, G.towel.y, 0) }),
  ];
}
