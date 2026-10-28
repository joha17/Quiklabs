/**
 * Definición de la práctica B03 «Fronteras celulares: transporte selectivo, difusión, ósmosis y diálisis» (§1, §4):
 * seis estaciones, inventario de la mesada (el microscopio y la preparación de Elodea de B01/B02 más las membranas,
 * las tres cámaras de dos compartimentos, los frascos, las probetas, la pipeta, la gradilla con siete tubos, los
 * goteros de ensayo y los instrumentos) y el estado inicial de transporte según los escenarios. Poses en cm.
 */
import type { B01Params, OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CLEAN_TRAY, COVER_BOX, GLASS_BIN, MIC_POS, PREP_SPOT } from '../../simulation/optical-world/geometry';
import { TRASH_BIN, slidePos } from '../../simulation/cell-world/geometry';
import {
  ASSAY_DROPPER_POS, BOTTLE_POS, CELL_POS, CHEM_WASTE, COLORIMETER_POS, CYLINDER_POS, MEMBRANE_TRAY, PIPETTE_POS, RINSE_BEAKER, SOAK_DISH, THERMO_POS,
  TUBE_RACK, membranePos, tubePos,
} from '../../simulation/perm-world/geometry';
import { CELL_IDS, SC_B03, TUBE_IDS, emptyVessel } from '../../simulation/perm-world/world';
import type { MembraneMaterial, MembranePiece, PermState, TwoChamber, Vessel } from '../../simulation/perm-world/types';
import { noAmounts } from '../../simulation/membrane-transport/model';
import { hashRange } from '../../simulation/core/rng';
import type { StainId } from '../../simulation/specimens/thin-section';
import { STOCKS } from './params';

export type B03Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B03_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [348, 28, 8], dist: 72, elevation: 0.5 },
  { id: 'B', target: [418, 28, 8], dist: 72, elevation: 0.5 },
  { id: 'C', target: [478, 30, 10], dist: 70, elevation: 0.42 },
  { id: 'D', target: [148, 28, 4], dist: 78, elevation: 0.78 },
  { id: 'E', target: [280, 30, 18], dist: 80, elevation: 0.3 },
  { id: 'F', target: [62, 40, 8], dist: 95, elevation: 0.42 },
];

/** Piezas de membrana de la bandeja: cuatro de diálisis, una rota de fábrica, una de poro ancho, celofán y película. */
export const MEMBRANES_B03: Array<{ id: string; material: MembraneMaterial; torn?: boolean; label: string }> = [
  { id: 'md1', material: 'dialysis', label: 'Membrana de diálisis D-12 (lote 1)' },
  { id: 'md2', material: 'dialysis', label: 'Membrana de diálisis D-12 (lote 2)' },
  { id: 'md3', material: 'dialysis', label: 'Membrana de diálisis D-12 (lote 3)' },
  { id: 'md4', material: 'dialysis', label: 'Membrana de diálisis D-12 (lote 4)' },
  { id: 'mdx', material: 'dialysis', torn: true, label: 'Membrana de diálisis D-12 (lote 5)' },
  { id: 'mwp', material: 'dialysisWide', label: 'Membrana de poro ancho W-100' },
  { id: 'mce', material: 'cellophane', label: 'Celofán genérico (no caracterizado)' },
  { id: 'mpf', material: 'film', label: 'Película plástica' },
];

export const BOTTLES_B03: Array<{ id: string; label: string; capacityMl: number; volumeMl: number }> = [
  { id: 'bW', label: 'Agua destilada', capacityMl: 500, volumeMl: 400 },
  { id: 'bI', label: 'Trazador (Lugol diluido)', capacityMl: 60, volumeMl: 30 },
  { id: 'bE', label: 'Clara de huevo modelada', capacityMl: 100, volumeMl: 50 },
  { id: 'bN', label: 'NaCl 5 % m/v', capacityMl: 100, volumeMl: 60 },
  { id: 'bS', label: 'Jarabe asignado', capacityMl: 100, volumeMl: 60 },
  { id: 'bSc', label: 'Jarabe concentrado', capacityMl: 100, volumeMl: 60 },
  { id: 'bL', label: 'Jarabe «light»', capacityMl: 100, volumeMl: 60 },
];

export const SLIDES_B03 = ['sl1', 'sl2', 'sl3', 'sl4'];
export const COVERS_B03 = ['cv1', 'cv2', 'cv3', 'cv4', 'cv5', 'cv6'];

/** Goteros de medios para Elodea (mundo celular): agua y las dos soluciones salinas. */
export const MEDIA_DROPPERS_B03: Array<{ id: string; reagent: StainId; label: string; x: number }> = [
  { id: 'dw', reagent: 'water', label: 'Agua destilada', x: 196 },
  { id: 'n09', reagent: 'nacl-0.9', label: 'NaCl 0,9 % m/v', x: 204 },
  { id: 'n5', reagent: 'nacl-5', label: 'NaCl 5 % m/v', x: 212 },
];

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

export function buildB03Spec(seed: number, mode: string, params: B01Params): OpticalWorldSpec {
  const objects: OpticalObject[] = [
    // F — seguridad y residuos.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    // D — preparación de Elodea (la de B01/B02) con los tres goteros de medio.
    O({ id: 'prepBoard', kind: 'prepBoard', pose: P(PREP_SPOT.x, PREP_SPOT.y), movable: false }),
    O({ id: 'el', kind: 'elodeaDish', pose: P(108, 38), movable: false, label: 'Elodea' }),
    ...MEDIA_DROPPERS_B03.map((d) => O({ id: d.id, kind: 'dropperBottle', pose: P(d.x, 36), label: d.label })),
    ...SLIDES_B03.map((id, i) => O({ id, kind: 'slide', pose: P(slidePos(i).x, slidePos(i).y, 0.05) })),
    O({ id: 'cvBox', kind: 'coverBox', pose: P(COVER_BOX.x, COVER_BOX.y), movable: false }),
    ...COVERS_B03.map((id, i) => O({ id, kind: 'coverslip', pose: P(COVER_BOX.x - 1.4 + (i % 4) * 0.9, COVER_BOX.y - 0.5 + Math.floor(i / 4), COVER_BOX.z), support: 'coverBox' })),
    O({ id: 'fc', kind: 'forceps', pose: P(172, 18, 0.4) }),
    O({ id: 'pp', kind: 'paper', pose: P(170, 28) }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(182, 28) }),
    // E — microscopio compartido.
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    // A — membranas, remojo, cámara 1 (prueba de fugas y difusión), trazador y colorímetro.
    O({ id: 'mt', kind: 'membraneTray', pose: P(MEMBRANE_TRAY.x, MEMBRANE_TRAY.y), movable: false, label: 'Bandeja de membranas' }),
    O({ id: 'sk', kind: 'soakDish', pose: P(SOAK_DISH.x, SOAK_DISH.y), movable: false, label: 'Agua de remojo' }),
    ...MEMBRANES_B03.map((m, i) => O({ id: m.id, kind: 'membrane', pose: P(membranePos(i).x, membranePos(i).y, membranePos(i).z), support: 'mt', label: m.label })),
    ...CELL_IDS.map((id, i) => O({ id, kind: 'twoChamber', pose: P(CELL_POS[id].x, CELL_POS[id].y), movable: false, label: `Cámara ${i + 1}` })),
    ...BOTTLES_B03.map((b) => O({ id: b.id, kind: 'reagentBottle', pose: P(BOTTLE_POS[b.id].x, BOTTLE_POS[b.id].y), label: b.label })),
    O({ id: 'co', kind: 'colorimeter', pose: P(COLORIMETER_POS.x, COLORIMETER_POS.y), movable: false, label: 'Colorímetro' }),
    // B — diálisis y ensayos.
    O({ id: 'g1', kind: 'gradCylinder', pose: P(CYLINDER_POS.g1.x, CYLINDER_POS.g1.y), label: 'Probeta 1 (50 mL)' }),
    O({ id: 'pi', kind: 'pipette', pose: P(PIPETTE_POS.x, PIPETTE_POS.y, 0.6), label: 'Pipeta graduada 5 mL' }),
    O({ id: 'rb', kind: 'beaker', pose: P(RINSE_BEAKER.x, RINSE_BEAKER.y), movable: false, label: 'Vaso de enjuague' }),
    O({ id: 'rk', kind: 'tubeRack', pose: P(TUBE_RACK.x, TUBE_RACK.y), movable: false, label: 'Gradilla' }),
    ...TUBE_IDS.map((id, i) => O({ id, kind: 'testTube', pose: P(tubePos(i).x, tubePos(i).y, tubePos(i).z), support: 'rk', label: `Tubo ${i + 1}` })),
    O({ id: 'dBi', kind: 'dropperBottle', pose: P(ASSAY_DROPPER_POS.dBi.x, ASSAY_DROPPER_POS.dBi.y), label: 'Reactivo de Biuret' }),
    O({ id: 'dAg', kind: 'dropperBottle', pose: P(ASSAY_DROPPER_POS.dAg.x, ASSAY_DROPPER_POS.dAg.y), label: 'AgNO₃ 0,1 M' }),
    O({ id: 'cw', kind: 'chemWaste', pose: P(CHEM_WASTE.x, CHEM_WASTE.y), movable: false, label: 'Residuos químicos (Ag/Cu)' }),
    // C — ósmosis.
    O({ id: 'g2', kind: 'gradCylinder', pose: P(CYLINDER_POS.g2.x, CYLINDER_POS.g2.y), label: 'Probeta 2 (50 mL)' }),
    O({ id: 'th', kind: 'thermometer', pose: P(THERMO_POS.x, THERMO_POS.y, 0.4), label: 'Termómetro' }),
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x + 4, CLEAN_TRAY.y), movable: false }),
  ];
  return {
    seed, mode, params, scenarios: [],
    objects,
    slides: Object.fromEntries(SLIDES_B03.map((id) => [id, { kind: 'blank' as const, dirty01: 0, faceDown: false }])),
    covers: Object.fromEntries(COVERS_B03.map((id) => [id, { state: 'box' as const, tiltDeg: 0, onSlide: null }])),
    dispensers: Object.fromEntries(MEDIA_DROPPERS_B03.map((d) => [d.id, { ml: d.reagent === 'water' ? params.dropperInitialMl : 5, reagent: d.reagent }])),
    dish: { leaves: 6, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: {},
    slideCase: { slots: {}, home: {} },
    assignment: { courseId: 'standard', freshAsset: 'elodea', fixedSlideIds: [], stereoSampleIds: [] },
    microscope: {},
    stereo: {},
    mounts: {},
  };
}

const vessel = (capacityMl: number, volumeMl = 0, fill: Partial<Vessel> = {}, tag?: string): Vessel => ({
  ...emptyVessel(capacityMl),
  volumeMl,
  ...fill,
  amounts: { ...noAmounts(), ...(fill.amounts ?? {}) },
  tags: tag ? [tag] : [],
});

const chamber = (capacityMl: number): TwoChamber => ({
  membraneId: null, clampTurns: 0, sides: { A: emptyVessel(capacityMl), B: emptyVessel(capacityMl) }, mixing: { A: 0, B: 0 }, lidClosed: false,
  crossContaminated: false, leakOutMl: 0, leakCrossMl: 0, tracerAt: null, tracerSide: null, tracerMl: 0, loadedAt: null, startReadAt: null, syrupSide: null,
  gasketProtein: false, lastScaleAt: null, lidOpenS: 0,
});

/** Estado inicial de transporte (frascos llenos, cámaras vacías, tubos limpios) según los escenarios docentes. */
export function buildPermState(seed: number, params: B01Params, scenarios: string[]): PermState {
  const has = (s: string) => scenarios.includes(s);
  const pp = params.perm!;
  const amount = (id: string, ml: number) => {
    switch (id) {
      case 'bI': return { tracer: STOCKS.tracer * ml };
      case 'bE': return { protein: STOCKS.eggProteinMgMl * ml, salt: has(SC_B03.INTERFERENCE) ? 0.03 * ml : 0 };
      case 'bN': return { salt: STOCKS.nacl5 * ml };
      case 'bS': return { glucose: (has(SC_B03.LOW_GRADIENT) ? STOCKS.syrupLowOsm : STOCKS.syrupOsm) * ml };
      case 'bSc': return { glucose: STOCKS.syrupConcOsm * ml };
      case 'bL': return { glucose: STOCKS.lightSyrupOsm * ml };
      default: return {};
    }
  };
  const vessels: Record<string, Vessel> = {};
  for (const b of BOTTLES_B03) vessels[b.id] = vessel(b.capacityMl, b.volumeMl, { amounts: { ...noAmounts(), ...amount(b.id, b.volumeMl) } }, b.id);
  vessels.g1 = vessel(50);
  vessels.g2 = vessel(50);
  vessels.pi = vessel(pp.pipetteCapMl);
  vessels.rb = vessel(250, 120, {}, 'bW');
  vessels.sk = vessel(250, 80, {}, 'bW');
  vessels.dBi = vessel(15, 10, { biuretMl: 10 }, 'dBi');
  vessels.dAg = vessel(15, 10, { silverMmol: STOCKS.silverMmolMl * 10 }, 'dAg');
  vessels.cw = vessel(5000);
  // Capacidad finita: el estado viaja como JSON (Infinity llegaría como null y la repetición no coincidiría).
  vessels.spill = vessel(1e9);
  const tubes: PermState['tubes'] = {};
  for (const id of TUBE_IDS) {
    vessels[id] = vessel(10);
    tubes[id] = { label: null, sources: [], reagentAt: null, readAt: null, discarded: false, gotBiuret: false, gotSilver: false, sampleMl: 0 };
  }
  // Controles analíticos preparados por el docente (SC-12): blanco, positivo de proteína y positivo de cloruro.
  if (has(SC_B03.CONTROL_TUBES)) {
    const ctl: Array<[string, string, Partial<Vessel['amounts']>]> = [
      ['t5', 'blank', {}],
      ['t6', 'pos-protein', { protein: 20 }],
      ['t7', 'pos-chloride', { salt: 0.2 }],
    ];
    for (const [id, label, a] of ctl) {
      vessels[id] = vessel(10, 2, { amounts: { ...noAmounts(), ...a } }, 'teacher');
      tubes[id] = { label, sources: ['teacher'], reagentAt: null, readAt: null, discarded: false, gotBiuret: false, gotSilver: false, sampleMl: 2 };
    }
  }
  const membranes: Record<string, MembranePiece> = {};
  for (const m of MEMBRANES_B03) {
    membranes[m.id] = {
      material: m.material, intact: !m.torn, wet01: 0, inSoak: false, installedIn: null, areaFactor: 1, edgeContaminated: false,
      carry: noAmounts(), usedIn: [], tornBy: m.torn ? 'factory' : null,
    };
  }
  const cells: Record<string, TwoChamber> = {};
  for (const id of CELL_IDS) cells[id] = chamber(pp.cells[id].capacityMl);
  void seed;
  return {
    membranes, cells, vessels, tubes,
    pours: {},
    pipette: { from: null, residueFrom: null },
    readings: {}, readingOrder: [], colorimeterZeroed: false,
    leafOutSince: null, elodea: {},
    initial: { volumeMl: 0, amounts: noAmounts(), silverMmol: 0, biuretMl: 0 },
    evaporatedMl: 0,
    assigned: { membrane: has(SC_B03.CELLOPHANE) ? 'cellophane' : 'dialysis', tracerBottle: 'bI', syrupBottle: 'bS' },
    incidents: [],
    readingSeq: 0,
    leakTestStart: {},
    leakTestPassed: [],
    curve: has(SC_B03.CURVE),
    syrupValidated: has(SC_B03.VALID_SYRUP),
    elodeaCaptures: {},
    tracerChecked: false,
    dialysisChecked: false,
    saltMmolMl: STOCKS.nacl5,
  };
}

/** Escenarios que cambian parámetros físicos del intento (membrana, sello, célula, columnas). */
export function scenarioParams(params: B01Params, scenarios: string[], seed: number) {
  const has = (s: string) => scenarios.includes(s);
  const pp = params.perm!;
  if (has(SC_B03.WEAK_CLAMP)) pp.sealTurns = 2.6;
  if (has(SC_B03.PROTEIN_LEAK)) pp.materials.dialysis.p.protein = 0.00015;
  if (has(SC_B03.TRACER_BLOCKED)) pp.materials.dialysis.p.tracer = 0;
  if (has(SC_B03.NONISO_09)) pp.elodea.innerOsm = 0.25;
  if (has(SC_B03.HEAD_DIFF)) {
    pp.cells.c3.columnCm2A = 1.5;
    pp.cells.c3.columnCm2B = 4;
  }
  // Porosidad variable por lote (SC-20): permeabilidades sorteadas con la semilla y poco paso de proteína.
  if (has(SC_B03.VARIABLE_PORES)) {
    const k = hashRange(seed, 'pores', 0.6, 1.4);
    const d = pp.materials.dialysis;
    d.p = { salt: d.p.salt * k, tracer: d.p.tracer * k, glucose: d.p.glucose * k, protein: 0.00005 };
    d.validated = false;
  }
  if (has(SC_B03.CELLOPHANE)) pp.materials.cellophane.validated = false;
  return params;
}

export type { OpticalWorld };
