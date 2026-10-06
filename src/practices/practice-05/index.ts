/**
 * Práctica 5 — creación del mundo y contexto (geometría y mechero de la Práctica 3).
 */
import type { P5Params, P5World } from '../../simulation/stoich-world/types';
import { createStoichWorld, type StoichContext } from '../../simulation/stoich-world/world';
import { CTX3, DEFAULT_P3_PARAMS } from '../practice-03';
import { BALANCE_GEO, BALANCE_POS, buildGasObjects5, buildObjects5, CLAMP_ARM, RACK_POS5, STAND_POS, TUBE5, type P5Mode } from './definition';
import { DEFAULT_P5_PARAMS } from './params';
import type { P5Scenario } from './error-scenarios';

export const CTX5: StoichContext = {
  gasCtx: CTX3,
  geo: {
    stand: STAND_POS,
    clampArm: CLAMP_ARM,
    tube: { length: TUBE5.length, outerR: TUBE5.outerR, glassMassG: TUBE5.glassMassG },
    balance: { x: BALANCE_POS.x, y: BALANCE_POS.y, panDx: BALANCE_GEO.panDx, panDy: BALANCE_GEO.panDy, panZ: BALANCE_GEO.panZ },
    rack: RACK_POS5,
  },
};

export interface Practice5Options {
  mode: P5Mode;
  seed: number;
  scenarios?: P5Scenario[];
  params?: Partial<P5Params>;
}

export function newPractice5World(opts: Practice5Options): P5World {
  const params: P5Params = { ...structuredClone(DEFAULT_P5_PARAMS), ...(opts.params ?? {}) };
  return createStoichWorld(
    {
      objects: buildObjects5(),
      gasObjects: buildGasObjects5() as never,
      gasParams: { ...structuredClone(DEFAULT_P3_PARAMS), ambientC: params.ambientC },
      scenarios: opts.scenarios ?? [],
    },
    opts.seed,
    params,
    CTX5,
  );
}

export { DEFAULT_P5_PARAMS };
