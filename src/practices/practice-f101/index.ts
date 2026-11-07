/**
 * F101 — creación del mundo (mesada, instrumentos, piezas, mesa de fuerzas y escenarios docentes).
 */
import type { F101Params, F101World } from '../../simulation/f101-world/types';
import { createF101World } from '../../simulation/f101-world/world';
import { buildObjectsF101, type F101Mode } from './definition';
import { DEFAULT_F101_PARAMS, curricularParams } from './params';
import type { F101Scenario } from './error-scenarios';

export interface PracticeF101Options {
  mode: F101Mode;
  seed: number;
  scenarios?: F101Scenario[];
  params?: Partial<F101Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (con pérdidas declaradas). */
  scientificMode?: F101Params['scientificMode'];
}

export function newPracticeF101World(opts: PracticeF101Options): F101World {
  let params: F101Params = { ...structuredClone(DEFAULT_F101_PARAMS), ...(opts.params ?? {}) };
  const scenarios = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR') params = curricularParams(params);
  if (scenarios.includes('F101-S04_ring_friction')) params = { ...params, ringFrictionN: 0.08 };
  if (scenarios.includes('F101-S07_pulley_friction')) params = { ...params, pulleyFriction: 0.03 };
  return createF101World({ objects: buildObjectsF101(), scenarios, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_F101_PARAMS };
