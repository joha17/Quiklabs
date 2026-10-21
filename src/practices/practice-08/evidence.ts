/**
 * Evidencia de la Práctica 8 (§2.1, §17.2): las siete etapas `stage:*` que leen la máquina, la rúbrica y la entrega.
 * Ninguna exige un rendimiento: solo que las operaciones y mediciones se hayan hecho de verdad. Las etapas experimentales
 * quedan fijadas una vez cumplidas (lavar un recipiente después no borra lo que ya se hizo).
 */
import type { P08World } from '../../simulation/organic-world/types';
import { answeredCount, isNum, type P08Notebook } from './notebook';
import { productMassReadings, readingsOf, SOURCE_OF, validReadings } from './expected-results';

export interface P08StageFlags {
  safety: boolean;
  hypothesis: boolean;
  reagents_ready: boolean;
  reaction_observed: boolean;
  product_isolated: boolean;
  product_characterized: boolean;
  report_ready: boolean;
}

const LATCHED: Array<keyof P08StageFlags> = ['safety', 'reagents_ready', 'reaction_observed', 'product_isolated', 'product_characterized'];

export function p08StageEvidence(w: P08World, nb: P08Notebook): P08StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** La predicción cuenta si tiene ecuación, tipo de reacción, limitante y masa teórica y quedó guardada. */
export const predictionSaved = (nb: P08Notebook) => !!nb.tableA.reactionType && !!nb.tableA.limiting && isNum(nb.tableA.theoreticalG) && nb.tableA.savedAtS !== null;

/** Reactivos de la ruta cuyas fichas se inspeccionaron. */
export const inspectedReagents = (w: P08World) => Object.values(SOURCE_OF[w.route]).filter((id) => w.evidence[`inspected:${id}`]).length;

function currentEvidence(w: P08World, nb: P08Notebook): P08StageFlags {
  const isolated = w.route === 'ASA' ? !!w.evidence.filtered && !!w.evidence.ovenDried : !!w.evidence.fractionCollected && !!w.evidence.dried;
  const analysed = readingsOf(w, 'purity').length > 0 || readingsOf(w, 'mp').length > 0;
  const c = nb.tableC;
  return {
    safety: w.ppe && inspectedReagents(w) >= 3,
    hypothesis: predictionSaved(nb),
    reagents_ready: !!w.evidence.reactantsMixed && validReadings(w, 'mass').length > 0 && (w.route !== 'ISO' || validReadings(w, 'volume').length > 0),
    reaction_observed: (w.evidence.__heatS ?? 0) >= 300 && validReadings(w, 'temperature').length >= 2 && !!w.evidence.heatingEnded,
    product_isolated: isolated,
    product_characterized: isolated && productMassReadings(w).length > 0 && analysed,
    report_ready: isNum(c.isolatedMass.value || '') && isNum(c.theoreticalG) && isNum(c.apparentYield) && answeredCount(nb) >= 3,
  };
}
