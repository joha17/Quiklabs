/**
 * Valores esperables de la Práctica 8 (§3.3, §8): lo que la rúbrica y la revisión docente comparan. Hay dos fuentes
 * distintas y no se mezclan: las LECTURAS del estudiante (con sus sesgos, contra las que se corrigen los cálculos) y la
 * VERDAD del mundo (cantidades realmente dispensadas, conversión, composición del producto), que solo ve el docente.
 */
import type { P08World, Reading08, RouteId, SpeciesId } from '../../simulation/organic-world/types';
import { SPECIES } from '../../simulation/organic-chemistry/species';
import { MAIN_REACTION, PRODUCT } from '../../simulation/organic-chemistry/stoichiometry';
import { CATALYST, conversion, limitingMol0 } from '../../simulation/organic-world/world';
import { parseFraction, parseNum, type Entry, type P08Notebook, type ReagentRow } from './notebook';
import { labelPurity } from './definition';

export const reading = (w: P08World, id: string | null | undefined): Reading08 | undefined => (id ? w.readings[id] : undefined);
export const readingsOf = (w: P08World, kind: Reading08['kind']) => w.readingOrder.map((id) => w.readings[id]).filter((r) => r.kind === kind);
export const validReadings = (w: P08World, kind: Reading08['kind']) => readingsOf(w, kind).filter((r) => r.valid);

/** Valor de una celda: la lectura importada si existe; si no, lo escrito. */
export function cellValue(w: P08World, e: Entry): number {
  const r = reading(w, e.readingId);
  if (r) return r.value;
  return parseNum(e.value);
}

/** Reactivos de la reacción principal de la ruta (con su coeficiente). */
export const reagentsOf = (route: RouteId) => (Object.entries(MAIN_REACTION[route].nu) as Array<[SpeciesId, number]>).filter(([, nu]) => nu < 0).map(([k, nu]) => ({ species: k, nu: -nu }));

/** Frasco de origen de cada reactivo en la ruta (para la pureza declarada en su ficha). */
export const SOURCE_OF: Record<RouteId, Partial<Record<SpeciesId, string>>> = {
  ISO: { IAA: 'btIAA', AcOH: 'btAcOH', H2SO4: 'btH2SO4' },
  ASA: { SA: 'jarSA', AA: 'btAA', H3PO4: 'btH3PO4' },
  MS: { SA: 'jarSA', MeOH: 'btMeOH', H2SO4: 'btH2SO4' },
};

export const declaredPurity = (w: P08World, sp: SpeciesId) => {
  const src = SOURCE_OF[w.route][sp];
  return src ? (labelPurity(w.route, src, w.scenarios)[sp] ?? 1) : 1;
};

/** Moles que calcula una fila del Cuadro A con SUS datos (cantidad, unidad, pureza). */
export function rowMoles(row: ReagentRow): number {
  if (!row.species) return NaN;
  const amt = parseNum(row.amount);
  const pur = row.purity.trim() ? parseFraction(row.purity) : 1;
  const sp = SPECIES[row.species];
  if (!Number.isFinite(amt) || !Number.isFinite(pur)) return NaN;
  if (row.unit === 'g') return (amt * pur) / sp.molarMass;
  if (row.unit === 'mL') return sp.densityGml ? (amt * sp.densityGml * pur) / sp.molarMass : NaN;
  return NaN;
}

/** Limitante y masa teórica que se siguen de los datos del Cuadro A (coherencia interna). */
export function plannedLimiting(nb: P08Notebook) {
  let best: { species: SpeciesId; xi: number } | null = null;
  for (const { species, nu } of reagentsOf(nb.route)) {
    const row = nb.tableA.reagents.find((r) => r.species === species);
    const n = row ? rowMoles(row) : NaN;
    if (!Number.isFinite(n)) return null;
    const xi = n / nu;
    if (!best || xi < best.xi) best = { species, xi };
  }
  if (!best) return null;
  return { limiting: best.species, theoreticalG: best.xi * SPECIES[PRODUCT[nb.route]].molarMass };
}

/** VERDAD (docente): limitante real con lo dispensado y masa teórica real. */
export function trueLimiting(w: P08World) {
  let best: { species: SpeciesId; xi: number } | null = null;
  for (const { species, nu } of reagentsOf(w.route)) {
    const xi = (w.evidence[`n0:${species}`] ?? 0) / nu;
    if (!best || xi < best.xi) best = { species, xi };
  }
  return { limiting: best?.species ?? null, theoreticalG: limitingMol0(w) * SPECIES[PRODUCT[w.route]].molarMass, conversion: conversion(w) };
}

/** Masa teórica que daría la libreta si copiara el producto de otra ruta (ORG53). */
export function otherRouteTheoreticals(route: RouteId, limitingMol: number): number[] {
  return (['ISO', 'ASA', 'MS'] as RouteId[]).filter((r) => r !== route).map((r) => limitingMol * SPECIES[PRODUCT[r]].molarMass);
}

/** Recipiente del producto aislado según la ruta. */
export const productHolder = (route: RouteId) => (route === 'ASA' ? 'fpFine' : 'vialP');

/** Lecturas de masa del recipiente del producto ya con el producto (después de aislar). */
export function productMassReadings(w: P08World) {
  const holder = productHolder(w.route);
  const p = PRODUCT[w.route];
  return validReadings(w, 'mass').filter((r) => (r.snapshot.sources ?? []).some((s) => s === holder || s === 'fpCoarse') && (r.snapshot.productG ?? 0) > 0.05 && r.snapshot.species.includes(p));
}

/** Rendimiento aparente que se sigue de las lecturas citadas por el estudiante (§3.3). */
export function apparentFromNotebook(nb: P08Notebook, w: P08World): number {
  const m = cellValue(w, nb.tableC.isolatedMass);
  const th = parseNum(nb.tableC.theoreticalG || nb.tableA.theoreticalG);
  return Number.isFinite(m) && th > 0 ? (100 * m) / th : NaN;
}

export const catalystOk = (w: P08World) => (w.vessels.rf ? true : false) && (w.evidence[`cat:${CATALYST[w.route]}`] ?? 0) > 0;

export const near = (a: number, b: number, rel: number, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
