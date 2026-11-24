/**
 * Regímenes de validez de F12 (§3): Bernoulli ideal vale para flujo incompresible, estacionario, sin pérdidas entre
 * tomas y con las tomas estáticas a la misma altura; continuidad, para un circuito sin fugas. Una lectura con banderas
 * de transitorio, fuga, aire, toma tapada o de Pitot, obstrucción o sensor saturado no entra a la tabla del modelo.
 */
export type FlowRegime = 'steady' | 'invalid';

const INVALID = ['TRANSIENT', 'LEAK', 'AIR', 'BLOCKED', 'PITOT', 'OBSTRUCTED', 'CLIPPED', 'BELOW', 'UNPLUGGED', 'UNSTABLE', 'POST_DAMAGE', 'DRIFT', 'CROSSED'];

export const classifyFlowReading = (flags: string[]): FlowRegime => (flags.some((f) => INVALID.includes(f)) ? 'invalid' : 'steady');

/** Mach por debajo del cual un gas se trata como incompresible. */
export const INCOMPRESSIBLE_MACH = 0.3;
