/**
 * Arranque de la demostración de la práctica F04 sobre una escena ya creada: une el director con el estado de la app.
 */
import type { F04Lab3D } from '../../../engine/f04/F04Lab3D';
import { t } from '../../i18n';
import { useF04 } from '../store';
import { DemoDirectorF04 } from './director';
import { buildDemoScriptF04 } from './script';

let active: DemoDirectorF04 | null = null;

export function activeDemoF04(): DemoDirectorF04 | null {
  return active;
}

export function launchDemoF04(lab: F04Lab3D): () => void {
  const st = useF04.getState;
  const steps = buildDemoScriptF04({
    notebook: (on, tab) => useF04.setState({ notebookOpen: on, notebookTab: tab ?? null }),
    edit: (fn) => st().setNotebook(fn),
  });
  const d = new DemoDirectorF04(lab, steps, {
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
