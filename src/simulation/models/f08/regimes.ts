/**
 * Regímenes de validez de F08 (§3): τ = I α vale para un rotor rígido de eje fijo. Un ensayo con el sólido excéntrico o
 * desbalanceado, una masa que se desliza, el eje tocado, el soporte corrido, la cuerda inclinada, un cambio de montaje,
 * un golpe o el rotor ya girando al soltar no describe el modelo ideal; con roce la inercia exige la corrección del tramo
 * libre.
 */
export type RotationRegime = 'ideal' | 'frictional' | 'invalid';

const INVALID = ['MASS_SLID', 'TOUCHED', 'SUPPORT_MOVED', 'STRING_INCLINED', 'CONFIG_CHANGED', 'POST_IMPACT', 'SPINNING_START', 'OVERSPEED', 'UNPLUGGED', 'OVERLAP', 'ECCENTRIC', 'ASYMMETRIC'];

/** Clasifica un ensayo por sus banderas y por la desaceleración libre medida (rad/s²). */
export function classifyRun(flags: string[], alphaC: number): RotationRegime {
  if (flags.some((f) => INVALID.includes(f))) return 'invalid';
  return Number.isFinite(alphaC) && Math.abs(alphaC) > 0.005 ? 'frictional' : 'ideal';
}

/** ¿El roce es despreciable frente al torque motor? (criterio del 2 %). */
export const negligibleFriction = (alpha: number, alphaC: number) => Number.isFinite(alpha) && Number.isFinite(alphaC) && Math.abs(alphaC) <= 0.02 * Math.abs(alpha);
