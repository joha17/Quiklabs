/**
 * Arranque de la demostración de la Práctica 8 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { OrganicLab3D } from '../../../engine/organic/OrganicLab3D';
import { t } from '../../i18n';
import { useP08 } from '../store';
import { DemoDirector08 } from './director';
import { buildDemoScript08 } from './script';

let active: DemoDirector08 | null = null;

export function activeDemo08(): DemoDirector08 | null {
  return active;
}

export function launchDemo08(lab: OrganicLab3D): () => void {
  const st = useP08.getState;
  const steps = buildDemoScript08({
    notebook: (on, tab) => useP08.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  }, st().settings.route);
  const d = new DemoDirector08(lab, steps, {
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
