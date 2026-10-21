/**
 * Resultados esperados de B01 calculados con las observaciones PROPIAS del intento (§8, §13.1): qué capturas valen,
 * qué aumentos se registraron y qué estructuras están sustentadas por la región observada. Nunca un valor ideal fijo.
 */
import type { LabObservation, OpticalWorld } from '../../simulation/optical-world/types';
import { fieldOfViewMm, totalMagnification } from '../../simulation/instruments/optical/microscope-model';

export const observation = (w: OpticalWorld, id: string | null | undefined): LabObservation | null => (id ? w.observations[id] ?? null : null);
export const observationsOf = (w: OpticalWorld) => w.observationOrder.map((id) => w.observations[id]);
export const validObservations = (w: OpticalWorld) => observationsOf(w).filter((o) => o.isObservationValid);

/** Observaciones válidas del montaje fresco (asset del espécimen fresco) y aumentos distintos registrados. */
export const freshCaptures = (w: OpticalWorld) => validObservations(w).filter((o) => o.instrument === 'compound' && o.assetId === w.assignment.freshAsset && w.slides[o.slideId ?? '']?.kind === 'blank');
export const freshObjectives = (w: OpticalWorld) => [...new Set(freshCaptures(w).map((o) => o.objectiveX))].filter(Boolean) as number[];

export const fixedCaptures = (w: OpticalWorld) => validObservations(w).filter((o) => o.instrument === 'compound' && w.slides[o.slideId ?? '']?.kind === 'fixed' && w.assignment.fixedSlideIds.includes(o.slideId!));
export const stereoCaptures = (w: OpticalWorld, sampleId: string) => validObservations(w).filter((o) => o.instrument === 'stereo' && o.specimenId === sampleId);

/** Aumento total y campo esperados para un objetivo (con el ocular del equipo). */
export const expectedMagnification = (w: OpticalWorld, objectiveX: number) => totalMagnification(w.params.microscope.ocularX, objectiveX);
export const expectedFovMm = (w: OpticalWorld, objectiveX: number) => fieldOfViewMm(w.params.microscope.fieldNumberMm, objectiveX);

/** Familia de muestra de una observación (para contrastar con lo anotado, E62). */
export function specimenFamily(w: OpticalWorld, o: LabObservation): 'elodea' | 'fixed' | 'leaf' | 'insect' {
  if (o.instrument === 'stereo') return o.assetId === 'leaf' ? 'leaf' : 'insect';
  return w.slides[o.slideId ?? '']?.kind === 'fixed' ? 'fixed' : 'elodea';
}
