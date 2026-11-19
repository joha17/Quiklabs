/**
 * Parámetros de F09 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (masa orbitante, radio, fuerza del dinamómetro, roce del eje) y se congelan al crear el
 * intento. Ningún valor configurado se presenta como «medición real» (decisión F09-2).
 *
 * Radio de la guía: la plataforma es de Ø 60 cm (§4 A), así que la guía radial útil llega a 27 cm (tope) en lugar de
 * los 0,50 m de la tabla de §7; el caso de 0,50 m queda como oráculo de prueba unitaria (decisión F09-1).
 */
import type { F09Params } from '../../simulation/f09-world/types';

export const DEFAULT_F09_PARAMS: F09Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  I0: 0.02,
  orbitKg: 0.2,
  orbitMinR: 0.06,
  orbitStopR: 0.27,
  orbitMaxR: 0.285,
  orbitHalf: 0.025,
  slackM: 0.015,
  slideKg: 0.2,
  slideMinR: 0.05,
  slideMaxR: 0.26,
  pullSpeed: 0.15,
  armRadii: [0.1, 0.15, 0.2],
  maxCordTurns: 2,
  bearingNm: 0.0015,
  frictionNm: 0,
  imbalanceK: 0.0002,
  tiltNmPerDeg: 0.002,
  brakeNm: [0, 0.02, 0.6],
  motorKp: 0.5,
  motorMaxNm: 0.5,
  surgeRad: 3.2,
  omegaMax: 25,
  creepSlideM: 0.01,
  baseCreepK: 0.05,
  baseCreepMax: 0.05,
  guardR: 0.32,
  noiseFactor: 1,
  encoderResRad: 0.001,
  encoderUncalScale: 400 / 360,
  force: { ranges: [2, 10], resolutions: [0.001, 0.005], uncalScale: 1, offsetN: 0.06, noiseN: 0.003 },
  dyn: { rangeN: 5, resN: 0.05, offsetN: 0.15 },
  gate: { resolutionS: 1e-4, jitterS: 0, missYawDeg: 30 },
  rates: [10, 20, 50, 200],
  balanceResolutionG: 0.1,
  rulerResCm: 0.1,
  // Incertidumbres tipo B (estándar): media división rectangular salvo el sensor de fuerza (exactitud declarada).
  uB: { balanceG: 0.1 / Math.sqrt(12), rulerCm: 0.1 / Math.sqrt(12), forceN: 0.01, gateS: 1e-4 / Math.sqrt(12), encoderRad: 0.001 / Math.sqrt(12), dynN: 0.05 / Math.sqrt(12) },
  calibration: {
    balance01: 'verified', ruler01: 'verified', force01: 'pending', gate01: 'hypothetical', encoder01: 'pending', dyn01: 'pending', hub01: 'hypothetical', motor01: 'hypothetical', bearing: 'hypothetical',
    g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F09-4): sin ruido, sin roce del eje, sin desbalance, eje vertical y cordón tenso. */
export function curricularParams(p: F09Params): F09Params {
  return { ...p, scientificMode: 'CURRICULAR', noiseFactor: 0, bearingNm: 0, imbalanceK: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F09_TEACHER_RANGES = {
  orbitKg: [0.05, 0.4],
  orbitR: [0.1, 0.27],
  pullN: [0, 5],
  frictionNm: [0, 0.05],
} as const;
