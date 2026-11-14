/**
 * Arranque de la demostración de la práctica F07 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F07Lab3D } from '../../../engine/f07/F07Lab3D';
import { t } from '../../i18n';
import { useF07 } from '../store';
import { DemoDirectorF07 } from './director';
import { buildDemoScriptF07 } from './script';

let active: DemoDirectorF07 | null = null;

export function activeDemoF07(): DemoDirectorF07 | null {
  return active;
}

export function launchDemoF07(lab: F07Lab3D): () => void {
  const st = useF07.getState;
  const steps = buildDemoScriptF07({
    notebook: (on, tab) => useF07.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF07(lab, steps, {
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
