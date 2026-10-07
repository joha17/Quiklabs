/**
 * Restauración segura de un intento de la Práctica 10: vertidos detenidos, nada en la mano, llave de la bureta
 * cerrada y el émbolo suelto (la mano ya no lo sostiene). La reacción no avanzó con la app cerrada. Función pura
 * compartida por la aplicación y la repetición del intento.
 */
import type { P10World } from '../../simulation/gas-world/types';

export function sanitizeOnResume10(w: P10World): void {
  w.pours = {};
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    o.pose = { ...o.pose, z: 0, rotationRad: o.id === 'burette' ? Math.PI / 2 : 0 };
  }
  w.burette.stopcockOpen = false;
  w.syringe.held = false;
  w.syringe.targetMl = w.syringe.markMl;
  w.reactor.stir = 0;
  w.safety.lastInteractionS = w.timeS;
}
