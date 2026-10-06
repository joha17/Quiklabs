/**
 * Práctica 6 — estaciones, instrumental y posiciones iniciales (§4, §5). Mesada de 560 cm; la campana cubre la
 * bomba calorimétrica y el lavadero (x ≈ 352–552), como en las prácticas 3 a 5.
 */
import type { P6ObjKind, Pose, WaterVessel } from '../../simulation/calorimetry-world/types';

export type P6Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH6 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface P6Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  azimuth?: number;
}

/** §4.1 — preparación y balanza, calorímetro, baño térmico, bomba calorimétrica, lavadero. */
export const P6_STATIONS: P6Station[] = [
  { id: 'A', target: [84, 36, 10], dist: 122, elevation: 0.36 },
  { id: 'B', target: [205, 34, 8], dist: 70, elevation: 0.36 },
  { id: 'C', target: [305, 36, 12], dist: 80, elevation: 0.32 },
  { id: 'D', target: [432, 40, 14], dist: 100, elevation: 0.34 },
  { id: 'E', target: [520, 36, 8], dist: 70, elevation: 0.4 },
];

export const BALANCE_POS6 = { x: 96, y: 40 };
export const BALANCE_GEO6 = { panDx: -16, panDy: 0, panZ: 9.5, beamZ: 13, beamLen: 30, pointerDx: 17 };
export const RACK_POS6 = { x: 30, y: 38 };
export const CUP_POS = { x: 205, y: 36 };
export const PLATE_POS = { x: 305, y: 40 };
export const PLATE_TOP = 8;
export const SINK_POS = { x: 522, y: 40 };

/** Geometría de los recipientes (cm): radio interior y altura útil. */
export const GEO6 = {
  cylinder: { r: 1.33, h: 19, floor: 1.4, baseR: 3.2 },
  cup: { r: 3.6, h: 9.5, floor: 0.8, outerR: 4.4 },
  beaker: { r: 3.7, h: 10.5, floor: 0.4, outerR: 3.9 },
  bottle: { r: 6, h: 24 },
  wash: { r: 3, h: 12 },
  tube: { length: 15, outerR: 1.0, wall: 0.1 },
  plate: { w: 18, d: 18, h: PLATE_TOP },
  sink: { r: 12, h: 10 },
};

export function buildObjects6(): Array<{ id: string; kind: P6ObjKind; pose: Pose; support: string; movable: boolean }> {
  return [
    { id: 'balance', kind: 'balance', pose: P(BALANCE_POS6.x, BALANCE_POS6.y), support: 'bench', movable: false },
    { id: 'rack', kind: 'rack', pose: P(RACK_POS6.x, RACK_POS6.y), support: 'bench', movable: false },
    { id: 'tube_fe', kind: 'tube', pose: P(RACK_POS6.x - 3, RACK_POS6.y, 0.6), support: 'rack', movable: true },
    { id: 'tube_x', kind: 'tube', pose: P(RACK_POS6.x + 3, RACK_POS6.y, 0.6), support: 'rack', movable: true },
    { id: 'jar_fe', kind: 'jar', pose: P(46, 54), support: 'bench', movable: false },
    { id: 'jar_x', kind: 'jar', pose: P(60, 54), support: 'bench', movable: false },
    { id: 'spatula', kind: 'spatula', pose: P(50, 16, 0.3), support: 'bench', movable: true },
    { id: 'cylinder', kind: 'cylinder', pose: P(130, 24), support: 'bench', movable: true },
    { id: 'water_bottle', kind: 'waterBottle', pose: P(150, 52), support: 'bench', movable: true },
    { id: 'wash', kind: 'washBottle', pose: P(160, 22), support: 'bench', movable: true },
    { id: 'cup', kind: 'cup', pose: P(CUP_POS.x, CUP_POS.y), support: 'bench', movable: false },
    { id: 'therm_cal', kind: 'thermometer', pose: P(190, 16, 0.6), support: 'bench', movable: true },
    { id: 'stirrer', kind: 'stirrer', pose: P(222, 16, 0.4), support: 'bench', movable: true },
    { id: 'towel', kind: 'towel', pose: P(244, 20), support: 'bench', movable: true },
    { id: 'hotplate', kind: 'hotplate', pose: P(PLATE_POS.x, PLATE_POS.y), support: 'bench', movable: false },
    { id: 'beaker', kind: 'beaker', pose: P(280, 22), support: 'bench', movable: true },
    { id: 'therm_bath', kind: 'thermometer', pose: P(334, 16, 0.6), support: 'bench', movable: true },
    { id: 'tongs', kind: 'tubeTongs', pose: P(268, 12, 0.4), support: 'bench', movable: true },
    { id: 'bomb_unit', kind: 'bombUnit', pose: P(440, 44), support: 'bench', movable: false },
    { id: 'bomb', kind: 'bomb', pose: P(408, 28), support: 'bench', movable: true },
    { id: 'oxygen', kind: 'oxygen', pose: P(476, 58), support: 'bench', movable: false },
    { id: 'abalance', kind: 'analyticBalance', pose: P(392, 52), support: 'bench', movable: false },
    { id: 'food_dish', kind: 'foodDish', pose: P(388, 30), support: 'bench', movable: false },
    { id: 'sink', kind: 'sink', pose: P(SINK_POS.x, SINK_POS.y), support: 'bench', movable: false },
  ];
}

export function buildVessels6(cylinderGlassG: number): WaterVessel[] {
  const v = (id: string, capacityMl: number, glassMassG: number, glassCp: number, waterG: number, r: number, floorCm: number): WaterVessel => ({
    id, capacityMl, glassMassG, glassCp, waterG, waterC: 0, wetG: 0, areaCm2: Math.PI * r * r, floorCm,
  });
  return [
    v('water_bottle', 2000, 380, 1.6, 1800, GEO6.bottle.r, 0.5),
    v('wash', 500, 60, 1.6, 400, GEO6.wash.r, 0.4),
    v('cylinder', 100, cylinderGlassG, 0.84, 0, GEO6.cylinder.r, GEO6.cylinder.floor),
    v('cup', 250, 6, 1.3, 0, GEO6.cup.r, GEO6.cup.floor),
    v('beaker', 400, 150, 0.84, 0, GEO6.beaker.r, GEO6.beaker.floor),
    v('sink', 100000, 0, 1, 0, GEO6.sink.r, 0),
  ];
}
