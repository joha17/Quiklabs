/**
 * Parámetros de la práctica B04 (§7.1). El microscopio y la caja de láminas son LOS DE B02 (mismo equipo, sin
 * duplicar su física); aquí se agregan la química de los ensayos, las enzimas, las preparaciones con placa y barra
 * magnética, los baños y el mapa que traduce los catálogos de B01/B02 a los códigos de B04. Las cantidades de las
 * preparaciones son las PEDIDAS (25,0 g + 100,0 mL; 25,0 mL; 0,20 g + 5,0 mL); el resto son valores de software
 * `PENDING_CALIBRATION` que permiten probar el integrador, no medidas de un reactivo o tejido real.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import type { BioParams } from '../../simulation/bio-world/types';
import { CALIBRATION_B02, DEFAULT_B02_PARAMS } from '../practice-b02/params';

export const CALIBRATION_B04: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  ...CALIBRATION_B02,
  prepQuantities: { source: 'Cantidades pedidas por el usuario: 25,0 g/100,0 mL a 303,15 K; hígado + 25,0 mL sin calor; 0,20 g/5,0 mL', status: 'verified' },
  gasLaw: { source: 'PV = nRT con R = 8,314462618 J·mol⁻¹·K⁻¹ (§8.1: 1 mmol O₂ a 298,15 K y 101 325 Pa → 24,47 mL)', status: 'verified' },
  glucosylMass: { source: 'M(C₆H₁₀O₅) = 162,14 g/mol por unidad glucosilo', status: 'verified' },
  catalaseKinetics: { source: 'kcat, Km y desnaturalización de software; pendiente de fuente bioquímica y lote de hígado', status: 'pending' },
  amylaseKinetics: { source: 'Vmax por masa del producto comercial y Km de software; pendiente de ficha del lote', status: 'pending' },
  assayResponse: { source: 'Umbrales de color y LOD de Lugol, Biuret, Benedict y emulsión de software; pendientes de patrones', status: 'pending' },
  liverMass: { source: 'Masa de hígado fijada por el docente (el usuario no fijó gramaje): 5,0 g de software', status: 'pending' },
  adh: { source: 'Módulo ADH cerrado; cinética y ε(NADH, 340 nm) = 6220 L·mol⁻¹·cm⁻¹ (literatura escolar), resto pendiente', status: 'pending' },
  feulgenWindow: { source: 'Tiempos de fijación, hidrólisis y Schiff comprimidos para la simulación; no son un protocolo presencial', status: 'hypothetical' },
};

/** Concentraciones de los lotes (por mL; proteína y lípido en mg, glúcidos en mmol de glucosilo, enzimas en U). */
export const LOTS = {
  egg: { proteinMg: 12, buf: 0.04 },
  milk: { proteinMg: 33, lactose: 0.14, lipidMg: 35, turbid: 1.2, buf: 0.05 },
  gelatin: { proteinMg: 20, buf: 0.02 },
  potato: { starch: 0.05, starchSolid: 0.02, catAct: 0.6, pigment: 0.05, turbid: 0.4, buf: 0.02 },
  oil: { lipidMg: 900 },
  glucose: { glucose: 0.05 },
  proteinStd: { proteinMg: 10, buf: 0.04 },
  peroxide: { h2o2: 0.88 },
  benedictCu: 0.069,
  lugolIodine: 0.04,
  naoh: 2.5,
  cuso4: 0.04,
  hcl: 0.1,
  buffer: 0.2,
  adh: { ethanol: 0.5, nad: 0.002, enzyme: 0.05, methanol: 0.5 },
} as const;

/**
 * Catálogo de B01/B02 → B04 (§9). `''`: el hecho no es un error en B04. El microscopio compartido conserva sus reglas
 * y se traduce a F05–F08 y S06; los gestos bioquímicos emiten sus códigos directamente desde el mundo.
 */
const MAPPED: Record<string, string> = {
  E40: 'F05', E16: 'F06', E18: 'F07', E36: 'F08', E26: 'F08', E27: 'F08', E28: 'F08', E29: 'F08', E30: 'F08', E31: 'F08', E35: 'F08',
  E39: 'S06', E21: 'S06', E20: 'S06', E22: 'S06', E69: 'S06', E70: 'S06', E79: 'S06', E68: 'PPE',
};
export const CODE_MAP_B04: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`E${String(i + 1).padStart(2, '0')}`, ''])),
  ...Object.fromEntries(Array.from({ length: 68 }, (_, i) => [`CEL${String(i + 1).padStart(2, '0')}`, ''])),
  ...MAPPED,
  // Emulsión: el mundo emite EMU01–EMU06 porque E01–E90 son del catálogo de B01.
  ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`EMU0${i + 1}`, `E0${i + 1}`])),
};

export const DEFAULT_BIO_PARAMS: BioParams = {
  ambientK: 298.15,
  pressurePa: 101325,
  assay: {
    iodinePerGlucosyl: 20,
    lugolHalfMmolMl: 0.004,
    biuretMinPH: 11,
    biuretLodMgMl: 1,
    biuretHalfMgMl: 3,
    biuretCuMaxMmolMl: 0.006,
    biuretDelayS: 60,
    benedictK0: 0.6,
    benedictScaleK: 10,
    benedictMinK: 333.15,
    benedictVisible: 0.0006,
    benedictRed: 0.01,
    dextrinReducing: 0.02,
    ethanolMinFrac: 0.5,
    extractPerS: 0.08,
    emulsionVisibleMgMl: 0.6,
    emulsionLifeS: 900,
  },
  catalase: { kcatPerU: 1e-3, km: 0.1, tOptK: 310, tWidthK: 18, pHOpt: 7, pHWidth: 3, k0: 6.8e-5, tDenK: 333, tScaleK: 6, kpH: 0.002, pHSafe: 3 },
  amylase: { kcatPerU: 1e-3, km: 0.01, tOptK: 310, tWidthK: 15, pHOpt: 6.8, pHWidth: 2.5, k0: 5.8e-4, tDenK: 328, tScaleK: 5, kpH: 0.001, pHSafe: 2.5 },
  adh: { kcatPerU: 1e-3, kmEtOH: 0.02, kmNad: 0.0002, kiMeOH: 0.03 },
  amyDextrinToMaltose: 0.7,
  prep: {
    starchG: 25, starchWaterMl: 100, starchTargetK: 303.15, tolG: 1, tolMl: 4, tolK: 1.5,
    catalaseWaterMl: 25, liverG: 5, amylaseG: 0.2, amylaseWaterMl: 5, amylaseTolG: 0.02, amylaseTolMl: 0.5,
    disperseK: 0.02, settleK: 0.004, extractK: 0.02, dissolveK: 0.05,
    rpmFull: 600, slipRpmWater: 1100, slipRpmViscous: 800, minStirS: 120, homogReady: 0.8,
    liverMaxCm: 0.8,
    plateW: 300, plateUA: 1.5, plateC: 800, liquidUA: 0.25,
  },
  activity: { liverUPerG: 25, potatoUPerMl: 0.6, amylaseUPerG: 150, adhU: 0.05 },
  bath: { powerW: 1000, heatCapJPerK: 6000, lossUA: 2, tubeUA: 0.35, airUA: 0.03 },
  tubeGlassJPerK: 6,
  pipetteCapMl: 5,
  pipetteFilmMl: 0.02,
  pipetteOffsetMl: 0.06,
  volumetricMl: 2,
  dropMl: 0.05,
  pourMaxMlS: 6,
  pourMinTiltDeg: 35,
  readRes: { balance: 0.01, thermo: 0.5, cylinder: 1, ph: 0.5 },
  parallaxMlPerDeg: 0.03,
  eyeTolDeg: 8,
  benedictMinS: 90,
  benedictMaxS: 600,
  hotTouchK: 323.15,
  readHotK: 323.15,
  incubationS: 600,
  amylaseTempMaxK: 318.15,
  emulsionReadMaxS: 600,
  mixReadyS: 3,
  catalaseH2O2Ml: 2,
  tubeHeadroomMl: 3,
  feulgen: { fixMinS: 60, hydroMinS: 240, hydroMaxS: 600, washMinS: 30, schiffMinS: 180 },
  photometerOffset: 0.08,
  epsilonNadh: 6220,
};

export const DEFAULT_B04_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B02_PARAMS),
  // Una lámina de Feulgen a bajo y alto aumento.
  requiredMagnifications: 2,
  // Reactivos cáusticos (NaOH), sales de cobre, yodo y etanol: guantes y gafas además del EPP de B01/B02.
  ppeRequired: ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'],
  codeMap: CODE_MAP_B04,
  bio: structuredClone(DEFAULT_BIO_PARAMS),
};
