/**
 * Consultas puras sobre el intento B09 que comparten la evidencia, la rúbrica y la interfaz: capturas propias por activo,
 * marcas válidas, láminas devueltas e incidencias. Comparan con lo que el estudiante observó, no con un modelo ideal.
 */
import type { LabObservation } from '../../simulation/optical-world/types';
import type { PlantWorld } from '../../simulation/plant-world/types';
import type { StructureId } from '../../simulation/specimens/assets';
import { EXTERNAL_REGIONS } from '../../simulation/plant-world/model';
import { incidentCode } from './error-scenarios';

export const observation = (w: PlantWorld, id: string | null | undefined): LabObservation | null => (id ? w.observations[id] ?? null : null);

/** Capturas válidas propias al microscopio (nunca los preparados docentes). */
export const ownCaptures = (w: PlantWorld, slideId?: string) =>
  w.observationOrder.map((id) => w.observations[id]).filter((o) => o.isObservationValid && o.instrument === 'compound' && !o.specimenId.startsWith('ctl:') && (!slideId || o.slideId === slideId));

export const freshCaptures = (w: PlantWorld) => ownCaptures(w).filter((o) => w.slides[o.slideId ?? '']?.kind !== 'fixed');
export const stereoCaptures = (w: PlantWorld) => w.observationOrder.map((id) => w.observations[id]).filter((o) => o.isObservationValid && o.instrument === 'stereo');

/** Marcas válidas de una estructura, opcionalmente sobre capturas de una lámina. */
export const validMarks = (w: PlantWorld, structure: StructureId, slideId?: string) =>
  w.div.marks.filter((m) => m.verdict === 'valid' && m.structure === structure && (!slideId || w.observations[m.observationId]?.slideId === slideId));

/** Láminas exigidas capturadas y devueltas a su ranura. */
export const slideObserved = (w: PlantWorld, id: string) => ownCaptures(w, id).length > 0;
export const slideReturned = (w: PlantWorld, id: string) => w.slideCase.slots[w.slideCase.home[id]] === id;
export const allReturned = (w: PlantWorld) => w.assignment.fixedSlideIds.every((id) => slideReturned(w, id));

/** Etiquetas externas correctas de una plántula. */
export const externalOk = (w: PlantWorld, specimen: 'bean' | 'maize') => {
  const regions = Object.keys(EXTERNAL_REGIONS[specimen]);
  return regions.filter((r) => w.plant.labels.some((l) => l.specimen === specimen && l.regionId === r && l.ok)).length;
};
export const externalDone = (w: PlantWorld, specimen: 'bean' | 'maize') => externalOk(w, specimen) === Object.keys(EXTERNAL_REGIONS[specimen]).length;

/** Incidencias de recursos (TV-ASSET-*), sin culpa del estudiante. */
export const incidentsB09 = (w: PlantWorld) => w.cell.incidents.map((k) => ({ key: k, code: incidentCode(k) }));

/** Un recurso ausente en la asignación excluye la tarea afectada: la evaluación no la exige (§4.1). */
export const stainDeferred = (w: PlantWorld) => !w.plant.wiesnerAssigned;
