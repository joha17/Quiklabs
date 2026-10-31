/**
 * Parámetros de la práctica B07 (§7). Los del microscopio son LOS DE B06 (mismo equipo, sin duplicar su física); aquí van
 * los de frotis, tinción, trazado y visor, y el mapa que traduce los catálogos anteriores a MIC-NN. Todos los índices son
 * ADIMENSIONALES y didácticos (PMIC-07): no son tiempos ni condiciones de un laboratorio real.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import { CODE_MAP_B06, DEFAULT_B06_PARAMS } from '../practice-b06/params';
import { PLATE_IMAGE_PX, PLATE_MM_PER_PX } from '../../simulation/micro-world/model';

export const CALIBRATION_B07: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  retention: { source: 'R₊ y R₋ de §3.2: índice de diseño; no predice un ensayo real', status: 'hypothetical' },
  plateScale: { source: 'Imagen de placa: Ø 90 mm a 0,025 mm/px; u = 2 px (§8)', status: 'hypothetical' },
  streak: { source: 'Solapamiento geométrico por celdas de 0,25 cm; umbral 0,20 (§7)', status: 'hypothetical' },
  smear: { source: 'Cobertura válida 0,15–0,60 (§7); secado virtual sin equivalencia real', status: 'hypothetical' },
};

/** Lo que B07 conserva de los catálogos anteriores; el resto queda en `''` (no es un error aquí o lo cubre otra regla). */
const KEPT: Record<string, string> = {
  E68: 'MIC-57', E15: 'MIC-41', E18: 'MIC-42', E20: 'MIC-43', E21: 'MIC-43', E69: 'MIC-43', E70: 'MIC-43', E79: 'MIC-43', E28: 'MIC-47', E33: 'MIC-46', E42: 'MIC-31', E43: 'MIC-31',
  'CEL-029': 'MIC-43', 'CEL-026': 'MIC-44', 'CEL-027': 'MIC-45', 'CEL-053': 'MIC-45', 'CEL-003': 'MIC-29', 'CEL-051': 'MIC-29', 'CEL-059': 'MIC-48', 'CEL-008': 'MIC-61',
};
const CEL_0NN = Array.from({ length: 75 }, (_, i) => `CEL-${String(i + 1).padStart(3, '0')}`);

export const CODE_MAP_B07: Record<string, string> = {
  ...Object.fromEntries([...Object.keys(CODE_MAP_B06), ...CEL_0NN].map((k) => [k, ''])),
  ...KEPT,
};

export const DEFAULT_B07_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B06_PARAMS),
  codeMap: CODE_MAP_B07,
  micro: {
    stainDropMl: 0.05,
    washMl: 0.2,
    streakOverlapThreshold: 0.2,
    coverageMin: 0.15,
    coverageMax: 0.6,
    decolorOverU: 1.5,
    retentionViolet: 0.5,
    dryVirtualS: 6,
    mmPerPx: PLATE_MM_PER_PX,
    uPx: 2,
    uScaleMmPerPx: 0,
    imagePx: PLATE_IMAGE_PX,
  },
};
