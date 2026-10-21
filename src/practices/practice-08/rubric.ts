/**
 * Evaluación por evidencia de la Práctica 8 (§13): seguridad y montaje 15, planeación química 15, medición y
 * preparación 15, desarrollo y control de la reacción 20, aislamiento y calidad 15, cálculos y registro 15,
 * interpretación 5. Los cálculos se corrigen contra las LECTURAS del propio estudiante; la técnica se juzga aparte
 * con la trayectoria del mundo. Las respuestas abiertas quedan `ok: null` (revisión docente). Un bloqueo preventivo
 * no es un accidente; un accidente consumado anula la seguridad sin destruir el resto (§13). Función pura (Worker).
 */
import type { P08World } from '../../simulation/organic-world/types';
import { finalizeComponent, item, type Evaluation, type ScoreItem } from '../../simulation/scoring/types';
import { SPECIES, massG } from '../../simulation/organic-chemistry/species';
import { PRODUCT } from '../../simulation/organic-chemistry/stoichiometry';
import { CATALYST } from '../../simulation/organic-world/world';
import { p08StageEvidence, predictionSaved } from './evidence';
import {
  cellValue, declaredPurity, near, otherRouteTheoreticals, plannedLimiting, productHolder, productMassReadings, reading, readingsOf, reagentsOf, rowMoles,
  trueLimiting, validReadings,
} from './expected-results';
import { answered, answeredCount, isNum, parseFraction, parseNum, ROWS_B, type Entry, type P08Notebook } from './notebook';

export const P08_RUBRIC_VERSION = 'p8-rubric-1';
export const P08_WEIGHTS = { safety: 0.15, planning: 0.15, measurement: 0.15, reaction: 0.2, isolation: 0.15, calculations: 0.15, interpretation: 0.05 } as const;

const n = (w: P08World, k: string) => w.evidence[k] ?? 0;

/** Todas las celdas instrumentales de la libreta. */
function allEntries(nb: P08Notebook): Entry[] {
  const c = nb.tableC;
  return [...ROWS_B.map((k) => nb.tableB.rows[k]), c.grossMass, c.supportMass, c.isolatedMass, c.analysis, c.density, c.purity];
}

/** Errores de cálculo, registro e interpretación de la libreta (`nb:ORGnn`, §9). Nunca cambian la composición. */
export function notebookIssues08(w: P08World, nb: P08Notebook): string[] {
  const out: string[] = [];
  const A = nb.tableA;
  const C = nb.tableC;
  const truth = trueLimiting(w);
  // ORG19: pureza 1 (o vacía) para un reactivo cuya ficha declara otra pureza.
  for (const { species } of reagentsOf(w.route)) {
    const row = A.reagents.find((r) => r.species === species);
    if (!row || !isNum(row.amount)) continue;
    const used = row.purity.trim() ? parseFraction(row.purity) : 1;
    const label = declaredPurity(w, species);
    if (label < 0.98 && Math.abs(used - label) > 0.02) out.push('nb:ORG19');
  }
  // ORG55: mL tratados como gramos (cantidad en «g» igual a un volumen leído, o moles = mL/M).
  for (const row of A.reagents) {
    if (!row.species || !isNum(row.amount)) continue;
    const sp = SPECIES[row.species];
    if (sp.phase !== 'liquid') continue;
    const amt = parseNum(row.amount);
    const volRead = validReadings(w, 'volume').some((r) => near(r.value, amt, 0.005, 0.01));
    if (row.unit === 'g' && volRead) out.push('nb:ORG55');
    if (row.unit === 'mL' && isNum(row.moles) && near(parseNum(row.moles), amt / sp.molarMass, 0.02) && sp.densityGml && Math.abs(sp.densityGml - 1) > 0.05) out.push('nb:ORG55');
  }
  // ORG34 (ISO) y ORG47 (MS): alcohol anotado distinto del realmente dispensado.
  const alcohol = w.route === 'ISO' ? 'IAA' : w.route === 'MS' ? 'MeOH' : null;
  if (alcohol) {
    const row = A.reagents.find((r) => r.species === alcohol);
    const planned = row ? rowMoles(row) : NaN;
    const real = n(w, `n0:${alcohol}`);
    if (Number.isFinite(planned) && real > 0) {
      if (w.route === 'ISO' && Math.abs(planned - real) > 0.05 * real) out.push('nb:ORG34');
      if (w.route === 'MS' && planned > real * 1.1) out.push('nb:ORG47');
    }
  }
  // ORG54: limitante incorrecto para SUS cantidades; ORG53: masa teórica de otra ruta.
  const plan = plannedLimiting(nb);
  const thTyped = parseNum(C.theoreticalG || A.theoreticalG);
  if (A.limiting && plan && A.limiting !== plan.limiting) out.push('nb:ORG54');
  if (A.limiting && !plan && truth.limiting && A.limiting !== truth.limiting) out.push('nb:ORG54');
  if (Number.isFinite(thTyped)) {
    const limMol = plan ? plan.theoreticalG / SPECIES[PRODUCT[w.route]].molarMass : truth.theoreticalG / SPECIES[PRODUCT[w.route]].molarMass;
    if (otherRouteTheoreticals(w.route, limMol).some((x) => near(thTyped, x, 0.01))) out.push('nb:ORG53');
    // Masa teórica calculada con el reactivo en exceso.
    if (plan) {
      for (const { species, nu } of reagentsOf(w.route)) {
        if (species === plan.limiting) continue;
        const row = A.reagents.find((r) => r.species === species);
        const nn = row ? rowMoles(row) : NaN;
        if (Number.isFinite(nn) && near(thTyped, (nn / nu) * SPECIES[PRODUCT[w.route]].molarMass, 0.01) && !near(thTyped, plan.theoreticalG, 0.01)) out.push('nb:ORG54');
      }
    }
  }
  // ORG56: masa aislada sin restar el soporte.
  const gross = cellValue(w, C.grossMass);
  const support = cellValue(w, C.supportMass);
  const isolated = parseNum(C.isolatedMass.value);
  if (Number.isFinite(isolated) && Number.isFinite(gross) && Number.isFinite(support) && support > 0.1 && near(isolated, gross, 0.002, 0.002)) out.push('nb:ORG56');
  // ORG59: masa por diferencia sin incertidumbre propagada.
  if (Number.isFinite(isolated) && (!C.isolatedMass.uncertainty.trim() || parseNum(C.isolatedMass.uncertainty) === 0)) out.push('nb:ORG59');
  // ORG58: rendimiento aparente recortado a 100 cuando sus datos dan más.
  const app = parseNum(C.apparentYield);
  const appFromData = Number.isFinite(isolated) && thTyped > 0 ? (100 * isolated) / thTyped : NaN;
  if (Number.isFinite(app) && Number.isFinite(appFromData) && appFromData > 100.5 && Math.abs(app - 100) < 0.05) out.push('nb:ORG58');
  // ORG52: pureza declarada sin ensayo; ORG57: 100 % de recuperación tomado como 100 % de pureza.
  const pur = C.purity.value.trim() ? parseFraction(C.purity.value) : NaN;
  const purRead = reading(w, C.purity.readingId);
  if (Number.isFinite(pur) && (!purRead || purRead.kind !== 'purity')) out.push('nb:ORG52');
  const corr = parseNum(C.correctedYield);
  if (Number.isFinite(corr) && Number.isFinite(app) && Math.abs(corr - app) < 0.05 && (!purRead || purRead.value < 99.5)) out.push('nb:ORG57');
  if (Number.isFinite(pur) && pur >= 0.9995 && (!purRead || purRead.value < 99.5)) out.push('nb:ORG57');
  // ORG51: densidad sin temperatura.
  if (w.route !== 'ASA' && C.density.readingId && !isNum(C.densityTempC)) out.push('nb:ORG51');
  // ORG60: lecturas de otro intento (o inexistentes en este).
  for (const e of allEntries(nb)) {
    if (!e.readingId) continue;
    if ((e.attemptId && nb.attemptId && e.attemptId !== nb.attemptId) || !w.readings[e.readingId]) out.push('nb:ORG60');
  }
  return [...new Set(out)];
}

const firstOf = (w: P08World, codes: string[], fallback: string) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0);
  return c ? `p8fb.${c}` : `p8fb.${fallback}`;
};
const firstNb = (issues: string[], codes: string[], fallback: string) => {
  const c = codes.find((k) => issues.includes(`nb:${k}`));
  return c ? `p8fb.${c}` : `p8fb.${fallback}`;
};

export function evaluateP08(w: P08World, nb: P08Notebook): Evaluation {
  const flags = p08StageEvidence(w, nb);
  const issues = notebookIssues08(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const route = w.route;
  const liquid = route !== 'ASA';
  const truth = trueLimiting(w);

  // ── Seguridad y montaje (15) ──
  const benchG = massG(w.outside.bench);
  const disposed = ['wasteAq', 'wasteOrg', 'wasteAcid', 'wasteSolid'].some((id) => massG(w.vessels[id]?.liq ?? {}) + massG(w.vessels[id]?.solid ?? {}) > 0.05);
  const blocks = errs('ORG39', 'ORG45', 'ORG46', 'ORG22', 'ORG25', 'ORG44');
  let safety: ScoreItem[] = [
    item('p8.ppe', flags.safety ? (errs('ORG01', 'ORG02') === 0 && !n(w, 'err:hair_untied') ? true : null) : false, 4, 'p8fb.ppe', undefined, 0.6),
    item('p8.equipment', errs('ORG03', 'ORG04', 'ORG22') === 0, 3, firstOf(w, ['ORG04', 'ORG22', 'ORG03'], 'equipment')),
    item('p8.alerts', blocks === 0 ? true : !w.safety.block ? null : false, 3, firstOf(w, ['ORG39', 'ORG45', 'ORG46', 'ORG25', 'ORG44'], 'alerts'), undefined, 0.5),
    item('p8.waste', disposed, 3, 'p8fb.waste'),
    item('p8.spills', benchG < 0.2 && errs('ORG11', 'ORG16') === 0, 2, firstOf(w, ['ORG11', 'ORG16'], 'spills'), { g: Math.round(benchG * 100) / 100 }),
  ];
  // Un accidente consumado (volcar el balón con corrosivos) anula la seguridad, no el resto.
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'p8fb.incident' }));

  // ── Planeación química y limitante (15) ──
  const A = nb.tableA;
  const plan = plannedLimiting(nb);
  const reactionOk = A.reactionType === (route === 'ASA' ? 'acetylation' : 'fischer');
  const groupOk = A.functionalGroup === (route === 'ASA' ? 'phenolHydroxyl' : 'carboxyl') || (route === 'ISO' && A.functionalGroup === 'alcoholHydroxyl');
  const molesRows = reagentsOf(route).filter(({ species }) => {
    const row = A.reagents.find((r) => r.species === species);
    return row && near(parseNum(row.moles), rowMoles(row), 0.02);
  }).length;
  const thA = parseNum(A.theoreticalG);
  const beforeMix = A.savedAtS !== null && (!w.evidence.reactantsMixed || A.savedAtS <= w.evidence.reactantsMixed + 1e-6);
  const planning = [
    item('p8.equation', reactionOk && A.equation.trim().length >= 5, 3, 'p8fb.equation'),
    item('p8.group', groupOk, 2, 'p8fb.group'),
    item('p8.moles', molesRows === 2 && !has('ORG19') && !has('ORG55') && !has('ORG34') && !has('ORG47') ? true : molesRows > 0 ? null : false, 4, firstNb(issues, ['ORG19', 'ORG55', 'ORG34', 'ORG47'], 'moles'), undefined, molesRows / 4),
    item('p8.limiting', !!A.limiting && !has('ORG54') && (plan ? A.limiting === plan.limiting : A.limiting === truth.limiting), 3, firstNb(issues, ['ORG54'], 'limiting')),
    item('p8.prediction', predictionSaved(nb) && plan !== null && near(thA, plan.theoreticalG, 0.02) && !has('ORG53') ? (beforeMix ? true : null) : false, 3, firstNb(issues, ['ORG53'], 'prediction'), undefined, 0.5),
  ];

  // ── Medición y preparación (15) ──
  const masses = validReadings(w, 'mass').length;
  const vols = validReadings(w, 'volume').length;
  const rowsB = ROWS_B.filter((k) => nb.tableB.rows[k].readingId && reading(w, nb.tableB.rows[k].readingId)?.valid).length;
  const measurement = [
    item('p8.weighing', masses >= 2 && errs('ORG06', 'ORG07', 'ORG08', 'ORG10', 'ORG43') === 0 ? true : masses >= 1 ? null : false, 4, firstOf(w, ['ORG06', 'ORG07', 'ORG08', 'ORG10', 'ORG43'], 'weighing'), undefined, 0.5),
    item('p8.dosing', (route === 'ASA' || vols >= 1) && errs('ORG09', 'ORG11') === 0, 3, firstOf(w, ['ORG09', 'ORG11'], 'dosing')),
    item('p8.reagents', errs('ORG05', 'ORG12', 'ORG44') === 0, 3, firstOf(w, ['ORG05', 'ORG44', 'ORG12'], 'reagents')),
    item('p8.recordsB', rowsB >= 4 ? true : rowsB >= 2 ? null : false, 3, 'p8fb.recordsB', { n: rowsB }, 0.5),
    item('p8.ready', flags.reagents_ready, 2, 'p8fb.ready'),
  ];

  // ── Desarrollo y control de la reacción (20) ──
  const temps = validReadings(w, 'temperature').length;
  const catRatio = n(w, `cat:${CATALYST[route]}`);
  const convTarget = route === 'ASA' ? 0.8 : 0.7;
  const reaction = [
    item('p8.heatControl', flags.reaction_observed && errs('ORG13', 'ORG14', 'ORG18') === 0 ? true : temps >= 1 ? null : false, 5, firstOf(w, ['ORG13', 'ORG14', 'ORG18'], 'heatControl'), { n: temps }, 0.5),
    item('p8.stirring', !!w.evidence.heated && errs('ORG15', 'ORG16') === 0, 3, firstOf(w, ['ORG15', 'ORG16'], 'stirring')),
    liquid
      ? item('p8.reflux', !!w.evidence.heated && errs('ORG20', 'ORG36', 'ORG46') === 0, 4, firstOf(w, ['ORG36', 'ORG20', 'ORG46'], 'reflux'))
      : item('p8.quench', !!w.evidence.heated && errs('ORG23') === 0, 4, firstOf(w, ['ORG23'], 'quench')),
    item('p8.catalyst', catRatio >= 0.005 && errs('ORG24', 'ORG25', 'ORG33') === 0, 3, firstOf(w, ['ORG24', 'ORG33', 'ORG25'], 'catalyst')),
    item('p8.reactionTime', truth.conversion >= convTarget && errs('ORG17', 'ORG35', 'ORG48') === 0 ? true : truth.conversion >= convTarget * 0.6 ? null : false, 5, firstOf(w, ['ORG17', 'ORG35', 'ORG48'], 'reactionTime'), undefined, 0.4),
  ];

  // ── Aislamiento y calidad (15) ──
  const analyses = readingsOf(w, 'purity').length + readingsOf(w, 'mp').length + readingsOf(w, 'density').length;
  const sepCodes = liquid ? ['ORG21', 'ORG37', 'ORG38', 'ORG49', 'ORG50'] : ['ORG26', 'ORG27', 'ORG28', 'ORG29', 'ORG30'];
  const dryCodes = liquid ? ['ORG40', 'ORG41', 'ORG42'] : ['ORG31', 'ORG32'];
  const isolation = [
    item('p8.isolated', flags.product_isolated, 4, 'p8fb.isolated'),
    item(liquid ? 'p8.separation' : 'p8.crystallization', flags.product_isolated && errs(...sepCodes) === 0, 4, firstOf(w, sepCodes, liquid ? 'separation' : 'crystallization')),
    item('p8.drying', flags.product_isolated && errs(...dryCodes) === 0, 4, firstOf(w, dryCodes, 'drying')),
    item('p8.analysis', analyses >= 2 ? true : analyses === 1 ? null : false, 3, 'p8fb.analysis', { n: analyses }, 0.5),
  ];

  // ── Cálculos y registro (15) ──
  const C = nb.tableC;
  const gross = cellValue(w, C.grossMass);
  const support = cellValue(w, C.supportMass);
  const isolated = parseNum(C.isolatedMass.value);
  const thC = parseNum(C.theoreticalG || A.theoreticalG);
  const app = parseNum(C.apparentYield);
  const grossFromProduct = C.grossMass.readingId ? productMassReadings(w).some((r) => r.id === C.grossMass.readingId) : false;
  const pur = reading(w, C.purity.readingId);
  const corr = parseNum(C.correctedYield);
  const expectedCorr = pur && pur.kind === 'purity' && Number.isFinite(isolated) && thC > 0 ? (100 * isolated * (pur.value / 100)) / thC : NaN;
  const calculations = [
    item('p8.isolatedMass', grossFromProduct && near(isolated, gross - support, 0.002, 0.002) && !has('ORG56'), 3, firstNb(issues, ['ORG56'], 'isolatedMass')),
    item('p8.theoretical', near(thC, plan?.theoreticalG ?? truth.theoreticalG, 0.02) && !has('ORG53'), 3, firstNb(issues, ['ORG53', 'ORG54'], 'theoretical')),
    item('p8.yield', near(app, Number.isFinite(isolated) && thC > 0 ? (100 * isolated) / thC : NaN, 0.01, 0.2) && !has('ORG58'), 3, firstNb(issues, ['ORG58'], 'yield')),
    item('p8.purity', !has('ORG52') && !has('ORG57') && (pur ? near(corr, expectedCorr, 0.01, 0.3) : !isNum(C.correctedYield)), 2, firstNb(issues, ['ORG52', 'ORG57'], 'purity')),
    item('p8.uncertainty', Number.isFinite(isolated) && !has('ORG59'), 2, firstNb(issues, ['ORG59'], 'uncertainty')),
    item('p8.traceable', !has('ORG60') && !has('ORG51') && !!C.grossMass.readingId && !!C.supportMass.readingId, 2, firstNb(issues, ['ORG60', 'ORG51'], 'traceable')),
  ];

  // ── Interpretación (5): abiertas para revisión docente ──
  const k = answeredCount(nb);
  const losses = C.losses.filter(answered).length;
  const interpretation = [
    item('p8.answers', k >= 3 ? null : false, 3, 'p8fb.answers', { n: k }, Math.min(1, k / 10) * 0.6),
    item('p8.diagnosis', losses >= 3 ? null : false, 2, 'p8fb.diagnosis', { n: losses }, (losses / 3) * 0.5),
  ];

  const components = [
    finalizeComponent('safety', P08_WEIGHTS.safety, safety),
    finalizeComponent('planning', P08_WEIGHTS.planning, planning),
    finalizeComponent('measurement', P08_WEIGHTS.measurement, measurement),
    finalizeComponent('reaction', P08_WEIGHTS.reaction, reaction),
    finalizeComponent('isolation', P08_WEIGHTS.isolation, isolation),
    finalizeComponent('calculations', P08_WEIGHTS.calculations, calculations),
    finalizeComponent('interpretation', P08_WEIGHTS.interpretation, interpretation),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}

export { productHolder };
