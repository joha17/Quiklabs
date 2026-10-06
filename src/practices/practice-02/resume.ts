/**
 * Restauración segura de un intento de la Práctica 2 (§14): sin agitación ni vertidos activos. Función pura que usan
 * la aplicación al reanudar y la repetición del intento (verificación de la entrega), para que ambas coincidan.
 */
import type { World } from '../../simulation/entities/types';

export function sanitizeOnResume2(w: World): void {
  for (const v of Object.values(w.vessels)) {
    v.agitation = 0;
    v.agitationTool = 'NONE';
  }
  w.pours = {};
}
