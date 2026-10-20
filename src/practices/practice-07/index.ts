/**
 * Práctica 7 — creación del mundo (mesada, reactivos con ficha, muestras sólidas, instrumentos, incógnitas por
 * semilla y escenarios docentes validados para no crear estados incompatibles, §10).
 */
import type { P07Params, P07World } from '../../simulation/bonding-world/types';
import { createBondingWorld } from '../../simulation/bonding-world/world';
import { buildObjects07, buildSpecimens07, buildUnknowns07, buildVessels07, type P07Mode } from './definition';
import { DEFAULT_P07_PARAMS } from './params';
import { validScenarios, type P07Scenario } from './error-scenarios';

export interface Practice07Options {
  mode: P07Mode;
  seed: number;
  scenarios?: P07Scenario[];
  params?: Partial<P07Params>;
}

export function newPractice07World(opts: Practice07Options): P07World {
  const params: P07Params = { ...structuredClone(DEFAULT_P07_PARAMS), ...(opts.params ?? {}) };
  const scenarios = validScenarios(opts.scenarios ?? []);
  return createBondingWorld(
    {
      objects: buildObjects07(opts.seed, scenarios),
      vessels: buildVessels07(params, opts.seed, scenarios),
      specimens: buildSpecimens07(opts.seed, scenarios),
      unknowns: buildUnknowns07(opts.seed, scenarios),
      scenarios,
      mode: opts.mode,
    },
    opts.seed,
    params,
  );
}

export { DEFAULT_P07_PARAMS };
