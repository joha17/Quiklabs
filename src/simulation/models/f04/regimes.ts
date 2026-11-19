/**
 * Regímenes de validez de F04 (§3): la ecuación ideal a = m_h g/(m_c + m_h) vale con el cordel tenso, el carril
 * nivelado, sin roce apreciable frente al peso colgante y con la polea de masa despreciable; deja de valer cuando el
 * portapesas toca el suelo, el carro entra al freno o choca con el tope, o la señal está recortada.
 */
export type NewtonRegime = 'ideal' | 'real' | 'invalid';

const INVALID = ['SLACK', 'LANDED', 'BRAKING', 'POST_IMPACT', 'CLIPPED', 'CONFIG_CHANGED', 'HAND_RELEASE', 'UNPLUGGED'];

/** Clasifica un ensayo por sus banderas y el peso relativo de las pérdidas (roce + inercia) frente a m_h g. */
export function classifyRun(flags: string[], lossFraction: number): NewtonRegime {
  if (flags.some((f) => INVALID.includes(f))) return 'invalid';
  return Number.isFinite(lossFraction) && lossFraction < 0.01 ? 'ideal' : 'real';
}

/** Fracción en que la inercia de la polea y el roce reducen la aceleración ideal. */
export function lossFraction(mc: number, mh: number, g: number, I: number, r: number, f: number): number {
  const ideal = (mh * g) / (mc + mh);
  const real = (mh * g - f) / (mc + mh + I / (r * r));
  return ideal > 0 ? 1 - real / ideal : NaN;
}

/** ¿El cordel queda tenso? Lo está si la tensión del lado del carro no es negativa. */
export const stringTaut = (T1: number) => Number.isFinite(T1) && T1 >= 0;
