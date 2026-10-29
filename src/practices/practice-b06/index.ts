/** Creación del mundo de la práctica B06 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { SC_B06, createDivWorld } from '../../simulation/div-world/world';
import type { DivWorld } from '../../simulation/div-world/types';
import { DIV_MEDIA } from '../../simulation/specimens/thin-section';
import { BROKEN_FIXED, BROKEN_SLIDE, SOURCES_B06, SWABS_B06, assignedKinds, buildB06Spec, type B06Mode } from './definition';
import { DEFAULT_B06_PARAMS } from './params';
import { withFourObjectives } from '../practice-b01/params';
import { validScenariosB06, type B06Scenario } from './error-scenarios';

export interface PracticeB06Options {
  mode: B06Mode;
  seed: number;
  scenarios?: B06Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB06World(opts: PracticeB06Options): DivWorld {
  const scenarios = validScenariosB06(opts.scenarios ?? []);
  const has = (s: string) => scenarios.includes(s as B06Scenario);
  const base = structuredClone(DEFAULT_B06_PARAMS);
  // El 100X existe solo con el módulo de inmersión asignado (§3.2, PCEL-5); el resto del revólver es el de B01.
  const immersion = has(SC_B06.BACT_IMMERSION);
  const params: B01Params = { ...(immersion ? withFourObjectives(base) : base), ...(opts.params ?? {}) };
  return createDivWorld(
    buildB06Spec(opts.seed >>> 0, opts.mode, params, scenarios),
    {
      assigned: assignedKinds(),
      routes: { fixed: true, stereo: false, video: has(SC_B06.EL_LIVE) },
      sources: SOURCES_B06,
      swabs: SWABS_B06,
      stains: DIV_MEDIA,
      assetOverride: has(SC_B06.TEACHER_OVERRIDE) ? { paramecium: 'parameciumT2' } : {},
      missingAssets: has(SC_B06.RESOURCE_OUTAGE) ? ['euglena'] : [],
      variants: { blurStomata: has(SC_B06.TRADES_BLUR), eugVisible: has(SC_B06.EUG_VISIBLE), parFine: has(SC_B06.PAR_FINE) },
    },
    {
      immersion,
      oilMl: 5,
      wrightMl: 5,
      bufferMl: 5,
      brokenSlides: [BROKEN_SLIDE],
      brokenFixed: [BROKEN_FIXED],
      wrightSlides: ['wr1'],
      scale: { available: !has(SC_B06.NO_SCALE), traceable: has(SC_B06.METROLOGY) },
    },
  );
}
