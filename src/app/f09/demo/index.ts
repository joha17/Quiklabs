/**
 * Arranque de la demostración de la práctica F09 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F09Lab3D } from '../../../engine/f09/F09Lab3D';
import { t } from '../../i18n';
import { useF09 } from '../store';
import { DemoDirectorF09 } from './director';
import { buildDemoScriptF09 } from './script';

let active: DemoDirectorF09 | null = null;

export function activeDemoF09(): DemoDirectorF09 | null {
  return active;
}

export function launchDemoF09(lab: F09Lab3D): () => void {
  const st = useF09.getState;
  const steps = buildDemoScriptF09({
    notebook: (on, tab) => useF09.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF09(lab, steps, {
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
