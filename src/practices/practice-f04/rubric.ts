/**
 * Evaluación por evidencia de F04 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF04` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (masa que cae al soltar el cordel) anula solo el componente de seguridad.
 */
import type { F04World, ReadingF4 } from '../../simulation/f04-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f04StageEvidence } from './evidence';
import { cellValueF4, expectedMassRow, expectedModel, expectedPairs, expectedRuns, expectedSlope, validRuns } from './expected-results';
import { answered, answeredCountF4, isNum, parseNum, SETUP_FIELDS_F4, type F04Notebook } from './notebook';

const n = (w: F04World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;
const rd = (w: F04World, id: string | null): ReadingF4 | null => (id ? (w.readings[id] ?? null) : null);

export const F04_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (g ↔ kg, cm ↔ m). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF04(w: F04World, nb: F04Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  const p = w.params;
  const realistic = p.scientificMode === 'REALISTIC' && p.pulleyI > 0;
  // Montaje escrito a mano.
  if (SETUP_FIELDS_F4.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  const hangG = cellValueF4(w, nb.setup.hangerM);
  // Ensayos repetidos.
  const ev = expectedRuns(w, nb);
  const cfgs = new Set<string>();
  nb.runs.forEach((row, i) => {
    const r = rd(w, row.readingId);
    if (!r && [row.v1, row.v2, row.aGates].some(isNum)) add('E31');
    if (!r) return;
    if (r.kind !== 'run') {
      add('E33');
      return;
    }
    cfgs.add(`${r.configVersion}:${r.setup?.levelVersion ?? ''}`);
    if (Number.isFinite(hangG) && r.setup?.hangLoad !== undefined && Math.abs(r.setup.hangLoad - hangG) > 1.5) add('E33');
    const e = ev.rows[i];
    const v1 = parseNum(row.v1);
    const v2 = parseNum(row.v2);
    // E35: tiempo de bloqueo redondeado al ms antes de dividir.
    for (const [v, ex, exR] of [[v1, e.v1, e.v1Rounded], [v2, e.v2, e.v2Rounded]] as const) {
      if (Number.isFinite(v) && !near(exR, ex, 0.01) && near(v, exR, 0.005) && !near(v, ex, 0.005)) add('E35');
      if (misScaled(v, ex)) add('E34');
    }
    if (misScaled(parseNum(row.aGates), e.aGates)) add('E34');
  });
  if (cfgs.size > 1) add('E19');
  // Barrido de masa colgante.
  nb.massRuns.forEach((row, i) => {
    const r = rd(w, row.readingId);
    if (!r && [row.mh, row.aPred].some(isNum)) add('E31');
    if (!r) return;
    if (r.kind !== 'run') {
      add('E33');
      return;
    }
    const e = expectedMassRow(w, nb, i);
    const mh = parseNum(row.mh);
    if (Number.isFinite(mh) && Number.isFinite(e.mh) && !near(mh, e.mh, 0.02)) {
      if (near(mh, e.mhNoHanger, 0.02)) add('E06');
      else if (near(mh, e.mh * p.g, 0.02)) add('E16');
      else if (misScaled(mh, e.mh)) add('E34');
      else add('E14');
    }
    const ap = parseNum(row.aPred);
    if (Number.isFinite(ap) && Number.isFinite(e.mh)) {
      const mc = expectedModel(w, nb).mc;
      if (Number.isFinite(mc) && mc > 0 && near(ap, (e.mh * p.g) / mc, 0.01) && !near(ap, e.aPred, 0.01)) add('E01');
    }
  });
  // Modelo y cálculos.
  const em = expectedModel(w, nb);
  const C = nb.calc;
  const aP = parseNum(C.aPred.value);
  if (Number.isFinite(aP) && near(aP, em.aPredCartOnly, 0.01) && !near(aP, em.aPred, 0.01)) add('E01');
  if (misScaled(aP, em.aPred)) add('E34');
  if (realistic) {
    const mE = parseNum(C.mEff.value);
    const aI = parseNum(C.aPredI.value);
    if ((Number.isFinite(mE) && near(mE, em.mEffNoI, 0.005) && !near(mE, em.mEff, 0.005)) || (Number.isFinite(aI) && near(aI, em.aPred, 0.005) && !near(aI, em.aPredI, 0.005))) add('E17');
  }
  if (misScaled(parseNum(C.mEff.value), em.mEff)) add('E34');
  if (misScaled(parseNum(C.mSys.value), em.mSys)) add('E34');
  const es = expectedSlope(w, nb);
  const k = parseNum(C.slopeK.value);
  if (Number.isFinite(k) && Number.isFinite(es.slope) && ((near(k, es.inverse, 0.05) && !near(k, es.slope, 0.05)) || (k < 0 && es.slope > 0 && near(-k, es.slope, 0.05)))) add('E36');
  // E37: a media con menos de tres ensayos válidos.
  const valid = nb.runs.filter((x) => validRuns(w).some((r) => r.id === x.readingId)).length;
  if (isNum(C.aMean.value) && valid < 3) add('E37');
  // E38: u menor que la tipo B del sensor.
  const ua = parseNum(C.aMean.uncertainty);
  const uT = parseNum(C.TMean.uncertainty);
  if ((Number.isFinite(ua) && ua < ev.uBa * 0.95) || (Number.isFinite(uT) && uT < ev.uBT * 0.95)) add('E38');
  // Tercera ley.
  nb.pairs.forEach((row) => {
    const r = rd(w, row.readingId);
    if (!r && isNum(row.sum)) add('E31');
    if (r && r.kind !== 'pair') add('E33');
  });
  if (nb.mcq === 'velocity') add('E20');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF04(nb: F04Notebook): number {
  const cells = [
    ...SETUP_FIELDS_F4.map((k) => !!nb.setup[k].readingId),
    ...nb.runs.filter((r) => r.readingId || isNum(r.v1) || isNum(r.aGates)).map((r) => !!r.readingId),
    ...nb.massRuns.filter((r) => r.readingId || isNum(r.mh)).map((r) => !!r.readingId),
    ...nb.pairs.filter((r) => r.readingId || isNum(r.sum)).map((r) => !!r.readingId),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF04(w: F04World, nb: F04Notebook): Evaluation {
  const flags = f04StageEvidence(w, nb);
  const issues = notebookIssuesF04(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const accident = n(w, 'err:E40') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f04.accident', false, 15, 'f04fb.accident')]
    : [
      item('f04.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f04fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f04.stops', !err('E10').length, 3, 'f04fb.E10'),
      item('f04.shock', !err('E39').length, 2, 'f04fb.E39'),
      item('f04.clamp', !err('E28').length, 3, 'f04fb.E28'),
      item('f04.closed', flags.stationClosed, 3, 'f04fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f04.${key}`, gate && e.length === 0, max, `f04fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f04.inspected', flags.instrumentsInspected, 2, 'f04fb.inspected'),
    instE(['E21', 'E30'], 'balance', 3, flags.massesWeighed),
    instE(['E29'], 'scale', 2, flags.gatesRead),
    instE(['E21', 'E22', 'E23', 'E27'], 'forceSensor', 4, flags.sensorsReady),
    instE(['E07', 'E26'], 'mounting', 3, flags.sensorsReady),
    instE(['E24', 'E25', 'E08'], 'logger', 3, flags.repeatedRuns),
    instE(['E13'], 'pairSigns', 3, flags.pairsDone),
  ];

  const execution = [
    instE(['E02'], 'level', 3, flags.trackLevel),
    instE(['E03', 'E04'], 'string', 4, flags.stringReady),
    instE(['E09', 'E18'], 'release', 3, flags.repeatedRuns),
    instE(['E05'], 'window', 3, flags.repeatedRuns),
    item('f04.massSweep', flags.massRuns, 3, 'f04fb.massSweep'),
    instE(['E32'], 'control', 2),
    instE(['E11', 'E12', 'E15'], 'fbd', 2, flags.fbdDone),
  ];

  const importedF = importedFractionF04(nb);
  const data = [
    item('f04.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f04fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f04.repeats', flags.repeatedRuns && !has('E37') && !has('E19'), 3, `f04fb.${has('E19') ? 'E19' : 'E37'}`),
    item('f04.sameSetup', !has('E33') && !has('E14'), 2, `f04fb.${['E33', 'E14'].find(has) ?? 'E33'}`),
    item('f04.uncertainty', isNum(nb.calc.aMean.uncertainty) && isNum(nb.calc.TMean.uncertainty) && !has('E38'), 4, `f04fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f04.units', !has('E35') && !has('E34') && !has('E16'), 2, `f04fb.${['E35', 'E34', 'E16'].find(has) ?? 'E34'}`),
  ];

  const ev = expectedRuns(w, nb);
  const em = expectedModel(w, nb);
  const es = expectedSlope(w, nb);
  const ep = expectedPairs(w, nb);
  const C = nb.calc;
  const rRows = nb.runs.map((r, i) => ({ r, e: ev.rows[i] })).filter((x) => x.r.readingId);
  const gatesOk = rRows.length > 0 && rRows.every(({ r, e }) => close(r.v1, e.v1, 0.01) && close(r.v2, e.v2, 0.01) && close(r.aGates, e.aGates, 0.03, 0.01));
  const mRows = nb.massRuns.map((r, i) => ({ r, e: expectedMassRow(w, nb, i) })).filter((x) => x.r.readingId);
  const massOk = mRows.length > 0 && mRows.every(({ r, e }) => close(r.mh, e.mh, 0.02) && close(r.aPred, e.aPred, 0.02, 0.005));
  const pRows = nb.pairs.map((r, i) => ({ r, s: ep.sums[i] })).filter((x) => x.r.readingId);
  const pairsOk = pRows.length > 0 && pRows.every(({ r, s }) => close(r.sum, s, 0.05, 0.015));
  const modelling = [
    item('f04.gates', gatesOk && !has('E35'), 3, `f04fb.${has('E35') ? 'E35' : 'gates'}`),
    item('f04.means', close(C.aMean.value, ev.aMean, 0.01, 0.005) && close(C.aMean.uncertainty, ev.uA, 0.6, 0.005) && close(C.TMean.value, ev.TMean, 0.01, 0.005), 3, 'f04fb.means', { a: Number.isFinite(ev.aMean) ? ev.aMean.toFixed(3) : '—' }),
    item('f04.prediction', close(C.aPred.value, em.aPred, 0.01, 0.003) && close(C.Tpred.value, em.Tpred, 0.01, 0.003) && close(C.discrepancy.value, em.discrepancy, 0.1, 0.3) && !has('E01'), 4, `f04fb.${has('E01') ? 'E01' : 'prediction'}`),
    item('f04.effectiveMass', close(C.mEff.value, em.mEff, 0.005, 0.001) && close(C.aPredI.value, em.aPredI, 0.01, 0.003) && close(C.mSys.value, em.mSys, 0.02, 0.003) && !has('E17'), 3, `f04fb.${has('E17') ? 'E17' : 'effectiveMass'}`),
    item('f04.massRows', massOk && !has('E06') && !has('E16') && !has('E14'), 3, `f04fb.${['E06', 'E16', 'E14'].find(has) ?? 'massRows'}`),
    item('f04.slope', close(C.slopeK.value, es.slope, 0.05, 0.01) && !has('E36'), 2, `f04fb.${has('E36') ? 'E36' : 'slope'}`),
    item('f04.thirdLaw', pairsOk && close(C.sumF.value, ep.sumF, 0.1, 0.015), 2, 'f04fb.thirdLaw'),
  ];

  const k = answeredCountF4(nb);
  const analysis = [
    item('f04.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f04fb.hypothesis', undefined, 0.6),
    item('f04.mcq', nb.mcq === 'accel', 1, `f04fb.${has('E20') ? 'E20' : 'mcq'}`),
    item('f04.questions', k >= 3 ? null : false, 3, 'f04fb.questions', { n: k }, (k / 4) * 0.6),
    item('f04.contrastText', answered(nb.contrastText) ? null : false, 2, 'f04fb.contrastText', undefined, 0.6),
    item('f04.closure', answered(nb.closure) ? null : false, 2, 'f04fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F04_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F04_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F04_WEIGHTS.execution, execution),
    finalizeComponent('data', F04_WEIGHTS.data, data),
    finalizeComponent('modelling', F04_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F04_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f04.hypothesis', k >= 3 ? 'f04.questions' : '', answered(nb.contrastText) ? 'f04.contrastText' : '', answered(nb.closure) ? 'f04.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}
