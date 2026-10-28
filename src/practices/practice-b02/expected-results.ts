/**
 * Resultados esperados de B02 calculados con las observaciones PROPIAS del intento (§8, §13.2): qué capturas valen y
 * de qué muestra, a qué aumentos, y qué estructuras están sustentadas por la región observada. Los preparados de
 * control del docente (`ctl:*`) se ven pero no acreditan la preparación del estudiante.
 */
import type { LabObservation } from '../../simulation/optical-world/types';
import type { CellWorld } from '../../simulation/cell-world/types';
import { kindOfSpecimen, type CellKind } from '../../simulation/specimens/thin-section';
import { expectedFovMm, expectedMagnification, observation, observationsOf, validObservations } from '../practice-b01/expected-results';
import { RESOLUTION_B02 } from './params';

export { expectedFovMm, expectedMagnification, observation, observationsOf, validObservations };

export const PLANT_KINDS: CellKind[] = ['elodea', 'potato', 'tomato', 'pepper', 'carrot', 'pear', 'guava', 'apple'];
export const CHROMO_KINDS: CellKind[] = ['tomato', 'pepper', 'carrot'];

/** Muestra de una observación: celular (por zona), lámina fija, hoja o insecto del estereoscopio. */
export function obsKind(w: CellWorld, o: LabObservation | null): CellKind | 'fixed' | 'leaf' | 'insect' | null {
  if (!o) return null;
  if (o.instrument === 'stereo') return o.assetId === 'leaf' ? 'leaf' : 'insect';
  if (w.slides[o.slideId ?? '']?.kind === 'fixed') return 'fixed';
  return kindOfSpecimen(o.specimenId) ?? kindOfSpecimen(w.mounts[o.slideId ?? '']?.specimenId);
}

/** Captura de un montaje del propio estudiante (no un preparado de control). */
export const isOwn = (o: LabObservation) => o.instrument === 'compound' && o.specimenId.startsWith('m:');

export const ownCaptures = (w: CellWorld, kind?: CellKind) => validObservations(w).filter((o) => isOwn(o) && (!kind || obsKind(w, o) === kind));
export const objectivesFor = (w: CellWorld, kind: CellKind) => [...new Set(ownCaptures(w, kind).map((o) => o.objectiveX))].filter(Boolean) as number[];

/** Bajo (4X) y alto (10X o 40X) aumento con capturas válidas de la misma muestra. */
export const lowAndHigh = (w: CellWorld, kind: CellKind) => {
  const objs = objectivesFor(w, kind);
  return objs.includes(4) && objs.some((x) => x >= 10);
};

/** Muestras con capturas válidas propias. */
export const capturedKinds = (w: CellWorld) => [...new Set(ownCaptures(w).map((o) => obsKind(w, o)))].filter(Boolean) as CellKind[];

export const fixedCaptures = (w: CellWorld) => validObservations(w).filter((o) => o.instrument === 'compound' && w.slides[o.slideId ?? '']?.kind === 'fixed' && w.assignment.fixedSlideIds.includes(o.slideId!));
export const stereoCaptures = (w: CellWorld, sampleId?: string) => validObservations(w).filter((o) => o.instrument === 'stereo' && (!sampleId || o.specimenId === sampleId));

/** Muestra cuyo recurso falta (S18): su evidencia queda diferida, sin descuento (CEL68). */
export const unavailableKinds = (w: CellWorld) => w.cell.incidents.map((a) => kindOfSpecimen(`m:${a.replace(/(Red|Lugol|Plain|Eosin|MB|Clear|Dense|T2)$/, '')}:0`)).filter(Boolean) as CellKind[];

/** Límite de resolución de Abbe (µm) para el objetivo de ejemplo: d = 0,61·λ / AN. */
export const resolutionUm = (objectiveX: 4 | 10 | 40 | 100) => Math.round(((0.61 * RESOLUTION_B02.lambdaUm) / RESOLUTION_B02.na[objectiveX]) * 100) / 100;
