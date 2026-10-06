/**
 * Parámetros de la Práctica 6 (configurables por el docente, §29). Las conductancias se ajustaron para que:
 * el baño hierva en 6–9 min con la plantilla a media potencia; el metal llegue a < 1 °C del baño en 10 min;
 * con agitación el máximo del calorímetro aparezca en ≈ 1 min; y una lectura tardía pierda > 0,15 °C en ≈ 3 min.
 */
import type { P6Params } from '../../simulation/calorimetry-world/types';
import { DEFAULT_TRIPLE_BEAM } from '../../simulation/instruments/triple-beam';

export const DEFAULT_P6_PARAMS: P6Params = {
  dtS: 0.05,
  ambientC: 23,
  pressureKPa: 101.325,
  model: 'REALISTIC',
  cpModel: 'CONSTANT',
  balance: { ...DEFAULT_TRIPLE_BEAM },
  cylinderUncertaintyMl: 0.5,
  thermometer: { timeConstantS: 5, resolutionC: 0.1, uncertaintyC: 0.1 },
  cupHeatCapJPerC: 18,
  cupWaterGWPerC: 1.5,
  cupAmbientWPerC: 0.04,
  waterAmbientLidClosedWPerC: 0.08,
  waterAmbientLidOpenWPerC: 0.3,
  metalWaterBaseWPerC: 0.6,
  metalWaterStirWPerC: 3,
  mixBaseWPerC: 0.6,
  mixStirWPerC: 12,
  bottomFraction: 0.35,
  plateMaxW: 800,
  plateMaxC: 400,
  plateHeatCapJPerC: 1500,
  plateAirWPerC: 1.2,
  plateBeakerWPerC: 5,
  beakerAirWPerC: 0.9,
  tubeBathWPerC: 0.9,
  tubeAirWPerC: 0.06,
  metalTubeWPerC: 0.09,
  metalTubeWetWPerC: 0.6,
  tubeLengthCm: 15,
  tubeAreaCm2: 2.5,
  targetWaterMl: 50,
  targetMetalG: 25,
  minSoakS: 600,
  unknownMetal: 'Cu',
  sampleDispersion: 0.5,
  unknownCode: 'X-00',
  bombEnabled: true,
  bombProfile: 'GENERIC_A',
  bombFood: 'peanut',
};
