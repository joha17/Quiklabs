/**
 * Restauración segura de un intento de la Práctica 4 (§27): mechero apagado y gas cerrado, sin chispa, vertidos
 * detenidos, nada en la mano; una cinta de Mg que ardía queda como residuo. Función pura compartida por la aplicación
 * y la repetición del intento. Devuelve si el mechero estaba encendido.
 */
import type { P4World } from '../../simulation/reaction-world/types';

export function sanitizeOnResume4(w: P4World): { wasLit: boolean } {
  const g = w.gas;
  const wasLit = !['OFF', 'EXTINGUISHED', 'GAS_RELEASED'].includes(g.burner.flameState);
  g.burner.tableGasValve = 0;
  g.burner.needleGasValve = 0;
  g.burner.flameState = 'OFF';
  g.burner.flame = { ...g.burner.flame, isLit: false, heightCm: 0, innerConeHeightCm: 0, fuelFlow: 0, sootRateMgS: 0, coRateMgS: 0 };
  g.lighter.sparking = false;
  g.room.gasAccumMl = 0;
  w.pours = {};
  w.squeezes = {};
  for (const o of Object.values(g.objects)) if (o.support === 'hand' || o.support === 'falling') o.support = 'bench';
  for (const o of Object.values(w.objects)) if (o.support === 'hand' || o.support === 'falling') o.support = 'bench';
  for (const [tid, tg] of Object.entries(w.tongs)) {
    if (tg.holding && w.objects[tg.holding]?.support === `tongs:${tid}`) w.objects[tg.holding].support = 'bench';
    tg.holding = null;
  }
  for (const r of Object.values(w.ribbons)) if (r.phase === 'BRIGHT_COMBUSTION' || r.phase === 'IGNITION_THRESHOLD') r.phase = 'GLOWING_RESIDUE';
  return { wasLit };
}
