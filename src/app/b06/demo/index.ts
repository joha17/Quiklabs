/**
 * Arranque de la demostración de la práctica B06 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { OpticalLab3D } from '../../../engine/optical/OpticalLab3D';
import { t } from '../../i18n';
import { useB06 } from '../store';
import { DemoDirectorB06 } from './director';
import { buildDemoScriptB06 } from './script';

let active: DemoDirectorB06 | null = null;

export function activeDemoB06(): DemoDirectorB06 | null {
  return active;
}

export function launchDemoB06(lab: OpticalLab3D): () => void {
  const st = useB06.getState;
  const steps = buildDemoScriptB06({
    notebook: (on, tab) => useB06.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorB06(lab, steps, {
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
