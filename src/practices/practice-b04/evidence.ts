/**
 * Banderas de evidencia de B04 (§5, §6.7): cada etapa se acredita por HECHOS del mundo (lotes preparados y medidos,
 * tubos trazables con controles leídos, gas registrado por condición, alícuotas separadas de una hidrólisis, capturas
 * de Feulgen) y por la libreta, nunca por un botón. Las etapas logradas quedan fijadas (`stage:*`). Sin imagen de
 * Feulgen validada, la etapa de ADN queda `SKIPPED_BY_RESOURCE` y no bloquea ni descuenta.
 */
import type { BioWorld } from '../../simulation/bio-world/types';
import type { B04Notebook } from './notebook';
import { amylaseContrast, assayControls, catalaseConditions, feulgenCaptures, reading } from './expected-results';

export interface B04StageFlags {
  ppe: boolean;
  controlsReady: boolean;
  starchBatchReady: boolean;
  iodineControlled: boolean;
  proteinsTested: boolean;
  lipidsCompared: boolean;
  reducingTested: boolean;
  dnaObserved: boolean;
  dnaSkipped: boolean;
  catalaseSuspensionReady: boolean;
  catalaseCurve: boolean;
  amylaseBatchReady: boolean;
  amylaseContrasted: boolean;
  adhEnabled: boolean;
  adhEvaluated: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B04StageFlags> = [
  'ppe', 'controlsReady', 'starchBatchReady', 'iodineControlled', 'proteinsTested', 'lipidsCompared', 'reducingTested', 'dnaObserved',
  'catalaseSuspensionReady', 'catalaseCurve', 'amylaseBatchReady', 'amylaseContrasted', 'adhEvaluated',
];
const STAGE_KEY: Partial<Record<keyof B04StageFlags, string>> = {
  controlsReady: 'controls_ready', starchBatchReady: 'starch_batch_ready', iodineControlled: 'iodine_controlled', proteinsTested: 'proteins_tested',
  lipidsCompared: 'lipids_compared', reducingTested: 'reducing_tested', dnaObserved: 'dna_observed', catalaseSuspensionReady: 'catalase_suspension_ready',
  catalaseCurve: 'catalase_curve', amylaseBatchReady: 'amylase_batch_ready', amylaseContrasted: 'amylase_contrasted', adhEvaluated: 'adh_case_evaluated',
};
const e = (w: BioWorld, k: string) => !!w.evidence[k];

/** Lote preparado, rotulado y con su primera alícuota tomada (o medido, en P1: temperatura en el líquido). */
function prepReady(w: BioWorld, id: 'P1' | 'P2' | 'P3') {
  const b = w.bio.preps[id];
  if (!b || !b.labeled) return false;
  if (id === 'P1') return b.measuredTK !== null && b.stirredS > 0;
  return b.stirredS > 0;
}

export function notebookComplete(nb: B04Notebook): boolean {
  const k = Object.values(nb.analysis).filter((s) => s.trim().length > 25).length;
  const rows = nb.assays.rows.filter((r) => r.label && r.readingId && r.result).length;
  return rows >= 4 && k >= 4 && nb.amylase.conclusion.trim().length > 10 && nb.catalase.conclusion.trim().length > 10;
}

function currentEvidence(w: BioWorld, nb: B04Notebook): B04StageFlags {
  const lug = assayControls(w, 'LUG');
  const biu = assayControls(w, 'BIU');
  const emu = assayControls(w, 'EMU');
  const ben = assayControls(w, 'BEN');
  const cats = catalaseConditions(w);
  const amy = amylaseContrast(w);
  const dnaSkipped = w.bio.incidents.includes('feulgen');
  const benHot = ben.tubes.some((id) => w.bio.tubes[id].maxTK >= w.params.bio!.assay.benedictMinK);
  const labeledTubes = Object.values(w.bio.tubes).filter((t) => t.label && Object.keys(t.reagents).length).length;
  return {
    ppe: w.ppe,
    controlsReady: w.ppe && labeledTubes >= 2 && [lug, biu, emu, ben].some((a) => a.neg && a.pos),
    starchBatchReady: prepReady(w, 'P1'),
    iodineControlled: lug.neg && lug.pos && lug.samples.length > 0,
    proteinsTested: biu.neg && biu.pos && biu.samples.length > 0,
    lipidsCompared: emu.tubes.length >= 2 && emu.pos,
    reducingTested: ben.neg && ben.pos && benHot && e(w, 'read:thermo'),
    dnaObserved: feulgenCaptures(w).length > 0 && nb.feulgen.rows.some((r) => !!r.observationId),
    dnaSkipped,
    catalaseSuspensionReady: prepReady(w, 'P2') && w.bio.liver.weighedAt !== null,
    catalaseCurve: cats.includes('none') && cats.filter((c) => c !== 'none').length >= 3 && nb.catalase.rows.filter((r) => reading(w, r.readingId)?.instrument === 'gas').length >= 3,
    amylaseBatchReady: prepReady(w, 'P3'),
    amylaseContrasted: amy.lugol && amy.benedict && amy.control,
    adhEnabled: w.bio.adhEnabled,
    adhEvaluated: w.bio.adhEnabled && new Set(Object.values(w.bio.readings).filter((r) => r.instrument === 'photometer').map((r) => r.quality)).size >= 2 && w.bio.photometer.blanked,
    safeParked: e(w, 'safeParked'),
    benchRestored: e(w, 'benchRestored'),
    notebook: notebookComplete(nb),
  };
}

export function b04StageEvidence(w: BioWorld, nb: B04Notebook): B04StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    const key = `stage:${STAGE_KEY[k] ?? k}`;
    if (f[k]) w.evidence[key] ??= w.timeS;
    else if (w.evidence[key] !== undefined) f[k] = true;
  }
  if (f.dnaSkipped) w.evidence['stage:dna_observed:SKIPPED_BY_RESOURCE'] ??= w.timeS;
  return f;
}
