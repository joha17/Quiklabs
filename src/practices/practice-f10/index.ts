/**
 * F10 — creación del mundo (viga en dos apoyos, cargas, dinamómetro, cuña, prensa de tracción con comparador y
 * escenarios docentes).
 */
import type { F10Params } from '../../simulation/f10-world/types';
import { createF10World, SF10 } from '../../simulation/f10-world/world';
import { buildObjectsF10, type F10Mode } from './definition';
import { DEFAULT_F10_PARAMS, curricularParams } from './params';
import type { F10Scenario } from './error-scenarios';

export interface PracticeF10Options {
  mode: F10Mode;
  seed: number;
  scenarios?: F10Scenario[];
  params?: Partial<F10Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (mesada inclinada, centro de masa corrido, sensores reales). */
  scientificMode?: F10Params['scientificMode'];
}

export function newPracticeF10World(opts: PracticeF10Options): import('../../simulation/f10-world/types').F10World {
  let params: F10Params = { ...structuredClone(DEFAULT_F10_PARAMS), ...(opts.params ?? {}) };
  const sc = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR') params = curricularParams(params);
  if (sc.includes(SF10.LIGHT)) params = { ...params, beamKg: 0.25 };
  if (sc.includes(SF10.HEAVY)) params = { ...params, beamKg: 0.9 };
  if (sc.includes(SF10.ALUMINIUM)) params = { ...params, material: 'aluminium' };
  if (sc.includes(SF10.STEEL)) params = { ...params, material: 'steel' };
  if (sc.includes(SF10.ELASTIC)) params = { ...params, materials: { ...params.materials, [params.material]: { ...params.materials[params.material], sigmaY: params.materials[params.material].sigmaY * 1.6 } } };
  if (sc.includes(SF10.YIELD)) params = { ...params, materials: { ...params.materials, [params.material]: { ...params.materials[params.material], sigmaY: params.materials[params.material].sigmaY * 0.6 } } };
  if (sc.includes(SF10.SLOW_UNLOAD)) params = { ...params, quickRelease: false };
  return createF10World({ objects: buildObjectsF10(), scenarios: sc, mode: opts.mode }, opts.seed, params);
}

/** Posiciones de los apoyos de la ruta (cm sobre la escala de la viga). */
export function routeSupportsF10(scenarios: readonly string[]): [number, number] {
  if (scenarios.includes(SF10.CLOSE)) return [35, 85];
  if (scenarios.includes(SF10.OVERHANG)) return [10, 90];
  return [10, 110];
}

/** Posiciones de la carga de la ruta (cm): cuatro puntos; con voladizo, el último queda más allá del apoyo B. */
export function routeLoadsF10(scenarios: readonly string[]): number[] {
  if (scenarios.includes(SF10.CLOSE)) return [60, 45, 75, 50];
  if (scenarios.includes(SF10.OVERHANG)) return [50, 30, 80, 100];
  return [60, 30, 90, 45];
}

/** Escalones elásticos de la manivela (mm) por debajo de la fluencia. */
export function routeStepsF10(scenarios: readonly string[], material: string): number[] {
  if (material === 'aluminium' || scenarios.includes(SF10.ALUMINIUM)) return [0.06, 0.12, 0.18, 0.24, 0.3];
  if (scenarios.includes(SF10.YIELD)) return [0.04, 0.08, 0.12, 0.16, 0.2];
  return [0.05, 0.1, 0.15, 0.2, 0.25];
}

/** Recorrido del ciclo plástico (mm). */
export const routePlasticF10 = (scenarios: readonly string[]) => (scenarios.includes(SF10.ELASTIC) ? 0.9 : 0.6);

export { DEFAULT_F10_PARAMS };
