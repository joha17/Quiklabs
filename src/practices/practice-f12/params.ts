/**
 * Parámetros de F12 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (ρ, g, D1, D2, K del tramo rugoso, presión segura) y se congelan al crear el intento.
 * Ningún valor configurado se presenta como «medición real».
 *
 * Con la válvula en la posición 2 (K = 25) y la bomba al 85 % circulan ≈ 1,24 L/s: v1 ≈ 0,98 m/s, v2 ≈ 3,9 m/s, la
 * toma 1 marca ≈ 14 kPa y la garganta ≈ 7 kPa, dentro del rango de 25 kPa y fuera del de 10 kPa. Con la válvula casi
 * cerrada y la bomba al máximo la presión de salida pasa de 25 kPa y abre el alivio.
 */
import type { F12Params } from '../../simulation/f12-world/types';

const s12 = Math.sqrt(12);

export const DEFAULT_F12_PARAMS: F12Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  // Agua a ~20 °C; la variante curricular usa 1000 kg/m³.
  rho: 998,
  pAtmKPa: 101.325,
  D1: 0.04,
  D2: 0.02,
  wallM: 0.003,
  pump: { H0: 30000, kq: 4.152e9, tauS: 1.2, pulse: 0, pulseHz: 0.7 },
  // Cerrada = 1e9 (finito: los parámetros viajan en JSON con la cinta).
  K: { up: 2, conv: 0.02, diff: 0.12, smooth: 0.1, rough: 1.5, ret: 2, valve: [1e9, 100, 25, 8, 2, 0.5] },
  lenM: { up: 1, test: 0.9, down: 1.6 },
  pipeCm3: 4000,
  trapCm3: 160,
  purgeCm3S: 25,
  waveC: 60,
  slowCloseS: 0.5,
  pSafe: 25000,
  pDamage: 30000,
  sump0: 22000,
  leakK: 4e-7,
  sensor: { ranges: [10, 25], resolutions: [0.005, 0.01], offsetKPa: 0.15, uncalScale: 1.02, tauS: 0.3, airTauS: 3, airKPa: -0.08, noiseKPa: 0.006, damageKPa: 0.4 },
  rates: [1, 5, 20, 50],
  meter: { rangeLs: 2, resLs: 0.01, tauS: 0.5, k: 1.01, noiseLs: 0.003 },
  caliperResCm: 0.002,
  rulerResCm: 0.1,
  sumpResCm: 0.1,
  beaker: { capML: 1000, resML: 10, overML: 1100 },
  timerResS: 0.01,
  timingS: 0.3,
  clampDriftCmS: 0.08,
  settleS: 1.5,
  noiseFactor: 1,
  // Incertidumbres tipo B (estándar): media división rectangular; el cronómetro, la reacción humana (≈ 0,1 s).
  uB: { sensorKPa: 0.01 / s12, meterLs: 0.01 / s12, caliperCm: 0.002 / s12, rulerCm: 0.1 / s12, beakerML: 10 / s12, timerS: 0.1, sumpCm: 0.1 / s12 },
  calibration: {
    sensor1: 'pending', sensor2: 'pending', sensor3: 'pending', meter01: 'pending', caliper01: 'verified', ruler01: 'verified', beaker01: 'verified', timer01: 'verified',
    logger01: 'hypothetical', rho: 'hypothetical', g: 'hypothetical', D1: 'hypothetical', D2: 'hypothetical', K: 'hypothetical', pump: 'hypothetical',
  },
};

/** Variante curricular ideal: agua a 1000 kg/m³, sin pérdidas en el tramo de ensayo, sin ruido y sensores de escala 1. */
export function curricularParams(p: F12Params): F12Params {
  return {
    ...p, scientificMode: 'CURRICULAR', rho: 1000, noiseFactor: 0, K: { ...p.K, conv: 0, diff: 0, smooth: 0 },
    sensor: { ...p.sensor, uncalScale: 1 }, meter: { ...p.meter, k: 1 },
  };
}

/** Rangos permitidos al docente (§7). */
export const F12_TEACHER_RANGES = {
  rho: [995, 1000],
  D1: [0.02, 0.06],
  D2: [0.01, 0.04],
  Krough: [0, 3],
  pSafe: [10000, 40000],
  sensorResKPa: [0.005, 0.05],
} as const;
