/**
 * Microscopio compuesto de campo claro (§3.1, §6.2): parámetros y estado serializables, compartidos por todas las
 * prácticas de Biología que usan el instrumento. Las distancias van en mm (la escena las convierte a cm). Los valores
 * ópticos y mecánicos sin ficha del fabricante se marcan `pending` (no se presentan como reales).
 */
export type ObjectiveX = 4 | 10 | 40 | 100;
/** Revólver de cuatro posiciones: 4X, 10X, 40X y 100X (cuerpo negro). */
export const OBJECTIVES: ObjectiveX[] = [4, 10, 40, 100];
/** Revólver de tres posiciones de los intentos anteriores al de cuatro (sus cintas se repiten con él). */
export const LEGACY_OBJECTIVES: ObjectiveX[] = [4, 10, 40];

/** Valor por objetivo. El 100X es opcional: los parámetros del revólver de tres posiciones no lo tienen. */
export type PerObjective<T> = { 4: T; 10: T; 40: T; 100?: T };

export type CalibrationStatus = 'verified' | 'pending' | 'hypothetical';

export interface MicroscopeParams {
  ocularX: number;
  /** Número de campo del ocular (mm). HIPOTÉTICO hasta tener la ficha (§3.1). */
  fieldNumberMm: number;
  fieldNumberStatus: CalibrationStatus;
  /** Distancia de trabajo desde el cubreobjetos (mm) `pending`. */
  workingDistanceMm: PerObjective<number>;
  /** Holgura parfocal: desplazamiento del plano focal de cada objetivo respecto del de 4X (mm) `pending`. */
  parfocalOffsetMm: PerObjective<number>;
  /** σ de la curva visual de nitidez por objetivo (mm): parámetro de presentación, no profundidad de campo real. */
  focusSigmaMm: PerObjective<number>;
  coarsePitchMmPerTurn: number;
  finePitchMmPerTurn: number;
  /** Recorrido de la platina en Z (mm) y del micrométrico respecto del macrométrico (± mm). */
  stageZRangeMm: [number, number];
  fineRangeMm: number;
  /** Altura de la platina en la posición inicial segura (mm). */
  stageZ0Mm: number;
  /** Altura sobre el cero de la platina del plano focal del objetivo de 4X (mm). */
  focalPlaneZMm: number;
  /** Recorrido de la platina mecánica en X/Y (± mm). */
  stageXYRangeMm: [number, number];
  /** Separación objetivo–cubreobjetos que activa la advertencia y la mínima para retirar la lámina (mm). */
  gapWarnMm: number;
  gapSafeRemoveMm: number;
  /** Máximo de vueltas de macrométrico por gesto a 40X o 100X sin riesgo (E22). */
  coarseAt40MaxTurns: number;
  /** Intervalos de luminancia útil, de apertura del diafragma y mínimo del condensador por objetivo (0–1, visuales). */
  luminanceBand: PerObjective<[number, number]>;
  diaphragmBand: PerObjective<[number, number]>;
  condenserMin01: number;
  /** Nitidez mínima de una captura válida (0–1). */
  sharpnessValid: number;
  turretDetentDeg: number;
  /** Objetivos del revólver en orden de enclavamiento; ausente = revólver de tres posiciones (4X, 10X, 40X). */
  objectives?: ObjectiveX[];
  /** Tolerancia de enclavamiento del revólver (°). */
  turretLockTolDeg: number;
  /** Comprobación lateral vigente (s). */
  sideCheckValidS: number;
  /** Recorrido interpupilar del cabezal binocular (mm) y de los anillos de dioptrías (±) `pending`. */
  ipdRangeMm: [number, number];
  diopterRange: number;
}

export interface MicroscopeState {
  power: boolean;
  light01: number;
  diaphragm01: number;
  condenser01: number;
  /** Ángulo del revólver (°): un objetivo cada `turretDetentDeg` (0 = 4X); enclavado solo en esos ángulos. */
  turretDeg: number;
  stageXmm: number;
  stageYmm: number;
  coarseTurns: number;
  fineTurns: number;
  clipOpen: boolean;
  clampedSlideId: string | null;
  /** Último instante en que se miró de lado la separación objetivo–preparación (s). */
  sideCheckedAt: number | null;
  impactCount: number;
  /** Lente sucia/dañada por limpieza abrasiva (0–1). */
  lensDamage01: number;
  /** Cabezal binocular: distancia interpupilar (mm) y dioptrías de cada ocular. No cambian el foco de la muestra. */
  ipdMm: number;
  leftDiopter: number;
  rightDiopter: number;
}

/** Componentes manipulables (identificación de partes, Cuadro 1). */
export const MICROSCOPE_PARTS = ['ocular', 'objectives', 'turret', 'stage', 'clip', 'stageKnobs', 'coarse', 'fine', 'condenser', 'diaphragm', 'light', 'arm', 'base'] as const;
export type MicroscopePart = (typeof MICROSCOPE_PARTS)[number];
