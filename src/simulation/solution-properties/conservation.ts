/**
 * Inventarios por componente (§3.2, §6.5): sumar, escalar, volumen de líquido y especies iónicas derivadas.
 *   m_i^inicio = Σ_f m_i,f(t) + m_i,materiales(t) + m_i,residuos(t) + m_i,pérdidas(t)
 * Los iones se calculan a partir de la masa DISUELTA y de la ficha: nunca se guardan como masa adicional.
 */
import { CHARGE, MATERIALS, isLiquid, type IonId, type MaterialId } from './materials';
import { weakAcidIonizedM } from './weak-electrolytes';
import type { IonConcentrations } from './conductivity';

export type Comp = Partial<Record<MaterialId, number>>;

export const EMPTY: Comp = Object.freeze({}) as Comp;

export function compTotal(c: Comp): number {
  let s = 0;
  for (const v of Object.values(c)) s += v ?? 0;
  return s;
}

/** a += b·f (en el lugar). Elimina restos numéricos por debajo de 1e-15 g. */
export function compAddInto(a: Comp, b: Comp, f = 1): Comp {
  for (const [k, v] of Object.entries(b) as Array<[MaterialId, number]>) {
    const n = (a[k] ?? 0) + (v ?? 0) * f;
    if (Math.abs(n) < 1e-15) delete a[k];
    else a[k] = n;
  }
  return a;
}

export const compScale = (c: Comp, f: number): Comp => compAddInto({}, c, f);

/** Quita una fracción f (0–1) de un inventario y la devuelve. */
export function compTake(c: Comp, f: number): Comp {
  const part = compScale(c, Math.max(0, Math.min(1, f)));
  compAddInto(c, part, -1);
  return part;
}

/** Volumen de los componentes LÍQUIDOS (mL; aditivo, simplificación curricular declarada). */
export function liquidMl(c: Comp): number {
  let ml = 0;
  for (const [k, g] of Object.entries(c) as Array<[MaterialId, number]>) if (isLiquid(k)) ml += (g ?? 0) / MATERIALS[k].densityGml;
  return ml;
}

export const materialsIn = (c: Comp, minG = 1e-9): MaterialId[] => (Object.entries(c) as Array<[MaterialId, number]>).filter(([, g]) => (g ?? 0) > minG).map(([k]) => k);

/**
 * Iones móviles de una fase acuosa (mol/L): disociación completa de lo DISUELTO de cada electrolito fuerte e
 * ionización parcial del ácido débil (§3.3). La sacarosa, la glicerina o los alcoholes no aportan iones.
 */
export function aqueousIons(phase: Comp): IonConcentrations {
  const vL = liquidMl(phase) / 1000;
  const out: IonConcentrations = {};
  if (vL <= 1e-9) return out;
  for (const [k, g] of Object.entries(phase) as Array<[MaterialId, number]>) {
    const m = MATERIALS[k];
    if (!m.molarMassGmol || !(g > 0)) continue;
    const mol = (g * m.purity) / m.molarMassGmol;
    if (m.dissociation) {
      for (const { ion, nu } of m.dissociation.ions) out[ion] = (out[ion] ?? 0) + (nu * mol) / vL;
    } else if (m.weakAcid) {
      const x = weakAcidIonizedM(m.weakAcid.ka, mol / vL);
      for (const ion of m.weakAcid.ions) out[ion] = (out[ion] ?? 0) + x;
    }
  }
  return out;
}

/** Carga neta de un conjunto de iones (mol/L · z): cero por construcción del modelo. */
export function netCharge(ions: IonConcentrations): number {
  let q = 0;
  for (const [ion, c] of Object.entries(ions) as Array<[IonId, number]>) q += (c ?? 0) * CHARGE[ion];
  return q;
}

/** Concentración formal (mol/L) de un soluto en una fase. */
export function formalM(phase: Comp, id: MaterialId): number {
  const m = MATERIALS[id];
  const vL = liquidMl(phase) / 1000;
  if (!m.molarMassGmol || vL <= 1e-9) return 0;
  return (((phase[id] ?? 0) * m.purity) / m.molarMassGmol) / vL;
}
