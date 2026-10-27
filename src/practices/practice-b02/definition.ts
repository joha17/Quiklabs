/**
 * Definición de la práctica B02 «Células bajo la lente: plastidios, paredes y diversidad celular» (§1, §4): seis
 * estaciones, inventario de la mesada (el equipo óptico de B01 más las fuentes de tejido, la tabla de corte, la
 * espátula, los hisopos y los cuatro goteros), preparados de control del docente y la asignación por escenario.
 * Poses en cm (mismos ejes que B01).
 */
import type { OpticalObject, OpticalWorld, Pose, B01Params } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, CLEAN_TRAY, COVER_BOX, GLASS_BIN, MIC_POS, PREP_SPOT, SAMPLE_TRAY, STEREO_POS, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { BOARD_POS, CHEEK_POS, PREP2_SPOT, SOURCE_ROW_Y, SOURCE_X, SWAB_BOX, TRASH_BIN, slidePos } from '../../simulation/cell-world/geometry';
import { SC } from '../../simulation/cell-world/world';
import { emptyMount } from '../../simulation/specimens/mount-world';
import { emptyCellInfo, type CellKind, type CellZone, type StainId } from '../../simulation/specimens/thin-section';
import { CELL_RECIPES } from '../../simulation/specimens/stain-model';

export type B02Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B02_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [62, 40, 8], dist: 95, elevation: 0.42 },
  { id: 'B', target: [148, 28, 4], dist: 78, elevation: 0.78 },
  { id: 'C', target: [280, 30, 18], dist: 80, elevation: 0.3 },
  { id: 'D', target: [326, 26, 8], dist: 80, elevation: 0.55 },
  { id: 'E', target: [436, 30, 16], dist: 80, elevation: 0.35 },
  { id: 'F', target: [505, 30, 6], dist: 85, elevation: 0.45 },
];

/** Fuentes de tejido de la mesa (id → muestra). La manzana nunca se asigna: sirve para el CEL06. */
export const SOURCES_B02: Array<{ id: string; kind: CellKind; massMg: number; label: string }> = [
  { id: 'pot', kind: 'potato', massMg: 40000, label: 'Papa cruda' },
  { id: 'tom', kind: 'tomato', massMg: 30000, label: 'Tomate' },
  { id: 'pep', kind: 'pepper', massMg: 30000, label: 'Chile dulce' },
  { id: 'car', kind: 'carrot', massMg: 30000, label: 'Zanahoria' },
  { id: 'pea', kind: 'pear', massMg: 30000, label: 'Pera' },
  { id: 'gua', kind: 'guava', massMg: 30000, label: 'Guayaba' },
  { id: 'app', kind: 'apple', massMg: 30000, label: 'Manzana' },
];

export const SLIDES_B02 = ['sl1', 'sl2', 'sl3', 'sl4', 'sl5', 'sl6'];
export const COVERS_B02 = ['cv1', 'cv2', 'cv3', 'cv4', 'cv5', 'cv6', 'cv7', 'cv8'];
export const SWABS_B02 = ['sw1', 'sw2', 'sw3'];

/** Reactivos: id del gotero → colorante (S14: no hay azul de metileno aprobado). */
export const DROPPERS_B02: Array<{ id: string; reagent: StainId; label: string; x: number }> = [
  { id: 'dw', reagent: 'water', label: 'Agua destilada', x: 196 },
  { id: 'iod', reagent: 'lugol', label: 'Lugol', x: 204 },
  { id: 'mb', reagent: 'methylene-blue', label: 'Azul de metileno', x: 212 },
  { id: 'eo', reagent: 'eosin-1pct', label: 'Eosina 1 %', x: 220 },
];

/** Muestras asignadas por escenario (§10). */
export function assignedKinds(scenarios: string[]): CellKind[] {
  const out: CellKind[] = ['elodea', 'potato', 'tomato', 'pepper', 'carrot', 'pear', 'buccal'];
  if (scenarios.includes(SC.GUAVA)) out.push('guava');
  return out;
}

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

/** Preparados de control del docente (S01–S04): ya montados, excluidos de la nota de preparación. */
interface Premade { id: string; label: string; kind: CellKind; stains: Partial<Record<StainId, number>>; water: number; thicknessMm: number; contactS: number; bubbles: number }
export function premadeSlides(scenarios: string[]): Premade[] {
  const has = (s: string) => scenarios.includes(s);
  const out: Premade[] = [];
  if (has(SC.LUGOL_CONTROL)) out.push({ id: 'ctl1', label: 'Control: papa + Lugol', kind: 'potato', stains: { lugol: 0.05 }, water: 0.02, thicknessMm: 0.12, contactS: 120, bubbles: 0 });
  if (has(SC.PLAIN_CONTROL)) out.push({ id: 'ctl2', label: 'Control: papa sin teñir', kind: 'potato', stains: {}, water: 0.06, thicknessMm: 0.12, contactS: 0, bubbles: 0 });
  if (has(SC.THICK_SCRAPE)) out.push({ id: 'ctl3', label: 'Raspado grueso + Lugol', kind: 'potato', stains: { lugol: 0.05 }, water: 0.02, thicknessMm: 0.9, contactS: 120, bubbles: 0 });
  if (has(SC.BUBBLE_SLIDE)) out.push({ id: 'ctl4', label: 'Elodea con burbuja', kind: 'elodea', stains: {}, water: 0.06, thicknessMm: 0.05, contactS: 0, bubbles: 0.4 });
  return out;
}

export function buildB02Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const has = (s: string) => scenarios.includes(s);
  const objects: OpticalObject[] = [
    // A — seguridad, catálogo y residuos (vidrio, biológico y común).
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    // B — preparación vegetal.
    O({ id: 'prepBoard', kind: 'prepBoard', pose: P(PREP_SPOT.x, PREP_SPOT.y), movable: false }),
    O({ id: 'board', kind: 'cuttingBoard', pose: P(BOARD_POS.x, BOARD_POS.y), movable: false, label: 'Tabla de corte' }),
    O({ id: 'el', kind: 'elodeaDish', pose: P(108, 38), movable: false, label: 'Elodea' }),
    ...SOURCES_B02.map((s) => O({ id: s.id, kind: 'tissueSource', pose: P(SOURCE_X[s.id], SOURCE_ROW_Y), movable: false, label: s.label })),
    ...DROPPERS_B02.filter((d) => d.id !== 'mb' || !has(SC.EOSIN_ONLY)).map((d) => O({ id: d.id, kind: 'dropperBottle', pose: P(d.x, 36), label: d.label })),
    ...SLIDES_B02.map((id, i) => O({ id, kind: 'slide', pose: P(slidePos(i).x, slidePos(i).y, 0.05) })),
    O({ id: 'cvBox', kind: 'coverBox', pose: P(COVER_BOX.x, COVER_BOX.y), movable: false }),
    ...COVERS_B02.map((id, i) => O({ id, kind: 'coverslip', pose: P(COVER_BOX.x - 1.4 + (i % 4) * 0.9, COVER_BOX.y - 0.5 + Math.floor(i / 4), COVER_BOX.z), support: 'coverBox' })),
    O({ id: 'fc', kind: 'forceps', pose: P(172, 18, 0.4) }),
    O({ id: 'sc', kind: 'scalpel', pose: P(180, 18, 0.4) }),
    O({ id: 'sp', kind: 'spatula', pose: P(188, 18, 0.4) }),
    O({ id: 'pp', kind: 'paper', pose: P(170, 28) }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(182, 28) }),
    // C — microscopio compartido con B01.
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    // D — preparación animal y caja de láminas fijas.
    O({ id: 'prep2', kind: 'prepBoard', pose: P(PREP2_SPOT.x, PREP2_SPOT.y), movable: false, label: 'Preparación animal' }),
    O({ id: 'swb', kind: 'swabBox', pose: P(SWAB_BOX.x, SWAB_BOX.y), movable: false, label: 'Hisopos estériles' }),
    ...SWABS_B02.map((id, i) => O({ id, kind: 'swab', pose: P(SWAB_BOX.x - 2 + i * 2, SWAB_BOX.y, SWAB_BOX.z), support: 'swabBox' })),
    O({ id: 'bucc', kind: 'cheekSource', pose: P(CHEEK_POS.x, CHEEK_POS.y), movable: false, label: 'Fuente virtual de epitelio' }),
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    // E — estereoscopio y muestras (ruta opcional).
    O({ id: 'ste', kind: 'stereo', pose: P(STEREO_POS.x, STEREO_POS.y), movable: false }),
    O({ id: 'stTray', kind: 'sampleTray', pose: P(SAMPLE_TRAY.x, SAMPLE_TRAY.y), movable: false }),
    O({ id: 'leaf1', kind: 'leafSample', pose: P(SAMPLE_TRAY.x - 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray' }),
    O({ id: 'ins1', kind: 'insectSample', pose: P(SAMPLE_TRAY.x + 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray' }),
    // F — análisis y bandeja de limpieza.
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x, CLEAN_TRAY.y), movable: false }),
  ];
  const slides: OpticalWorld['slides'] = Object.fromEntries(SLIDES_B02.map((id) => [id, { kind: 'blank' as const, dirty01: 0, faceDown: false }]));
  // Un portaobjetos quedó con restos del grupo anterior: hay que mirarlo y limpiarlo antes de usarlo (CEL09).
  slides.sl6.dirty01 = 0.6;
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  const fixed = [
    { id: 'fx1', assetId: 'onion', slot: 2, label: 'Epidermis de cebolla (teñida)' },
    { id: 'fx2', assetId: 'cornStem', slot: 5, label: 'Tallo de maíz, c. t.' },
  ];
  for (const f of fixed) {
    const sp = caseSlotPos(f.slot);
    objects.push(O({ id: f.id, kind: 'fixedSlide', pose: P(sp.x, sp.y, sp.z), support: `case:${caseSlotId(f.slot)}`, label: f.label }));
    slots[caseSlotId(f.slot)] = f.id;
    home[f.id] = caseSlotId(f.slot);
    slides[f.id] = { kind: 'fixed', dirty01: 0, faceDown: false, assetId: f.assetId, label: f.label };
  }
  const mounts: OpticalWorld['mounts'] = {};
  premadeSlides(scenarios).forEach((c, i) => {
    objects.push(O({ id: c.id, kind: 'slide', pose: P(232 + i * 9, 10, 0.05), label: c.label }));
    slides[c.id] = { kind: 'blank', dirty01: 0, faceDown: false, label: c.label };
    const m = emptyMount(c.id);
    const info = emptyCellInfo();
    const z: CellZone = { specimenId: `ctl:${c.kind}:${i + 1}`, kind: c.kind, asset: '', centerCm: [0, 0], prep: c.kind === 'elodea' ? 'leaf' : 'scrape', thicknessMm: c.thicknessMm, areaMm2: 30, tear01: 0, massMg: 0, premade: true };
    info.zones.push(z);
    info.allowed = [...CELL_RECIPES[c.kind].reagents];
    info.stainMl = { ...c.stains };
    if (c.stains.lugol) info.contactS = { lugol: c.contactS };
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
    m.bubbleFraction = c.bubbles;
    // Burbuja de control (S04): sobre una parte del tejido, no sobre todo el campo.
    m.bubbles = c.bubbles ? [{ x: 1.8, y: 0.9, r: 0.8 }, { x: -1.6, y: -1.2, r: 0.6 }] : [];
    mounts[c.id] = m;
  });
  return {
    seed, mode, params, scenarios,
    objects,
    slides,
    covers: {
      ...Object.fromEntries(COVERS_B02.map((id) => [id, { state: 'box' as const, tiltDeg: 0, onSlide: null }])),
      ...Object.fromEntries(premadeSlides(scenarios).map((c, i) => [`cc${i + 1}`, { state: 'placed' as const, tiltDeg: 0, onSlide: c.id }])),
    },
    dispensers: Object.fromEntries(DROPPERS_B02.filter((d) => d.id !== 'mb' || !has(SC.EOSIN_ONLY)).map((d) => [d.id, { ml: d.reagent === 'water' ? params.dropperInitialMl : 5, reagent: d.reagent }])),
    dish: { leaves: 6, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: { leaf1: { assetId: 'leaf', damage01: 0 }, ins1: { assetId: 'insect', damage01: 0 } },
    slideCase: { slots, home },
    assignment: { courseId: has(SC.TEACHER_ASSETS) ? 'curso-demo' : 'standard', freshAsset: has(SC.DENSE_ELODEA) ? 'elodeaDense' : 'elodea', fixedSlideIds: ['fx1'], stereoSampleIds: ['leaf1', 'ins1'] },
    microscope: {},
    stereo: {},
    mounts,
  };
}
