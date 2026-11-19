/**
 * F08 — creación del mundo (soporte giratorio, sólidos, cuerda con masa colgante, sensores y escenarios docentes).
 */
import type { F08Params, F08World } from '../../simulation/f08-world/types';
import { createF08World, SF8 } from '../../simulation/f08-world/world';
import { buildObjectsF08, type F08Mode } from './definition';
import { DEFAULT_F08_PARAMS, curricularParams } from './params';
import type { F08Scenario } from './error-scenarios';

export interface PracticeF08Options {
  mode: F08Mode;
  seed: number;
  scenarios?: F08Scenario[];
  params?: Partial<F08Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (roce de rodamientos y sensores reales). */
  scientificMode?: F08Params['scientificMode'];
}

export function newPracticeF08World(opts: PracticeF08Options): F08World {
  let params: F08Params = { ...structuredClone(DEFAULT_F08_PARAMS), ...(opts.params ?? {}) };
  const sc = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR' || sc.includes(SF8.FRICTIONLESS)) params = curricularParams(params);
  if (sc.includes(SF8.FRICTION)) params = { ...params, frictionNm: 0.003 };
  return createF08World({ objects: buildObjectsF08(), scenarios: sc, mode: opts.mode }, opts.seed, params);
}

/** Masa de caída que usa la ruta según el escenario (torque bajo o alto). */
export function routeDropF08(scenarios: readonly string[]): 'drop20' | 'drop50' | 'drop100' {
  if (scenarios.includes(SF8.LOW_TORQUE)) return 'drop20';
  if (scenarios.includes(SF8.HIGH_TORQUE)) return 'drop100';
  return 'drop50';
}

export { DEFAULT_F08_PARAMS };
