/**
 * Parámetros de F10 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (masa de la viga, carga, material) y se congelan al crear el intento. Ningún valor
 * configurado se presenta como «medición real».
 *
 * Probeta: Ø 5,05 mm (A ≈ 20 mm²) con 300 mm de zona calibrada, para que la fluencia del acero (≈ 5 kN) quede dentro
 * de una prensa de mesada de 10 kN y el alargamiento elástico (≈ 0,3 mm) se lea con un comparador de 0,001 mm.
 */
import type { F10Params } from '../../simulation/f10-world/types';

export const DEFAULT_F10_PARAMS: F10Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  beamKg: 0.5,
  beamLenCm: 120,
  cgOffsetCm: 1.5,
  hcCm: 5,
  wedgeTolCm: 0.3,
  supportMinCm: 2,
  supportMaxCm: 118,
  loadKg: 0.5,
  illCondCm: 3,
  seatBias: 0.12,
  handN: 1.2,
  handS: 100,
  driftCm: 0.6,
  settleS: 1.5,
  tipDropCm: 8,
  cell: { rangeN: 20, resN: 0.01, offsetN: 0.12, noiseN: 0.004 },
  dyn: { rangeN: 20, resN: 0.05, offsetN: 0.15 },
  tapeResCm: 0.1,
  caliperResMm: 0.01,
  material: 'steel',
  materials: {
    steel: { E: 200e9, sigmaY: 250e6, nu: 0.29 },
    aluminium: { E: 70e9, sigmaY: 95e6, nu: 0.33 },
  },
  hardening: 0.02,
  specimenDmm: 5.046,
  dSpreadMm: 0.015,
  L0mm: 300,
  eccMm: 0.09,
  preloadMm: 0.02,
  crankSpeedMmS: 0.05,
  quickSpeedMmS: 2,
  crankMaxMm: 1.2,
  transientS: 3,
  vibrationS: 1,
  quickRelease: true,
  loadCell: { ranges: [2000, 10000], resolutions: [0.5, 1], offsetN: 6, noiseN: 0.6 },
  gauge: { resMm: 0.001, rangeMm: 5, offsetMm: 0.04, uncalScale: 1.015, noiseMm: 0.0004 },
  rates: [1, 5, 20, 100],
  benchTiltDeg: 1.5,
  noiseFactor: 1,
  // Incertidumbres tipo B (estándar): media división rectangular salvo la celda de carga (exactitud declarada).
  uB: { dynN: 0.05 / Math.sqrt(12), cellN: 0.01 / Math.sqrt(12), tapeCm: 0.1 / Math.sqrt(12), caliperMm: 0.01 / Math.sqrt(12), loadCellN: 2, gaugeMm: 0.001 / Math.sqrt(12) },
  calibration: {
    dyn01: 'pending', supportA: 'pending', supportB: 'pending', tape01: 'verified', caliper01: 'verified', loadCell01: 'pending', gauge01: 'pending', logger01: 'hypothetical', press01: 'hypothetical',
    materials: 'hypothetical', g: 'hypothetical',
  },
};

/** Variante curricular ideal: sin ruido, centro de masa centrado, mesada nivelada y probeta centrada (offsets se mantienen). */
export function curricularParams(p: F10Params): F10Params {
  return { ...p, scientificMode: 'CURRICULAR', noiseFactor: 0, cgOffsetCm: 0, benchTiltDeg: 0, eccMm: 0, dSpreadMm: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F10_TEACHER_RANGES = {
  beamKg: [0.2, 1],
  loadKg: [0.1, 1],
} as const;
