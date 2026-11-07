/**
 * Restauración segura de un intento de F102 (§16, `sanitizeOnResume`): el carro queda retenido y quieto, el émbolo
 * descargado, las capturas y los cronómetros detenidos, ningún cuerpo en el aire (vuelve a la bandeja) y nada en la
 * mano. El tiempo no avanzó con la app cerrada. Función pura compartida por la aplicación y la repetición del intento.
 */
import type { F102World } from '../../simulation/f102-world/types';
import { TRAY_POS } from './definition';
import { GEOF102 } from '../../simulation/f102-world/geometry';
import { tautDepth } from '../../simulation/f102-world/conservation';

export function sanitizeOnResumeF102(w: F102World): void {
  const c = w.cart;
  c.held = true;
  c.v = 0;
  w.launcher.latched = false;
  w.launcher.notchCm = 0;
  if (c.s - GEOF102.cart.halfLenM < 0) c.s = GEOF102.cart.halfLenM;
  const st = w.string;
  st.vd = 0;
  if (st.attached && w.objects.hanger01?.support === 'string') {
    const d = tautDepth(w);
    st.landed = d >= w.params.floorDepthM;
    st.depth = Math.min(d, w.params.floorDepthM);
    st.taut = !st.landed;
  }
  w.tape.running = false;
  w.gateTimer.running = false;
  w.motion.capture = null;
  w.fallTimer = { armed: false, startS: null, stopS: null, running: false };
  w.magnet.releaseAt = null;
  if (w.fall && !w.fall.landed) {
    const o = w.objects[w.fall.id];
    o.support = 'tray';
    o.pose = { x: TRAY_POS.x, y: TRAY_POS.y, z: GEOF102.tray.h, rotationRad: 0 };
    w.fall = null;
  }
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    o.pose = { ...o.pose, z: 0, rotationRad: 0 };
  }
}
