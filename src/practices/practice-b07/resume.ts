/**
 * Reanudación segura de B07 (§15, MIC-62): la de B06 más lo propio. Lo que quedó en la mano se libera y el hecho queda
 * registrado; el asa cargada se conserva como carga pero la herramienta vuelve a la mesada. Nada sube la nota.
 */
import type { MicroWorld } from '../../simulation/micro-world/types';
import { errB } from '../../simulation/optical-world/events';
import { LOOP_POS, trayPos } from '../../simulation/micro-world/geometry';
import { sanitizeOnResumeB06 } from '../practice-b06/resume';

export function sanitizeOnResumeB07(w: MicroWorld): void {
  const held = Object.values(w.objects).filter((o) => o.support === 'hand');
  if (held.length) errB(w, 'MIC-62', 'RESUME_HELD_OBJECT', 'WARN', { n: held.length });
  sanitizeOnResumeB06(w);
  for (const o of held) {
    if (o.kind === 'petriPlate') {
      const p = trayPos(Object.keys(w.micro.plates).indexOf(o.id));
      o.support = 'plateTray';
      o.pose = { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
    } else {
      o.support = 'bench';
      o.pose = o.kind === 'transferLoop' ? { x: LOOP_POS.x, y: LOOP_POS.y, z: 0.4, rotationRad: 0 } : { ...o.pose, z: 0.05 };
    }
  }
}
