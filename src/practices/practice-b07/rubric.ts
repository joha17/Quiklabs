/**
 * Rúbrica pura de B07 (§13): 15 % seguridad y trazabilidad, 15 % medios, 15 % colonias y distribución, 20 % preparación y
 * Gram, 15 % microscopio, 10 % medición y libreta, 10 % interpretación. Califica contra la lectura y la evidencia propia;
 * «evidencia insuficiente» o «mezcla» dan crédito completo cuando el activo lo justifica (§10, S11 y S21). Una incidencia
 * de recursos deja el ítem en `null` (revisión), nunca lo tacha.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { MicroWorld } from '../../simulation/micro-world/types';
import { colonyOf, gramComplete } from '../../simulation/micro-world/world';
import { b07StageEvidence } from './evidence';
import { admissibleReadings, controlsReviewed, fixedReturned, isOwnSmear, lookOf, mediaTruth, observation, ownSmearCaptures, platesReturned } from './expected-results';
import { answeredCount, parseNum, type B07Notebook } from './notebook';
import { PLATES_ASSIGNED } from './definition';

export const B07_WEIGHTS = { safety: 0.15, media: 0.15, colonies: 0.15, gram: 0.2, optics: 0.15, measure: 0.1, interpretation: 0.1 } as const;

const n = (w: MicroWorld, k: string) => w.evidence[k] ?? 0;
const filled = (s: string) => (s ?? '').trim() !== '';
const near = (a: number, b: number, rel = 0.02) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.max(1e-9, Math.abs(b));
const MARGIN_WORDS = new Set(['entire', 'undulate']);
const code = (x: number) => `MIC-${String(x).padStart(2, '0')}`;
const decimals = (s: string) => (s.replace(',', '.').split('.')[1] ?? '').length;

/** Errores de la libreta (`nb:MIC-NN`): lo escrito contrastado con la ficha, la lectura importada y lo que la técnica demuestra. */
export function notebookIssuesB07(w: MicroWorld, nb: B07Notebook): string[] {
  const out = new Set<string>();
  const add = (x: number) => out.add(`nb:${code(x)}`);
  for (const r of nb.media) {
    const t = mediaTruth(r.mediaId);
    if (!t) continue;
    if (r.consistency && r.consistency !== t.consistency) add(1);
    if (r.mediaId === 'mEMB' && r.func === 'general') add(2);
    if (r.mediaId === 'mEMB' && (r.selectiveMeans === 'distinguishes' || r.differentialMeans === 'inhibits')) add(3);
    if (r.sterileClaim) add(4);
    if (r.compositionSource === 'invented') add(7);
    if (r.mediaId === 'mNB' && r.coloniesExpected) add(8);
  }
  if (w.micro.trials.length > 0 && nb.techniques.filter((r) => r.trialId).length < 2) add(11);
  if (nb.techniques.some((r) => r.replicates)) add(12);
  for (const r of nb.colonies) {
    const col = r.plateId && r.colonyId ? colonyOf(w, r.plateId, r.colonyId) : null;
    if (MARGIN_WORDS.has(r.surface)) add(14);
    if (col && r.pigment && r.pigment !== col.pigment) add(15);
    if (r.identity === 'species') add(16);
    if (r.unit === 'px') add(18);
    const m = r.measureId ? w.micro.measures.find((x) => x.id === r.measureId) : null;
    if (m && filled(r.diameter) && near(parseNum(r.diameter), m.px, 1e-6)) add(18);
    if (m?.hiddenEdge && !r.borderDeclared) add(20);
    if (filled(r.diameter) && decimals(r.diameter) > 2) add(22);
    if (filled(r.diameter) && !r.colonyId) add(23);
    if (r.countUnit === 'bacteria') add(24);
  }
  for (const r of nb.gram) {
    const o = observation(w, r.observationId);
    const asset = o?.assetId;
    if (filled(r.species)) add(49);
    if (r.negativeStainSame) add(50);
    if (r.membraneVisible) add(52);
    const look = lookOf(asset);
    if (look && !look.faint) {
      if (r.shape === 'cocci' && !look.cocci) add(51);
      if (r.shape === 'rods' && !look.rods) add(51);
    }
    if (r.interpretation && (r.interpretation === 'gram-positive' || r.interpretation === 'gram-negative')) {
      if (asset?.replace(/T2$/, '') === 'gramMixed') add(40);
      else if (asset && !admissibleReadings(asset).includes(r.interpretation)) add(54);
    }
    if (r.interpretation && (!r.controlPosObs || !r.controlNegObs)) add(55);
  }
  return [...out];
}

const firstOf = (w: MicroWorld, xs: number[], fallback: string, issues: string[] = []) => {
  const c = xs.map(code).find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b07fb.${c}` : `b07fb.${fallback}`;
};

export function evaluateB07(w: MicroWorld, nb: B07Notebook): Evaluation {
  const flags = b07StageEvidence(w, nb);
  const issues = notebookIssuesB07(w, nb);
  const has = (...xs: number[]) => xs.some((x) => issues.includes(`nb:${code(x)}`));
  const errs = (...xs: number[]) => xs.reduce((s, x) => s + n(w, `err:${code(x)}`), 0);

  // ── Seguridad y trazabilidad (15) ──
  let safety = [
    item('b07.ppe', flags.ppe && errs(57) === 0 ? true : flags.ppe ? null : false, 3, firstOf(w, [57], 'ppe'), undefined, 0.5),
    item('b07.restricted', errs(58, 59, 63) === 0, 4, firstOf(w, [58, 59, 63], 'restricted')),
    item('b07.traceability', errs(5, 6, 9, 27) === 0 && w.micro.readings.length > 0, 4, firstOf(w, [9, 6, 5, 27], 'traceability')),
    item('b07.closure', flags.safeParked && flags.benchRestored && errs(60, 61, 62, 64) === 0 && platesReturned(w) && fixedReturned(w), 4, firstOf(w, [64, 60, 61, 62], 'closure')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b07fb.incident' }));

  // ── Medios (15) ──
  const right = nb.media.filter((r) => {
    const t = mediaTruth(r.mediaId);
    return t && r.consistency === t.consistency && r.func === t.func;
  }).length;
  const emb = nb.media.find((r) => r.mediaId === 'mEMB');
  const media = [
    item('b07.inspect', w.micro.inspected.length >= 3 && w.micro.mediaCommitted, 3, 'b07fb.inspect'),
    item('b07.classification', right === 3 && !has(1, 2), 6, firstOf(w, [1, 2], 'classification', issues), { n: right }, (right / 3) * 0.6),
    item('b07.function', !!emb?.selectiveMeans && !has(3, 8), 3, firstOf(w, [3, 8], 'function', issues)),
    item('b07.claims', !has(4, 7) && nb.media.every((r) => !r.justification || r.justification.trim().length > 0), 3, firstOf(w, [4, 7], 'claims', issues)),
  ];

  // ── Colonias y distribución (15) ──
  const rows = nb.colonies.filter((r) => r.readingId && w.micro.readings.some((x) => x.id === r.readingId) && r.form && r.margin && r.elevation && r.surface);
  const seen = PLATES_ASSIGNED.every((id) => w.micro.platesViewed.includes(id));
  const lowOverlap = w.micro.trials.some((t) => t.overlap01 <= w.params.micro!.streakOverlapThreshold);
  const colonies = [
    item('b07.colonyRecord', seen && rows.length >= 2 && !has(14, 15), 5, firstOf(w, [14, 15], 'colonyRecord', issues), { n: rows.length }, Math.min(1, rows.length / 2) * 0.6),
    item('b07.control', !!w.evidence.controlPlateSeen && errs(13) === 0, 2, firstOf(w, [13], 'control')),
    item('b07.cfu', !has(16, 24), 3, firstOf(w, [24, 16], 'cfu', issues)),
    item('b07.distribution', lowOverlap && w.micro.methodsCompared && errs(10) === 0 && !has(11, 12), 5, firstOf(w, [10, 11, 12], 'distribution', issues)),
  ];

  // ── Preparación y Gram (20) ──
  const smears = Object.values(w.micro.smears);
  const complete = smears.some((s) => gramComplete(s) && !s.invalidOrder);
  const gram = [
    item('b07.smear', smears.length > 0 && errs(25, 26, 28, 29, 30, 31, 32) === 0, 6, firstOf(w, [25, 26, 28, 29, 30, 31, 32], 'smear')),
    item('b07.phases', complete && errs(33, 34, 35, 37, 38) === 0, 6, firstOf(w, [38, 33, 34, 35, 37], 'phases')),
    item('b07.decolor', complete && errs(36, 39) === 0, 4, firstOf(w, [36, 39], 'decolor')),
    item('b07.controls', controlsReviewed(w), 4, 'b07fb.controls'),
  ];

  // ── Microscopio (15) ──
  const hi = ownSmearCaptures(w).filter((o) => (o.objectiveX ?? 0) >= 40).length;
  const optics = [
    item('b07.mount', !!w.evidence.slideClamped && errs(41) === 0, 3, firstOf(w, [41], 'mount')),
    item('b07.sequence', hi > 0 && errs(42, 43) === 0, 5, firstOf(w, [43, 42], 'sequence')),
    item('b07.image', hi > 0 && errs(46, 47) === 0, 4, firstOf(w, [47, 46], 'image')),
    w.div.immersion
      ? item('b07.immersion', !!w.evidence.immersionUsed && errs(44, 45, 48) === 0 && !w.micro.immersionDirty, 3, firstOf(w, [44, 45, 48], 'immersion'))
      : item('b07.noImmersion', errs(44, 45) === 0, 3, firstOf(w, [44, 45], 'noImmersion')),
  ];

  // ── Medición y libreta (10) ──
  const noScale = !w.micro.scaleAvailable;
  const measured = nb.colonies.filter((r) => r.measureId && w.micro.measures.some((m) => m.id === r.measureId && m.valid));
  const measureOk = measured.some((r) => {
    const m = w.micro.measures.find((x) => x.id === r.measureId)!;
    return r.unit === 'mm' && near(parseNum(r.diameter), m.mm) && parseNum(r.uncertainty) > 0;
  });
  const opticsRows = nb.optics.filter((r) => observation(w, r.observationId));
  const magOk = opticsRows.length > 0 && opticsRows.every((r) => {
    const o = observation(w, r.observationId)!;
    return parseNum(r.totalMag) === w.params.microscope.ocularX * (o.objectiveX ?? 0);
  });
  const blocked = w.micro.plates.plA.profile === 'confluent';
  const measure = [
    item('b07.diameter', noScale || blocked ? (errs(17) ? false : null) : measureOk && errs(17, 19, 21, 56) === 0 && !has(18, 20, 22, 23), 5, noScale || blocked ? 'b07fb.noScale' : firstOf(w, [17, 19, 21, 56, 18, 20, 22, 23], 'diameter', issues)),
    item('b07.magnification', magOk, 3, 'b07fb.magnification'),
    item('b07.answers', answeredCount(nb) >= 5 ? null : false, 2, 'b07fb.answers', { n: answeredCount(nb) }, 0.5),
  ];

  // ── Interpretación (10) ──
  const own = nb.gram.filter((r) => isOwnSmear(w, observation(w, r.observationId)) && r.interpretation);
  const readingOk = own.length > 0 && own.every((r) => admissibleReadings(observation(w, r.observationId)!.assetId).includes(r.interpretation));
  const claimOk = nb.integrative.claim === 'preliminary' || nb.integrative.claim === 'insufficient';
  const interpretation = [
    item('b07.reading', readingOk && errs(53) === 0 && !has(40, 54, 55), 4, firstOf(w, [53, 40, 54, 55], 'reading', issues)),
    item('b07.limits', !has(49, 50, 51, 52) && nb.gram.some((r) => filled(r.limits)), 3, firstOf(w, [49, 50, 51, 52], 'limits', issues)),
    item('b07.conclusion', claimOk && filled(nb.integrative.conclusion) ? null : false, 3, 'b07fb.conclusion', undefined, 0.5),
  ];

  const components = [
    finalizeComponent('safety', B07_WEIGHTS.safety, safety),
    finalizeComponent('media', B07_WEIGHTS.media, media),
    finalizeComponent('colonies', B07_WEIGHTS.colonies, colonies),
    finalizeComponent('gram', B07_WEIGHTS.gram, gram),
    finalizeComponent('optics', B07_WEIGHTS.optics, optics),
    finalizeComponent('measure', B07_WEIGHTS.measure, measure),
    finalizeComponent('interpretation', B07_WEIGHTS.interpretation, interpretation),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
