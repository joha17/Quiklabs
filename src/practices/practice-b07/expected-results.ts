/**
 * Consultas puras sobre el intento B07 que comparten evidencia, rúbrica e interfaz: la lectura que un activo PERMITE y
 * la respuesta prudente que le corresponde. Nunca hay una especie como respuesta (PMIC-03).
 */
import type { MicroWorld } from '../../simulation/micro-world/types';
import type { LabObservation } from '../../simulation/optical-world/types';
import { GRAM_LOOK, assetById } from '../../simulation/specimens/assets';
import { MEDIA, type MediumId } from '../../simulation/micro-world/model';
import { gramComplete } from '../../simulation/micro-world/world';
import type { GramReading } from './notebook';

export const observation = (w: MicroWorld, id: string | null | undefined): LabObservation | null => (id ? w.observations[id] ?? null : null);
export const lookOf = (assetId: string | undefined) => (assetId ? GRAM_LOOK[assetById(assetId)?.assetId.replace(/T2$/, '') ?? ''] : undefined);
/** Interpretaciones que la imagen admite: un artefacto o un frotis ambiguo solo admiten «indeterminada». */
export function admissibleReadings(assetId: string | undefined): GramReading[] {
  switch (assetId?.replace(/T2$/, '')) {
    case 'gramPosV': return ['gram-positive'];
    case 'gramNegP': return ['gram-negative'];
    case 'gramMixed': return ['mixed', 'indeterminate'];
    default: return ['indeterminate'];
  }
}
export const isOwnSmear = (w: MicroWorld, o: LabObservation | null) => !!o?.slideId && !!w.micro.smears[o.slideId];
export const ownSmearCaptures = (w: MicroWorld) => w.observationOrder.map((id) => w.observations[id]).filter((o) => o.isObservationValid && isOwnSmear(w, o));
export const controlCaptured = (w: MicroWorld, id: 'fxP' | 'fxN') => w.observationOrder.some((k) => w.observations[k].isObservationValid && w.observations[k].slideId === id);
export const controlsReviewed = (w: MicroWorld) => controlCaptured(w, 'fxP') && controlCaptured(w, 'fxN');
export const fullyStained = (w: MicroWorld) => Object.values(w.micro.smears).some((s) => gramComplete(s));
export const mediaTruth = (id: string) => MEDIA[id as MediumId];
export const fixedReturned = (w: MicroWorld) => Object.keys(w.slideCase.home).every((id) => w.slideCase.slots[w.slideCase.home[id]] === id);
export const platesReturned = (w: MicroWorld) => Object.keys(w.micro.plates).every((id) => w.micro.plates[id].restricted || w.objects[id]?.support === 'plateTray');
/** Incidencias de recursos: nunca restan. */
export const incidentsB07 = (w: MicroWorld) => [...w.cell.incidents];
