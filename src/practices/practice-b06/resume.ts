/**
 * Reanudación segura de B06 (§15.2): la de B02 (pinza, cubreobjetos, ocular, gesto, fragmentos) más lo propio. El
 * bisturí que quedó en la mano vuelve a la mesa; nada se reescribe como una operación nueva ni sube la nota. La
 * viabilidad de los protistas, el aceite y las marcas se conservan tal cual. Función pura.
 */
import type { DivWorld } from '../../simulation/div-world/types';
import { sanitizeOnResumeB02 } from '../practice-b02/resume';

export function sanitizeOnResumeB06(w: DivWorld): void {
  sanitizeOnResumeB02(w);
  const sc = w.objects.sc;
  if (sc?.support === 'hand') {
    sc.support = 'bench';
    sc.pose = { x: 180, y: 18, z: 0.4, rotationRad: 0 };
  }
  w.div.sharpCarried = false;
}
