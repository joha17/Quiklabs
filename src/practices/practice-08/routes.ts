/**
 * Catálogo de rutas de la Práctica 8 (§2.2–§2.4): una sola práctica con tres itinerarios, `ISO` por defecto. La ruta
 * queda fija al crear el intento (se graba en el mundo y en la cinta); cambiarla exige un intento nuevo (§17.2).
 * Las cantidades son las que la guía sugiere dispensar; la estequiometría usa siempre lo REALMENTE dispensado.
 */
import type { RouteId, SpeciesId } from '../../simulation/organic-world/types';

export interface RouteSpec {
  id: RouteId;
  product: SpeciesId;
  /** Reactivos consumidos por la reacción principal (orden de la ecuación). */
  reagents: SpeciesId[];
  catalyst: SpeciesId;
  /** Tipo de reacción y técnica de aislamiento (tarjeta de la intro, §16.1). */
  reaction: 'fischer' | 'acetylation';
  isolation: 'extraction' | 'crystallization';
  productState: 'liquid' | 'solid';
  /** Consigna sugerida del baño (°C) y tiempo orientativo de calentamiento (s simulados). */
  bathC: number;
  heatS: number;
  /** Corte sugerido del módulo de fracciones (°C) para las rutas líquidas. */
  cut?: [number, number];
  /** Cantidades sugeridas (no se usan en ningún cálculo). */
  suggested: Array<{ species: SpeciesId; amount: number; unit: 'g' | 'mL' | 'drops' }>;
}

export const ROUTES08: Record<RouteId, RouteSpec> = {
  ISO: {
    id: 'ISO', product: 'IAAc', reagents: ['IAA', 'AcOH'], catalyst: 'H2SO4', reaction: 'fischer', isolation: 'extraction', productState: 'liquid', bathC: 95, heatS: 1200, cut: [136, 148],
    suggested: [{ species: 'IAA', amount: 5.0, unit: 'mL' }, { species: 'AcOH', amount: 7.0, unit: 'mL' }, { species: 'H2SO4', amount: 5, unit: 'drops' }],
  },
  ASA: {
    id: 'ASA', product: 'ASA', reagents: ['SA', 'AA'], catalyst: 'H3PO4', reaction: 'acetylation', isolation: 'crystallization', productState: 'solid', bathC: 80, heatS: 900,
    suggested: [{ species: 'SA', amount: 2.0, unit: 'g' }, { species: 'AA', amount: 5.0, unit: 'mL' }, { species: 'H3PO4', amount: 5, unit: 'drops' }],
  },
  MS: {
    id: 'MS', product: 'MeSal', reagents: ['SA', 'MeOH'], catalyst: 'H2SO4', reaction: 'fischer', isolation: 'extraction', productState: 'liquid', bathC: 70, heatS: 1800, cut: [214, 230],
    suggested: [{ species: 'SA', amount: 2.0, unit: 'g' }, { species: 'MeOH', amount: 10.0, unit: 'mL' }, { species: 'H2SO4', amount: 5, unit: 'drops' }],
  },
};

export const ROUTE_IDS: RouteId[] = ['ISO', 'ASA', 'MS'];
export const isRoute = (s: unknown): s is RouteId => s === 'ISO' || s === 'ASA' || s === 'MS';
