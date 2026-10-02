import { interpolateTable } from '../core/math';
import type { SubstanceDef, SubstanceId, SubstanceTable } from '../substances/types';
import type { Mixture } from '../entities/types';

/** g de soluto por 100 g de agua a T. 0 si no es soluble. */
export function solubilityPer100g(def: SubstanceDef, tempC: number): number {
  if (def.waterBehavior !== 'SOLUBLE' || !def.solubilityTable) return 0;
  return interpolateTable(def.solubilityTable, tempC);
}

/** Masa máxima disuelta de una sustancia en `waterG` gramos de agua a T. */
export function capacityG(def: SubstanceDef, tempC: number, waterG: number): number {
  return (solubilityPer100g(def, tempC) / 100) * Math.max(0, waterG);
}

/** §4.4 — función de referencia del documento (la tabla viene de la configuración). */
export function maxDissolvedKno3G(subs: SubstanceTable, tempC: number, waterMassG: number): number {
  return capacityG(subs.KNO3, tempC, waterMassG);
}

/** Relación de saturación S = disuelto / capacidad (∞ si no hay agua y hay soluto). */
export function saturationRatio(m: Mixture, s: SubstanceId, subs: SubstanceTable, tempC: number): number {
  const cap = capacityG(subs[s], tempC, m.waterG);
  const d = m.dissolved[s] ?? 0;
  if (cap <= 0) return d > 0 ? Infinity : 0;
  return d / cap;
}

/** Molalidad iónica aproximada (mol de partículas / kg agua) para la elevación del punto de ebullición. */
export function particleMolality(m: Mixture): number {
  if (m.waterG <= 0) return 0;
  const molK = (m.dissolved.KNO3 ?? 0) / 101.1;
  const molNa = (m.dissolved.NaCl ?? 0) / 58.44;
  const molSuc = (m.dissolved.SUCROSE ?? 0) / 342.3;
  const molImp = (m.dissolved.IMP ?? 0) / 74.5;
  return (2 * molK + 2 * molNa + molSuc + 2 * molImp) / (m.waterG / 1000);
}
