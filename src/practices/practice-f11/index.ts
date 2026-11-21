/**
 * F11 — creación del mundo (tanque con sonda hidrostática, flotación, vaso de rebose con dinamómetro, balanza y
 * probeta, y escenarios docentes).
 */
import type { F11Params, F11World } from '../../simulation/f11-world/types';
import { createF11World, SF11 } from '../../simulation/f11-world/world';
import { buildObjectsF11, type F11Mode } from './definition';
import { DEFAULT_F11_PARAMS, curricularParams } from './params';
import type { F11Scenario } from './error-scenarios';

export interface PracticeF11Options {
  mode: F11Mode;
  seed: number;
  scenarios?: F11Scenario[];
  params?: Partial<F11Params>;
  /** 'CURRICULAR' (ideal) o 'REALISTIC' (agua a 20 °C, sensores reales, burbujas). */
  scientificMode?: F11Params['scientificMode'];
}

export function newPracticeF11World(opts: PracticeF11Options): F11World {
  let params: F11Params = { ...structuredClone(DEFAULT_F11_PARAMS), ...(opts.params ?? {}) };
  const sc = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR') params = curricularParams(params);
  if (sc.includes(SF11.SALINE)) params = { ...params, rhoA: 1025 };
  if (sc.includes(SF11.FLOATING)) params = { ...params, block: { ...params.block, rho: 450 } };
  if (sc.includes(SF11.SINKING)) params = { ...params, block: { ...params.block, rho: 1400 } };
  // Sensor manométrico con un cero de fábrica más corrido: sin ajustarlo, toda la curva queda desplazada.
  if (sc.includes(SF11.GAUGE)) params = { ...params, probe: { ...params.probe, offsetKPa: 0.6 } };
  return createF11World({ objects: buildObjectsF11(), scenarios: sc, mode: opts.mode }, opts.seed, params);
}

/** Cotas de la membrana de la ruta (cm sobre el fondo) para un nivel L: profundidades de 5,3 a 40,3 cm (milímetros no redondos, para que redondear al centímetro se note). */
export function routeDepthsF11(level: number): number[] {
  return [5.3, 10.3, 20.3, 30.3, 40.3].map((h) => Math.round((level - h) * 10) / 10).filter((z) => z > 0.5);
}

/** Profundidades de inmersión del bloque (cm): con el escenario parcial nunca queda cubierto. */
export function routeImmersionsF11(scenarios: readonly string[]): number[] {
  return scenarios.includes(SF11.PARTIAL) ? [0.5, 1.5, 2.5, 3.5, 4.5] : [1, 2, 3, 4, 7];
}

/** Ensayos de flotación de la ruta: el bloque y la botella con dos lastres (uno de ellos se hunde). */
export function routeFloatsF11(scenarios: readonly string[]): Array<{ id: 'float1' | 'bottle1'; ballast: number; x: number }> {
  if (scenarios.includes(SF11.SINKING)) return [{ id: 'bottle1', ballast: 100, x: 40 }, { id: 'bottle1', ballast: 200, x: 40 }, { id: 'float1', ballast: 0, x: 18 }];
  return [{ id: 'float1', ballast: 0, x: 18 }, { id: 'bottle1', ballast: 200, x: 40 }, { id: 'bottle1', ballast: 400, x: 40 }];
}

export { DEFAULT_F11_PARAMS };
