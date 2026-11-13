/**
 * Parámetros de F06 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (rigidez del resorte, masa del carro, g, altura, roce y amortiguamiento) y se congelan
 * al crear el intento. Ningún valor configurado se presenta como «medición real» (decisión F06-2).
 */
import type { F06Params } from '../../simulation/f06-world/types';

export const DEFAULT_F06_PARAMS: F06Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  springK: 100,
  xLin: 0.2,
  kNL: 40,
  spareFactor: 1.01,
  damagedFactor: 0.9,
  hysteresisC: 1.5,
  standC: 0.5,
  hangerKg: 0.05,
  slotKg: { m100a: 0.1, m100b: 0.1, m100c: 0.1, m100d: 0.1 },
  cartKg: 0.2,
  cartMassKg: { cw1: 0.1, cw2: 0.1 },
  plungerKg: 0.01,
  rollN: 0.004,
  damagedRollN: 0.06,
  detachEta: 0.7,
  brakeC: 8,
  h0: 0.25,
  riserSlipM: 0.01,
  frictionN0: 0,
  damperC0: 0,
  pendL0: 0.8,
  bobKg: 0.1,
  bobD: 0.025,
  airGamma: 0.004,
  pendAmps: [10, 25],
  lagS: 0.02,
  noiseFactor: 1,
  balanceResolutionG: 1,
  rulerResCm: 0.1,
  gaugeResCm: 0.1,
  scaleResCm: 0.1,
  angleResDeg: 0.1,
  posResM: 0.0001,
  force: { ranges: [10, 50], resolutions: [0.01, 0.05], uncalScale: 1.05, offsetN: 0.25, noiseN: 0.01 },
  gate: { resolutionS: 1e-5, jitterS: 0, missYawDeg: 8 },
  rates: [50, 200, 1000],
  // Incertidumbres tipo B (estándar): media división rectangular salvo el sensor de fuerza (exactitud declarada).
  uB: { balanceG: 1 / Math.sqrt(12), rulerCm: 0.1 / Math.sqrt(12), gaugeCm: 0.1 / Math.sqrt(12), forceN: 0.05, posM: 0.0001 / Math.sqrt(12), gateS: 1e-5, angleDeg: 0.1 / Math.sqrt(12), scaleCm: 0.1 / Math.sqrt(12) },
  calibration: {
    balance01: 'verified', ruler01: 'verified', gauge01: 'verified', force01: 'pending', pos01: 'hypothetical', gate1: 'hypothetical', gate2: 'hypothetical', gate3: 'hypothetical',
    angle01: 'hypothetical', spring01: 'hypothetical', damper01: 'pending', pad01: 'pending', g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F06-4): sin ruido, sin rodadura, sin masa del émbolo ni aire. */
export function curricularParams(p: F06Params): F06Params {
  return { ...p, scientificMode: 'CURRICULAR', noiseFactor: 0, rollN: 0, plungerKg: 0, airGamma: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F06_TEACHER_RANGES = {
  springK: [20, 300],
  compressionM: [0, 0.2],
  cartKg: [0.1, 0.8],
  g: [9.75, 9.85],
  heightM: [0, 0.4],
  frictionN: [0, 0.4],
  damperC: [0, 1.0],
} as const;
