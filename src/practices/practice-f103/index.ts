/**
 * F103 — creación del mundo (pista de vuelo, soporte, lanzador, instrumentos y escenarios docentes).
 */
import type { F103Params, F103World } from '../../simulation/f103-world/types';
import { createF103World, SF3 } from '../../simulation/f103-world/world';
import { buildObjectsF103, type F103Mode } from './definition';
import { DEFAULT_F103_PARAMS, curricularParams } from './params';
import type { F103Scenario } from './error-scenarios';

export interface PracticeF103Options {
  mode: F103Mode;
  seed: number;
  scenarios?: F103Scenario[];
  params?: Partial<F103Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (con pérdidas declaradas). */
  scientificMode?: F103Params['scientificMode'];
}

export function newPracticeF103World(opts: PracticeF103Options): F103World {
  let params: F103Params = { ...structuredClone(DEFAULT_F103_PARAMS), ...(opts.params ?? {}) };
  const scenarios = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR') params = curricularParams(params);
  if (scenarios.includes(SF3.NO_AIR)) params = { ...params, airDensity: 0 };
  if (scenarios.includes(SF3.DRAG)) params = { ...params, dragAlways: true };
  if (scenarios.includes(SF3.WEAK_SPRING)) params = { ...params, springTrueFactor: 0.88 };
  if (scenarios.includes(SF3.SENSOR_DELAY)) params = { ...params, platform: { ...params.platform, latencyS: 0.012 } };
  if (scenarios.includes(SF3.BOUNCY_FLOOR)) params = { ...params, restitution: 0.7 };
  const stand = scenarios.includes(SF3.RAISED_BASE) ? 90 : 30;
  return createF103World({ objects: buildObjectsF103(stand), scenarios, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_F103_PARAMS };
