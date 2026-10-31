/** Creación del mundo de la práctica B08 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { incident } from '../../simulation/cell-world/world';
import { SC_B08, createPhotoWorld } from '../../simulation/photo-world/world';
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { buildB08Spec, sprigsB08, type B08Mode } from './definition';
import { DEFAULT_B08_PARAMS } from './params';
import { validScenariosB08, type B08Scenario } from './error-scenarios';

export interface PracticeB08Options {
  mode: B08Mode;
  seed: number;
  scenarios?: B08Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB08World(opts: PracticeB08Options): PhotoWorld {
  const scenarios = validScenariosB08(opts.scenarios ?? []);
  const has = (s: string) => scenarios.includes(s as B08Scenario);
  const base = structuredClone(DEFAULT_B08_PARAMS);
  const params: B01Params = { ...base, ...(opts.params ?? {}) };
  const seed = opts.seed >>> 0;
  // S25: réplicas con variación determinista por semilla (±5 %), nunca `Math.random`.
  const rateFactor = has(SC_B08.REPEATS) ? 1 + 0.05 * (((seed % 21) - 10) / 10) : 1;
  const w = createPhotoWorld(
    buildB08Spec(seed, opts.mode, params, scenarios),
    { assigned: [], routes: { fixed: true, stereo: false, video: false }, sources: [], swabs: [], stains: [], assetOverride: {}, missingAssets: [], variants: { blurStomata: false, eugVisible: false, parFine: false } },
    { immersion: false, oilMl: 0, wrightMl: 0, bufferMl: 0, brokenSlides: [], brokenFixed: [], wrightSlides: [], scale: { available: !has(SC_B08.UNCAL_PHOTO), traceable: false } },
    {
      modules: { gas: !has(SC_B08.ONLY_CHROM), btb: !has(SC_B08.ONLY_CHROM), pig: !has(SC_B08.ONLY_GAS_BTB) },
      sprigs: sprigsB08(scenarios), rateFactor, solventMl: { bA: 12, bW: 12, bH: 9, bE: 20 },
      assetScope: ['elodea', 'elodeaDense'], radiusCertified: !has(SC_B08.NO_RADIUS),
    },
  );
  if (has(SC_B08.NO_RADIUS)) incident(w, 'missingOxygenCalibration');
  if (has(SC_B08.STATIC_PHOTO)) incident(w, 'missingAsset');
  if (has(SC_B08.UNCAL_PHOTO)) incident(w, 'assetUncalibrated');
  return w;
}
