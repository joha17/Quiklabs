/**
 * Parámetros de la Práctica 7 (§7.1). Todo valor es una PROPUESTA de prototipo pendiente de validación (`[PENDIENTE]`):
 * tiempos de estabilización, umbral del detector, factor de celda y rangos del conductímetro se fijarán contra la hoja
 * técnica del instrumento que se emule. El docente solo cambia parámetros de experiencia, nunca κ ni leyes (§7.3).
 */
import type { P07Params } from '../../simulation/bonding-world/types';

export const DEFAULT_P07_PARAMS: P07Params = {
  dtS: 0.05,
  initialTemperatureC: 25.0,
  waterPairVolumeMl: 5.0,
  apolarPairVolumeMl: 5.0,
  minimumPairComparisons: 2,
  minimumUnknowns: 2,
  /** Provisional (§7.1). */
  probeStabilityS: 2.0,
  probeResponseTauS: 0.6,
  probeMinImmersionCm: 1.5,
  probeFilmMl: 0.04,
  /** Tiempo didáctico de observación, no disolución instantánea (§7.1). */
  mixObservationS: 6.0,
  /** Granataria de 0,01 g: resolución, NO exactitud (§7.1). */
  balance: {
    capacityG: 600, resolutionG: 0.01, uncertaintyG: 0.01, settleS: 0.25, noiseOpenG: 0.0015, noiseClosedG: 0.0015,
    levelOffsetGPerDeg: 0, levelRelPerDeg: 0, driftGPerMin: 0,
  },
  cylinderCapacityMl: 10.0,
  cylinderDivisionMl: 0.2,
  /** Agua purificada en equilibrio con el aire: ~1,5 µS/cm (no cero) `[PENDIENTE]`. */
  waterBackgroundSPerM: 1.5e-4,
  /** Detector virtual: 1,0 V con 100 Ω de limitación (corto ≤ 10 mA), umbral del indicador 0,05 mA `[PENDIENTE]`. */
  detectorVoltageV: 1.0,
  detectorLimitOhm: 100,
  detectorThresholdMA: 0.05,
  detectorStabilityS: 1.0,
  contactOhm: 0.5,
  oxideContactOhm: 3000,
  /** Rangos del conductímetro genérico `[PENDIENTE]`: 0–200 µS/cm, 0–2000 µS/cm, 0–20 mS/cm. */
  meterRanges: {
    LOW: { maxUsPerCm: 200, resolutionUsPerCm: 0.1 },
    MID: { maxUsPerCm: 2000, resolutionUsPerCm: 1 },
    HIGH: { maxUsPerCm: 20000, resolutionUsPerCm: 10 },
  },
  spatulaScoopG: 0.15,
  spatulaResidueFraction: 0.01,
  aceticStockM: 0.1,
  allowRestricted: false,
  parallaxSlopeThreshold: 0.08,
};
