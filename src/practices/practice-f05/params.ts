/**
 * Parámetros de F05 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (masa del bloque, coeficientes de cada material, rigidez del resorte, rango del sensor)
 * y se congelan al crear el intento. Ningún valor configurado se presenta como «medición real» (decisión F05-2).
 */
import type { F05Params } from '../../simulation/f05-world/types';

export const DEFAULT_F05_PARAMS: F05Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  blockKg: 0.5,
  ballastKg: { w250a: 0.25, w250b: 0.25 },
  // Coeficientes de tablas de laboratorio escolar (madera seca, papel encerado, goma): hipótesis de simulación.
  mu: { wood: { s: 0.45, k: 0.3 }, paper: { s: 0.35, k: 0.25 }, rubber: { s: 0.8, k: 0.6 } },
  muRipple: 0,
  wornFactor: 0.82,
  restTau: 2,
  springK: 200,
  springC: 3,
  drives: [0.5, 1, 2, 5],
  jerkM: 0.02,
  driftDegS: 0.03,
  supportSlipDeg: 0.6,
  degPerTurn: 0.25,
  looseFallA: 1,
  looseFallDeg: 12,
  bendMs: 0.8,
  bentFactor: 1.6,
  releaseJitter: 0.002,
  noiseFactor: 1,
  balanceResolutionG: 1,
  balanceOffsetG: 3,
  scaleResolutionCm: 0.1,
  goniometerResDeg: 0.5,
  supportResDeg: 1,
  thermoResC: 0.5,
  roomC: 21,
  videoResCm: 0.05,
  force: { ranges: [2, 20, 50], resolutions: [0.001, 0.01, 0.02], uncalScale: 1.04, offsetN: 0.15, noiseN: 0.004 },
  gate: { resolutionS: 1e-5, jitterS: 0, missYawDeg: 8 },
  rates: [10, 50, 200],
  // Incertidumbres tipo B (estándar): media división rectangular salvo la célula de carga (exactitud declarada).
  uB: { balanceG: 1 / Math.sqrt(12), forceN: 0.01, angleDeg: 0.5 / Math.sqrt(12), scaleCm: 0.1 / Math.sqrt(12), gateS: 1e-5, videoCm: 0.05, tempC: 0.5 / Math.sqrt(12) },
  calibration: {
    balance01: 'verified', plane01: 'verified', gonio01: 'verified', load01: 'pending', spring01: 'hypothetical', gate1: 'hypothetical', gate2: 'hypothetical',
    thermo01: 'verified', mu: 'hypothetical', g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F05-4): sin ruido, adherencia que vuelve al instante, sin desgaste. */
export function curricularParams(p: F05Params): F05Params {
  return { ...p, scientificMode: 'CURRICULAR', releaseJitter: 0, noiseFactor: 0, muRipple: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F05_TEACHER_RANGES = {
  blockKg: [0.2, 1.5],
  muS: [0.1, 1.0],
  muK: [0.05, 0.9],
  g: [9.75, 9.85],
  springK: [50, 800],
  forceRangeN: [2, 50],
} as const;
