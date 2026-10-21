/**
 * Práctica 8 — creación del mundo con la ruta FIJA del intento (§17.2), los objetos de esa ruta y los escenarios
 * docentes validados para no crear estados incompatibles (§10).
 */
import type { P08Params, P08World, RouteId } from '../../simulation/organic-world/types';
import { createOrganicWorld } from '../../simulation/organic-world/world';
import { buildObjects08, buildVessels08, type P08Mode } from './definition';
import { DEFAULT_P08_PARAMS } from './params';
import { validScenarios08, type P08Scenario } from './error-scenarios';

export interface Practice08Options {
  mode: P08Mode;
  seed: number;
  route?: RouteId;
  scenarios?: P08Scenario[];
  params?: Partial<P08Params>;
}

export function newPractice08World(opts: Practice08Options): P08World {
  const route = opts.route ?? opts.params?.route ?? 'ISO';
  const params: P08Params = { ...structuredClone(DEFAULT_P08_PARAMS), ...(opts.params ?? {}), route };
  const scenarios = validScenarios08(opts.scenarios ?? [], route);
  return createOrganicWorld({ route, objects: buildObjects08(route, opts.seed), vessels: buildVessels08(route, params, scenarios), scenarios, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_P08_PARAMS };
