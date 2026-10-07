/**
 * Incertidumbre de R (§17.5): propagación relativa en cuadratura
 *   [u(R)/R]² ≈ [u(P)/P]² + [u(V)/V]² + [u(n)/n]² + [u(T)/T]²
 * La de la presión incluye barómetro, presión de vapor (por la temperatura) y altura.
 */
import { hydroAtm } from './hydrostatic';
import { mmHgToAtm } from './ideal-gas';
import { waterVaporMmHg, type VaporModel } from './vapor';

export interface RInputsU {
  pAtm: number;
  uPAtm: number;
  vL: number;
  uVL: number;
  n: number;
  uN: number;
  tK: number;
  uTK: number;
}

export function uRelR(x: RInputsU): number {
  return Math.sqrt((x.uPAtm / x.pAtm) ** 2 + (x.uVL / x.vL) ** 2 + (x.uN / x.n) ** 2 + (x.uTK / x.tK) ** 2);
}

/** u(P_CO₂) en atm a partir de las incertidumbres del barómetro, la temperatura (vía P_H₂O) y la altura. */
export function uDryPressureAtm(o: { uBarometerAtm: number; tC: number; uTC: number; uHMm: number; ratio: number; vapor: VaporModel }): number {
  const dPv = mmHgToAtm(Math.abs(waterVaporMmHg(o.tC + o.uTC, o.vapor) - waterVaporMmHg(o.tC - o.uTC, o.vapor)) / 2);
  const dH = Math.abs(hydroAtm(o.uHMm, o.ratio));
  return Math.sqrt(o.uBarometerAtm ** 2 + dPv ** 2 + dH ** 2);
}

/** u(n) de la alícuota: masa, balón y pipeta (relativas en cuadratura). */
export function uAliquotRel(o: { massG: number; uMassG: number; flaskMl: number; uFlaskMl: number; pipetteMl: number; uPipetteMl: number }): number {
  return Math.sqrt((o.uMassG / o.massG) ** 2 + (o.uFlaskMl / o.flaskMl) ** 2 + (o.uPipetteMl / o.pipetteMl) ** 2);
}
