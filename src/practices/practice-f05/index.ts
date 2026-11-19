/**
 * F05 — creación del mundo (plano inclinable, bloque, superficies, tirador con célula de carga y escenarios docentes).
 */
import type { F05Params, F05World } from '../../simulation/f05-world/types';
import { createF05World, SF5 } from '../../simulation/f05-world/world';
import { buildObjectsF05, type F05Mode } from './definition';
import { DEFAULT_F05_PARAMS, curricularParams } from './params';
import type { F05Scenario } from './error-scenarios';

export interface PracticeF05Options {
  mode: F05Mode;
  seed: number;
  scenarios?: F05Scenario[];
  params?: Partial<F05Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (sensores y material reales). */
  scientificMode?: F05Params['scientificMode'];
}

export function newPracticeF05World(opts: PracticeF05Options): F05World {
  let params: F05Params = { ...structuredClone(DEFAULT_F05_PARAMS), ...(opts.params ?? {}) };
  const scenarios = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR' || scenarios.includes(SF5.DRY_WOOD)) params = curricularParams(params);
  if (scenarios.includes(SF5.HEAVY)) params = { ...params, blockKg: 1.0 };
  if (scenarios.includes(SF5.VARIABLE)) params = { ...params, muRipple: 0.1 };
  if (scenarios.includes(SF5.LOOSE_SCREW)) params = { ...params, driftDegS: 0.15 };
  if (scenarios.includes(SF5.OSCILLATING)) params = { ...params, springC: 1 };
  if (scenarios.includes(SF5.LOW_THRESHOLD)) params = { ...params, mu: { ...params.mu, wood: { s: 0.18, k: 0.12 } } };
  return createF05World({ objects: buildObjectsF05(), scenarios, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_F05_PARAMS };
