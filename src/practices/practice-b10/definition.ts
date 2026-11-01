/**
 * Definición de la práctica B10 «Tejidos animales y anatomía comparada» (§1, §4): seis estaciones, inventario de la mesada (el equipo
 * óptico de B01, la caja de láminas, los estantes de modelos 3D y la bandeja de huellas) y lo que cada escenario docente asigna. La
 * caja física tiene 12 ranuras (B10-2): el catálogo tiene 18 láminas y cada asignación carga las que le tocan. Poses en cm.
 */
import type { B01Params, OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, CLEAN_TRAY, COVER_BOX, GLASS_BIN, MIC_POS, PREP_SPOT, SAMPLE_TRAY, STEREO_POS, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { BOARD_POS, TRASH_BIN, slidePos } from '../../simulation/cell-world/geometry';
import { OIL_VIAL } from '../../simulation/plant-world/geometry';
import { ORIENT_POS, MUSCLE_SOURCE_POS, SHELF_POS, TRACK_TRAY_POS, WATER_POS } from '../../simulation/animal-world/geometry';
import { SC_B10 } from '../../simulation/animal-world/world';
import { modelsOf } from '../../simulation/animal-world/catalog';
import type { B10Module } from '../../simulation/animal-world/types';
import type { CellKind } from '../../simulation/specimens/thin-section';

export type B10Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B10_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [84, 40, 8], dist: 105, elevation: 0.42 },
  { id: 'B', target: [305, 32, 14], dist: 88, elevation: 0.34 },
  { id: 'C', target: [440, 28, 10], dist: 78, elevation: 0.45 },
  { id: 'D', target: [150, 28, 4], dist: 86, elevation: 0.72 },
  { id: 'E', target: [496, 44, 8], dist: 90, elevation: 0.4 },
  { id: 'F', target: [510, 26, 6], dist: 82, elevation: 0.55 },
];

export const FIXED_CATALOG: Record<string, { assetId: string; label: string }> = {
  fxSK: { assetId: 'muscleSkeletal', label: 'Músculo A' },
  fxCA: { assetId: 'muscleCardiac', label: 'Músculo B' },
  fxSM: { assetId: 'muscleSmooth', label: 'Músculo C' },
  fxEP: { assetId: 'epithelium', label: 'Epitelio' },
  fxCT: { assetId: 'connective', label: 'Tejido conjuntivo' },
  fxNE: { assetId: 'nervous', label: 'Tejido nervioso' },
  fxSP: { assetId: 'sponge', label: 'Esponja (corte)' },
  fxCO: { assetId: 'coral', label: 'Coral (corte)' },
  fxME: { assetId: 'medusa', label: 'Medusa (corte)' },
  fxPL: { assetId: 'planariaWM', label: 'Planaria' },
  fxFL: { assetId: 'flukeWM', label: 'Duela' },
  fxNM: { assetId: 'nematodeTS', label: 'Nematodo (corte)' },
  fxCE: { assetId: 'cestodeWM', label: 'Cestodo' },
  fxEW: { assetId: 'earthwormTS', label: 'Lombriz (corte)' },
  fxDA: { assetId: 'daphniaWM', label: 'Daphnia' },
  fxLO: { assetId: 'louseWM', label: 'Piojo' },
  fxMS: { assetId: 'medusaStages', label: 'Estadios de escifozoo' },
  fxLS: { assetId: 'louseStages', label: 'Estadios de piojo' },
  fxO: { assetId: 'onion', label: 'Epidermis de cebolla (otra práctica)' },
};

export const SLIDES_B10 = ['sl1', 'sl2'];
export const COVERS_B10 = ['cv1', 'cv2', 'cv3'];
export const STEREO_SAMPLES = ['stDaphnia', 'stLouse'];

const BIRDS = modelsOf('bird').map((m) => m.id);
const SKULLS = modelsOf('skull').map((m) => m.id);
const TRACKS = modelsOf('track').map((m) => m.id);

interface Assign { slides: string[]; models: string[]; tracks: string[]; stereo: string[]; modules: B10Module[] }
const A = (modules: B10Module[], slides: string[] = [], models: string[] = [], tracks: string[] = [], stereo: string[] = []): Assign => ({ modules, slides, models, tracks, stereo });

const BASE_SLIDES = ['fxSK', 'fxCA', 'fxEP', 'fxCT', 'fxNE', 'fxSP', 'fxME', 'fxPL', 'fxFL', 'fxNM', 'fxCE'];
const HIST = ['fxEP', 'fxCT', 'fxSK', 'fxCA'];

/** Práctica completa: lo que exige cuando ningún escenario acota el recorrido. */
const FULL = A(['histology', 'muscle', 'invertebrates', 'small', 'zoology', 'birds', 'skulls', 'teeth', 'tracks'], BASE_SLIDES, ['planaria', 'fluke', 'nematode', 'cestode', 'earthworm', 'grasshopper', 'spider', 'boneFish', 'cartFish', 'mammal', 'birdFinch', 'birdRaptor', 'birdDuck', 'skullHorse', 'skullCow'], ['trackHorse', 'trackCow', 'trackDog'], STEREO_SAMPLES);

/** Escenarios que acotan el recorrido (§10); se suman si se eligen varios. */
const FOCUS: Partial<Record<string, Assign>> = {
  [SC_B10.HISTOLOGY]: A(['histology', 'muscle'], ['fxEP', 'fxCT', 'fxNE', 'fxSK', 'fxCA', 'fxSM']),
  [SC_B10.MUSCLE]: A(['muscle'], ['fxSK', 'fxCA', 'fxSM']),
  [SC_B10.SPONGE_CNIDARIA]: A(['histology', 'muscle', 'invertebrates'], [...HIST, 'fxSP', 'fxCO', 'fxME']),
  [SC_B10.FLATWORMS]: A(['histology', 'muscle', 'invertebrates'], [...HIST, 'fxPL', 'fxFL', 'fxNM', 'fxCE']),
  [SC_B10.ANNELIDS]: A(['histology', 'muscle', 'invertebrates'], [...HIST, 'fxEW'], ['earthworm']),
  [SC_B10.ARTHROPODS]: A(['small', 'zoology'], [], ['grasshopper', 'butterfly', 'spider', 'scorpion', 'opilion'], [], STEREO_SAMPLES),
  [SC_B10.DAPHNIA_LOUSE]: A(['small'], ['fxDA', 'fxLO', 'fxLS'], [], [], STEREO_SAMPLES),
  [SC_B10.MEDUSA_STAGES]: A(['invertebrates', 'small'], ['fxME', 'fxCO', 'fxMS']),
  [SC_B10.WORM_MODELS]: A(['zoology'], [], ['planaria', 'fluke', 'nematode', 'cestode']),
  [SC_B10.EARTHWORM]: A(['invertebrates', 'zoology'], ['fxEW'], ['earthworm']),
  [SC_B10.INSECT_ARACHNID]: A(['zoology'], [], ['grasshopper', 'butterfly', 'spider', 'scorpion', 'opilion']),
  [SC_B10.FISH]: A(['zoology'], [], ['boneFish', 'cartFish']),
  [SC_B10.TETRAPODS]: A(['zoology', 'birds'], [], ['frog', 'lizard', 'birdFinch']),
  [SC_B10.BIRDS]: A(['birds'], [], BIRDS),
  [SC_B10.MAMMALS]: A(['zoology', 'skulls'], [], ['mammal', 'skullDog']),
  [SC_B10.SKULLS]: A(['skulls'], [], SKULLS),
  [SC_B10.TEETH]: A(['skulls', 'teeth'], [], SKULLS),
  [SC_B10.TRACKS]: A(['tracks'], [], [], TRACKS),
  [SC_B10.SKULL_TEETH_TRACKS]: A(['skulls', 'teeth', 'tracks'], [], SKULLS, TRACKS),
  [SC_B10.HORSE]: A(['skulls', 'teeth'], [], ['skullHorse']),
  [SC_B10.COW]: A(['skulls', 'teeth'], [], ['skullCow']),
  [SC_B10.HORSE_COW]: A(['skulls', 'teeth'], [], ['skullHorse', 'skullCow']),
  [SC_B10.DIETS]: A(['skulls', 'teeth'], [], ['skullHorse', 'skullDog', 'skullPig']),
  [SC_B10.EVAL_4]: A(['muscle', 'skulls', 'tracks'], ['fxSK', 'fxCA'], ['skullHorse'], ['trackCow']),
  [SC_B10.EVAL_8]: A(['muscle', 'invertebrates', 'zoology', 'skulls', 'tracks'], ['fxSK', 'fxCA', 'fxPL', 'fxCE'], ['spider', 'skullCow'], ['trackHorse', 'trackDog']),
  [SC_B10.EVAL_12]: A(['histology', 'muscle', 'invertebrates', 'zoology', 'birds', 'skulls', 'tracks'], ['fxEP', 'fxSK', 'fxCA', 'fxPL', 'fxNM'], ['grasshopper', 'cartFish', 'birdRaptor', 'skullHorse', 'skullCow'], ['trackBear', 'trackCat']),
};

export function assignmentB10(scenarios: string[]): Assign {
  const focused = scenarios.map((s) => FOCUS[s]).filter((x): x is Assign => !!x);
  if (!focused.length) return structuredClone(FULL);
  const merge = <T>(pick: (a: Assign) => T[]) => [...new Set(focused.flatMap(pick))];
  return { modules: merge((a) => a.modules), slides: merge((a) => a.slides), models: merge((a) => a.models), tracks: merge((a) => a.tracks), stereo: merge((a) => a.stereo) };
}

/** Láminas en la caja: las exigidas, hasta 12 ranuras; con hueco, la de otra práctica como distractor. */
export function fixedSlidesB10(scenarios: string[]): Array<{ id: string; assetId: string; slot: number; label: string; assigned: boolean }> {
  const req = assignmentB10(scenarios).slides.slice(0, 12);
  const out = req.map((id, slot) => ({ id, assetId: FIXED_CATALOG[id].assetId, slot, label: FIXED_CATALOG[id].label, assigned: true }));
  if (out.length < 12) out.push({ id: 'fxO', assetId: FIXED_CATALOG.fxO.assetId, slot: 11, label: FIXED_CATALOG.fxO.label, assigned: false });
  const has = (s: string) => scenarios.includes(s);
  // Recurso docente (S28): los discos intercalares se ven en la versión del curso.
  if (has(SC_B10.TEACHER)) out.filter((f) => f.id === 'fxCA').forEach((f) => (f.assetId = 'muscleCardiacDiscs'));
  // Evaluación: etiqueta neutra, el mundo conserva la identidad.
  if (has(SC_B10.EVAL_4) || has(SC_B10.EVAL_8) || has(SC_B10.EVAL_12)) out.forEach((f, i) => (f.label = `Lámina ${String.fromCharCode(65 + i)}`));
  return out;
}

const SHELF_LABEL: Record<string, string> = { invRack: 'Invertebrados', verRack: 'Vertebrados', birdRack: 'Aves', skullRack: 'Cráneos' };

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

export const SOURCES_B10: Array<{ id: string; kind: CellKind; massMg: number; label: string }> = [{ id: 'mus', kind: 'muscleFresh', massMg: 20000, label: 'Músculo crudo' }];

export function buildB10Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const has = (s: string) => scenarios.includes(s);
  const objects: OpticalObject[] = [
    // A — orientación, seguridad y residuos.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'orient', kind: 'orientationBoard', pose: P(ORIENT_POS.x, ORIENT_POS.y), movable: false, label: 'Mesa de orientación' }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    // D — montaje fresco opcional (S29); el resto queda en la mesa aunque no se use.
    O({ id: 'prepBoard', kind: 'prepBoard', pose: P(PREP_SPOT.x, PREP_SPOT.y), movable: false }),
    O({ id: 'board', kind: 'cuttingBoard', pose: P(BOARD_POS.x, BOARD_POS.y), movable: false, label: 'Tabla de corte' }),
    ...(has(SC_B10.FRESH) ? SOURCES_B10.map((s) => O({ id: s.id, kind: 'tissueSource', pose: P(MUSCLE_SOURCE_POS.x, MUSCLE_SOURCE_POS.y), movable: false, label: s.label })) : []),
    O({ id: 'dw', kind: 'dropperBottle', pose: P(WATER_POS.x, WATER_POS.y), label: 'Solución isotónica' }),
    ...SLIDES_B10.map((id, i) => O({ id, kind: 'slide', pose: P(slidePos(i).x, slidePos(i).y, 0.05) })),
    O({ id: 'cvBox', kind: 'coverBox', pose: P(COVER_BOX.x, COVER_BOX.y), movable: false }),
    ...COVERS_B10.map((id, i) => O({ id, kind: 'coverslip', pose: P(COVER_BOX.x - 1.4 + (i % 4) * 0.9, COVER_BOX.y - 0.5, COVER_BOX.z), support: 'coverBox' })),
    O({ id: 'fc', kind: 'forceps', pose: P(172, 18, 0.4) }),
    O({ id: 'sc', kind: 'scalpel', pose: P(180, 18, 0.4) }),
    O({ id: 'pp', kind: 'paper', pose: P(170, 28) }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(182, 28) }),
    O({ id: 'tw', kind: 'tissue', pose: P(196, 26), label: 'Pañuelo de papel' }),
    // B — microscopio y caja de láminas.
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    O({ id: 'oil', kind: 'oilBottle', pose: P(OIL_VIAL.x, OIL_VIAL.y), movable: false, label: 'Aceite de inmersión' }),
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    // C — estereoscopio y organismos pequeños.
    O({ id: 'ste', kind: 'stereo', pose: P(STEREO_POS.x, STEREO_POS.y), movable: false }),
    O({ id: 'tray', kind: 'sampleTray', pose: P(SAMPLE_TRAY.x, SAMPLE_TRAY.y), movable: false }),
    O({ id: 'stDaphnia', kind: 'leafSample', pose: P(SAMPLE_TRAY.x - 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray', label: 'Muestra pequeña 1' }),
    O({ id: 'stLouse', kind: 'insectSample', pose: P(SAMPLE_TRAY.x + 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray', label: 'Muestra pequeña 2' }),
    // E y F — estantes de modelos, cráneos y huellas.
    ...Object.entries(SHELF_POS).map(([id, p]) => O({ id, kind: 'modelShelf', pose: P(p.x, p.y), movable: false, label: SHELF_LABEL[id] })),
    O({ id: 'trackBox', kind: 'trackTray', pose: P(TRACK_TRAY_POS.x, TRACK_TRAY_POS.y), movable: false, label: 'Huellas 3D' }),
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x, CLEAN_TRAY.y), movable: false }),
  ];
  const slides: OpticalWorld['slides'] = Object.fromEntries(SLIDES_B10.map((id) => [id, { kind: 'blank' as const, dirty01: 0, faceDown: false }]));
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  const fixed = fixedSlidesB10(scenarios);
  for (const f of fixed) {
    const sp = caseSlotPos(f.slot);
    objects.push(O({ id: f.id, kind: 'fixedSlide', pose: P(sp.x, sp.y, sp.z), support: `case:${caseSlotId(f.slot)}`, label: f.label }));
    slots[caseSlotId(f.slot)] = f.id;
    home[f.id] = caseSlotId(f.slot);
    slides[f.id] = { kind: 'fixed', dirty01: 0, faceDown: false, assetId: f.assetId, label: f.label };
  }
  return {
    seed, mode, params, scenarios,
    objects,
    slides,
    covers: Object.fromEntries(COVERS_B10.map((id) => [id, { state: 'box' as const, tiltDeg: 0, onSlide: null }])),
    dispensers: { dw: { ml: 10, reagent: 'water' } },
    dish: { leaves: 0, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: { stDaphnia: { assetId: 'daphniaWM', damage01: 0 }, stLouse: { assetId: 'louseWM', damage01: 0 } },
    slideCase: { slots, home },
    assignment: { courseId: has(SC_B10.TEACHER) ? 'curso-demo' : 'standard', freshAsset: 'muscleFresh', fixedSlideIds: fixed.filter((f) => f.assigned).map((f) => f.id), stereoSampleIds: STEREO_SAMPLES },
    microscope: {},
    stereo: {},
    mounts: {},
  };
}
