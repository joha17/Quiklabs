/**
 * Carbono inorgánico y azul de bromotimol (§3.3, caso 8.4): curva didáctica rotulada, con el HCO₃⁻ fijado por la
 * alcalinidad y el resto del DIC como CO₂(aq). El color orienta sobre el pH; no mide CO₂, biomasa ni glucosa. Dominio puro.
 */
export type BtbColor = 'yellow' | 'green' | 'blue';
export const PK1 = 6.35;

/** pH de un tubo con DIC y alcalinidad (mmol/L). */
export function phFromDic(dicMM: number, alkMM: number): number {
  const co2 = Math.max(1e-4, dicMM - alkMM);
  return PK1 + Math.log10(alkMM / co2);
}

export function btbColor(ph: number, low: number, high: number): BtbColor {
  return ph < low ? 'yellow' : ph > high ? 'blue' : 'green';
}
