/**
 * Banderas de evidencia de B10 (§5): cada etapa se acredita por HECHOS del mundo (materiales bien clasificados, capturas válidas, regiones
 * rotuladas mirando la región, luz movida, láminas devueltas) y por la libreta, nunca por un botón. Un módulo que el docente no asignó
 * queda cumplido. Las etapas logradas se fijan (`stage:*`) para que el desmontaje no borre el avance.
 */
import type { AnimalWorld } from '../../simulation/animal-world/types';
import { classifyEnough } from '../../simulation/animal-world/world';
import type { B10Notebook } from './notebook';
import { answeredCount } from './notebook';
import { allReturned, birdDone, hasModule, modelsAssigned, modelsDoneOf, observation, ownCaptures, skullDone, slideObserved, stereoCaptures, trackDone } from './expected-results';

export interface B10StageFlags {
  ppe: boolean;
  orientation: boolean;
  histology: boolean;
  invertebrates: boolean;
  small: boolean;
  muscle: boolean;
  zoology: boolean;
  skulls: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B10StageFlags> = ['ppe', 'orientation', 'histology', 'invertebrates', 'small', 'muscle', 'zoology', 'skulls'];
const TISSUE_SLIDES = ['fxEP', 'fxCT', 'fxNE'];
const INVERT_SLIDES = ['fxSP', 'fxCO', 'fxME', 'fxPL', 'fxFL', 'fxNM', 'fxCE', 'fxEW'];
const SMALL_SLIDES = ['fxDA', 'fxLO', 'fxMS', 'fxLS'];
const MUSCLE_SLIDES = ['fxSK', 'fxCA', 'fxSM'];

export function notebookCompleteB10(w: AnimalWorld, nb: B10Notebook): boolean {
  const rows = [...nb.tissues, ...nb.inverts, ...nb.small].filter((r) => observation(w, r.observationId)?.isObservationValid).length;
  return rows >= 1 && nb.atlas.delivered && nb.atlas.conclusions.trim().length > 25 && answeredCount(nb) >= 4;
}

function currentEvidence(w: AnimalWorld, nb: B10Notebook): B10StageFlags {
  const seen = (ids: string[]) => ids.filter((id) => w.animal.requiredSlides.includes(id)).every((id) => slideObserved(w, id));
  const assignedSlides = (ids: string[]) => ids.filter((id) => w.animal.requiredSlides.includes(id));
  const zooIds = [...modelsAssigned(w, 'invertebrate'), ...modelsAssigned(w, 'vertebrate')];
  const birds = modelsAssigned(w, 'bird');
  const skulls = modelsAssigned(w, 'skull');
  return {
    ppe: w.ppe,
    orientation: w.ppe && classifyEnough(w) && !!w.evidence['inspected:mic'] && !!w.evidence['inspected:case'] && nb.prereport.hypothesis.trim().length > 5,
    histology: !hasModule(w, 'histology') || (seen(TISSUE_SLIDES) && assignedSlides(TISSUE_SLIDES).length === nb.tissues.filter((r) => r.tissue && observation(w, r.observationId)?.isObservationValid && ['epithelial', 'connective', 'nervous'].includes(r.tissue)).length),
    invertebrates: !hasModule(w, 'invertebrates') || (seen(INVERT_SLIDES) && nb.inverts.filter((r) => r.organism && r.observationId).length >= Math.min(1, assignedSlides(INVERT_SLIDES).length)),
    small: !hasModule(w, 'small') || (seen(SMALL_SLIDES) && w.animal.stereoRequired.every((id) => stereoCaptures(w, id).length > 0) && nb.small.filter((r) => r.organism && r.observationId).length >= Math.min(1, w.animal.stereoRequired.length)),
    muscle: !hasModule(w, 'muscle') || (seen(MUSCLE_SLIDES) && (!assignedSlides(['fxSK']).length || !!nb.muscle.skeletalObservationId) && (!assignedSlides(['fxCA']).length || !!nb.muscle.cardiacObservationId)),
    zoology: (!hasModule(w, 'zoology') || modelsDoneOf(w, zooIds).length === zooIds.length) && (!hasModule(w, 'birds') || birds.every((id) => birdDone(w, id))),
    skulls: (!hasModule(w, 'skulls') || skulls.every((id) => skullDone(w, id))) && (!hasModule(w, 'tracks') || w.animal.requiredTracks.every((id) => trackDone(w, id))),
    safeParked: !!w.evidence.safeParked,
    benchRestored: !!w.evidence.benchRestored,
    notebook: notebookCompleteB10(w, nb),
  };
}

export function b10StageEvidence(w: AnimalWorld, nb: B10Notebook): B10StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

export { allReturned, ownCaptures };
