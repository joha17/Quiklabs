/**
 * Parámetros de la práctica B06 (§7). Los del microscopio, el montaje y la preparación son LOS DE B01/B02 (mismo
 * equipo, sin duplicar su física); aquí se agregan los de protistas vivos, aceite de inmersión, morfometría y Wright, y
 * el mapa que traduce los catálogos de B01 y B02 a los códigos CEL-0NN. Valores `pending`/`hypothetical`: el modelo de
 * motilidad es una PREDICCIÓN didáctica sin coeficientes medidos (PCEL-11), nunca evidencia.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import { CALIBRATION_B02, DEFAULT_B02_PARAMS } from '../practice-b02/params';

export const CALIBRATION_B06: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  ...CALIBRATION_B02,
  fieldNumberMm: { source: 'Caso didáctico de prueba de la guía (FN = 18 mm); sin ficha del ocular real', status: 'hypothetical' },
  immersionOil: { source: 'Gota de aceite de inmersión y exceso que escurre, propuesta sin ficha del fabricante', status: 'pending' },
  scale: { source: 'Escala µm/px derivada del campo visual (FN/objetivo) sobre 1000 px; incertidumbre relativa 2 % (0,5 % con micrómetro)', status: 'hypothetical' },
  motility: { source: 'Velocidades de referencia y viscosidad de metilcelulosa ilustrativas; sin video calibrado (PCEL-11)', status: 'hypothetical' },
  viability: { source: 'Pérdida de viabilidad por secado, nigrosina, Lugol y lámpara: modelo cualitativo', status: 'hypothetical' },
  wright: { source: 'Tiempos mínimos de colorante y tampón de un protocolo escolar de Wright', status: 'pending' },
};

/** Catálogo de B01 → CEL-0NN (§9). `''`: el hecho no es un error en B06 o lo cubre otra regla. */
const FROM_B01: Record<string, string> = {
  E01: 'CEL-013', E02: '', E03: '', E04: '', E05: '', E06: 'CEL-014', E07: 'CEL-015', E08: '', E09: 'CEL-016', E10: 'CEL-016', E11: 'CEL-017', E12: '',
  E13: '', E14: '', E15: 'CEL-023', E16: 'CEL-024', E17: '', E18: 'CEL-025', E19: 'CEL-030', E20: 'CEL-028', E21: 'CEL-028', E22: '', E23: '',
  E24: 'CEL-009', E25: 'CEL-009', E26: 'CEL-031', E27: '', E28: '', E29: 'CEL-033', E30: 'CEL-032', E31: '', E32: 'CEL-034', E33: '', E34: '',
  E35: 'CEL-035', E36: 'CEL-035', E37: '', E38: '', E39: 'CEL-036', E40: 'CEL-050', E41: '', E42: 'CEL-019', E43: 'CEL-019', E44: '', E45: 'CEL-052',
  E46: '', E47: '', E48: '', E49: '', E50: '', E51: '', E52: '', E53: '', E54: '', E55: '', E56: '', E57: '', E58: '', E59: '', E60: '', E61: '',
  E62: '', E63: '', E64: '', E65: 'CEL-038', E66: '', E67: 'CEL-010', E68: 'CEL-001', E69: 'CEL-028', E70: 'CEL-028', E71: 'CEL-030', E72: '',
  E73: '', E74: 'CEL-009', E77: '', E78: '', E79: 'CEL-028', E83: '',
};

/** Catálogo de B02 (gestos de tejido y tinción que reutiliza B06) → CEL-0NN. */
const FROM_B02: Record<string, string> = {
  ...Object.fromEntries(Array.from({ length: 68 }, (_, i) => [`CEL${String(i + 1).padStart(2, '0')}`, ''])),
  CEL01: 'CEL-011', CEL08: 'CEL-012', CEL12: 'CEL-018', CEL14: 'CEL-016', CEL16: 'CEL-017', CEL18: 'CEL-014', CEL19: 'CEL-015', CEL57: 'CEL-019',
  CEL60: 'CEL-008',
};

export const CODE_MAP_B06: Record<string, string> = { ...FROM_B01, ...FROM_B02 };

export const DEFAULT_B06_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B02_PARAMS),
  requiredMagnifications: 2,
  codeMap: CODE_MAP_B06,
  div: {
    oilDropMl: 0.02,
    oilMinMl: 0.015,
    oilMaxMl: 0.06,
    imagePx: 1000,
    scaleRelU: 0.02,
    scaleRelUTraceable: 0.005,
    pointUPx: 2,
    speedUmS: { euglena: 60, paramecium: 900 },
    mcViscosityK: 30,
    mcMaxFraction: 0.6,
    exposureS: 1 / 30,
    blurFovFraction: 0.01,
    dryLossPerS: 0.05,
    nigrosinLossPerS: 0.01,
    lampHotLight01: 0.9,
    lampHotS: 180,
    lampLossPerS: 0.01,
    immobileBelow: 0.3,
    lugolKillS: 5,
    coverDragCm: 0.25,
    wrightMinS: 60,
    bufferMinS: 60,
    stainDropMl: 0.05,
  },
};
