/**
 * Ayudantes de prueba de F10: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F10Command, F10DispatchResult } from '../simulation/f10-world/commands';
import type { F10Params, F10World, ReadingF10 } from '../simulation/f10-world/types';
import { dispatchF10, runF10For } from '../simulation/f10-world/world';
import { newPracticeF10World } from '../practices/practice-f10';
import type { F10Scenario } from '../practices/practice-f10/error-scenarios';
import { idealRouteCommandsF10, type RouteIdsF10 } from '../practices/practice-f10/route';

export function worldF10(opts: { seed?: number; scenarios?: F10Scenario[]; params?: Partial<F10Params>; scientificMode?: F10Params['scientificMode'] } = {}): F10World {
  return newPracticeF10World({ mode: 'PRACTICE', seed: opts.seed ?? 110, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF10 = (w: F10World, c: F10Command): F10DispatchResult => dispatchF10(w, c);
export const runF10 = (w: F10World, s: number) => runF10For(w, s);
export const readingOfF10 = (w: F10World, r: F10DispatchResult): ReadingF10 => w.readings[r.id!];

export interface IdealResultF10 {
  w: F10World;
  ids: RouteIdsF10;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF10(seed = 110, scenarios: F10Scenario[] = [], mode?: F10Params['scientificMode'], start?: F10World, resume?: (w: F10World) => F10World): IdealResultF10 {
  let w = start ?? worldF10({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF10(() => w, (c) => cmdF10(w, c), (s) => runF10(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f10/route';
export { fillNotebookF10 } from '../practices/practice-f10/notebook-fill';
