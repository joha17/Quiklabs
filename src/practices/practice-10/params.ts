/**
 * Parámetros de la Práctica 10 (configurables por el docente, §34). Valores por defecto:
 * modo curricular (§3.1; el realista agrega disolución de CO₂, compresión del espacio de cabeza y transitorios térmicos),
 * 25 °C y 101,325 kPa (el caso de referencia §19), balón de 100,00 mL, pipeta de 20,00 mL, vinagre al 5,0 % m/v,
 * sensor GPS-BTA (0,8 mL internos). Las constantes cinéticas se ajustaron para que la reacción termine en 1–2 min
 * con agitación suave; las de la jeringa, para que una compresión de 1 s caliente el gas ≈ 10 K y vuelva en ≈ 3 s.
 */
import type { P10Params } from '../../simulation/gas-world/types';
import { DEFAULT_ANALYTICAL } from '../../simulation/instruments/analytical-balance';
import { CURRICULAR_DENSITY_RATIO } from '../../simulation/gas-laws/hydrostatic';

export const DEFAULT_P10_PARAMS: P10Params = {
  dtS: 0.05,
  ambientC: 25,
  pressureKPa: 101.325,
  altitudeM: 0,
  model: 'CURRICULAR',
  vapor: 'TABLE',
  densityRatio: CURRICULAR_DENSITY_RATIO,
  balance: { ...DEFAULT_ANALYTICAL },
  flaskMl: 100,
  flaskTolMl: 0.08,
  pipetteMl: 20,
  pipetteTolMl: 0.03,
  cylinderMl: 25,
  cylinderUncertaintyMl: 0.2,
  vinegar: { percent: 5.0, basis: 'm/v', densityGmL: 1.005, purity: 1, uRel: 0.02 },
  vinegarMl: 400,
  targetBicarbG: 0.5,
  bathWaterMl: 300,
  bathWater: 'FRESH',
  tapWaterC: 23.8,
  linesVolumeMl: 6,
  looseLeakMolPerSKPa: 4e-7,
  reactionK: 0.06,
  degasK: 0.03,
  buretteKla: 0.0025,
  thermometer: { timeConstantS: 10, resolutionC: 0.1, uncertaintyC: 0.2 },
  barometer: { resolutionMmHg: 0.1, uncertaintyMmHg: 0.5 },
  ruler: { resolutionMm: 1, uncertaintyMm: 1 },
  buretteUncertaintyMl: 0.05,
  sensorModel: 'GPS_BTA',
  sensorInternalMl: null,
  syringeMl: 20,
  syringeAreaCm2: 2.87,
  frictionStaticN: 3,
  frictionKineticN: 2.2,
  plungerDampingNsPerM: 300,
  handStiffnessNPerM: 40000,
  handMaxN: 60,
  syringeHeatWPerK: 0.0092,
  complianceMlPerKPa: 0.0005,
  syringeLeakLoose: 2e-8,
  syringeLeakSeal: 6e-9,
  allowSensorDamage: false,
  replicates: 2,
};
