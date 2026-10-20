/**
 * Restauración segura de un intento de la Práctica 1 (§15, P01-14): vertidos detenidos, pera sin aspirar, descarga
 * cerrada, nada en la mano y el nivel de la probeta quieto. El tiempo no avanzó con la app cerrada. Función pura
 * compartida por la aplicación y la repetición del intento.
 */
import type { P01World } from '../../simulation/density-world/types';

export function sanitizeOnResume01(w: P01World): void {
  w.pours = {};
  w.pipette.suction01 = 0;
  w.pipette.release01 = 0;
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    o.pose = { ...o.pose, z: o.kind === 'pipette' || o.kind === 'thermometer' || o.kind === 'caliper' ? 0.6 : 0, rotationRad: 0 };
  }
  w.cylinder.unsettledUntil = Math.min(w.cylinder.unsettledUntil, w.timeS);
  w.caliper.target = 'none';
}
