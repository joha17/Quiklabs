/**
 * Restauración segura de un intento de la Práctica 8 (§17.2): nada en la mano, vertidos y goteros detenidos, embudo
 * sin agitar y con la llave cerrada, sin pinza ni gestos en curso. El tiempo queda en pausa en la aplicación; la placa,
 * el agitador magnético, el vacío y la estufa conservan su estado (apagarlos cambiaría la química del intento). Conserva
 * todas las cantidades y temperaturas: no enfría ni limpia nada «por milagro». Función pura (aplicación y repetición).
 */
import type { P08World } from '../../simulation/organic-world/types';

export function sanitizeOnResume08(w: P08World): void {
  w.pours = {};
  for (const d of Object.values(w.droppers)) d.squeeze01 = 0;
  for (const v of Object.values(w.vessels)) {
    v.stir01 = 0;
    if (v.valve01 !== undefined) v.valve01 = 0;
  }
  w.tongs = false;
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    // El embudo vuelve a su aro; lo demás, a la mesada (el balón, a su aro de corcho para no volcarse).
    o.support = o.kind === 'sepFunnel' ? 'ring01' : o.kind === 'roundFlask' ? 'cork01' : 'bench';
    o.pose = { ...o.pose, z: o.kind === 'sepFunnel' ? 18 : o.kind === 'roundFlask' ? 1.2 : o.kind === 'dropper' || o.kind === 'spatula' ? 0.5 : 0, rotationRad: 0 };
  }
}
