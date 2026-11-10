/**
 * Ayudantes de prueba de F04: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F04Command, F04DispatchResult } from '../simulation/f04-world/commands';
import type { F04Params, F04World, ReadingF4 } from '../simulation/f04-world/types';
import { dispatchF04, runF04For } from '../simulation/f04-world/world';
import { newPracticeF04World } from '../practices/practice-f04';
import type { F04Scenario } from '../practices/practice-f04/error-scenarios';
import { idealRouteCommandsF4, type RouteIdsF4 } from '../practices/practice-f04/route';

export function worldF4(opts: { seed?: number; scenarios?: F04Scenario[]; params?: Partial<F04Params>; scientificMode?: F04Params['scientificMode'] } = {}): F04World {
  return newPracticeF04World({ mode: 'PRACTICE', seed: opts.seed ?? 104, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF4 = (w: F04World, c: F04Command): F04DispatchResult => dispatchF04(w, c);
export const runF4 = (w: F04World, s: number) => runF04For(w, s);
export const readingOfF4 = (w: F04World, r: F04DispatchResult): ReadingF4 => w.readings[r.id!];

export interface IdealResultF4 {
  w: F04World;
  ids: RouteIdsF4;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF4(seed = 104, scenarios: F04Scenario[] = [], mode?: F04Params['scientificMode'], start?: F04World, resume?: (w: F04World) => F04World): IdealResultF4 {
  let w = start ?? worldF4({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF4(() => w, (c) => cmdF4(w, c), (s) => runF4(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f04/route';
export { fillNotebookF4 } from '../practices/practice-f04/notebook-fill';
