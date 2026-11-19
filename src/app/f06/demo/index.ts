/**
 * Arranque de la demostración de la práctica F06 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F06Lab3D } from '../../../engine/f06/F06Lab3D';
import { t } from '../../i18n';
import { useF06 } from '../store';
import { DemoDirectorF06 } from './director';
import { buildDemoScriptF06 } from './script';

let active: DemoDirectorF06 | null = null;

export function activeDemoF06(): DemoDirectorF06 | null {
  return active;
}

export function launchDemoF06(lab: F06Lab3D): () => void {
  const st = useF06.getState;
  const steps = buildDemoScriptF06({
    notebook: (on, tab) => useF06.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF06(lab, steps, {
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
