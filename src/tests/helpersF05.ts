/**
 * Ayudantes de prueba de F05: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F05Command, F05DispatchResult } from '../simulation/f05-world/commands';
import type { F05Params, F05World, ReadingF5 } from '../simulation/f05-world/types';
import { dispatchF05, runF05For } from '../simulation/f05-world/world';
import { newPracticeF05World } from '../practices/practice-f05';
import type { F05Scenario } from '../practices/practice-f05/error-scenarios';
import { idealRouteCommandsF5, type RouteIdsF5 } from '../practices/practice-f05/route';

export function worldF5(opts: { seed?: number; scenarios?: F05Scenario[]; params?: Partial<F05Params>; scientificMode?: F05Params['scientificMode'] } = {}): F05World {
  return newPracticeF05World({ mode: 'PRACTICE', seed: opts.seed ?? 105, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF5 = (w: F05World, c: F05Command): F05DispatchResult => dispatchF05(w, c);
export const runF5 = (w: F05World, s: number) => runF05For(w, s);
export const readingOfF5 = (w: F05World, r: F05DispatchResult): ReadingF5 => w.readings[r.id!];

export interface IdealResultF5 {
  w: F05World;
  ids: RouteIdsF5;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF5(seed = 105, scenarios: F05Scenario[] = [], mode?: F05Params['scientificMode'], start?: F05World, resume?: (w: F05World) => F05World): IdealResultF5 {
  let w = start ?? worldF5({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF5(() => w, (c) => cmdF5(w, c), (s) => runF5(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f05/route';
export { fillNotebookF5 } from '../practices/practice-f05/notebook-fill';
