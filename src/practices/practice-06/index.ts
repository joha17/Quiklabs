/**
 * Práctica 6 — creación del mundo (banco, recipientes, metales, termómetros) y elección del metal incógnito.
 */
import type { P6Params, P6World } from '../../simulation/calorimetry-world/types';
import { createCalorWorld } from '../../simulation/calorimetry-world/world';
import { hashRandom, hashRange } from '../../simulation/core/rng';
import { UNKNOWN_BANK, type MetalId } from '../../simulation/calorimetry/materials';
import { buildObjects6, buildVessels6, type P6Mode } from './definition';
import { DEFAULT_P6_PARAMS } from './params';
import type { P6Scenario } from './error-scenarios';

export interface Practice6Options {
  mode: P6Mode;
  seed: number;
  scenarios?: P6Scenario[];
  params?: Partial<P6Params>;
  /** El docente fija el incógnito; si no, lo elige la semilla. */
  unknown?: MetalId | null;
}

export function unknownFor(seed: number): MetalId {
  return UNKNOWN_BANK[Math.floor(hashRandom(seed, 'unknown') * UNKNOWN_BANK.length) % UNKNOWN_BANK.length];
}

export function newPractice6World(opts: Practice6Options): P6World {
  const seed = opts.seed;
  const unknown = opts.unknown ?? opts.params?.unknownMetal ?? unknownFor(seed);
  const params: P6Params = {
    ...structuredClone(DEFAULT_P6_PARAMS),
    ...(opts.params ?? {}),
    unknownMetal: unknown,
    unknownCode: `X-${String(10 + Math.floor(hashRandom(seed, 'code') * 89)).padStart(2, '0')}`,
  };
  return createCalorWorld(
    {
      objects: buildObjects6(),
      vessels: buildVessels6(Math.round(hashRange(seed, 'cyl', 116, 126) * 100) / 100),
      jars: [{ id: 'jar_fe', metal: 'Fe', count: 14 }, { id: 'jar_x', metal: unknown, count: 18 }],
      tubes: [{ id: 'tube_fe', glassMassG: Math.round(hashRange(seed, 'tfe', 14.2, 15.8) * 100) / 100 }, { id: 'tube_x', glassMassG: Math.round(hashRange(seed, 'tx', 14.2, 15.8) * 100) / 100 }],
      thermometers: ['therm_cal', 'therm_bath'],
      scenarios: opts.scenarios ?? [],
    },
    seed,
    params,
  );
}

export { DEFAULT_P6_PARAMS };
