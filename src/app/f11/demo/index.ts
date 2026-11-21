/**
 * Arranque de la demostración de la práctica F11 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F11Lab3D } from '../../../engine/f11/F11Lab3D';
import { t } from '../../i18n';
import { useF11 } from '../store';
import { DemoDirectorF11 } from './director';
import { buildDemoScriptF11 } from './script';

let active: DemoDirectorF11 | null = null;

export function activeDemoF11(): DemoDirectorF11 | null {
  return active;
}

export function launchDemoF11(lab: F11Lab3D): () => void {
  const st = useF11.getState;
  const steps = buildDemoScriptF11({
    notebook: (on, tab) => useF11.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF11(lab, steps, {
    onStep: (i) => st().setDemo({ index: i, total: steps.length, key: steps[i].key, part: steps[i].part, note: null }),
    onNote: (note) => st().setDemo({ note }),
    onDone: () => {
      st().select(null);
      st().setDemo({ done: true, note: null });
    },
    dispatch: (cmd) => st().dispatch(cmd),
    select: (id) => st().select(id),
    t: (key, opts) => t(key, opts),
  });
  lab.locked = true;
  lab.onFrame = d.tick;
  d.setSpeed(st().demo?.speed ?? 1);
  active = d;
  void d.run();
  return () => {
    d.stop();
    lab.locked = false;
    if (active === d) active = null;
  };
}
