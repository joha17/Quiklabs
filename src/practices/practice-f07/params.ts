/**
 * Parámetros de F07 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (masas, velocidades iniciales, restitución, roce y rigidez de contacto) y se congelan al
 * crear el intento. Ningún valor configurado se presenta como «medición real» (decisión F07-2).
 */
import type { F07Params } from '../../simulation/f07-world/types';

export const DEFAULT_F07_PARAMS: F07Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  m1: 0.2,
  m2: 0.3,
  cartMassKg: { cw100a: 0.1, cw100b: 0.1, cw200: 0.2 },
  v1: 1.0,
  v2: 0,
  e: 1.0,
  frictionN: 0,
  rollN: 0.002,
  bindN: 0.03,
  damagedRollN: 0.05,
  sideMu: 0.3,
  sideRubN: 0.03,
  contactK: 1500,
  magnetFactor: 0.25,
  magnetRangeM: 0.02,
  looseVelcroE: 0.35,
  endE: 0,
  endHardE: 0.5,
  baseTiltMax: 0.6,
  gateSlipM: 0.01,
  offsetMaxMm: 3,
  flagYaw0: 7,
  noiseFactor: 1,
  balanceResolutionG: 1,
  caliperResCm: 0.01,
  levelResDeg: 0.05,
  rulerResCm: 0.1,
  force: { ranges: [10, 50], resolutions: [0.01, 0.05], uncalScale: 1.05, offsetN: 0.25, noiseN: 0.01 },
  gate: { resolutionS: 1e-5, jitterS: 0, missYawDeg: 30 },
  rates: [50, 200, 1000, 5000],
  // Incertidumbres tipo B (estándar): media división rectangular salvo el sensor de fuerza (exactitud declarada).
  uB: { balanceG: 1 / Math.sqrt(12), caliperCm: 0.01 / Math.sqrt(12), levelDeg: 0.05 / Math.sqrt(12), rulerCm: 0.1 / Math.sqrt(12), forceN: 0.05, gateS: 1e-5, cameraMs: 0.002 },
  calibration: {
    balance01: 'verified', caliper01: 'verified', level01: 'verified', ruler01: 'verified', force01: 'pending', gateA: 'hypothetical', gateB: 'hypothetical', camera01: 'hypothetical',
    launcherA: 'hypothetical', launcherB: 'hypothetical', bumpers: 'hypothetical', g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F07-4): sin ruido ni rodadura y con la mesada a nivel. */
export function curricularParams(p: F07Params): F07Params {
  return { ...p, scientificMode: 'CURRICULAR', noiseFactor: 0, rollN: 0, baseTiltMax: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F07_TEACHER_RANGES = {
  m1: [0.1, 0.5],
  m2: [0.1, 0.5],
  v1: [0.1, 2.5],
  v2: [-1, 1],
  e: [0.5, 1],
  frictionN: [0, 0.04],
  contactK: [500, 8000],
} as const;
