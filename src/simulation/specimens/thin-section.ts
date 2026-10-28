/**
 * Corte, raspado y frotis (B02, §6.5): de los HECHOS del gesto (espesor y largo del corte, distancia y presión del
 * raspado, duración del hisopado, largo y presión del extendido) sale un fragmento con espesor, área, desgarro y masa
 * didáctica. Lo que esos números permiten ver se decide aquí con reglas puras: un corte grueso ocluye el detalle, un
 * fragmento diminuto no llena el campo, un frotis denso superpone células. Nunca se crean estructuras: solo se
 * ocultan las que la preparación no deja distinguir.
 */
import { clamp } from '../core/math';
import type { StructureId } from './assets';

export type CellKind = 'elodea' | 'potato' | 'tomato' | 'pepper' | 'carrot' | 'pear' | 'guava' | 'apple' | 'buccal';
/** Medios de montaje: el agua, los colorantes de B02 y las soluciones de NaCl de B03 (medio de Elodea). */
export type StainId = 'water' | 'lugol' | 'methylene-blue' | 'eosin-1pct' | 'nacl-0.9' | 'nacl-5';
export type PrepKind = 'leaf' | 'cut' | 'scrape' | 'smear';

export const CELL_KINDS: CellKind[] = ['elodea', 'potato', 'tomato', 'pepper', 'carrot', 'pear', 'guava', 'apple', 'buccal'];
export const STAINS: Exclude<StainId, 'water'>[] = ['lugol', 'methylene-blue', 'eosin-1pct'];
/** Medios salinos de B03 (solo existen en ese mundo; B02 conserva su lista). */
export const SALINES: Exclude<StainId, 'water'>[] = ['nacl-0.9', 'nacl-5'];

/** Parámetros de preparación (§7.1): valores de software `pending`, no medidas de un tejido real. */
export interface CellPrepParams {
  /** Espesor objetivo y máximo útil de un corte (mm). */
  targetThicknessMm: number;
  thickMaxMm: number;
  /** Área mínima del fragmento para llenar el campo útil (mm²). */
  minAreaMm2: number;
  /** Densidad didáctica del tejido (mg/mm³). */
  densityMgPerMm3: number;
  /** Raspado: distancia mínima (cm) y presión a partir de la cual desgarra (0–1). */
  scrapeMinCm: number;
  scrapeTearPressure: number;
  /** Hisopado: duración mínima para recoger células (s); extendido: densidad máxima interpretable (0–1). */
  swabMinS: number;
  smearDenseMax: number;
  /** Separación mínima entre zonas de frutos distintos en un mismo portaobjetos (cm). */
  zoneSepCm: number;
  maxZones: number;
  /** Cubreobjetos bajado lejos del tejido: lo arrastra (cm). */
  coverDragCm: number;
  /** Lugol: contacto mínimo (s) y volumen que satura el campo (mL). */
  lugolMinContactS: number;
  lugolOverMl: number;
  /** Variación del gotero sin calibrar (S05, fracción ±). */
  dropJitter: number;
  /** Masa de una hoja de Elodea y de la fuente virtual de epitelio (mg). */
  leafMassMg: number;
  /** Desgarro a partir del cual no se reconocen los límites celulares. */
  tearMax: number;
}

export interface CellFragment {
  kind: CellKind;
  sourceId: string;
  prep: PrepKind;
  massMg: number;
  thicknessMm: number;
  areaMm2: number;
  tear01: number;
  contamination01: number;
}

/** Zona de tejido sobre un portaobjetos (una por muestra; varias solo si están físicamente separadas). */
export interface CellZone {
  /** `m:<muestra>:<n>` (montaje del estudiante) o `ctl:<muestra>:<n>` (preparado de control del docente). */
  specimenId: string;
  kind: CellKind;
  /** Activo que corresponde a la condición actual (material + preparación + tinción); `missing:<id>` si falta. */
  asset: string;
  centerCm: [number, number];
  prep: PrepKind;
  thicknessMm: number;
  areaMm2: number;
  tear01: number;
  massMg: number;
  premade?: boolean;
}

/** Datos celulares de un montaje B02 (ausente en los montajes de B01). */
export interface CellMountInfo {
  zones: CellZone[];
  /** Reactivos que admite la receta de la muestra. */
  allowed: StainId[];
  /** Volumen de cada colorante en el montaje (mL; su suma es `reagentMl`) y tiempo de contacto (s). */
  stainMl: Partial<Record<StainId, number>>;
  contactS: Partial<Record<StainId, number>>;
  overstain01: number;
  smearDensity01: number;
  /** Recibió un reactivo que la receta no admite (CEL21/CEL28). */
  incompatible: boolean;
  /** Tejidos superpuestos o contaminación cruzada de pigmentos (CEL10/CEL11). */
  mixed: boolean;
}

export const emptyCellInfo = (): CellMountInfo => ({ zones: [], allowed: [], stainMl: {}, contactS: {}, overstain01: 0, smearDensity01: 0, incompatible: false, mixed: false });

/** Corte con bisturí: espesor y largo del gesto → fragmento (área ≈ largo² / 2). */
export function cutFragment(p: CellPrepParams, kind: CellKind, sourceId: string, thicknessMm: number, lengthCm: number): CellFragment {
  const t = clamp(thicknessMm, 0.03, 4);
  const area = round3((clamp(lengthCm, 0.05, 2) * 10) ** 2 * 0.5);
  return { kind, sourceId, prep: 'cut', thicknessMm: round3(t), areaMm2: area, tear01: 0, contamination01: 0, massMg: round3(area * t * p.densityMgPerMm3) };
}

/**
 * Raspado: la distancia arrastra material (área), la presión lo engrosa y, por encima del umbral, desgarra el tejido.
 * e = 0,06 + 0,22·presión (mm); A = (10·d)² · 0,2 · (0,4 + presión) (mm²); desgarro = 0,7 si la presión supera el umbral.
 */
export function scrapeFragment(p: CellPrepParams, kind: CellKind, sourceId: string, distanceCm: number, pressure01: number): CellFragment {
  const pr = clamp(pressure01, 0, 1);
  const d = clamp(distanceCm, 0, 4);
  const t = round3(0.06 + 0.22 * pr);
  const area = round3((d * 10) ** 2 * 0.2 * (0.4 + pr));
  return { kind, sourceId, prep: 'scrape', thicknessMm: t, areaMm2: area, tear01: pr > p.scrapeTearPressure ? 0.7 : 0, contamination01: 0, massMg: round3(area * t * p.densityMgPerMm3) };
}

/** Carga del hisopo (mg didácticos): crece con la duración y la presión, nada por debajo de medio segundo. */
export const swabLoadMg = (p: CellPrepParams, durationS: number, pressure01: number) =>
  durationS < 0.5 ? 0 : round3(clamp(durationS / (2 * p.swabMinS), 0, 1) * (0.5 + 0.5 * clamp(pressure01, 0, 1)) * 2);

/** Densidad del extendido (0–1): mucha carga en poco recorrido y apretando = células superpuestas. */
export const smearDensity = (loadMg: number, lengthCm: number, pressure01: number) =>
  round3(clamp((loadMg / 2) * (1.6 / Math.max(0.3, lengthCm)) * (0.5 + 0.6 * clamp(pressure01, 0, 1)) * 0.55, 0, 1));

/** Lo que la PREPARACIÓN deja distinguir de lo visible en el activo (nunca agrega estructuras). */
export function zoneVisible(p: CellPrepParams, visible: StructureId[], z: CellZone, info: CellMountInfo): StructureId[] {
  if (z.areaMm2 < p.minAreaMm2) return [];
  let out = visible;
  // Corte grueso: luz que atraviesa varias capas; solo el bulto del tejido.
  if (z.thicknessMm > p.thickMaxMm) out = out.filter((s) => s === 'fruitCells' || s === 'epithelialCells' || s === 'leafBlade');
  if (z.tear01 > p.tearMax) out = out.filter((s) => s !== 'cellWall' && s !== 'cellBorder' && s !== 'sclereids');
  if (info.overstain01 > 0.6) out = out.filter((s) => s !== 'starchGrains');
  if (z.prep === 'smear' && info.smearDensity01 > p.smearDenseMax) out = out.filter((s) => s !== 'cellBorder' && s !== 'nucleus' && s !== 'cytoplasm');
  return out;
}

/** Problemas de la preparación que acompañan a una captura (los `BLOCKING_CELL_ISSUES` la invalidan). */
export function cellMountIssues(p: CellPrepParams, z: CellZone | null, info: CellMountInfo): string[] {
  const out: string[] = [];
  if (!z) return out;
  if (z.thicknessMm > p.thickMaxMm) out.push('THICK');
  if (z.areaMm2 < p.minAreaMm2) out.push('TOO_SMALL');
  if (z.tear01 > p.tearMax) out.push('TORN');
  if (info.overstain01 > 0.6) out.push('OVERSTAIN');
  if (z.prep === 'smear' && info.smearDensity01 > p.smearDenseMax) out.push('DENSE');
  if (info.incompatible) out.push('INCOMPATIBLE');
  if (info.mixed) out.push('MIXED');
  if (z.asset.startsWith('missing:')) out.push('ASSET_MISSING');
  return out;
}

export const BLOCKING_CELL_ISSUES = ['THICK', 'TOO_SMALL', 'TORN', 'OVERSTAIN', 'DENSE', 'INCOMPATIBLE', 'MIXED', 'ASSET_MISSING'];

/** Muestra de un `specimenId` de zona (`m:tomato:2` → `tomato`). */
export const kindOfSpecimen = (specimenId: string | null | undefined): CellKind | null => {
  const k = specimenId?.split(':')[1]?.split('@')[0];
  return k && (CELL_KINDS as string[]).includes(k) ? (k as CellKind) : null;
};

const round3 = (v: number) => Math.round(v * 1000) / 1000;
