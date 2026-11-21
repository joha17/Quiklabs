/**
 * Ayudantes de prueba de F11: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F11Command, F11DispatchResult } from '../simulation/f11-world/commands';
import type { F11Params, F11World, ReadingF11 } from '../simulation/f11-world/types';
import { dispatchF11, runF11For } from '../simulation/f11-world/world';
import { newPracticeF11World } from '../practices/practice-f11';
import type { F11Scenario } from '../practices/practice-f11/error-scenarios';
import { idealRouteCommandsF11, type RouteIdsF11 } from '../practices/practice-f11/route';

export function worldF11(opts: { seed?: number; scenarios?: F11Scenario[]; params?: Partial<F11Params>; scientificMode?: F11Params['scientificMode'] } = {}): F11World {
  return newPracticeF11World({ mode: 'PRACTICE', seed: opts.seed ?? 111, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF11 = (w: F11World, c: F11Command): F11DispatchResult => dispatchF11(w, c);
export const runF11 = (w: F11World, s: number) => runF11For(w, s);
export const readingOfF11 = (w: F11World, r: F11DispatchResult): ReadingF11 => w.readings[r.id!];

export interface IdealResultF11 {
  w: F11World;
  ids: RouteIdsF11;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF11(seed = 111, scenarios: F11Scenario[] = [], mode?: F11Params['scientificMode'], start?: F11World, resume?: (w: F11World) => F11World): IdealResultF11 {
  let w = start ?? worldF11({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF11(() => w, (c) => cmdF11(w, c), (s) => runF11(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f11/route';
export { fillNotebookF11 } from '../practices/practice-f11/notebook-fill';
