/**
 * Arranque de la demostración sobre una escena ya creada: une el director con el estado de la aplicación.
 */
import type { Lab3D } from '../../engine/Lab3D';
import { t } from '../i18n';
import { useLab } from '../store';
import { DemoDirector } from './director';
import { buildDemoScript } from './script';

let active: DemoDirector | null = null;

/** Director de la demostración en curso (para los controles del panel). */
export function activeDemo(): DemoDirector | null {
  return active;
}

/** Inicia la demostración en la escena; devuelve la función que la detiene. */
export function launchDemo(lab: Lab3D): () => void {
  const st = useLab.getState;
  const steps = buildDemoScript({
    open: (on, tab) => useLab.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirector(lab, steps, {
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
