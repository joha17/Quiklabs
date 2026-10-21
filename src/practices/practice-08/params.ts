/**
 * Parámetros de la Práctica 8 (§7). Todo valor es una PROPUESTA de prototipo `[PENDIENTE]` con
 * `scientificModel: 'curricular-calibrated'`: capacidades de secado, retención de la torta, potencia de la placa,
 * constantes de tiempo térmicas e incertidumbre del analizador se fijarán contra datos y fichas de equipo. El docente
 * cambia parámetros de experiencia (ruta, escenarios), nunca leyes ni constantes cinéticas (§7, banco científico).
 */
import type { P08Params } from '../../simulation/organic-world/types';

export const P08_PARAMS_VERSION = 'p8-params-1';
export const SCIENTIFIC_MODEL = 'curricular-calibrated' as const;

export const DEFAULT_P08_PARAMS: P08Params = {
  dtS: 0.05,
  ambientTempC: 25.0,
  /** Granataria electrónica 0–500 g con visualización de 0,001 g SIMULADA (§4: equipo a confirmar). */
  balance: {
    capacityG: 500, resolutionG: 0.001, uncertaintyG: 0.002, settleS: 0.15, noiseOpenG: 0.0004, noiseClosedG: 0.0004,
    levelOffsetGPerDeg: 0, levelRelPerDeg: 0, driftGPerMin: 0,
  },
  cylinderDivisionMl: { cyl10: 0.1, cyl25: 0.5 },
  /** Placa de 25 × 25 cm con baño de agua: calentamiento máximo del baño ~0,25 °C/s `[PENDIENTE]`. */
  plateMaxRateCs: 0.25,
  bathTauS: 45,
  airTauS: 420,
  iceTempC: 1.0,
  ovenTempC: 75,
  /** Na₂SO₄ anhidro: ~0,25 g de agua por g (didáctico, muy por debajo del decahidrato teórico) `[PENDIENTE]`. */
  dryingCapacity: 0.25,
  cakeRetentionSealed: 0.6,
  cakeRetentionUnsealed: 1.6,
  coarsePaperFines: 0.15,
  hotObjectThresholdC: 35,
  /** Sobrepresión máxima admisible antes de ventear (kPa) `[MODELO]`. */
  funnelVentKPa: 25,
  /** Incertidumbre típica del ensayo de pureza (fracción másica). */
  analyzerUncertainty: 0.01,
  dropMl: 0.05,
  spatulaScoopG: 0.5,
  spatulaResidueFraction: 0.01,
  route: 'ISO',
};
