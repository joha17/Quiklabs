/**
 * F04 — creación del mundo (carril, carro, polea, sensores, pareja de carros y escenarios docentes).
 */
import type { F04Params, F04World } from '../../simulation/f04-world/types';
import { createF04World, SF4 } from '../../simulation/f04-world/world';
import { buildObjectsF04, type F04Mode } from './definition';
import { DEFAULT_F04_PARAMS, curricularParams } from './params';
import type { F04Scenario } from './error-scenarios';

export interface PracticeF04Options {
  mode: F04Mode;
  seed: number;
  scenarios?: F04Scenario[];
  params?: Partial<F04Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (con pérdidas declaradas). */
  scientificMode?: F04Params['scientificMode'];
}

export function newPracticeF04World(opts: PracticeF04Options): F04World {
  let params: F04Params = { ...structuredClone(DEFAULT_F04_PARAMS), ...(opts.params ?? {}) };
  const scenarios = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR' || scenarios.includes(SF4.IDEAL)) params = curricularParams(params);
  if (scenarios.includes(SF4.FRICTION)) params = { ...params, rollingN: 0.1 };
  if (scenarios.includes(SF4.PULLEY_INERTIA)) params = { ...params, pulleyI: 8e-5 };
  if (scenarios.includes(SF4.SMALL_HANG)) params = { ...params, hangerKg: 0.02 };
  if (scenarios.includes(SF4.LARGE_HANG)) params = { ...params, hangerKg: 0.1 };
  if (scenarios.includes(SF4.SLACK)) params = { ...params, holdSlackM: 0.08 };
  if (scenarios.includes(SF4.LOSSY)) params = { ...params, bearingTorque: params.bearingTorque * 5 || 1e-3 };
  if (scenarios.includes(SF4.REPEATED)) params = { ...params, releaseJitter: 0.006, noiseFactor: 3 };
  return createF04World({ objects: buildObjectsF04(), scenarios, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_F04_PARAMS };
