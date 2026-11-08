/**
 * Restauración segura de un intento de F101 (§16, `sanitizeOnResume`): captura detenida, pulgar del calibrador
 * suelto, perno colocado (el anillo queda retenido), nada en la mano y el agua quieta. El tiempo no avanzó con la
 * app cerrada. Función pura compartida por la aplicación y la repetición del intento.
 */
import type { F101World } from '../../simulation/f101-world/types';
import { releaseCaliperThumb } from '../../simulation/instruments/vernier-caliper';

export function sanitizeOnResumeF101(w: F101World): void {
  w.table.sensor.capture = null;
  releaseCaliperThumb(w.caliper);
  w.table.pinIn = true;
  w.table.ring.vx = 0;
  w.table.ring.vy = 0;
  w.table.tapUntil = 0;
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    o.pose = { ...o.pose, z: 0, rotationRad: 0 };
  }
  w.gradCyl.unsettledUntil = Math.min(w.gradCyl.unsettledUntil, w.timeS);
}
