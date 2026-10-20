/**
 * Práctica 1 — creación del mundo (mesada, agua, clavos, cilindro, instrumentos y escenarios docentes).
 */
import type { P01Params, P01World } from '../../simulation/density-world/types';
import { S, createDensityWorld } from '../../simulation/density-world/world';
import { buildFluids01, buildNails01, buildObjects01, type P01Mode } from './definition';
import { DEFAULT_P01_PARAMS } from './params';
import type { P01Scenario } from './error-scenarios';

export interface Practice01Options {
  mode: P01Mode;
  seed: number;
  scenarios?: P01Scenario[];
  params?: Partial<P01Params>;
}

export function newPractice01World(opts: Practice01Options): P01World {
  const params: P01Params = { ...structuredClone(DEFAULT_P01_PARAMS), ...(opts.params ?? {}) };
  const scenarios = opts.scenarios ?? [];
  return createDensityWorld(
    {
      objects: buildObjects01(),
      fluids: buildFluids01(params, opts.seed),
      nails: buildNails01(params, opts.seed, scenarios.includes(S.NAILS_MIXED)),
      scenarios,
      mode: opts.mode,
    },
    opts.seed,
    params,
  );
}

export { DEFAULT_P01_PARAMS };
