/**
 * Regímenes de validez de F102 (§3.4). El modelo de caída libre vale mientras el arrastre sea una fracción pequeña
 * del peso; el modelo de aceleración constante, mientras el cordel esté tenso y no haya choques.
 */
import { terminalVelocity } from './equations';

/** Fracción del peso que representa el arrastre a la velocidad v: (v / v_t)². */
export function dragFraction(v: number, m: number, g: number, rho: number, cd: number, area: number): number {
  const vt = terminalVelocity(m, g, rho, cd, area);
  return Number.isFinite(vt) ? (v / vt) ** 2 : NaN;
}

/** ¿La caída desde h puede tratarse como libre (arrastre < 2 % del peso al llegar)? */
export function freeFallValid(h: number, m: number, g: number, rho: number, cd: number, area: number): boolean {
  const v = Math.sqrt(2 * g * h);
  const f = dragFraction(v, m, g, rho, cd, area);
  return Number.isFinite(f) && f < 0.02;
}

export type KinematicRegime = 'uniform' | 'accelerated' | 'free_fall' | 'drag_limited' | 'invalid';

export function classifyRun(flags: string[], hanging: boolean): KinematicRegime {
  if (flags.some((f) => ['IMPACT', 'LANDED', 'CONFIG_CHANGED', 'OVERLAP', 'MISSED', 'POST_IMPACT'].includes(f))) return 'invalid';
  if (flags.includes('DRAG') || flags.includes('TUMBLING')) return 'drag_limited';
  return hanging ? 'accelerated' : 'uniform';
}
