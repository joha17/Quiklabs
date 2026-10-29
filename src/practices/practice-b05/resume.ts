/**
 * Reanudación segura de B05 (§6.6): la de B02 (pinza, cubreobjetos, ocular, gesto, fragmentos) más la enzimática: los
 * vertidos se detienen. NO se tocan los tubos, los baños, las placas ni el colector (alteraría el experimento en
 * curso). Conserva volumen, especies y oxígeno. Función pura.
 */
import type { EnzWorld } from '../../simulation/enz-world/types';
import { sanitizeOnResumeB02 } from '../practice-b02/resume';

export function sanitizeOnResumeB05(w: EnzWorld): void {
  sanitizeOnResumeB02(w);
  w.enz.pours = {};
}
