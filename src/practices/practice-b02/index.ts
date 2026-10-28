/** Creación del mundo de la práctica B02 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { SC, createCellWorld } from '../../simulation/cell-world/world';
import type { CellWorld } from '../../simulation/cell-world/types';
import { SOURCES_B02, SWABS_B02, assignedKinds, buildB02Spec, type B02Mode } from './definition';
import { DEFAULT_B02_PARAMS } from './params';
import { withFourObjectives } from '../practice-b01/params';
import { objectivesOf } from '../../simulation/instruments/optical/microscope-model';
import { validScenariosB02, type B02Scenario } from './error-scenarios';

export interface PracticeB02Options {
  mode: B02Mode;
  seed: number;
  scenarios?: B02Scenario[];
  params?: Partial<B01Params>;
  /** Revólver de cuatro posiciones (con 100X). Ausente en las cintas anteriores: revólver de tres, como entonces. */
  turretPositions?: 4;
}

export function newPracticeB02World(opts: PracticeB02Options): CellWorld {
  const scenarios = validScenariosB02(opts.scenarios ?? []);
  const has = (s: string) => scenarios.includes(s as B02Scenario);
  const base = structuredClone(DEFAULT_B02_PARAMS);
  const params: B01Params = { ...(opts.turretPositions === 4 ? withFourObjectives(base) : base), ...(opts.params ?? {}) };
  // Foco difícil (S07): la profundidad de campo de cada objetivo se reduce a la mitad.
  if (has(SC.HARD_FOCUS)) for (const k of objectivesOf(params.microscope)) params.microscope.focusSigmaMm[k]! *= 0.5;
  return createCellWorld(buildB02Spec(opts.seed >>> 0, opts.mode, params, scenarios), {
    assigned: assignedKinds(scenarios),
    routes: { fixed: has(SC.FIXED_SLIDES), stereo: has(SC.STEREO), video: has(SC.CYCLOSIS_VIDEO) },
    sources: SOURCES_B02,
    swabs: SWABS_B02,
    assetOverride: has(SC.TEACHER_ASSETS) ? { tomato: 'tomatoT2', potatoLugol: 'potatoLugolT2' } : {},
    missingAssets: has(SC.MISSING_ASSET) ? ['pepper'] : [],
  });
}
