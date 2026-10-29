/**
 * Banderas de evidencia de B06 (§5, §6.4): cada etapa se acredita por HECHOS del mundo (fichas, capturas válidas propias,
 * movilidad registrada, láminas devueltas, mediciones) y por la importación a la libreta, nunca por un botón. Las etapas
 * logradas quedan fijadas (`stage:*`) aunque luego se retire la lámina. Un recurso ausente difiere la muestra afectada.
 */
import type { DivWorld } from '../../simulation/div-world/types';
import { DIV_SPECIMENS } from '../../simulation/div-world/types';
import type { B06Notebook } from './notebook';
import { answeredCount } from './notebook';
import { deferredSpecimens, fixedReturned, obsSpecimen, observation, ownCaptures, twoMagnifications } from './expected-results';

export interface B06StageFlags {
  ppe: boolean;
  classification: boolean;
  preparation: boolean;
  protists: boolean;
  fixedSlides: boolean;
  comparisons: boolean;
  analysis: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B06StageFlags> = ['ppe', 'classification', 'preparation', 'protists', 'fixedSlides', 'comparisons', 'analysis'];

const linked = (w: DivWorld, id: string | null | undefined, kind: string) => {
  const o = observation(w, id);
  return !!o?.isObservationValid && obsSpecimen(w, o) === kind;
};

/** Fichas del reto respondidas (las siete, y la cianobacteria si está asignada). */
export const classified = (w: DivWorld) => DIV_SPECIMENS.every((s) => !!w.div.classification[s]);

/** Movilidad registrada sobre la muestra viva (modelo cualitativo) o muestra diferida. */
export const motilityDone = (w: DivWorld, kind: 'euglena' | 'paramecium') =>
  deferredSpecimens(w).includes(kind) || Object.keys(w.evidence).some((k) => k.startsWith(`motility:${kind}:`));

export function notebookComplete(w: DivWorld, nb: B06Notebook): boolean {
  const orgs = nb.organisms.filter((r) => observation(w, r.observationId)?.isObservationValid && r.specimen && r.cellType).length;
  const comp = nb.comparison.filter((r) => r.specimen && r.domain && r.evidence).length;
  return orgs >= 4 && comp >= 3 && nb.open.limitations.trim().length > 5 && answeredCount(nb) >= 4;
}

function currentEvidence(w: DivWorld, nb: B06Notebook): B06StageFlags {
  const deferred = deferredSpecimens(w);
  const fixedKinds = (k: string) => ownCaptures(w).some((o) => obsSpecimen(w, o) === k);
  const measured = w.div.measurements.some((m) => nb.morpho.some((r) => r.measurementId === m.id));
  return {
    ppe: w.ppe,
    classification: w.ppe && classified(w) && !!w.evidence['inspected:mic'] && nb.prereport.hypothesis.trim().length > 5,
    preparation: twoMagnifications(w, 'buccal') && twoMagnifications(w, 'tradescantia') && linked(w, nb.epidermis.observationId, 'tradescantia'),
    protists: (deferred.includes('paramecium') || (ownCaptures(w, 'paramecium').length > 0 && motilityDone(w, 'paramecium')))
      && (deferred.includes('euglena') || (ownCaptures(w, 'euglena').length > 0 && motilityDone(w, 'euglena'))),
    fixedSlides: fixedKinds('bacillus') && (deferred.includes('blood') || fixedKinds('blood')) && fixedReturned(w) && !!nb.bacteria.nucleolus,
    comparisons: twoMagnifications(w, 'elodea') && nb.comparison.filter((r) => r.specimen && r.domain).length >= 3,
    analysis: (w.div.scale.available ? measured : nb.open.limitations.trim().length > 5) && answeredCount(nb) >= 4,
    safeParked: !!w.evidence.safeParked,
    benchRestored: !!w.evidence.benchRestored,
    notebook: notebookComplete(w, nb),
  };
}

export function b06StageEvidence(w: DivWorld, nb: B06Notebook): B06StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
