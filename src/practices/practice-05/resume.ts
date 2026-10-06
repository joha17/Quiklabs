/**
 * Restauración segura de un intento de la Práctica 5: mechero apagado y gas cerrado, sin chispa, nada en la mano
 * (el tubo vuelve a la gradilla). La reacción no avanzó con la app cerrada. Función pura compartida por la aplicación
 * y la repetición del intento. Devuelve si el mechero estaba encendido.
 */
import type { P5World } from '../../simulation/stoich-world/types';

export function sanitizeOnResume5(w: P5World): { wasLit: boolean } {
  const g = w.gas;
  const wasLit = !['OFF', 'EXTINGUISHED', 'GAS_RELEASED'].includes(g.burner.flameState);
  g.burner.tableGasValve = 0;
  g.burner.needleGasValve = 0;
  g.burner.flameState = 'OFF';
  g.burner.flame = { ...g.burner.flame, isLit: false, heightCm: 0, innerConeHeightCm: 0, fuelFlow: 0, sootRateMgS: 0, coRateMgS: 0 };
  g.lighter.sparking = false;
  g.room.gasAccumMl = 0;
  for (const o of Object.values(g.objects)) if (o.support === 'hand' || o.support === 'falling') o.support = 'bench';
  for (const o of Object.values(w.objects)) {
    if (o.support !== 'hand') continue;
    o.support = 'bench';
    if (o.id === 'tube') {
      o.support = 'rack';
      o.pose = { x: w.objects.rack.pose.x - 3, y: w.objects.rack.pose.y, z: 0.6, rotationRad: 0 };
    }
  }
  if (w.objects.tube.support === 'tongs') {
    w.objects.tube.support = 'rack';
    w.objects.tube.pose = { x: w.objects.rack.pose.x - 3, y: w.objects.rack.pose.y, z: 0.6, rotationRad: 0 };
  }
  w.safety.lastInteractionS = w.timeS;
  return { wasLit };
}
