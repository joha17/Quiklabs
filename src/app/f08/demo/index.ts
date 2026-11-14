/**
 * Arranque de la demostración de la práctica F08 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F08Lab3D } from '../../../engine/f08/F08Lab3D';
import { t } from '../../i18n';
import { useF08 } from '../store';
import { DemoDirectorF08 } from './director';
import { buildDemoScriptF08 } from './script';

let active: DemoDirectorF08 | null = null;

export function activeDemoF08(): DemoDirectorF08 | null {
  return active;
}

export function launchDemoF08(lab: F08Lab3D): () => void {
  const st = useF08.getState;
  const steps = buildDemoScriptF08({
    notebook: (on, tab) => useF08.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF08(lab, steps, {
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
