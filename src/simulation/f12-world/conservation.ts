/**
 * Balances de F12 (§6, `conservation.ts` propio de la práctica):
 * - Masa (volumen) de agua: depósito + circuito (volumen interior − aire) + vaso volumétrico + derrame + lo secado con
 *   la toalla = lo inicial. El circuito es cerrado: las fugas y la purga van a la mesada y se contabilizan.
 * - Continuidad: en régimen el caudal es el mismo en cada sección del tramo de ensayo, salvo lo que sale por una junta
 *   que gotea (se resta aguas abajo de ella).
 * - Energía por unidad de volumen: p + ½ρv² + ρgz se conserva entre tomas salvo las pérdidas ½ρKv² declaradas y la
 *   aceleración del fluido (ρ L/A dQ/dt); la potencia disipada es Q·Δp_pérdidas.
 */
import type { F12World } from './types';

export const A1 = (w: F12World) => (Math.PI * w.params.D1 ** 2) / 4;
/** Área libre de la garganta (m²): el tapón de goma tapa el 35 % (F12-E18). */
export const A2 = (w: F12World) => ((Math.PI * w.params.D2 ** 2) / 4) * (w.circuit.obstructed ? 0.65 : 1);
export const A2nominal = (w: F12World) => (Math.PI * w.params.D2 ** 2) / 4;

/** Agua dentro del circuito (cm³). */
export const circuitWater = (w: F12World) => Math.max(0, w.params.pipeCm3 - w.circuit.airCm3);

export function waterTotal(w: F12World): number {
  return w.sump + circuitWater(w) + w.collect.beakerVol + w.spill + w.mopped;
}

export function conservedTotalsF12(w: F12World): Record<string, number> {
  return { waterCm3: waterTotal(w) };
}
