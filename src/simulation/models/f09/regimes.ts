/**
 * Regímenes de validez de F09 (§3): F_c = m ω² r vale en régimen estacionario (ω constante, cordón tenso, masa en su
 * tope); τ = I α vale con eje fijo, torque en el plano y freno suelto; L se conserva solo sin torque externo (motor
 * desacoplado, freno suelto, cordón del tambor libre). Una lectura con alguna de esas condiciones rotas no describe el
 * modelo ideal; con roce la inercia exige la corrección del tramo libre.
 */
export type RotationRegime = 'ideal' | 'frictional' | 'invalid';

const INVALID = ['SLACK', 'UNSTABLE', 'SPEED_JUMP', 'BRAKING', 'MOTOR_TORQUE', 'ASYM_PULL', 'ASYMMETRIC', 'SUPPORT_MOVED', 'AXIS_TILTED', 'CONFIG_CHANGED', 'POST_IMPACT', 'OBLIQUE', 'OVERSPEED', 'UNPLUGGED'];

/** Clasifica una lectura por sus banderas y por la desaceleración libre medida (rad/s²). */
export function classifyReading(flags: string[], alphaC = 0): RotationRegime {
  if (flags.some((f) => INVALID.includes(f))) return 'invalid';
  return Number.isFinite(alphaC) && Math.abs(alphaC) > 0.005 ? 'frictional' : 'ideal';
}

/** ¿El roce es despreciable frente al torque aplicado? (criterio del 2 %). */
export const negligibleFriction = (alpha: number, alphaC: number) => Number.isFinite(alpha) && Number.isFinite(alphaC) && Math.abs(alphaC) <= 0.02 * Math.abs(alpha);
