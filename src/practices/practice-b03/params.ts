/**
 * Parámetros de la práctica B03 (§7.1). El microscopio, el montaje húmedo y la preparación de Elodea son LOS DE B02
 * (mismo equipo, sin duplicar su física); aquí se agregan las membranas, las cámaras, los ensayos y la respuesta
 * osmótica de Elodea, y el mapa que traduce los catálogos de B01/B02 a los códigos PERM. Valores de software
 * `pending`/`hypothetical` (§8: casos computacionales), no medidas de un material real.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import type { PermParams } from '../../simulation/perm-world/types';
import { molarityFromWv } from '../../simulation/membrane-transport/model';
import { CALIBRATION_B02, DEFAULT_B02_PARAMS } from '../practice-b02/params';

export const CALIBRATION_B03: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  ...CALIBRATION_B02,
  permeability: { source: 'P = 0,005 cm/s de la prueba aritmética §7.1; no representa un celofán comercial', status: 'hypothetical' },
  lp: { source: 'Lp = 1e-7 mL·s⁻¹·cm⁻²·kPa⁻¹ de la prueba numérica §7.1', status: 'hypothetical' },
  syrupOsm: { source: 'Osmolaridad del jarabe asignada por el docente (sin ficha: modo curricular)', status: 'pending' },
  elodeaInner: { source: 'Osmolaridad interna efectiva de Elodea configurada por el docente (sin valor universal)', status: 'pending' },
  biuretDelay: { source: 'Tiempo de desarrollo del complejo de Biuret, pendiente de ficha técnica', status: 'pending' },
  naclMolar: { source: 'M(NaCl) = 58,44 g/mol, cálculo escolar (REF-01/REF-02)', status: 'verified' },
};

/** Concentraciones de los frascos (mmol/mL; la proteína en mg/mL). */
export const STOCKS = {
  tracer: 0.05,
  eggProteinMgMl: 100,
  nacl5: molarityFromWv(5),
  nacl09: molarityFromWv(0.9),
  syrupOsm: 2.0,
  syrupLowOsm: 0.25,
  syrupConcOsm: 3.5,
  lightSyrupOsm: 0.6,
  silverMmolMl: 0.1,
} as const;

/**
 * Catálogo de B01/B02 → PERM (§9). `''`: el hecho no es un error en B03 (lo cubre otra regla o no aplica). Los gestos
 * con membranas, cámaras y tubos emiten sus PERM directamente desde el mundo de transporte.
 */
const MAPPED: Record<string, string> = {
  E06: 'PERM49', E07: 'PERM48', E09: 'PERM50', E10: 'PERM50', E11: 'PERM50', E15: 'PERM51', E18: 'PERM52', E21: 'PERM53',
  E20: 'PERM54', E22: 'PERM54', E69: 'PERM54', E70: 'PERM54', E79: 'PERM54', E32: 'PERM55', E26: 'PERM56', E27: 'PERM56', E28: 'PERM56', E29: 'PERM56',
  E30: 'PERM56', E66: 'PERM59', E68: 'PPE', CEL14: 'PERM50', CEL16: 'PERM50', CEL18: 'PERM49', CEL19: 'PERM48',
};
export const CODE_MAP_B03: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`E${String(i + 1).padStart(2, '0')}`, ''])),
  ...Object.fromEntries(Array.from({ length: 68 }, (_, i) => [`CEL${String(i + 1).padStart(2, '0')}`, ''])),
  ...MAPPED,
};

export const DEFAULT_PERM_PARAMS: PermParams = {
  temperatureK: 298.15,
  materials: {
    dialysis: { validated: true, p: { salt: 0.005, tracer: 0.006, glucose: 0.0008, protein: 0 }, lp: 1e-7, needsPreWet: true, tearTurns: 3 },
    dialysisWide: { validated: true, p: { salt: 0.006, tracer: 0.005, glucose: 0.002, protein: 0.0012 }, lp: 1.5e-7, needsPreWet: true, tearTurns: 3 },
    cellophane: { validated: false, p: { salt: 0.003, tracer: 0.002, glucose: 0.0004, protein: 0 }, lp: 0.6e-7, needsPreWet: false, tearTurns: 2.5 },
    film: { validated: true, p: { salt: 0, tracer: 0, glucose: 0, protein: 0 }, lp: 0, needsPreWet: false, tearTurns: 3.5 },
  },
  tornP: 0.05,
  tornLp: 2e-6,
  sealTurns: 1.5,
  leakMaxMlS: 0.05,
  dripFraction: 0.5,
  centerTolCm: 0.6,
  cells: {
    c1: { windowCm2: 10, capacityMl: 30, columnCm2A: 5, columnCm2B: 5 },
    c2: { windowCm2: 10, capacityMl: 30, columnCm2A: 5, columnCm2B: 5 },
    c3: { windowCm2: 10, capacityMl: 40, columnCm2A: 3, columnCm2B: 3 },
  },
  wetPerS: 0.02,
  wetMin: 0.6,
  pourMaxMlS: { bottle: 6, cylinder: 4, cell: 0 },
  pourMinTiltDeg: 35,
  dropMl: 0.05,
  pipetteCapMl: 5,
  pipetteFilmMl: 0.02,
  readRes: { cylinder: 0.5, column: 0.2, thermo: 0.5 },
  parallaxMlPerDeg: 0.03,
  eyeTolDeg: 8,
  tracer: { nominalMl: 5, levels: [0.0003, 0.0015, 0.004, 0.009], epsilon: 40, pathCm: 1, t0WindowS: 15 },
  assay: { biuretDelayS: 120, biuretMinMgMl: 1, aggVisibleMmol: 0.002, aliquotMinMl: 1, aliquotMaxMl: 3 },
  osmosis: { syrupNominalMl: 20, waterNominalMl: 20, incubationS: 1200, tolMl: 2 },
  dialysis: { eggNominalMl: 10, saltNominalMl: 5, minProteinMg: 300, tolFrac: 0.3, incubationS: 1200 },
  leakTestS: 20,
  evapMlS: 0.0006,
  lidOpenMaxS: 60,
  elodea: { innerOsm: 0.35, nonOsmotic: 0.25, tauS: 40, incipientBelow: 0.95, plasmolyzedBelow: 0.75, leafOutMaxS: 90 },
  slosh: { mix: 0.8, fill: 0.85 },
  salineOsm: { water: 0, 'nacl-0.9': 2 * STOCKS.nacl09, 'nacl-5': 2 * STOCKS.nacl5 },
};

export const DEFAULT_B03_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B02_PARAMS),
  // Tres montajes de Elodea (agua, NaCl 0,9 %, NaCl 5 %) a bajo y alto aumento.
  requiredMagnifications: 2,
  // AgNO₃ (mancha y es corrosivo) y Biuret (alcalino): guantes además del EPP de B01/B02.
  ppeRequired: ['coat', 'shoes', 'hair', 'hands', 'gloves'],
  codeMap: CODE_MAP_B03,
  perm: structuredClone(DEFAULT_PERM_PARAMS),
};
