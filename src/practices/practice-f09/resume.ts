/**
 * Restauración segura de un intento de F09 (§16, `sanitizeOnResume`): el motor se desacopla y queda en cero, la mesa
 * queda frenada y quieta donde estaba, el dinamómetro suelta el cordón, el cordón central deja de recoger y los
 * cronometrajes y ensayos en curso se cierran. El tiempo no avanzó con la app cerrada. Función pura compartida por la
 * aplicación y la repetición del intento.
 */
import type { F09World } from '../../simulation/f09-world/types';
import { mechanicalEnergyJ } from '../../simulation/f09-world/conservation';

export function sanitizeOnResumeF09(w: F09World): void {
  if (w.run && !w.run.done) w.run.done = true;
  w.rotor.omega = 0;
  w.rotor.brake = 2;
  w.motor.target = 0;
  w.motor.clutch = false;
  w.motor.tau = 0;
  w.drum.pulling = false;
  w.pullTarget = null;
  w.timing = null;
  w.omegaLog = [];
  w.spin = null;
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = o.kind === 'orbitMass' ? 'rack' : 'bench';
  // Los balances se rehacen desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ + mechanicalEnergyJ(w);
}
