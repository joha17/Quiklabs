/**
 * Práctica 10 — estaciones, instrumental y posiciones iniciales (§5, §6). Mesada de 560 cm como en las prácticas
 * anteriores; la campana no se usa (no hay calentamiento ni gases peligrosos).
 */
import type { LiquidVessel, P10ObjKind, Pose } from '../../simulation/gas-world/types';
import { GEO10 } from '../../simulation/gas-world/geometry';

export type P10Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH10 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface P10Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
}

/** §5.1 — gravimetría, volumetría, reactor, recolección de gas (con metrología), ley de Boyle, lavadero. */
export const P10_STATIONS: P10Station[] = [
  { id: 'A', target: [62, 38, 10], dist: 90, elevation: 0.38 },
  { id: 'B', target: [150, 36, 12], dist: 95, elevation: 0.36 },
  { id: 'C', target: [240, 36, 12], dist: 85, elevation: 0.34 },
  { id: 'D', target: [335, 38, 26], dist: 110, elevation: 0.22 },
  { id: 'E', target: [440, 36, 10], dist: 80, elevation: 0.36 },
  { id: 'F', target: [522, 38, 8], dist: 70, elevation: 0.4 },
];

export const ABALANCE_POS = { x: 70, y: 44 };
/** Platillo de la balanza analítica (dentro de la cabina). */
export const ABALANCE_PAN = { x: 70, y: 42, z: 7.5 };
export const ERLEN_POS = { x: 240, y: 32 };
export const BATH_POS = { x: 332, y: 34 };
export const STAND_POS = { x: 332, y: 48 };
export const SENSOR_POS = { x: 440, y: 42 };
export const SINK_POS10 = { x: 522, y: 40 };

export function buildObjects10(): Array<{ id: string; kind: P10ObjKind; pose: Pose; support: string; movable: boolean }> {
  return [
    // A — gravimetría
    { id: 'abalance', kind: 'abalance', pose: P(ABALANCE_POS.x, ABALANCE_POS.y), support: 'bench', movable: false },
    { id: 'watch_glass', kind: 'watchGlass', pose: P(38, 22, 0), support: 'bench', movable: true },
    { id: 'spatula', kind: 'spatula', pose: P(28, 12, 0.3), support: 'bench', movable: true },
    { id: 'bicarb_jar', kind: 'bicarbJar', pose: P(40, 54), support: 'bench', movable: false },
    // B — volumetría
    { id: 'beaker150', kind: 'beaker150', pose: P(122, 24), support: 'bench', movable: true },
    { id: 'funnel', kind: 'funnel', pose: P(140, 12, 0), support: 'bench', movable: true },
    { id: 'flask', kind: 'flask', pose: P(160, 40), support: 'bench', movable: true },
    { id: 'pipette', kind: 'pipette', pose: P(182, 14, 0.6), support: 'bench', movable: true },
    { id: 'propipette', kind: 'propipette', pose: P(196, 14, 0.4), support: 'bench', movable: true },
    { id: 'wash', kind: 'washBottle', pose: P(104, 30), support: 'bench', movable: true },
    { id: 'water_bottle', kind: 'waterBottle', pose: P(104, 54), support: 'bench', movable: true },
    // C — reactor
    { id: 'erlenmeyer', kind: 'erlenmeyer', pose: P(ERLEN_POS.x, ERLEN_POS.y), support: 'bench', movable: true },
    { id: 'stopper', kind: 'stopper', pose: P(258, 16, 0), support: 'bench', movable: true },
    { id: 'vinegar_bottle', kind: 'vinegarBottle', pose: P(214, 54), support: 'bench', movable: true },
    { id: 'cylinder', kind: 'cylinder', pose: P(218, 22), support: 'bench', movable: true },
    { id: 'waste', kind: 'beaker600', pose: P(274, 54), support: 'bench', movable: false },
    // D — recolección de gas y metrología
    { id: 'stand', kind: 'stand', pose: P(STAND_POS.x, STAND_POS.y), support: 'bench', movable: false },
    { id: 'beaker600', kind: 'beaker600', pose: P(BATH_POS.x, BATH_POS.y), support: 'bench', movable: false },
    { id: 'burette', kind: 'burette', pose: P(300, 14, 0.7, Math.PI / 2), support: 'bench', movable: true },
    { id: 'u_tube', kind: 'uTube', pose: P(352, 14, 0.4), support: 'bench', movable: true },
    { id: 'tap_jug', kind: 'waterBottle', pose: P(306, 56), support: 'bench', movable: true },
    { id: 'thermometer', kind: 'thermometer', pose: P(364, 16, 0.6), support: 'bench', movable: true },
    { id: 'barometer', kind: 'barometer', pose: P(378, 60, 30), support: 'wall', movable: false },
    { id: 'ruler', kind: 'ruler', pose: P(316, 20, 0.2), support: 'bench', movable: true },
    // E — ley de Boyle
    { id: 'sensor', kind: 'sensor', pose: P(SENSOR_POS.x, SENSOR_POS.y), support: 'bench', movable: false },
    { id: 'datalogger', kind: 'datalogger', pose: P(466, 52), support: 'bench', movable: false },
    { id: 'syringe', kind: 'syringe', pose: P(424, 22, 1.1), support: 'bench', movable: true },
    // F — lavadero
    { id: 'sink', kind: 'sink', pose: P(SINK_POS10.x, SINK_POS10.y), support: 'bench', movable: false },
  ];
}

export function buildLiquids10(opts: { flaskMl: number; vinegarAcidMol: number; vinegarMl: number }): LiquidVessel[] {
  const L = (id: string, capacityMl: number, ml: number, r: number, floorCm: number, extra: Partial<LiquidVessel> = {}): LiquidVessel => ({
    id, capacityMl, ml, wetMl: 0, nBicarb: 0, nAcid: 0, nAcetate: 0, nCo2Aq: 0, solidBicarbG: 0, tempC: 0, areaCm2: Math.PI * r * r, floorCm, ...extra,
  });
  return [
    L('wash', 500, 420, 3, 0.4),
    L('water_bottle', 1000, 900, 4.6, 0.5),
    L('tap_jug', 1500, 1000, 5.5, 0.5),
    L('vinegar_bottle', 500, opts.vinegarMl, 3.6, 0.5, { nAcid: opts.vinegarAcidMol }),
    L('beaker150', 150, 0, GEO10.beaker150.r, GEO10.beaker150.floor),
    L('funnel', 5, 0, 1, 0),
    L('flask', opts.flaskMl, 0, GEO10.flask.bulbR, 0.4),
    L('cylinder', 27, 0, Math.sqrt(GEO10.cylinder.areaCm2 / Math.PI), GEO10.cylinder.floor),
    L('erlenmeyer', 262, 0, GEO10.erlenmeyer.baseR, 0.4),
    L('beaker600', 650, 0, GEO10.beaker600.r, GEO10.beaker600.floor),
    L('waste', 600, 0, 4.3, 0.5),
    L('sink', 1e6, 0, 12, 0),
    L('spill', 1e6, 0, 30, 0),
  ];
}
