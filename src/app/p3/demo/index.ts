/**
 * Arranque de la demostración de la Práctica 3 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { FlameLab3D } from '../../../engine/flame/FlameLab3D';
import { t } from '../../i18n';
import { useP3 } from '../store';
import { DemoDirector3 } from './director';
import { buildDemoScript3 } from './script';

let active: DemoDirector3 | null = null;

/** Director de la demostración en curso (para los controles del panel). */
export function activeDemo3(): DemoDirector3 | null {
  return active;
}

/** Inicia la demostración en la escena; devuelve la función que la detiene. */
export function launchDemo3(lab: FlameLab3D): () => void {
  const st = useP3.getState;
  const steps = buildDemoScript3({
    notebook: (on, tab) => useP3.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
    parts: (open, label) => useP3.setState({ partsOpen: open, partLabel: label }),
  });
  const d = new DemoDirector3(lab, steps, {
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
