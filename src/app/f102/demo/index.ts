/**
 * Arranque de la demostración de la práctica F102 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F102Lab3D } from '../../../engine/f102/F102Lab3D';
import { t } from '../../i18n';
import { useF102 } from '../store';
import { DemoDirectorF102 } from './director';
import { buildDemoScriptF102 } from './script';

let active: DemoDirectorF102 | null = null;

export function activeDemoF102(): DemoDirectorF102 | null {
  return active;
}

export function launchDemoF102(lab: F102Lab3D): () => void {
  const st = useF102.getState;
  const steps = buildDemoScriptF102({
    notebook: (on, tab) => useF102.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF102(lab, steps, {
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
