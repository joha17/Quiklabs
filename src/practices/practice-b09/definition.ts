/**
 * Definición de la práctica B09 «Arquitectura vegetal: raíces, tallos, hojas y tejidos de sostén» (§1, §4): seis estaciones,
 * inventario de la mesada (el equipo óptico de B01, la preparación de B02, las plántulas, las fuentes de tejido y la zona
 * ventilada de Wiesner), la caja de láminas permanentes y los preparados docentes por escenario. Poses en cm.
 */
import type { B01Params, OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, CLEAN_TRAY, COVER_BOX, GLASS_BIN, MIC_POS, PREP_SPOT, SAMPLE_TRAY, STEREO_POS, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { BOARD_POS, PREP2_SPOT, TRASH_BIN, slidePos } from '../../simulation/cell-world/geometry';
import { BRANCH_POS, OIL_VIAL, PLANT_POS, SOURCE_POS, WIESNER_POS } from '../../simulation/plant-world/geometry';
import { SC_B09 } from '../../simulation/plant-world/world';
import { emptyMount } from '../../simulation/specimens/mount-world';
import { emptyCellInfo, type CellKind, type CellZone, type StainId } from '../../simulation/specimens/thin-section';
import { CELL_RECIPES } from '../../simulation/specimens/stain-model';

export type B09Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B09_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [66, 36, 8], dist: 95, elevation: 0.42 },
  { id: 'B', target: [452, 30, 10], dist: 92, elevation: 0.45 },
  { id: 'C', target: [150, 28, 4], dist: 86, elevation: 0.72 },
  { id: 'D', target: [300, 32, 14], dist: 88, elevation: 0.34 },
  { id: 'E', target: [326, 24, 6], dist: 72, elevation: 0.62 },
  { id: 'F', target: [505, 30, 6], dist: 85, elevation: 0.45 },
];

export const SOURCES_B09: Array<{ id: string; kind: CellKind; massMg: number; label: string }> = [
  { id: 'cel', kind: 'celery', massMg: 20000, label: 'Apio (pecíolo)' },
  { id: 'pea', kind: 'pear', massMg: 20000, label: 'Pera' },
  { id: 'lea', kind: 'plantLeaf', massMg: 8000, label: 'Hoja asignada por el docente' },
];

export const SLIDES_B09 = ['sl1', 'sl2', 'sl3', 'sl4', 'sl5', 'sl6'];
export const COVERS_B09 = ['cv1', 'cv2', 'cv3', 'cv4', 'cv5', 'cv6', 'cv7', 'cv8'];

/** Láminas permanentes: la del distractor (cebolla) es de otra práctica y no se asigna. */
export function fixedSlidesB09(scenarios: string[]): Array<{ id: string; assetId: string; slot: number; label: string; assigned: boolean }> {
  const has = (s: string) => scenarios.includes(s);
  const out = [
    { id: 'fxRT', assetId: has(SC_B09.ROOT_TIP) ? 'onionRootTipClear' : 'onionRootTip', slot: 0, label: 'Ápice de raíz de cebolla (longitudinal)', assigned: true },
    { id: 'fxRE', assetId: has(SC_B09.ROOT_EU) ? 'rootEudicotClear' : 'rootEudicot', slot: 2, label: 'Raíz de eudicotiledónea (transversal)', assigned: true },
    { id: 'fxRM', assetId: has(SC_B09.ROOT_MONO) ? 'rootMonocotPith' : 'rootMonocot', slot: 3, label: 'Raíz de monocotiledónea (transversal)', assigned: true },
    { id: 'fxSE', assetId: has(SC_B09.STEM_EU) ? 'stemEudicotCambium' : 'stemEudicot', slot: 5, label: 'Tallo de eudicotiledónea (transversal)', assigned: true },
    { id: 'fxSM', assetId: 'stemMonocot', slot: 6, label: 'Tallo de monocotiledónea (transversal)', assigned: true },
    { id: 'fxW', assetId: has(SC_B09.TROPICAL) ? 'woodTropical' : 'woodRings', slot: 7, label: has(SC_B09.TROPICAL) ? 'Rama tropical (transversal)' : 'Tallo leñoso (transversal)', assigned: true },
    { id: 'fxLE', assetId: has(SC_B09.LEAF_EU) ? 'leafEudicotFine' : 'leafEudicot', slot: 8, label: 'Hoja de eudicotiledónea (transversal)', assigned: true },
    { id: 'fxLM', assetId: 'leafMonocot', slot: 9, label: 'Hoja de monocotiledónea (transversal)', assigned: true },
    { id: 'fxO', assetId: 'onion', slot: 11, label: 'Epidermis de cebolla (otra práctica)', assigned: false },
  ];
  // Etiqueta que no coincide con la imagen (S18): manda la imagen; la lámina sigue asignada.
  if (has(SC_B09.MISLABELED)) out.find((f) => f.id === 'fxRM')!.label = 'Tallo de monocotiledónea (transversal)';
  // Incógnitas del docente (S23): etiquetas neutras; el mundo conserva la identidad.
  if (has(SC_B09.UNKNOWNS)) out.forEach((f, i) => (f.label = `Lámina ${String.fromCharCode(65 + i)}`));
  return out;
}

/** Láminas que la rúbrica exige: el leñoso solo si se asigna (S16/S17). */
export function requiredSlidesB09(scenarios: string[]): string[] {
  const base = ['fxRT', 'fxRE', 'fxRM', 'fxSE', 'fxSM', 'fxLE', 'fxLM'];
  return scenarios.includes(SC_B09.RINGS) || scenarios.includes(SC_B09.TROPICAL) ? [...base, 'fxW'] : base;
}

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

/** Preparados docentes (escenarios de §10): ya montados, excluidos de la nota de preparación. */
interface Premade { id: string; label: string; kind: CellKind; stains: Partial<Record<StainId, number>>; contactS: number; water: number; thicknessMm: number }
export function premadeSlidesB09(scenarios: string[]): Premade[] {
  const has = (s: string) => scenarios.includes(s);
  const out: Premade[] = [];
  if (has(SC_B09.CELERY_THIN)) out.push({ id: 'ctl1', label: 'Apio: corte delgado (docente)', kind: 'celery', stains: {}, contactS: 0, water: 0.05, thicknessMm: 0.08 });
  if (has(SC_B09.CELERY_THICK)) out.push({ id: 'ctl2', label: 'Apio: corte grueso (docente)', kind: 'celery', stains: {}, contactS: 0, water: 0.05, thicknessMm: 0.4 });
  if (has(SC_B09.NO_LIGNIN)) out.push({ id: 'ctl3', label: 'Apio: zona de colénquima sin teñir (docente)', kind: 'celery', stains: {}, contactS: 0, water: 0.05, thicknessMm: 0.08 });
  if (has(SC_B09.LIGNIN_DOC)) out.push({ id: 'ctl4', label: 'Apio con Wiesner documentado (docente)', kind: 'celery', stains: { phloroglucinol: 0.03, hcl: 0.03 }, contactS: 60, water: 0, thicknessMm: 0.08 });
  return out;
}

export function buildB09Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const has = (s: string) => scenarios.includes(s);
  const objects: OpticalObject[] = [
    // A — seguridad y residuos.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    // C — corte y montaje.
    O({ id: 'prepBoard', kind: 'prepBoard', pose: P(PREP_SPOT.x, PREP_SPOT.y), movable: false }),
    O({ id: 'board', kind: 'cuttingBoard', pose: P(BOARD_POS.x, BOARD_POS.y), movable: false, label: 'Tabla de corte' }),
    ...SOURCES_B09.map((s) => O({ id: s.id, kind: 'tissueSource', pose: P(SOURCE_POS[s.id].x, SOURCE_POS[s.id].y), movable: false, label: s.label })),
    O({ id: 'dw', kind: 'dropperBottle', pose: P(196, 36), label: 'Agua destilada (piseta)' }),
    ...SLIDES_B09.map((id, i) => O({ id, kind: 'slide', pose: P(slidePos(i).x, slidePos(i).y, 0.05) })),
    O({ id: 'cvBox', kind: 'coverBox', pose: P(COVER_BOX.x, COVER_BOX.y), movable: false }),
    ...COVERS_B09.map((id, i) => O({ id, kind: 'coverslip', pose: P(COVER_BOX.x - 1.4 + (i % 4) * 0.9, COVER_BOX.y - 0.5 + Math.floor(i / 4), COVER_BOX.z), support: 'coverBox' })),
    O({ id: 'fc', kind: 'forceps', pose: P(172, 18, 0.4) }),
    O({ id: 'sc', kind: 'scalpel', pose: P(180, 18, 0.4) }),
    O({ id: 'pp', kind: 'paper', pose: P(170, 28) }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(182, 28) }),
    O({ id: 'tw', kind: 'tissue', pose: P(196, 26), label: 'Pañuelo de papel' }),
    // D — microscopio compartido, zona ventilada de Wiesner, caja de láminas y aceite (no corresponde a estos objetivos).
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    O({ id: 'prep2', kind: 'prepBoard', pose: P(PREP2_SPOT.x, PREP2_SPOT.y), movable: false, label: 'Zona ventilada (Wiesner)' }),
    O({ id: 'flo', kind: 'dropperBottle', pose: P(WIESNER_POS.flo.x, WIESNER_POS.flo.y), label: 'Floroglucinol' }),
    O({ id: 'hcl', kind: 'dropperBottle', pose: P(WIESNER_POS.hcl.x, WIESNER_POS.hcl.y), label: 'Ácido clorhídrico (corrosivo)' }),
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    O({ id: 'oil', kind: 'oilBottle', pose: P(OIL_VIAL.x, OIL_VIAL.y), movable: false, label: 'Aceite de inmersión' }),
    // B — plántulas, rama y estereoscopio compartido.
    O({ id: 'ste', kind: 'stereo', pose: P(STEREO_POS.x, STEREO_POS.y), movable: false }),
    O({ id: 'tray', kind: 'sampleTray', pose: P(SAMPLE_TRAY.x, SAMPLE_TRAY.y), movable: false }),
    O({ id: 'leafNet', kind: 'leafSample', pose: P(SAMPLE_TRAY.x - 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray', label: 'Hoja A' }),
    O({ id: 'leafPar', kind: 'leafSample', pose: P(SAMPLE_TRAY.x + 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray', label: 'Hoja B' }),
    O({ id: 'bean', kind: 'plantSpecimen', pose: P(PLANT_POS.bean.x, PLANT_POS.bean.y), movable: false, label: has(SC_B09.UNKNOWNS) ? 'Espécimen 1' : 'Plántula de fríjol' }),
    O({ id: 'maize', kind: 'plantSpecimen', pose: P(PLANT_POS.maize.x, PLANT_POS.maize.y), movable: false, label: has(SC_B09.UNKNOWNS) ? 'Espécimen 2' : 'Plántula de maíz' }),
    O({ id: 'branch', kind: 'woodyBranch', pose: P(BRANCH_POS.x, BRANCH_POS.y), movable: false, label: 'Rama leñosa' }),
    // F — bandeja de limpieza.
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x, CLEAN_TRAY.y), movable: false }),
  ];
  const slides: OpticalWorld['slides'] = Object.fromEntries(SLIDES_B09.map((id) => [id, { kind: 'blank' as const, dirty01: 0, faceDown: false }]));
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  for (const f of fixedSlidesB09(scenarios)) {
    const sp = caseSlotPos(f.slot);
    objects.push(O({ id: f.id, kind: 'fixedSlide', pose: P(sp.x, sp.y, sp.z), support: `case:${caseSlotId(f.slot)}`, label: f.label }));
    slots[caseSlotId(f.slot)] = f.id;
    home[f.id] = caseSlotId(f.slot);
    slides[f.id] = { kind: 'fixed', dirty01: 0, faceDown: false, assetId: f.assetId, label: f.label };
  }
  const mounts: OpticalWorld['mounts'] = {};
  premadeSlidesB09(scenarios).forEach((c, i) => {
    objects.push(O({ id: c.id, kind: 'slide', pose: P(236 + i * 8, 10, 0.05), label: c.label }));
    slides[c.id] = { kind: 'blank', dirty01: 0, faceDown: false, label: c.label };
    const m = emptyMount(c.id);
    const info = emptyCellInfo();
    const z: CellZone = { specimenId: `ctl:${c.kind}:${i + 1}`, kind: c.kind, asset: '', centerCm: [0, 0], prep: 'cut', thicknessMm: c.thicknessMm, areaMm2: 30, tear01: 0, massMg: 0, premade: true, plane: 'transverse' };
    info.zones.push(z);
    info.allowed = [...CELL_RECIPES[c.kind].reagents];
    info.stainMl = { ...c.stains };
    if (c.contactS) info.contactS = { phloroglucinol: c.contactS, hcl: c.contactS };
    m.cell = info;
    m.specimenId = z.specimenId;
    m.fragmentCm = 0.8;
    m.cutState = 'prepared';
    m.waterMl = c.water;
    m.reagentMl = Object.values(c.stains).reduce((a, v) => a + (v ?? 0), 0);
    m.reagentId = (Object.keys(c.stains)[0] as StainId | undefined) ?? null;
    m.wetsSpecimen = true;
    m.coverId = `cc${i + 1}`;
    m.coveredFraction = 1;
    mounts[c.id] = m;
  });
  const fixedIds = fixedSlidesB09(scenarios).filter((f) => f.assigned).map((f) => f.id);
  return {
    seed, mode, params, scenarios,
    objects,
    slides,
    covers: {
      ...Object.fromEntries(COVERS_B09.map((id) => [id, { state: 'box' as const, tiltDeg: 0, onSlide: null }])),
      ...Object.fromEntries(premadeSlidesB09(scenarios).map((c, i) => [`cc${i + 1}`, { state: 'placed' as const, tiltDeg: 0, onSlide: c.id }])),
    },
    dispensers: {
      dw: { ml: 10, reagent: 'water' },
      flo: { ml: 5, reagent: 'phloroglucinol' },
      hcl: { ml: 5, reagent: 'hcl' },
    },
    dish: { leaves: 0, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: { leafNet: { assetId: 'leafNet', damage01: 0 }, leafPar: { assetId: 'leafParallel', damage01: 0 } },
    slideCase: { slots, home },
    assignment: { courseId: has(SC_B09.TEACHER) ? 'curso-demo' : 'standard', freshAsset: 'celery', fixedSlideIds: fixedIds, stereoSampleIds: ['leafNet', 'leafPar'] },
    // Diafragma casi cerrado de partida (S19): la lectura queda afectada hasta ajustarlo.
    microscope: has(SC_B09.DIAPHRAGM) ? { diaphragm01: 0.1 } : {},
    stereo: {},
    mounts,
  };
}
