/**
 * Restauración segura de un intento de F04 (§16, `sanitizeOnResume`): el carro queda retenido por el pestillo en la
 * partida, el portapesas sostenido (sin energía de caída pendiente) o en el estante si estaba en el suelo, la pareja en
 * reposo y nada en la mano. El tiempo no avanzó con la app cerrada. Función pura compartida por la aplicación y la
 * repetición del intento.
 */
import type { F04World } from '../../simulation/f04-world/types';
import { CART_START_S, PAIR_TOUCH_M } from '../../simulation/f04-world/geometry';
import { PAIR_P0, tautDepth } from '../../simulation/f04-world/world';
import { mechanicalEnergyJ } from '../../simulation/f04-world/conservation';

export function sanitizeOnResumeF04(w: F04World): void {
  const c = w.cart;
  if (w.run && !w.run.done) w.run.done = true;
  if (c.on === 'track') {
    c.s = CART_START_S;
    c.v = 0;
    c.latched = true;
  }
  const st = w.string;
  if (st.hung) {
    st.landed = false;
    st.vh = 0;
    st.held = true;
    st.slack = w.params.holdSlackM;
    st.depth = tautDepth(c.s) - st.slack;
    w.objects.hanger01.support = 'string';
  }
  const pr = w.pair;
  pr.push = null;
  pr.vP = 0;
  pr.vQ = 0;
  pr.xP = PAIR_P0;
  pr.xQ = PAIR_P0 + PAIR_TOUCH_M;
  pr.contactN = 0;
  pr.active = false;
  if (w.pairRec) w.pairRec.done = true;
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = o.kind === 'slotMass' || o.kind === 'hanger' ? 'rack' : o.support;
  // El balance de energía se rehace desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ + mechanicalEnergyJ(w);
}
