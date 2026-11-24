/**
 * Restauración segura de un intento de F12 (§16, `sanitizeOnResume`): la bomba se apaga y el rotor queda detenido, el
 * caudal en cero, el cronómetro parado, el desviador vuelve al depósito y nada queda en la mano. El tiempo no avanzó
 * con la app cerrada. Función pura compartida por la aplicación y la repetición del intento.
 */
import type { F12World } from '../../simulation/f12-world/types';

export function sanitizeOnResumeF12(w: F12World): void {
  w.pump.on = false;
  w.pump.n = 0;
  w.flow.Q = 0;
  w.flow.dQdt = 0;
  w.flow.Qavg = 0;
  w.flow.meterQ = 0;
  w.flow.surgeUntil = -1;
  if (w.timer.running) {
    w.timer.elapsed += w.timeS - w.timer.startT;
    w.timer.running = false;
    w.timer.stoppedAt = w.timeS;
  }
  if (w.collect.diverter === 'beaker') {
    w.collect.diverter = 'sump';
    w.collect.endT = w.timeS;
  }
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = 'bench';
}
