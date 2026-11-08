/**
 * Arranque de la demostración de la práctica F101 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F101Lab3D } from '../../../engine/f101/F101Lab3D';
import { t } from '../../i18n';
import { useF101 } from '../store';
import { DemoDirectorF101 } from './director';
import { buildDemoScriptF101 } from './script';

let active: DemoDirectorF101 | null = null;

export function activeDemoF101(): DemoDirectorF101 | null {
  return active;
}

export function launchDemoF101(lab: F101Lab3D): () => void {
  const st = useF101.getState;
  const steps = buildDemoScriptF101({
    notebook: (on, tab) => useF101.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF101(lab, steps, {
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
