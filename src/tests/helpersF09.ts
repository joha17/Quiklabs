/**
 * Ayudantes de prueba de F09: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F09Command, F09DispatchResult } from '../simulation/f09-world/commands';
import type { F09Params, F09World, ReadingF9 } from '../simulation/f09-world/types';
import { dispatchF09, runF09For } from '../simulation/f09-world/world';
import { newPracticeF09World } from '../practices/practice-f09';
import type { F09Scenario } from '../practices/practice-f09/error-scenarios';
import { idealRouteCommandsF9, type RouteIdsF9 } from '../practices/practice-f09/route';

export function worldF9(opts: { seed?: number; scenarios?: F09Scenario[]; params?: Partial<F09Params>; scientificMode?: F09Params['scientificMode'] } = {}): F09World {
  return newPracticeF09World({ mode: 'PRACTICE', seed: opts.seed ?? 109, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF9 = (w: F09World, c: F09Command): F09DispatchResult => dispatchF09(w, c);
export const runF9 = (w: F09World, s: number) => runF09For(w, s);
export const readingOfF9 = (w: F09World, r: F09DispatchResult): ReadingF9 => w.readings[r.id!];

export interface IdealResultF9 {
  w: F09World;
  ids: RouteIdsF9;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF9(seed = 109, scenarios: F09Scenario[] = [], mode?: F09Params['scientificMode'], start?: F09World, resume?: (w: F09World) => F09World): IdealResultF9 {
  let w = start ?? worldF9({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF9(() => w, (c) => cmdF9(w, c), (s) => runF9(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f09/route';
export { fillNotebookF9 } from '../practices/practice-f09/notebook-fill';
