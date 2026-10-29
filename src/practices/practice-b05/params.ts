/**
 * Parámetros de la práctica B05 (§7). El microscopio y el montaje húmedo de papa con Lugol son LOS DE B02 (mismo
 * equipo, sin duplicar su física); aquí se agregan las preparaciones P1–P3, la catalasa con su colector, la amilasa con
 * Lugol y Benedict, los baños y el módulo ADH, y el mapa que traduce los catálogos de B01/B02 a los códigos B05. Las
 * constantes cinéticas son valores de software `pending` (§7: «no presentar como medición publicada»); las cantidades
 * de P1–P3, la prueba de 12,23 mL y ε340 son las de la solicitud.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import type { EnzParams } from '../../simulation/enz-world/types';
import { CALIBRATION_B02, DEFAULT_B02_PARAMS } from '../practice-b02/params';

export const CALIBRATION_B05: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  ...CALIBRATION_B02,
  prepQuantities: { source: '25,0 g/100,0 mL (P1), 25,0 mL + hígado (P2), 0,20 g/5,0 mL (P3): valores de la solicitud §5', status: 'verified' },
  gasLaw: { source: 'PV = nRT con R = 8,314462618 J·mol⁻¹·K⁻¹ (prueba §8.1: 12,23 mL)', status: 'verified' },
  epsilon340: { source: 'ε340(NADH) = 6220 L·mol⁻¹·cm⁻¹, referencia convencional (§7)', status: 'verified' },
  liverMass: { source: 'Masa de hígado de P2: pendiente de fijar por el docente (§7, «no inventar cantidad»); 1,0 g de software', status: 'pending' },
  catalaseKinetics: { source: 'kcat, Km, óptimos y desnaturalización de la catalasa: software, calibrar por lote (§7)', status: 'pending' },
  amylaseKinetics: { source: 'Modelo aparente almidón → dextrinas → azúcares; actividad por gramo del producto sin ficha', status: 'pending' },
  starchAccess: { source: 'Fracción accesible del almidón a ~30 °C (suspensión, no disolución: regla P1)', status: 'hypothetical' },
  indicators: { source: 'Umbrales de color de Lugol y Benedict: escala didáctica sin colorimetría', status: 'pending' },
  adhKinetics: { source: 'Km/Ki de la ADH y del metanol: conjunto bloqueado hasta validación (§7)', status: 'hypothetical' },
  collector: { source: 'Colector 0–50 mL, división 0,5 mL, eficiencia didáctica 0,95 (§4, §7)', status: 'pending' },
};

/** Concentraciones de los frascos (mmol/mL salvo indicación). */
export const STOCKS_B05 = {
  h2o2: 0.1,
  h2o2Old: 0.06,
  /** Almidón soluble del docente (st1): ~1 % m/v en glucosilos (otra concentración, A03). */
  starchSoluble: 0.06,
  lugolI2: 0.04,
  hcl: 1,
  naoh: 1,
  nad: 0.01,
  ethanol: 0.03,
  ethanol2: 0.06,
  methanol: 0.5,
  pigmentStarch: 0.01,
} as const;

/** Catálogo de B01/B02 → B05 (§9): los errores del microscopio y del montaje de papa pasan a MIC; el resto no aplica. */
const MAPPED: Record<string, string> = {
  E06: 'MIC01', E07: 'MIC01', CEL18: 'MIC01', CEL19: 'MIC01',
  E09: 'MIC02', E10: 'MIC02', E11: 'MIC02', CEL14: 'MIC02', CEL16: 'MIC02',
  E15: 'MIC03',
  E18: 'MIC04', E20: 'MIC04', E22: 'MIC04', E69: 'MIC04', E70: 'MIC04', E79: 'MIC04',
  E21: 'MIC05',
  E66: 'MIC06',
  E68: 'M12',
};
export const CODE_MAP_B05: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`E${String(i + 1).padStart(2, '0')}`, ''])),
  ...Object.fromEntries(Array.from({ length: 68 }, (_, i) => [`CEL${String(i + 1).padStart(2, '0')}`, ''])),
  ...MAPPED,
};

export const DEFAULT_ENZ_PARAMS: EnzParams = {
  ambientK: 298.15,
  pressureKPa: 101.325,
  catalase: { kcatPerU: 1e-3, km: 0.03, tOptK: 310.15, tWidthK: 25, pHOpt: 7, pHWidth: 2.5, k0: 1e-4, tDenK: 323.15, tScaleK: 4, kpH: 0.002, pHSafe: 2 },
  amylase: { kcatPerU: 2e-3, km: 0.02, tOptK: 310.15, tWidthK: 20, pHOpt: 6.8, pHWidth: 1.8, k0: 1e-4, tDenK: 328.15, tScaleK: 4, kpH: 0.002, pHSafe: 2 },
  dextrinFactor: 0.6,
  dextrinKm: 0.05,
  solidHydrolysis: 0.5,
  adh: { kcatPerU: 1e-3, kmEtOH: 0.01, kmNad: 1e-4, kmMeOH: 0.05, kiMeOH: 0.01, methanolRel: 0.1 },
  h2o2SpontK: 1e-6,
  o2SatMmolMl: 0.0013,
  supersat: 2,
  collector: { capacityMl: 50, resolutionMl: 0.5, efficiency01: 0.95, sealOk: 0.9, reliefMmol: 0.1 },
  activity: { liverUPerG: 200, lotBFactor: 0.5, liverActive01: 1, preheatedActive01: 0.1, amylaseUPerG: 75, adhUPerMl: 0.05 },
  prep: {
    starchG: 25, starchWaterMl: 100, starchTargetK: 303.15, tolG: 0.5, tolMl: 2, tolK: 2,
    catalaseWaterMl: 25, liverG: 1, amylaseG: 0.2, amylaseWaterMl: 5, amylaseTolG: 0.02, amylaseTolMl: 0.3,
    disperseK: 0.02, settleK: 0.004, extractK: 0.01, dissolveK: 0.05, accessMax: 0.6,
    slipRpmWater: 1400, slipRpmViscous: 900, rpmFull: 600, minStirS: 60, homogReady: 0.85, liverMaxCm: 0.5,
    plateTauSPerMl: 1.5, splashMlS: 0.05,
  },
  bath: { tauS: 120, tubeTauS: 25, stabilityK: 0.5, holdS: 3 },
  lugol: { glucosylPerI2: 40, halfMmolMl: 0.01, dropsMin: 2, dropsMax: 5, dropI2Mmol: 0.002 },
  benedict: { minK: 343.15, k0: 1, scaleK: 10, visibleMmolMl: 0.0005, redMmolMl: 0.008, minS: 120, maxS: 300, squeezeMl: 0.5, cuMmolMl: 0.068, baseMmolMl: 0.3 },
  dropMl: 0.05,
  acidDropsAssigned: 3,
  baseDropsAssigned: 3,
  bufferMmolMl: 0.002,
  stripResolution: 0.5,
  pipettes: { p1: { capMl: 1, filmMl: 0.005 }, p5: { capMl: 5, filmMl: 0.02 }, p10: { capMl: 10, filmMl: 0.03 } },
  bubbleLoss: 0.08,
  pourMaxMlS: 8,
  pourMinTiltDeg: 35,
  readRes: { balance: 0.01, thermo: 0.1, cylinder: 0.2, beaker: 5 },
  parallaxMlPerDeg: 0.02,
  eyeTolDeg: 8,
  catalaseH2O2Ml: 10,
  h2o2M: 0.1,
  catalaseObservationS: 90,
  amylaseIncubationS: 600,
  amylaseSamplingS: [0, 120, 300, 600],
  samplingTolS: 30,
  harmK: 318.15,
  harmMaxS: 60,
  hotTouchK: 323.15,
  uv: { epsilon: 6220, path: { cq: 1, cs: 0.5, cp: 1 }, matrixA: 0.02 },
  competitorMl: 0.1,
  ignitionDistanceCm: 20,
};

export const DEFAULT_B05_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B02_PARAMS),
  // Un montaje de papa con Lugol (gránulos de almidón) a bajo y alto aumento.
  requiredMagnifications: 2,
  // Peróxido, HCl/NaOH y Benedict caliente: guantes además del EPP de B01/B02 (los anteojos de B04 quedan para la unificación, BIO5-09).
  ppeRequired: ['coat', 'shoes', 'hair', 'hands', 'gloves'],
  codeMap: CODE_MAP_B05,
  enz: structuredClone(DEFAULT_ENZ_PARAMS),
};
