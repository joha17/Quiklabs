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
  | 'antenna' | 'compoundEye' | 'head' | 'thorax' | 'abdomen' | 'wing' | 'leg';

export interface ObservationView {
  viewId: string;
  objectiveX?: 4 | 10 | 40;
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

export const assetById = (id: string): ObservationAssetManifest | undefined => (id === REFLECTIVE_INSECT.assetId ? REFLECTIVE_INSECT : ASSETS[id]);

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
    if (opts.objectiveX !== undefined && an.observableAtObjectiveX && !an.observableAtObjectiveX.includes(opts.objectiveX)) continue;
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
