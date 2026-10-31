/**
 * Parámetros de la práctica B09 (§7). Los del microscopio y el montaje son LOS DE B06 (mismo equipo, sin duplicar su
 * física); aquí van los de corte, Wiesner y morfometría, y el mapa que traduce los catálogos anteriores a TV-NN. Ningún valor
 * sale del PDF ni está calibrado: son escenarios didácticos (TV-DEC-06) con marca `hypothetical`.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import { CODE_MAP_B06, DEFAULT_B06_PARAMS } from '../practice-b06/params';

export const CALIBRATION_B09: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  section: { source: 'Objetivo 80 µm y máximo 150 µm (§7); no es un grosor histológico universal', status: 'hypothetical' },
  integrity: { source: 'Índice de integridad del gesto; umbral 0,70 (§7), sin medición de tejido real', status: 'hypothetical' },
  wiesner: { source: 'Contacto de referencia 60 s (§7): ventana ilustrativa; SOURCE_REQUIRED antes de una evaluación formal', status: 'hypothetical' },
  scale: { source: 'Escala µm/px derivada del campo (FN 18 mm) sobre 1000 px; u = 2,5 % y 2 px (§7)', status: 'hypothetical' },
};

/** Lo que B09 conserva de los catálogos anteriores; el resto queda en `''` (no es un error aquí o lo cubre otra regla). */
const KEPT: Record<string, string> = {
  E68: 'TV-63', E01: 'TV-15', CEL10: 'TV-15', CEL08: 'TV-16', E03: 'TV-16', CEL07: 'TV-17', E06: 'TV-19', CEL18: 'TV-19', E11: 'TV-66', E07: 'TV-23', CEL19: 'TV-23', E42: 'TV-21', E43: 'TV-21', CEL57: 'TV-21',
  E15: 'TV-31', E16: 'TV-32', E18: 'TV-33', E20: 'TV-34', E21: 'TV-34', E69: 'TV-34', E79: 'TV-34', E22: 'TV-35', E70: 'TV-35', E35: 'TV-36', E36: 'TV-36', E26: 'TV-37', E27: 'TV-37', E29: 'TV-37', E28: 'TV-38', E30: 'TV-38',
  E32: 'TV-39', E17: 'TV-41', E39: 'TV-42', E40: 'TV-43', E44: 'TV-49', E45: 'TV-50', 'CEL-027': 'TV-51', 'CEL-053': 'TV-51', 'CEL-008': 'TV-67', E65: 'TV-68', 'CEL-038': 'TV-68', E66: 'TV-71', E67: 'TV-72', E64: 'TV-72',
  E50: 'TV-06', E83: 'TV-07',
};
const CEL_0NN = Array.from({ length: 75 }, (_, i) => `CEL-${String(i + 1).padStart(3, '0')}`);

export const CODE_MAP_B09: Record<string, string> = {
  ...Object.fromEntries([...Object.keys(CODE_MAP_B06), ...CEL_0NN].map((k) => [k, ''])),
  ...KEPT,
};

export const DEFAULT_B09_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B06_PARAMS),
  codeMap: CODE_MAP_B09,
  ppeRequired: ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'],
  // Una sección a mano útil es mucho más fina que los raspados de B02: sus umbrales son los de esta práctica.
  cellPrep: {
    ...structuredClone(DEFAULT_B06_PARAMS.cellPrep!),
    targetThicknessMm: 0.08,
    thickMaxMm: 0.15,
    tearMax: 0.3,
  },
  div: {
    ...structuredClone(DEFAULT_B06_PARAMS.div!),
    scaleRelU: 0.025,
    pointUPx: 2,
  },
  plant: {
    freshSectionTargetUm: 80,
    sectionUsableMaxUm: 150,
    sectionFragileMinUm: 20,
    minSectionIntegrity: 0.7,
    crushPressure01: 0.7,
    cutLossFraction: 1 / 3,
    wiesnerMinS: 30,
    wiesnerMaxS: 180,
    reagentDropMl: 0.05,
    rinseMaxMl: 0.6,
    coverDeformForce01: 0.45,
    measurementPixelUncertainty: 2,
    defaultScaleRelativeUncertainty: 0.025,
  },
};
