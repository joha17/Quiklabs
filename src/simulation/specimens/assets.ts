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
  | 'vacuole' | 'cellMembrane';

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

/** Activo base que se dibuja para una versión docente (`tomatoT2` → `tomato`). */
export const baseAssetId = (id: string) => id.replace(/T2$/, '');

export const assetById = (id: string): ObservationAssetManifest | undefined => (id === REFLECTIVE_INSECT.assetId ? REFLECTIVE_INSECT : ASSETS[id] ?? CELL_ASSETS[id]);

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
    const x = opts.objectiveX === 100 ? 40 : opts.objectiveX;
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
