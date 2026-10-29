/**
 * Banderas de evidencia de B05 (§5, §13.1): cada etapa se acredita por HECHOS del mundo (lotes agitados y medidos,
 * tubos trazables con reacción, lecturas del colector y del ojo, capturas de la papa con Lugol, lecturas UV) y por la
 * importación a la libreta, nunca por un botón. Las etapas logradas quedan fijadas (`stage:*`).
 */
import type { EnzWorld } from '../../simulation/enz-world/types';
import type { B05Notebook } from './notebook';
import { aliquotsRead, amylaseControl, amylaseIncubation, batchReady, catalaseRun, reading, starchCaptures } from './expected-results';

export interface B05StageFlags {
  ppe: boolean;
  hypothesis: boolean;
  starch_batch_ready: boolean;
  catalase_suspension_ready: boolean;
  amylase_batch_ready: boolean;
  controls: boolean;
  cat_baseline: boolean;
  cat_factors: boolean;
  amy_setup: boolean;
  amy_assays: boolean;
  micro: boolean;
  adh_evidence: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B05StageFlags> = [
  'ppe', 'hypothesis', 'starch_batch_ready', 'catalase_suspension_ready', 'amylase_batch_ready', 'controls', 'cat_baseline', 'cat_factors', 'amy_setup',
  'amy_assays', 'micro', 'adh_evidence',
];
const e = (w: EnzWorld, k: string) => !!w.evidence[k];
const filled = (s: string) => s.trim().length > 10;

export function notebookComplete(w: EnzWorld, nb: B05Notebook): boolean {
  const k = Object.values(nb.analysis).filter((s) => s.trim().length > 25).length;
  const gasRows = nb.gas.filter((g) => g.readingIds.filter((id) => reading(w, id)?.instrument === 'collector').length >= 3).length;
  const amyRows = nb.amylase.rows.filter((r) => reading(w, r.readingId)?.instrument === 'eye').length;
  return gasRows >= 1 && amyRows >= 3 && nb.rate.rateMlS.trim() !== '' && nb.rate.nO2Mmol.trim() !== '' && k >= 5;
}

function currentEvidence(w: EnzWorld, nb: B05Notebook): B05StageFlags {
  const amyRows = nb.amylase.rows.filter((r) => reading(w, r.readingId)?.instrument === 'eye').length;
  const gasBase = nb.gas.find((g) => g.label === 'cat-base');
  const baseImported = !!gasBase && gasBase.readingIds.filter((id) => reading(w, id)?.instrument === 'collector').length >= 3;
  const a = aliquotsRead(w);
  const uv = w.enz.readingOrder.map((id) => w.enz.readings[id]).filter((r) => r.instrument === 'uv' && r.quality === 'corrected').length;
  return {
    ppe: w.ppe,
    hypothesis: w.ppe && filled(nb.hypothesis.catalase) && filled(nb.hypothesis.amylase) && nb.hypothesis.heat !== '',
    starch_batch_ready: batchReady(w, 'P1'),
    catalase_suspension_ready: batchReady(w, 'P2'),
    amylase_batch_ready: batchReady(w, 'P3'),
    controls: catalaseRun(w, 'cat-blank', 2, false) && amylaseControl(w) && nb.controls.blank !== '',
    cat_baseline: catalaseRun(w, 'cat-base', 4) && baseImported,
    cat_factors: catalaseRun(w, 'cat-heat', 2) && (catalaseRun(w, 'cat-acid', 2) || catalaseRun(w, 'cat-base-ph', 2)),
    amy_setup: !!amylaseIncubation(w) && amylaseControl(w),
    amy_assays: a.lugol.length >= 3 && a.distinctTimes >= 3 && a.benedict.length >= 1 && amyRows >= 3,
    micro: starchCaptures(w).length > 0 && nb.micro.observationId !== null,
    // Sin ADH asignada la etapa no aplica (se acredita sola).
    adh_evidence: !w.enz.adhEnabled || (w.enz.uv.blankA !== null && uv >= 2 && nb.adh.rows.some((r) => reading(w, r.readingId)?.instrument === 'uv')),
    safeParked: e(w, 'safeParked'),
    benchRestored: e(w, 'benchRestored'),
    notebook: notebookComplete(w, nb),
  };
}

export function b05StageEvidence(w: EnzWorld, nb: B05Notebook): B05StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
