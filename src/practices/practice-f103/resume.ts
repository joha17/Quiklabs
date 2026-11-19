/**
 * Restauración segura de un intento de F103 (§16, `sanitizeOnResume`): el resorte queda descargado y el protector puesto,
 * ninguna esfera en el aire ni en el cañón (vuelven a la bandeja), el ventilador apagado y nada en la mano. El tiempo no
 * avanzó con la app cerrada. Función pura compartida por la aplicación y la repetición del intento.
 */
import type { F103World } from '../../simulation/f103-world/types';
import { trayPose } from '../../simulation/f103-world/world';

export function sanitizeOnResumeF103(w: F103World): void {
  const l = w.launcher;
  l.notch = 0;
  if (l.loaded) {
    const id = l.loaded;
    l.loaded = null;
    w.objects[id].support = 'tray';
    w.objects[id].pose = trayPose(w, id);
  }
  l.capOn = true;
  if (w.flight && !w.flight.done) {
    const o = w.objects[w.flight.ball];
    o.support = 'tray';
    o.pose = trayPose(w, w.flight.ball);
    w.flight.done = true;
    if (w.lastShot && w.lastShot.shot === w.flight.shot) w.lastShot.landed = true;
  }
  w.fan.speed = 0;
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'tray';
    o.pose = trayPose(w, o.id);
  }
  // El balance de energía se rehace desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ;
}
