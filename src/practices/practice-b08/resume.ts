/**
 * Reanudación segura de B08 (§15.2): la de B06 más lo propio. Lo que quedó en la mano vuelve a la mesada; la simulación queda
 * en pausa y las lámparas conservan su estado. Nada cambia lecturas ni sube la nota.
 */
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { sanitizeOnResumeB06 } from '../practice-b06/resume';

export function sanitizeOnResumeB08(w: PhotoWorld): void {
  const held = Object.values(w.objects).filter((o) => o.support === 'hand');
  sanitizeOnResumeB06(w);
  for (const o of held) {
    o.support = 'bench';
    o.pose = { ...o.pose, z: 0 };
  }
}
