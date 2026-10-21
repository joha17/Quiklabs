/**
 * Evaluación por evidencia de la Práctica 9 (§12): seguridad 15 %, diseño de controles 10 %, colores y espectros 20 %,
 * precipitación selectiva 20 %, fraccionamiento y trazabilidad 15 %, identificación 10 %, libreta 10 %. Distingue error
 * de LECTURA (interpretación), de PROCEDIMIENTO (fracción, volumen, contaminación) y de MONTAJE (campana, rotor). La
 * identidad se contrasta con el escenario de ESTE intento. Abiertas → `ok: null`. Función pura (Worker).
 */
import type { P09World } from '../../simulation/cation-analysis-world/types';
import { finalizeComponent, item, type Evaluation, type ScoreItem } from '../../simulation/scoring/types';
import { massG } from '../../simulation/cation-analysis-world/species';
import { REAGENT } from '../../simulation/cation-analysis-world/world';
import { hypothesesSaved, p09StageEvidence, supportComparison, testedControls, validEdges } from './evidence';
import { emissionsOf, precipitationTests, reading, statusOk, validOf } from './expected-results';
import { answered, answeredCount, ATLAS_KEYS, CATIONS, parseNum, type P09Notebook } from './notebook';

export const P09_RUBRIC_VERSION = 'p9-rubric-1';
export const P09_WEIGHTS = { safety: 0.15, design: 0.1, spectra: 0.2, precipitation: 0.2, fractions: 0.15, identification: 0.1, notebook: 0.1 } as const;

const n = (w: P09World, k: string) => w.evidence[k] ?? 0;

/** Familias de color para comparar lo anotado con lo observado (E07). */
const FAMILY: Record<string, string> = { violet: 'violet', lilac: 'violet', crimson: 'red', red: 'red', orange: 'orange', yellow: 'yellow', none: 'none', blue: 'none', white: 'none', green: 'green' };

/** Errores de interpretación y registro de la libreta (`nb:*`, §9). */
export function notebookIssues09(w: P09World, nb: P09Notebook): string[] {
  const out: string[] = [];
  const B = nb.tableB;
  // E07 y E49: color anotado distinto del observado; color sin la condición de iluminación.
  for (const k of ATLAS_KEYS) {
    const row = B[k];
    const r = reading(w, row.readingId);
    if (r && row.color && FAMILY[row.color] !== FAMILY[r.category ?? 'none']) out.push('nb:E07');
    if (row.color && !row.lightPct.trim()) out.push('nb:E49');
  }
  // E11: concluir sin blanco.
  const concluded = CATIONS.some((c) => nb.tableF[c].status !== '');
  if (concluded && !emissionsOf(w, 'ctlBlank').length) out.push('nb:E11');
  // E16 y E19: vidrio de reloj tratado como refractario; sin comparar con el portamuestras refractario.
  if (nb.tableC.glassRating === 'heatResistant') out.push('nb:E16');
  if (concluded && !validOf(w, 'emission').some((r) => r.snapshot.support === 'refractoryCup')) out.push('nb:E19');
  // E23: volumen de gota nominal supuesto cuando el gotero dosificó otro volumen.
  for (const [key, reagent] of [['sr', REAGENT.sulfate], ['fe', REAGENT.alkali]] as const) {
    const d = nb.tableD[key];
    const drops = parseNum(d.drops);
    const typed = parseNum(d.volumeAdded.value);
    const real = n(w, `vol:${d.tube}:${reagent}`);
    if (Number.isFinite(typed) && Number.isFinite(drops) && real > 0 && Math.abs(typed - drops * w.params.dropMl) < 0.02 * typed + 1e-6 && Math.abs(real - typed) > 0.15 * real) out.push('nb:E23');
  }
  // E46, E47: carga del potasio y coeficientes del hidróxido.
  const kc = nb.tableF.kCharge.replace(/\s/g, '');
  if (kc && !['+1', '1+', '+'].includes(kc)) out.push('nb:E46');
  if (nb.tableD.fe.nuAnion.trim() && parseNum(nb.tableD.fe.nuAnion) !== 3) out.push('nb:E47');
  if (nb.tableD.sr.nuAnion.trim() && parseNum(nb.tableD.sr.nuAnion) !== 1) out.push('nb:E47');
  // E08, E30, E50: identificación solo por color, por turbidez o ausencia «total» por señal débil.
  for (const c of CATIONS) {
    const row = nb.tableF[c];
    if (row.status !== 'detected' && row.status !== 'notDetected') continue;
    const kinds = new Set(row.evidenceIds.map((id) => reading(w, id)?.kind).filter(Boolean));
    if (row.status === 'detected' && c !== 'K+' && kinds.size > 0 && [...kinds].every((k) => k === 'emission')) out.push('nb:E08');
    if (row.status === 'detected' && kinds.size > 0 && [...kinds].every((k) => k === 'turbidity')) out.push('nb:E30');
    if (row.status === 'notDetected' && !/(l[ií]mite|detecci|interfer|enmascar|sensibil)/i.test(row.limitation)) out.push('nb:E50');
  }
  // E45: sin fracción testigo de la muestra.
  const res = w.vessels[nb.tableE.reserveTube];
  if (concluded && (!res || !res.from.includes('smp1') || res.reagents.length > 0)) out.push('nb:E45');
  // E48: precipitación confundida con evaporación.
  const text = [nb.explanation, ...Object.values(nb.analysis)].join(' \n ').toLowerCase();
  if (text.split(/[.\n;]+/).some((s) => /(precipit|s[oó]lido)[^.]{0,60}(se evapor|por evapor)|evapor[^.]{0,40}(forma|produce)[^.]{0,20}(precipit|s[oó]lido)/.test(s) && !/no (se )?evapor/.test(s))) out.push('nb:E48');
  return [...new Set(out)];
}

const firstOf = (w: P09World, codes: string[], fallback: string) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0);
  return c ? `p9fb.${c}` : `p9fb.${fallback}`;
};
const firstNb = (issues: string[], codes: string[], fallback: string) => {
  const c = codes.find((k) => issues.includes(`nb:${k}`));
  return c ? `p9fb.${c}` : `p9fb.${fallback}`;
};

export function evaluateP09(w: P09World, nb: P09Notebook): Evaluation {
  const flags = p09StageEvidence(w, nb);
  const issues = notebookIssues09(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const em = validOf(w, 'emission');

  // ── Seguridad, EPP, campana y centrífuga (15) ──
  let safety: ScoreItem[] = [
    item('p9.ppe', flags.ppe && errs('E01') === 0 ? true : flags.ppe ? null : false, 3, 'p9fb.E01', undefined, 0.5),
    item('p9.hood', !!w.evidence.ignited && errs('E02', 'E03', 'E04', 'E05') === 0 ? true : w.evidence.ignited ? null : false, 5, firstOf(w, ['E02', 'E03', 'E04', 'E05'], 'hood'), undefined, 0.4),
    item('p9.centrifuge', !!w.evidence.spinDone && errs('E36', 'E37', 'E38', 'E39') === 0 ? true : w.evidence.spinDone ? null : false, 4, firstOf(w, ['E36', 'E37', 'E38', 'E39'], 'centrifuge'), undefined, 0.4),
    item('p9.spills', massG(w.outside.bench) < 0.05 && errs('E25', 'E17') === 0, 3, firstOf(w, ['E17', 'E25'], 'spills')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'p9fb.incident' }));

  // ── Diseño de controles e hipótesis (10) ──
  const firstMeas = em[0]?.t ?? Infinity;
  const design = [
    item('p9.hypotheses', hypothesesSaved(nb) && (nb.tableA.savedAtS ?? Infinity) <= firstMeas ? true : hypothesesSaved(nb) ? null : false, 3, 'p9fb.hypotheses', undefined, 0.5),
    item('p9.controls', testedControls(w).length >= 3, 3, 'p9fb.controls', { n: testedControls(w).length }),
    item('p9.blank', flags.blank && !has('E11'), 2, firstNb(issues, ['E11'], 'blank')),
    item('p9.reserve', !has('E45') && !!w.vessels[nb.tableE.reserveTube], 2, firstNb(issues, ['E45'], 'reserve')),
  ];

  // ── Colores, espectros e interferencias (20) ──
  const atlasRows = ATLAS_KEYS.filter((k) => nb.tableB[k].readingId && reading(w, nb.tableB[k].readingId)?.valid).length;
  const spectra = [
    item('p9.atlas', atlasRows >= 4 && errs('E09', 'E15', 'E20') === 0 && !has('E07') ? true : atlasRows >= 2 ? null : false, 5, firstOf(w, ['E09', 'E15', 'E20'], has('E07') ? 'E07' : 'atlas'), { n: atlasRows }, 0.5),
    item('p9.interference', flags.interference && errs('E12', 'E13', 'E14', 'E34') === 0, 4, firstOf(w, ['E12', 'E13', 'E14', 'E34'], 'interference')),
    item('p9.lighting', flags.twoLights && errs('E06') === 0 && !has('E49'), 3, firstOf(w, ['E06'], has('E49') ? 'E49' : 'lighting')),
    item('p9.spectrum', validOf(w, 'spectrum').length > 0 && errs('E10') === 0, 3, firstOf(w, ['E10'], 'spectrum')),
    item('p9.supports', supportComparison(w) && errs('E17', 'E18') === 0 && !has('E16') && !has('E19'), 5, firstOf(w, ['E17', 'E18'], has('E16') ? 'E16' : has('E19') ? 'E19' : 'supports')),
  ];

  // ── Precipitación selectiva y estequiometría (20) ──
  const srOk = precipitationTests(w, REAGENT.sulfate).length > 0;
  const feOk = precipitationTests(w, REAGENT.alkali).length > 0;
  const D = nb.tableD;
  const eqOk = parseNum(D.sr.nuCation) === 1 && parseNum(D.sr.nuAnion) === 1 && parseNum(D.fe.nuCation) === 1 && parseNum(D.fe.nuAnion) === 3;
  const precipitation = [
    item('p9.srPrecipitation', srOk && errs('E26', 'E27', 'E28', 'E29', 'E33') === 0, 6, firstOf(w, ['E26', 'E27', 'E28', 'E29', 'E33'], 'srPrecipitation')),
    item('p9.fePrecipitation', feOk && errs('E31', 'E32', 'E35') === 0, 6, firstOf(w, ['E31', 'E32', 'E35'], 'fePrecipitation')),
    item('p9.equations', eqOk && !has('E46') && !has('E47'), 5, firstNb(issues, ['E46', 'E47'], 'equations')),
    item('p9.observations', !!D.sr.observationId && !!D.fe.observationId && !!reading(w, D.sr.observationId) && !!reading(w, D.fe.observationId), 3, 'p9fb.observations'),
  ];

  // ── Fraccionamiento, separación y trazabilidad (15) ──
  const edges = validEdges(w, nb).length;
  const fractions = [
    item('p9.fractions', flags.fractions && errs('E40', 'E41', 'E42', 'E43', 'E44') === 0, 6, firstOf(w, ['E40', 'E41', 'E42', 'E43', 'E44'], 'fractions')),
    item('p9.traceability', errs('E21') === 0 && edges >= 3, 5, firstOf(w, ['E21'], 'traceability'), { n: edges }),
    item('p9.volumetry', errs('E22', 'E24') === 0 && !has('E23'), 4, firstOf(w, ['E22', 'E24'], has('E23') ? 'E23' : 'volumetry')),
  ];

  // ── Identificación sustentada (10) ──
  const okCount = CATIONS.filter((c) => statusOk(w, c, nb.tableF[c].status)).length;
  const twoMethods = CATIONS.filter((c) => new Set(nb.tableF[c].evidenceIds.map((id) => reading(w, id)?.kind).filter(Boolean)).size >= 1).length;
  const identification = [
    item('p9.identification', okCount === 3 && !['E08', 'E30', 'E50'].some(has) ? true : okCount > 0 ? null : false, 7, firstNb(issues, ['E08', 'E30', 'E50'], 'identification'), { n: okCount }, (okCount / 3) * 0.8),
    item('p9.crossCheck', flags.crossCheck && twoMethods === 3, 3, 'p9fb.crossCheck'),
  ];

  // ── Libreta, esquema y argumentación (10) ──
  const k = answeredCount(nb);
  const notebook = [
    item('p9.answers', k >= 4 ? null : false, 4, 'p9fb.answers', { n: k }, Math.min(1, k / 8) * 0.6),
    item('p9.explanation', answered(nb.explanation) ? null : false, 2, 'p9fb.explanation', undefined, 0.5),
    item('p9.reflection', answered(nb.errorReflection) ? null : false, 2, 'p9fb.reflection', undefined, 0.5),
    item('p9.argument', !has('E48'), 2, firstNb(issues, ['E48'], 'argument')),
  ];

  const components = [
    finalizeComponent('safety', P09_WEIGHTS.safety, safety),
    finalizeComponent('design', P09_WEIGHTS.design, design),
    finalizeComponent('spectra', P09_WEIGHTS.spectra, spectra),
    finalizeComponent('precipitation', P09_WEIGHTS.precipitation, precipitation),
    finalizeComponent('fractions', P09_WEIGHTS.fractions, fractions),
    finalizeComponent('identification', P09_WEIGHTS.identification, identification),
    finalizeComponent('notebook', P09_WEIGHTS.notebook, notebook),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
