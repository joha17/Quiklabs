/**
 * Ayudantes de prueba de F06: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F06Command, F06DispatchResult } from '../simulation/f06-world/commands';
import type { F06Params, F06World, ReadingF6 } from '../simulation/f06-world/types';
import { dispatchF06, runF06For } from '../simulation/f06-world/world';
import { newPracticeF06World } from '../practices/practice-f06';
import type { F06Scenario } from '../practices/practice-f06/error-scenarios';
import { idealRouteCommandsF6, type RouteIdsF6 } from '../practices/practice-f06/route';

export function worldF6(opts: { seed?: number; scenarios?: F06Scenario[]; params?: Partial<F06Params>; scientificMode?: F06Params['scientificMode'] } = {}): F06World {
  return newPracticeF06World({ mode: 'PRACTICE', seed: opts.seed ?? 106, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF6 = (w: F06World, c: F06Command): F06DispatchResult => dispatchF06(w, c);
export const runF6 = (w: F06World, s: number) => runF06For(w, s);
export const readingOfF6 = (w: F06World, r: F06DispatchResult): ReadingF6 => w.readings[r.id!];

export interface IdealResultF6 {
  w: F06World;
  ids: RouteIdsF6;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF6(seed = 106, scenarios: F06Scenario[] = [], mode?: F06Params['scientificMode'], start?: F06World, resume?: (w: F06World) => F06World): IdealResultF6 {
  let w = start ?? worldF6({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF6(() => w, (c) => cmdF6(w, c), (s) => runF6(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f06/route';
export { fillNotebookF6 } from '../practices/practice-f06/notebook-fill';
