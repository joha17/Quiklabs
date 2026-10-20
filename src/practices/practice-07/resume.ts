/**
 * Restauración segura de un intento de la Práctica 7 (§15.3, PNN-14): pausa el tiempo, deja las herramientas en su
 * soporte, ABRE el circuito del detector, saca la sonda de la medición activa, detiene vertidos, goteros y agitación.
 * Conserva todas las masas y concentraciones y no limpia nada «por milagro». Función pura (aplicación y repetición).
 */
import type { P07World } from '../../simulation/bonding-world/types';

export function sanitizeOnResume07(w: P07World): void {
  w.pours = {};
  for (const d of Object.values(w.droppers)) d.squeeze01 = 0;
  for (const v of Object.values(w.vessels)) v.stir01 = 0;
  w.detector.a = null;
  w.detector.b = null;
  w.detector.contactSince = null;
  w.meter.quietS = 0;
  w.meter.stable = false;
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    o.pose = { ...o.pose, z: o.kind === 'dropper' || o.kind === 'spatula' || o.kind === 'stirRod' || o.kind === 'tip' ? 0.5 : 0, rotationRad: 0 };
  }
  // Las puntas apoyadas en una muestra vuelven a la mesada (sin lectura continua).
  for (const id of ['tipA', 'tipB']) {
    const o = w.objects[id];
    if (o && o.support !== 'bench') {
      o.support = 'bench';
      o.pose = { ...o.pose, z: 0.5 };
    }
  }
}
