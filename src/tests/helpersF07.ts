/**
 * Ayudantes de prueba de F07: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F07Command, F07DispatchResult } from '../simulation/f07-world/commands';
import type { F07Params, F07World, ReadingF7 } from '../simulation/f07-world/types';
import { dispatchF07, runF07For } from '../simulation/f07-world/world';
import { newPracticeF07World } from '../practices/practice-f07';
import type { F07Scenario } from '../practices/practice-f07/error-scenarios';
import { idealRouteCommandsF7, type RouteIdsF7 } from '../practices/practice-f07/route';

export function worldF7(opts: { seed?: number; scenarios?: F07Scenario[]; params?: Partial<F07Params>; scientificMode?: F07Params['scientificMode'] } = {}): F07World {
  return newPracticeF07World({ mode: 'PRACTICE', seed: opts.seed ?? 107, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF7 = (w: F07World, c: F07Command): F07DispatchResult => dispatchF07(w, c);
export const runF7 = (w: F07World, s: number) => runF07For(w, s);
export const readingOfF7 = (w: F07World, r: F07DispatchResult): ReadingF7 => w.readings[r.id!];

export interface IdealResultF7 {
  w: F07World;
  ids: RouteIdsF7;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF7(seed = 107, scenarios: F07Scenario[] = [], mode?: F07Params['scientificMode'], start?: F07World, resume?: (w: F07World) => F07World): IdealResultF7 {
  let w = start ?? worldF7({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF7(() => w, (c) => cmdF7(w, c), (s) => runF7(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f07/route';
export { fillNotebookF7 } from '../practices/practice-f07/notebook-fill';
