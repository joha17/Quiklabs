/**
 * Práctica 1 — estaciones, instrumental y posiciones iniciales (§4). Mesada de 560 cm como en las demás prácticas.
 * A: reconocimiento y criterio metrológico · B: agua a dos temperaturas · C: clavos por desplazamiento ·
 * D: cilindro por geometría · E: análisis · F: entrega. La balanza es una sola, compartida por B, C y D (§4.2).
 */
import type { NailPiece, P01Object, P01ObjKind, Pose, WaterBody } from '../../simulation/density-world/types';
import { CYL_AREA, GEO01, areaOf } from '../../simulation/density-world/geometry';
import { hashRandom } from '../../simulation/core/rng';
import { rhoWaterClamped } from '../../simulation/density-models/water';
import type { P01Params } from '../../simulation/density-world/types';

export type P01Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH01 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface P01Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
}

export const P01_STATIONS: P01Station[] = [
  { id: 'A', target: [46, 34, 8], dist: 100, elevation: 0.42 },
  { id: 'B', target: [150, 32, 10], dist: 115, elevation: 0.4 },
  { id: 'C', target: [250, 32, 9], dist: 85, elevation: 0.36 },
  { id: 'D', target: [352, 28, 5], dist: 70, elevation: 0.5 },
  { id: 'E', target: [448, 34, 10], dist: 90, elevation: 0.4 },
  { id: 'F', target: [525, 34, 10], dist: 90, elevation: 0.4 },
];

/** Balanza compartida (entre B y C) y su platillo. */
export const BALANCE_POS = { x: 205, y: 46 };
export const PAN_POS = { x: 205, y: 44, z: GEO01.balance.panZ };
export const ICE_BATH_POS = { x: 120, y: 50 };
export const SPILL_TRAY_POS = { x: 262, y: 34 };

type ObjSpec = { id: string; kind: P01ObjKind; pose: Pose; support?: string; movable?: boolean; damaged?: boolean };

const O = (s: ObjSpec): P01Object => ({ id: s.id, kind: s.kind, pose: s.pose, support: s.support ?? 'bench', movable: s.movable ?? true, damaged: s.damaged });

export function buildObjects01(): P01Object[] {
  return [
    // A — reconocimiento (observables y seleccionables; no simulan funciones que no tienen)
    O({ id: 'rec_analytical', kind: 'recAnalytical', pose: P(20, 46), movable: false }),
    O({ id: 'rec_burette', kind: 'recBurette', pose: P(40, 52), movable: false }),
    O({ id: 'rec_tubes', kind: 'recTubes', pose: P(58, 44), movable: false }),
    O({ id: 'rec_beaker', kind: 'recBeaker', pose: P(74, 34), movable: false }),
    O({ id: 'rec_funnel', kind: 'recFunnel', pose: P(30, 22), movable: false }),
    O({ id: 'rec_filter', kind: 'recFilter', pose: P(48, 18), movable: false }),
    O({ id: 'rec_spatula', kind: 'recSpatula', pose: P(66, 14, 0.3), movable: false }),
    O({ id: 'rec_ruler', kind: 'recRuler', pose: P(82, 10, 0.2), movable: false }),
    // B — agua a dos temperaturas
    O({ id: 'washBottle', kind: 'washBottle', pose: P(100, 12) }),
    O({ id: 'waterRoom01', kind: 'reservoir', pose: P(110, 26) }),
    O({ id: 'waterCold01', kind: 'reservoir', pose: P(128, 26) }),
    O({ id: 'iceBath01', kind: 'iceBath', pose: P(ICE_BATH_POS.x, ICE_BATH_POS.y), movable: false }),
    O({ id: 'pipette25', kind: 'pipette', pose: P(146, 10, 0.6) }),
    O({ id: 'pipetteFiller', kind: 'filler', pose: P(162, 10, 0.4) }),
    O({ id: 'thermometer01', kind: 'thermometer', pose: P(150, 24, 0.6) }),
    O({ id: 'erlenmeyer150', kind: 'erlenmeyer', pose: P(172, 24) }),
    O({ id: 'erlenmeyer150b', kind: 'erlenmeyer', pose: P(186, 14), damaged: true }),
    O({ id: 'waste01', kind: 'waste', pose: P(170, 54), movable: false }),
    O({ id: 'balance01', kind: 'balance', pose: P(BALANCE_POS.x, BALANCE_POS.y), movable: false }),
    // C — clavos por desplazamiento
    O({ id: 'nailsBatch01', kind: 'nailsDish', pose: P(234, 18) }),
    O({ id: 'weighBoat01', kind: 'weighBoat', pose: P(248, 12, 0.1) }),
    O({ id: 'spillTray01', kind: 'spillTray', pose: P(SPILL_TRAY_POS.x, SPILL_TRAY_POS.y), movable: false }),
    O({ id: 'cylinder50', kind: 'cylinder', pose: P(SPILL_TRAY_POS.x, SPILL_TRAY_POS.y, 0.35) }),
    // D — cilindro por geometría
    O({ id: 'watchGlass01', kind: 'watchGlass', pose: P(338, 28) }),
    O({ id: 'solidCylinder01', kind: 'solidCylinder', pose: P(352, 40) }),
    O({ id: 'caliper01', kind: 'caliper', pose: P(368, 16, 0.4) }),
  ];
}

const water = (id: string, ml: number, cap: number, brim: number, area: number, floor: number, glassG: number, tC: number): WaterBody => ({
  id, capacityMl: cap, brimMl: brim, waterG: ml * rhoWaterClamped(tC), tempC: tC, wetG: 0, areaCm2: area, floorCm: floor, glassG,
});

export function buildFluids01(p: P01Params, seed: number): WaterBody[] {
  const T = p.roomTempC;
  const R = GEO01.reservoir;
  const flaskG = Math.round((p.erlenmeyerMassG + (hashRandom(seed, 'erl') - 0.5) * 3) * 100) / 100;
  return [
    water('waterRoom01', p.ambientWaterInitialMl, 300, 330, areaOf(R.r), R.floor, 118, T),
    water('waterCold01', p.coldWaterInitialMl, 300, 330, areaOf(R.r), R.floor, 118, T),
    water('washBottle', 240, 250, 260, areaOf(GEO01.washBottle.r), 0.3, 0, T),
    water('erlenmeyer150', 0, 150, 180, areaOf(GEO01.erlenmeyer150.baseR) * 0.8, 0.3, flaskG, T),
    water('erlenmeyer150b', 0, 150, 180, areaOf(GEO01.erlenmeyer150.baseR) * 0.8, 0.3, flaskG + 1.3, T),
    water('cylinder50', 0, p.graduatedCylinderCapacityMl, 56, CYL_AREA, GEO01.cylinder50.floor, 96, T),
    water('waste01', 0, 600, 640, areaOf(GEO01.waste.r), GEO01.waste.floor, 0, T),
    water('spillTray01', 0, 1000, 1200, GEO01.spillTray.w * GEO01.spillTray.d, 0.2, 0, T),
    water('benchSpill', 0, 5000, 5000, 400, 0, 0, T),
  ];
}

/** Lote de 6 clavos de hierro idealizado (§3.5): masas parecidas, total cercano a la meta. En S11 uno es distinto. */
export function buildNails01(p: P01Params, seed: number, mixed: boolean): NailPiece[] {
  const n = 6;
  const raw = Array.from({ length: n }, (_, i) => 1 + 0.12 * (hashRandom(seed, `nail${i}`) - 0.5));
  const k = p.nailsTargetMassG / raw.reduce((s, x) => s + x, 0);
  return raw.map((r, i) => ({
    id: `n${i + 1}`,
    massG: Math.round(r * k * 1e4) / 1e4,
    rhoGPerMl: mixed && i === n - 1 ? 2.7 : p.nailsReferenceDensityGPerMl,
    where: 'nailsBatch01',
  }));
}
