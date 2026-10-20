/**
 * Arranque de la demostración de la Práctica 1 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { DensityLab3D } from '../../../engine/density/DensityLab3D';
import { t } from '../../i18n';
import { useP01 } from '../store';
import { DemoDirector01 } from './director';
import { buildDemoScript01 } from './script';

let active: DemoDirector01 | null = null;

export function activeDemo01(): DemoDirector01 | null {
  return active;
}

export function launchDemo01(lab: DensityLab3D): () => void {
  const st = useP01.getState;
  const steps = buildDemoScript01({
    notebook: (on, tab) => useP01.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirector01(lab, steps, {
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
