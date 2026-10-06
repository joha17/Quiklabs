/**
 * Arranque de la demostración de la Práctica 6 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { CalorLab3D } from '../../../engine/calor/CalorLab3D';
import { t } from '../../i18n';
import { useP6 } from '../store';
import { DemoDirector6 } from './director';
import { buildDemoScript6 } from './script';

let active: DemoDirector6 | null = null;

export function activeDemo5(): DemoDirector6 | null {
  return active;
}

export function launchDemo6(lab: CalorLab3D): () => void {
  const st = useP6.getState;
  const steps = buildDemoScript6({
    notebook: (on, tab) => useP6.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirector6(lab, steps, {
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
