/**
 * Definición de la práctica B06 «Atlas celular comparado: formas, movimientos y especializaciones» (§1, §4): seis
 * estaciones, inventario de la mesada (el equipo óptico de B01, la preparación de B02, los cultivos vivos, la
 * epidermis de Tradescantia, el aceite del módulo 100X y los frascos de Wright), la caja de láminas permanentes y los
 * preparados docentes por escenario. Poses en cm (mismos ejes que B01/B02).
 */
import type { OpticalObject, OpticalWorld, Pose, B01Params } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, CLEAN_TRAY, COVER_BOX, GLASS_BIN, MIC_POS, PREP_SPOT, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { CHEEK_POS, PREP2_SPOT, SWAB_BOX, TRASH_BIN, slidePos } from '../../simulation/cell-world/geometry';
import { CARDS_POS, CULTURE_PLATE, CULTURE_POS, DIRTY_ZONE, LANCET_POS, OIL_POS, POT_POS, TISSUE_POS, WRIGHT_POS } from '../../simulation/div-world/geometry';
import { SC_B06 } from '../../simulation/div-world/world';
import { emptyMount } from '../../simulation/specimens/mount-world';
import { emptyCellInfo, type CellKind, type CellZone, type StainId } from '../../simulation/specimens/thin-section';
import { CELL_RECIPES } from '../../simulation/specimens/stain-model';

export type B06Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B06_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [58, 36, 8], dist: 95, elevation: 0.42 },
  { id: 'B', target: [150, 28, 4], dist: 80, elevation: 0.78 },
  { id: 'C', target: [262, 32, 16], dist: 82, elevation: 0.32 },
  { id: 'D', target: [340, 30, 8], dist: 80, elevation: 0.55 },
  { id: 'E', target: [316, 24, 6], dist: 70, elevation: 0.7 },
  { id: 'F', target: [505, 30, 6], dist: 85, elevation: 0.45 },
];

/** Fuentes vivas de la mesa (id → muestra): la maceta de Tradescantia y los dos cultivos. */
export const SOURCES_B06: Array<{ id: string; kind: CellKind; massMg: number; label: string }> = [
  { id: 'tra', kind: 'tradescantia', massMg: 20000, label: 'Tradescantia (maceta)' },
  { id: 'cuP', kind: 'paramecium', massMg: 20, label: 'Cultivo de Paramecium' },
  { id: 'cuE', kind: 'euglena', massMg: 20, label: 'Cultivo de Euglena' },
];

export const SLIDES_B06 = ['sl1', 'sl2', 'sl3', 'sl4', 'sl5', 'sl6'];
export const COVERS_B06 = ['cv1', 'cv2', 'cv3', 'cv4', 'cv5', 'cv6', 'cv7', 'cv8'];
export const SWABS_B06 = ['sw1', 'sw2', 'sw3'];
/** Portaobjetos rajado del lote (CEL-003) y lámina permanente marcada como quebrada (CEL-051). */
export const BROKEN_SLIDE = 'sl6';
export const BROKEN_FIXED = 'fxB2';

/** Goteros: id → medio. Los cultivos son goteros de medio acuoso (la gota lleva los organismos). */
export const DROPPERS_B06: Array<{ id: string; reagent: StainId; label: string; x: number; y: number; ml?: number }> = [
  { id: 'dw', reagent: 'water', label: 'Agua destilada', x: 196, y: 36 },
  { id: 'mb', reagent: 'methylene-blue', label: 'Azul de metileno', x: 204, y: 36 },
  { id: 'iod', reagent: 'lugol', label: 'Lugol (demostración)', x: 212, y: 36 },
  { id: 'nig', reagent: 'nigrosin', label: 'Nigrosina (contraste negativo)', x: 220, y: 36 },
  { id: 'mc', reagent: 'methylcellulose', label: 'Metilcelulosa', x: 228, y: 36 },
  { id: 'cuP', reagent: 'water', label: 'Cultivo de Paramecium', x: CULTURE_POS.cuP.x, y: CULTURE_POS.cuP.y, ml: 10 },
  { id: 'cuE', reagent: 'water', label: 'Cultivo de Euglena', x: CULTURE_POS.cuE.x, y: CULTURE_POS.cuE.y, ml: 10 },
];

/** Muestras frescas asignadas (las permanentes se asignan por lámina). */
export const assignedKinds = (): CellKind[] => ['elodea', 'tradescantia', 'euglena', 'paramecium', 'buccal'];

/** Láminas permanentes de la caja: id, recurso, ranura y etiqueta (la sangre depende del escenario). */
export function fixedSlidesB06(scenarios: string[]): Array<{ id: string; assetId: string; slot: number; label: string; assigned: boolean }> {
  const has = (s: string) => scenarios.includes(s);
  const blood = has(SC_B06.TEACHER_OVERRIDE) ? 'bloodT2' : has(SC_B06.BLOOD_DIFFERENTIAL) ? 'bloodDifferential' : has(SC_B06.BLOOD_LOWCONTRAST) ? 'bloodLowContrast' : 'blood';
  const out = [
    { id: 'fxB', assetId: 'bacillus', slot: 0, label: 'Bacillus cereus (preparado permanente)', assigned: true },
    { id: 'fxS', assetId: blood, slot: 2, label: 'Frotis sanguíneo teñido (docente)', assigned: true },
    { id: 'fxO', assetId: 'onion', slot: 6, label: 'Epidermis de cebolla (otra práctica)', assigned: false },
    { id: BROKEN_FIXED, assetId: 'bacillus', slot: 8, label: 'Bacillus cereus (marcada: quebrada)', assigned: false },
    { id: 'wr1', assetId: 'bloodRaw', slot: 10, label: 'Frotis sanguíneo fijado sin teñir (ruta Wright)', assigned: true },
  ];
  if (has(SC_B06.CYANO_OPTION)) out.push({ id: 'fxC', assetId: 'cyano', slot: 4, label: 'Cianobacterias (catálogo ampliado)', assigned: true });
  // Orden desconocido para el estudiante (SC-MIXED-UNKNOWN): etiquetas neutras; el mundo conserva la identidad.
  if (has(SC_B06.MIXED_UNKNOWN)) out.forEach((f, i) => (f.label = `Lámina ${String.fromCharCode(65 + i)}`));
  return out;
}

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

/** Preparados docentes (escenarios de §10): ya montados, excluidos de la nota de preparación. */
interface Premade { id: string; label: string; kind: CellKind; stains: Partial<Record<StainId, number>>; water: number; thicknessMm: number; bubbles: number; density?: number }
export function premadeSlidesB06(scenarios: string[]): Premade[] {
  const has = (s: string) => scenarios.includes(s);
  const out: Premade[] = [];
  if (has(SC_B06.FRESH_THICK)) out.push({ id: 'ctl1', label: 'Tradescantia: tira gruesa', kind: 'tradescantia', stains: {}, water: 0.05, thicknessMm: 0.9, bubbles: 0 });
  if (has(SC_B06.FRESH_BUBBLES)) out.push({ id: 'ctl2', label: 'Tradescantia con burbujas', kind: 'tradescantia', stains: {}, water: 0.05, thicknessMm: 0.12, bubbles: 0.4 });
  if (has(SC_B06.BUCCAL_STAINED)) out.push({ id: 'ctl3', label: 'Frotis bucal teñido (docente)', kind: 'buccal', stains: { 'methylene-blue': 0.04 }, water: 0.02, thicknessMm: 0.05, bubbles: 0, density: 0.4 });
  if (has(SC_B06.BUCCAL_SPARSE)) out.push({ id: 'ctl4', label: 'Frotis bucal poco denso', kind: 'buccal', stains: { 'methylene-blue': 0.04 }, water: 0.02, thicknessMm: 0.05, bubbles: 0, density: 0.1 });
  if (has(SC_B06.BUCCAL_CLUMPED)) out.push({ id: 'ctl5', label: 'Frotis bucal aglomerado', kind: 'buccal', stains: { 'methylene-blue': 0.04 }, water: 0.02, thicknessMm: 0.05, bubbles: 0, density: 0.95 });
  return out;
}

export function buildB06Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const has = (s: string) => scenarios.includes(s);
  const immersion = has(SC_B06.BACT_IMMERSION);
  const objects: OpticalObject[] = [
    // A — seguridad, fichas del reto, zona sin desinfectar y residuos.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'cards', kind: 'sampleCards', pose: P(CARDS_POS.x, CARDS_POS.y), movable: false, label: 'Fichas del reto' }),
    O({ id: 'dirtyZone', kind: 'dirtyZone', pose: P(DIRTY_ZONE.x, DIRTY_ZONE.y), movable: false, label: 'Zona sin desinfectar' }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    // B — preparación vegetal (Elodea y Tradescantia) y medios.
    O({ id: 'prepBoard', kind: 'prepBoard', pose: P(PREP_SPOT.x, PREP_SPOT.y), movable: false }),
    O({ id: 'el', kind: 'elodeaDish', pose: P(108, 38), movable: false, label: 'Elodea' }),
    O({ id: 'tra', kind: 'plantPot', pose: P(POT_POS.x, POT_POS.y), movable: false, label: 'Tradescantia' }),
    ...DROPPERS_B06.filter((d) => !d.id.startsWith('cu')).map((d) => O({ id: d.id, kind: 'dropperBottle', pose: P(d.x, d.y), label: d.label })),
    ...SLIDES_B06.map((id, i) => O({ id, kind: 'slide', pose: P(slidePos(i).x, slidePos(i).y, 0.05), label: id === BROKEN_SLIDE ? 'Portaobjetos (rajado)' : undefined })),
    O({ id: 'cvBox', kind: 'coverBox', pose: P(COVER_BOX.x, COVER_BOX.y), movable: false }),
    ...COVERS_B06.map((id, i) => O({ id, kind: 'coverslip', pose: P(COVER_BOX.x - 1.4 + (i % 4) * 0.9, COVER_BOX.y - 0.5 + Math.floor(i / 4), COVER_BOX.z), support: 'coverBox' })),
    O({ id: 'fc', kind: 'forceps', pose: P(172, 18, 0.4) }),
    O({ id: 'sc', kind: 'scalpel', pose: P(180, 18, 0.4) }),
    O({ id: 'pp', kind: 'paper', pose: P(170, 28) }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(182, 28) }),
    O({ id: 'tw', kind: 'tissue', pose: P(TISSUE_POS.x, TISSUE_POS.y), label: 'Pañuelo de papel' }),
    // C — microscopio compartido y cultivos vivos.
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    // Cada cultivo vivo tiene su propio gotero (no se comparte con los colorantes).
    ...DROPPERS_B06.filter((d) => d.id.startsWith('cu')).map((d) => O({ id: d.id, kind: 'dropperBottle', pose: P(d.x, d.y), label: d.label })),
    // D — caja de láminas permanentes, aceite (solo con el módulo 100X), Wright, cultivo cerrado y lanceta bloqueada.
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    ...(immersion ? [O({ id: 'oil', kind: 'oilBottle', pose: P(OIL_POS.x, OIL_POS.y), movable: false, label: 'Aceite de inmersión' })] : []),
    O({ id: 'wri', kind: 'wrightBottle', pose: P(WRIGHT_POS.wri.x, WRIGHT_POS.wri.y), movable: false, label: 'Colorante de Wright' }),
    O({ id: 'buf', kind: 'wrightBottle', pose: P(WRIGHT_POS.buf.x, WRIGHT_POS.buf.y), movable: false, label: 'Tampón fosfato' }),
    O({ id: 'bcPlate', kind: 'culturePlate', pose: P(CULTURE_PLATE.x, CULTURE_PLATE.y), movable: false, label: 'Cultivo de B. cereus (cerrado)' }),
    O({ id: 'lancet', kind: 'lancetBox', pose: P(LANCET_POS.x, LANCET_POS.y), movable: false, label: 'Lancetas (no permitidas)' }),
    // E — frotis bucal.
    O({ id: 'prep2', kind: 'prepBoard', pose: P(PREP2_SPOT.x, PREP2_SPOT.y), movable: false, label: 'Preparación animal' }),
    O({ id: 'swb', kind: 'swabBox', pose: P(SWAB_BOX.x, SWAB_BOX.y), movable: false, label: 'Hisopos estériles' }),
    ...SWABS_B06.map((id, i) => O({ id, kind: 'swab', pose: P(SWAB_BOX.x - 2 + i * 2, SWAB_BOX.y, SWAB_BOX.z), support: 'swabBox' })),
    O({ id: 'bucc', kind: 'cheekSource', pose: P(CHEEK_POS.x, CHEEK_POS.y), movable: false, label: 'Fuente virtual de epitelio' }),
    // F — análisis y bandeja de limpieza.
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x, CLEAN_TRAY.y), movable: false }),
  ];
  const slides: OpticalWorld['slides'] = Object.fromEntries(SLIDES_B06.map((id) => [id, { kind: 'blank' as const, dirty01: 0, faceDown: false }]));
  // Un portaobjetos con restos del grupo anterior (CEL-013).
  slides.sl5.dirty01 = 0.6;
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  for (const f of fixedSlidesB06(scenarios)) {
    const sp = caseSlotPos(f.slot);
    objects.push(O({ id: f.id, kind: 'fixedSlide', pose: P(sp.x, sp.y, sp.z), support: `case:${caseSlotId(f.slot)}`, label: f.label }));
    slots[caseSlotId(f.slot)] = f.id;
    home[f.id] = caseSlotId(f.slot);
    slides[f.id] = { kind: 'fixed', dirty01: 0, faceDown: false, assetId: f.assetId, label: f.label };
  }
  const mounts: OpticalWorld['mounts'] = {};
  premadeSlidesB06(scenarios).forEach((c, i) => {
    objects.push(O({ id: c.id, kind: 'slide', pose: P(236 + i * 8, 10, 0.05), label: c.label }));
    slides[c.id] = { kind: 'blank', dirty01: 0, faceDown: false, label: c.label };
    const m = emptyMount(c.id);
    const info = emptyCellInfo();
    const prep = c.kind === 'buccal' ? 'smear' : 'peel';
    const z: CellZone = { specimenId: `ctl:${c.kind}:${i + 1}`, kind: c.kind, asset: '', centerCm: [0, 0], prep, thicknessMm: c.thicknessMm, areaMm2: 30, tear01: 0, massMg: 0, premade: true };
    info.zones.push(z);
    info.allowed = [...CELL_RECIPES[c.kind].reagents];
    info.stainMl = { ...c.stains };
    info.smearDensity01 = c.density ?? 0;
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
    m.bubbles = c.bubbles ? [{ x: 1.8, y: 0.9, r: 0.8 }, { x: -1.6, y: -1.2, r: 0.6 }] : [];
    mounts[c.id] = m;
  });
  const fixedIds = fixedSlidesB06(scenarios).filter((f) => f.assigned).map((f) => f.id);
  return {
    seed, mode, params, scenarios,
    objects,
    slides,
    covers: {
      ...Object.fromEntries(COVERS_B06.map((id) => [id, { state: 'box' as const, tiltDeg: 0, onSlide: null }])),
      ...Object.fromEntries(premadeSlidesB06(scenarios).map((c, i) => [`cc${i + 1}`, { state: 'placed' as const, tiltDeg: 0, onSlide: c.id }])),
    },
    dispensers: Object.fromEntries(DROPPERS_B06.map((d) => [d.id, { ml: d.ml ?? (d.reagent === 'water' ? params.dropperInitialMl : 5), reagent: d.reagent }])),
    dish: { leaves: 6, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: {},
    slideCase: { slots, home },
    assignment: { courseId: has(SC_B06.TEACHER_OVERRIDE) ? 'curso-demo' : 'standard', freshAsset: 'elodea', fixedSlideIds: fixedIds, stereoSampleIds: [] },
    microscope: {},
    stereo: {},
    mounts,
  };
}
