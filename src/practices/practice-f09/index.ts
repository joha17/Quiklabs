/**
 * F09 — creación del mundo (mesa giratoria, masa orbitante, tambor con dinamómetro, masas radiales, sensores y
 * escenarios docentes).
 */
import type { F09Params, F09World } from '../../simulation/f09-world/types';
import { createF09World, SF9 } from '../../simulation/f09-world/world';
import { buildObjectsF09, type F09Mode } from './definition';
import { DEFAULT_F09_PARAMS, curricularParams } from './params';
import type { F09Scenario } from './error-scenarios';

export interface PracticeF09Options {
  mode: F09Mode;
  seed: number;
  scenarios?: F09Scenario[];
  params?: Partial<F09Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (roce del eje, soporte inclinado y sensores reales). */
  scientificMode?: F09Params['scientificMode'];
}

export function newPracticeF09World(opts: PracticeF09Options): F09World {
  let params: F09Params = { ...structuredClone(DEFAULT_F09_PARAMS), ...(opts.params ?? {}) };
  const sc = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR') params = curricularParams(params);
  if (sc.includes(SF9.LOW_FRICTION)) params = { ...params, bearingNm: params.bearingNm * 0.2, imbalanceK: 0 };
  return createF09World({ objects: buildObjectsF09(), scenarios: sc, mode: opts.mode }, opts.seed, params);
}

/** Consignas del motor (rpm) de la ruta según el escenario (órbita lenta, rápida o estándar). */
export function routeSpeedsF09(scenarios: readonly string[]): number[] {
  if (scenarios.includes(SF9.SLOW)) return [20, 24, 28, 32];
  if (scenarios.includes(SF9.FAST)) return [50, 58, 66, 74];
  return [30, 38, 46, 54];
}

/** Radio de la masa orbitante de la ruta (cm). */
export function routeOrbitRF09(scenarios: readonly string[]): number {
  if (scenarios.includes(SF9.SMALL_R)) return 12;
  if (scenarios.includes(SF9.LARGE_R)) return 26;
  return 20;
}

export { DEFAULT_F09_PARAMS };
