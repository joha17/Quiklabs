/**
 * Banderas de evidencia de B01 (§5): cada etapa se acredita por HECHOS del mundo y de la libreta, nunca por un botón.
 * Las etapas logradas quedan fijadas (`stage:*`); los accidentes posteriores igual se registran.
 */
import type { OpticalWorld } from '../../simulation/optical-world/types';
import { MICROSCOPE_PARTS } from '../../simulation/instruments/optical/microscope-types';
import { STEREO_PARTS } from '../../simulation/instruments/optical/stereo-types';
import type { B01Notebook } from './notebook';
import { fixedCaptures, freshObjectives, observation, stereoCaptures } from './expected-results';

export interface B01StageFlags {
  ppe: boolean;
  partsLocated: boolean;
  safetyInspected: boolean;
  mountUsable: boolean;
  freshObserved: boolean;
  freshImported: boolean;
  fixedObserved: boolean;
  fixedReturned: boolean;
  stereoObserved: boolean;
  samplesReturned: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B01StageFlags> = ['ppe', 'partsLocated', 'safetyInspected', 'mountUsable', 'freshObserved', 'fixedObserved', 'fixedReturned', 'stereoObserved', 'samplesReturned'];

export const partsLocatedCount = (w: OpticalWorld) => ({
  mic: MICROSCOPE_PARTS.filter((p) => w.evidence[`part:mic:${p}`]).length,
  ste: STEREO_PARTS.filter((p) => w.evidence[`part:ste:${p}`]).length,
});

export function notebookComplete(w: OpticalWorld, nb: B01Notebook): boolean {
  const microOk = nb.micro.filter((r) => observation(w, r.observationId)?.isObservationValid && r.totalMag.trim()).length >= w.params.requiredMagnifications;
  const fixedOk = nb.fixed.some((r) => observation(w, r.observationId)?.isObservationValid);
  const stereoOk = !!observation(w, nb.stereo.leaf.observationId) && !!observation(w, nb.stereo.insect.observationId);
  const partsOk = MICROSCOPE_PARTS.filter((p) => nb.parts[p].function.trim().length > 3).length >= 6;
  return microOk && fixedOk && stereoOk && partsOk && !!nb.prep.specimen && nb.comparison.purpose.trim().length > 10;
}

function currentEvidence(w: OpticalWorld, nb: B01Notebook): B01StageFlags {
  const parts = partsLocatedCount(w);
  const objs = freshObjectives(w);
  const freshRows = nb.micro.filter((r) => {
    const o = observation(w, r.observationId);
    return !!o?.isObservationValid && o.assetId === w.assignment.freshAsset;
  }).length;
  const fixedIds = w.assignment.fixedSlideIds;
  return {
    ppe: w.ppe,
    partsLocated: parts.mic >= 6 && parts.ste >= 4,
    safetyInspected: !!w.evidence['inspected:glassBin'] && !!w.evidence['inspected:bioWaste'],
    mountUsable: !!w.evidence.mountUsable,
    freshObserved: objs.length >= w.params.requiredMagnifications && objs.includes(4),
    freshImported: freshRows >= w.params.requiredMagnifications,
    fixedObserved: fixedIds.every((id) => fixedCaptures(w).some((o) => o.slideId === id)),
    fixedReturned: fixedIds.every((id) => !!w.evidence[`returned:${id}`] && w.slideCase.slots[w.slideCase.home[id]] === id),
    stereoObserved: w.assignment.stereoSampleIds.every((id) => stereoCaptures(w, id).length > 0),
    samplesReturned: w.assignment.stereoSampleIds.every((id) => w.objects[id]?.support === 'sampleTray' && !!w.evidence[`stereoCapture:${id}`]),
    safeParked: !!w.evidence.safeParked,
    benchRestored: !!w.evidence.benchRestored,
    notebook: notebookComplete(w, nb),
  };
}

export function b01StageEvidence(w: OpticalWorld, nb: B01Notebook): B01StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
