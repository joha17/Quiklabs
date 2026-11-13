/**
 * Restauración segura de un intento de F05 (§16, `sanitizeOnResume`): el tirador vuelve al inicio de su carril con el
 * motor detenido (el cable queda flojo), el bloque en reposo donde estaba (o en la partida si estaba retenido por el
 * pasador o en la mano) y los ensayos en curso cerrados. El tiempo no avanzó con la app cerrada. Función pura
 * compartida por la aplicación y la repetición del intento.
 */
import type { F05World } from '../../simulation/f05-world/types';
import { BLOCK_MIN_S, BLOCK_START_S, GEOF05 } from '../../simulation/f05-world/geometry';
import { mechanicalEnergyJ } from '../../simulation/f05-world/conservation';

export function sanitizeOnResumeF05(w: F05World): void {
  if (w.pull && !w.pull.done) w.pull.done = true;
  if (w.slide && !w.slide.done) w.slide.done = true;
  const pu = w.puller;
  pu.driveMs = 0;
  pu.p = GEOF05.puller.s0;
  pu.ext = 0;
  pu.tensionN = 0;
  const b = w.block;
  b.v = 0;
  if (b.on === 'plane') {
    if (b.pinned) b.pinned = false;
    // Con el tablero inclinado más allá del ángulo de reposo el bloque queda contra el tope; si no, en la partida.
    b.s = w.plane.relDeg > 5 ? BLOCK_MIN_S : Math.max(BLOCK_MIN_S, Math.min(b.s, BLOCK_START_S));
    w.tilt.armed = false;
  }
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = o.kind === 'ballast' || o.kind === 'strip' ? 'rack' : 'bench';
  // El balance de energía se rehace desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ + mechanicalEnergyJ(w);
}
