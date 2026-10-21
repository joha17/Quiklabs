/**
 * Estereoscopio binocular (§3.1, §5.4): parámetros y estado. Con una sola imagen por muestra la vista es `mono`
 * («2D asistido»); el relieve binocular solo se anuncia con un par izquierda/derecha calibrado.
 */
export interface StereoParams {
  ocularX: number;
  zoomRange: [number, number];
  /** Número de campo del ocular (mm), HIPOTÉTICO. */
  fieldNumberMm: number;
  /** Distancia de trabajo del cabezal (mm) y paso de la perilla de enfoque (mm/vuelta) `pending`. */
  workingDistanceMm: number;
  focusPitchMmPerTurn: number;
  focusRangeMm: number;
  headZRangeMm: [number, number];
  /** σ visual de nitidez a zoom 1 (mm); baja con el zoom. */
  focusSigmaMm: number;
  /** Distancia interpupilar del usuario simulado (mm) y tolerancias binoculares. */
  userIpdMm: number;
  ipdTolMm: number;
  diopterTol: number;
  incidentBand: [number, number];
  /** Zoom bajo de localización y zoom alto (para E53). */
  locateZoomMax: number;
  highZoom: number;
  sharpnessValid: number;
  /** Desplazamiento máximo del centro de la base para un campo útil (mm). */
  centerTolMm: number;
}

export interface StereoState {
  power: boolean;
  incident01: number;
  transmitted01: number;
  zoomX: number;
  headZmm: number;
  focusTurns: number;
  ipdMm: number;
  leftDiopter: number;
  rightDiopter: number;
  sampleId: string | null;
  channelMode: 'mono' | 'stereo-pair';
}

export const STEREO_PARTS = ['oculars', 'diopter', 'interpupillary', 'zoom', 'focus', 'head', 'incident', 'transmitted', 'base'] as const;
export type StereoPart = (typeof STEREO_PARTS)[number];
