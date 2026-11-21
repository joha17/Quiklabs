/**
 * Restauración segura de un intento de F11 (§16, `sanitizeOnResume`): se cierran el grifo, la bomba, el vaciado y el
 * agitador, el brazo del soporte queda donde estaba, los objetos que flotaban quedan quietos y el oleaje termina. El
 * tiempo no avanzó con la app cerrada. Función pura compartida por la aplicación y la repetición del intento.
 */
import type { F11World } from '../../simulation/f11-world/types';

export function sanitizeOnResumeF11(w: F11World): void {
  w.valves.tap = false;
  w.valves.pump = false;
  w.valves.drain = false;
  w.valves.agitator = false;
  w.tank.waveUntil = 0;
  w.stand.target = w.stand.zb;
  w.probe.locked = true;
  for (const f of Object.values(w.floats)) f.v = 0;
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = 'bench';
}
