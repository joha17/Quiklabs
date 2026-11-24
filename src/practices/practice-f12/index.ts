/**
 * F12 — creación del mundo (circuito con bomba, Venturi, tramo intercambiable, válvula, tres tomas con sensores,
 * caudalímetro, vaso volumétrico y cronómetro) y escenarios docentes.
 */
import type { F12Params, F12World } from '../../simulation/f12-world/types';
import { createF12World, SF12 } from '../../simulation/f12-world/world';
import { buildObjectsF12, type F12Mode } from './definition';
import { DEFAULT_F12_PARAMS, curricularParams } from './params';
import type { F12Scenario } from './error-scenarios';

export interface PracticeF12Options {
  mode: F12Mode;
  seed: number;
  scenarios?: F12Scenario[];
  params?: Partial<F12Params>;
  /** 'CURRICULAR' (Bernoulli ideal) o 'REALISTIC' (pérdidas y sensores reales). */
  scientificMode?: F12Params['scientificMode'];
}

export function newPracticeF12World(opts: PracticeF12Options): F12World {
  let params: F12Params = { ...structuredClone(DEFAULT_F12_PARAMS), ...(opts.params ?? {}) };
  const sc = opts.scenarios ?? [];
  if (opts.scientificMode === 'CURRICULAR') params = curricularParams(params);
  const K = (k: Partial<F12Params['K']>) => (params = { ...params, K: { ...params.K, ...k } });
  if (sc.includes(SF12.IDEAL)) K({ conv: 0, diff: 0, smooth: 0 });
  if (sc.includes(SF12.LOSSY)) K({ diff: 0.35 });
  if (sc.includes(SF12.ROUGH)) K({ rough: 2.5 });
  if (sc.includes(SF12.LOW)) params = { ...params, pump: { ...params.pump, H0: 18000 } };
  if (sc.includes(SF12.HIGH)) params = { ...params, pump: { ...params.pump, H0: 42000 } };
  if (sc.includes(SF12.TRANSIENT)) params = { ...params, pump: { ...params.pump, pulse: 0.03 } };
  if (sc.includes(SF12.AIR)) params = { ...params, trapCm3: 600, purgeCm3S: 12 };
  return createF12World({ objects: buildObjectsF12(), scenarios: sc, mode: opts.mode }, opts.seed, params);
}

/** Velocidades de la bomba de la ruta para la serie con el tramo liso (cinco caudales). */
export const ROUTE_SPEEDS_F12 = [0.45, 0.55, 0.65, 0.75, 0.85];
/** Velocidades de la serie con pérdidas (tramo rugoso). */
export const ROUTE_LOSS_SPEEDS_F12 = [0.5, 0.65, 0.8];
/** Posición de la válvula de la ruta (K = 25: la garganta queda con presión positiva). */
export const ROUTE_VALVE_F12 = 2;
/** Velocidad de la recolección volumétrica y volumen al que se corta (mL). */
export const ROUTE_COLLECT_F12 = { speed: 0.45, mL: 900 };

export { DEFAULT_F12_PARAMS };
