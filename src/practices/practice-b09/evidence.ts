/**
 * Banderas de evidencia de B09 (§5, §6.4): cada ruta se acredita por HECHOS del mundo (rótulos correctos, cortes viables,
 * capturas válidas, marcas validadas, láminas devueltas) y por la importación a la libreta, nunca por un botón. Las etapas
 * logradas quedan fijadas (`stage:*`) para que el desmontaje no borre el avance.
 */
import type { PlantWorld } from '../../simulation/plant-world/types';
import type { B09Notebook } from './notebook';
import { answeredCount } from './notebook';
import { allReturned, externalDone, freshCaptures, ownCaptures, slideObserved, stainDeferred, stereoCaptures } from './expected-results';

export interface B09StageFlags {
  ppe: boolean;
  hypothesis: boolean;
  external: boolean;
  sectioning: boolean;
  slides: boolean;
  foliar: boolean;
  analysis: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B09StageFlags> = ['ppe', 'hypothesis', 'external', 'sectioning', 'slides', 'foliar', 'analysis'];
const ROOT_STEM = ['fxRT', 'fxRE', 'fxRM', 'fxSE', 'fxSM'];

export function notebookCompleteB09(w: PlantWorld, nb: B09Notebook): boolean {
  const rows = [...nb.roots, ...nb.stems, ...nb.leaves].filter((r) => w.observations[r.observationId ?? '']?.isObservationValid && r.group).length;
  const matrix = nb.matrix.filter((r) => r.organ && r.system && r.evidenceObservationId && r.observation.trim()).length;
  return rows >= 4 && matrix >= 3 && answeredCount(nb) >= 4;
}

function currentEvidence(w: PlantWorld, nb: B09Notebook): B09StageFlags {
  const required = (ids: string[]) => ids.filter((id) => w.plant.requiredSlides.includes(id)).every((id) => slideObserved(w, id));
  const stain = stainDeferred(w) || !!w.evidence['stain:documented'];
  const measured = w.div.scale.available ? w.div.measurements.some((m) => nb.measures.some((r) => r.measurementId === m.id)) : nb.measures.some((r) => r.structure.trim().length > 2);
  return {
    ppe: w.ppe,
    hypothesis: w.ppe && !!w.evidence['inspected:mic'] && !!w.evidence['inspected:case'] && nb.prereport.hypothesis.trim().length > 5,
    external: externalDone(w, 'bean') && externalDone(w, 'maize') && !!w.evidence['rotated:bean'] && !!w.evidence['rotated:maize'] && nb.external.filter((r) => r.specimen && r.rootPattern && r.venation).length >= 2 && (!w.plant.stereoRequired || stereoCaptures(w).length >= 2),
    sectioning: !!w.evidence['cut:viable'] && freshCaptures(w).length > 0 && stain,
    slides: required(ROOT_STEM) && allReturned(w) && nb.roots.filter((r) => r.observationId).length >= 2 && nb.stems.filter((r) => r.observationId).length >= 2,
    foliar: required(['fxLE', 'fxLM']) && nb.leaves.filter((r) => r.observationId && r.orientationChecked).length >= 1,
    analysis: measured && answeredCount(nb) >= 4 && ownCaptures(w).length > 0,
    safeParked: !!w.evidence.safeParked,
    benchRestored: !!w.evidence.benchRestored,
    notebook: notebookCompleteB09(w, nb),
  };
}

export function b09StageEvidence(w: PlantWorld, nb: B09Notebook): B09StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
