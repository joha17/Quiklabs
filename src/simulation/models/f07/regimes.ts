/**
 * Regímenes de validez de F07 (§3): Σp se conserva si el impulso externo durante el choque es despreciable (riel
 * nivelado, sin freno, sin roce lateral, sin la mano); la energía cinética solo se conserva en el choque elástico. Un
 * ensayo inclinado, empujado, oblicuo, con la masa cambiada en marcha o después de un golpe ya no describe el modelo.
 */
export type CollisionRegime = 'elastic' | 'inelastic' | 'sticky' | 'invalid';

const INVALID = ['INCLINED', 'BRAKE_ON', 'PUSHED', 'HAND_IN_GATE', 'MASS_CHANGED', 'OBLIQUE', 'WHEEL_BIND', 'POST_IMPACT', 'CONFIG_CHANGED', 'UNPLUGGED', 'OVERLAP', 'GATE_IN_ZONE', 'TARGET_MOVING'];

/** Clasifica un choque por sus banderas y por la restitución medida. */
export function classifyCollision(flags: string[], e: number, stuck: boolean): CollisionRegime {
  if (flags.some((f) => INVALID.includes(f))) return 'invalid';
  if (stuck) return 'sticky';
  return Number.isFinite(e) && e >= 0.95 ? 'elastic' : 'inelastic';
}

/** ¿El impulso externo es despreciable frente al intercambiado? (criterio del 2 %). */
export const isolated = (extJ: number, J: number) => Number.isFinite(extJ) && Number.isFinite(J) && Math.abs(extJ) <= 0.02 * Math.abs(J);
