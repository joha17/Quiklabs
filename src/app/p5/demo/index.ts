/**
 * Arranque de la demostración de la Práctica 5 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { StoichLab3D } from '../../../engine/stoich/StoichLab3D';
import { t } from '../../i18n';
import { useP5 } from '../store';
import { DemoDirector5 } from './director';
import { buildDemoScript5 } from './script';

let active: DemoDirector5 | null = null;

export function activeDemo5(): DemoDirector5 | null {
  return active;
}

export function launchDemo5(lab: StoichLab3D): () => void {
  const st = useP5.getState;
  const steps = buildDemoScript5({
    notebook: (on, tab) => useP5.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirector5(lab, steps, {
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
