/**
 * Práctica 10 — creación del mundo (banco, recipientes, montaje de gas, jeringa y sensor).
 */
import type { P10Params, P10World } from '../../simulation/gas-world/types';
import { createGasWorld } from '../../simulation/gas-world/world';
import { aceticMoles } from '../../simulation/gas-laws/stoich';
import { buildLiquids10, buildObjects10, type P10Mode } from './definition';
import { DEFAULT_P10_PARAMS } from './params';
import type { P10Scenario } from './error-scenarios';

export interface Practice10Options {
  mode: P10Mode;
  seed: number;
  scenarios?: P10Scenario[];
  params?: Partial<P10Params>;
}

export function newPractice10World(opts: Practice10Options): P10World {
  const params: P10Params = { ...structuredClone(DEFAULT_P10_PARAMS), ...(opts.params ?? {}) };
  return createGasWorld(
    {
      objects: buildObjects10(),
      liquids: buildLiquids10({ flaskMl: params.flaskMl, vinegarAcidMol: aceticMoles(params.vinegar, params.vinegarMl), vinegarMl: params.vinegarMl }),
      scenarios: opts.scenarios ?? [],
    },
    opts.seed,
    params,
  );
}

export { DEFAULT_P10_PARAMS };
