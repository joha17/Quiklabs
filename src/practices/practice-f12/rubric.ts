/**
 * Evaluación por evidencia de F12 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF12` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (agua a presión fuera del circuito) anula solo el componente de seguridad.
 */
import type { F12World, ReadingF12 } from '../../simulation/f12-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f12StageEvidence } from './evidence';
import { distinctFlows, expectedCalcF12, expectedFlowRowF12, expectedLossRowF12, flowPoints, validFlows, validPressures, validVolumes } from './expected-results';
import { answered, answeredCountF12, isNum, parseNum, SETUP_FIELDS_F12, SETUP_SOURCE_F12, type F12Notebook, type FlowRow, type LossRow } from './notebook';

const n = (w: F12World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
const rd = (w: F12World, id: string | null): ReadingF12 | null => (id ? (w.readings[id] ?? null) : null);

export const F12_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (kPa ↔ Pa, L/s ↔ m³/s, cm ↔ m…). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1, 1e6, 1e-6];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF12(w: F12World, nb: F12Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  for (const k of SETUP_FIELDS_F12) {
    const e = nb.setup[k];
    if (e.value.trim() && !e.readingId) add('E31');
    const r = rd(w, e.readingId);
    if (r && (r.kind !== SETUP_SOURCE_F12[k].kind || r.target !== SETUP_SOURCE_F12[k].target)) add('E33');
    if (r && r.kind === 'diameter' && r.face === 'outer') add('E03');
  }
  const imported = (id: string | null, kind: ReadingF12['kind'], fields: string[]) => {
    const r = rd(w, id);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== kind) {
      add('E33');
      return null;
    }
    return r;
  };
  const sameShot = (q: ReadingF12 | null, ps: Array<ReadingF12 | null>) => {
    ps.forEach((x, i) => x && x.target && x.target !== `ch${i + 1}` && add('E33'));
    const ok = ps.filter((x): x is ReadingF12 => !!x);
    if (ok.some((x) => x.tick !== ok[0].tick)) add('E33');
    if (q && ok.some((x) => x.trialId !== q.trialId)) add('E33');
  };
  // Serie con el tramo liso: velocidades en m/s, redondeos, escalas.
  nb.flowRows.forEach((row: FlowRow) => {
    const q = imported(row.qId, 'flow', [row.v1, row.v2]);
    const p1 = imported(row.p1Id, 'pressure', [row.dp12]);
    const p2 = imported(row.p2Id, 'pressure', [row.dp12]);
    const p3 = row.p3Id ? imported(row.p3Id, 'pressure', []) : null;
    sameShot(q, [p1, p2, p3]);
    if (!q || !p1 || !p2) return;
    const e = expectedFlowRowF12(w, nb, row);
    const v1 = parseNum(row.v1);
    const v2 = parseNum(row.v2);
    if ((near(v1, e.v1cm, 0.01) || near(v2, e.v2cm, 0.01)) && !near(v2, e.v2, 0.01)) add('E15');
    else if ((near(v1, e.v1r, 1e-6, 1e-9) || near(v2, e.v2r, 1e-6, 1e-9)) && !near(v2, e.v2, 0.002) && (e.v1r !== e.v1 || e.v2r !== e.v2)) add('E35');
    else if (misScaled(v1, e.v1) || misScaled(v2, e.v2)) add('E34');
    const pred = parseNum(row.dp12Pred);
    if (near(pred, e.predRounded, 0.002) && !near(pred, e.dp12Pred, 0.002)) add('E35');
    else if (misScaled(pred, e.dp12Pred)) add('E34');
    if (misScaled(parseNum(row.dp12), e.dp12)) add('E34');
  });
  // Serie con pérdidas: corrección por altura, pérdidas supuestas nulas, escalas.
  nb.lossRows.forEach((row: LossRow) => {
    const q = imported(row.qId, 'flow', [row.v1, row.K]);
    const p1 = imported(row.p1Id, 'pressure', [row.dp13]);
    const p3 = imported(row.p3Id, 'pressure', [row.dp13]);
    sameShot(q, [p1, null, p3]);
    if (!q || !p1 || !p3) return;
    const e = expectedLossRowF12(w, nb, row);
    const dp = parseNum(row.dp13);
    const K = parseNum(row.K);
    if (Math.abs(e.dz) > 1e-6 && (near(dp, e.dp13NoZ, 0.005, 2) || near(K, e.KNoZ, 0.005)) && !near(dp, e.dp13, 0.005, 2)) add('E09');
    else if (misScaled(dp, e.dp13)) add('E34');
    if (isNum(row.K) && Math.abs(K) < 0.05 && e.K > 0.3) add('E19');
    else if (misScaled(K, e.K)) add('E34');
    if (misScaled(parseNum(row.v1), e.v1)) add('E34');
    if (isNum(row.P) && misScaled(parseNum(row.P), e.P)) add('E34');
  });
  const C = nb.calc;
  const ec = expectedCalcF12(w, nb);
  const rho = parseNum(C.rhoFit.value);
  if (Number.isFinite(ec.invRho) && near(rho, ec.invRho, 0.03) && !near(rho, ec.rhoFit, 0.03)) add('E36');
  else if (misScaled(rho, ec.rhoFit)) add('E34');
  if (misScaled(parseNum(C.Qvol.value), ec.Qvol)) add('E34');
  if (isNum(C.K.value) && Math.abs(parseNum(C.K.value)) < 0.05 && ec.K > 0.3) add('E19');
  if (nb.mcq === 'yes') add('E16');
  const okFlow = new Set(nb.flowRows.filter((x) => flowPoints(w, 'smooth').some((p) => p.q.id === x.qId && p.p1.id === x.p1Id && p.p2.id === x.p2Id)).map((x) => Math.round((rd(w, x.qId)?.value ?? -1) * 20))).size;
  const okLoss = new Set(nb.lossRows.filter((x) => flowPoints(w, 'rough').some((p) => p.q.id === x.qId && p.p1.id === x.p1Id && p.p3.id === x.p3Id)).map((x) => Math.round((rd(w, x.qId)?.value ?? -1) * 20))).size;
  if ((isNum(C.rhoFit.value) && okFlow < 5) || (isNum(C.K.value) && okLoss < 3)) add('E37');
  const uR = parseNum(C.rhoFit.uncertainty);
  const uQ = parseNum(C.Qvol.uncertainty);
  if ((Number.isFinite(uR) && Number.isFinite(ec.uRhoB) && uR < ec.uRhoB * 0.95) || (Number.isFinite(uQ) && Number.isFinite(ec.uQvol) && uQ < ec.uQvol * 0.95)) add('E38');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF12(nb: F12Notebook): number {
  const cells = [
    ...SETUP_FIELDS_F12.map((k) => !!nb.setup[k].readingId),
    ...nb.flowRows.filter((r) => r.qId || r.p1Id || r.p2Id || isNum(r.dp12)).map((r) => !!r.qId && !!r.p1Id && !!r.p2Id),
    ...nb.lossRows.filter((r) => r.qId || r.p1Id || r.p3Id || isNum(r.dp13)).map((r) => !!r.qId && !!r.p1Id && !!r.p3Id),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF12(w: F12World, nb: F12Notebook): Evaluation {
  const flags = f12StageEvidence(w, nb);
  const issues = notebookIssuesF12(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  /** Errores cometidos con un instrumento concreto (F12-E30 vale para varios). */
  const errAt = (insts: string[], codes: string[]) => codes.filter((c) => insts.some((i) => n(w, `inst:${i}:${c}`) > 0));
  const accident = n(w, 'spray') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);
  const SENS = ['sensor1', 'sensor2', 'sensor3'];

  const safety = accident
    ? [item('f12.accident', false, 15, 'f12fb.E40')]
    : [
      item('f12.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f12fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f12.hammer', !err('E05').length, 3, 'f12fb.E05'),
      item('f12.overpressure', !err('E11').length && n(w, 'sensorDamage') === 0, 3, 'f12fb.E11'),
      item('f12.safeClose', !err('E20').length, 2, 'f12fb.E20'),
      item('f12.closed', flags.stationClosed, 3, 'f12fb.closed'),
    ];

  const inst = (insts: string[], codes: string[], key: string, max: number, gate = true) => {
    const e = errAt(insts, codes);
    return item(`f12.${key}`, gate && e.length === 0, max, `f12fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f12.inspected', flags.instrumentsInspected, 2, 'f12fb.inspected'),
    inst(SENS, ['E06', 'E07', 'E08', 'E23', 'E39'], 'sensorsTaps', 4, flags.flowSeries),
    inst(SENS, ['E21', 'E27', 'E12'], 'sensorsCal', 4, flags.calibrated),
    inst(SENS, ['E22', 'E24', 'E17'], 'logger', 3, flags.flowSeries),
    inst([...SENS, 'meter01'], ['E30'], 'stable', 2, flags.flowSeries),
    inst(['caliper01'], ['E26'], 'caliper', 2, flags.calibrated),
    inst(['ruler01', 'sump01', 'beaker01'], ['E25', 'E29'], 'scales', 3, flags.volumetric),
  ];

  const exe = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f12.${key}`, gate && e.length === 0, max, `f12fb.${e[0] ?? key}`);
  };
  const execution = [
    exe(['E01', 'E28'], 'sealed', 4, flags.circuitReady),
    exe(['E02', 'E18'], 'purged', 3, flags.circuitReady),
    exe(['E04'], 'steady', 4, flags.flowSeries),
    exe(['E13', 'E14'], 'volumetric', 4, flags.volumetric),
    exe(['E10', 'E32'], 'series', 3, flags.lossSeries),
    exe(['E39', 'E40'], 'integrity', 2),
  ];

  const importedF = importedFractionF12(nb);
  const C = nb.calc;
  const data = [
    item('f12.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f12fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f12.repeats', flags.flowSeries && flags.lossSeries && !has('E37'), 3, 'f12fb.E37'),
    item('f12.sameSetup', !has('E33') && !has('E03'), 2, `f12fb.${has('E03') ? 'E03' : 'E33'}`),
    item('f12.uncertainty', isNum(C.Qvol.uncertainty) && isNum(C.rhoFit.uncertainty) && !has('E38'), 4, `f12fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f12.units', !['E15', 'E34', 'E35'].some(has), 2, `f12fb.${['E15', 'E35', 'E34'].find(has) ?? 'E34'}`),
  ];

  const ec = expectedCalcF12(w, nb);
  const fRowOk = (row: FlowRow) => {
    if (!row.qId || !row.p1Id || !row.p2Id) return false;
    const e = expectedFlowRowF12(w, nb, row);
    return close(row.v1, e.v1, 0.005, 1e-3) && close(row.v2, e.v2, 0.005, 1e-3) && close(row.dp12, e.dp12, 0.005, 2) && close(row.dp12Pred, e.dp12Pred, 0.01, 2);
  };
  const lRowOk = (row: LossRow) => {
    if (!row.qId || !row.p1Id || !row.p3Id) return false;
    const e = expectedLossRowF12(w, nb, row);
    return close(row.v1, e.v1, 0.005, 1e-3) && close(row.dp13, e.dp13, 0.01, 2) && close(row.K, e.K, 0.02, 0.02) && (!isNum(row.P) || close(row.P, e.P, 0.02, 0.01));
  };
  const filledF = nb.flowRows.filter((r) => r.qId || r.p1Id);
  const filledL = nb.lossRows.filter((r) => r.qId || r.p1Id);
  const modelling = [
    item('f12.flowTable', filledF.length >= 5 && filledF.every(fRowOk) && !['E15', 'E35'].some(has), 6, `f12fb.${['E15', 'E35'].find(has) ?? 'flowTable'}`),
    item('f12.lossTable', filledL.length >= 3 && filledL.every(lRowOk) && !['E09', 'E19'].some(has), 5, `f12fb.${['E09', 'E19'].find(has) ?? 'lossTable'}`),
    item('f12.rhoFit', close(C.rhoFit.value, ec.rhoFit, 0.01) && !has('E36'), 4, `f12fb.${has('E36') ? 'E36' : 'rhoFit'}`),
    item('f12.volumetric', close(C.Qvol.value, ec.Qvol, 0.01) && close(C.QDev.value, ec.QDev, 0.1, 0.3), 3, 'f12fb.volumetricCalc'),
    item('f12.K', close(C.K.value, ec.K, 0.02, 0.02), 2, 'f12fb.Kcalc'),
  ];

  const k = answeredCountF12(nb);
  const analysis = [
    item('f12.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f12fb.hypothesis', undefined, 0.6),
    item('f12.mcq', nb.mcq === 'no_compressible', 1, `f12fb.${has('E16') ? 'E16' : 'mcq'}`),
    item('f12.questions', k >= 3 ? null : false, 3, 'f12fb.questions', { n: k }, (k / 4) * 0.6),
    item('f12.contrastText', answered(nb.contrastText) ? null : false, 2, 'f12fb.contrastText', undefined, 0.6),
    item('f12.closure', answered(nb.closure) ? null : false, 2, 'f12fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F12_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F12_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F12_WEIGHTS.execution, execution),
    finalizeComponent('data', F12_WEIGHTS.data, data),
    finalizeComponent('modelling', F12_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F12_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f12.hypothesis', k >= 3 ? 'f12.questions' : '', answered(nb.contrastText) ? 'f12.contrastText' : '', answered(nb.closure) ? 'f12.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}

/** Lecturas válidas por tipo (para el panel del docente). */
export const validCountsF12 = (w: F12World) => ({
  pressure: validPressures(w).length, flow: validFlows(w).length, volume: validVolumes(w).length,
  smooth: distinctFlows(flowPoints(w, 'smooth')).size, rough: distinctFlows(flowPoints(w, 'rough')).size,
});
