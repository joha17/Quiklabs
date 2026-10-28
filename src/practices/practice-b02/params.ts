/**
 * Parámetros de la práctica B02 (§7.1). Los del microscopio, el estereoscopio y el montaje son LOS DE B01 (mismo
 * equipo, sin duplicar su física); aquí se agregan los de corte, raspado, frotis y tinción, y el mapa que traduce el
 * catálogo de errores de B01 a los códigos CEL. Valores de software `pending`/`hypothetical`, no medidas científicas.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import { CALIBRATION_B01, DEFAULT_B01_PARAMS } from '../practice-b01/params';

export const CALIBRATION_B02: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  ...CALIBRATION_B01,
  thickness: { source: 'Espesor útil de un corte a mano alzada, propuesta didáctica sin medición', status: 'pending' },
  scrape: { source: 'Modelo cualitativo de raspado (distancia y presión)', status: 'pending' },
  smear: { source: 'Densidad relativa del extendido, sin conteos celulares', status: 'pending' },
  lugol: { source: 'Contacto mínimo y volumen de saturación ilustrativos (sin ficha del reactivo)', status: 'pending' },
  dropper: { source: 'Gotero virtual sin calibrar (variación del S05)', status: 'pending' },
  biomass: { source: 'Masa didáctica (no medida con balanza)', status: 'hypothetical' },
  objectiveNA: { source: 'Ejemplo §7.1 (0,10 / 0,25 / 0,65; 1,25 típico de un 100X de inmersión) para la prueba de resolución', status: 'hypothetical' },
};

/** Apertura numérica de ejemplo y λ de referencia (§3.2, §8.1): solo para el cálculo de resolución de la libreta. */
export const RESOLUTION_B02 = { lambdaUm: 0.55, na: { 4: 0.1, 10: 0.25, 40: 0.65, 100: 1.25 } as Record<4 | 10 | 40 | 100, number> };

/**
 * Catálogo de B01 → CEL (§9). `''`: el hecho no es un error en B02 (lo cubre otra regla o no aplica). Los gestos de
 * obtención de tejido y la tinción emiten sus CEL directamente desde el mundo celular.
 */
export const CODE_MAP_B02: Record<string, string> = {
  E01: 'CEL09', E02: '', E03: '', E04: '', E05: '', E06: 'CEL18', E07: 'CEL19', E08: '', E09: 'CEL14', E10: 'CEL14', E11: 'CEL16', E12: 'CEL17', E13: '', E14: '',
  E15: 'CEL31', E16: 'CEL32', E17: 'CEL08', E18: 'CEL34', E19: 'CEL39', E20: 'CEL36', E21: 'CEL35', E22: 'CEL36', E23: '', E24: 'CEL37', E25: 'CEL37',
  E26: 'CEL42', E27: 'CEL40', E28: 'CEL41', E29: 'CEL40', E30: 'CEL41', E31: 'CEL63', E32: 'CEL38', E33: 'CEL08', E34: '', E35: 'CEL44', E36: 'CEL53',
  E37: 'CEL53', E38: '', E39: 'CEL45', E40: 'CEL56', E41: '', E42: 'CEL57', E43: 'CEL57', E44: 'CEL58', E45: 'CEL58', E46: '', E47: 'CEL56', E48: '',
  E49: '', E50: 'CEL66', E51: '', E52: 'CEL66', E53: '', E54: '', E55: '', E56: '', E57: '', E58: '', E59: '', E63: 'CEL56', E64: 'CEL61', E65: '',
  E66: '', E67: 'CEL64', E68: 'PPE', E69: 'CEL36', E70: 'CEL36', E71: 'CEL39', E72: '', E73: '', E74: 'CEL43', E77: '', E78: '', E79: 'CEL36', E83: '',
};

export const DEFAULT_B02_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B01_PARAMS),
  // Tres preparaciones frescas por lo menos a dos aumentos (4X para localizar y 40X para los plastidios).
  requiredMagnifications: 2,
  codeMap: CODE_MAP_B02,
  cellPrep: {
    targetThicknessMm: 0.15,
    thickMaxMm: 0.4,
    minAreaMm2: 4,
    densityMgPerMm3: 1,
    scrapeMinCm: 0.8,
    scrapeTearPressure: 0.75,
    swabMinS: 2,
    smearDenseMax: 0.7,
    zoneSepCm: 0.6,
    maxZones: 3,
    coverDragCm: 0.6,
    lugolMinContactS: 20,
    lugolOverMl: 0.11,
    dropJitter: 0.4,
    leafMassMg: 2,
    tearMax: 0.5,
  },
};
