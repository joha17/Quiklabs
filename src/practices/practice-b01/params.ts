/**
 * Parámetros de la práctica B01 (§7.1). Cada valor científico o mecánico lleva su estado de calibración: los
 * `pending` e `hypothetical` son propuestas didácticas sin ficha del fabricante; bloquean una Evaluación institucional
 * con validez óptica, no un prototipo docente.
 */
import type { B01Params } from '../../simulation/optical-world/types';

export const CALIBRATION_B01: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  dtS: { source: 'Guía Quiklabs (20 Hz)', status: 'verified' },
  ocularX: { source: 'Guía «Uso del equipo óptico» (cálculo de aumentos)', status: 'pending' },
  fieldNumberMm: { source: 'Ejemplo §3.1 (FN = 18 mm)', status: 'hypothetical' },
  workingDistanceMm: { source: 'Valores típicos de objetivos acromáticos, sin ficha', status: 'pending' },
  coarsePitchMmPerTurn: { source: 'Propuesta de cinemática del mando', status: 'pending' },
  finePitchMmPerTurn: { source: 'Propuesta de cinemática del mando', status: 'pending' },
  focusSigmaMm: { source: 'Curva visual de nitidez (no profundidad de campo real)', status: 'pending' },
  dropMl: { source: 'Gotero virtual sin calibrar', status: 'pending' },
  coverLowering: { source: 'Modelo de burbujas §6.6-7', status: 'pending' },
  observationHoldS: { source: 'Propuesta §7.1', status: 'pending' },
  stereo: { source: 'Estereoscopio genérico 0,7–4,5X, sin ficha', status: 'pending' },
  binocularHead: { source: 'Recorrido interpupilar y de dioptrías típico de cabezales Siedentopf, sin ficha', status: 'pending' },
  objective100: { source: 'Objetivo de 100X del revólver de cuatro posiciones: distancia de trabajo, σ y bandas de luz didácticas, sin ficha; aceite de inmersión no modelado', status: 'pending' },
  rigGeometry: { source: 'Proporciones a partir de vistas publicitarias de un binocular de laboratorio y un estéreo de zoom; sin cotas medidas', status: 'pending' },
};

export const DEFAULT_B01_PARAMS: B01Params = {
  dtS: 0.05,
  microscope: {
    ocularX: 10,
    fieldNumberMm: 18,
    fieldNumberStatus: 'hypothetical',
    workingDistanceMm: { 4: 17, 10: 7, 40: 0.6 },
    parfocalOffsetMm: { 4: 0, 10: 0.02, 40: 0.03 },
    focusSigmaMm: { 4: 0.12, 10: 0.04, 40: 0.01 },
    coarsePitchMmPerTurn: 2,
    finePitchMmPerTurn: 0.1,
    stageZRangeMm: [0, 24],
    fineRangeMm: 1,
    stageZ0Mm: 6,
    focalPlaneZMm: 17.5,
    stageXYRangeMm: [-25, 25],
    gapWarnMm: 0.3,
    gapSafeRemoveMm: 2,
    coarseAt40MaxTurns: 0.1,
    luminanceBand: { 4: [0.12, 0.65], 10: [0.18, 0.75], 40: [0.26, 0.9] },
    diaphragmBand: { 4: [0.15, 0.65], 10: [0.3, 0.8], 40: [0.45, 0.95] },
    condenserMin01: 0.6,
    sharpnessValid: 0.6,
    turretDetentDeg: 120,
    turretLockTolDeg: 2,
    sideCheckValidS: 30,
    ipdRangeMm: [48, 75],
    diopterRange: 5,
  },
  stereo: {
    ocularX: 10,
    zoomRange: [0.7, 4.5],
    fieldNumberMm: 22,
    workingDistanceMm: 100,
    focusPitchMmPerTurn: 2,
    focusRangeMm: 20,
    headZRangeMm: [90, 140],
    focusSigmaMm: 0.9,
    userIpdMm: 63,
    ipdTolMm: 4,
    diopterTol: 1.5,
    incidentBand: [0.2, 0.8],
    locateZoomMax: 1.5,
    highZoom: 3.5,
    sharpnessValid: 0.6,
    centerTolMm: 15,
  },
  mount: {
    dropMlMin: 0.03,
    dropMlMax: 0.07,
    coverSizeCm: 1.8,
    maxFragmentCm: 1.6,
    minFragmentCm: 0.3,
    needMl: 0.02,
    excessMl: 0.12,
    dropReachCm: 0.8,
    edgeCm: 0.9,
    coverMinAngleDeg: 30,
    coverMaxSpeedCmS: 0.8,
    coverBreakForce01: 0.75,
    evapOpenMlS: 0.0006,
    evapCoveredMlS: 0.00001,
    dehydratePerS: 0.02,
    bubbleUsableMax: 0.3,
  },
  slideThicknessMm: 1.0,
  coverThicknessMm: 0.17,
  specimenDepthMm: 0.03,
  fixedAboveMm: 0.2,
  observationHoldS: 1.5,
  seatTolMm: 3,
  leafCm: 0.9,
  bigLeafCm: 2.6,
  dropperInitialMl: 10,
  requiredMagnifications: 2,
  caseSlots: 12,
  caseOpenRiskS: 90,
};

/**
 * Revólver de cuatro posiciones a 90° (4X, 10X, 40X y 100X de cuerpo negro), el de los intentos nuevos. Los valores del
 * 100X son didácticos (`objective100`): la distancia de trabajo se mide desde el plano del tejido y deja la separación
 * de enfoque por encima de `gapWarnMm` en una lámina fija.
 */
export function withFourObjectives<P extends { microscope: B01Params['microscope'] }>(params: P): P {
  const m = params.microscope;
  m.objectives = [4, 10, 40, 100];
  m.turretDetentDeg = 90;
  m.workingDistanceMm[100] = 0.55;
  m.parfocalOffsetMm[100] = 0.03;
  m.focusSigmaMm[100] = 0.005;
  m.luminanceBand[100] = [0.34, 1.0];
  m.diaphragmBand[100] = [0.6, 1.0];
  return params;
}
