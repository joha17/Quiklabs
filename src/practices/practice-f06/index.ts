/**
 * F06 — creación del mundo (soporte con resortes, riel con lanzador y sensores, péndulo y escenarios docentes).
 */
import type { F06Params, F06World } from '../../simulation/f06-world/types';
import { createF06World, SF6 } from '../../simulation/f06-world/world';
import { buildObjectsF06, type F06Mode } from './definition';
import { DEFAULT_F06_PARAMS, curricularParams } from './params';
import type { F06Scenario } from './error-scenarios';

export interface PracticeF06Options {
  mode: F06Mode;
  seed: number;
  scenarios?: F06Scenario[];
  params?: Partial<F06Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (pérdidas y sensores reales). */
  scientificMode?: F06Params['scientificMode'];
}

export function newPracticeF06World(opts: PracticeF06Options): F06World {
  let params: F06Params = { ...structuredClone(DEFAULT_F06_PARAMS), ...(opts.params ?? {}) };
  const sc = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR' || sc.includes(SF6.IDEAL)) params = curricularParams(params);
  if (sc.includes(SF6.STIFF)) params = { ...params, springK: 200 };
  if (sc.includes(SF6.SOFT)) params = { ...params, springK: 40 };
  if (sc.includes(SF6.TRACK_FRICTION)) params = { ...params, rollN: 0.05 };
  if (sc.includes(SF6.WEAK_DAMPER)) params = { ...params, damperC0: 0.1 };
  if (sc.includes(SF6.STRONG_DAMPER)) params = { ...params, damperC0: 1.0 };
  if (sc.includes(SF6.RAISED)) params = { ...params, h0: 0.4 };
  if (sc.includes(SF6.LOW_AMP)) params = { ...params, pendAmps: [5, 8] };
  if (sc.includes(SF6.HIGH_AMP)) params = { ...params, pendL0: 0.4, pendAmps: [45, 60] };
  if (sc.includes(SF6.LIMIT)) params = { ...params, xLin: 0.12 };
  return createF06World({ objects: buildObjectsF06(), scenarios: sc, mode: opts.mode }, opts.seed, params);
}

export { DEFAULT_F06_PARAMS };
