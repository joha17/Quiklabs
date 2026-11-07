/**
 * Evaluación por evidencia de F102 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF102` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (masa caída al soltar el cordel, esfera contra la base) anula solo el componente de seguridad.
 */
import type { F102World } from '../../simulation/f102-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { gFromFall } from '../../simulation/models/f102/equations';
import { f102StageEvidence } from './evidence';
import { cellValueF2, expectedAccel, expectedDrag, expectedFall, expectedPrediction, expectedUniform, fallRuns, tapeRuns } from './expected-results';
import { answered, answeredCountF2, isNum, parseNum, SETUP_FIELDS, type F102Notebook } from './notebook';

const n = (w: F102World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;
const rd = (w: F102World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

export const F102_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (cm ↔ m, ms ↔ s). */
const WRONG_SCALES = [100, 0.01, 1000, 0.001];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF102(w: F102World, nb: F102Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  // MRU: v₁, v₂, v̄ por fila.
  nb.uniform.forEach((row) => {
    const r = rd(w, row.readingId);
    if (!r && [row.v1, row.v2, row.vAvg].some(isNum)) add('E31');
    const e = expectedUniform(w, nb, r);
    // E18: velocidad media d/t escrita como instantánea en la compuerta (cuando difieren en más de 3 %).
    if (isNum(row.v1) && !near(e.v1, e.vAvg, 0.03) && close(row.v1, e.vAvg, 0.01) && !close(row.v1, e.v1, 0.01)) add('E18');
    if (isNum(row.v2) && !near(e.v2, e.vAvg, 0.03) && close(row.v2, e.vAvg, 0.01) && !close(row.v2, e.v2, 0.01)) add('E18');
    for (const [s, v] of [[row.v1, e.v1], [row.v2, e.v2], [row.vAvg, e.vAvg]] as Array<[string, number]>) {
      const x = parseNum(s);
      if (misScaled(x, v)) add('E34');
      if (Number.isFinite(x) && x < 0 && v > 0 && near(-x, v, 0.02)) add('E36');
    }
  });
  // MRUA: cintas, masas y ajuste.
  const ea = expectedAccel(w, nb);
  const setups = new Set<string>();
  nb.accel.forEach((row, i) => {
    const r = rd(w, row.readingId);
    if (!r && isNum(row.a)) add('E19');
    if (!r) return;
    if (r.setup) setups.add(`${r.setup.hangG}/${r.setup.cartG}`);
    const mh = parseNum(row.mHang);
    const mc = parseNum(row.mCart);
    if ((Number.isFinite(mh) && r.setup && Math.abs(mh - r.setup.hangG!) > 0.5) || (Number.isFinite(mc) && r.setup && Math.abs(mc - r.setup.cartG!) > 0.5)) add('E11');
    const e = ea.rows[i];
    const a = parseNum(row.a);
    // E20: el ajuste usa toda la cinta, con el tramo del choque o del aterrizaje.
    if (r.cutS !== undefined && Number.isFinite(a) && near(a, e.aAll, 0.03) && !near(a, e.a, 0.03)) add('E20');
    if (misScaled(a, e.a)) add('E34');
    if (Number.isFinite(a) && a < 0 && e.a > 0 && near(-a, e.a, 0.05)) add('E36');
  });
  if (setups.size > 1) add('E33');
  // Caída libre.
  const ef = expectedFall(w, nb);
  nb.fall.forEach((row, i) => {
    const r = rd(w, row.readingId);
    if ((row.h.value.trim() && !row.h.readingId) || (!r && isNum(row.g))) add('E31');
    if (r && r.qualityFlags.some((f) => f === 'DRAG' || f === 'TUMBLING')) add('E17');
    const e = ef.rows[i];
    const g = parseNum(row.g);
    if (misScaled(g, e.g)) add('E34');
    // E35: tiempo redondeado a centésimas antes de calcular g.
    const gRounded = gFromFall(e.h, Math.round(e.t * 100) / 100);
    if (Number.isFinite(g) && !near(gRounded, e.g, 0.004) && near(g, gRounded, 0.003) && !near(g, e.g, 0.003)) add('E35');
  });
  // Montaje escrito a mano.
  if (SETUP_FIELDS.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  // E37: promedios con menos de tres corridas válidas.
  const validAccel = nb.accel.filter((x) => tapeRuns(w).some((r) => r.id === x.readingId)).length;
  const validFall = nb.fall.filter((x) => fallRuns(w).some((r) => r.id === x.readingId)).length;
  if ((isNum(nb.calc.aMean.value) && validAccel < 3) || (isNum(nb.calc.gMean.value) && validFall < 3)) add('E37');
  // E38: u(g) menor que la tipo B de la escala y el cronómetro.
  const uG = parseNum(nb.calc.gMean.uncertainty);
  if (Number.isFinite(uG) && Number.isFinite(ef.uB) && uG < ef.uB * 0.95) add('E38');
  const gm = parseNum(nb.calc.gMean.value);
  if (misScaled(gm, ef.gMean)) add('E34');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF102(nb: F102Notebook): number {
  const cells = [
    ...SETUP_FIELDS.map((k) => !!nb.setup[k].readingId),
    ...nb.uniform.filter((r) => r.readingId || isNum(r.v1)).map((r) => !!r.readingId),
    ...nb.accel.filter((r) => r.readingId || isNum(r.a)).map((r) => !!r.readingId),
    ...nb.fall.filter((r) => r.readingId || isNum(r.g) || r.h.value.trim()).flatMap((r) => [!!r.readingId, !!r.h.readingId]),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF102(w: F102World, nb: F102Notebook): Evaluation {
  const flags = f102StageEvidence(w, nb);
  const issues = notebookIssuesF102(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const accident = n(w, 'err:E40') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f102.accident', false, 15, 'f102fb.accident')]
    : [
      item('f102.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f102fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f102.impact', !err('E39').length && !n(w, 'flagBent'), 3, 'f102fb.E39'),
      item('f102.pad', !err('E14').length, 3, 'f102fb.E14'),
      item('f102.clamp', !err('E28').length, 2, 'f102fb.E28'),
      item('f102.closed', flags.stationClosed, 3, 'f102fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f102.${key}`, gate && e.length === 0, max, `f102fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f102.inspected', flags.instrumentsInspected, 2, 'f102fb.inspected'),
    instE(['E21', 'E30'], 'inclinometer', 3, flags.inclinometerZeroed && flags.trackLevel),
    instE(['E03', 'E04', 'E23'], 'gates', 4, flags.gatesReady),
    instE(['E10', 'E29'], 'reading', 3, flags.setupMeasured),
    instE(['E05', 'E06'], 'tape', 3, flags.accelRuns),
    instE(['E13'], 'photocell', 2, flags.fallRuns),
    instE(['E22', 'E24', 'E25', 'E26', 'E27'], 'sensor', 3, flags.dragRuns),
  ];

  const execution = [
    instE(['E01'], 'level', 3, flags.trackLevel),
    instE(['E02', 'E09'], 'uniform', 4, flags.uniformRuns),
    instE(['E07', 'E08'], 'accelerated', 4, flags.accelRuns),
    instE(['E12'], 'fall', 3, flags.fallRuns),
    instE(['E15', 'E16'], 'drag', 3, flags.dragRuns),
    instE(['E32'], 'control', 3),
  ];

  const importedF = importedFractionF102(nb);
  const data = [
    item('f102.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f102fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f102.repeats', flags.accelRuns && flags.fallRuns && !has('E37'), 3, 'f102fb.E37'),
    item('f102.sameSetup', !has('E33') && !has('E11'), 2, `f102fb.${['E33', 'E11'].find(has) ?? 'E33'}`),
    item('f102.uncertainty', isNum(nb.calc.gMean.uncertainty) && isNum(nb.calc.aMean.uncertainty) && !has('E38'), 4, `f102fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f102.resolution', !has('E35') && !has('E34'), 2, `f102fb.${['E35', 'E34'].find(has) ?? 'E35'}`),
  ];

  const ea = expectedAccel(w, nb);
  const ep = expectedPrediction(w, nb);
  const ef = expectedFall(w, nb);
  const ed = expectedDrag(w, nb);
  const C = nb.calc;
  const uRows = nb.uniform.filter((r) => r.readingId);
  const uniformOk = uRows.length > 0 && uRows.every((r) => {
    const e = expectedUniform(w, nb, rd(w, r.readingId));
    return close(r.v1, e.v1, 0.02) && close(r.v2, e.v2, 0.02) && close(r.vAvg, e.vAvg, 0.02);
  });
  const aRows = nb.accel.filter((r) => r.readingId);
  const accelOk = aRows.length > 0 && aRows.every((r) => close(r.a, ea.rows[nb.accel.indexOf(r)].a, 0.05, 0.01));
  const fRows = nb.fall.filter((r) => r.readingId);
  const fallOk = fRows.length > 0 && fRows.every((r) => close(r.g, ef.rows[nb.fall.indexOf(r)].g, 0.01));
  const dragOk = nb.drag.some((r) => r.readingId) && nb.drag.every((r, i) => !r.readingId || close(r.vt, ed.rows[i].vt, 0.1, 0.02));
  const modelling = [
    item('f102.velocities', uniformOk && !has('E18') && !has('E36'), 3, `f102fb.${['E18', 'E36'].find(has) ?? 'velocities'}`),
    item('f102.accelFit', accelOk && !has('E19') && !has('E20'), 4, `f102fb.${['E19', 'E20'].find(has) ?? 'accelFit'}`),
    item('f102.aMean', close(C.aMean.value, ea.aMean, 0.03, 0.01) && close(C.aMean.uncertainty, ea.uA, 0.6, 0.005), 2, 'f102fb.aMean', { a: Number.isFinite(ea.aMean) ? ea.aMean.toFixed(3) : '—' }),
    item('f102.aPred', close(C.aPred.value, ep.aPred, 0.02) && !has('E11'), 3, `f102fb.${has('E11') ? 'E11' : 'aPred'}`),
    item('f102.gRows', fallOk && !has('E17'), 3, `f102fb.${has('E17') ? 'E17' : 'gRows'}`),
    item('f102.gMean', close(C.gMean.value, ef.gMean, 0.01) && close(C.gMean.uncertainty, ef.uG, 0.5, 0.005) && !has('E38'), 2, 'f102fb.gMean', { g: Number.isFinite(ef.gMean) ? ef.gMean.toFixed(2) : '—' }),
    item('f102.relErr', close(C.relErrG.value, ef.relErr, 0.15, 0.3), 1, 'f102fb.relErr'),
    item('f102.terminal', dragOk && (close(C.vtRatio.value, ed.ratio, 0.1) || close(C.vtRatio.value, ed.theory, 0.1)), 2, 'f102fb.terminal'),
  ];

  const k = answeredCountF2(nb);
  const analysis = [
    item('f102.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f102fb.hypothesis', undefined, 0.6),
    item('f102.questions', k >= 3 ? null : false, 4, 'f102fb.questions', { n: k }, (k / 4) * 0.6),
    item('f102.contrastText', answered(nb.contrastText) ? null : false, 2, 'f102fb.contrastText', undefined, 0.6),
    item('f102.closure', answered(nb.closure) ? null : false, 2, 'f102fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F102_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F102_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F102_WEIGHTS.execution, execution),
    finalizeComponent('data', F102_WEIGHTS.data, data),
    finalizeComponent('modelling', F102_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F102_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f102.hypothesis', k >= 3 ? 'f102.questions' : '', answered(nb.contrastText) ? 'f102.contrastText' : '', answered(nb.closure) ? 'f102.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}

export { cellValueF2 };
