/**
 * Arranque de la demostración de la práctica F103 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F103Lab3D } from '../../../engine/f103/F103Lab3D';
import { t } from '../../i18n';
import { useF103 } from '../store';
import { DemoDirectorF103 } from './director';
import { buildDemoScriptF103 } from './script';

let active: DemoDirectorF103 | null = null;

export function activeDemoF103(): DemoDirectorF103 | null {
  return active;
}

export function launchDemoF103(lab: F103Lab3D): () => void {
  const st = useF103.getState;
  const steps = buildDemoScriptF103({
    notebook: (on, tab) => useF103.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF103(lab, steps, {
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
