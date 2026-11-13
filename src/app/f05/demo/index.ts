/**
 * Arranque de la demostración de la práctica F05 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F05Lab3D } from '../../../engine/f05/F05Lab3D';
import { t } from '../../i18n';
import { useF05 } from '../store';
import { DemoDirectorF05 } from './director';
import { buildDemoScriptF05 } from './script';

let active: DemoDirectorF05 | null = null;

export function activeDemoF05(): DemoDirectorF05 | null {
  return active;
}

export function launchDemoF05(lab: F05Lab3D): () => void {
  const st = useF05.getState;
  const steps = buildDemoScriptF05({
    notebook: (on, tab) => useF05.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF05(lab, steps, {
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
