/**
 * Evaluación por evidencia de F05 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF05` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (tablero que baja de golpe o cable que salta) anula solo el componente de seguridad.
 */
import type { F05World, ReadingF5 } from '../../simulation/f05-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f05StageEvidence } from './evidence';
import { cellValueF5, expectedAngleRow, expectedKineticRow, expectedModelF5, expectedMus, expectedSlide, expectedSlopeF5, expectedStaticRow, validMeans, validPeaks } from './expected-results';
import { answered, answeredCountF5, isNum, parseNum, SETUP_FIELDS_F5, type F05Notebook } from './notebook';

const n = (w: F05World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;
const rd = (w: F05World, id: string | null): ReadingF5 | null => (id ? (w.readings[id] ?? null) : null);

export const F05_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (g ↔ kg, cm ↔ m). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF05(w: F05World, nb: F05Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  // Montaje escrito a mano.
  if (SETUP_FIELDS_F5.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  const pullRow = (row: { readingId: string | null }, fields: string[]) => {
    const r = rd(w, row.readingId);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== 'pull') {
      add('E33');
      return null;
    }
    if (nb.material && r.setup?.material && nb.material !== r.setup.material) add('E04');
    return r;
  };
  // Réplicas estáticas: mismo material y misma carga.
  const sKeys = new Set<string>();
  nb.staticRows.forEach((row) => {
    const r = pullRow(row, [row.N, row.muS]);
    if (!r) return;
    sKeys.add(`${r.setup?.material}:${r.setup?.loadG}`);
    const e = expectedStaticRow(w, nb, r);
    if (misScaled(parseNum(row.N), e.N)) add('E34');
  });
  const kKeys = new Set<string>();
  nb.kineticRows.forEach((row) => {
    const r = pullRow(row, [row.N, row.muK]);
    if (!r) return;
    kKeys.add(`${r.setup?.material}:${r.setup?.loadG}`);
    const e = expectedKineticRow(w, nb, r);
    const mu = parseNum(row.muK);
    // E02: μ_k con el pico del tirón en lugar de la meseta.
    if (Number.isFinite(mu) && near(mu, e.muFromPeak, 0.01) && !near(mu, e.muK, 0.01)) add('E02');
    if (misScaled(parseNum(row.N), e.N)) add('E34');
  });
  if (sKeys.size > 1 || kKeys.size > 1) add('E33');
  nb.loadRows.forEach((row) => pullRow(row, [row.N]));
  // Ángulos críticos.
  nb.angleRows.forEach((row) => {
    const r = rd(w, row.readingId);
    if (!r && isNum(row.muS)) add('E31');
    if (!r) return;
    if (r.kind !== 'angle') {
      add('E33');
      return;
    }
    const e = expectedAngleRow(r);
    if (row.material && row.material !== e.material) add('E04');
    const mu = parseNum(row.muS);
    if (Number.isFinite(mu) && !near(e.muRounded, e.muS, 0.005) && near(mu, e.muRounded, 0.003) && !near(mu, e.muS, 0.003)) add('E35');
  });
  // Bajada.
  const es = expectedSlide(w, nb);
  if (!nb.slide.readingId && [nb.slide.v1, nb.slide.a].some(isNum)) add('E31');
  if (nb.slide.readingId && !es.r) add('E33');
  if (es.r) {
    if (misScaled(parseNum(nb.slide.v1), es.v1) || misScaled(parseNum(nb.slide.a), es.a)) add('E34');
    const mk = parseNum(nb.slide.muK);
    if (Number.isFinite(mk) && near(mk, es.muKFlat, 0.01) && !near(mk, es.muK, 0.01)) add('E17');
  }
  // Cálculos.
  const em = expectedMus(w, nb);
  const C = nb.calc;
  const muS = parseNum(C.muS.value);
  const muK = parseNum(C.muK.value);
  if (Number.isFinite(muS) && Number.isFinite(muK) && near(muK, muS, 0.01) && !near(em.muK, em.muS, 0.05)) add('E11');
  const validS = nb.staticRows.filter((x) => validPeaks(w).some((r) => r.id === x.readingId)).length;
  const validK = nb.kineticRows.filter((x) => validMeans(w).some((r) => r.id === x.readingId)).length;
  if (isNum(C.muS.value) && validS < 3) add('E18');
  if (isNum(C.muK.value) && validK < 3) add('E37');
  const uS = parseNum(C.muS.uncertainty);
  const uK = parseNum(C.muK.uncertainty);
  if ((Number.isFinite(uS) && uS < em.uBmu * 0.95) || (Number.isFinite(uK) && uK < em.uBmu * 0.95)) add('E38');
  const sl = expectedSlopeF5(w, nb);
  const k = parseNum(C.slopeMu.value);
  if (Number.isFinite(k) && Number.isFinite(sl.slope) && ((near(k, sl.inverse, 0.05) && !near(k, sl.slope, 0.05)) || (k < 0 && sl.slope > 0 && near(-k, sl.slope, 0.05)))) add('E36');
  const mod = expectedModelF5(w, nb);
  const wf = parseNum(C.Wfr.value);
  if (Number.isFinite(wf) && near(wf, mod.WfrFlat, 0.01) && !near(wf, mod.Wfr, 0.01)) add('E17');
  if (Number.isFinite(wf) && misScaled(wf, mod.Wfr)) add('E34');
  if (Number.isFinite(wf) && Number.isFinite(mod.Wfr) && wf > 0 && near(-wf, mod.Wfr, 0.01)) add('E36');
  // E13: cálculos sin la temperatura de la sala registrada.
  if (isNum(C.muS.value) && !nb.setup.temp.readingId && !isNum(nb.setup.temp.value)) add('E13');
  if (nb.mcq === 'constant' || nb.mcq === 'area') add('E11');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF05(nb: F05Notebook): number {
  const cells = [
    ...SETUP_FIELDS_F5.map((k) => !!nb.setup[k].readingId),
    ...nb.staticRows.filter((r) => r.readingId || isNum(r.N) || isNum(r.muS)).map((r) => !!r.readingId),
    ...nb.kineticRows.filter((r) => r.readingId || isNum(r.N) || isNum(r.muK)).map((r) => !!r.readingId),
    ...nb.loadRows.filter((r) => r.readingId || isNum(r.N)).map((r) => !!r.readingId),
    ...nb.angleRows.filter((r) => r.readingId || isNum(r.muS)).map((r) => !!r.readingId),
    ...(nb.slide.readingId || isNum(nb.slide.a) ? [!!nb.slide.readingId] : []),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF05(w: F05World, nb: F05Notebook): Evaluation {
  const flags = f05StageEvidence(w, nb);
  const issues = notebookIssuesF05(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const accident = n(w, 'err:E40') > 0 || n(w, 'err:E20') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f05.accident', false, 15, `f05fb.${n(w, 'err:E20') > 0 ? 'E20' : 'E40'}`)]
    : [
      item('f05.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f05fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f05.edge', !err('E09').length, 2, 'f05fb.E09'),
      item('f05.stop', !err('E19').length, 3, 'f05fb.E19'),
      item('f05.clamp', !err('E28').length, 3, 'f05fb.E28'),
      item('f05.closed', flags.stationClosed, 3, 'f05fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f05.${key}`, gate && e.length === 0, max, `f05fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f05.inspected', flags.instrumentsInspected, 2, 'f05fb.inspected'),
    instE(['E21', 'E30'], 'balance', 3, flags.massesWeighed),
    instE(['E08', 'E22', 'E23', 'E27'], 'loadCell', 4, flags.sensorReady),
    instE(['E26'], 'mounting', 2, flags.sensorReady),
    instE(['E24', 'E25'], 'logger', 3, flags.slideDone),
    instE(['E10', 'E29'], 'goniometer', 3, flags.criticalAngles),
    instE(['E39'], 'flag', 3, flags.slideDone),
  ];

  const execution = [
    instE(['E01'], 'cable', 3, flags.cableAligned),
    instE(['E05', 'E06', 'E15'], 'pullTechnique', 4, flags.kineticRuns),
    instE(['E07', 'E16'], 'loads', 3, flags.loadSweep),
    instE(['E03'], 'lock', 3, flags.criticalAngles),
    item('f05.slide', flags.slideDone, 3, 'f05fb.slide'),
    instE(['E32'], 'control', 2),
    instE(['E12', 'E14'], 'fbd', 2, flags.fbdDone),
  ];

  const importedF = importedFractionF05(nb);
  const data = [
    item('f05.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f05fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f05.repeats', flags.staticRuns && flags.kineticRuns && !has('E18') && !has('E37'), 3, `f05fb.${has('E18') ? 'E18' : 'E37'}`),
    item('f05.sameSetup', !has('E33') && !has('E04') && !has('E13'), 2, `f05fb.${['E33', 'E04', 'E13'].find(has) ?? 'E33'}`),
    item('f05.uncertainty', isNum(nb.calc.muS.uncertainty) && isNum(nb.calc.muK.uncertainty) && !has('E38'), 4, `f05fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f05.units', !has('E35') && !has('E34'), 2, `f05fb.${['E35', 'E34'].find(has) ?? 'E34'}`),
  ];

  const em = expectedMus(w, nb);
  const sl = expectedSlopeF5(w, nb);
  const es = expectedSlide(w, nb);
  const mod = expectedModelF5(w, nb);
  const C = nb.calc;
  const sRows = nb.staticRows.map((r, i) => ({ r, e: em.sRows[i] })).filter((x) => x.r.readingId);
  const staticOk = sRows.length > 0 && sRows.every(({ r, e }) => close(r.N, e.N, 0.01) && close(r.muS, e.muS, 0.01, 0.003));
  const kRows = nb.kineticRows.map((r, i) => ({ r, e: em.kRows[i] })).filter((x) => x.r.readingId);
  const kineticOk = kRows.length > 0 && kRows.every(({ r, e }) => close(r.N, e.N, 0.01) && close(r.muK, e.muK, 0.01, 0.003));
  const aRows = nb.angleRows.filter((x) => x.readingId).map((x) => ({ x, e: expectedAngleRow(rd(w, x.readingId)) }));
  const anglesOk = aRows.length > 0 && aRows.every(({ x, e }) => close(x.muS, e.muS, 0.005, 0.002) && x.material === e.material);
  const slideOk = !!es.r && close(nb.slide.v1, es.v1, 0.01) && close(nb.slide.v2, es.v2, 0.01) && close(nb.slide.a, es.a, 0.03, 0.02) && close(nb.slide.muK, es.muK, 0.03, 0.01);
  const modelling = [
    item('f05.static', staticOk && !has('E34'), 3, 'f05fb.static'),
    item('f05.kinetic', kineticOk && !has('E02'), 3, `f05fb.${has('E02') ? 'E02' : 'kinetic'}`),
    item('f05.means', close(C.muS.value, em.muS, 0.01, 0.003) && close(C.muS.uncertainty, em.uS, 0.6, 0.003) && close(C.muK.value, em.muK, 0.01, 0.003) && !has('E11'), 3, `f05fb.${has('E11') ? 'E11' : 'means'}`, { mu: Number.isFinite(em.muK) ? em.muK.toFixed(3) : '—' }),
    item('f05.slope', close(C.slopeMu.value, sl.slope, 0.05, 0.01) && !has('E36'), 3, `f05fb.${has('E36') ? 'E36' : 'slope'}`),
    item('f05.angles', anglesOk && close(C.thetaPred.value, mod.thetaPred, 0.01, 0.1) && close(C.thetaDisc.value, mod.thetaDisc, 0.1, 0.3) && !has('E35'), 4, `f05fb.${has('E35') ? 'E35' : 'angles'}`),
    item('f05.slideCalc', slideOk && close(C.muKSlide.value, mod.muKSlide, 0.03, 0.01) && close(C.Wfr.value, mod.Wfr, 0.03, 0.002) && !has('E17'), 4, `f05fb.${has('E17') ? 'E17' : 'slideCalc'}`),
  ];

  const k = answeredCountF5(nb);
  const analysis = [
    item('f05.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f05fb.hypothesis', undefined, 0.6),
    item('f05.mcq', nb.mcq === 'proportional', 1, 'f05fb.mcq'),
    item('f05.questions', k >= 3 ? null : false, 3, 'f05fb.questions', { n: k }, (k / 4) * 0.6),
    item('f05.contrastText', answered(nb.contrastText) ? null : false, 2, 'f05fb.contrastText', undefined, 0.6),
    item('f05.closure', answered(nb.closure) ? null : false, 2, 'f05fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F05_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F05_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F05_WEIGHTS.execution, execution),
    finalizeComponent('data', F05_WEIGHTS.data, data),
    finalizeComponent('modelling', F05_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F05_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f05.hypothesis', k >= 3 ? 'f05.questions' : '', answered(nb.contrastText) ? 'f05.contrastText' : '', answered(nb.closure) ? 'f05.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}

export { cellValueF5 };
