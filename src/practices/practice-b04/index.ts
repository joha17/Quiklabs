/** Creación del mundo de la práctica B04 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { createCellWorld } from '../../simulation/cell-world/world';
import { latchB, flagB } from '../../simulation/optical-world/events';
import { SC_B04, bioTotals } from '../../simulation/bio-world/world';
import type { BioWorld } from '../../simulation/bio-world/types';
import { withFourObjectives } from '../practice-b01/params';
import { buildB04Spec, buildBioState, scenarioParams, type B04Mode } from './definition';
import { DEFAULT_B04_PARAMS } from './params';
import { validScenariosB04, type B04Scenario } from './error-scenarios';

export interface PracticeB04Options {
  mode: B04Mode;
  seed: number;
  scenarios?: B04Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB04World(opts: PracticeB04Options): BioWorld {
  const seed = opts.seed >>> 0;
  const scenarios = validScenariosB04(opts.scenarios ?? []);
  const params: B01Params = scenarioParams({ ...withFourObjectives(structuredClone(DEFAULT_B04_PARAMS)), ...(opts.params ?? {}) }, scenarios);
  const spec = buildB04Spec(seed, opts.mode, params, scenarios);
  const w = createCellWorld(spec, {
    assigned: [],
    routes: { fixed: true, stereo: false, video: false },
    sources: [],
    swabs: [],
    stains: [],
  }) as BioWorld;
  // B04 exige gafas además del EPP de B01/B02.
  w.safety.ppe.goggles = false;
  w.bio = buildBioState(seed, params, scenarios);
  // Imagen de Feulgen no disponible (SC13): incidencia de recurso, la etapa de ADN queda diferida sin descuento.
  if (scenarios.includes(SC_B04.FEULGEN_MISSING)) {
    w.bio.incidents.push('feulgen');
    flagB(w, 'resource:feulgen');
    latchB(w, 'incident:feulgen', 'RESOURCE_MISSING_FEULGEN_IMAGE', 'INFO', { obj: 'fxB' });
  }
  w.bio.initial = bioTotals(w);
  return w;
}
