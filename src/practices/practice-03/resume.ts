/**
 * Restauración segura de un intento de la Práctica 3 (§25): gas cerrado, sin llama ni chispa, nada en la mano.
 * Función pura compartida por la aplicación y la repetición del intento. Devuelve si el mechero estaba encendido.
 */
import type { FlameWorld } from '../../simulation/flame-world/types';

export function sanitizeOnResume3(w: FlameWorld): { wasLit: boolean } {
  const wasLit = !['OFF', 'EXTINGUISHED', 'GAS_RELEASED'].includes(w.burner.flameState);
  w.burner.tableGasValve = 0;
  w.burner.needleGasValve = 0;
  w.burner.flameState = 'OFF';
  w.burner.flame = { ...w.burner.flame, isLit: false, heightCm: 0, innerConeHeightCm: 0, fuelFlow: 0, sootRateMgS: 0, coRateMgS: 0 };
  w.lighter.sparking = false;
  w.room.gasAccumMl = 0;
  for (const o of Object.values(w.objects)) if (o.support === 'hand' || o.support === 'falling') o.support = 'bench';
  for (const tg of Object.values(w.tongs)) tg.holding = null;
  w.capsule.clampedBy = null;
  return { wasLit };
}
