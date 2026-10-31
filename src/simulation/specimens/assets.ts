/**
 * Paquete ESTÁNDAR de observación (§4.3) publicado por la administración. Hoy contiene ILUSTRACIONES DIDÁCTICAS
 * generadas por el motor (no microfotografías): `captureQuality: 'illustrative'`. El mundo solo guarda el id, la
 * versión y el hash del manifiesto; las regiones anotadas (polígonos normalizados 0–1 de la imagen) y el aumento en
 * que cada estructura es observable deciden la evidencia. Para usar fotos reales se publica otro manifiesto con las
 * mismas estructuras (sin cambiar el dominio).
 */
import { stableHash } from '../core/math';

export type StructureId =
  | 'leafBlade' | 'midrib' | 'leafMargin' | 'cellWall' | 'chloroplasts'
  | 'epidermalCells' | 'nucleus' | 'vascularBundle' | 'xylem' | 'phloem' | 'epidermis' | 'cortex'
  | 'venation' | 'trichomes'
  | 'antenna' | 'compoundEye' | 'head' | 'thorax' | 'abdomen' | 'wing' | 'leg'
  // B02 — estructuras celulares (§3.1).
  | 'fruitCells' | 'epithelialCells' | 'cellBorder' | 'cytoplasm' | 'chromoplasts' | 'starchGrains' | 'amyloplasts' | 'sclereids'
  | 'vacuole' | 'cellMembrane'
  // B03 — respuesta osmótica de Elodea (§3.3).
  | 'protoplast' | 'periplasmicSpace'
  // B04 — tinción de Feulgen (ADN nuclear en magenta, §3.1).
  | 'dnaStain'
  // B06 — atlas celular comparado (§3.1): epidermis, protistas, procariotas y sangre.
  | 'stoma' | 'guardCells' | 'euglenaCell' | 'pellicle' | 'eyespot' | 'flagellum' | 'parameciumCell' | 'cilia' | 'oralGroove'
  | 'contractileVacuole' | 'foodVacuole' | 'macronucleus' | 'bacilli' | 'cellChain' | 'cyanoFilament' | 'heterocyst'
  | 'erythrocyte' | 'leukocyte' | 'platelet' | 'neutrophil' | 'lymphocyte'
  // B07 — frotis bacteriano (§3.2): campo teñido y formas celulares.
  | 'stainedField' | 'cocci' | 'rods'
  // B09 — tejidos y regiones vegetales (§3.1). `lignifiedWall`: pared teñida por Wiesner (es tinción, no un tejido).
  | 'rootCap' | 'meristem' | 'elongationZone' | 'stele' | 'endodermis' | 'pericycle' | 'casparian' | 'pith' | 'parenchyma' | 'collenchyma' | 'sclerenchyma'
  | 'cambium' | 'companionCell' | 'palisade' | 'spongy' | 'mesophyll' | 'cuticle' | 'growthRing' | 'bark' | 'lignifiedWall';

/**
 * Estado de la evidencia de una estructura en un activo (B02, §2): `visible` puede exigirse sobre la imagen; `inferred`
 * se sabe que existe pero la foto no la muestra; `unavailable`, el recurso no permite evaluarla. Ausente = `visible`.
 */
export type EvidenceStatus = 'visible' | 'inferred' | 'unavailable';

export interface ObservationView {
  viewId: string;
  objectiveX?: 4 | 10 | 40 | 100;
  zoomX?: number;
  channel: 'mono' | 'left' | 'right';
  illumination: 'transmitted' | 'incident' | 'both';
  /** Planos focales disponibles en la fuente (1 = foto única). */
  focalPlanes: number;
}

export interface Annotation {
  structureId: StructureId;
  polygonNormalized: number[][];
  observableAtObjectiveX?: number[];
  /** Estereoscopio: zoom mínimo al que la estructura se distingue. */
  observableAtZoomMin?: number;
  evidence?: EvidenceStatus;
}

export interface ObservationAssetManifest {
  assetId: string;
  version: number;
  contentHash: string;
  ownerRole: 'admin' | 'teacher';
  ownerId: string;
  name: string;
  sampleKind: 'fresh' | 'fixed' | 'stereo';
  sourceAttribution: string;
  /** Tamaño real que representa la imagen (mm). */
  extentMm: [number, number];
  views: ObservationView[];
  annotations: Annotation[];
  captureQuality: 'calibrated' | 'illustrative' | 'uncalibrated';
  fallbackPolicy: 'admin-version' | 'unavailable';
  /** Propiedades ópticas de la muestra (estereoscopio). */
  opaque?: boolean;
  reflective?: boolean;
}

const LEAF = [[0.5, 0.04], [0.6, 0.16], [0.65, 0.4], [0.64, 0.72], [0.58, 0.96], [0.42, 0.96], [0.36, 0.72], [0.35, 0.4], [0.4, 0.16]];
const inset = (pts: number[][], k: number) => {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
};
/** Banda del borde: contorno exterior + contorno interior recorrido al revés. */
const band = (pts: number[][], k: number) => [...pts, pts[0], ...inset(pts, k).reverse(), inset(pts, k)[inset(pts, k).length - 1]];
const rect = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (cx: number, cy: number, r: number, n = 20) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);

const DIDACTIC = 'Ilustración didáctica generada por Quiklabs (no es una microfotografía). Basada en la guía «Práctica 1. Uso del equipo óptico».';

function manifest(m: Omit<ObservationAssetManifest, 'contentHash' | 'ownerRole' | 'ownerId' | 'captureQuality' | 'fallbackPolicy' | 'sourceAttribution' | 'version'>): ObservationAssetManifest {
  const base = { ...m, version: 1, ownerRole: 'admin' as const, ownerId: 'u_admin', captureQuality: 'illustrative' as const, fallbackPolicy: 'admin-version' as const, sourceAttribution: DIDACTIC };
  return { ...base, contentHash: stableHash(base) };
}

const micViews = (illum: ObservationView['illumination'] = 'transmitted'): ObservationView[] => [4, 10, 40].map((o) => ({ viewId: `x${o}`, objectiveX: o as 4 | 10 | 40, channel: 'mono', illumination: illum, focalPlanes: 1 }));

export const ASSETS: Record<string, ObservationAssetManifest> = {
  elodea: manifest({
    assetId: 'elodea', name: 'Hoja de Elodea (montaje fresco)', sampleKind: 'fresh', extentMm: [8, 8], views: micViews(),
    annotations: [
      { structureId: 'leafBlade', polygonNormalized: LEAF, observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'midrib', polygonNormalized: rect(0.485, 0.1, 0.515, 0.95), observableAtObjectiveX: [4, 10] },
      { structureId: 'leafMargin', polygonNormalized: band(LEAF, 0.9), observableAtObjectiveX: [4, 10] },
      { structureId: 'cellWall', polygonNormalized: LEAF, observableAtObjectiveX: [10, 40] },
      { structureId: 'chloroplasts', polygonNormalized: LEAF, observableAtObjectiveX: [10, 40] },
    ],
  }),
  onion: manifest({
    assetId: 'onion', name: 'Epidermis de cebolla teñida (lámina fija)', sampleKind: 'fixed', extentMm: [10, 10], views: micViews(),
    annotations: [
      { structureId: 'epidermalCells', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'cellWall', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [10, 40] },
      { structureId: 'nucleus', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [10, 40] },
    ],
  }),
  onionPlain: manifest({
    assetId: 'onionPlain', name: 'Epidermis de cebolla sin teñir (lámina fija)', sampleKind: 'fixed', extentMm: [10, 10], views: micViews(),
    annotations: [
      { structureId: 'epidermalCells', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'cellWall', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [10, 40] },
    ],
  }),
  cornStem: manifest({
    assetId: 'cornStem', name: 'Tallo de maíz, corte transversal (lámina fija)', sampleKind: 'fixed', extentMm: [6, 6], views: micViews(),
    annotations: [
      { structureId: 'epidermis', polygonNormalized: band(circle(0.5, 0.5, 0.42), 0.93), observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'vascularBundle', polygonNormalized: circle(0.5, 0.5, 0.36), observableAtObjectiveX: [4, 10] },
      { structureId: 'xylem', polygonNormalized: circle(0.5, 0.5, 0.36), observableAtObjectiveX: [10, 40] },
      { structureId: 'phloem', polygonNormalized: circle(0.5, 0.5, 0.36), observableAtObjectiveX: [10, 40] },
    ],
  }),
  rootTip: manifest({
    assetId: 'rootTip', name: 'Raíz de Ranunculus, corte transversal (lámina fija)', sampleKind: 'fixed', extentMm: [6, 6], views: micViews(),
    annotations: [
      { structureId: 'epidermis', polygonNormalized: band(circle(0.5, 0.5, 0.4), 0.92), observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'cortex', polygonNormalized: circle(0.5, 0.5, 0.36), observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'xylem', polygonNormalized: circle(0.5, 0.5, 0.1), observableAtObjectiveX: [10, 40] },
    ],
  }),
  leaf: manifest({
    assetId: 'leaf', name: 'Hoja vegetal (estereoscopio)', sampleKind: 'stereo', extentMm: [40, 40], opaque: true, reflective: false,
    views: [{ viewId: 'mono', channel: 'mono', illumination: 'incident', focalPlanes: 1 }],
    annotations: [
      { structureId: 'venation', polygonNormalized: [[0.5, 0.06], [0.75, 0.3], [0.8, 0.6], [0.6, 0.92], [0.4, 0.92], [0.2, 0.6], [0.25, 0.3]], observableAtZoomMin: 0.7 },
      { structureId: 'leafMargin', polygonNormalized: band([[0.5, 0.06], [0.75, 0.3], [0.8, 0.6], [0.6, 0.92], [0.4, 0.92], [0.2, 0.6], [0.25, 0.3]], 0.9), observableAtZoomMin: 1 },
      { structureId: 'trichomes', polygonNormalized: [[0.5, 0.06], [0.75, 0.3], [0.8, 0.6], [0.6, 0.92], [0.4, 0.92], [0.2, 0.6], [0.25, 0.3]], observableAtZoomMin: 2.5 },
    ],
  }),
  insect: manifest({
    assetId: 'insect', name: 'Escarabajo conservado (estereoscopio)', sampleKind: 'stereo', extentMm: [24, 24], opaque: true, reflective: false,
    views: [{ viewId: 'mono', channel: 'mono', illumination: 'incident', focalPlanes: 1 }],
    annotations: [
      { structureId: 'head', polygonNormalized: circle(0.5, 0.24, 0.08), observableAtZoomMin: 0.7 },
      { structureId: 'compoundEye', polygonNormalized: rect(0.4, 0.19, 0.6, 0.27), observableAtZoomMin: 2 },
      { structureId: 'antenna', polygonNormalized: [[0.44, 0.18], [0.3, 0.04], [0.36, 0.03], [0.48, 0.17], [0.52, 0.17], [0.64, 0.03], [0.7, 0.04], [0.56, 0.18]], observableAtZoomMin: 1 },
      { structureId: 'thorax', polygonNormalized: rect(0.4, 0.3, 0.6, 0.42), observableAtZoomMin: 0.7 },
      { structureId: 'abdomen', polygonNormalized: [[0.38, 0.42], [0.62, 0.42], [0.64, 0.7], [0.5, 0.86], [0.36, 0.7]], observableAtZoomMin: 0.7 },
      { structureId: 'wing', polygonNormalized: [[0.5, 0.42], [0.64, 0.44], [0.66, 0.74], [0.5, 0.88], [0.34, 0.74], [0.36, 0.44]], observableAtZoomMin: 1 },
      { structureId: 'leg', polygonNormalized: [[0.4, 0.33], [0.18, 0.28], [0.14, 0.32], [0.38, 0.4], [0.62, 0.4], [0.86, 0.32], [0.82, 0.28], [0.6, 0.33], [0.62, 0.5], [0.86, 0.62], [0.82, 0.66], [0.6, 0.56], [0.4, 0.56], [0.18, 0.66], [0.14, 0.62], [0.38, 0.5]], observableAtZoomMin: 1 },
    ],
  }),
};

/** Variante reflectante del insecto (S13): mismas estructuras, superficie metálica. */
export const REFLECTIVE_INSECT: ObservationAssetManifest = (() => {
  const base = { ...ASSETS.insect, assetId: 'insectShiny', name: 'Escarabajo de élitros metálicos (estereoscopio)', reflective: true };
  const { contentHash: _h, ...rest } = base;
  void _h;
  return { ...rest, contentHash: stableHash(rest) };
})();

// ─────────────── Paquete B02: células bajo la lente (§4.3, §4.4) ───────────────

const DIDACTIC_B02 = 'Ilustración didáctica generada por Quiklabs (no es una microfotografía). Basada en la guía «Práctica 2. Estructuras y Organelas Celulares».';

/** Contorno irregular y determinista de un fragmento de tejido (normalizado). */
const blob = (r: number, seed: number, n = 18) =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const k = 1 + 0.12 * Math.sin(3 * t + seed) + 0.07 * Math.cos(5 * t + 2 * seed);
    return [0.5 + r * k * Math.cos(t), 0.5 + r * k * Math.sin(t)];
  });

function cellManifest(
  m: Omit<ObservationAssetManifest, 'contentHash' | 'ownerRole' | 'ownerId' | 'captureQuality' | 'fallbackPolicy' | 'sourceAttribution' | 'version' | 'views' | 'sampleKind'>,
  owner: { role: 'admin' | 'teacher'; id: string; version: number; attribution?: string } = { role: 'admin', id: 'u_admin', version: 1 },
): ObservationAssetManifest {
  const base = {
    ...m, sampleKind: 'fresh' as const, views: micViews(), version: owner.version, ownerRole: owner.role, ownerId: owner.id, captureQuality: 'illustrative' as const,
    fallbackPolicy: 'admin-version' as const, sourceAttribution: owner.attribution ?? DIDACTIC_B02,
  };
  return { ...base, contentHash: stableHash(base) };
}

type Ann = Annotation;
const TISSUE = blob(0.4, 1.3);
const SMEAR = blob(0.42, 2.1, 22);
const fruit = (extra: Ann[]): Ann[] => [
  { structureId: 'fruitCells', polygonNormalized: TISSUE, observableAtObjectiveX: [4, 10, 40] },
  { structureId: 'cellWall', polygonNormalized: TISSUE, observableAtObjectiveX: [10, 40] },
  { structureId: 'vacuole', polygonNormalized: TISSUE, observableAtObjectiveX: [10, 40], evidence: 'inferred' },
  { structureId: 'cellMembrane', polygonNormalized: TISSUE, observableAtObjectiveX: [40], evidence: 'unavailable' },
  { structureId: 'nucleus', polygonNormalized: TISSUE, observableAtObjectiveX: [40], evidence: 'unavailable' },
  ...extra,
];
const chromo = (id: string, name: string, owner?: Parameters<typeof cellManifest>[1]): ObservationAssetManifest =>
  cellManifest({ assetId: id, name, extentMm: [6, 6], annotations: fruit([{ structureId: 'chromoplasts', polygonNormalized: TISSUE, observableAtObjectiveX: [10, 40] }]) }, owner);
const buccal = (id: string, name: string, nucleus: EvidenceStatus, cytoplasm: EvidenceStatus, lowMag: boolean): ObservationAssetManifest =>
  cellManifest({
    assetId: id, name, extentMm: [6, 6],
    annotations: [
      { structureId: 'epithelialCells', polygonNormalized: SMEAR, observableAtObjectiveX: lowMag ? [4, 10, 40] : [10, 40] },
      { structureId: 'cellBorder', polygonNormalized: SMEAR, observableAtObjectiveX: [10, 40] },
      { structureId: 'cytoplasm', polygonNormalized: SMEAR, observableAtObjectiveX: [10, 40], evidence: cytoplasm },
      { structureId: 'nucleus', polygonNormalized: SMEAR, observableAtObjectiveX: [10, 40], evidence: nucleus },
      { structureId: 'cellMembrane', polygonNormalized: SMEAR, observableAtObjectiveX: [40], evidence: 'inferred' },
    ],
  });
const starch = (id: string, name: string, stained: boolean, owner?: Parameters<typeof cellManifest>[1]): ObservationAssetManifest =>
  cellManifest({
    assetId: id, name, extentMm: [6, 6],
    annotations: [
      { structureId: 'fruitCells', polygonNormalized: TISSUE, observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'cellWall', polygonNormalized: TISSUE, observableAtObjectiveX: [10, 40] },
      // Sin Lugol los gránulos existen pero la foto no los distingue con contraste suficiente (§3.3).
      { structureId: 'starchGrains', polygonNormalized: TISSUE, observableAtObjectiveX: stained ? [10, 40] : [40], evidence: stained ? 'visible' : 'inferred' },
      { structureId: 'amyloplasts', polygonNormalized: TISSUE, observableAtObjectiveX: [40], evidence: 'inferred' },
    ],
  }, owner);
const pear = (id: string, name: string, sclereidsAt: number[], status: EvidenceStatus = 'visible'): ObservationAssetManifest =>
  cellManifest({ assetId: id, name, extentMm: [6, 6], annotations: fruit([{ structureId: 'sclereids', polygonNormalized: blob(0.18, 0.7, 12), observableAtObjectiveX: sclereidsAt, evidence: status }]) });

const TEACHER_V2 = { role: 'teacher' as const, id: 'u_teacher_demo', version: 2, attribution: 'Activo docente de prueba asignado al curso (S17); ilustración didáctica, no microfotografía.' };

/** Manifiestos de B02 (fruto, raspado, frotis), versionados; los de docente (`*T2`) tienen prioridad cuando se asignan. */
export const CELL_ASSETS: Record<string, ObservationAssetManifest> = {
  elodeaDense: cellManifest({ assetId: 'elodeaDense', name: 'Hoja de Elodea con cloroplastos abundantes (montaje fresco)', extentMm: [8, 8], annotations: ASSETS.elodea.annotations }),
  potatoPlain: starch('potatoPlain', 'Raspado de papa sin teñir', false),
  potatoLugol: starch('potatoLugol', 'Raspado de papa con Lugol', true),
  potatoLugolT2: starch('potatoLugolT2', 'Raspado de papa con Lugol (activo docente v2)', true, TEACHER_V2),
  tomato: chromo('tomato', 'Pulpa de tomate, corte fino'),
  tomatoT2: chromo('tomatoT2', 'Pulpa de tomate, corte fino (activo docente v2)', TEACHER_V2),
  pepper: chromo('pepper', 'Chile dulce amarillo, corte fino'),
  pepperRed: chromo('pepperRed', 'Chile dulce rojo, corte fino'),
  carrot: chromo('carrot', 'Raíz de zanahoria, corte fino'),
  pear: pear('pear', 'Pulpa de pera, corte fino', [10, 40]),
  pearClear: pear('pearClear', 'Pulpa de pera con esclereidas abundantes', [4, 10, 40]),
  pearEosin: pear('pearEosin', 'Pulpa de pera con eosina 1 % (contraste)', [10, 40]),
  guava: pear('guava', 'Pulpa de guayaba (sin regiones validadas)', [10, 40], 'unavailable'),
  buccalPlain: buccal('buccalPlain', 'Frotis bucal sin teñir', 'unavailable', 'inferred', false),
  buccalMB: buccal('buccalMB', 'Frotis bucal con azul de metileno', 'visible', 'visible', true),
  buccalEosin: buccal('buccalEosin', 'Frotis bucal con eosina 1 %', 'inferred', 'visible', true),
};

const DIDACTIC_B03 = 'Ilustración didáctica generada por Quiklabs (no es una microfotografía). Basada en la guía «Práctica 3. Permeabilidad celular»; solo vale como condición estática, no como serie temporal.';
const B03_OWNER = { role: 'admin' as const, id: 'u_admin', version: 1, attribution: DIDACTIC_B03 };

/**
 * Manifiestos de B03: la hoja de Elodea con el protoplasto retraído (plasmólisis incipiente y marcada). Son fotos de
 * CONDICIÓN distintas (otra célula, otro montaje), nunca fotogramas de la misma célula (§4.2).
 */
export const PERM_ASSETS: Record<string, ObservationAssetManifest> = {
  elodeaPlasmoMild: cellManifest({
    assetId: 'elodeaPlasmoMild', name: 'Hoja de Elodea con plasmólisis incipiente (montaje fresco)', extentMm: [8, 8],
    annotations: [
      ...ASSETS.elodea.annotations,
      { structureId: 'protoplast', polygonNormalized: LEAF, observableAtObjectiveX: [40] },
      { structureId: 'periplasmicSpace', polygonNormalized: LEAF, observableAtObjectiveX: [40], evidence: 'inferred' },
    ],
  }, B03_OWNER),
  elodeaPlasmo: cellManifest({
    assetId: 'elodeaPlasmo', name: 'Hoja de Elodea plasmolizada (montaje fresco)', extentMm: [8, 8],
    annotations: [
      ...ASSETS.elodea.annotations,
      { structureId: 'protoplast', polygonNormalized: LEAF, observableAtObjectiveX: [10, 40] },
      { structureId: 'periplasmicSpace', polygonNormalized: LEAF, observableAtObjectiveX: [10, 40] },
    ],
  }, B03_OWNER),
};

const DIDACTIC_B04 = 'Ilustración didáctica generada por Quiklabs (no es una microfotografía). Basada en la guía «Práctica 4. Moléculas biológicas»: la reacción de Feulgen tiñe el ADN, no cualquier ácido nucleico.';
const B04_OWNER = { role: 'admin' as const, id: 'u_admin', version: 1, attribution: DIDACTIC_B04 };
const feulgenSmear = (id: string, name: string, dna: EvidenceStatus, cellsAt: number[] = [4, 10, 40]): ObservationAssetManifest =>
  cellManifest({
    assetId: id, name, extentMm: [6, 6],
    annotations: [
      { structureId: 'epithelialCells', polygonNormalized: SMEAR, observableAtObjectiveX: cellsAt },
      { structureId: 'cellBorder', polygonNormalized: SMEAR, observableAtObjectiveX: [10, 40] },
      { structureId: 'nucleus', polygonNormalized: SMEAR, observableAtObjectiveX: [10, 40], evidence: dna === 'visible' ? 'visible' : 'inferred' },
      { structureId: 'dnaStain', polygonNormalized: SMEAR, observableAtObjectiveX: [10, 40], evidence: dna },
    ],
  }, B04_OWNER);

/**
 * Manifiestos de B04: frotis bucal y epidermis de cebolla con Feulgen, control sin hidrólisis y las condiciones de un
 * tratamiento mal hecho (subhidrólisis, sobrehidrólisis, sin teñir). El ADN solo se acredita donde la región es visible.
 */
export const FEULGEN_ASSETS: Record<string, ObservationAssetManifest> = {
  feulgenBuccal: feulgenSmear('feulgenBuccal', 'Frotis bucal con reacción de Feulgen', 'visible'),
  feulgenWeak: feulgenSmear('feulgenWeak', 'Frotis bucal con Feulgen débil (subhidrólisis)', 'inferred'),
  feulgenDamaged: feulgenSmear('feulgenDamaged', 'Frotis bucal con Feulgen degradado (sobrehidrólisis)', 'unavailable', [10, 40]),
  feulgenRaw: feulgenSmear('feulgenRaw', 'Frotis bucal fijable sin teñir', 'unavailable', [10, 40]),
  feulgenNeg: feulgenSmear('feulgenNeg', 'Frotis bucal: control de Feulgen sin hidrólisis', 'unavailable'),
  feulgenOnion: cellManifest({
    assetId: 'feulgenOnion', name: 'Epidermis de cebolla con reacción de Feulgen', extentMm: [10, 10],
    annotations: [
      { structureId: 'epidermalCells', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [4, 10, 40] },
      { structureId: 'cellWall', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [10, 40] },
      { structureId: 'nucleus', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [10, 40] },
      { structureId: 'dnaStain', polygonNormalized: rect(0.12, 0.2, 0.88, 0.8), observableAtObjectiveX: [10, 40] },
    ],
  }, B04_OWNER),
};

/** Activo base que se dibuja para una versión docente (`tomatoT2` → `tomato`). */
export const baseAssetId = (id: string) => id.replace(/T2$/, '');

const DIDACTIC_B06 = 'Ilustración didáctica generada por Quiklabs (no es una microfotografía). Basada en la guía «Práctica 6. Estructura de la célula»; las regiones anotadas fijan qué puede rotularse, nunca se agregan estructuras.';

/** Manifiesto de B06: fresco o lámina permanente, con vistas hasta 100X (las regiones dicen a qué objetivo se distinguen). */
function divManifest(
  m: Omit<ObservationAssetManifest, 'contentHash' | 'ownerRole' | 'ownerId' | 'captureQuality' | 'fallbackPolicy' | 'sourceAttribution' | 'version' | 'views'>,
  owner: { role: 'admin' | 'teacher'; id: string; version: number; attribution?: string } = { role: 'admin', id: 'u_admin', version: 1 },
): ObservationAssetManifest {
  const views: ObservationView[] = [4, 10, 40, 100].map((o) => ({ viewId: `x${o}`, objectiveX: o as 4 | 10 | 40 | 100, channel: 'mono', illumination: 'transmitted', focalPlanes: 1 }));
  const base = {
    ...m, views, version: owner.version, ownerRole: owner.role, ownerId: owner.id, captureQuality: 'illustrative' as const,
    fallbackPolicy: 'admin-version' as const, sourceAttribution: owner.attribution ?? DIDACTIC_B06,
  };
  return { ...base, contentHash: stableHash(base) };
}

/** Elipse normalizada (organismos). */
const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 16) =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });

/** Posiciones (normalizadas) de las regiones de B06; la ilustración del ocular dibuja exactamente estas. */
export const DIV_LAYOUT = {
  /** Tradescantia: poros estomáticos (centro) y sus células oclusivas (anillo). */
  stomata: [[0.5, 0.52], [0.34, 0.36], [0.66, 0.42], [0.42, 0.7]] as [number, number][],
  /** Euglena y Paramecium: centro, semiejes y giro de cada organismo. */
  euglena: [[0.5, 0.5, 0.05, 0.016, 0.5], [0.3, 0.36, 0.05, 0.016, -0.7], [0.64, 0.7, 0.05, 0.016, 2.2]] as [number, number, number, number, number][],
  paramecium: [[0.5, 0.5, 0.075, 0.03, 0.3], [0.7, 0.72, 0.075, 0.03, -1.1]] as [number, number, number, number, number][],
  /** Burbuja de aire típica del medio de cultivo, fuera de los organismos. */
  cultureBubble: [0.62, 0.32, 0.035] as [number, number, number],
  /** Sangre: eritrocitos, leucocitos y plaquetas (círculos separados). */
  rbc: [[0.3, 0.32], [0.42, 0.3], [0.56, 0.34], [0.68, 0.4], [0.34, 0.58], [0.5, 0.6], [0.64, 0.66], [0.42, 0.74]] as [number, number][],
  wbc: [[0.46, 0.46], [0.66, 0.54]] as [number, number][],
  plt: [[0.38, 0.45], [0.56, 0.48], [0.54, 0.76]] as [number, number][],
} as const;

const RBC_R = 0.035;
const WBC_R = 0.05;
const PLT_R = 0.012;

const tradescantia = (id: string, name: string, stomata: EvidenceStatus): ObservationAssetManifest =>
  divManifest({
    assetId: id, name, sampleKind: 'fresh', extentMm: [4, 4],
    annotations: [
      { structureId: 'epidermalCells', polygonNormalized: TISSUE, observableAtObjectiveX: [4, 10, 40, 100] },
      { structureId: 'cellWall', polygonNormalized: TISSUE, observableAtObjectiveX: [10, 40, 100] },
      { structureId: 'nucleus', polygonNormalized: TISSUE, observableAtObjectiveX: [40, 100], evidence: 'inferred' },
      ...DIV_LAYOUT.stomata.map(([x, y]) => ({ structureId: 'stoma' as const, polygonNormalized: circle(x, y, 0.02, 12), observableAtObjectiveX: [10, 40, 100], evidence: stomata })),
      ...DIV_LAYOUT.stomata.map(([x, y]) => ({ structureId: 'guardCells' as const, polygonNormalized: band(circle(x, y, 0.05, 14), 0.4), observableAtObjectiveX: [40, 100], evidence: stomata === 'visible' ? ('visible' as const) : ('unavailable' as const) })),
    ],
  });

const euglena = (id: string, name: string, eyespot: EvidenceStatus, chloroplasts: EvidenceStatus): ObservationAssetManifest =>
  divManifest({
    assetId: id, name, sampleKind: 'fresh', extentMm: [1.6, 1.6],
    annotations: DIV_LAYOUT.euglena.flatMap(([x, y, rx, ry, r]) => [
      { structureId: 'euglenaCell' as const, polygonNormalized: ellipse(x, y, rx, ry, r), observableAtObjectiveX: [10, 40, 100] },
      { structureId: 'pellicle' as const, polygonNormalized: band(ellipse(x, y, rx, ry, r), 0.8), observableAtObjectiveX: [40, 100] },
      { structureId: 'chloroplasts' as const, polygonNormalized: ellipse(x, y, rx * 0.7, ry * 0.7, r), observableAtObjectiveX: [40, 100], evidence: chloroplasts },
      { structureId: 'eyespot' as const, polygonNormalized: circle(x + Math.cos(r) * rx * 0.7, y + Math.sin(r) * rx * 0.7, 0.006, 8), observableAtObjectiveX: [40, 100], evidence: eyespot },
      // El flagelo no se verificó en ninguna fuente de la biblioteca (§3.1): existe, pero no puede rotularse.
      { structureId: 'flagellum' as const, polygonNormalized: circle(x + Math.cos(r) * rx * 1.3, y + Math.sin(r) * rx * 1.3, 0.012, 8), observableAtObjectiveX: [40, 100], evidence: 'inferred' as const },
      { structureId: 'nucleus' as const, polygonNormalized: circle(x, y, 0.01, 8), observableAtObjectiveX: [40, 100], evidence: 'inferred' as const },
    ]),
  });

const paramecium = (id: string, name: string, fine: boolean, macro: EvidenceStatus, cilia: EvidenceStatus): ObservationAssetManifest =>
  divManifest({
    assetId: id, name, sampleKind: 'fresh', extentMm: [2.4, 2.4],
    annotations: DIV_LAYOUT.paramecium.flatMap(([x, y, rx, ry, r]) => [
      { structureId: 'parameciumCell' as const, polygonNormalized: ellipse(x, y, rx, ry, r), observableAtObjectiveX: [4, 10, 40, 100] },
      { structureId: 'foodVacuole' as const, polygonNormalized: ellipse(x, y, rx * 0.5, ry * 0.5, r), observableAtObjectiveX: [40, 100] },
      { structureId: 'oralGroove' as const, polygonNormalized: circle(x, y + ry * 0.5, 0.012, 8), observableAtObjectiveX: [40, 100], evidence: fine ? ('visible' as const) : ('inferred' as const) },
      { structureId: 'contractileVacuole' as const, polygonNormalized: circle(x + Math.cos(r) * rx * 0.6, y + Math.sin(r) * rx * 0.6, 0.012, 8), observableAtObjectiveX: [40, 100], evidence: fine ? ('visible' as const) : ('inferred' as const) },
      { structureId: 'macronucleus' as const, polygonNormalized: ellipse(x, y, rx * 0.25, ry * 0.4, r), observableAtObjectiveX: [40, 100], evidence: macro },
      { structureId: 'cilia' as const, polygonNormalized: band(ellipse(x, y, rx * 1.12, ry * 1.25, r), 0.86), observableAtObjectiveX: [40, 100], evidence: cilia },
    ]),
  });

const bloodSmear = (id: string, name: string, platelets: EvidenceStatus, leukocytes: EvidenceStatus, differential: boolean, owner?: Parameters<typeof divManifest>[1]): ObservationAssetManifest =>
  divManifest({
    assetId: id, name, sampleKind: 'fixed', extentMm: [0.6, 0.6],
    annotations: [
      ...DIV_LAYOUT.rbc.map(([x, y]) => ({ structureId: 'erythrocyte' as const, polygonNormalized: circle(x, y, RBC_R, 12), observableAtObjectiveX: [10, 40, 100] })),
      ...DIV_LAYOUT.wbc.map(([x, y]) => ({ structureId: 'leukocyte' as const, polygonNormalized: circle(x, y, WBC_R, 12), observableAtObjectiveX: [10, 40, 100], evidence: leukocytes })),
      ...DIV_LAYOUT.wbc.map(([x, y]) => ({ structureId: 'nucleus' as const, polygonNormalized: circle(x, y, WBC_R * 0.6, 10), observableAtObjectiveX: [40, 100], evidence: leukocytes })),
      ...DIV_LAYOUT.plt.map(([x, y]) => ({ structureId: 'platelet' as const, polygonNormalized: circle(x, y, PLT_R, 8), observableAtObjectiveX: [40, 100], evidence: platelets })),
      ...(differential ? [
        { structureId: 'neutrophil' as const, polygonNormalized: circle(DIV_LAYOUT.wbc[0][0], DIV_LAYOUT.wbc[0][1], WBC_R, 12), observableAtObjectiveX: [40, 100] },
        { structureId: 'lymphocyte' as const, polygonNormalized: circle(DIV_LAYOUT.wbc[1][0], DIV_LAYOUT.wbc[1][1], WBC_R, 12), observableAtObjectiveX: [40, 100] },
      ] : []),
    ],
  }, owner);

const BACT = blob(0.36, 0.9, 20);
const TEACHER_B06 = { role: 'teacher' as const, id: 'u_teacher_demo', version: 2, attribution: 'Activo docente asignado al grupo (SC-TEACHER-OVERRIDE); ilustración didáctica, no microfotografía.' };

/**
 * Manifiestos de B06. Las bacterias nunca anotan nucléolo (no lo tienen) ni nucleoide; el flagelo de Euglena y los
 * cilios de Paramecium solo son rotulables en las fuentes que los validan. Las regiones con 100X solo se distinguen a 100X.
 */
export const DIV_ASSETS: Record<string, ObservationAssetManifest> = {
  tradescantia: tradescantia('tradescantia', 'Epidermis inferior de Tradescantia con estomas', 'visible'),
  tradescantiaBlur: tradescantia('tradescantiaBlur', 'Epidermis de Tradescantia con estomas poco discernibles', 'inferred'),
  euglena: euglena('euglena', 'Euglena viva en gota de cultivo', 'inferred', 'visible'),
  euglenaVisible: euglena('euglenaVisible', 'Euglena viva con estigma identificable', 'visible', 'visible'),
  euglenaLugol: euglena('euglenaLugol', 'Euglena tras Lugol (inmovilizada; el Lugol no prueba glucógeno)', 'inferred', 'inferred'),
  paramecium: paramecium('paramecium', 'Paramecium vivo en gota de cultivo', false, 'inferred', 'unavailable'),
  parameciumFine: paramecium('parameciumFine', 'Paramecium vivo, recurso de alta calidad', true, 'inferred', 'visible'),
  parameciumNigrosin: paramecium('parameciumNigrosin', 'Paramecium con nigrosina (contraste negativo; no fija)', false, 'inferred', 'inferred'),
  parameciumLugol: paramecium('parameciumLugol', 'Paramecium tras Lugol (inmovilizado)', false, 'visible', 'inferred'),
  parameciumT2: paramecium('parameciumT2', 'Paramecium vivo (activo docente v2)', true, 'inferred', 'visible'),
  bacillus: divManifest({
    assetId: 'bacillus', name: 'Bacillus cereus, preparado permanente teñido', sampleKind: 'fixed', extentMm: [0.8, 0.8],
    annotations: [
      { structureId: 'bacilli', polygonNormalized: BACT, observableAtObjectiveX: [40, 100] },
      { structureId: 'cellChain', polygonNormalized: BACT, observableAtObjectiveX: [100] },
    ],
  }),
  cyano: divManifest({
    assetId: 'cyano', name: 'Cianobacterias filamentosas, preparado permanente', sampleKind: 'fixed', extentMm: [1.2, 1.2],
    annotations: [
      { structureId: 'cyanoFilament', polygonNormalized: BACT, observableAtObjectiveX: [10, 40, 100] },
      { structureId: 'heterocyst', polygonNormalized: BACT, observableAtObjectiveX: [40, 100] },
    ],
  }),
  blood: bloodSmear('blood', 'Frotis sanguíneo teñido (preparado docente)', 'visible', 'visible', false),
  bloodT2: bloodSmear('bloodT2', 'Frotis sanguíneo teñido (activo docente v2)', 'visible', 'visible', false, TEACHER_B06),
  bloodLowContrast: bloodSmear('bloodLowContrast', 'Frotis sanguíneo con tinción débil', 'inferred', 'visible', false),
  bloodDifferential: bloodSmear('bloodDifferential', 'Frotis sanguíneo con leucocitos identificados por experto', 'visible', 'visible', true),
  bloodRaw: bloodSmear('bloodRaw', 'Frotis sanguíneo fijado sin teñir', 'unavailable', 'inferred', false),
  bloodWrightWeak: bloodSmear('bloodWrightWeak', 'Frotis con Wright sin tampón (contraste insuficiente)', 'inferred', 'inferred', false),
};


const DIDACTIC_B07 = 'Ilustración didáctica generada por Quiklabs (no es una microfotografía ni un resultado de laboratorio). Basada en la guía «Práctica 7. Medios de cultivo e identificación de bacterias».';
const WHOLE = rect(0, 0, 1, 1);

/** Aspecto de cada variante de frotis: forma visible, color y calidad. Lo dibuja `illustrationsMicro`. */
export const GRAM_LOOK: Record<string, { cocci: string | null; rods: string | null; field: string; dense?: boolean; faint?: boolean; sparse?: boolean; stained: boolean; legend: string }> = {
  smearBlank: { cocci: null, rods: null, field: '#f7f5ef', stained: false, legend: 'none' },
  gramUnstained: { cocci: null, rods: null, field: '#f2efe6', stained: false, legend: 'none' },
  gramPosV: { cocci: '#4b2a86', rods: null, field: '#efe9f4', stained: true, legend: 'violet' },
  gramPosP: { cocci: '#d0507f', rods: null, field: '#f8ebf0', stained: true, legend: 'pink' },
  gramNegP: { cocci: null, rods: '#d0507f', field: '#f8ebf0', stained: true, legend: 'pink' },
  gramNegV: { cocci: null, rods: '#4b2a86', field: '#efe9f4', stained: true, legend: 'violet' },
  gramMixed: { cocci: '#4b2a86', rods: '#d0507f', field: '#f4ebf2', stained: true, legend: 'mixed' },
  gramIncompatible: { cocci: '#8a4a9a', rods: '#b05a90', field: '#f3ecf2', faint: true, stained: true, legend: 'ambiguous' },
  gramThick: { cocci: null, rods: null, field: '#3d2a5e', dense: true, stained: true, legend: 'ambiguous' },
  gramSparse: { cocci: null, rods: null, field: '#f6f1f4', sparse: true, stained: true, legend: 'ambiguous' },
  gramNoPrimary: { cocci: '#e2a0ba', rods: '#e2a0ba', field: '#fbf2f5', faint: true, stained: true, legend: 'pink' },
  gramNoMordant: { cocci: '#9f8cc4', rods: '#9f8cc4', field: '#f3f0f7', faint: true, stained: true, legend: 'ambiguous' },
  gramNoCounter: { cocci: '#4b2a86', rods: '#d9d5cc', field: '#f4f2ec', faint: true, stained: true, legend: 'ambiguous' },
  gramPrimaryOnly: { cocci: '#4b2a86', rods: '#4b2a86', field: '#ece6f3', stained: true, legend: 'violet' },
  gramInvalid: { cocci: null, rods: null, field: '#c9b6d6', faint: true, stained: true, legend: 'ambiguous' },
  gramDirty: { cocci: '#6a4a8e', rods: '#a85a8e', field: '#d9c4d6', faint: true, stained: true, legend: 'ambiguous' },
};

const gramManifest = (assetId: string, base: string, name: string, owner?: Parameters<typeof divManifest>[1]) => {
  const look = GRAM_LOOK[base];
  // Solo se puede rotular lo que la variante deja distinguir: sin células definidas no hay forma que evaluar.
  const annotations: Annotation[] = look.stained ? [{ structureId: 'stainedField', polygonNormalized: WHOLE, observableAtObjectiveX: [4, 10, 40, 100] }] : [];
  if (look.cocci && !look.faint) annotations.push({ structureId: 'cocci', polygonNormalized: WHOLE, observableAtObjectiveX: [40, 100] });
  if (look.rods && !look.faint) annotations.push({ structureId: 'rods', polygonNormalized: WHOLE, observableAtObjectiveX: [40, 100] });
  if (look.cocci && look.faint) annotations.push({ structureId: 'cocci', polygonNormalized: WHOLE, observableAtObjectiveX: [40, 100], evidence: 'inferred' });
  if (look.rods && look.faint) annotations.push({ structureId: 'rods', polygonNormalized: WHOLE, observableAtObjectiveX: [40, 100], evidence: 'inferred' });
  return divManifest({ assetId, name, sampleKind: 'fixed', extentMm: [0.8, 0.8], annotations }, owner ?? { role: 'admin', id: 'u_admin', version: 1, attribution: DIDACTIC_B07 });
};

export const MICRO_ASSETS: Record<string, ObservationAssetManifest> = {
  smearBlank: gramManifest('smearBlank', 'smearBlank', 'Portaobjetos sin frotis'),
  gramUnstained: gramManifest('gramUnstained', 'gramUnstained', 'Frotis virtual sin teñir'),
  gramPosV: gramManifest('gramPosV', 'gramPosV', 'Cocos violeta (control positivo ilustrativo)'),
  gramPosP: gramManifest('gramPosP', 'gramPosP', 'Cocos rosados por decoloración excesiva'),
  gramNegP: gramManifest('gramNegP', 'gramNegP', 'Bacilos rosados (control negativo ilustrativo)'),
  gramNegV: gramManifest('gramNegV', 'gramNegV', 'Bacilos violeta por decoloración insuficiente'),
  gramMixed: gramManifest('gramMixed', 'gramMixed', 'Frotis mixto: dos formas y dos colores'),
  gramIncompatible: gramManifest('gramIncompatible', 'gramIncompatible', 'Muestra incógnita con datos incompatibles'),
  gramThick: gramManifest('gramThick', 'gramThick', 'Frotis demasiado espeso'),
  gramSparse: gramManifest('gramSparse', 'gramSparse', 'Frotis con cobertura insuficiente'),
  gramNoPrimary: gramManifest('gramNoPrimary', 'gramNoPrimary', 'Tinción sin colorante primario'),
  gramNoMordant: gramManifest('gramNoMordant', 'gramNoMordant', 'Tinción sin mordiente'),
  gramNoCounter: gramManifest('gramNoCounter', 'gramNoCounter', 'Tinción sin colorante de contraste'),
  gramPrimaryOnly: gramManifest('gramPrimaryOnly', 'gramPrimaryOnly', 'Frotis con primario sin decolorar'),
  gramInvalid: gramManifest('gramInvalid', 'gramInvalid', 'Tinción con fases invertidas'),
  gramDirty: gramManifest('gramDirty', 'gramDirty', 'Tinción sin lavados: interferencia de color'),
  gramPosVT2: gramManifest('gramPosVT2', 'gramPosV', 'Control positivo (activo docente v2)', { role: 'teacher', id: 'u_doc01', version: 2, attribution: 'Variante autorizada por el docente del curso (recurso ilustrativo).' }),
  gramNegPT2: gramManifest('gramNegPT2', 'gramNegP', 'Control negativo (activo docente v2)', { role: 'teacher', id: 'u_doc01', version: 2, attribution: 'Variante autorizada por el docente del curso (recurso ilustrativo).' }),
};

// ─────────────── B09: arquitectura vegetal ───────────────

const DIDACTIC_B09 = 'Ilustración didáctica generada por Quiklabs (no es una microfotografía). Las regiones anotadas fijan qué puede rotularse; el docente puede publicar fotos reales con las mismas estructuras.';
const ST = (structureId: StructureId, polygonNormalized: number[][], observableAtObjectiveX: number[], evidence?: EvidenceStatus): Annotation => ({ structureId, polygonNormalized, observableAtObjectiveX, ...(evidence ? { evidence } : {}) });
const ALL_X = [4, 10, 40];
const MID_X = [10, 40];

/** Anillo de `n` haces a radio `r` alrededor del centro (centros normalizados), con desfase de ángulo. */
const ringOf = (n: number, r: number, a0 = 0): [number, number][] => Array.from({ length: n }, (_, i) => [0.5 + r * Math.cos(a0 + (2 * Math.PI * i) / n), 0.5 + r * Math.sin(a0 + (2 * Math.PI * i) / n)]);

/** Posiciones (normalizadas) de las regiones de B09; la ilustración del ocular dibuja exactamente estas. */
export const PLANT_LAYOUT = {
  /** Tallo eudicotiledóneo: haces en anillo. */
  ring: ringOf(8, 0.27),
  /** Tallo monocotiledóneo: haces dispersos (posiciones fijas, sin azar). */
  scattered: [[0.5, 0.5], [0.36, 0.38], [0.64, 0.36], [0.3, 0.58], [0.68, 0.6], [0.46, 0.72], [0.58, 0.24], [0.22, 0.42], [0.78, 0.46], [0.4, 0.2], [0.62, 0.78], [0.3, 0.76], [0.76, 0.7], [0.5, 0.34], [0.54, 0.62]] as [number, number][],
  /** Raíz eudicotiledónea: brazos del xilema estrellado y floema entre ellos. */
  rootArms: ringOf(4, 0.07, Math.PI / 4),
  rootPhloem: ringOf(4, 0.09),
  /** Raíz monocotiledónea: xilema y floema alternos en anillo alrededor de la médula. */
  monoXylem: ringOf(10, 0.17),
  monoPhloem: ringOf(10, 0.17, Math.PI / 10),
  /** Estomas de la cara abaxial de la hoja (bajo la epidermis inferior). */
  leafStomata: [[0.28, 0.73], [0.62, 0.73]] as [number, number][],
  /** Epidermis fresca: estomas repartidos, o solo lejos del centro (S15). */
  freshStomata: [[0.5, 0.52], [0.34, 0.36], [0.66, 0.42], [0.42, 0.7]] as [number, number][],
  farStomata: [[0.86, 0.16], [0.14, 0.86]] as [number, number][],
  /** Pera: grupos de esclereidas (células pétreas) en el parénquima. */
  sclereidGroups: [[0.34, 0.36], [0.64, 0.44], [0.46, 0.68]] as [number, number][],
} as const;

const bundles = (centers: readonly (readonly [number, number])[], r: number, xylemAt: number, phloemAt: number, sclerenchyma = false): Annotation[] =>
  centers.flatMap(([x, y]) => [
    ST('vascularBundle', circle(x, y, r, 12), ALL_X),
    // Xilema hacia el centro del órgano y floema hacia afuera (en la lámina se comprueba, no se supone).
    ST('xylem', circle(x + (0.5 - x) * xylemAt, y + (0.5 - y) * xylemAt, r * 0.45, 10), MID_X),
    ST('phloem', circle(x + (x - 0.5) * phloemAt, y + (y - 0.5) * phloemAt, r * 0.4, 10), MID_X),
    ...(sclerenchyma ? [ST('sclerenchyma', band(circle(x, y, r * 1.2, 12), 0.82), MID_X)] : []),
  ]);

function plantManifest(
  m: Omit<ObservationAssetManifest, 'contentHash' | 'ownerRole' | 'ownerId' | 'captureQuality' | 'fallbackPolicy' | 'sourceAttribution' | 'version' | 'views' | 'sampleKind'> & { sampleKind?: ObservationAssetManifest['sampleKind'] },
  owner: { role: 'admin' | 'teacher'; id: string; version: number } = { role: 'admin', id: 'u_admin', version: 1 },
): ObservationAssetManifest {
  const base = {
    ...m, sampleKind: m.sampleKind ?? ('fixed' as const), views: micViews(), version: owner.version, ownerRole: owner.role, ownerId: owner.id, captureQuality: 'illustrative' as const,
    fallbackPolicy: 'admin-version' as const, sourceAttribution: DIDACTIC_B09,
  };
  return { ...base, contentHash: stableHash(base) };
}

const ORGAN = circle(0.5, 0.5, 0.46, 32);
const skin = (k = 0.94) => ST('epidermis', band(ORGAN, k), ALL_X);

const rootTip = (id: string, elongation: EvidenceStatus) => plantManifest({
  assetId: id, name: 'Ápice de raíz de cebolla, corte longitudinal (lámina fija)', extentMm: [2.4, 2.4],
  annotations: [
    ST('elongationZone', rect(0.32, 0.06, 0.68, 0.42), ALL_X, elongation),
    ST('meristem', rect(0.3, 0.42, 0.7, 0.72), ALL_X),
    ST('rootCap', [[0.3, 0.72], [0.7, 0.72], [0.62, 0.88], [0.5, 0.95], [0.38, 0.88]], ALL_X),
    ST('nucleus', rect(0.3, 0.42, 0.7, 0.72), [40]),
  ],
});

const rootEudicot = (id: string, endodermis: EvidenceStatus, casparian: EvidenceStatus = 'unavailable') => plantManifest({
  assetId: id, name: 'Raíz primaria de eudicotiledónea, corte transversal (lámina fija)', extentMm: [2.4, 2.4],
  annotations: [
    skin(),
    ST('cortex', band(circle(0.5, 0.5, 0.42, 32), 0.45), ALL_X),
    ST('parenchyma', band(circle(0.5, 0.5, 0.42, 32), 0.45), MID_X),
    ST('stele', circle(0.5, 0.5, 0.17, 20), ALL_X),
    ST('endodermis', band(circle(0.5, 0.5, 0.19, 24), 0.88), MID_X, endodermis),
    ST('pericycle', band(circle(0.5, 0.5, 0.165, 24), 0.9), [40], 'inferred'),
    ...PLANT_LAYOUT.rootArms.map(([x, y]) => ST('xylem', circle(x, y, 0.035, 10), MID_X)),
    ...PLANT_LAYOUT.rootPhloem.map(([x, y]) => ST('phloem', circle(x, y, 0.025, 10), MID_X)),
    ...(casparian === 'unavailable' ? [] : [ST('casparian', band(circle(0.5, 0.5, 0.19, 24), 0.88), [40], casparian)]),
  ],
});

const rootMonocot = (id: string, pith: EvidenceStatus) => plantManifest({
  assetId: id, name: 'Raíz primaria de monocotiledónea, corte transversal (lámina fija)', extentMm: [2.4, 2.4],
  annotations: [
    skin(),
    ST('cortex', band(circle(0.5, 0.5, 0.42, 32), 0.6), ALL_X),
    ST('parenchyma', band(circle(0.5, 0.5, 0.42, 32), 0.6), MID_X),
    ST('stele', circle(0.5, 0.5, 0.24, 24), ALL_X),
    ST('endodermis', band(circle(0.5, 0.5, 0.255, 28), 0.92), MID_X),
    ST('pith', circle(0.5, 0.5, 0.11, 18), ALL_X, pith),
    ...PLANT_LAYOUT.monoXylem.map(([x, y]) => ST('xylem', circle(x, y, 0.024, 8), MID_X)),
    ...PLANT_LAYOUT.monoPhloem.map(([x, y]) => ST('phloem', circle(x, y, 0.017, 8), MID_X)),
  ],
});

const stemEudicot = (id: string, cambium: EvidenceStatus) => plantManifest({
  assetId: id, name: 'Tallo herbáceo de eudicotiledónea, corte transversal (lámina fija)', extentMm: [2.4, 2.4],
  annotations: [
    skin(),
    ST('collenchyma', band(circle(0.5, 0.5, 0.43, 32), 0.92), MID_X),
    ST('cortex', band(circle(0.5, 0.5, 0.395, 32), 0.85), ALL_X),
    ST('pith', circle(0.5, 0.5, 0.16, 20), ALL_X),
    ST('parenchyma', circle(0.5, 0.5, 0.16, 20), MID_X),
    ...bundles(PLANT_LAYOUT.ring, 0.06, 0.22, 0.2),
    ST('cambium', band(circle(0.5, 0.5, 0.28, 36), 0.97), [40], cambium),
    ST('companionCell', circle(PLANT_LAYOUT.ring[0][0] + 0.02, PLANT_LAYOUT.ring[0][1], 0.012, 8), [40], 'unavailable'),
  ],
});

const stemMonocot = (id: string) => plantManifest({
  assetId: id, name: 'Tallo de monocotiledónea, corte transversal (lámina fija)', extentMm: [2.4, 2.4],
  annotations: [
    skin(),
    ST('parenchyma', circle(0.5, 0.5, 0.42, 32), MID_X),
    ...bundles(PLANT_LAYOUT.scattered, 0.042, 0.18, 0.16, true),
  ],
});

const wood = (id: string, name: string) => plantManifest({
  assetId: id, name, extentMm: [4, 4],
  annotations: [
    ST('bark', band(ORGAN, 0.9), ALL_X),
    ST('cambium', band(circle(0.5, 0.5, 0.415, 36), 0.97), [40], 'inferred'),
    ST('phloem', band(circle(0.5, 0.5, 0.41, 36), 0.97), MID_X),
    ST('xylem', circle(0.5, 0.5, 0.38, 32), ALL_X),
    ...[0.12, 0.2, 0.28, 0.36].map((r) => ST('growthRing', band(circle(0.5, 0.5, r, 32), 0.96), ALL_X)),
    ST('pith', circle(0.5, 0.5, 0.05, 14), ALL_X),
  ],
});

const leafEudicot = (id: string, cuticle: EvidenceStatus) => plantManifest({
  assetId: id, name: 'Hoja dorsiventral de eudicotiledónea, corte transversal (lámina fija)', extentMm: [1.6, 1.6],
  annotations: [
    ST('epidermis', rect(0.04, 0.24, 0.96, 0.28), ALL_X),
    ST('cuticle', rect(0.04, 0.228, 0.96, 0.24), [40], cuticle),
    ST('palisade', rect(0.04, 0.28, 0.96, 0.48), ALL_X),
    ST('spongy', rect(0.04, 0.48, 0.96, 0.72), ALL_X),
    ST('epidermis', rect(0.04, 0.72, 0.96, 0.76), ALL_X),
    ST('vascularBundle', circle(0.46, 0.5, 0.075, 14), ALL_X),
    // Orientación del haz en la hoja: xilema hacia la cara adaxial (arriba), floema hacia la abaxial; se confirma con el metadato del corte.
    ST('xylem', circle(0.46, 0.47, 0.034, 10), MID_X),
    ST('phloem', circle(0.46, 0.535, 0.03, 10), MID_X),
    ...PLANT_LAYOUT.leafStomata.map(([x, y]) => ST('stoma', circle(x, y, 0.022, 10), MID_X)),
    ...PLANT_LAYOUT.leafStomata.map(([x, y]) => ST('guardCells', band(circle(x, y, 0.03, 10), 0.5), [40])),
  ],
});

const leafMonocot = (id: string) => plantManifest({
  assetId: id, name: 'Hoja de monocotiledónea, corte transversal (lámina fija)', extentMm: [1.6, 1.6],
  annotations: [
    ST('epidermis', rect(0.04, 0.3, 0.96, 0.34), ALL_X),
    ST('mesophyll', rect(0.04, 0.34, 0.96, 0.66), ALL_X),
    ST('epidermis', rect(0.04, 0.66, 0.96, 0.7), ALL_X),
    ...[0.2, 0.5, 0.8].flatMap((x) => [ST('vascularBundle', circle(x, 0.5, 0.075, 12), ALL_X), ST('xylem', circle(x, 0.47, 0.03, 10), MID_X), ST('phloem', circle(x, 0.535, 0.026, 10), MID_X)]),
  ],
});

/** Sección fresca de pecíolo de apio; con Wiesner las paredes lignificadas se ven rojas (también fibras, no solo xilema). */
const celery = (id: string, name: string, lignified: boolean, owner?: Parameters<typeof plantManifest>[1]) => plantManifest({
  assetId: id, name, sampleKind: 'fresh', extentMm: [3.2, 3.2],
  annotations: [
    skin(),
    ST('collenchyma', band(circle(0.5, 0.5, 0.43, 32), 0.9), MID_X),
    ST('parenchyma', circle(0.5, 0.5, 0.385, 32), MID_X),
    ...bundles(ringOf(5, 0.27, 0.3), 0.07, 0.22, 0.2),
    ...(lignified ? ringOf(5, 0.27, 0.3).flatMap(([x, y]) => [ST('lignifiedWall', circle(x + (0.5 - x) * 0.22, y + (0.5 - y) * 0.22, 0.032, 10), ALL_X), ST('sclerenchyma', band(circle(x, y, 0.078, 12), 0.82), MID_X)]) : []),
  ],
}, owner);

const pearPlant = (id: string, name: string, lignified: boolean) => plantManifest({
  assetId: id, name, sampleKind: 'fresh', extentMm: [2.4, 2.4],
  annotations: [
    ST('parenchyma', TISSUE, ALL_X),
    ...PLANT_LAYOUT.sclereidGroups.map(([x, y]) => ST('sclereids', circle(x, y, 0.07, 12), ALL_X)),
    ...(lignified ? PLANT_LAYOUT.sclereidGroups.map(([x, y]) => ST('lignifiedWall', circle(x, y, 0.07, 12), ALL_X)) : []),
  ],
});

const leafFresh = (id: string, name: string, plane: 'transverse' | 'epidermal', stomata: readonly (readonly [number, number])[]) => plantManifest({
  assetId: id, name, sampleKind: 'fresh', extentMm: [1.6, 1.6],
  annotations: plane === 'transverse'
    ? [ST('epidermis', rect(0.04, 0.28, 0.96, 0.32), ALL_X), ST('mesophyll', rect(0.04, 0.32, 0.96, 0.68), ALL_X), ST('epidermis', rect(0.04, 0.68, 0.96, 0.72), ALL_X), ST('vascularBundle', circle(0.5, 0.5, 0.09, 12), ALL_X), ST('xylem', circle(0.5, 0.47, 0.035, 10), MID_X), ST('phloem', circle(0.5, 0.54, 0.03, 10), MID_X)]
    : [
        ST('epidermalCells', rect(0.02, 0.02, 0.98, 0.98), ALL_X),
        ...stomata.map(([x, y]) => ST('stoma', circle(x, y, 0.024, 10), MID_X)),
        ...stomata.map(([x, y]) => ST('guardCells', band(circle(x, y, 0.05, 12), 0.45), [40])),
      ],
});

const leafStereo = (id: string, name: string) => ({
  ...ASSETS.leaf,
  assetId: id,
  name,
  contentHash: stableHash({ ...ASSETS.leaf, assetId: id, name }),
});

/** Manifiestos de B09. Lo que no se resuelve (Caspary, células acompañantes, cambium fino) nunca se valida salvo en el activo que lo anote visible. */
export const PLANT_ASSETS: Record<string, ObservationAssetManifest> = {
  onionRootTip: rootTip('onionRootTip', 'inferred'),
  onionRootTipClear: rootTip('onionRootTipClear', 'visible'),
  rootEudicot: rootEudicot('rootEudicot', 'inferred'),
  rootEudicotClear: rootEudicot('rootEudicotClear', 'visible', 'inferred'),
  rootMonocot: rootMonocot('rootMonocot', 'inferred'),
  rootMonocotPith: rootMonocot('rootMonocotPith', 'visible'),
  stemEudicot: stemEudicot('stemEudicot', 'inferred'),
  stemEudicotCambium: stemEudicot('stemEudicotCambium', 'visible'),
  stemMonocot: stemMonocot('stemMonocot'),
  woodRings: wood('woodRings', 'Tallo leñoso con crecimiento secundario, corte transversal (lámina fija)'),
  woodTropical: wood('woodTropical', 'Rama tropical con anillos no anuales documentados (lámina fija)'),
  leafEudicot: leafEudicot('leafEudicot', 'inferred'),
  leafEudicotFine: leafEudicot('leafEudicotFine', 'visible'),
  leafMonocot: leafMonocot('leafMonocot'),
  celery: celery('celery', 'Pecíolo de apio, sección fresca sin teñir', false),
  celeryT2: celery('celeryT2', 'Pecíolo de apio (activo docente v2)', false, { role: 'teacher', id: 'u_doc01', version: 2 }),
  celeryWiesner: celery('celeryWiesner', 'Pecíolo de apio con reacción de Wiesner', true),
  pearSection: pearPlant('pearSection', 'Pulpa de pera, sección fresca sin teñir', false),
  pearWiesner: pearPlant('pearWiesner', 'Pulpa de pera con reacción de Wiesner', true),
  leafFreshT: leafFresh('leafFreshT', 'Hoja asignada, sección transversal fresca', 'transverse', []),
  leafFreshE: leafFresh('leafFreshE', 'Hoja asignada, epidermis fresca', 'epidermal', PLANT_LAYOUT.freshStomata),
  leafFreshFar: leafFresh('leafFreshFar', 'Hoja asignada, epidermis con estomas lejos del centro', 'epidermal', PLANT_LAYOUT.farStomata),
  leafNet: leafStereo('leafNet', 'Hoja de venación reticulada (estereoscopio)'),
  leafParallel: leafStereo('leafParallel', 'Hoja de venación paralela (estereoscopio)'),
};

/** Plano real de cada activo (metadato: el estudiante lo comprueba, no lo supone). */
export const PLANT_ASSET_PLANE: Record<string, 'transverse' | 'longitudinal' | 'epidermal'> = {
  onionRootTip: 'longitudinal', onionRootTipClear: 'longitudinal', leafFreshE: 'epidermal', leafFreshFar: 'epidermal',
};

export const assetById = (id: string): ObservationAssetManifest | undefined => (id === REFLECTIVE_INSECT.assetId ? REFLECTIVE_INSECT : ASSETS[id] ?? CELL_ASSETS[id] ?? PERM_ASSETS[id] ?? FEULGEN_ASSETS[id] ?? DIV_ASSETS[id] ?? MICRO_ASSETS[id] ?? PLANT_ASSETS[id]);

/** Estado de la evidencia de una estructura en un activo (`unavailable` si el activo no la anota). */
export function structureStatus(a: ObservationAssetManifest, s: StructureId): EvidenceStatus {
  const an = a.annotations.find((x) => x.structureId === s);
  return an ? an.evidence ?? 'visible' : 'unavailable';
}

// ─────────────── Geometría de visibilidad ───────────────

function pointInPolygon(x: number, y: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** ¿Corta el campo circular (centro y radio normalizados) al polígono? */
export function circleHitsPolygon(cx: number, cy: number, r: number, poly: number[][]): boolean {
  if (pointInPolygon(cx, cy, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segDist(cx, cy, poly[j][0], poly[j][1], poly[i][0], poly[i][1]) <= r) return true;
  return false;
}

/** Estructuras visibles de un activo con un campo dado (coordenadas en mm desde el centro de la imagen). */
export function visibleStructures(a: ObservationAssetManifest, centerMm: [number, number], fovMm: number, opts: { objectiveX?: number; zoomX?: number }): StructureId[] {
  const cx = 0.5 + centerMm[0] / a.extentMm[0];
  const cy = 0.5 + centerMm[1] / a.extentMm[1];
  const r = fovMm / 2 / Math.max(a.extentMm[0], a.extentMm[1]);
  const out = new Set<StructureId>();
  for (const an of a.annotations) {
    if (an.evidence && an.evidence !== 'visible') continue;
    // Los manifiestos (con hash congelado en cada intento) anotan hasta 40X: lo que se distingue a 40X se distingue a 100X.
    // Los de B06 anotan también 100X: entonces la región exige ese objetivo.
    const x = opts.objectiveX === 100 && !an.observableAtObjectiveX?.includes(100) ? 40 : opts.objectiveX;
    if (x !== undefined && an.observableAtObjectiveX && !an.observableAtObjectiveX.includes(x)) continue;
    if (opts.zoomX !== undefined && an.observableAtZoomMin !== undefined && opts.zoomX < an.observableAtZoomMin) continue;
    if (circleHitsPolygon(cx, cy, r, an.polygonNormalized)) out.add(an.structureId);
  }
  return [...out];
}

/** ¿Queda el centro del campo sobre el espécimen (alguna región anotada)? */
export function centerOnSpecimen(a: ObservationAssetManifest, centerMm: [number, number], fovMm: number): boolean {
  return visibleStructures(a, centerMm, fovMm, {}).length > 0;
}

/** Distancia (mm) desde el centro del campo al centroide de la estructura más cercana del activo. */
export function nearestStructureMm(a: ObservationAssetManifest, centerMm: [number, number]): number {
  let best = Infinity;
  for (const an of a.annotations) {
    const p = an.polygonNormalized;
    const ux = p.reduce((s, q) => s + q[0], 0) / p.length;
    const uy = p.reduce((s, q) => s + q[1], 0) / p.length;
    const d = Math.hypot((ux - 0.5) * a.extentMm[0] - centerMm[0], (uy - 0.5) * a.extentMm[1] - centerMm[1]);
    if (d < best) best = d;
  }
  return best;
}
