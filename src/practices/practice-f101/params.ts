/**
 * Parámetros de F101 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos y se congelan al crear el intento. Ningún valor configurado se presenta como
 * «medición real» (decisión F101-2).
 */
import type { F101Params } from '../../simulation/f101-world/types';
import { DEFAULT_ANALYTICAL } from '../../simulation/instruments/analytical-balance';

export const DEFAULT_F101_PARAMS: F101Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  // Calibrador 0–150 mm, nonio de 0,02 mm. Pulgar 4 N/mm, fuerza recomendada ≤ 8 N; mordazas de 400 N/mm.
  caliper: { rangeMm: 150, resolutionMm: 0.02, thumbNPerMm: 4, jawNPerMm: 400, maxForceN: 40, forceLimitN: 8, parallaxDeg: 25 },
  // Micrómetro 0–25 mm, paso 0,5 mm, 0,01 mm. Trinquete 6 N (fuerza de graduación), arco + pieza 300 N/mm.
  micrometer: { rangeMm: 25, pitchMm: 0.5, resolutionMm: 0.01, frameNPerMm: 300, ratchetN: 6, nominalN: 6, maxForceN: 40, forceLimitN: 10, parallaxDeg: 25 },
  rulerResolutionMm: 1,
  // Balanza 0–2 kg, división 0,01 g.
  balance: { ...DEFAULT_ANALYTICAL, capacityG: 2000, resolutionG: 0.01, uncertaintyG: 0.01, settleS: 0.25, noiseOpenG: 0.004, noiseClosedG: 0.0015, levelOffsetGPerDeg: 0.02, levelRelPerDeg: 0.0006, driftGPerMin: 0 },
  gradCylCapacityMl: 100,
  gradCylDivisionMl: 1,
  gradCylInitialMl: 60,
  cylinderDiameterMm: 20.0,
  cylinderHeightMm: 50.0,
  ballDiameterMm: 19.05,
  gaugeBlockMm: 20.0,
  standardMassG: 100.0,
  tableRadiusCm: 17.5,
  pulleyFriction: 0.005,
  ringFrictionN: 0.01,
  ringMassG: 5,
  hangerMassG: 50,
  dynStiffNPerMm: 0.04,
  dynRangeN: 8,
  dynDivisionN: 0.1,
  angleDivisionDeg: 1,
  // Incertidumbres tipo B (estándar, distribución rectangular de media división salvo la balanza y las masas).
  uB: { caliperMm: 0.02 / Math.sqrt(12), micrometerMm: 0.01 / Math.sqrt(12), rulerMm: 1 / Math.sqrt(12), balanceG: 0.01, gradCylMl: 1 / Math.sqrt(12), dynamometerN: 0.1 / Math.sqrt(12), angleDeg: 1 / Math.sqrt(12), massRel: 0.002 },
  calibration: {
    gaugeBlock01: 'verified', massStd01: 'verified', caliper01: 'hypothetical', micrometer01: 'hypothetical', balance01: 'hypothetical',
    gradCyl01: 'hypothetical', dynamometer01: 'hypothetical', sensor01: 'pending', pulleyFriction: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F101-4): sin fricción de poleas ni anillo, mordazas rígidas. */
export function curricularParams(p: F101Params): F101Params {
  return { ...p, scientificMode: 'CURRICULAR', pulleyFriction: 0, ringFrictionN: 0, caliper: { ...p.caliper, jawNPerMm: 1e9 } };
}
