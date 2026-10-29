/**
 * Reanudación segura de B04 (§15.1): la de B02 (pinza, cubreobjetos, ocular, gesto) más la bioquímica: los vertidos
 * se detienen y la pipeta no queda «a medio aspirar». NO se tocan tubos, baños, placas ni lotes (alteraría el
 * experimento en curso). Conserva masas y volúmenes. Función pura.
 */
import type { BioWorld } from '../../simulation/bio-world/types';
import { sanitizeOnResumeB02 } from '../practice-b02/resume';

export function sanitizeOnResumeB04(w: BioWorld): void {
  sanitizeOnResumeB02(w);
  w.bio.pours = {};
}
