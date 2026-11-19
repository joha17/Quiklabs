/**
 * F07 — creación del mundo (riel con dos carros, paragolpes, fotopuertas, sensor de fuerza, cámara y escenarios docentes).
 */
import type { F07Params, F07World } from '../../simulation/f07-world/types';
import { createF07World, SF7 } from '../../simulation/f07-world/world';
import { buildObjectsF07, type F07Mode } from './definition';
import { DEFAULT_F07_PARAMS, curricularParams } from './params';
import type { F07Scenario } from './error-scenarios';

export interface PracticeF07Options {
  mode: F07Mode;
  seed: number;
  scenarios?: F07Scenario[];
  params?: Partial<F07Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (rodadura y sensores reales). */
  scientificMode?: F07Params['scientificMode'];
}

export function newPracticeF07World(opts: PracticeF07Options): F07World {
  let params: F07Params = { ...structuredClone(DEFAULT_F07_PARAMS), ...(opts.params ?? {}) };
  const sc = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR' || sc.includes(SF7.ELASTIC)) params = curricularParams(params);
  if (sc.includes(SF7.PARTIAL)) params = { ...params, e: 0.7 };
  if (sc.includes(SF7.EQUAL)) params = { ...params, m2: params.m1 };
  if (sc.includes(SF7.UNEQUAL)) params = { ...params, m2: 0.5 };
  if (sc.includes(SF7.BOTH_MOVING)) params = { ...params, v2: -0.6 };
  if (sc.includes(SF7.FRICTION)) params = { ...params, frictionN: 0.02 };
  if (sc.includes(SF7.SOFT)) params = { ...params, contactK: 500 };
  return createF07World({ objects: buildObjectsF07(), scenarios: sc, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_F07_PARAMS };
