/**
 * Restauración segura de un intento de la Práctica 9 (§6.4, §16): la llama virtual se apaga, la pipeta y los vertidos
 * se detienen, el rotor queda detenido (sin perder lo ya sedimentado) y nada queda en la mano. Conserva todas las
 * cantidades. Función pura (aplicación y repetición).
 */
import type { P09World } from '../../simulation/cation-analysis-world/types';

export function sanitizeOnResume09(w: P09World): void {
  w.pours = {};
  w.pipette.squeeze01 = 0;
  for (const v of Object.values(w.vessels)) v.stir01 = 0;
  w.flame.ignited = false;
  w.flame.ignitedAt = null;
  w.flame.emitting = {};
  const c = w.centrifuge;
  c.rpm = 0;
  c.targetRpm = 0;
  c.spinUntil = null;
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    o.pose = { ...o.pose, z: o.kind === 'pipette' || o.kind === 'loop' ? 0.5 : 0, rotationRad: 0 };
  }
}
