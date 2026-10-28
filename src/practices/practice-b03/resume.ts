/**
 * Reanudación segura de B03 (§6.6): la de B02 (pinza, cubreobjetos, ocular, gesto, fragmentos) más el transporte:
 * los vertidos se detienen y la hoja que estaba en la pinza deja de contar tiempo al aire. NO se tocan las cámaras,
 * las abrazaderas ni los tubos (alteraría el experimento). Conserva volumen y solutos. Función pura.
 */
import type { PermWorld } from '../../simulation/perm-world/types';
import { sanitizeOnResumeB02 } from '../practice-b02/resume';

export function sanitizeOnResumeB03(w: PermWorld): void {
  sanitizeOnResumeB02(w);
  w.perm.pours = {};
  w.perm.leafOutSince = null;
}
