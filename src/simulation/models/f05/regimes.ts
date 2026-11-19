/**
 * Regímenes de validez de F05 (§3): el modelo de Coulomb (F_s ≤ μ_s N, F_k = μ_k N independiente del área y de la
 * rapidez) vale con el cable paralelo al tablero, la meseta de velocidad constante y la tira sin dañar; deja de valer
 * si la lectura incluye el tirón, la oscilación del cable, el golpe contra el tope o la señal recortada.
 */
export type FrictionRegime = 'static' | 'kinetic' | 'invalid';

const INVALID = ['CLIPPED', 'UNPLUGGED', 'JERK', 'CONFIG_CHANGED', 'LOAD_SHIFT', 'POST_IMPACT', 'OCCLUDED', 'NO_SLIP'];

/** Clasifica una ventana de tirón por sus banderas: antes del deslizamiento es estática; luego, cinética. */
export function classifyPull(flags: string[]): FrictionRegime {
  if (flags.some((f) => INVALID.includes(f))) return 'invalid';
  return flags.includes('BEFORE_SLIP') ? 'static' : 'kinetic';
}

/** ¿El bloque desliza solo? Lo hace si tan θ supera μ_s. */
export const slidesAlone = (thetaDeg: number, muS: number) => Number.isFinite(thetaDeg) && Math.tan((thetaDeg * Math.PI) / 180) > muS;
