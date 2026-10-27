/**
 * Reanudación segura de B01 (§6.7): nada queda en la mano, la pinza suelta lo que sostenía (la hoja vuelve a su
 * recipiente, el cubreobjetos a su caja), se cierra el ocular y termina el gesto que estuviera en curso. NO se mueven la platina ni el objetivo: alteraría la
 * observación. Conserva todas las cantidades. Función pura (aplicación y repetición).
 */
import type { OpticalWorld } from '../../simulation/optical-world/types';
import { COVER_BOX } from '../../simulation/optical-world/geometry';

export function sanitizeOnResumeB01(w: OpticalWorld): void {
  const h = w.forceps.holding;
  if (h?.kind === 'specimen') w.dish.leaves += 1;
  if (h?.kind === 'cover') {
    const c = w.covers[h.coverId];
    c.state = 'box';
    c.tiltDeg = 0;
    w.objects[h.coverId].support = 'coverBox';
    w.objects[h.coverId].pose = { x: COVER_BOX.x, y: COVER_BOX.y, z: COVER_BOX.z, rotationRad: 0 };
  }
  if (h?.kind === 'sample') {
    const o = w.objects[h.sampleId];
    o.support = 'bench';
    o.pose = { ...o.pose, z: 0, rotationRad: 0 };
  }
  w.forceps.holding = null;
  w.view.instrument = null;
  // Un arrastre interrumpido termina; los ángulos ya validados de los mandos se conservan tal cual.
  w.gesture = null;
  // Mundos guardados antes del cabezal binocular del compuesto.
  const m = w.microscope;
  m.ipdMm ??= w.params.stereo.userIpdMm;
  m.leftDiopter ??= 0;
  m.rightDiopter ??= 0;
  w.params.microscope.ipdRangeMm ??= [48, 75];
  w.params.microscope.diopterRange ??= 5;
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    o.pose = { ...o.pose, z: o.kind === 'slide' || o.kind === 'fixedSlide' ? 0.05 : o.kind === 'forceps' || o.kind === 'scalpel' ? 0.4 : 0, rotationRad: 0 };
  }
}
