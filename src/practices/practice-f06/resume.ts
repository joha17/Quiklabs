/**
 * Restauración segura de un intento de F06 (§16, `sanitizeOnResume`): el carro vuelve al lanzador sin trabar (el
 * resorte queda descargado), la esfera del péndulo en reposo abajo, la carga colgada quieta en su equilibrio y los
 * ensayos en curso cerrados. El tiempo no avanzó con la app cerrada. Función pura compartida por la aplicación y la
 * repetición del intento.
 */
import type { F06World } from '../../simulation/f06-world/types';
import { CART_START_S } from '../../simulation/f06-world/geometry';
import { mechanicalEnergyJ } from '../../simulation/f06-world/conservation';
import { standEquilibrium } from '../../simulation/f06-world/world';

export function sanitizeOnResumeF06(w: F06World): void {
  if (w.run && !w.run.done) w.run.done = true;
  if (w.swing && !w.swing.done) w.swing.done = true;
  const c = w.cart;
  if (c.on === 'track') {
    c.s = CART_START_S;
    c.v = 0;
    c.latched = false;
    c.compression = 0;
    c.held = false;
  }
  const p = w.pend;
  p.held = false;
  p.thetaDeg = 0;
  p.omega = 0;
  p.y = 0;
  p.vy = 0;
  w.stand.x = standEquilibrium(w);
  w.stand.v = 0;
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = o.kind === 'slotMass' || o.kind === 'cartMass' || o.kind === 'hanger' ? 'rack' : 'bench';
  // El balance de energía se rehace desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ + mechanicalEnergyJ(w);
}
