/**
 * Parámetros de F08 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (masa y radio del disco, masa de caída, radio del tambor, roce del eje y resolución del
 * encoder) y se congelan al crear el intento. Ningún valor configurado se presenta como «medición real» (decisión F08-2).
 */
import type { F08Params } from '../../simulation/f08-world/types';

export const DEFAULT_F08_PARAMS: F08Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  I0: 1.5e-3,
  disc: { M: 0.5, R: 0.1 },
  ring: { M: 0.5, R: 0.1 },
  bar: { M: 0.3, L: 0.6 },
  slideKg: 0.05,
  slideMinR: 0.04,
  slideMaxR: 0.29,
  holes: [0, 0.03, 0.05],
  ringEccMaxMm: 6,
  drumRadii: [0.015, 0.02, 0.03],
  layerTurns: 5,
  stringDr: 0.001,
  dropKg: { drop20: 0.02, drop50: 0.05, drop100: 0.1 },
  bearingNm: 4e-4,
  frictionNm: 0,
  imbalanceK: 0.0002,
  brakeNm: 0.06,
  touchNm: 0.004,
  omegaMax: 35,
  slideMu: 0.3,
  pulleyDist: 0.34,
  pulleyDzMax: 2.5,
  creepK: 0.004,
  creepMax: 0.01,
  guardR: 0.305,
  noiseFactor: 1,
  encoderResDeg: 0.1,
  encoderUncalScale: 400 / 360,
  tension: { ranges: [2, 10], resolutions: [0.001, 0.005], uncalScale: 1, offsetN: 0.05, noiseN: 0.002 },
  tach: { ranges: [100, 500], resolutions: [0.1, 1], noiseRpm: 0.3 },
  gate: { resolutionS: 1e-5, jitterS: 0, missYawDeg: 30 },
  rates: [5, 20, 50, 200],
  balanceResolutionG: 1,
  caliperResCm: 0.01,
  protractorResDeg: 1,
  rulerResCm: 0.1,
  // Incertidumbres tipo B (estándar): media división rectangular salvo el sensor de tensión (exactitud declarada).
  uB: { balanceG: 1 / Math.sqrt(12), caliperCm: 0.01 / Math.sqrt(12), protractorDeg: 1 / Math.sqrt(12), rulerCm: 0.1 / Math.sqrt(12), encoderDeg: 0.1 / Math.sqrt(12), tensionN: 0.005, tachRpm: 0.5, gateS: 1e-5 },
  calibration: {
    balance01: 'verified', caliper01: 'verified', base01: 'verified', ruler01: 'verified', encoder01: 'pending', tension01: 'pending', tach01: 'hypothetical', gate01: 'hypothetical',
    hub01: 'hypothetical', bearing: 'hypothetical', g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F08-4): sin ruido, sin roce de rodamientos, sin desbalance y con la polea alineada. */
export function curricularParams(p: F08Params): F08Params {
  return { ...p, scientificMode: 'CURRICULAR', noiseFactor: 0, bearingNm: 0, imbalanceK: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F08_TEACHER_RANGES = {
  discM: [0.2, 1],
  discR: [0.05, 0.2],
  dropKg: [0.02, 0.15],
  drumR: [0.015, 0.03],
  frictionNm: [0, 0.006],
  encoderResDeg: [0.01, 1],
} as const;
