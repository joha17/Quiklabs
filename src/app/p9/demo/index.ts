/**
 * Arranque de la demostración de la Práctica 9 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { CationLab3D } from '../../../engine/cations/CationLab3D';
import { t } from '../../i18n';
import { useP09 } from '../store';
import { DemoDirector09 } from './director';
import { buildDemoScript09 } from './script';

let active: DemoDirector09 | null = null;

export function activeDemo09(): DemoDirector09 | null {
  return active;
}

export function launchDemo09(lab: CationLab3D): () => void {
  const st = useP09.getState;
  const steps = buildDemoScript09({
    notebook: (on, tab) => useP09.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirector09(lab, steps, {
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
