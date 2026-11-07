/**
 * F102 — creación del mundo (carril, polea, torre de caída, filtros y escenarios docentes).
 */
import type { F102Params, F102World } from '../../simulation/f102-world/types';
import { createF102World } from '../../simulation/f102-world/world';
import { buildObjectsF102, type F102Mode } from './definition';
import { DEFAULT_F102_PARAMS, curricularParams } from './params';
import type { F102Scenario } from './error-scenarios';

export interface PracticeF102Options {
  mode: F102Mode;
  seed: number;
  scenarios?: F102Scenario[];
  params?: Partial<F102Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (con pérdidas declaradas). */
  scientificMode?: F102Params['scientificMode'];
}

export function newPracticeF102World(opts: PracticeF102Options): F102World {
  let params: F102Params = { ...structuredClone(DEFAULT_F102_PARAMS), ...(opts.params ?? {}) };
  const scenarios = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR') params = curricularParams(params);
  if (scenarios.includes('F102-S03_narrow_flag')) params = { ...params, flagWidthM: 0.01 };
  if (scenarios.includes('F102-S05_pulley_inertia')) params = { ...params, pulleyEqKg: 0.02 };
  if (scenarios.includes('F102-S06_cart_friction')) params = { ...params, cartDragNsPerM: 0.08 };
  if (scenarios.includes('F102-S08_side_wind')) params = { ...params, windMs: 1.2 };
  if (scenarios.includes('F102-S09_noisy_sensor')) params = { ...params, gateTimer: { ...params.gateTimer, jitterS: 0.0015 }, motion: { ...params.motion, noiseM: 0.012 } };
  if (scenarios.includes('F102-S10_bouncy_cart')) params = { ...params, endStopRestitution: 0.85 };
  return createF102World({ objects: buildObjectsF102(), scenarios, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_F102_PARAMS };
