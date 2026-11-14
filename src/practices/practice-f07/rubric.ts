/**
 * Evaluación por evidencia de F07 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF07` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (carro contra el tope sin amortiguador o émbolo disparado al levantar un carro trabado) anula
 * solo el componente de seguridad.
 */
import type { F07World, ReadingF7 } from '../../simulation/f07-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f07StageEvidence } from './evidence';
import { expectedCalcF7, expectedCm, expectedElasticRow, expectedImpulse, expectedStick, validElastic } from './expected-results';
import { answered, answeredCountF7, isNum, parseNum, SETUP_FIELDS_F7, type F07Notebook } from './notebook';

const n = (w: F07World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
const rd = (w: F07World, id: string | null): ReadingF7 | null => (id ? (w.readings[id] ?? null) : null);

export const F07_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (g ↔ kg, cm ↔ m). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF07(w: F07World, nb: F07Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  if (SETUP_FIELDS_F7.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  if ([nb.cm.mA, nb.cm.mB].some((e) => e.value.trim() && !e.readingId)) add('E31');
  const imported = (id: string | null, kind: ReadingF7['kind'], fields: string[]) => {
    const r = rd(w, id);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== kind) {
      add('E33');
      return null;
    }
    return r;
  };
  // Choques elásticos: mismo montaje, no pegados; signos, restitución relativa y redondeo.
  const setups = new Set<string>();
  nb.elasticRows.forEach((row) => {
    const r = imported(row.readingId, 'gates', [row.v1i, row.v1f, row.v2i, row.v2f, row.dp, row.e]);
    if (!r) return;
    setups.add(`${r.setup?.bumper}|${r.setup?.mA}|${r.setup?.mB}`);
    if (r.gates?.stuck || r.setup?.bumper === 'velcro') add('E33');
    const e = expectedElasticRow(w, nb, r);
    const v1f = parseNum(row.v1f);
    if (e.v1f < -1e-3 && near(v1f, e.v1fAbs, 0.01) && !near(v1f, e.v1f, 0.01)) add('E11');
    const ee = parseNum(row.e);
    if (Number.isFinite(ee) && !near(ee, e.e, 0.01) && e.eNonRel.some((x) => near(ee, x, 0.01))) add('E13');
    const vals: Array<[string, number, number]> = [[row.v1i, e.v1i, e.rounded.v1i], [row.v1f, e.v1f, e.rounded.v1f], [row.v2f, e.v2f, e.rounded.v2f]];
    if (vals.some(([s, v, vr]) => Number.isFinite(parseNum(s)) && !near(vr, v, 0.002) && near(parseNum(s), vr, 0.001) && !near(parseNum(s), v, 0.001))) add('E35');
    if (vals.some(([s, v]) => misScaled(parseNum(s), v))) add('E34');
  });
  if (setups.size > 1) add('E33');
  // Velcro.
  const sr = imported(nb.stick.readingId, 'gates', [nb.stick.vf, nb.stick.Klost]);
  if (sr) {
    if (!sr.gates?.stuck) add('E33');
    const st = expectedStick(w, nb);
    const K = parseNum(nb.stick.Klost);
    if (Number.isFinite(K) && st.Klost > 10 && Math.abs(K) < 2) add('E17');
    if (misScaled(parseNum(nb.stick.vf), st.vf)) add('E34');
  }
  if (nb.mcq === 'conserved' || nb.mcq === 'created') add('E17');
  // Impulso.
  const fr = imported(nb.impulse.forceId, 'force', [nb.impulse.J1, nb.impulse.Fmax]);
  const gr = imported(nb.impulse.readingId, 'gates', [nb.impulse.dp1]);
  if (fr && gr && fr.trialId !== gr.trialId) add('E33');
  if (fr) {
    const im = expectedImpulse(w, nb);
    const J = parseNum(nb.impulse.J1);
    if (Number.isFinite(J) && Number.isFinite(im.Fmax) && near(Math.abs(J), im.Fmax, 0.02) && !near(J, im.J1, 0.05)) add('E12');
    if (Number.isFinite(J) && Math.abs(im.JB) > 1e-3 && near(J, im.JB, 0.02) && !near(J, im.J1, 0.02)) add('E20');
    if (misScaled(J, im.J1)) add('E34');
  }
  // Centro de masa.
  const cr = imported(nb.cm.readingId, 'motion', [nb.cm.vBefore, nb.cm.vAfter]);
  if (cr) {
    const cm = expectedCm(w, nb);
    const vb = parseNum(nb.cm.vBefore);
    if (Number.isFinite(vb) && Math.abs(cm.vBefore) > 1e-3 && near(vb, 1 / cm.vBefore, 0.02) && !near(vb, cm.vBefore, 0.02)) add('E36');
    if (misScaled(vb, cm.vBefore)) add('E34');
  }
  // Cálculos.
  const ec = expectedCalcF7(w, nb);
  const C = nb.calc;
  const valid = nb.elasticRows.filter((x) => validElastic(w).some((r) => r.id === x.readingId)).length;
  if ((isNum(C.dp.value) || isNum(C.e.value)) && valid < 3) add('E37');
  const lt = (s: string, uB: number) => {
    const u = parseNum(s);
    return Number.isFinite(u) && Number.isFinite(uB) && u < uB * 0.95;
  };
  if (lt(C.dp.uncertainty, ec.uBdp) || lt(C.e.uncertainty, ec.uBe) || lt(C.J.uncertainty, ec.uBJ)) add('E38');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF07(nb: F07Notebook): number {
  const cells = [
    ...SETUP_FIELDS_F7.map((k) => !!nb.setup[k].readingId),
    ...nb.elasticRows.filter((r) => r.readingId || isNum(r.dp)).map((r) => !!r.readingId),
    ...(nb.stick.readingId || isNum(nb.stick.vf) ? [!!nb.stick.readingId] : []),
    ...(nb.impulse.forceId || isNum(nb.impulse.J1) ? [!!nb.impulse.forceId && !!nb.impulse.readingId] : []),
    ...(nb.cm.readingId || isNum(nb.cm.vBefore) ? [!!nb.cm.readingId && !!nb.cm.mA.readingId && !!nb.cm.mB.readingId] : []),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF07(w: F07World, nb: F07Notebook): Evaluation {
  const flags = f07StageEvidence(w, nb);
  const issues = notebookIssuesF07(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const crash = n(w, 'crash') > 0;
  const accident = crash || n(w, 'err:E40') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f07.accident', false, 15, `f07fb.${crash ? 'E14' : 'E40'}`)]
    : [
      item('f07.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f07fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f07.ends', !err('E14').length, 3, 'f07fb.E14'),
      item('f07.launcher', !err('E08').length, 3, 'f07fb.E08'),
      item('f07.hands', !err('E09', 'E19').length, 2, `f07fb.${err('E09', 'E19')[0] ?? 'E09'}`),
      item('f07.closed', flags.stationClosed, 3, 'f07fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f07.${key}`, gate && e.length === 0, max, `f07fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f07.inspected', flags.instrumentsInspected, 2, 'f07fb.inspected'),
    instE(['E21', 'E30'], 'balance', 3, flags.cartsWeighed),
    instE(['E22', 'E23', 'E26', 'E27'], 'forceSensor', 4, flags.sensorReady && flags.impulseMeasured),
    instE(['E24', 'E25', 'E28'], 'gates', 4, flags.gatesReady),
    instE(['E04', 'E29'], 'scales', 4, flags.trackLeveled),
    instE(['E23'], 'camera', 3, flags.cmDone),
  ];

  const execution = [
    instE(['E01'], 'level', 3, flags.trackLeveled && flags.elasticDone),
    instE(['E06', 'E07', 'E08'], 'bumpers', 3, flags.elasticDone),
    instE(['E10', 'E15', 'E16'], 'carts', 3, flags.elasticDone),
    instE(['E03', 'E05'], 'gatesPlace', 3, flags.elasticDone),
    item('f07.stick', flags.stickDone, 3, 'f07fb.stick'),
    instE(['E02', 'E18', 'E32'], 'control', 2),
    instE(['E39'], 'integrity', 3),
  ];

  const importedF = importedFractionF07(nb);
  const C = nb.calc;
  const data = [
    item('f07.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f07fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f07.repeats', flags.elasticDone && !has('E37'), 3, 'f07fb.E37'),
    item('f07.sameSetup', !has('E33'), 2, 'f07fb.E33'),
    item('f07.uncertainty', isNum(C.dp.uncertainty) && isNum(C.e.uncertainty) && isNum(C.J.uncertainty) && !has('E38'), 4, `f07fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f07.units', !has('E35') && !has('E34'), 2, `f07fb.${['E35', 'E34'].find(has) ?? 'E34'}`),
  ];

  const ec = expectedCalcF7(w, nb);
  const used = nb.elasticRows.filter((r) => r.readingId);
  const elasticOk = used.length > 0 && used.every((r) => {
    const e = expectedElasticRow(w, nb, rd(w, r.readingId));
    return close(r.v1i, e.v1i, 0.01, 0.003) && close(r.v1f, e.v1f, 0.01, 0.003) && close(r.v2f, e.v2f, 0.01, 0.003) && close(r.dp, e.dp, 0.05, 0.002) && close(r.e, e.e, 0.01, 0.005);
  });
  const im = expectedImpulse(w, nb);
  const st = expectedStick(w, nb);
  const cm = expectedCm(w, nb);
  const modelling = [
    item('f07.elastic', elasticOk && close(C.dp.value, ec.dp, 0.05, 0.002) && close(C.e.value, ec.e, 0.01, 0.005) && !has('E11') && !has('E13'), 5, `f07fb.${['E11', 'E13'].find(has) ?? 'elastic'}`),
    item('f07.impulse', !!im.fr && close(nb.impulse.J1, im.J1, 0.01, 0.001) && close(nb.impulse.dp1, im.dp1, 0.02, 0.002) && close(C.J.value, ec.J, 0.01, 0.001) && !has('E12') && !has('E20'), 4, `f07fb.${['E12', 'E20'].find(has) ?? 'impulse'}`),
    item('f07.stickCalc', !!st.r && close(nb.stick.vf, st.vf, 0.01, 0.003) && close(nb.stick.Klost, st.Klost, 0.03, 0.5) && close(C.Klost.value, ec.Klost, 0.03, 0.5) && !has('E17'), 4, `f07fb.${has('E17') ? 'E17' : 'stickCalc'}`),
    item('f07.cm', !!cm.r && close(nb.cm.vBefore, cm.vBefore, 0.02, 0.003) && close(nb.cm.vAfter, cm.vAfter, 0.03, 0.005) && close(C.vcm.value, ec.vcm, 0.02, 0.003) && !has('E36'), 4, `f07fb.${has('E36') ? 'E36' : 'cm'}`),
    item('f07.disc', close(C.impDisc.value, ec.impDisc, 0.1, 0.5), 3, 'f07fb.disc'),
  ];

  const k = answeredCountF7(nb);
  const analysis = [
    item('f07.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f07fb.hypothesis', undefined, 0.6),
    item('f07.mcq', nb.mcq === 'lost', 1, `f07fb.${has('E17') ? 'E17' : 'mcq'}`),
    item('f07.questions', k >= 3 ? null : false, 3, 'f07fb.questions', { n: k }, (k / 4) * 0.6),
    item('f07.contrastText', answered(nb.contrastText) ? null : false, 2, 'f07fb.contrastText', undefined, 0.6),
    item('f07.closure', answered(nb.closure) ? null : false, 2, 'f07fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F07_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F07_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F07_WEIGHTS.execution, execution),
    finalizeComponent('data', F07_WEIGHTS.data, data),
    finalizeComponent('modelling', F07_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F07_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f07.hypothesis', k >= 3 ? 'f07.questions' : '', answered(nb.contrastText) ? 'f07.contrastText' : '', answered(nb.closure) ? 'f07.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}
