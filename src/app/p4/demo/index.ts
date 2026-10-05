/**
 * Arranque de la demostración de la Práctica 4 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { ReactionLab3D } from '../../../engine/reaction/ReactionLab3D';
import { t } from '../../i18n';
import { useP4 } from '../store';
import { DemoDirector4 } from './director';
import { buildDemoScript4 } from './script';

let active: DemoDirector4 | null = null;

export function activeDemo4(): DemoDirector4 | null {
  return active;
}

export function launchDemo4(lab: ReactionLab3D): () => void {
  const st = useP4.getState;
  const steps = buildDemoScript4({
    notebook: (on, tab) => useP4.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirector4(lab, steps, {
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
