/** Creación del mundo de la práctica B05 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { createCellWorld } from '../../simulation/cell-world/world';
import { enzTotals } from '../../simulation/enz-world/world';
import type { EnzWorld } from '../../simulation/enz-world/types';
import { withFourObjectives } from '../practice-b01/params';
import { SOURCES_B02 } from '../practice-b02/definition';
import { buildB05Spec, buildEnzState, scenarioParams, type B05Mode } from './definition';
import { DEFAULT_B05_PARAMS } from './params';
import { validScenariosB05, type B05Scenario } from './error-scenarios';

export interface PracticeB05Options {
  mode: B05Mode;
  seed: number;
  scenarios?: B05Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB05World(opts: PracticeB05Options): EnzWorld {
  const seed = opts.seed >>> 0;
  const scenarios = validScenariosB05(opts.scenarios ?? []);
  const params: B01Params = scenarioParams({ ...withFourObjectives(structuredClone(DEFAULT_B05_PARAMS)), ...(opts.params ?? {}) }, scenarios, seed);
  const spec = { ...buildB05Spec(seed, opts.mode, params, scenarios), scenarios };
  // Solo la papa (gránulos de almidón con Lugol): el resto de las muestras de B02 no está en esta mesada.
  const w = createCellWorld(spec, {
    assigned: ['potato'],
    routes: { fixed: false, stereo: false, video: false },
    sources: SOURCES_B02.filter((s) => s.id === 'pot'),
    swabs: [],
  }) as EnzWorld;
  w.enz = buildEnzState(seed, params, scenarios);
  w.enz.initial = enzTotals(w);
  return w;
}
