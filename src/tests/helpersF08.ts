/**
 * Ayudantes de prueba de F08: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F08Command, F08DispatchResult } from '../simulation/f08-world/commands';
import type { F08Params, F08World, ReadingF8 } from '../simulation/f08-world/types';
import { dispatchF08, runF08For } from '../simulation/f08-world/world';
import { newPracticeF08World } from '../practices/practice-f08';
import type { F08Scenario } from '../practices/practice-f08/error-scenarios';
import { idealRouteCommandsF8, type RouteIdsF8 } from '../practices/practice-f08/route';

export function worldF8(opts: { seed?: number; scenarios?: F08Scenario[]; params?: Partial<F08Params>; scientificMode?: F08Params['scientificMode'] } = {}): F08World {
  return newPracticeF08World({ mode: 'PRACTICE', seed: opts.seed ?? 108, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF8 = (w: F08World, c: F08Command): F08DispatchResult => dispatchF08(w, c);
export const runF8 = (w: F08World, s: number) => runF08For(w, s);
export const readingOfF8 = (w: F08World, r: F08DispatchResult): ReadingF8 => w.readings[r.id!];

export interface IdealResultF8 {
  w: F08World;
  ids: RouteIdsF8;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF8(seed = 108, scenarios: F08Scenario[] = [], mode?: F08Params['scientificMode'], start?: F08World, resume?: (w: F08World) => F08World): IdealResultF8 {
  let w = start ?? worldF8({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF8(() => w, (c) => cmdF8(w, c), (s) => runF8(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f08/route';
export { fillNotebookF8 } from '../practices/practice-f08/notebook-fill';
