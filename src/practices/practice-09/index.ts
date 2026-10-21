/**
 * Práctica 9 — creación del mundo: objetos, recipientes, muestra incógnita por escenario y escenarios docentes
 * validados para no crear estados incompatibles (§7).
 */
import type { P09Params, P09World } from '../../simulation/cation-analysis-world/types';
import { createCationWorld } from '../../simulation/cation-analysis-world/world';
import { buildObjects09, buildVessels09, loopResidueFor, unknownCode, unknownComposition, type P09Mode } from './definition';
import { DEFAULT_P09_PARAMS } from './params';
import { validScenarios09, type P09Scenario } from './error-scenarios';

export interface Practice09Options {
  mode: P09Mode;
  seed: number;
  scenarios?: P09Scenario[];
  params?: Partial<P09Params>;
}

export function newPractice09World(opts: Practice09Options): P09World {
  const params: P09Params = { ...structuredClone(DEFAULT_P09_PARAMS), ...(opts.params ?? {}) };
  const scenarios = validScenarios09(opts.scenarios ?? []);
  const w = createCationWorld(
    {
      objects: buildObjects09(opts.seed, scenarios),
      vessels: buildVessels09(params, scenarios),
      scenarios,
      mode: opts.mode,
      unknown: { code: unknownCode(opts.seed), cations: unknownComposition(scenarios).cations },
      loopResidue: loopResidueFor(scenarios),
    },
    opts.seed,
    params,
  );
  // S08: el residuo inicial del vidrio de reloj pertenece a otra muestra.
  if (scenarios.includes('P09-S08_support_residue')) w.evidence['resRoot:wgFlame'] = 1;
  return w;
}

export { DEFAULT_P09_PARAMS };
