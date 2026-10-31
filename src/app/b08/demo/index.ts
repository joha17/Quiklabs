/**
 * Arranque de la demostración de la práctica B08 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { OpticalLab3D } from '../../../engine/optical/OpticalLab3D';
import { t } from '../../i18n';
import { useB08 } from '../store';
import { DemoDirectorB08 } from './director';
import { buildDemoScriptB08 } from './script';

let active: DemoDirectorB08 | null = null;

export function activeDemoB08(): DemoDirectorB08 | null {
  return active;
}

export function launchDemoB08(lab: OpticalLab3D): () => void {
  const st = useB08.getState;
  const steps = buildDemoScriptB08({
    notebook: (on, tab) => useB08.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorB08(lab, steps, {
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
