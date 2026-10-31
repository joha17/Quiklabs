/**
 * Arranque de la demostración de la práctica B07 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { OpticalLab3D } from '../../../engine/optical/OpticalLab3D';
import { t } from '../../i18n';
import { useB07 } from '../store';
import { DemoDirectorB07 } from './director';
import { buildDemoScriptB07 } from './script';

let active: DemoDirectorB07 | null = null;

export function activeDemoB07(): DemoDirectorB07 | null {
  return active;
}

export function launchDemoB07(lab: OpticalLab3D): () => void {
  const st = useB07.getState;
  const steps = buildDemoScriptB07({
    notebook: (on, tab) => useB07.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorB07(lab, steps, {
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
