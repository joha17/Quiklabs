/** Creación del mundo de la práctica B10 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { SC_B10, createAnimalWorld } from '../../simulation/animal-world/world';
import type { AnimalWorld } from '../../simulation/animal-world/types';
import { SOURCES_B10, assignmentB10, buildB10Spec, type B10Mode } from './definition';
import { DEFAULT_B10_PARAMS } from './params';
import { validScenariosB10, type B10Scenario } from './error-scenarios';

export interface PracticeB10Options {
  mode: B10Mode;
  seed: number;
  scenarios?: B10Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB10World(opts: PracticeB10Options): AnimalWorld {
  const scenarios = validScenariosB10(opts.scenarios ?? []);
  const has = (s: string) => scenarios.includes(s as B10Scenario);
  const params: B01Params = { ...structuredClone(DEFAULT_B10_PARAMS), ...(opts.params ?? {}) };
  const a = assignmentB10(scenarios);
  const fresh = has(SC_B10.FRESH);
  const evaluation = opts.mode === 'EVALUATION' || has(SC_B10.EVAL_4) || has(SC_B10.EVAL_8) || has(SC_B10.EVAL_12);
  return createAnimalWorld(
    buildB10Spec(opts.seed >>> 0, opts.mode, params, scenarios),
    {
      assigned: fresh ? ['muscleFresh'] : [],
      routes: { fixed: true, stereo: true, video: false },
      sources: fresh ? SOURCES_B10 : [],
      swabs: [],
      stains: [],
    },
    { immersion: true, oilMl: 5, wrightMl: 0, bufferMl: 0, brokenSlides: [], brokenFixed: [], wrightSlides: [], scale: { available: true, traceable: false } },
    {
      modules: a.modules,
      requiredSlides: a.slides.slice(0, 12),
      requiredModels: a.models,
      requiredTracks: a.tracks,
      stereoRequired: a.stereo,
      freshMount: fresh,
      neutralNames: evaluation,
      // Los nombres de estudio nunca están en Evaluación; el repaso (S35) los deja sin que acrediten.
      studyAllowed: !evaluation,
      videoAssigned: has(SC_B10.VIDEO),
      faultyModel: has(SC_B10.INCIDENT) ? 'opilion' : null,
      assetScope: has(SC_B10.TEACHER) ? 'course' : 'standard',
    },
  );
}
