/**
 * Consultas puras sobre el intento B10 que comparten la evidencia, la rúbrica y la interfaz: capturas propias por lámina, marcas válidas,
 * láminas devueltas, identidad real de cada activo e incidencias. Comparan con lo que el estudiante observó, no con un modelo ideal.
 */
import type { LabObservation } from '../../simulation/optical-world/types';
import type { AnimalWorld, B10Module } from '../../simulation/animal-world/types';
import { modelDone, sawRelief } from '../../simulation/animal-world/world';
import { modelById } from '../../simulation/animal-world/catalog';
import type { StructureId } from '../../simulation/specimens/assets';
import { incidentCode } from './error-scenarios';
import type { InvertRow, TissueGuess } from './notebook';

export const observation = (w: AnimalWorld, id: string | null | undefined): LabObservation | null => (id ? w.observations[id] ?? null : null);

export const ownCaptures = (w: AnimalWorld, slideId?: string) =>
  w.observationOrder.map((id) => w.observations[id]).filter((o) => o.isObservationValid && o.instrument === 'compound' && (!slideId || o.slideId === slideId));
export const stereoCaptures = (w: AnimalWorld, sampleId?: string) =>
  w.observationOrder.map((id) => w.observations[id]).filter((o) => o.isObservationValid && o.instrument === 'stereo' && (!sampleId || o.specimenId === sampleId));

export const validMarks = (w: AnimalWorld, structure: StructureId, slideId?: string) =>
  w.div.marks.filter((m) => m.verdict === 'valid' && m.structure === structure && (!slideId || w.observations[m.observationId]?.slideId === slideId));

export const slideObserved = (w: AnimalWorld, id: string) => ownCaptures(w, id).length > 0;
export const slideReturned = (w: AnimalWorld, id: string) => w.slideCase.slots[w.slideCase.home[id]] === id;
export const allReturned = (w: AnimalWorld) => w.assignment.fixedSlideIds.every((id) => slideReturned(w, id));
export const hasModule = (w: AnimalWorld, m: B10Module) => w.animal.modules.includes(m);

/** Identidad real de los activos de tejido, contra la que se contrasta lo escrito. */
export const TISSUE_OF_ASSET: Record<string, TissueGuess> = {
  muscleSkeletal: 'skeletal', muscleCardiac: 'cardiac', muscleCardiacDiscs: 'cardiac', muscleSmooth: 'smooth', muscleFresh: 'skeletal', epithelium: 'epithelial', connective: 'connective', nervous: 'nervous',
};
export const ORGANISM_OF_ASSET: Record<string, InvertRow['organism']> = {
  sponge: 'sponge', coral: 'coral', medusa: 'medusa', planariaWM: 'planaria', flukeWM: 'fluke', nematodeTS: 'nematode', cestodeWM: 'cestode', earthwormTS: 'earthworm',
};
export const SMALL_OF_ASSET: Record<string, 'daphnia' | 'louse'> = { daphniaWM: 'daphnia', louseWM: 'louse', louseStages: 'louse' };

/** Asignados por grupo; un modelo en falla (S33) no se exige. */
export const modelsAssigned = (w: AnimalWorld, group?: string) => w.animal.requiredModels.filter((id) => w.animal.faultyModel !== id && (!group || modelById(id)?.group === group));
export const modelsDoneOf = (w: AnimalWorld, ids: string[]) => ids.filter((id) => modelDone(w, id));

export const birdDone = (w: AnimalWorld, id: string) => {
  const m = modelById(id);
  const a = w.animal.birds[id];
  return !!m && !!a && a.footOk === true && (!m.beak || a.beakOk === true);
};
export const skullDone = (w: AnimalWorld, id: string) => modelDone(w, id) && !!w.animal.skulls[id]?.ok;
export const trackDone = (w: AnimalWorld, id: string) => {
  const a = w.animal.tracks[id];
  return !!a && a.digitsOk && a.supportOk && a.clawsOk && sawRelief(w, id) && modelDone(w, id);
};

export const incidentsB10 = (w: AnimalWorld) => w.cell.incidents.map((k) => ({ key: k, code: incidentCode(k) }));
