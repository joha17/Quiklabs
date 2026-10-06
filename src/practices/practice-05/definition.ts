/**
 * Práctica 5 — estaciones, instrumental y posiciones iniciales (§4, §5). Mesada de 560 cm; la campana cubre el
 * montaje y el mechero (x ≈ 352–552), como en las prácticas 3 y 4.
 */
import type { P5ObjKind, Pose } from '../../simulation/stoich-world/types';

export type P5Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH5 = { length: 560, depth: 64 };

const P = (x: number, y: number, z = 0, rotationRad = 0): Pose => ({ x, y, z, rotationRad });

export interface P5Station {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
  /** Giro de la vista alrededor del objetivo (rad; 0 = de frente, + = desde la derecha). */
  azimuth?: number;
}

/** §4.1 — estaciones: pesada, mezcla, enfriamiento, montaje y calentamiento, residuos. */
export const P5_STATIONS: P5Station[] = [
  { id: 'A', target: [86, 36, 10], dist: 92, elevation: 0.32 },
  { id: 'B', target: [205, 38, 6], dist: 110, elevation: 0.42 },
  { id: 'C', target: [300, 40, 6], dist: 80, elevation: 0.4 },
  { id: 'D', target: [420, 34, 18], dist: 96, elevation: 0.3, azimuth: 0.85 },
  { id: 'E', target: [505, 34, 8], dist: 96, elevation: 0.4 },
];

export const BALANCE_POS = { x: 86, y: 38 };
/** Platillo (respecto a la base de la balanza) y brazos. */
export const BALANCE_GEO = { panDx: -16, panDy: 0, panZ: 9.5, beamZ: 13, beamLen: 30, pointerDx: 17 };
export const RACK_POS5 = { x: 300, y: 42 };
export const STAND_POS = { x: 420, y: 46 };
export const BURNER_POS5 = { x: 420, y: 33 };
export const TAP_POS5 = { x: 384, y: 63, z: 12 };

/** Tubo de vidrio borosilicato 18 × 150 mm. Origen = fondo exterior; eje a lo largo de +z cuando está vertical. */
export const TUBE5 = { length: 15, outerR: 0.9, wall: 0.1, glassMassG: 17.3 };
/** Brazo de la pinza: desde la varilla del soporte hacia el frente (−y). */
export const CLAMP_ARM = 13;

export function buildObjects5(): Array<{ id: string; kind: P5ObjKind; pose: Pose; support: string; movable: boolean }> {
  return [
    { id: 'balance', kind: 'balance', pose: P(BALANCE_POS.x, BALANCE_POS.y), support: 'bench', movable: false },
    { id: 'tube', kind: 'tube', pose: P(RACK_POS5.x - 3, RACK_POS5.y, 0.6), support: 'rack', movable: true },
    { id: 'rack', kind: 'rack', pose: P(RACK_POS5.x, RACK_POS5.y), support: 'bench', movable: false },
    { id: 'tray', kind: 'tray', pose: P(205, 30), support: 'bench', movable: false },
    { id: 'bottle_kclo3', kind: 'bottle', pose: P(176, 50), support: 'bench', movable: true },
    { id: 'bottle_mno2', kind: 'bottle', pose: P(234, 50), support: 'bench', movable: true },
    { id: 'spatula_kclo3', kind: 'spatula', pose: P(186, 16, 0.3), support: 'bench', movable: true },
    { id: 'spatula_mno2', kind: 'spatula', pose: P(224, 16, 0.3), support: 'bench', movable: true },
    { id: 'tongs', kind: 'tubeTongs', pose: P(256, 16, 0.4), support: 'bench', movable: true },
    { id: 'stopper', kind: 'stopper', pose: P(158, 18, 0), support: 'bench', movable: true },
    { id: 'brush', kind: 'brush', pose: P(130, 16, 0.3), support: 'bench', movable: true },
    // Objetos incompatibles cerca del KClO₃ (§5.1): no deben llegar a la mezcla.
    { id: 'weigh_paper', kind: 'weighPaper', pose: P(124, 52, 0), support: 'bench', movable: true },
    { id: 'sugar', kind: 'sugarJar', pose: P(262, 54), support: 'bench', movable: true },
    { id: 'pestle', kind: 'pestle', pose: P(146, 26, 0.2), support: 'bench', movable: true },
    { id: 'stand', kind: 'stand', pose: P(STAND_POS.x, STAND_POS.y), support: 'bench', movable: false },
    { id: 'shield', kind: 'shield', pose: P(452, 18), support: 'bench', movable: true },
    { id: 'ir', kind: 'irThermometer', pose: P(322, 18, 0.5), support: 'bench', movable: true },
    { id: 'wash', kind: 'washBottle', pose: P(486, 20), support: 'bench', movable: true },
    { id: 'waste', kind: 'waste', pose: P(526, 44), support: 'bench', movable: false },
  ];
}

export function buildGasObjects5() {
  return [
    { id: 'burner', kind: 'burner' as const, pose: P(BURNER_POS5.x, BURNER_POS5.y), support: 'bench', movable: true },
    { id: 'gas_tap', kind: 'gasTap' as const, pose: P(TAP_POS5.x, TAP_POS5.y, TAP_POS5.z), support: 'wall', movable: false },
    { id: 'lighter', kind: 'lighter' as const, pose: P(396, 12, 1.2), support: 'bench', movable: true },
    { id: 'extinguisher', kind: 'extinguisher' as const, pose: P(346, 61, 20), support: 'wall', movable: false },
    { id: 'blanket', kind: 'blanket' as const, pose: P(332, 66, 46), support: 'wall', movable: false },
    { id: 'estop', kind: 'emergencyStop' as const, pose: P(476, 66, 30), support: 'wall', movable: false },
    { id: 'extractor', kind: 'extractor' as const, pose: P(398, 66, 28), support: 'wall', movable: false },
    { id: 'co_detector', kind: 'coDetector' as const, pose: P(500, 66, 44), support: 'wall', movable: false },
  ];
}

export const GAS_IDS5 = new Set(buildGasObjects5().map((o) => o.id));
