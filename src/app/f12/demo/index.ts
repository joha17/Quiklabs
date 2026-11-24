/**
 * Arranque de la demostración de la práctica F12 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F12Lab3D } from '../../../engine/f12/F12Lab3D';
import { t } from '../../i18n';
import { useF12 } from '../store';
import { DemoDirectorF12 } from './director';
import { buildDemoScriptF12 } from './script';

let active: DemoDirectorF12 | null = null;

export function activeDemoF12(): DemoDirectorF12 | null {
  return active;
}

export function launchDemoF12(lab: F12Lab3D): () => void {
  const st = useF12.getState;
  const steps = buildDemoScriptF12({
    notebook: (on, tab) => useF12.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF12(lab, steps, {
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
