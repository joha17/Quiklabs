/**
 * Extracción con conservación por pigmento (§3.4): masa_inicial = tejido + fase acuosa + extracto + papel + residuo +
 * degradada + perdida. Las masas son un PERFIL SINTÉTICO rotulado (µg por g de hoja), no el contenido real de la espinaca.
 */
export const PIGMENTS = ['caro', 'xant', 'chlA', 'chlB'] as const;
export type PigmentId = (typeof PIGMENTS)[number];
export const COMPARTMENTS = ['tissue', 'aqueous', 'extract', 'paper', 'waste', 'degraded', 'lost'] as const;
export type Compartment = (typeof COMPARTMENTS)[number];
export type PigmentLedger = Record<PigmentId, Record<Compartment, number>>;

export const emptyLedger = (): PigmentLedger => Object.fromEntries(PIGMENTS.map((p) => [p, Object.fromEntries(COMPARTMENTS.map((c) => [c, 0]))])) as PigmentLedger;

export function move(l: PigmentLedger, from: Compartment, to: Compartment, frac: number) {
  for (const p of PIGMENTS) {
    const m = l[p][from] * Math.max(0, Math.min(1, frac));
    l[p][from] -= m;
    l[p][to] += m;
  }
}

export const ledgerTotal = (l: PigmentLedger, p: PigmentId) => COMPARTMENTS.reduce((s, c) => s + l[p][c], 0);
export const inCompartment = (l: PigmentLedger, c: Compartment) => PIGMENTS.reduce((s, p) => s + l[p][c], 0);

/** Fracción que pasa del tejido a la fase orgánica: depende de la molienda y la mezcla, no se decreta. */
export const extractionFraction = (grind01: number, mix01: number, solvent01: number) => 0.92 * grind01 * mix01 * solvent01;
