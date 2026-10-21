/**
 * Parámetros de la Práctica 9 (§7). Todo valor es una PROPUESTA de prototipo `[VALIDAR]` en modo CURRICULAR: Ksp,
 * catálogo espectral, volumen de gota, cinética de precipitación, sedimentación, umbral de desequilibrio del rotor y
 * altura de la mampara se fijarán con fuentes y fichas antes de publicar. El docente cambia escenarios, no leyes.
 */
import type { P09Params } from '../../simulation/cation-analysis-world/types';

export const P09_PARAMS_VERSION = 'p9-params-1';
export const SCIENCE_MODE = 'curricular' as const;

export const DEFAULT_P09_PARAMS: P09Params = {
  dtS: 0.05,
  ambientTempC: 25.0,
  /** Granataria de 0,01 g para equilibrar el rotor. */
  balance: {
    capacityG: 600, resolutionG: 0.01, uncertaintyG: 0.01, settleS: 0.25, noiseOpenG: 0.0015, noiseClosedG: 0.0015,
    levelOffsetGPerDeg: 0, levelRelPerDeg: 0, driftGPerMin: 0,
  },
  cylinderDivisionMl: 0.2,
  dropMl: 0.05,
  dropCV: 0.06,
  kPrecipPerS: 0.5,
  settleGravityPerS: 1 / 900,
  settleCentrifugePerS: 0.12,
  centrifugeRpm: 3000,
  maxRotorImbalanceG: 0.3,
  sashMaxCm: 40,
  loopLoadMl: 0.01,
  loopTauS: 1.5,
  glassTauS: 12,
  cupTauS: 8,
  residueFraction: 0.04,
  glassStressMax: 25,
  emissionNoise: 0.03,
  spectrumNoiseFloor: 0.01,
};
