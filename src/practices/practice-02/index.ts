import type { SimParams, World } from '../../simulation/entities/types';
import { createWorld, type SimContext } from '../../simulation/world/world';
import { buildWorldSpec, type PracticeMode } from './definition';
import { DEFAULT_PARAMS } from './params';
import { SUBSTANCES } from './substances';

export const CTX: SimContext = { subs: SUBSTANCES };

export interface PracticeOptions {
  mode: PracticeMode;
  seed: number;
  oilProfile?: 'OIL_VEG' | 'OIL_MIN';
  params?: Partial<SimParams>;
}

export function newPracticeWorld(opts: PracticeOptions): World {
  const params: SimParams = { ...structuredClone(DEFAULT_PARAMS), ...(opts.params ?? {}) };
  if (opts.oilProfile) params.oilProfile = opts.oilProfile;
  return createWorld(buildWorldSpec(opts.mode, params), opts.seed, params);
}

export { DEFAULT_PARAMS, SUBSTANCES };
