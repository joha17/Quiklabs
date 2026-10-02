import type { Amounts, World } from '../entities/types';
import type { ComponentId } from '../substances/types';
import { addAmounts, mixAmounts } from '../solutions/mixture';
import { worldTotals } from '../world/world';

const REAGENT = new Set(['REAGENT_JAR', 'REAGENT_BOTTLE', 'VIAL', 'WASH_BOTTLE', 'JUG', 'ICE_BUCKET']);
const TOOLS = new Set(['SPATULA', 'DROPPER', 'SCOOP']);
const DISCARD = new Set(['WASTE', 'TOWEL']);

export interface BalanceRow {
  component: ComponentId;
  /** Tomado de los envases de reactivo (entrada al sistema de trabajo). */
  initial: number;
  inVessels: number;
  inFilter: number;
  inResidue: number;
  spilled: number;
  adhered: number;
  discarded: number;
  evaporated: number;
  /** Diferencia (debe ser < 1 mg). */
  residual: number;
}

/**
 * §4.8 — Balance auditable por componente:
 * masa_inicial = en_recipientes + en_filtro + en_residuo + derramada + adherida + descartada (+ evaporada para el agua).
 * "Inicial" = lo extraído de los envases de reactivo durante el intento.
 */
export function massBalance(w: World, components?: ComponentId[]): BalanceRow[] {
  const initial: Amounts = {};
  const inVessels: Amounts = {};
  const inFilter: Amounts = {};
  const inResidue: Amounts = {};
  const adhered: Amounts = { ...w.ledger.adhered };
  const discarded: Amounts = {};
  for (const id in w.vessels) {
    const v = w.vessels[id];
    const a = mixAmounts(v.mix);
    if (REAGENT.has(v.type)) {
      const init = w.reagentInitial[id] ?? {};
      for (const k of Object.keys(init) as ComponentId[]) initial[k] = (initial[k] ?? 0) + (init[k] ?? 0) - (a[k] ?? 0);
      continue;
    }
    if (TOOLS.has(v.type)) addAmounts(adhered, a);
    else if (DISCARD.has(v.type)) addAmounts(discarded, a);
    else if (v.type === 'FILTER_PAPER') {
      // Torta = sólidos particulados; filtro = líquido retenido (agua + disuelto).
      const solids: Amounts = {};
      for (const [k, g] of Object.entries(v.mix.solid)) solids[k as ComponentId] = (solids[k as ComponentId] ?? 0) + (g ?? 0);
      if (v.mix.crystals) solids.KNO3 = (solids.KNO3 ?? 0) + v.mix.crystals.massG;
      addAmounts(inResidue, solids);
      const liquid: Amounts = { ...a };
      addAmounts(liquid, solids, -1);
      addAmounts(inFilter, liquid);
    } else addAmounts(inVessels, a);
  }
  const keys = components ?? (Array.from(new Set([...Object.keys(initial), ...Object.keys(w.ledger.spilled)])) as ComponentId[]);
  return keys.map((k) => {
    const row: BalanceRow = {
      component: k,
      initial: initial[k] ?? 0,
      inVessels: inVessels[k] ?? 0,
      inFilter: inFilter[k] ?? 0,
      inResidue: inResidue[k] ?? 0,
      spilled: w.ledger.spilled[k] ?? 0,
      adhered: adhered[k] ?? 0,
      discarded: discarded[k] ?? 0,
      evaporated: w.ledger.evaporated[k] ?? 0,
      residual: 0,
    };
    row.residual = row.initial - (row.inVessels + row.inFilter + row.inResidue + row.spilled + row.adhered + row.discarded + row.evaporated);
    return row;
  });
}

/** Conservación global: diferencia entre el total actual y el inicial por componente. */
export function conservationError(w: World): Amounts {
  const now = worldTotals(w);
  const out: Amounts = {};
  const keys = new Set([...Object.keys(now), ...Object.keys(w.initialTotals)]) as Set<ComponentId>;
  for (const k of keys) out[k] = (now[k] ?? 0) - (w.initialTotals[k] ?? 0);
  return out;
}
