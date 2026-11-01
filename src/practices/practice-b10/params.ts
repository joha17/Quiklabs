/**
 * Parámetros de la práctica B10 (§7). Los del microscopio, el estereoscopio y el montaje son LOS DE B06 (mismo equipo, sin duplicar
 * su física); aquí van los del visor y el mapa que traduce los catálogos anteriores a TA-NN. Son decisiones didácticas, sin
 * medición real detrás, y quedan marcadas `hypothetical` hasta que un docente las revise.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import { TA } from '../../simulation/animal-world/codes';
import { CODE_MAP_B09 } from '../practice-b09/params';
import { DEFAULT_B06_PARAMS } from '../practice-b06/params';

export const CALIBRATION_B10: Record<string, { source: string; status: 'verified' | 'pending' | 'hypothetical' }> = {
  rotation: { source: 'Giro acumulado de 180° para acreditar que se miró el modelo por todos lados (B10-5)', status: 'hypothetical' },
  regionFacing: { source: 'Una región se puede señalar si mira a menos de ~70° de la cámara (B10-5)', status: 'hypothetical' },
  trackLight: { source: 'Barrido de 60° con luz a 55° o menos para acreditar lectura de relieve (B10-6)', status: 'hypothetical' },
  dentition: { source: 'Fórmulas de caballo, vaca, perro y cerdo de los textos de anatomía veterinaria; revisar con el docente', status: 'pending' },
};

/** Lo que B10 conserva de los catálogos anteriores; el resto queda en `''`. */
const KEPT: Record<string, string> = {
  E68: '', E01: TA.DIRTY_SLIDE, E03: TA.MOUNT_OFF_CENTER, CEL08: TA.MOUNT_OFF_CENTER, E06: TA.LIQUID_MISSING, E08: TA.LIQUID_MISSING, E07: TA.LIQUID_EXCESS, E09: TA.COVER_DROPPED, E10: TA.COVER_DROPPED, E11: TA.COVER_BROKEN, E37: TA.BUBBLES, CEL18: TA.SAMPLE_DRY,
  E13: TA.CROSS_CONTAMINATION, CEL10: TA.CROSS_CONTAMINATION, E42: TA.FIXED_AS_FRESH, E43: TA.FIXED_AS_FRESH,
  E15: TA.SLIDE_BADLY_SEATED, E17: TA.SLIDE_BADLY_SEATED, E16: TA.SLIDE_UNCLAMPED, E18: TA.START_40X, E26: TA.LIGHT_OFF, E27: TA.LIGHT_LOW, E29: TA.LIGHT_LOW, E28: TA.LIGHT_EXCESS, E30: TA.LIGHT_EXCESS,
  E32: TA.CHANGE_UNCENTERED, E33: TA.OFF_CENTER, E34: TA.OFF_CENTER, E22: TA.COARSE_HIGH, E70: TA.COARSE_HIGH, E20: TA.COLLISION, E21: TA.COLLISION, E69: TA.COLLISION, E79: TA.COLLISION, E39: TA.REMOVE_UNSAFE,
  E35: TA.BLURRY_CONCLUSION, E36: TA.BLURRY_CONCLUSION, E40: TA.WRONG_SLIDE, E44: TA.WRONG_SLOT, E45: TA.BAD_SHUTDOWN, E66: TA.BAD_SHUTDOWN, E67: TA.BAD_SHUTDOWN,
  'CEL-055': TA.MEASURE_NO_SCALE, 'CEL-059': TA.OIL_NOT_CLEANED, 'CEL-026': '', E48: TA.STEREO_SAMPLE_MISPLACED, E49: TA.STEREO_SAMPLE_MISPLACED, E50: TA.STEREO_LIGHT, E51: TA.STEREO_LIGHT, E52: TA.STEREO_LIGHT,
  E53: TA.STEREO_ZOOM_FIRST, E54: TA.STEREO_UNFOCUSED, E55: TA.STEREO_UNFOCUSED, E83: TA.STEREO_OUT_OF_FIELD, E64: TA.STEREO_NOT_CLEARED, E63: TA.WRONG_CAPTURE,
};

export const CODE_MAP_B10: Record<string, string> = {
  ...Object.fromEntries(Object.keys(CODE_MAP_B09).map((k) => [k, ''])),
  ...KEPT,
};

export const DEFAULT_B10_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B06_PARAMS),
  codeMap: CODE_MAP_B10,
  ppeRequired: ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'],
  animal: {
    rotateEvidenceDeg: 180,
    trialErrorLimit: 4,
    lightSweepDeg: 60,
    classifyMin: 0.75,
  },
};
