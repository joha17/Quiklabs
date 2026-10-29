/**
 * Rúbrica pura de B05 (§13): 15 % seguridad, EPP y recuperación; 15 % preparación y controles; 25 % catalasa y registro
 * de gas; 20 % amilasa y ensayos; 15 % análisis cuantitativo; 10 % libreta. Usa los hechos del intento y las lecturas
 * PROPIAS: la tasa, los moles de O₂, los glucosilos y el NADH se corrigen contra los valores que el estudiante importó
 * (con sus fugas, sesgos y retrasos), nunca contra un resultado ideal. Las respuestas abiertas quedan `ok: null`; un
 * recurso pendiente (B05RES) difiere el ítem afectado, nunca lo tacha.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { EnzWorld } from '../../simulation/enz-world/types';
import { b05StageEvidence } from './evidence';
import {
  aliquotsRead, amylaseControl, batchReady, captureLosses, catalaseRun, gasReadingsOf, glucosylExpected, meanReactionK, nadhExpected, rateExpected, reading,
  starchCaptures, tubeByLabel,
} from './expected-results';
import { answeredCount, parseNum, type B05Notebook } from './notebook';

export const B05_WEIGHTS = { safety: 0.15, prep: 0.15, catalase: 0.25, amylase: 0.2, quant: 0.15, notebook: 0.1 } as const;

const n = (w: EnzWorld, k: string) => w.evidence[k] ?? 0;
const near = (a: number, b: number, abs: number, rel = 0.05) => Number.isFinite(a) && Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));

/**
 * Errores de cálculo e interpretación (`nb:*`): lo escrito en la libreta contrastado con las lecturas importadas y los
 * hechos del propio intento (pérdidas de captación registradas, temperaturas reales, tiempos reales de cada alícuota).
 */
export function notebookIssuesB05(w: EnzWorld, nb: B05Notebook): string[] {
  const out: string[] = [];
  const add = (c: string) => out.push(`nb:${c}`);
  const r = nb.rate;
  const gasRow = nb.gas.find((g) => g.label === r.label);
  const gasReads = gasRow ? gasRow.readingIds.map((id) => reading(w, id)).filter((x) => !!x) : [];
  // Controles (M02, M03).
  if (!nb.controls.blank && nb.gas.filter((g) => g.readingIds.some((id) => reading(w, id))).length >= 2) add('M02');
  if (nb.controls.blank && nb.controls.blank === nb.controls.active) add('M03');
  // Catalasa: espuma como gas (C08), una sola lectura (C13), sin normalizar (C14).
  if (nb.gas.some((g) => g.readingIds.some((id) => reading(w, id)?.instrument === 'foam'))) add('C08');
  if (r.rateMlS.trim() && gasReads.filter((x) => x!.instrument === 'collector').length === 1) add('C13');
  if (r.rateMlS.trim() && !r.ratePerG.trim() && nb.gas.filter((g) => g.readingIds.some((id) => reading(w, id))).length >= 2) add('C14');
  // Temperatura y pH (T03, T05, T10).
  if (nb.conditions.some((c) => ['wb1', 'wb2'].includes(reading(w, c.tempReadingId)?.targetId ?? ''))) add('T03');
  if (nb.factors.recovered === 'yes') add('T05');
  const tb = meanReactionK(w, 'cat-base');
  const ta = meanReactionK(w, 'cat-acid') ?? meanReactionK(w, 'cat-base-ph');
  if (nb.factors.attribution === 'ph' && tb !== null && ta !== null && Math.abs(ta - tb) > 2) add('T10');
  // Amilasa (A08, A14, A15, A16).
  for (const row of nb.amylase.rows) {
    const rd = reading(w, row.readingId);
    const t = rd ? w.enz.tubes[rd.targetId] : undefined;
    const ts = parseNum(row.timeS);
    if (t && t.sampledAfterS !== null && Number.isFinite(ts) && Math.abs(ts - t.sampledAfterS) > 45) add('A08');
  }
  const amyRows = nb.amylase.rows.filter((x) => reading(w, x.readingId)?.instrument === 'eye').length;
  if (amyRows > 0 && !amylaseControl(w)) add('A14');
  if (nb.amylase.benedictMeans === 'glucose') add('A15');
  if (nb.amylase.lugolNegative === 'complete') add('A16');
  // ADH (H04, H06–H10).
  const nx = nadhExpected(w, nb);
  const path = parseNum(nb.adh.pathCm);
  if (nx && Number.isFinite(path) && Math.abs(path - nx.pathCm) > 0.05) add('H04');
  if (nb.adh.totalInhibition === 'yes') add('H06');
  if (nb.adh.fehling === 'specific') add('H07');
  if (nb.adh.iodoform === 'exact') add('H08');
  const uvCuvettes = [...new Set(nb.adh.rows.map((x) => reading(w, x.readingId)).filter((x) => x?.instrument === 'uv').map((x) => x!.targetId))];
  if (uvCuvettes.length >= 2) {
    const temps = uvCuvettes.map((id) => w.enz.vessels[id]?.tK ?? 298.15);
    if (Math.max(...temps) - Math.min(...temps) > 1) add('H09');
  }
  if (nb.adh.fehling && nb.adh.fehlingBlank === 'notNeeded') add('H10');
  // Análisis cuantitativo (N01–N12).
  const ex = rateExpected(w, nb);
  const rate = parseNum(r.rateMlS);
  const rateMin = parseNum(r.rateMlMin);
  const nO2 = parseNum(r.nO2Mmol);
  if (ex && ex.windowStart > ex.firstT + 30) add('N01');
  if (ex && ex.rateMlS > 1e-4 && ((Number.isFinite(rate) && near(rate, ex.rateMlMin, 1e-3, 0.06) && !near(rate, ex.rateMlS, 1e-4, 0.06)) || (Number.isFinite(rateMin) && near(rateMin, ex.rateMlS, 1e-4, 0.06) && !near(rateMin, ex.rateMlMin, 1e-3, 0.06)))) add('N02');
  if (ex && ex.nO2Mmol > 1e-6 && Number.isFinite(nO2) && near(nO2, ex.nO2Mmol * 1000, 1e-3, 0.06)) add('N03');
  if (r.ventedIncluded === 'no' && captureLosses(w)) add('N04');
  if (Number.isFinite(rate) && !ex) add('N05');
  if (r.attribution === 'catalysis' && captureLosses(w)) add('N06');
  if (r.normUnit === 'mgEnzyme') add('N07');
  if (r.rateMlS.trim() && !r.uncertaintyMl.trim()) add('N08');
  if (parseNum(nb.factors.heatApparent) > 1.05 && nb.factors.recovered === 'yes') add('N09');
  if ((nb.adh.inhibitionType === 'competitive' || nb.adh.inhibitionType === 'noncompetitive') && nb.adh.rows.filter((x) => reading(w, x.readingId)?.instrument === 'uv').length < 3) add('N10');
  if (ex && ex.nO2Mmol > 1e-6 && Number.isFinite(nO2) && near(nO2, ex.nO2Mmol / 1000, 1e-9, 0.06) && !near(nO2, ex.nO2Mmol, 1e-6, 0.06)) add('N11');
  if (r.rateMlS.trim() && !nb.conditions.some((c) => reading(w, c.tempReadingId) && reading(w, c.clockReadingId))) add('N12');
  return [...new Set(out)];
}

const firstOf = (w: EnzWorld, codes: string[], fallback: string, issues: string[] = []) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b05fb.${c}` : `b05fb.${fallback}`;
};

export function evaluateB05(w: EnzWorld, nb: B05Notebook): Evaluation {
  const flags = b05StageEvidence(w, nb);
  const issues = notebookIssuesB05(w, nb);
  const has = (...ks: string[]) => ks.some((k) => issues.includes(`nb:${k}`));
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const fb = (codes: string[], fallback: string) => firstOf(w, codes, fallback, issues);
  const tubes = Object.values(w.enz.tubes);
  const deferred = w.enz.incidents.length > 0 || w.cell.incidents.length > 0;

  // ── Seguridad, EPP y recuperación (15) ──
  let safety = [
    item('b05.ppe', flags.ppe && errs('M12') === 0 ? true : flags.ppe ? null : false, 3, 'b05fb.ppe', undefined, 0.5),
    item('b05.waste', tubes.some((t) => t.discarded) && errs('S05') === 0 && tubes.filter((t) => t.sources.length > 0).every((t) => t.discarded), 3, fb(['S05'], 'waste')),
    item('b05.spills', w.enz.vessels.spill.volumeMl < 0.05 && errs('M08', 'C12', 'S04') === 0, 2, fb(['C12', 'S04', 'M08'], 'spills')),
    item('b05.hazards', errs('S01', 'S02', 'S06', 'S07', 'C10') === 0, 4, fb(['S01', 'S02', 'S07', 'S06', 'C10'], 'hazards')),
    item('b05.heat', !!flags.benchRestored && errs('S08') === 0, 3, fb(['S08'], 'heat')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b05fb.incident' }));

  // ── Preparación y controles (15) ──
  const prep = [
    item('b05.p1', batchReady(w, 'P1') && errs('PREP01', 'PREP02', 'PREP03', 'PREP04', 'PREP05') === 0, 4, fb(['PREP01', 'PREP02', 'PREP03', 'PREP04', 'PREP05'], 'p1')),
    item('b05.p2', batchReady(w, 'P2') && errs('PREP06', 'PREP07') === 0, 3, fb(['PREP06', 'PREP07'], 'p2')),
    item('b05.p3', batchReady(w, 'P3') && errs('PREP08', 'PREP09') === 0, 3, fb(['PREP08', 'PREP09'], 'p3')),
    item('b05.measure', errs('M04', 'M05', 'M06', 'M07', 'M09', 'M10', 'M11') === 0 && batchReady(w, 'P1'), 2, fb(['M04', 'M05', 'M06', 'M07', 'M09', 'M10', 'M11'], 'measure')),
    item('b05.controls', !!flags.controls && !has('M02', 'M03') && errs('M01') === 0, 3, fb(['M01', 'M02', 'M03'], 'controls')),
  ];

  // ── Catalasa y registro de gas (25) ──
  const base = tubeByLabel(w, 'cat-base');
  const baseReads = base ? gasReadingsOf(w, base[0]).length : 0;
  const factors = ['cat-heat', 'cat-acid', 'cat-base-ph'].filter((l) => catalaseRun(w, l, 2)).length;
  const catalase = [
    item('b05.gasSetup', !!base && base[1].reactionAt !== null && errs('C06', 'C07', 'C10', 'C15', 'S06') === 0, 5, fb(['C06', 'C07', 'C10', 'C15'], 'gasSetup')),
    item('b05.timing', !!base && base[1].reactionAt !== null && errs('C05', 'C11', 'C16') === 0, 4, fb(['C05', 'C11', 'C16'], 'timing')),
    item('b05.series', baseReads >= 4 && !has('C08', 'C13'), 5, fb(['C08', 'C13'], 'series'), { n: baseReads }, Math.min(1, baseReads / 4) * 0.6),
    item('b05.tissue', !!base && errs('C01', 'C02', 'C03', 'C04', 'C09', 'C12') === 0 && !has('C14'), 4, fb(['C01', 'C02', 'C03', 'C04', 'C09', 'C14'], 'tissue')),
    item('b05.factors', factors >= 2 && errs('T01', 'T02', 'T04', 'T06', 'T07', 'T08', 'T09') === 0, 4, fb(['T01', 'T02', 'T04', 'T06', 'T07', 'T08', 'T09'], 'factors'), { n: factors }, (factors / 2) * 0.6),
    item('b05.factorInterpretation', flags.cat_factors && !has('T03', 'T05', 'T10', 'N09') ? null : false, 3, fb(['T05', 'T10', 'T03', 'N09'], 'factorInterpretation'), undefined, 0.6),
  ];

  // ── Amilasa y ensayos (20) ──
  const a = aliquotsRead(w);
  const amylase = [
    item('b05.amySetup', !!flags.amy_setup && errs('A01', 'A02', 'A03', 'A04', 'T11') === 0, 4, fb(['A01', 'A02', 'A03', 'A04', 'T11'], 'amySetup')),
    item('b05.sampling', a.distinctTimes >= 3 && errs('A05', 'A06', 'A09') === 0 && !has('A08'), 5, fb(['A05', 'A06', 'A09', 'A08'], 'sampling'), { n: a.distinctTimes }, Math.min(1, a.distinctTimes / 4) * 0.6),
    item('b05.indicators', a.lugol.length >= 3 && a.benedict.length >= 1 && errs('A07', 'A10', 'A11', 'A12', 'A13', 'T12') === 0, 5, fb(['A07', 'A10', 'A11', 'A12', 'A13', 'T12'], 'indicators')),
    item('b05.amyControl', amylaseControl(w) && !has('A14'), 2, fb(['A14'], 'amyControl')),
    item('b05.amyInterpretation', flags.amy_assays && !has('A15', 'A16') ? null : false, 4, fb(['A15', 'A16'], 'amyInterpretation'), undefined, 0.6),
  ];

  // ── Análisis cuantitativo (15) ──
  const ex = rateExpected(w, nb);
  const r = nb.rate;
  const rateOk = !!ex && (near(parseNum(r.rateMlS), ex.rateMlS, 2e-3, 0.1) || near(parseNum(r.rateMlMin), ex.rateMlMin, 0.1, 0.1));
  const molOk = !!ex && near(parseNum(r.nO2Mmol), ex.nO2Mmol, 0.005, 0.06) && near(parseNum(r.predictedO2Mmol), ex.predictedO2Mmol, 0.005, 0.03);
  const gly = glucosylExpected(w);
  const nx = nadhExpected(w, nb);
  const quant = [
    item('b05.rate', rateOk && !has('N01', 'N02', 'N05'), 4, fb(['N01', 'N02', 'N05'], 'rate')),
    item('b05.moles', molOk && !has('N03', 'N11'), 4, fb(['N03', 'N11'], 'moles')),
    item('b05.balance', r.ventedIncluded !== '' && !has('N04', 'N06'), 3, fb(['N04', 'N06'], 'balance')),
    item('b05.glucosyl', gly !== null && near(parseNum(nb.glucosyl.initialMmol), gly, 0.02, 0.1), 2, 'b05fb.glucosyl'),
    w.enz.adhEnabled
      ? item('b05.adh', !!nx && near(parseNum(nb.adh.nadhUM), nx.nadhUM, 1, 0.08) && !has('H04', 'H06', 'H07', 'H08', 'H09', 'H10', 'N10') && errs('H01', 'H02', 'H03', 'H05') === 0, 2, fb(['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'N10'], 'adh'))
      : item('b05.normalization', r.normUnit === 'gTissue' && !has('N07', 'C14'), 2, fb(['N07', 'C14'], 'normalization')),
  ];

  // ── Libreta y explicación científica (10) ──
  const k = answeredCount(nb);
  const micro = starchCaptures(w).length > 0 || (deferred && w.enz.incidents.some((i) => i.startsWith('SC')));
  const notebook = [
    item('b05.micro', micro && nb.micro.structure === 'starchGranules' && errs('MIC01', 'MIC02', 'MIC03', 'MIC04', 'MIC05', 'MIC06') === 0, 3, fb(['MIC01', 'MIC02', 'MIC03', 'MIC04', 'MIC05', 'MIC06'], 'micro')),
    item('b05.records', !has('N08', 'N12') && nb.rate.uncertaintyMl.trim() !== '', 3, fb(['N08', 'N12'], 'records')),
    item('b05.answers', k >= 5 ? null : false, 4, 'b05fb.answers', { n: k }, Math.min(1, k / 10) * 0.6),
  ];

  const components = [
    finalizeComponent('safety', B05_WEIGHTS.safety, safety),
    finalizeComponent('prep', B05_WEIGHTS.prep, prep),
    finalizeComponent('catalase', B05_WEIGHTS.catalase, catalase),
    finalizeComponent('amylase', B05_WEIGHTS.amylase, amylase),
    finalizeComponent('quant', B05_WEIGHTS.quant, quant),
    finalizeComponent('notebook', B05_WEIGHTS.notebook, notebook),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
