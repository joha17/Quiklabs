/**
 * Parámetros de la Práctica 1 (§7). Todos son PROPUESTAS DE SIMULACIÓN, no características certificadas de
 * instrumentos reales; el docente puede cambiar los permitidos y se congelan al crear el intento.
 * Referencias de calibración: §8 (agua 25/5 °C, clavos de 20 g de hierro idealizado 7,87 g/mL, cilindro de aluminio
 * idealizado 2,70 g/cm³ de 2,000 × 2,500 cm, vidrio de reloj de 18,42 g).
 */
import type { P01Params } from '../../simulation/density-world/types';
import { DEFAULT_ANALYTICAL } from '../../simulation/instruments/analytical-balance';

export const DEFAULT_P01_PARAMS: P01Params = {
  dtS: 0.05,
  roomTempC: 25,
  coldBathTargetC: 5,
  ambientWaterInitialMl: 150,
  coldWaterInitialMl: 150,
  pipetteNominalMl: 25.0,
  pipetteToleranceHalfWidthMl: 0.03,
  pipetteTipResidualMl: 0.1,
  pipetteDrainTimeS: 14,
  pipetteMaxFlowMlS: 2.5,
  graduatedCylinderCapacityMl: 50,
  graduatedCylinderDivisionMl: 1,
  graduatedCylinderReadHalfWidthMl: 0.5,
  nailsTargetMassG: 20,
  nailsReferenceDensityGPerMl: 7.87,
  initialDisplacementWaterMl: 20,
  solidCylinderDiameterCm: 2.0,
  solidCylinderHeightCm: 2.5,
  cylinderMaterialDensityGPerMl: 2.7,
  watchGlassMassG: 18.42,
  weighBoatMassG: 2.35,
  erlenmeyerMassG: 78.4,
  // Balanza granataria digital: 0,01 g, 600 g, ruido pequeño (el último dígito casi nunca parpadea), estable en 1,5 s.
  balance: {
    ...DEFAULT_ANALYTICAL, capacityG: 600, resolutionG: 0.01, uncertaintyG: 0.01, settleS: 0.25, noiseOpenG: 0.004, noiseClosedG: 0.0015,
    levelOffsetGPerDeg: 0.02, levelRelPerDeg: 0.0006, driftGPerMin: 0,
  },
  balanceStableTimeS: 1.5,
  caliperResolutionCm: 0.002,
  caliperStandardUncertaintyCm: 0.002,
  thermometerResolutionC: 0.1,
  thermometerStandardUncertaintyC: 0.2,
  thermometerResponseTauS: 4,
  roomThermalExchangeRateSInv: 0.0012,
  bathThermalExchangeRateSInv: 0.015,
  maxParallaxDivisions: 1,
  caliperContactForceThreshold: 0.7,
  spillAlertThresholdMl: 0.5,
  convention: 'RECTANGULAR',
};
