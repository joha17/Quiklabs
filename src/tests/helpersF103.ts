/**
 * Ayudantes de prueba de F103: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F103Command, F103DispatchResult } from '../simulation/f103-world/commands';
import type { F103Params, F103World, ReadingF3 } from '../simulation/f103-world/types';
import { dispatchF103, runF103For } from '../simulation/f103-world/world';
import { newPracticeF103World } from '../practices/practice-f103';
import type { F103Scenario } from '../practices/practice-f103/error-scenarios';
import { idealRouteCommandsF3, type RouteIdsF3 } from '../practices/practice-f103/route';

export function worldF3(opts: { seed?: number; scenarios?: F103Scenario[]; params?: Partial<F103Params>; scientificMode?: F103Params['scientificMode'] } = {}): F103World {
  return newPracticeF103World({ mode: 'PRACTICE', seed: opts.seed ?? 103, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF3 = (w: F103World, c: F103Command): F103DispatchResult => dispatchF103(w, c);
export const runF3 = (w: F103World, s: number) => runF103For(w, s);
export const readingOfF3 = (w: F103World, r: F103DispatchResult): ReadingF3 => w.readings[r.id!];

export interface IdealResultF3 {
  w: F103World;
  ids: RouteIdsF3;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF3(seed = 103, scenarios: F103Scenario[] = [], mode?: F103Params['scientificMode'], start?: F103World, resume?: (w: F103World) => F103World): IdealResultF3 {
  let w = start ?? worldF3({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF3(() => w, (c) => cmdF3(w, c), (s) => runF3(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f103/route';
export { fillNotebookF3 } from '../practices/practice-f103/notebook-fill';
