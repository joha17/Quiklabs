/**
 * Constantes del modelo (configurables, §16). Cada una está justificada en docs/SUPUESTOS_CIENTIFICOS.md.
 * Se copian dentro del intento guardado para que un intento sea reproducible aunque la configuración cambie.
 */
import type { SimParams } from '../../simulation/entities/types';

export const DEFAULT_PARAMS: SimParams = {
  dtS: 0.05, // paso fijo de 20 Hz (§3.3)
  ambientC: 22,
  relativeHumidity: 0.5,
  spatulaNominalG: 0.1, // §4.2: una espátula = 0,10 g nominal
  spatulaMinG: 0.05,
  spatulaMaxG: 0.2,
  spatulaResidueG: 0.004, // polvo que queda adherido si no se limpia (contaminación cruzada A2)
  dropMl: 0.05, // §4.2: una gota = 0,05 mL
  reagentPurity: 0.985, // KNO₃ grado técnico: 1,5 % de sales solubles inertes
  oilProfile: 'OIL_VEG', // §2: aceite vegetal por defecto
  hotplateMaxC: 320,
  hotplateTauS: 45,
  latentJPerG: 2257,
  fusionJPerG: 334,
  cpWater: 4.18,
  evapK: 2.7e-7, // g·s⁻¹·cm⁻²·mmHg⁻¹ (≈0,12 g/min a 90 °C en un vaso de 50 mL)
  coverEvapFactor: 0.6,
  coverSplashFactor: 0.2,
  restDissolveFactor: 0.12, // sin agitar la disolución es ~8 veces más lenta
  dissolveTempScaleC: 30,
  ebullioscopicK: 0.512,
  maxBoilingElevationC: 12,
  filter: {
    baseK: 0.07,
    holdupBaseMl: 0.6,
    holdupPerGSolidMl: 0.9,
    efficiencyOk: 0.997,
    efficiencyDry: 0.97,
    efficiencyBadFold: 0.93,
    efficiencyTorn: 0.55,
    bypassDry: 0.04,
    bypassBadFold: 0.08,
    bypassTorn: 0.35,
    coneCapacityMl: 6,
    funnelCapacityMl: 14,
    tearRateThresholdMlS: 2.5,
    splashNoWallFrac: 0.02,
  },
  crystal: {
    growthK: 0.03,
    baseDelayMinS: 25,
    baseDelayMaxS: 70,
    scrapeBoost: 30,
    agitationBoost: 2,
    minPurity: 0.975,
    maxPurity: 0.996,
  },
  safety: {
    hotTouchC: 60,
    dryWaterFraction: 0.15,
    dryCarbonMinG: 0.005,
    emptyHeatLimitS: 60,
    overheatIncidentC: 260,
    discolorC: 230,
    majorSpillMl: 5,
    thermalShockDeltaC: 45,
  },
  bathOverflowLevelCm: 4.6,
  adheredFilmMl: 0.05,
};
