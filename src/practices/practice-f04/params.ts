/**
 * Parámetros de F04 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (masa del carro y colgante, radio e inercia de la polea, roce del carril, rango del
 * sensor) y se congelan al crear el intento. Ningún valor configurado se presenta como «medición real» (decisión F04-2).
 */
import type { F04Params } from '../../simulation/f04-world/types';

export const DEFAULT_F04_PARAMS: F04Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  // Carro de 400 g con el sensor de fuerza (35 g) y el acelerómetro (15 g): 450 g montado.
  cartBodyKg: 0.4,
  forceSensorKg: 0.035,
  accelKg: 0.015,
  hangerKg: 0.05,
  slotKg: { m10a: 0.01, m10b: 0.01, m20a: 0.02, m50a: 0.05 },
  pairPKg: 0.3,
  pairQKg: 0.6,
  pulleyR: 0.025,
  pulleyI: 2e-5,
  bearingTorque: 2e-4,
  rollingN: 0.02,
  cableDragN: 0.06,
  axleN: 0.12,
  looseClampN: 0.05,
  brakeB: 5,
  stopRestitution: 0.3,
  impactMs: 0.3,
  shockMs: 0.8,
  shockOffset: 0.15,
  holdSlackM: 0.03,
  releaseJitter: 0.002,
  noiseFactor: 1,
  pairK: 2000,
  pairDamping: 2,
  pairRollingN: 0.03,
  levelDegPerTurn: 0.05,
  balanceResolutionG: 1,
  balanceOffsetG: 3,
  scaleResolutionCm: 0.1,
  accelRange: 10,
  accelResolution: 0.01,
  accelNoise: 0.01,
  force: { ranges: [2, 20, 50], resolutions: [0.001, 0.01, 0.02], uncalScale: 1.04, offsetN: 0.15, noiseN: 0.004 },
  gate: { resolutionS: 1e-5, jitterS: 0, missYawDeg: 8 },
  rates: [10, 50, 200],
  // Incertidumbres tipo B (estándar): media división rectangular salvo los sensores (exactitud declarada).
  uB: { balanceG: 1 / Math.sqrt(12), accel: 0.02, forceN: 0.01, scaleCm: 0.1 / Math.sqrt(12), gateS: 1e-5 },
  calibration: {
    balance01: 'verified', track01: 'verified', forceA: 'pending', dynP: 'pending', dynQ: 'pending', accel01: 'hypothetical', gate1: 'hypothetical', gate2: 'hypothetical',
    pulley01: 'hypothetical', g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F04-4): sin roce, polea sin inercia y sensores sin ruido. */
export function curricularParams(p: F04Params): F04Params {
  return { ...p, scientificMode: 'CURRICULAR', rollingN: 0, pulleyI: 0, bearingTorque: 0, releaseJitter: 0, noiseFactor: 0, pairRollingN: 0.03 };
}

/** Rangos permitidos al docente (§7). */
export const F04_TEACHER_RANGES = {
  cartKg: [0.2, 1.0],
  hangKg: [0.01, 0.15],
  g: [9.75, 9.85],
  pulleyR: [0.02, 0.05],
  pulleyI: [0, 8e-5],
  rollingN: [0, 0.2],
  forceRangeN: [5, 50],
} as const;
