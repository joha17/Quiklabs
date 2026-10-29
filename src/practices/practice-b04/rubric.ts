/**
 * Rúbrica pura de B04 (§12): 12 % bioseguridad, 13 % preparación y trazabilidad, 25 % identificación de biomoléculas,
 * 25 % actividad enzimática, 10 % instrumentos y 15 % libreta. Usa los hechos del intento y las lecturas PROPIAS:
 * técnica equivocada (err:*), observación faltante y conclusión errada (nb:*) quedan en ítems separados. Un accidente
 * anula solo el componente de seguridad; una imagen de Feulgen ausente redistribuye ese ítem, nunca lo tacha.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { BioWorld } from '../../simulation/bio-world/types';
import { observeVessel } from '../../simulation/bio-world/world';
import { b04StageEvidence } from './evidence';
import { amylaseContrast, assayControls, assayOf, catalaseConditions, feulgenCaptures, observation, reading, traceable, tubeByLabel } from './expected-results';
import { answeredCount, type B04Notebook } from './notebook';

export const B04_WEIGHTS = { safety: 0.12, preparation: 0.13, identification: 0.25, enzymes: 0.25, instruments: 0.1, notebook: 0.15 } as const;

const n = (w: BioWorld, k: string) => w.evidence[k] ?? 0;

/**
 * Errores de interpretación (`nb:*`): lo escrito en la libreta contrastado con las lecturas y la composición REAL de
 * cada tubo del intento (pigmento, reductor no glucídico, turbidez previa, región observada, normalización).
 */
export function notebookIssuesB04(w: BioWorld, nb: B04Notebook): string[] {
  const out: string[] = [];
  for (const r of nb.assays.rows) {
    const rd = reading(w, r.readingId);
    if (!rd || rd.instrument !== 'eye' || !w.bio.tubes[rd.targetId]) continue;
    const q = rd.quality ?? '';
    const t = w.bio.tubes[rd.targetId];
    const v = w.bio.vessels[rd.targetId];
    // Azul del Cu(II) del reactivo leído como positivo de proteína.
    if (q === 'biuret:blue' && r.result === 'positive') out.push('nb:B04');
    // Color de pigmento tomado por complejo yodo–almidón.
    if (q.startsWith('lugol:') && q.includes('pigment') && r.result === 'positive') out.push('nb:L03');
    // Turbidez que ya estaba antes del etanol tomada por emulsión nueva.
    if (q.startsWith('emulsion:') && r.result === 'positive' && t.initialRead === 'initial:turbid' && !/cloudy|milky/.test(q)) out.push('nb:E04');
    // Benedict positivo por un reductor no glucídico atribuido a un azúcar.
    if (q.startsWith('benedict:') && r.molecule === 'reducingSugar' && v.tags.some((x) => x.startsWith('sUnk')) && w.bio.vessels[v.tags.find((x) => x.startsWith('sUnk'))!]?.s.reductant > 0) out.push('nb:R05');
  }
  for (const r of nb.feulgen.rows) {
    const o = observation(w, r.observationId);
    if (!o || !r.dnaClaim) continue;
    const ok = (o.objectiveX ?? 0) >= 10 && (o.assetId === 'feulgenBuccal' || o.assetId === 'feulgenOnion');
    if (!ok) out.push('nb:F09');
  }
  if (nb.catalase.claim === 'sourceDiffers' && (nb.catalase.normalizedBy === 'none' || nb.catalase.normalizedBy === '')) out.push('nb:C08');
  if (nb.amylase.claim === 'noHydrolysis' && nb.amylase.basis === 'benedict') out.push('nb:A08');
  if (nb.adh.fehlingClaim === 'acetaldehydeOnly') out.push('nb:D03');
  if (nb.adh.iodoformClaim === 'ethanolOnly') out.push('nb:D04');
  if (nb.adh.methanolClaim === 'total') out.push('nb:D05');
  return [...new Set(out)];
}

const firstOf = (w: BioWorld, codes: string[], fallback: string, issues: string[] = []) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b04fb.${c}` : `b04fb.${fallback}`;
};

/** Filas de la libreta cuya interpretación coincide con la lectura propia (no con el color ideal de la guía). */
function coherentRows(w: BioWorld, nb: B04Notebook) {
  return nb.assays.rows.filter((r) => {
    const rd = reading(w, r.readingId);
    if (!rd || !r.result) return false;
    const q = rd.quality ?? '';
    const pos = /lugol:(blue|black)|biuret:(violet|lilac)|benedict:(green|yellow|orange|brick)|emulsion:(cloudy|milky)/.test(q);
    const neg = /lugol:yellow|biuret:blue|benedict:blue|emulsion:(clear|layers)/.test(q);
    return (pos && r.result === 'positive') || (neg && r.result === 'negative') || (!pos && !neg && r.result === 'ambiguous');
  }).length;
}

export function evaluateB04(w: BioWorld, nb: B04Notebook): Evaluation {
  const flags = b04StageEvidence(w, nb);
  const issues = notebookIssuesB04(w, nb);
  const has = (...ks: string[]) => ks.some((k) => issues.includes(`nb:${k}`));
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const fb = (codes: string[], fallback: string) => firstOf(w, codes, fallback, issues);
  const tubes = Object.entries(w.bio.tubes);
  const used = tubes.filter(([, t]) => Object.keys(t.reagents).length > 0);

  // ── Bioseguridad y cuidado (12) ──
  let safety = [
    item('b04.ppe', flags.ppe && errs('PPE') === 0 ? true : flags.ppe ? null : false, 2, 'b04fb.ppe', undefined, 0.5),
    item('b04.hazards', errs('S01', 'S02', 'S04', 'S05') === 0, 3, fb(['S04', 'S05', 'S01', 'S02'], 'hazards')),
    item('b04.waste', used.length > 0 && used.every(([, t]) => t.discarded) && errs('S03') === 0, 3, fb(['S03'], 'waste')),
    item('b04.spills', w.bio.vessels.spill.volumeMl < 0.1 && errs('M08', 'M15', 'C09', 'PREP05') === 0, 2, fb(['M08', 'M15', 'C09', 'PREP05'], 'spills')),
    item('b04.scope', errs('S06') === 0 && !!flags.safeParked, 2, fb(['S06'], 'scope')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b04fb.incident' }));

  // ── Preparación y trazabilidad (13) ──
  const preps = (['P1', 'P2', 'P3'] as const).filter((id) => !!w.bio.preps[id]?.labeled).length;
  const traced = used.filter(([id]) => traceable(w, id)).length;
  const preparation = [
    item('b04.starchPrep', flags.starchBatchReady && errs('PREP01', 'PREP02', 'PREP03', 'PREP04', 'PREP05') === 0, 3, fb(['PREP01', 'PREP02', 'PREP03', 'PREP04', 'PREP05'], 'starchPrep')),
    item('b04.liverPrep', flags.catalaseSuspensionReady && errs('PREP06', 'PREP07') === 0, 2, fb(['PREP06', 'PREP07'], 'liverPrep')),
    item('b04.amylasePrep', flags.amylaseBatchReady && errs('PREP08', 'PREP09') === 0, 2, fb(['PREP08', 'PREP09'], 'amylasePrep')),
    item('b04.labels', used.length > 0 && traced >= Math.min(used.length, 4) && errs('M01', 'M02', 'M13') === 0, 3, fb(['M13', 'M01', 'M02'], 'labels'), { n: traced }, used.length ? (traced / used.length) * 0.6 : 0),
    item('b04.aliquots', used.length > 0 && errs('M07', 'M09', 'M16', 'M10') === 0, 3, fb(['M07', 'M09', 'M16', 'M10'], 'aliquots'), { n: preps }),
  ];

  // ── Identificación de biomoléculas (25) ──
  const assays = (['LUG', 'BIU', 'EMU', 'BEN'] as const).map((a) => assayControls(w, a));
  const controls = assays.filter((a) => a.neg && a.pos).length;
  const dnaItem = flags.dnaSkipped
    ? item('b04.dna', null, 0, 'b04fb.dnaSkipped')
    : item('b04.dna', feulgenCaptures(w).length > 0 && errs('F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08') === 0 && !has('F09'), 5, fb(['F05', 'F01', 'F02', 'F03', 'F04', 'F06', 'F07', 'F08', 'F09'], 'dna'));
  const identification = [
    item('b04.starch', flags.iodineControlled && errs('L01', 'L02', 'L04', 'L05') === 0 && !has('L03'), 4, fb(['L01', 'L02', 'L04', 'L05', 'L03'], 'starch')),
    item('b04.protein', flags.proteinsTested && errs('B01', 'B02', 'B03', 'B05', 'B06') === 0 && !has('B04'), 4, fb(['B01', 'B02', 'B03', 'B05', 'B06', 'B04'], 'protein')),
    item('b04.lipid', flags.lipidsCompared && errs('E01', 'E02', 'E03', 'E05', 'E06') === 0 && !has('E04'), 4, fb(['E01', 'E02', 'E03', 'E05', 'E06', 'E04'], 'lipid')),
    item('b04.reducing', flags.reducingTested && errs('R01', 'R02', 'R03', 'R04', 'R06') === 0 && !has('R05'), 4, fb(['R01', 'R02', 'R03', 'R04', 'R06', 'R05'], 'reducing')),
    item('b04.controls', controls === 4 && errs('M11', 'M12') === 0, 4, fb(['M11', 'M12'], 'controls'), { n: controls }, (controls / 4) * 0.6),
    dnaItem,
  ];

  // ── Actividad enzimática (25) ──
  const cats = catalaseConditions(w);
  const amy = amylaseContrast(w);
  const adhItems = flags.adhEnabled
    ? [item('b04.adh', flags.adhEvaluated && errs('D01', 'D02', 'D06') === 0 && !has('D03', 'D04', 'D05'), 4, fb(['D01', 'D02', 'D06', 'D05', 'D03', 'D04'], 'adh'))]
    : [];
  const enzymes = [
    item('b04.catalaseSetup', cats.length > 0 && errs('C01', 'C02', 'C03', 'C04', 'C05', 'C06') === 0, 5, fb(['C04', 'C05', 'C02', 'C03', 'C01', 'C06'], 'catalaseSetup')),
    item('b04.catalaseCurve', flags.catalaseCurve && errs('C07') === 0, 5, fb(['C07'], 'catalaseCurve'), { n: cats.length }, Math.min(1, cats.length / 4) * 0.6),
    item('b04.catalaseInterpretation', flags.catalaseCurve && !has('C08') ? null : false, 3, fb(['C08'], 'catalaseInterpretation'), undefined, 0.6),
    item('b04.amylaseSetup', flags.amylaseBatchReady && errs('A01', 'A02', 'A03', 'A04', 'A05', 'A07') === 0, 5, fb(['A02', 'A05', 'A03', 'A04', 'A01', 'A07'], 'amylaseSetup')),
    item('b04.amylaseContrast', amy.lugol && amy.benedict && amy.control && errs('A06') === 0, 4, fb(['A06'], 'amylaseContrast'), { n: [amy.lugol, amy.benedict, amy.control].filter(Boolean).length }, ([amy.lugol, amy.benedict, amy.control].filter(Boolean).length / 3) * 0.6),
    item('b04.amylaseInterpretation', flags.amylaseContrasted && !has('A08') ? null : false, 3, fb(['A08'], 'amylaseInterpretation'), undefined, 0.6),
    ...adhItems,
  ];

  // ── Instrumentos y mediciones (10) ──
  const instruments = [
    item('b04.pipette', used.length > 0 && errs('M03', 'M04', 'M05', 'M06') === 0, 3, fb(['M03', 'M04', 'M05', 'M06'], 'pipette')),
    item('b04.balance', !!w.evidence['read:balance'] && !!w.bio.balance.tared, 2, 'b04fb.balance'),
    item('b04.temperature', !!w.evidence['read:thermo'] && errs('R04', 'R06', 'PREP04') === 0, 2, fb(['R04', 'R06', 'PREP04'], 'temperature')),
    item('b04.mixing', used.length > 0 && errs('M14', 'B06', 'A07') === 0, 3, fb(['M14', 'B06', 'A07'], 'mixing')),
  ];

  // ── Libreta y razonamiento (15) ──
  const k = answeredCount(nb);
  const coherent = coherentRows(w, nb);
  const filled = nb.assays.rows.filter((r) => r.readingId && r.result).length;
  const notebook = [
    item('b04.inference', filled > 0 && coherent === filled && issues.length === 0, 5, issues.length ? `b04fb.${issues[0].slice(3)}` : 'b04fb.inference', { n: coherent }, filled ? (coherent / filled) * 0.6 : 0),
    item('b04.limits', nb.errors.some((e) => e.observed.trim().length > 5 && e.cause.trim().length > 5) ? null : false, 4, 'b04fb.limits', undefined, 0.5),
    item('b04.answers', k >= 4 ? null : false, 6, 'b04fb.answers', { n: k }, Math.min(1, k / 8) * 0.6),
  ];

  const components = [
    finalizeComponent('safety', B04_WEIGHTS.safety, safety),
    finalizeComponent('preparation', B04_WEIGHTS.preparation, preparation),
    finalizeComponent('identification', B04_WEIGHTS.identification, identification.filter((i) => i.max > 0)),
    finalizeComponent('enzymes', B04_WEIGHTS.enzymes, enzymes),
    finalizeComponent('instruments', B04_WEIGHTS.instruments, instruments),
    finalizeComponent('notebook', B04_WEIGHTS.notebook, notebook),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = [
    ...components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key)),
    ...(flags.dnaSkipped ? ['b04.dna'] : []),
  ];
  return { components, total, needsTeacherReview };
}

/** Ayuda de lectura para la revisión docente: lo que el tubo muestra ahora. */
export const tubeNow = (w: BioWorld, label: string) => {
  const id = tubeByLabel(w, label);
  return id ? { id, assay: assayOf(w.bio.tubes[id]), ...observeVessel(w, id) } : null;
};
