/**
 * Restauración segura de un intento de F10 (§16, `sanitizeOnResume`): la manivela queda frenada donde estaba (la
 * probeta conserva su carga), la viga que volcaba termina en el tope, la mano se retira, el registrador se detiene y
 * los transitorios terminan. El tiempo no avanzó con la app cerrada. Función pura compartida por la aplicación y la
 * repetición del intento.
 */
import type { F10World } from '../../simulation/f10-world/types';
import { mechanicalEnergyF10 } from '../../simulation/f10-world/conservation';

export function sanitizeOnResumeF10(w: F10World): void {
  if (w.run && !w.run.done) w.run.done = true;
  const pr = w.press;
  pr.target = pr.u;
  pr.speed = w.params.crankSpeedMmS;
  pr.crankLocked = true;
  pr.transientUntil = -10;
  w.beam.hand = false;
  w.beam.settleUntil = 0;
  if (w.beam.pivot && !w.beam.tipped) {
    w.beam.tipped = true;
    w.beam.omega = 0;
    w.damaged = true;
    w.safety.block ??= { code: 'BEAM_TIPPED', since: w.timeS };
  }
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = 'bench';
  // Los balances se rehacen desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ + mechanicalEnergyF10(w);
}
