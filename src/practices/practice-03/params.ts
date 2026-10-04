/**
 * Constantes del modelo de la Práctica 3 (§6.4, §15.2, §9.6). Todas configurables por el docente;
 * los umbrales son de calibración educativa, no mediciones (ver docs/SUPUESTOS_CIENTIFICOS_P3.md).
 */
import type { Practice3Params } from '../../simulation/flame-world/types';

export const DEFAULT_P3_PARAMS: Practice3Params = {
  dtS: 0.05,
  ambientC: 24,
  nominalMaxFlowMlS: 30,
  intakeEfficiency: 0.3,
  yellowMax: 0.1,
  transitionalMax: 0.35,
  blueMax: 0.85,
  minFlow: 0.035,
  flashbackAirMix: 0.95,
  flashbackMaxFlow: 0.3,
  liftAirMix: 1.1,
  liftMinFlow: 0.3,
  liftHighFlow: 0.88,
  sootShare: 0.06,
  gasWarnMl: 40,
  gasAlarmMl: 100,
  gasBlockMl: 150,
  roomAirMol: 1230,
  coWarnPpm: 35,
  coAlarmPpm: 100,
  coShutdownPpm: 200,
  exposure: 60,
  emissionScale: 2,
  sampleConsumption: 0.7,
  loopRingCapacityMg: 3,
  loopStemCapacityMgPerCm: 6,
  targetFlameCm: 10,
  flameToleranceCm: 1,
  loopMode: 'DEDICATED',
  atomizerEnabled: false,
  ignitionOrder: 'GUIDE',
};
