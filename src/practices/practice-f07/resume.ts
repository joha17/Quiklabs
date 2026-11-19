/**
 * Restauración segura de un intento de F07 (§16, `sanitizeOnResume`): los carros quedan quietos donde estaban (un
 * carro trabado se destraba con el émbolo descargado, devuelto a su lanzador) y los ensayos en curso se cierran. El
 * tiempo no avanzó con la app cerrada. Función pura compartida por la aplicación y la repetición del intento.
 */
import type { F07World } from '../../simulation/f07-world/types';
import { CART_A_START, CART_B_LAUNCH } from '../../simulation/f07-world/geometry';
import { mechanicalEnergyJ, totalMomentum } from '../../simulation/f07-world/conservation';

export function sanitizeOnResumeF07(w: F07World): void {
  if (w.run && !w.run.done) w.run.done = true;
  for (const id of ['cartA', 'cartB'] as const) {
    const c = w.carts[id];
    c.v = 0;
    if (c.latched) {
      c.latched = false;
      c.compression = 0;
      c.s = id === 'cartA' ? CART_A_START : CART_B_LAUNCH;
    }
  }
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = o.kind === 'cartMass' ? 'rack' : 'bench';
  // Los balances se rehacen desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ + mechanicalEnergyJ(w);
  w.momentum.externalNs = totalMomentum(w);
}
