/**
 * Ayudantes de prueba de F12: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F12Command, F12DispatchResult } from '../simulation/f12-world/commands';
import type { F12Params, F12World, ReadingF12 } from '../simulation/f12-world/types';
import { dispatchF12, runF12For } from '../simulation/f12-world/world';
import { newPracticeF12World } from '../practices/practice-f12';
import type { F12Scenario } from '../practices/practice-f12/error-scenarios';
import { idealRouteCommandsF12, type RouteIdsF12 } from '../practices/practice-f12/route';

export function worldF12(opts: { seed?: number; scenarios?: F12Scenario[]; params?: Partial<F12Params>; scientificMode?: F12Params['scientificMode'] } = {}): F12World {
  return newPracticeF12World({ mode: 'PRACTICE', seed: opts.seed ?? 111, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF12 = (w: F12World, c: F12Command): F12DispatchResult => dispatchF12(w, c);
export const runF12 = (w: F12World, s: number) => runF12For(w, s);
export const readingOfF12 = (w: F12World, r: F12DispatchResult): ReadingF12 => w.readings[r.id!];

export interface IdealResultF12 {
  w: F12World;
  ids: RouteIdsF12;
}

/** Ruta ideal completa por comandos (la misma que sigue la demostración). */
export function idealRouteF12(seed = 111, scenarios: F12Scenario[] = [], mode?: F12Params['scientificMode'], start?: F12World, resume?: (w: F12World) => F12World): IdealResultF12 {
  let w = start ?? worldF12({ seed, scenarios, scientificMode: mode });
  const ids = idealRouteCommandsF12(() => w, (c) => cmdF12(w, c), (s) => runF12(w, s), { resume: resume ? () => (w = resume(w)) : undefined });
  return { w, ids };
}

export * from '../practices/practice-f12/route';
export { fillNotebookF12 } from '../practices/practice-f12/notebook-fill';
export { settledF12 as settled } from '../simulation/f12-world/world';
