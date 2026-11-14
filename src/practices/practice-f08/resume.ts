/**
 * Restauración segura de un intento de F08 (§16, `sanitizeOnResume`): el rotor queda frenado y quieto donde estaba, la
 * masa colgante queda sostenida (o apoyada en el tope si ya había caído), el dedo fuera del eje y los ensayos en curso se
 * cierran. El tiempo no avanzó con la app cerrada. Función pura compartida por la aplicación y la repetición del intento.
 */
import type { F08World } from '../../simulation/f08-world/types';
import { mechanicalEnergyJ } from '../../simulation/f08-world/conservation';

export function sanitizeOnResumeF08(w: F08World): void {
  if (w.run && !w.run.done) w.run.done = true;
  w.rotor.omega = 0;
  w.rotor.brake = true;
  w.rotor.touch = false;
  const s = w.string;
  s.v = 0;
  if (s.mass && !s.landed) {
    // Una masa a media caída queda sostenida a mano donde estaba: la cuerda deja de tirar.
    s.held = true;
  }
  w.lastT = 0;
  for (const o of Object.values(w.objects)) if (o.support === 'hand') o.support = o.kind === 'dropMass' ? 'massRack' : o.kind === 'solid' ? 'rack' : 'bench';
  // Los balances se rehacen desde el estado saneado (lo liberado al sanear no es trabajo del estudiante).
  w.energy.externalJ = w.energy.dissipatedJ + mechanicalEnergyJ(w);
}
