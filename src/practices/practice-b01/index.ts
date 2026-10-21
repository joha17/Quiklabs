/** Creación del mundo de la práctica B01 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params, OpticalWorld } from '../../simulation/optical-world/types';
import { createOpticalWorld } from '../../simulation/optical-world/world';
import { buildB01Spec, type B01Mode } from './definition';
import { DEFAULT_B01_PARAMS } from './params';
import { validScenariosB01, type B01Scenario } from './error-scenarios';

export interface PracticeB01Options {
  mode: B01Mode;
  seed: number;
  scenarios?: B01Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB01World(opts: PracticeB01Options): OpticalWorld {
  const params: B01Params = { ...structuredClone(DEFAULT_B01_PARAMS), ...(opts.params ?? {}) };
  return createOpticalWorld(buildB01Spec(opts.seed >>> 0, opts.mode, params, validScenariosB01(opts.scenarios ?? [])));
}
