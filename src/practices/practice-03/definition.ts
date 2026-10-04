/**
 * Definición de la Práctica 3: estaciones (vistas de cámara), inventario y disposición en la mesada.
 * Posiciones en cm sobre la mesada: x a lo largo, y en profundidad (0 = canto frontal), z altura.
 * Los reactivos y el HCl quedan lejos del mechero (§4.2, §15.3).
 */
import type { CationId, SaltSolutionDef } from './cation-profiles';
import type { ObjKind, Pose } from '../../simulation/flame-world/types';
import { BURNER, GAS_TAP, HOLDER, LOOP, RACK, TILE, TUBE } from './instruments';

export type P3Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export interface P3StationDef {
  id: 'A' | 'B' | 'C' | 'D' | 'E';
  /** Punto de mira (cm de mesada) y distancia de cámara. */
  target: [number, number, number];
  dist: number;
  /** Elevación de la cámara (rad sobre la horizontal). */
  elevation: number;
}

export const BENCH3 = { length: 560, depth: 64 };

/** Posición del mechero y de la toma de gas. */
export const BURNER_POS = { x: 200, y: 30 };
export const TAP_POS = { x: 234, y: 63.5, z: GAS_TAP.z };

export const P3_STATIONS: P3StationDef[] = [
  { id: 'A', target: [196, 34, 13], dist: 108, elevation: 0.36 },
  { id: 'B', target: [232, 32, 13], dist: 92, elevation: 0.34 },
  { id: 'C', target: [152, 34, 10], dist: 122, elevation: 0.5 },
  { id: 'D', target: [200, 30, 22], dist: 52, elevation: 0.06 },
  { id: 'E', target: [452, 42, 8], dist: 96, elevation: 0.45 },
];

/** Disoluciones (§9.2). El Cu²⁺ es la única con color (azul verdoso pálido). La incógnita se completa con la semilla. */
export const SOLUTIONS: SaltSolutionDef[] = [
  { id: 'sol_nacl', label: 'NaCl', species: { 'Na+': 0.02 }, concentrationPercent: 2, solutionColor: 0xf4f8fb, solutionOpacity: 0.18 },
  { id: 'sol_kcl', label: 'KCl', species: { 'K+': 0.02 }, concentrationPercent: 2, solutionColor: 0xf4f8fb, solutionOpacity: 0.18 },
  { id: 'sol_cacl2', label: 'CaCl₂', species: { 'Ca2+': 0.02 }, concentrationPercent: 2, solutionColor: 0xf4f8fb, solutionOpacity: 0.18 },
  { id: 'sol_cucl2', label: 'CuCl₂', species: { 'Cu2+': 0.02 }, concentrationPercent: 2, solutionColor: 0x9fd8d0, solutionOpacity: 0.38 },
  { id: 'sol_licl', label: 'LiCl', species: { 'Li+': 0.02 }, concentrationPercent: 2, solutionColor: 0xf4f8fb, solutionOpacity: 0.18 },
  { id: 'sol_bacl2', label: 'BaCl₂', species: { 'Ba2+': 0.03 }, concentrationPercent: 3, solutionColor: 0xf4f8fb, solutionOpacity: 0.18 },
  { id: 'sol_mix', label: 'NaCl + KCl', species: { 'Na+': 0.01, 'K+': 0.01 }, concentrationPercent: 2, solutionColor: 0xf4f8fb, solutionOpacity: 0.18 },
];

export const UNKNOWN_ID = 'sol_unknown';

/** Filas de la libreta / evaluación en el orden de la guía. */
export const SOLUTION_ROWS = ['sol_nacl', 'sol_kcl', 'sol_cacl2', 'sol_cucl2', 'sol_licl', 'sol_bacl2', 'sol_mix', UNKNOWN_ID] as const;
export type SolutionRow = (typeof SOLUTION_ROWS)[number];

/** Color de la disolución incógnita: solo el Cu²⁺ tiñe, y muy pálido (no permite identificarla por el tubo). */
export function unknownSolutionColor(cation: string): { color: number; opacity: number } {
  return cation === 'Cu2+' ? { color: 0xc6e7e2, opacity: 0.26 } : { color: 0xf4f8fb, opacity: 0.18 };
}

export const rackSlotPose = (i: number): Pose => ({ x: RACK_POS.x - ((RACK.slots - 1) / 2) * RACK.pitch + i * RACK.pitch, y: RACK_POS.y, z: TUBE.rackBaseZ, rotationRad: 0 });
export const holderSlotPose = (i: number): Pose => ({ x: HOLDER_POS.x - ((HOLDER.slots - 1) / 2) * HOLDER.pitch + i * HOLDER.pitch, y: HOLDER_POS.y, z: LOOP.holderRingZ, rotationRad: 0 });

export const RACK_POS = { x: 98, y: 46 };
export const HOLDER_POS = { x: 112, y: 20 };
export const TILE_POS = { x: 246, y: 26 };
export const HCL_POS = { x: 476, y: 44, z: 0 };
export const RINSE_POS = { x: 452, y: 36, z: 0 };

export interface ObjSpec {
  id: string;
  kind: ObjKind;
  pose: Pose;
  support: string;
  movable: boolean;
}

const P = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });

export function buildObjects(opts: { loopMode: 'DEDICATED' | 'SHARED'; atomizer: boolean }): ObjSpec[] {
  const tubes = [...SOLUTIONS.map((s) => s.id), UNKNOWN_ID];
  const objs: ObjSpec[] = [
    { id: 'burner', kind: 'burner', pose: P(BURNER_POS.x, BURNER_POS.y), support: 'bench', movable: true },
    { id: 'gas_tap', kind: 'gasTap', pose: P(TAP_POS.x, TAP_POS.y, TAP_POS.z), support: 'wall', movable: false },
    { id: 'lighter', kind: 'lighter', pose: P(170, 12, 1.2), support: 'bench', movable: true },
    { id: 'ruler', kind: 'ruler', pose: P(BURNER_POS.x + 9, BURNER_POS.y + 6), support: 'bench', movable: true },
    // Pantalla oscura detrás del mechero: la llama azul y los colores tenues se observan contra fondo oscuro.
    { id: 'backdrop', kind: 'backdrop', pose: P(BURNER_POS.x - 4, BURNER_POS.y + 22), support: 'bench', movable: false },
    { id: 'soap', kind: 'soapBottle', pose: P(152, 52), support: 'bench', movable: true },
    { id: 'tile', kind: 'tile', pose: P(TILE_POS.x, TILE_POS.y), support: 'bench', movable: false },
    { id: 'capsule', kind: 'capsule', pose: P(266, 46), support: 'bench', movable: true },
    { id: 'tongs', kind: 'tongs', pose: P(266, 12, 0.9), support: 'bench', movable: true },
    { id: 'cloth', kind: 'cloth', pose: P(290, 50), support: 'bench', movable: true },
    { id: 'glass', kind: 'glass', pose: P(226, 10, 0.8), support: 'bench', movable: true },
    { id: 'rack', kind: 'rack', pose: P(RACK_POS.x, RACK_POS.y), support: 'bench', movable: false },
    { id: 'holder', kind: 'loopHolder', pose: P(HOLDER_POS.x, HOLDER_POS.y), support: 'bench', movable: false },
    ...tubes.map((id, i) => ({ id, kind: 'tube' as const, pose: rackSlotPose(i), support: `rack:${i}`, movable: true })),
    { id: 'rinse', kind: 'rinseBeaker', pose: P(RINSE_POS.x, RINSE_POS.y), support: 'bench', movable: false },
    { id: 'waste', kind: 'waste', pose: P(424, 48), support: 'bench', movable: false },
    { id: 'extinguisher', kind: 'extinguisher', pose: P(24, 61, 20), support: 'wall', movable: false },
    { id: 'blanket', kind: 'blanket', pose: P(146, 66, 46), support: 'wall', movable: false },
    { id: 'estop', kind: 'emergencyStop', pose: P(168, 66, 30), support: 'wall', movable: false },
    { id: 'extractor', kind: 'extractor', pose: P(250, 66, 28), support: 'wall', movable: false },
    { id: 'co_detector', kind: 'coDetector', pose: P(232, 66, 44), support: 'wall', movable: false },
  ];
  if (opts.loopMode === 'SHARED') {
    objs.push({ id: 'loop_shared', kind: 'loop', pose: holderSlotPose(0), support: 'holder:0', movable: true });
    objs.push({ id: 'hcl', kind: 'hclVial', pose: P(HCL_POS.x, HCL_POS.y), support: 'station', movable: false });
  } else {
    tubes.forEach((id, i) => objs.push({ id: loopIdFor(id), kind: 'loop', pose: holderSlotPose(i), support: `holder:${i}`, movable: true }));
  }
  if (opts.atomizer) {
    objs.push({ id: 'atom_nacl', kind: 'atomizer', pose: P(150, 16), support: 'bench', movable: true });
    objs.push({ id: 'atom_kcl', kind: 'atomizer', pose: P(158, 16), support: 'bench', movable: true });
  }
  return objs;
}

export const loopIdFor = (solutionId: string): string => `loop_${solutionId.replace('sol_', '')}`;

/** Posiciones de referencia útiles para la interacción y las pruebas. */
export const REF = {
  mouth: { x: BURNER_POS.x, y: BURNER_POS.y, z: BURNER.mouthZ },
  tileTopZ: TILE.h,
  rackSlots: RACK.slots,
  holderSlots: HOLDER.slots,
};

export type { CationId };
