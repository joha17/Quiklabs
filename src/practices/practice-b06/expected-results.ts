/**
 * Consultas puras sobre el intento B06 que comparten la evidencia, la rúbrica y la interfaz: capturas propias por
 * muestra y objetivo, marcas válidas, muestras diferidas por incidencias de recursos y la muestra de cada captura.
 */
import type { DivSpecimen, DivWorld } from '../../simulation/div-world/types';
import type { LabObservation } from '../../simulation/optical-world/types';
import type { StructureId } from '../../simulation/specimens/assets';
import { specimenOf } from '../../simulation/div-world/world';
import { incidentCode } from './error-scenarios';

export const observation = (w: DivWorld, id: string | null | undefined): LabObservation | null => (id ? w.observations[id] ?? null : null);

/** Muestra de una captura (permanente o fresca). */
export const obsSpecimen = (w: DivWorld, o: LabObservation | null): DivSpecimen | null => (o ? specimenOf(w, o.slideId, o.specimenId) : null);

/** Capturas válidas propias (montajes del estudiante o láminas asignadas; nunca los preparados docentes). */
export const ownCaptures = (w: DivWorld, kind?: DivSpecimen) =>
  w.observationOrder.map((id) => w.observations[id]).filter((o) => o.isObservationValid && o.instrument === 'compound' && !o.specimenId.startsWith('ctl:') && (!kind || obsSpecimen(w, o) === kind));

export const objectivesFor = (w: DivWorld, kind: DivSpecimen) => [...new Set(ownCaptures(w, kind).map((o) => o.objectiveX ?? 0))].sort((a, b) => a - b);

/** Una muestra observada a dos aumentos por lo menos (localizar y detallar). */
export const twoMagnifications = (w: DivWorld, kind: DivSpecimen) => objectivesFor(w, kind).length >= 2;

export const capturedSpecimens = (w: DivWorld) => [...new Set(ownCaptures(w).map((o) => obsSpecimen(w, o)).filter(Boolean))] as DivSpecimen[];

/** Marcas válidas de una estructura sobre capturas de una muestra. */
export const validMarks = (w: DivWorld, structure: StructureId, kind?: DivSpecimen) =>
  w.div.marks.filter((m) => m.verdict === 'valid' && m.structure === structure && (!kind || obsSpecimen(w, observation(w, m.observationId)) === kind));

/** Incidencias de recursos (CEL-072…075), sin culpa del estudiante. */
export const incidentsB06 = (w: DivWorld) => w.cell.incidents.map((k) => ({ key: k, code: incidentCode(k) }));

/** Muestras cuya evaluación queda diferida por un recurso ausente o mal asignado. */
export function deferredSpecimens(w: DivWorld): DivSpecimen[] {
  const out = new Set<DivSpecimen>();
  for (const k of w.cell.incidents) {
    if (k === 'euglena' || k.startsWith('missing:euglena')) out.add('euglena');
    if (k === 'paramecium') out.add('paramecium');
    if (k.startsWith('objective:blood')) out.add('blood');
  }
  // Recurso ausente aunque nadie lo haya intentado capturar: tampoco se exige.
  if (w.cell.missingAssets.includes('euglena')) out.add('euglena');
  return [...out];
}

/** Láminas permanentes asignadas devueltas a su ranura. */
export const fixedReturned = (w: DivWorld) => w.assignment.fixedSlideIds.every((id) => w.slideCase.slots[w.slideCase.home[id]] === id);
