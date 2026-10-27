/**
 * Banderas de evidencia de B02 (§5): cada etapa se acredita por HECHOS del mundo (capturas válidas de montajes
 * propios) y por la importación a la libreta, nunca por un botón. Las etapas logradas quedan fijadas (`stage:*`).
 * Un recurso faltante (CEL68) no bloquea: la muestra afectada cuenta como diferida.
 */
import type { CellWorld } from '../../simulation/cell-world/types';
import { lugolDeveloped } from '../../simulation/specimens/stain-model';
import type { B02Notebook } from './notebook';
import { CHROMO_KINDS, fixedCaptures, lowAndHigh, obsKind, observation, ownCaptures, stereoCaptures, unavailableKinds } from './expected-results';

export interface B02StageFlags {
  ppe: boolean;
  predict: boolean;
  pigments: boolean;
  starch: boolean;
  walls: boolean;
  animal: boolean;
  elodea: boolean;
  compare: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B02StageFlags> = ['ppe', 'predict', 'pigments', 'starch', 'walls', 'animal', 'elodea'];

const own = (w: CellWorld, id: string | null | undefined, kinds: string[]) => {
  const o = observation(w, id);
  return !!o?.isObservationValid && o.specimenId.startsWith('m:') && kinds.includes(obsKind(w, o) ?? '');
};

/** Frutos pigmentados acreditados: bajo y alto aumento e importados al atlas (o diferidos por recurso faltante). */
export function pigmentKinds(w: CellWorld, nb: B02Notebook) {
  const missing = unavailableKinds(w);
  return CHROMO_KINDS.filter((k) => missing.includes(k) || (lowAndHigh(w, k) && nb.atlas.some((r) => own(w, r.observationId, [k]))));
}

/** Papa con Lugol en contacto suficiente y capturada. */
export function starchCaptured(w: CellWorld) {
  return ownCaptures(w, 'potato').some((o) => {
    const info = w.mounts[o.slideId ?? '']?.cell;
    return !!info && lugolDeveloped(info, w.params.cellPrep!.lugolMinContactS);
  });
}

export function optionalRoutesDone(w: CellWorld, nb: B02Notebook) {
  const r = w.cell.routes;
  const fixed = !r.fixed || (w.assignment.fixedSlideIds.some((id) => fixedCaptures(w).some((o) => o.slideId === id)) && w.assignment.fixedSlideIds.every((id) => w.slideCase.slots[w.slideCase.home[id]] === id) && !!observation(w, nb.fixed.observationId));
  const stereo = !r.stereo || (stereoCaptures(w).length > 0 && w.assignment.stereoSampleIds.every((id) => w.objects[id]?.support === 'sampleTray') && !!observation(w, nb.stereo.observationId));
  return fixed && stereo;
}

export function notebookComplete(w: CellWorld, nb: B02Notebook): boolean {
  const atlas = nb.atlas.filter((r) => observation(w, r.observationId)?.isObservationValid && r.totalMag.trim()).length;
  const prep = nb.prep.filter((r) => r.specimen && r.technique).length;
  return atlas >= 3 && prep >= 3 && nb.comparison.plastids.trim().length > 10 && nb.log.consequence.trim().length > 5;
}

function currentEvidence(w: CellWorld, nb: B02Notebook): B02StageFlags {
  const missing = unavailableKinds(w);
  const elodeaOk = lowAndHigh(w, 'elodea') && own(w, nb.elodea.observationId, ['elodea']) && nb.elodea.structures.length > 0;
  return {
    ppe: w.ppe,
    predict: w.ppe && !!w.evidence['inspected:glassBin'] && !!w.evidence['inspected:bioWaste'] && nb.hypotheses.some((h) => h.material && h.expected && h.reason.trim().length > 3),
    pigments: pigmentKinds(w, nb).length >= 2,
    starch: (starchCaptured(w) && own(w, nb.potato.observationId, ['potato']) && !!nb.potato.grains) || missing.includes('potato'),
    walls: own(w, nb.sclereids.observationId, ['pear', 'guava']) && !!nb.sclereids.walls,
    animal: own(w, nb.buccal.observationId, ['buccal']) && !!nb.buccal.stain && nb.buccal.structures.length > 0,
    elodea: elodeaOk,
    compare: nb.comparison.plantAnimal.trim().length > 10 && nb.comparison.plastids.trim().length > 10 && optionalRoutesDone(w, nb),
    safeParked: !!w.evidence.safeParked,
    benchRestored: !!w.evidence.benchRestored,
    notebook: notebookComplete(w, nb),
  };
}

export function b02StageEvidence(w: CellWorld, nb: B02Notebook): B02StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
