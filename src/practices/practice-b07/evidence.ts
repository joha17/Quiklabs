/**
 * Banderas de evidencia de B07 (Anexo A): cada etapa se acredita por HECHOS del mundo y por la importación a la libreta,
 * nunca por un botón. Lo logrado queda fijado (`stage:*`) aunque luego se retire la lámina.
 */
import type { MicroWorld } from '../../simulation/micro-world/types';
import type { B07Notebook } from './notebook';
import { answeredCount } from './notebook';
import { controlsReviewed, fullyStained, isOwnSmear, observation } from './expected-results';
import { PLATES_ASSIGNED } from './definition';

export interface B07StageFlags {
  ppe: boolean;
  media: boolean;
  plates: boolean;
  distribution: boolean;
  stain: boolean;
  optics: boolean;
  interpretation: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B07StageFlags> = ['ppe', 'media', 'plates', 'distribution', 'stain', 'optics', 'interpretation'];

export function notebookComplete(w: MicroWorld, nb: B07Notebook): boolean {
  const media = nb.media.filter((r) => r.consistency && r.func).length;
  const gram = nb.gram.filter((r) => observation(w, r.observationId) && r.interpretation).length;
  return media === 3 && gram >= 1 && !!nb.integrative.claim && answeredCount(nb) >= 5;
}

function currentEvidence(w: MicroWorld, nb: B07Notebook): B07StageFlags {
  const m = w.micro;
  const v = (k: string) => !!w.evidence[k];
  return {
    ppe: w.ppe,
    media: w.ppe && m.inspected.length >= 3 && m.mediaCommitted,
    plates: PLATES_ASSIGNED.every((id) => m.platesViewed.includes(id)) && v('colonyObservationSaved'),
    distribution: v('distributionTrial') && m.methodsCompared,
    stain: v('slidePrepared') && fullyStained(w),
    optics: v('slideClamped') && v('validHighPowerObservation') && Object.keys(w.evidence).some((k) => k === 'smearCapture:4' || k === 'smearCapture:10'),
    interpretation: controlsReviewed(w) && nb.gram.some((r) => isOwnSmear(w, observation(w, r.observationId)) && r.interpretation),
    safeParked: v('safeParked'),
    benchRestored: v('benchRestored'),
    notebook: notebookComplete(w, nb),
  };
}

export function b07StageEvidence(w: MicroWorld, nb: B07Notebook): B07StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
