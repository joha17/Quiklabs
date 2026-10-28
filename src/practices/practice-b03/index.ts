/** Creación del mundo de la práctica B03 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { createCellWorld } from '../../simulation/cell-world/world';
import { SALINES } from '../../simulation/specimens/thin-section';
import { permTotals } from '../../simulation/perm-world/world';
import type { PermWorld } from '../../simulation/perm-world/types';
import { withFourObjectives } from '../practice-b01/params';
import { SC_B03 } from '../../simulation/perm-world/world';
import { buildB03Spec, buildPermState, scenarioParams, type B03Mode } from './definition';
import { DEFAULT_B03_PARAMS } from './params';
import { validScenariosB03, type B03Scenario } from './error-scenarios';

export interface PracticeB03Options {
  mode: B03Mode;
  seed: number;
  scenarios?: B03Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB03World(opts: PracticeB03Options): PermWorld {
  const seed = opts.seed >>> 0;
  const scenarios = validScenariosB03(opts.scenarios ?? []);
  const params: B01Params = scenarioParams({ ...withFourObjectives(structuredClone(DEFAULT_B03_PARAMS)), ...(opts.params ?? {}) }, scenarios, seed);
  const spec = { ...buildB03Spec(seed, opts.mode, params), scenarios };
  const w = createCellWorld(spec, {
    assigned: ['elodea'],
    routes: { fixed: false, stereo: false, video: false },
    sources: [],
    swabs: [],
    stains: [...SALINES],
    extraAllowed: { elodea: ['nacl-0.9', 'nacl-5'] },
    // Foto de la plasmólisis marcada pendiente de aprobación (SC-18): incidencia sin descuento.
    missingAssets: scenarios.includes(SC_B03.PENDING_PHOTO) ? ['elodeaPlasmo'] : [],
  }) as PermWorld;
  w.perm = buildPermState(seed, params, scenarios);
  const t = permTotals(w);
  w.perm.initial = { volumeMl: t.volumeMl, amounts: { ...t.amounts }, silverMmol: t.silverMmol, biuretMl: t.biuretMl };
  return w;
}
