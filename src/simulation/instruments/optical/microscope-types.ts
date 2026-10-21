/**
 * Microscopio compuesto de campo claro (§3.1, §6.2): parámetros y estado serializables, compartidos por todas las
 * prácticas de Biología que usan el instrumento. Las distancias van en mm (la escena las convierte a cm). Los valores
 * ópticos y mecánicos sin ficha del fabricante se marcan `pending` (no se presentan como reales).
 */
export type ObjectiveX = 4 | 10 | 40;
export const OBJECTIVES: ObjectiveX[] = [4, 10, 40];

export type CalibrationStatus = 'verified' | 'pending' | 'hypothetical';

export interface MicroscopeParams {
  ocularX: number;
  /** Número de campo del ocular (mm). HIPOTÉTICO hasta tener la ficha (§3.1). */
  fieldNumberMm: number;
  fieldNumberStatus: CalibrationStatus;
  /** Distancia de trabajo desde el cubreobjetos (mm) `pending`. */
  workingDistanceMm: Record<ObjectiveX, number>;
  /** Holgura parfocal: desplazamiento del plano focal de cada objetivo respecto del de 4X (mm) `pending`. */
  parfocalOffsetMm: Record<ObjectiveX, number>;
  /** σ de la curva visual de nitidez por objetivo (mm): parámetro de presentación, no profundidad de campo real. */
  focusSigmaMm: Record<ObjectiveX, number>;
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
  /** Máximo de vueltas de macrométrico por comando a 40X sin riesgo (E22). */
  coarseAt40MaxTurns: number;
  /** Intervalos de luminancia útil, de apertura del diafragma y mínimo del condensador por objetivo (0–1, visuales). */
  luminanceBand: Record<ObjectiveX, [number, number]>;
  diaphragmBand: Record<ObjectiveX, [number, number]>;
  condenserMin01: number;
  /** Nitidez mínima de una captura válida (0–1). */
  sharpnessValid: number;
  turretDetentDeg: number;
  /** Tolerancia de enclavamiento del revólver (°). */
  turretLockTolDeg: number;
  /** Comprobación lateral vigente (s). */
  sideCheckValidS: number;
}

export interface MicroscopeState {
  power: boolean;
  light01: number;
  diaphragm01: number;
  condenser01: number;
  /** Ángulo del revólver (°): 0 = 4X, 120 = 10X, 240 = 40X; enclavado solo en esos ángulos. */
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
}

/** Componentes manipulables (identificación de partes, Cuadro 1). */
export const MICROSCOPE_PARTS = ['ocular', 'objectives', 'turret', 'stage', 'clip', 'stageKnobs', 'coarse', 'fine', 'condenser', 'diaphragm', 'light', 'arm', 'base'] as const;
export type MicroscopePart = (typeof MICROSCOPE_PARTS)[number];
