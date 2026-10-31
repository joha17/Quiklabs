/** Creación del mundo de la práctica B07 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { SC_B07, createMicroWorld } from '../../simulation/micro-world/world';
import type { MicroWorld } from '../../simulation/micro-world/types';
import { MICRO_ASSETS } from '../../simulation/specimens/assets';
import { BROKEN_SLIDE_B07, SLIDES_B07, buildB07Spec, platesB07, type B07Mode } from './definition';
import { DEFAULT_B07_PARAMS } from './params';
import { withFourObjectives } from '../practice-b01/params';
import { validScenariosB07, type B07Scenario } from './error-scenarios';

export interface PracticeB07Options {
  mode: B07Mode;
  seed: number;
  scenarios?: B07Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB07World(opts: PracticeB07Options): MicroWorld {
  const scenarios = validScenariosB07(opts.scenarios ?? []);
  const has = (s: string) => scenarios.includes(s as B07Scenario);
  const base = structuredClone(DEFAULT_B07_PARAMS);
  // El 100X existe solo con el módulo de inmersión (S19); el resto del revólver es el de B01.
  const immersion = has(SC_B07.IMMERSION);
  const params: B01Params = { ...(immersion ? withFourObjectives(base) : base), ...(opts.params ?? {}) };
  const noScale = has(SC_B07.NO_SCALE);
  return createMicroWorld(
    buildB07Spec(opts.seed >>> 0, opts.mode, params, scenarios),
    { assigned: [], routes: { fixed: true, stereo: false, video: false }, sources: [], swabs: [], stains: [], assetOverride: {}, missingAssets: [], variants: { blurStomata: false, eugVisible: false, parFine: false } },
    { immersion, oilMl: 5, wrightMl: 0, bufferMl: 0, brokenSlides: [BROKEN_SLIDE_B07], brokenFixed: [], wrightSlides: [], scale: { available: !noScale, traceable: false } },
    {
      plates: platesB07(scenarios), smearSlides: SLIDES_B07, stainMl: 5, washMl: 20, scaleAvailable: !noScale,
      assetScope: Object.keys(MICRO_ASSETS).filter((id) => has(SC_B07.TEACHER) || !id.endsWith('T2')),
    },
  );
}
