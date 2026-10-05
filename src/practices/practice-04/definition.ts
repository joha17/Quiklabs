/**
 * Definición de la Práctica 4: reactivos (§6), estaciones (§4.1), inventario (§5) y disposición en la mesada.
 * Posiciones en cm sobre la mesada: x a lo largo, y en profundidad (0 = canto frontal), z altura.
 * El mechero queda en la zona de la campana, lejos de la fenolftaleína en etanol (§4.2).
 */
import type { P4ObjKind, Pose, VesselKind } from '../../simulation/reaction-world/types';
import { GAS_TAP } from '../practice-03/instruments';
import { RACK4, TILE4, TUBE_RACK_Z } from './instruments';

export type P4Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export interface P4StationDef {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  target: [number, number, number];
  dist: number;
  elevation: number;
}

export const BENCH4 = { length: 560, depth: 64 };

export const P4_STATIONS: P4StationDef[] = [
  { id: 'A', target: [82, 34, 6], dist: 108, elevation: 0.42 },
  { id: 'B', target: [206, 38, 8], dist: 105, elevation: 0.4 },
  { id: 'C', target: [300, 34, 5], dist: 86, elevation: 0.42 },
  { id: 'D', target: [420, 34, 12], dist: 118, elevation: 0.32 },
  { id: 'E', target: [470, 32, 6], dist: 90, elevation: 0.45 },
  { id: 'F', target: [562, 40, 8], dist: 122, elevation: 0.38 },
];

// ─────────────────────────── Reactivos (§6) ───────────────────────────

export type Hazard = 'corrosive' | 'irritant' | 'harmful' | 'flammable' | 'environment';

export interface ReagentDef {
  id: string;
  /** Nombre y fórmula del rótulo, concentración tal como figura en el frasco. */
  name: string;
  formula: string;
  conc: string;
  /** Composición (mol/L) — se disocia al preparar (§7.3). */
  molar: Record<string, number>;
  solvent: 'WATER' | 'ETHANOL';
  hazards: Hazard[];
}

export const REAGENTS: Record<string, ReagentDef> = {
  hcl: { id: 'hcl', name: 'Ácido clorhídrico', formula: 'HCl', conc: '0,10 M', molar: { 'H+': 0.1, 'Cl-': 0.1 }, solvent: 'WATER', hazards: ['corrosive', 'irritant'] },
  naoh10: { id: 'naoh10', name: 'Hidróxido de sodio', formula: 'NaOH', conc: '0,10 M', molar: { 'Na+': 0.1, 'OH-': 0.1 }, solvent: 'WATER', hazards: ['corrosive'] },
  naoh15: { id: 'naoh15', name: 'Hidróxido de sodio', formula: 'NaOH', conc: '0,15 M', molar: { 'Na+': 0.15, 'OH-': 0.15 }, solvent: 'WATER', hazards: ['corrosive'] },
  na2co3: { id: 'na2co3', name: 'Carbonato de sodio', formula: 'Na₂CO₃', conc: '0,15 M', molar: { 'Na+': 0.3, 'CO3^2-': 0.15 }, solvent: 'WATER', hazards: ['irritant'] },
  cacl2: { id: 'cacl2', name: 'Cloruro de calcio', formula: 'CaCl₂', conc: '0,15 M', molar: { 'Ca^2+': 0.15, 'Cl-': 0.3 }, solvent: 'WATER', hazards: ['irritant'] },
  fecl3: { id: 'fecl3', name: 'Cloruro de hierro(III)', formula: 'FeCl₃', conc: '0,15 M', molar: { 'Fe^3+': 0.15, 'Cl-': 0.45 }, solvent: 'WATER', hazards: ['corrosive', 'irritant'] },
  cuso4: { id: 'cuso4', name: 'Sulfato de cobre(II)', formula: 'CuSO₄', conc: '0,25 M', molar: { 'Cu^2+': 0.25, 'SO4^2-': 0.25 }, solvent: 'WATER', hazards: ['harmful', 'environment'] },
  // Fenolftaleína 1,0 % (m/v) en etanol: 10 g/L ÷ 318,3 g/mol.
  pheno: { id: 'pheno', name: 'Fenolftaleína', formula: '1,0 % en etanol', conc: 'indicador', molar: { HIn: 10 / 318.3 }, solvent: 'ETHANOL', hazards: ['flammable'] },
  water: { id: 'water', name: 'Agua destilada', formula: 'H₂O', conc: '', molar: {}, solvent: 'WATER', hazards: [] },
};

// ─────────────────────────── Disposición ───────────────────────────

export const RACK_POS4 = { x: 204, y: 46 };
export const TILE_POS4 = { x: 452, y: 30 };
export const BURNER_POS4 = { x: 420, y: 32 };
export const TAP_POS4 = { x: 452, y: 63.5, z: GAS_TAP.z };

export const rackSlotPose4 = (i: number): Pose => ({
  x: RACK_POS4.x - ((RACK4.slots - 1) / 2) * RACK4.pitch + i * RACK4.pitch, y: RACK_POS4.y, z: TUBE_RACK_Z, rotationRad: 0,
});

export interface VesselSpec {
  id: string;
  kind: VesselKind;
  objKind: P4ObjKind;
  reagent?: string;
  volumeMl?: number;
}

export interface ObjSpec4 {
  id: string;
  kind: P4ObjKind;
  pose: Pose;
  support: string;
  movable: boolean;
}

const P = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });

export const TUBE_IDS = ['tube1', 'tube2', 'tube3', 'tube4', 'tube5', 'tube6'];
export const DROPPER_BOTTLES: Record<string, { reagent: string; pos: [number, number]; dropper: string }> = {
  pheno: { reagent: 'pheno', pos: [64, 52], dropper: 'dropper_pheno' },
  db_na2co3: { reagent: 'na2co3', pos: [160, 52], dropper: 'dropper_na2co3' },
  db_cacl2: { reagent: 'cacl2', pos: [172, 52], dropper: 'dropper_cacl2' },
  db_fecl3: { reagent: 'fecl3', pos: [236, 52], dropper: 'dropper_fecl3' },
  db_naoh15: { reagent: 'naoh15', pos: [248, 52], dropper: 'dropper_naoh15' },
};
export const WASTE_IDS = ['waste_metals', 'waste_iron', 'waste_acidbase', 'waste_solids', 'waste_glass'] as const;
export type WasteId = (typeof WASTE_IDS)[number] | 'sink';

/** Alturas a las que el gotero queda metido en su frasco (cm sobre la base). */
export const DROPPER_IN_BOTTLE_Z = 1.2;

export function buildVessels4(opts: { naohSingle: number | null; aluminum: boolean }): VesselSpec[] {
  const out: VesselSpec[] = [
    { id: 'bottle_hcl', kind: 'BOTTLE', objKind: 'bottle', reagent: 'hcl', volumeMl: 110 },
    { id: 'bottle_naoh10', kind: 'BOTTLE', objKind: 'bottle', reagent: opts.naohSingle ? 'naohX' : 'naoh10', volumeMl: 110 },
    { id: 'bottle_cuso4', kind: 'BOTTLE', objKind: 'bottle', reagent: 'cuso4', volumeMl: 60 },
    { id: 'beaker', kind: 'BEAKER100', objKind: 'beaker' },
    { id: 'cyl10', kind: 'CYL10', objKind: 'cylinder' },
    { id: 'cyl25', kind: 'CYL25', objKind: 'cylinder' },
    { id: 'capsule', kind: 'CAPSULE', objKind: 'capsule' },
    { id: 'wash', kind: 'WASH_BOTTLE', objKind: 'washBottle', reagent: 'water', volumeMl: 400 },
    ...TUBE_IDS.map((id) => ({ id, kind: 'TUBE' as const, objKind: 'tube' as const })),
    ...WASTE_IDS.map((id) => ({ id, kind: 'WASTE' as const, objKind: 'waste' as const })),
    { id: 'sink', kind: 'SINK', objKind: 'sink' },
  ];
  for (const [id, d] of Object.entries(DROPPER_BOTTLES)) {
    const reagent = opts.naohSingle && d.reagent === 'naoh15' ? 'naohX' : d.reagent;
    out.push({ id, kind: 'DROPPER_BOTTLE', objKind: 'dropperBottle', reagent, volumeMl: d.reagent === 'pheno' ? 20 : 35 });
    out.push({ id: d.dropper, kind: 'DROPPER', objKind: 'dropper', reagent });
  }
  return out;
}

export function buildObjects4(opts: { aluminum: boolean }): ObjSpec4[] {
  const o: ObjSpec4[] = [
    // A — Neutralización
    { id: 'bottle_hcl', kind: 'bottle', pose: P(32, 50), support: 'bench', movable: true },
    { id: 'bottle_naoh10', kind: 'bottle', pose: P(46, 50), support: 'bench', movable: true },
    { id: 'beaker', kind: 'beaker', pose: P(96, 28), support: 'bench', movable: true },
    { id: 'cyl10', kind: 'cylinder', pose: P(72, 22), support: 'bench', movable: true },
    { id: 'cyl25', kind: 'cylinder', pose: P(84, 40), support: 'bench', movable: true },
    { id: 'rod', kind: 'rod', pose: P(118, 14, 0.25), support: 'bench', movable: true },
    { id: 'probe', kind: 'probe', pose: P(126, 30, 0.3), support: 'bench', movable: true },
    // B — Precipitación
    { id: 'rack', kind: 'rack', pose: P(RACK_POS4.x, RACK_POS4.y), support: 'bench', movable: false },
    ...TUBE_IDS.map((id, i) => ({ id, kind: 'tube' as const, pose: rackSlotPose4(i), support: `rack:${i}`, movable: true })),
    { id: 'tube_tongs', kind: 'tubeTongs', pose: P(222, 12, 0.6), support: 'bench', movable: true },
    // C — Desplazamiento
    { id: 'bottle_cuso4', kind: 'bottle', pose: P(282, 50), support: 'bench', movable: true },
    { id: 'nail_dish', kind: 'nailDish', pose: P(304, 30), support: 'bench', movable: false },
    { id: 'nail', kind: 'nail', pose: P(304, 30, 0.45), support: 'dish', movable: true },
    { id: 'sandpaper', kind: 'sandpaper', pose: P(322, 16, 0.05), support: 'bench', movable: true },
    // D — Combustión del Mg (bajo la campana)
    { id: 'tile', kind: 'tile', pose: P(TILE_POS4.x, TILE_POS4.y), support: 'bench', movable: false },
    { id: 'capsule', kind: 'capsule', pose: P(TILE_POS4.x, TILE_POS4.y, TILE4.h), support: 'tile', movable: true },
    { id: 'crucible_tongs', kind: 'crucibleTongs', pose: P(440, 10, 0.9), support: 'bench', movable: true },
    { id: 'mg_dish', kind: 'mgDish', pose: P(384, 26), support: 'bench', movable: false },
    { id: 'mg1', kind: 'mgRibbon', pose: P(384, 26, 0.35), support: 'dish', movable: true },
    { id: 'shield', kind: 'shield', pose: P(392, 50), support: 'bench', movable: true },
    // E — Residuo del Mg
    { id: 'wash', kind: 'washBottle', pose: P(486, 46), support: 'bench', movable: true },
    // F — Residuos y limpieza
    { id: 'waste_metals', kind: 'waste', pose: P(512, 50), support: 'bench', movable: false },
    { id: 'waste_iron', kind: 'waste', pose: P(524, 50), support: 'bench', movable: false },
    { id: 'waste_acidbase', kind: 'waste', pose: P(536, 50), support: 'bench', movable: false },
    { id: 'waste_solids', kind: 'waste', pose: P(548, 50), support: 'bench', movable: false },
    { id: 'waste_glass', kind: 'waste', pose: P(560, 50), support: 'bench', movable: false },
    { id: 'towel', kind: 'towel', pose: P(526, 20, 0.4), support: 'bench', movable: true },
    { id: 'ph_paper', kind: 'phPaper', pose: P(544, 18, 0.2), support: 'bench', movable: true },
    { id: 'sink', kind: 'sink', pose: P(600, 34), support: 'bench', movable: false },
  ];
  for (const [id, d] of Object.entries(DROPPER_BOTTLES)) {
    o.push({ id, kind: 'dropperBottle', pose: P(d.pos[0], d.pos[1]), support: 'bench', movable: true });
    o.push({ id: d.dropper, kind: 'dropper', pose: P(d.pos[0], d.pos[1], DROPPER_IN_BOTTLE_Z), support: `cap:${id}`, movable: true });
  }
  if (opts.aluminum) o.push({ id: 'al_strip', kind: 'alStrip', pose: P(312, 38, 0.1), support: 'dish', movable: true });
  return o;
}

/** Objetos del mechero (sub-mundo de la Práctica 3): mechero, llave de mesa, encendedor y seguridad de la sala. */
export function buildGasObjects() {
  return [
    { id: 'burner', kind: 'burner' as const, pose: P(BURNER_POS4.x, BURNER_POS4.y), support: 'bench', movable: true },
    { id: 'gas_tap', kind: 'gasTap' as const, pose: P(TAP_POS4.x, TAP_POS4.y, TAP_POS4.z), support: 'wall', movable: false },
    { id: 'lighter', kind: 'lighter' as const, pose: P(398, 12, 1.2), support: 'bench', movable: true },
    { id: 'extinguisher', kind: 'extinguisher' as const, pose: P(346, 61, 20), support: 'wall', movable: false },
    { id: 'blanket', kind: 'blanket' as const, pose: P(332, 66, 46), support: 'wall', movable: false },
    { id: 'estop', kind: 'emergencyStop' as const, pose: P(476, 66, 30), support: 'wall', movable: false },
    { id: 'extractor', kind: 'extractor' as const, pose: P(380, 66, 28), support: 'wall', movable: false },
    { id: 'co_detector', kind: 'coDetector' as const, pose: P(500, 66, 44), support: 'wall', movable: false },
  ];
}

/** Ensayo esperado por rótulo (para detectar rótulos que no corresponden al contenido, §23.2 MISLABELED). */
export const TUBE_LABELS = ['B1', 'B2', 'C1', 'B2x', 'otro'] as const;
