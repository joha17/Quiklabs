/**
 * Reanudación segura de B09 (§15.2): la de B06 (pinza, cubreobjetos, ocular, bisturí en la mesa) más lo propio: se suelta la
 * sujeción. Conserva material cortado, volumen usado, daño y láminas fuera de la caja. Función pura.
 */
import type { PlantWorld } from '../../simulation/plant-world/types';
import { sanitizeOnResumeB06 } from '../practice-b06/resume';

export function sanitizeOnResumeB09(w: PlantWorld): void {
  sanitizeOnResumeB06(w);
  w.plant.holding = null;
}
