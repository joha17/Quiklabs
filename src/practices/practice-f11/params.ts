/**
 * Parámetros de F11 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (densidad del agua, g, densidad del bloque, viscosidad) y se congelan al crear el intento.
 * Ningún valor configurado se presenta como «medición real».
 *
 * Tanque de 60 × 35 × 45 cm (2100 cm² de superficie): 42 cm de agua son 88,2 L, y la sonda a 40 cm de profundidad lee
 * 3,92 kPa. El bloque de aluminio de 10 × 10 × 5 cm (500 cm³) pesa 13,2 N, dentro del dinamómetro de 20 N, y su empuje
 * total en agua es 4,9 N.
 */
import type { F11Params } from '../../simulation/f11-world/types';

const s12 = Math.sqrt(12);

export const DEFAULT_F11_PARAMS: F11Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  // Agua a ~20 °C; la variante curricular usa 1000 kg/m³.
  rhoA: 998,
  rhoB: 1180,
  pAtmKPa: 101.325,
  tank: { L: 60, W: 35, H: 45, overflowCm: 43 },
  fillCm: 42,
  flows: { tap: 3000, pump: 3000, drain: 4000 },
  resB0: 150000,
  waveS: 3,
  waveAmpCm: 0.3,
  stratDelta: 80,
  agitateTauS: 1.5,
  viscosity: 0.001,
  probe: {
    ranges: [2, 20], resolutions: [0.001, 0.01], absRange: 200, absRes: 0.01, offsetKPa: 0.3, uncalScale: 1.025, tauS: 0.4, bubbleTauS: 4,
    bubbleKPa: -0.06, damageKPa: 0.15, wallKPa: 0.04, noiseKPa: 0.004, driftCmS: 0.15, bubbleChance: 0.35,
  },
  rates: [1, 5, 20, 50],
  rulerResCm: 0.1,
  levelResCm: 0.1,
  draftResCm: 0.1,
  standResCm: 0.1,
  dyn: { rangeN: 20, resN: 0.02, offsetN: 0.12 },
  balance: { rangeG: 2000, resG: 0.1, offsetG: 0.6 },
  cyl: { capML: 250, resML: 2, fillML: 200, spreadML: 6, dryG: 160 },
  can: { dCm: 16, spoutCm: 12, initCm: 10 },
  catchDryG: 85,
  block: { L: 10, W: 10, H: 5, rho: 600 },
  alu: { L: 10, W: 10, H: 5, rho: 2700 },
  bottle: { L: 6, W: 6, H: 15, rho: 0, dryG: 120 },
  ballasts: [0, 100, 200, 300, 400],
  stand: { speedCmS: 2, maxCm: 30 },
  settleS: 1.5,
  noiseFactor: 1,
  // Incertidumbres tipo B (estándar): media división rectangular de cada instrumento.
  uB: { probeKPa: 0.01 / s12, rulerCm: 0.1 / s12, levelCm: 0.1 / s12, draftCm: 0.1 / s12, standCm: 0.1 / s12, dynN: 0.02 / s12, balanceG: 0.1 / s12, cylML: 2 / s12 },
  calibration: {
    probe01: 'pending', ruler01: 'verified', scale01: 'verified', draft01: 'verified', stand01: 'verified', dyn01: 'pending', balance01: 'pending', cyl01: 'verified', logger01: 'hypothetical',
    rhoA: 'hypothetical', rhoB: 'hypothetical', g: 'hypothetical', viscosity: 'hypothetical',
  },
};

/** Variante curricular ideal: agua a 1000 kg/m³, sin ruido, sin burbujas y sonda de escala 1 (los ceros se mantienen). */
export function curricularParams(p: F11Params): F11Params {
  return { ...p, scientificMode: 'CURRICULAR', rhoA: 1000, noiseFactor: 0, probe: { ...p.probe, uncalScale: 1, bubbleChance: 0 } };
}

/** Rangos permitidos al docente (§7). */
export const F11_TEACHER_RANGES = {
  rhoA: [995, 1000],
  g: [9.75, 9.85],
  blockRho: [200, 1600],
  viscosity: [0.0005, 0.01],
} as const;
