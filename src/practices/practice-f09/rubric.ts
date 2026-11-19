/**
 * Evaluación por evidencia de F09 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF09` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (mano sobre la mesa girando o masa orbitante despedida) anula solo el componente de seguridad.
 */
import type { F09World, ReadingF9 } from '../../simulation/f09-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f09StageEvidence } from './evidence';
import { circPairs, expectedCalcF9, expectedCircF9, expectedMomentumF9, expectedTorqueF9, validEncoders, validDyns, validForces, validOmegas, validPeriods } from './expected-results';
import { answered, answeredCountF9, isNum, parseNum, SETUP_FIELDS_F9, type CircRow, type F09Notebook, type TorqueRow } from './notebook';

const n = (w: F09World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
const rd = (w: F09World, id: string | null): ReadingF9 | null => (id ? (w.readings[id] ?? null) : null);

export const F09_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (g ↔ kg, cm ↔ m, cm² ↔ m²). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1, 1e4, 1e-4];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF09(w: F09World, nb: F09Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  if (SETUP_FIELDS_F9.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  const imported = (id: string | null, kind: ReadingF9['kind'], fields: string[]) => {
    const r = rd(w, id);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== kind) {
      add('E33');
      return null;
    }
    return r;
  };
  // Fuerza centrípeta: misma condición, v = ω, T redondeado y conversiones.
  nb.circRows.forEach((row: CircRow) => {
    const f = imported(row.forceId, 'force', [row.Fpred]);
    const p = imported(row.periodId, 'period', [row.T, row.omega]);
    if (f && p && f.trialId !== p.trialId) add('E33');
    if (!f || !p) return;
    const e = expectedCircF9(w, nb, row);
    const v = parseNum(row.v);
    if (near(v, e.omega, 0.01) && !near(v, e.v, 0.01)) add('E07');
    const Fp = parseNum(row.Fpred);
    if (e.roundedDiffers && near(Fp, e.FpredRounded, 0.002) && !near(Fp, e.Fpred, 0.002)) add('E35');
    else if (misScaled(Fp, e.Fpred)) add('E34');
    if (misScaled(v, e.v)) add('E34');
  });
  // Torque: el dinamómetro y el encoder del mismo tirón.
  nb.torqueRows.forEach((row: TorqueRow, i) => {
    const d = imported(row.dynId, 'dyn', [row.tau]);
    const en = imported(row.encId, 'encoder', [row.alpha, row.I]);
    if (d && en && d.trialId !== en.trialId) add('E33');
    if (!d || !en) return;
    const e = expectedTorqueF9(w, nb, row, i);
    if (misScaled(parseNum(row.tau), e.tau) || misScaled(parseNum(row.I), e.I)) add('E34');
  });
  // Momento angular: ω₁ y ω₂ del mismo giro; energía sin las masas móviles.
  const M = nb.momentum;
  const a = imported(M.w1Id, 'omega', [M.L1, M.K1]);
  const b = imported(M.w2Id, 'omega', [M.L2, M.K2]);
  imported(M.r1Id, 'radius', [M.I1]);
  imported(M.r2Id, 'radius', [M.I2]);
  if (a && b && a.trialId !== b.trialId) add('E33');
  const ec = expectedCalcF9(w, nb);
  const mo = expectedMomentumF9(w, nb, ec.I0);
  if (a && b) {
    const K1 = parseNum(M.K1);
    const K2 = parseNum(M.K2);
    if ((near(K1, mo.K1nomass, 0.01) && !near(K1, mo.K1, 0.01)) || (near(K2, mo.K2nomass, 0.01) && !near(K2, mo.K2, 0.01))) add('E14');
    if (misScaled(parseNum(M.I1), mo.I1) || misScaled(parseNum(M.L1), mo.L1)) add('E34');
  }
  // Interpretación: la fuerza centrípeta no cambia la rapidez.
  if (nb.mcq === 'speed') add('E08');
  // Cálculos.
  const C = nb.calc;
  const tfc = parseNum(C.tauFc.value);
  if (Number.isFinite(tfc) && Math.abs(tfc) > 1e-6 && near(tfc, ec.FcR, 0.03)) add('E16');
  const mr = parseNum(C.mr.value);
  if (Math.abs(ec.mr) > 1e-9 && near(mr, 1 / ec.mr, 0.02) && !near(mr, ec.mr, 0.02)) add('E36');
  else if (misScaled(mr, ec.mr)) add('E34');
  if (misScaled(parseNum(C.mrPred.value), ec.mrPred)) add('E34');
  const okRows = nb.circRows.filter((x) => circPairs(w).some((c) => c.f.id === x.forceId && c.p.id === x.periodId)).length;
  if (isNum(C.mr.value) && okRows < 4) add('E37');
  const lt = (s: string, uB: number) => {
    const u = parseNum(s);
    return Number.isFinite(u) && Number.isFinite(uB) && u < uB * 0.95;
  };
  if (lt(C.Itorque.uncertainty, ec.uBI) || lt(C.mr.uncertainty, ec.uMr * 0.5)) add('E38');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF09(nb: F09Notebook): number {
  const M = nb.momentum;
  const cells = [
    ...SETUP_FIELDS_F9.map((k) => !!nb.setup[k].readingId),
    ...nb.circRows.filter((r) => r.forceId || r.periodId || isNum(r.Fpred)).map((r) => !!r.forceId && !!r.periodId),
    ...nb.torqueRows.filter((r) => r.dynId || r.encId || isNum(r.I)).map((r) => !!r.dynId && !!r.encId),
    ...(M.w1Id || M.w2Id || isNum(M.L1) ? [!!M.w1Id && !!M.w2Id && !!M.r1Id && !!M.r2Id] : []),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF09(w: F09World, nb: F09Notebook): Evaluation {
  const flags = f09StageEvidence(w, nb);
  const issues = notebookIssuesF09(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const hand = n(w, 'handContact') > 0;
  const accident = hand || n(w, 'orbitOff') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f09.accident', false, 15, `f09fb.${hand ? 'E20' : 'E01'}`)]
    : [
      item('f09.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f09fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f09.interlock', !err('E02').length, 3, 'f09fb.E02'),
      item('f09.speed', !err('E09').length, 3, 'f09fb.E09'),
      item('f09.safeClose', !err('E40').length, 2, 'f09fb.E40'),
      item('f09.closed', flags.stationClosed, 3, 'f09fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f09.${key}`, gate && e.length === 0, max, `f09fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f09.inspected', flags.instrumentsInspected, 2, 'f09fb.inspected'),
    instE(['E21', 'E30'], 'balance', 3, flags.massesWeighed),
    instE(['E21', 'E22', 'E23', 'E26'], 'force', 4, flags.circDone),
    instE(['E06', 'E25'], 'gate', 3, flags.circDone),
    instE(['E27', 'E24'], 'encoder', 4, flags.torqueDone),
    instE(['E18', 'E29'], 'dyn', 4, flags.torqueDone),
  ];

  const execution = [
    instE(['E28', 'E17'], 'support', 4, flags.supportReady && flags.circDone),
    instE(['E19', 'E05'], 'orbit', 3, flags.circDone),
    instE(['E03', 'E15', 'E10'], 'torqueSetup', 4, flags.torqueDone),
    instE(['E11', 'E12', 'E04'], 'momentum', 5, flags.momentumDone),
    instE(['E32', 'E13'], 'control', 2),
    instE(['E39'], 'integrity', 2),
  ];

  const importedF = importedFractionF09(nb);
  const C = nb.calc;
  const data = [
    item('f09.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f09fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f09.repeats', flags.circDone && !has('E37'), 3, 'f09fb.E37'),
    item('f09.sameSetup', !has('E33'), 2, 'f09fb.E33'),
    item('f09.uncertainty', isNum(C.mr.uncertainty) && isNum(C.Itorque.uncertainty) && !has('E38'), 4, `f09fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f09.units', !has('E35') && !has('E34'), 2, `f09fb.${['E35', 'E34'].find(has) ?? 'E34'}`),
  ];

  const ec = expectedCalcF9(w, nb);
  const circOk = (row: CircRow) => {
    if (!row.forceId || !row.periodId) return false;
    const e = expectedCircF9(w, nb, row);
    return close(row.T, e.T, 0.002, 1e-4) && close(row.omega, e.omega, 0.003, 1e-3) && close(row.v, e.v, 0.01, 1e-3) && close(row.Fpred, e.Fpred, 0.01, 1e-3) && close(row.diff, e.diff, 0.1, 0.5);
  };
  const torqueOk = (row: TorqueRow, i: number) => {
    if (!row.dynId || !row.encId) return false;
    const e = expectedTorqueF9(w, nb, row, i);
    return close(row.tau, e.tau, 0.005, 1e-4) && close(row.alpha, e.alpha, 0.01, 0.002) && close(row.alphaC, e.alphaC, 0.1, 0.003) && close(row.I, e.I, 0.02, 2e-4);
  };
  const M = nb.momentum;
  const mo = expectedMomentumF9(w, nb, ec.I0);
  const modelling = [
    item('f09.centripetal', nb.circRows.every(circOk) && close(C.mr.value, ec.mr, 0.02, 1e-4) && close(C.mrPred.value, ec.mrPred, 0.01, 1e-4) && !['E07', 'E35', 'E36'].some(has), 6, `f09fb.${['E07', 'E35', 'E36'].find(has) ?? 'centripetal'}`),
    item('f09.torque', nb.torqueRows.every(torqueOk) && close(C.Itorque.value, ec.Itorque, 0.02, 2e-4) && close(C.I0.value, ec.I0, 0.05, 5e-4), 5, 'f09fb.torque'),
    item('f09.momentum', close(M.I1, mo.I1, 0.02, 2e-4) && close(M.I2, mo.I2, 0.02, 2e-4) && close(M.L1, mo.L1, 0.02, 1e-3) && close(M.L2, mo.L2, 0.02, 1e-3) && close(M.dL, mo.dL, 0.2, 0.5) && close(C.Lratio.value, mo.L2 / mo.L1, 0.02), 5, 'f09fb.momentum'),
    item('f09.energy', close(M.K1, mo.K1, 0.02, 1e-3) && close(M.K2, mo.K2, 0.02, 1e-3) && close(C.Kratio.value, mo.K2 / mo.K1, 0.03) && !has('E14'), 2, `f09fb.${has('E14') ? 'E14' : 'energy'}`),
    item('f09.tauFc', isNum(C.tauFc.value) && Math.abs(parseNum(C.tauFc.value)) < 1e-6 && !has('E16'), 2, 'f09fb.E16'),
  ];

  const k = answeredCountF9(nb);
  const analysis = [
    item('f09.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f09fb.hypothesis', undefined, 0.6),
    item('f09.mcq', nb.mcq === 'direction' && !has('E08'), 1, has('E08') ? 'f09fb.E08' : 'f09fb.mcq'),
    item('f09.questions', k >= 3 ? null : false, 3, 'f09fb.questions', { n: k }, (k / 4) * 0.6),
    item('f09.contrastText', answered(nb.contrastText) ? null : false, 2, 'f09fb.contrastText', undefined, 0.6),
    item('f09.closure', answered(nb.closure) ? null : false, 2, 'f09fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F09_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F09_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F09_WEIGHTS.execution, execution),
    finalizeComponent('data', F09_WEIGHTS.data, data),
    finalizeComponent('modelling', F09_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F09_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f09.hypothesis', k >= 3 ? 'f09.questions' : '', answered(nb.contrastText) ? 'f09.contrastText' : '', answered(nb.closure) ? 'f09.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}

/** Lecturas válidas por tipo (para el panel del docente). */
export const validCountsF09 = (w: F09World) => ({
  force: validForces(w).length, period: validPeriods(w).length, omega: validOmegas(w).length, encoder: validEncoders(w).length, dyn: validDyns(w).length,
});
