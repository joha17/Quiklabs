/**
 * Evaluación por evidencia de F103 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF103` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (resorte liberado al sacar la esfera) anula solo el componente de seguridad.
 */
import type { F103World, ReadingF3 } from '../../simulation/f103-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f103StageEvidence } from './evidence';
import { BAD_IMPACT, cellValueF3, expectedRanges, expectedTrajectory, expectedVelocity, gateRuns, impactAngle } from './expected-results';
import { answered, answeredCountF3, isNum, parseNum, SETUP_FIELDS_F3, type F103Notebook } from './notebook';

const n = (w: F103World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;
const rd = (w: F103World, id: string | null): ReadingF3 | null => (id ? (w.readings[id] ?? null) : null);

export const F103_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (cm ↔ m, ms ↔ s). */
const WRONG_SCALES = [100, 0.01, 1000, 0.001, 10, 0.1];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF103(w: F103World, nb: F103Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  // Rapidez de salida.
  const ev = expectedVelocity(w, nb);
  const winds = new Set<number>();
  const notchesGate = new Set<number>();
  nb.velocity.forEach((row, i) => {
    const r = rd(w, row.readingId);
    if (!r && isNum(row.v0)) add('E31');
    if (!r) return;
    winds.add(r.setup?.windMs ?? 0);
    notchesGate.add(r.setup?.notch ?? 0);
    const e = ev.rows[i];
    const v = parseNum(row.v0);
    if (misScaled(v, e.v0)) add('E34');
    // E35: Δt redondeado al ms antes de dividir.
    if (Number.isFinite(v) && !near(e.v0Rounded, e.v0, 0.01) && near(v, e.v0Rounded, 0.005) && !near(v, e.v0, 0.005)) add('E35');
  });
  if (winds.size > 1) add('E09');
  // Barrido de ángulos.
  const er = expectedRanges(w, nb);
  const balls = new Set<number>();
  const checkRow = (r: ReadingF3 | null, R: string, e: { R: number; dx: number; lateral: boolean }) => {
    if (!r) return;
    if (r.qualityFlags.includes('BOUNCE')) add('E11');
    if (r.setup?.ballCm !== undefined) balls.add(r.setup.ballCm);
    if (r.setup?.notch !== undefined && notchesGate.size && !notchesGate.has(r.setup.notch)) add('E04');
    const x = parseNum(R);
    if (e.lateral && Number.isFinite(x) && near(x, e.dx, 0.003) && !near(x, e.R, 0.003)) add('E20');
    if (misScaled(x, e.R)) add('E34');
  };
  nb.angles.forEach((row, i) => {
    const r = rd(w, row.readingId);
    if (!r && [row.R, row.Rpred].some(isNum)) add('E31');
    if ((row.angle.value.trim() && !row.angle.readingId) || (row.xPlat.value.trim() && !row.xPlat.readingId)) add('E31');
    if (!r) return;
    const e = er.rows[i];
    checkRow(r, row.R, e);
    // E33: el ángulo o la posición de la plataforma importados son de otro montaje que el del impacto.
    const a = rd(w, row.angle.readingId);
    const t = rd(w, row.xPlat.readingId);
    if ((a && r.setup?.angleDeg !== undefined && Math.abs((a.setup?.angleDeg ?? NaN) - r.setup.angleDeg) > 0.3) || (t && r.setup?.posCm !== undefined && Math.abs((t.setup?.posCm ?? NaN) - r.setup.posCm) > 0.5)) add('E33');
    const rp = parseNum(row.Rpred);
    if (Number.isFinite(rp)) {
      if (e.hCm > 5 && !near(e.RpredLevel, e.Rpred, 0.03) && near(rp, e.RpredLevel, 0.01) && !near(rp, e.Rpred, 0.01)) add('E13');
      if (!near(e.RpredRad, e.Rpred, 0.05) && near(rp, e.RpredRad, 0.01)) add('E05');
      if (misScaled(rp, e.Rpred)) add('E34');
    }
    const tp = parseNum(row.Tpred);
    if (Number.isFinite(tp) && near(tp, e.Tpeak, 0.01) && !near(tp, e.Tpred, 0.01)) add('E12');
  });
  nb.conditions.forEach((row, i) => {
    const r = rd(w, row.readingId);
    if (!r && [row.R, row.Rpred].some(isNum)) add('E31');
    if ((row.h.value.trim() && !row.h.readingId) || (row.xPlat.value.trim() && !row.xPlat.readingId)) add('E31');
    if (!r) return;
    const e = er.conditions[i];
    checkRow(r, row.R, e);
    const t = rd(w, row.xPlat.readingId);
    const hh = rd(w, row.h.readingId);
    if ((t && r.setup?.posCm !== undefined && Math.abs((t.setup?.posCm ?? NaN) - r.setup.posCm) > 0.5) || (hh && r.setup?.standCm !== undefined && Math.abs((hh.setup?.standCm ?? NaN) - r.setup.standCm) > 0.5)) add('E33');
    const rp = parseNum(row.Rpred);
    if (Number.isFinite(rp) && e.hCm > 5 && !near(e.RpredLevel, e.Rpred, 0.03) && near(rp, e.RpredLevel, 0.01) && !near(rp, e.Rpred, 0.01)) add('E13');
  });
  if (balls.size > 1) add('E14');
  // Trayectoria.
  const et = expectedTrajectory(w, nb);
  nb.trajectory.forEach((row) => {
    const r = rd(w, row.readingId);
    if (row.x.value.trim() && !row.x.readingId) add('E31');
    const t = rd(w, row.x.readingId);
    if (r && t && r.setup?.posCm !== undefined && Math.abs((t.setup?.posCm ?? NaN) - r.setup.posCm) > 0.5) add('E33');
  });
  const C = nb.calc;
  if ([C.fitC1.value, C.fitC2.value, C.fitV0.value].some(isNum) && et.pts.length < 3) add('E15');
  const c2 = parseNum(C.fitC2.value);
  const c1 = parseNum(C.fitC1.value);
  if ((Number.isFinite(c2) && c2 > 0 && et.fit.c2 < 0 && near(-c2, et.fit.c2, 0.05)) || (Number.isFinite(c1) && c1 < 0 && et.fit.c1 > 0 && near(-c1, et.fit.c1, 0.05))) add('E36');
  const vy2 = parseNum(C.vy2.value);
  const vy1 = parseNum(C.vy1.value);
  if ((Number.isFinite(vy2) && Math.abs(et.vy2) > 0.05 && Math.sign(vy2) !== Math.sign(et.vy2) && near(-vy2, et.vy2, 0.03)) || (Number.isFinite(vy1) && Math.abs(et.vy1) > 0.05 && Math.sign(vy1) !== Math.sign(et.vy1) && near(-vy1, et.vy1, 0.03))) add('E10');
  if (misScaled(parseNum(C.vx.value), et.vx)) add('E34');
  // Montaje escrito a mano.
  if (SETUP_FIELDS_F3.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  // E37: v₀ media con menos de tres disparos válidos.
  const valid = nb.velocity.filter((x) => gateRuns(w).some((r) => r.id === x.readingId)).length;
  if (isNum(C.v0Mean.value) && valid < 3) add('E37');
  // E38: u(v₀) menor que la tipo B del diámetro y del reloj.
  const uV = parseNum(C.v0Mean.uncertainty);
  if (Number.isFinite(uV) && Number.isFinite(ev.uB) && uV < ev.uB * 0.95) add('E38');
  const vm = parseNum(C.v0Mean.value);
  if (misScaled(vm, ev.v0Mean)) add('E34');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF103(nb: F103Notebook): number {
  const cells = [
    ...SETUP_FIELDS_F3.map((k) => !!nb.setup[k].readingId),
    ...nb.velocity.filter((r) => r.readingId || isNum(r.v0)).map((r) => !!r.readingId),
    ...nb.angles.filter((r) => r.readingId || isNum(r.R) || r.angle.value.trim()).flatMap((r) => [!!r.readingId, !!r.angle.readingId, !!r.xPlat.readingId]),
    ...nb.conditions.filter((r) => r.readingId || isNum(r.R) || r.h.value.trim()).flatMap((r) => [!!r.readingId, !!r.h.readingId, !!r.xPlat.readingId]),
    ...nb.trajectory.filter((r) => r.readingId || r.x.value.trim()).flatMap((r) => [!!r.readingId, !!r.x.readingId]),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF103(w: F103World, nb: F103Notebook): Evaluation {
  const flags = f103StageEvidence(w, nb);
  const issues = notebookIssuesF103(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const accident = n(w, 'err:E40') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f103.accident', false, 15, 'f103fb.accident')]
    : [
      item('f103.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f103fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f103.zone', !err('E08').length, 4, 'f103fb.E08'),
      item('f103.damage', !err('E39').length && !n(w, 'ballDamaged'), 2, 'f103fb.E39'),
      item('f103.anchor', !err('E28').length, 2, 'f103fb.E28'),
      item('f103.closed', flags.stationClosed, 3, 'f103fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f103.${key}`, gate && e.length === 0, max, `f103fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f103.inspected', flags.instrumentsInspected, 2, 'f103fb.inspected'),
    instE(['E21', 'E26', 'E30'], 'protractor', 4, flags.protractorZeroed && flags.standLevel),
    instE(['E06', 'E18', 'E29'], 'scales', 4, flags.setupMeasured),
    instE(['E02', 'E23', 'E24'], 'gate', 4, flags.gateReady && flags.velocityRuns),
    instE(['E17', 'E22', 'E25', 'E27'], 'platform', 4, flags.angleRuns),
    instE(['E07'], 'firstContact', 2, flags.angleRuns),
  ];

  const execution = [
    instE(['E01'], 'anchorFirst', 3, flags.standAnchored),
    instE(['E03'], 'launch', 3, flags.velocityRuns),
    instE(['E19'], 'plane', 3, flags.angleRuns),
    instE(['E16'], 'wind', 3, flags.conditionRuns),
    item('f103.trajectory', flags.trajectoryRuns, 4, 'f103fb.trajectory'),
    instE(['E32'], 'control', 4),
  ];

  const importedF = importedFractionF103(nb);
  const data = [
    item('f103.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f103fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f103.repeats', flags.velocityRuns && !has('E37'), 3, 'f103fb.E37'),
    item('f103.sameSetup', !has('E33') && !has('E09') && !has('E14'), 2, `f103fb.${['E33', 'E09', 'E14'].find(has) ?? 'E33'}`),
    item('f103.uncertainty', isNum(nb.calc.v0Mean.uncertainty) && !has('E38'), 4, `f103fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f103.resolution', !has('E35') && !has('E34'), 2, `f103fb.${['E35', 'E34'].find(has) ?? 'E35'}`),
  ];

  const ev = expectedVelocity(w, nb);
  const er = expectedRanges(w, nb);
  const et = expectedTrajectory(w, nb);
  const C = nb.calc;
  const vRows = nb.velocity.filter((r) => r.readingId);
  const velocityOk = vRows.length > 0 && vRows.every((r) => close(r.v0, ev.rows[nb.velocity.indexOf(r)].v0, 0.01));
  const aRows = nb.angles.map((r, i) => ({ r, e: er.rows[i] })).filter((x) => x.r.readingId);
  const rangeOk = aRows.length > 0 && aRows.every(({ r, e }) => close(r.R, e.R, 0.01, 0.005));
  const predOk = aRows.length > 0 && aRows.every(({ r, e }) => close(r.Rpred, e.Rpred, 0.02, 0.01) && close(r.Tpred, e.Tpred, 0.02, 0.005));
  const cRows = nb.conditions.map((r, i) => ({ r, e: er.conditions[i] })).filter((x) => x.r.readingId);
  const condOk = cRows.length > 0 && cRows.every(({ r, e }) => close(r.R, e.R, 0.01, 0.005) && close(r.Rpred, e.Rpred, 0.02, 0.01));
  const modelling = [
    item('f103.v0', velocityOk && close(C.v0Mean.value, ev.v0Mean, 0.01) && close(C.v0Mean.uncertainty, ev.uV, 0.6, 0.005) && !has('E35'), 3, `f103fb.${has('E35') ? 'E35' : 'v0'}`, { v: Number.isFinite(ev.v0Mean) ? ev.v0Mean.toFixed(2) : '—' }),
    item('f103.ranges', rangeOk && !has('E11') && !has('E20'), 3, `f103fb.${['E11', 'E20'].find(has) ?? 'ranges'}`),
    item('f103.prediction', predOk && !has('E05') && !has('E12') && !has('E13') && !has('E04'), 4, `f103fb.${['E04', 'E05', 'E12', 'E13'].find(has) ?? 'prediction'}`),
    item('f103.conditions', condOk, 2, 'f103fb.conditions'),
    item('f103.rangeErr', close(C.rangeErr.value, er.rangeErr, 0.15, 0.3), 1, 'f103fb.rangeErr'),
    item('f103.fit', close(C.fitC1.value, et.fit.c1, 0.03, 0.01) && close(C.fitC2.value, et.fit.c2, 0.03, 0.01) && close(C.fitV0.value, et.fit.v0, 0.03, 0.05) && !has('E15') && !has('E36'), 4, `f103fb.${['E15', 'E36'].find(has) ?? 'fit'}`),
    item('f103.vectors', close(C.vx.value, et.vx, 0.02, 0.01) && close(C.vy1.value, et.vy1, 0.03, 0.02) && close(C.vy2.value, et.vy2, 0.03, 0.02) && !has('E10'), 3, `f103fb.${has('E10') ? 'E10' : 'vectors'}`),
  ];

  const k = answeredCountF3(nb);
  const analysis = [
    item('f103.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f103fb.hypothesis', undefined, 0.6),
    item('f103.questions', k >= 3 ? null : false, 4, 'f103fb.questions', { n: k }, (k / 4) * 0.6),
    item('f103.contrastText', answered(nb.contrastText) ? null : false, 2, 'f103fb.contrastText', undefined, 0.6),
    item('f103.closure', answered(nb.closure) ? null : false, 2, 'f103fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F103_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F103_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F103_WEIGHTS.execution, execution),
    finalizeComponent('data', F103_WEIGHTS.data, data),
    finalizeComponent('modelling', F103_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F103_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f103.hypothesis', k >= 3 ? 'f103.questions' : '', answered(nb.contrastText) ? 'f103.contrastText' : '', answered(nb.closure) ? 'f103.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}

export { cellValueF3, BAD_IMPACT, impactAngle };
