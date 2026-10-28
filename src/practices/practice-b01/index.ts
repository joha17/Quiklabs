/** Creación del mundo de la práctica B01 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params, OpticalWorld } from '../../simulation/optical-world/types';
import { createOpticalWorld } from '../../simulation/optical-world/world';
import { buildB01Spec, type B01Mode } from './definition';
import { DEFAULT_B01_PARAMS, withFourObjectives } from './params';
import { validScenariosB01, type B01Scenario } from './error-scenarios';

export interface PracticeB01Options {
  mode: B01Mode;
  seed: number;
  scenarios?: B01Scenario[];
  params?: Partial<B01Params>;
  /** Revólver de cuatro posiciones (con 100X). Ausente en las cintas anteriores: revólver de tres, como entonces. */
  turretPositions?: 4;
}

export function newPracticeB01World(opts: PracticeB01Options): OpticalWorld {
  const base = structuredClone(DEFAULT_B01_PARAMS);
  const params: B01Params = { ...(opts.turretPositions === 4 ? withFourObjectives(base) : base), ...(opts.params ?? {}) };
  return createOpticalWorld(buildB01Spec(opts.seed >>> 0, opts.mode, params, validScenariosB01(opts.scenarios ?? [])));
}
