/**
 * Regímenes de validez de F10 (§3): la estática de la viga vale con la viga asentada en ambos filos, quieta, sin
 * mano ni apoyos corridos y con reacciones positivas; la ley de Hooke vale solo bajo la fluencia, con la probeta
 * alineada, sin precarga y con instrumentos en cero. Una lectura con banderas de plasticidad no entra a la tabla elástica.
 */
export type BeamRegime = 'static' | 'invalid';
export type MaterialRegime = 'elastic' | 'plastic' | 'invalid';

const BEAM_INVALID = ['NOT_SEATED', 'HAND_ON', 'UNSTABLE', 'TIPPED', 'SUPPORT_MOVED', 'ILL_COND', 'NO_BEAM', 'POST_IMPACT', 'UNPLUGGED', 'CLIPPED'];
const PRESS_INVALID = ['ECCENTRIC', 'PRELOAD', 'TRANSIENT', 'VIBRATION', 'UNSTABLE', 'TRANSVERSE', 'TILTED_GAUGE', 'OCCLUDED', 'UNPLUGGED', 'CLIPPED', 'CONFIG_CHANGED', 'NO_SPECIMEN', 'NO_GAUGE'];

export const classifyBeamReading = (flags: string[]): BeamRegime => (flags.some((f) => BEAM_INVALID.includes(f)) ? 'invalid' : 'static');

/** Clasifica una lectura de la prensa por sus banderas. */
export function classifyPressReading(flags: string[]): MaterialRegime {
  if (flags.some((f) => PRESS_INVALID.includes(f))) return 'invalid';
  if (flags.includes('PLASTIC') || flags.includes('PREDEFORMED')) return 'plastic';
  return 'elastic';
}

/** ¿El esfuerzo queda en la zona elástica? (margen del 90 % de la fluencia). */
export const isElastic = (sigma: number, sigmaY: number) => Number.isFinite(sigma) && Number.isFinite(sigmaY) && sigma < 0.9 * sigmaY;
