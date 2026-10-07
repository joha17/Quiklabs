/**
 * Arranque de la demostración de la Práctica 10 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { GasLab3D } from '../../../engine/gas/GasLab3D';
import { t } from '../../i18n';
import { useP10 } from '../store';
import { DemoDirector10 } from './director';
import { buildDemoScript10 } from './script';

let active: DemoDirector10 | null = null;

export function activeDemo10(): DemoDirector10 | null {
  return active;
}

export function launchDemo10(lab: GasLab3D): () => void {
  const st = useP10.getState;
  const steps = buildDemoScript10({
    notebook: (on, tab) => useP10.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirector10(lab, steps, {
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
