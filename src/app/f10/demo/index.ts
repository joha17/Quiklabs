/**
 * Arranque de la demostración de la práctica F10 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F10Lab3D } from '../../../engine/f10/F10Lab3D';
import { t } from '../../i18n';
import { useF10 } from '../store';
import { DemoDirectorF10 } from './director';
import { buildDemoScriptF10 } from './script';

let active: DemoDirectorF10 | null = null;

export function activeDemoF10(): DemoDirectorF10 | null {
  return active;
}

export function launchDemoF10(lab: F10Lab3D): () => void {
  const st = useF10.getState;
  const steps = buildDemoScriptF10({
    notebook: (on, tab) => useF10.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF10(lab, steps, {
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
