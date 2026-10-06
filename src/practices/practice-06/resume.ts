/**
 * Restauración segura de un intento de la Práctica 6 (§28.1): plantilla apagada, vertidos detenidos y nada en la mano
 * (los tubos vuelven a la gradilla). El tiempo no avanzó. Función pura compartida por la aplicación y la repetición del
 * intento. Devuelve si la plantilla estaba encendida.
 */
import type { P6World } from '../../simulation/calorimetry-world/types';

export function sanitizeOnResume6(w: P6World): { wasOn: boolean } {
  const wasOn = w.plate.knob > 0.01;
  w.plate.knob = 0;
  w.pours = {};
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand' && o.support !== 'tongs') continue;
    if (w.tubes[o.id]) {
      o.support = 'rack';
      o.pose = { x: w.objects.rack.pose.x + (o.id === 'tube_fe' ? -3 : 3), y: w.objects.rack.pose.y, z: 0.6, rotationRad: 0 };
    } else {
      o.support = 'bench';
      o.pose = { ...o.pose, z: 0, rotationRad: 0 };
    }
  }
  for (const p of Object.values(w.pieces)) if (p.loc === 'spatula') p.loc = 'bench';
  w.safety.lastInteractionS = w.timeS;
  return { wasOn };
}
