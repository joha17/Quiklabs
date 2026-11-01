/**
 * Reanudación segura de B10 (§15.6): la de B06 (pinza, cubreobjetos, ocular, bisturí en la mesa) más cerrar el visor. Conserva rótulos,
 * respuestas, orientaciones y láminas fuera de la caja. Función pura.
 */
import type { AnimalWorld } from '../../simulation/animal-world/types';
import { sanitizeOnResumeB06 } from '../practice-b06/resume';

export function sanitizeOnResumeB10(w: AnimalWorld): void {
  sanitizeOnResumeB06(w);
  w.animal.openModel = null;
  w.animal.compareWith = null;
  w.animal.showStudyLabels = false;
}
