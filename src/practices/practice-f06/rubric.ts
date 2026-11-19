/**
 * Evaluación por evidencia de F06 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF06` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (carro contra el soporte sin freno o resorte desmontado comprimido) anula solo el componente
 * de seguridad.
 */
import type { F06World, ReadingF6 } from '../../simulation/f06-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f06StageEvidence } from './evidence';
import { expectedCalcF6, expectedHeightRow, expectedLaunchRow, expectedLoss, expectedPendRow, expectedRepRow, expectedSpring, expectedSpringRow, validGates, validLaunches } from './expected-results';
import { answered, answeredCountF6, isNum, parseNum, SETUP_FIELDS_F6, type F06Notebook } from './notebook';

const n = (w: F06World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;
const rd = (w: F06World, id: string | null): ReadingF6 | null => (id ? (w.readings[id] ?? null) : null);

export const F06_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (g ↔ kg, cm ↔ m). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF06(w: F06World, nb: F06Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  if (SETUP_FIELDS_F6.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  const imported = (id: string | null, kind: ReadingF6['kind'], fields: string[]) => {
    const r = rd(w, id);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== kind) {
      add('E33');
      return null;
    }
    return r;
  };
  // Calibración del resorte.
  nb.springRows.forEach((row) => {
    const r = imported(row.readingId, 'length', [row.F]);
    if (!r) return;
    if (r.target !== 'ruler01') return add('E33');
    const e = expectedSpringRow(w, nb, r);
    const F = parseNum(row.F);
    if (e.n > 0 && near(F, e.Fnoh, 0.01) && !near(F, e.F, 0.01)) add('E07');
    if (misScaled(F, e.F)) add('E34');
  });
  const sp = expectedSpring(w, nb);
  const k = parseNum(nb.calc.k.value);
  if (Number.isFinite(k) && Number.isFinite(sp.k) && near(k, sp.inverse, 0.05) && !near(k, sp.k, 0.05)) add('E36');
  // Disparos: W = área (no F_máx · x).
  const comps = new Set<string>();
  nb.launchRows.forEach((row) => {
    const r = imported(row.readingId, 'launch', [row.W, row.Uel]);
    if (!r) return;
    comps.add(String(r.setup?.compression));
    const e = expectedLaunchRow(w, nb, r);
    const W = parseNum(row.W);
    if (near(W, e.FmaxX, 0.01) && !near(W, e.W, 0.01)) add('E12');
    if (misScaled(parseNum(row.Uel), e.Uel)) add('E34');
  });
  if (comps.size > 1) add('E33');
  // Réplicas a la altura de referencia: misma altura, sin pérdidas.
  const vers = new Set<string>();
  nb.repRows.forEach((row) => {
    const r = imported(row.readingId, 'gates', [row.v1, row.K1]);
    if (!r) return;
    vers.add(String(r.setup?.heightVersion));
    if (r.setup?.losses) add('E33');
    const e = expectedRepRow(w, nb, r);
    const K = parseNum(row.K1);
    const v = parseNum(row.v1);
    if (near(K, e.K1double, 0.01) && !near(K, e.K1, 0.01)) add('E11');
    if (Number.isFinite(v) && !near(e.v1rounded, e.v1, 0.003) && near(v, e.v1rounded, 0.002) && !near(v, e.v1, 0.002)) add('E35');
    if (misScaled(v, e.v1) || misScaled(K, e.K1)) add('E34');
  });
  if (vers.size > 1) add('E33');
  // Alturas: el medidor leído debe ser el de la altura del ensayo.
  nb.heightRows.forEach((row) => {
    const r = imported(row.readingId, 'gates', [row.v2, row.Ug, row.K2]);
    const hr = rd(w, row.heightId);
    if (!hr && isNum(row.Ug)) add('E31');
    if (!r || !hr) return;
    if (hr.kind !== 'height' || r.setup?.losses || hr.setup?.heightVersion !== r.setup?.heightVersion) add('E33');
    const e = expectedHeightRow(w, nb, r, hr);
    const K2 = parseNum(row.K2);
    if (near(K2, e.K2double, 0.01) && !near(K2, e.K2, 0.01)) add('E11');
    if (misScaled(parseNum(row.Ug), e.Ug) || misScaled(K2, e.K2)) add('E34');
  });
  // Pérdidas.
  const el = expectedLoss(w, nb);
  if (!nb.loss.readingId && isNum(nb.loss.Wnc)) add('E31');
  if (el.r) {
    const hr = rd(w, nb.loss.heightId);
    if (el.r.kind !== 'gates' || !el.r.setup?.losses || (hr && hr.setup?.heightVersion !== el.r.setup?.heightVersion)) add('E33');
    const Wnc = parseNum(nb.loss.Wnc);
    if (Number.isFinite(Wnc) && Number.isFinite(el.Wnc) && el.Wnc < 0 && Wnc > 0 && near(-Wnc, el.Wnc, 0.05)) add('E10');
    if (misScaled(Wnc, el.Wnc)) add('E34');
  }
  // Péndulo.
  nb.pendRows.forEach((row) => {
    const r = imported(row.readingId, 'pendulum', [row.v, row.h]);
    if (!r) return;
    const e = expectedPendRow(w, nb, r);
    if (misScaled(parseNum(row.h), e.h) || misScaled(parseNum(row.v), e.v)) add('E34');
  });
  // Cálculos.
  const ec = expectedCalcF6(w, nb);
  const C = nb.calc;
  const wnet = parseNum(C.Wnet.value);
  if (Number.isFinite(wnet) && Number.isFinite(ec.Wnet) && !near(wnet, ec.Wnet, 0.03) && (near(wnet, ec.Wnc, 0.03) || near(wnet, ec.Wgrav, 0.03))) add('E09');
  const pm = parseNum(C.Pmax.value);
  if (Number.isFinite(pm) && near(pm, ec.Pavg, 0.02) && !near(pm, ec.Pmax, 0.05)) add('E19');
  const validW = nb.launchRows.filter((x) => validLaunches(w).some((r) => r.id === x.readingId)).length;
  const validK = nb.repRows.filter((x) => validGates(w).some((r) => r.id === x.readingId)).length;
  if ((isNum(C.W.value) && validW < 3) || (isNum(C.K1.value) && validK < 3)) add('E37');
  const uk = parseNum(C.k.uncertainty);
  const uW = parseNum(C.W.uncertainty);
  if ((Number.isFinite(uk) && Number.isFinite(sp.uB) && uk < sp.uB * 0.95) || (Number.isFinite(uW) && uW < ec.uBW * 0.95)) add('E38');
  if (nb.mcq === 'conserved' || nb.mcq === 'created') add('E16');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF06(nb: F06Notebook): number {
  const cells = [
    ...SETUP_FIELDS_F6.map((k) => !!nb.setup[k].readingId),
    ...nb.springRows.filter((r) => r.readingId || isNum(r.F)).map((r) => !!r.readingId),
    ...nb.launchRows.filter((r) => r.readingId || isNum(r.W)).map((r) => !!r.readingId),
    ...nb.repRows.filter((r) => r.readingId || isNum(r.K1)).map((r) => !!r.readingId),
    ...nb.heightRows.filter((r) => r.readingId || r.heightId || isNum(r.Ug)).map((r) => !!r.readingId && !!r.heightId),
    ...(nb.loss.readingId || isNum(nb.loss.Wnc) ? [!!nb.loss.readingId && !!nb.loss.heightId] : []),
    ...nb.pendRows.filter((r) => r.readingId || isNum(r.v)).map((r) => !!r.readingId),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF06(w: F06World, nb: F06Notebook): Evaluation {
  const flags = f06StageEvidence(w, nb);
  const issues = notebookIssuesF06(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const accident = n(w, 'err:E13') > 0 || n(w, 'err:E40') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f06.accident', false, 15, `f06fb.${n(w, 'err:E13') > 0 ? 'E13' : 'E40'}`)]
    : [
      item('f06.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f06fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f06.secured', !err('E02').length, 2, 'f06fb.E02'),
      item('f06.overload', !err('E01').length, 3, 'f06fb.E01'),
      item('f06.clamp', !err('E28').length, 3, 'f06fb.E28'),
      item('f06.closed', flags.stationClosed, 3, 'f06fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f06.${key}`, gate && e.length === 0, max, `f06fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f06.inspected', flags.instrumentsInspected, 2, 'f06fb.inspected'),
    instE(['E21', 'E30'], 'balance', 3, flags.massesWeighed),
    instE(['E22', 'E23', 'E26', 'E27'], 'forceSensor', 4, flags.sensorReady),
    instE(['E15', 'E24', 'E25'], 'logger', 4, flags.energyStored),
    instE(['E03', 'E29'], 'scales', 4, flags.springCalibrated),
    instE(['E23'], 'angleSensor', 3, flags.pendulumDone),
  ];

  const execution = [
    instE(['E05'], 'springRest', 3, flags.springCalibrated),
    instE(['E02', 'E08'], 'release', 3, flags.energyStored),
    instE(['E06', 'E14'], 'heights', 3, flags.heightsExplored),
    instE(['E17'], 'pendulum', 3, flags.pendulumDone),
    item('f06.losses', flags.lossesObserved, 3, 'f06fb.losses'),
    instE(['E04', 'E32'], 'control', 2),
    instE(['E18', 'E20', 'E39'], 'integrity', 3),
  ];

  const importedF = importedFractionF06(nb);
  const data = [
    item('f06.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f06fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f06.repeats', flags.energyStored && !has('E37'), 3, 'f06fb.E37'),
    item('f06.sameSetup', !has('E33'), 2, 'f06fb.E33'),
    item('f06.uncertainty', isNum(nb.calc.k.uncertainty) && isNum(nb.calc.W.uncertainty) && isNum(nb.calc.K1.uncertainty) && !has('E38'), 4, `f06fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f06.units', !has('E35') && !has('E34'), 2, `f06fb.${['E35', 'E34'].find(has) ?? 'E34'}`),
  ];

  const sp = expectedSpring(w, nb);
  const ec = expectedCalcF6(w, nb);
  const el = expectedLoss(w, nb);
  const C = nb.calc;
  const rowsOk = <T extends { readingId: string | null }>(rows: T[], ok: (r: T) => boolean) => {
    const used = rows.filter((r) => r.readingId);
    return used.length > 0 && used.every(ok);
  };
  const springOk = rowsOk(nb.springRows, (r) => close(r.F, expectedSpringRow(w, nb, rd(w, r.readingId)).F, 0.01));
  const launchOk = rowsOk(nb.launchRows, (r) => {
    const e = expectedLaunchRow(w, nb, rd(w, r.readingId));
    return close(r.W, e.W, 0.01, 0.002) && close(r.Uel, e.Uel, 0.02, 0.002);
  });
  const repOk = rowsOk(nb.repRows, (r) => {
    const e = expectedRepRow(w, nb, rd(w, r.readingId));
    return close(r.v1, e.v1, 0.01) && close(r.K1, e.K1, 0.02, 0.002);
  });
  const heightOk = rowsOk(nb.heightRows, (r) => {
    const e = expectedHeightRow(w, nb, rd(w, r.readingId), rd(w, r.heightId));
    return close(r.v2, e.v2, 0.01) && close(r.Ug, e.Ug, 0.02, 0.002) && close(r.K2, e.K2, 0.02, 0.002);
  });
  const lossOk = !!el.r && close(nb.loss.Wnc, el.Wnc, 0.1, 0.005) && close(C.Wnet.value, ec.Wnet, 0.05, 0.005);
  const pendOk = rowsOk(nb.pendRows, (r) => {
    const e = expectedPendRow(w, nb, rd(w, r.readingId));
    return close(r.v, e.v, 0.01) && close(r.h, e.h, 0.02, 0.0005);
  });
  const modelling = [
    item('f06.spring', springOk && close(C.k.value, sp.k, 0.02, 0.5) && close(C.k.uncertainty, sp.uk, 0.6, 0.5) && !has('E07') && !has('E36'), 4, `f06fb.${['E07', 'E36'].find(has) ?? 'spring'}`, { k: Number.isFinite(sp.k) ? sp.k.toFixed(1) : '—' }),
    item('f06.launch', launchOk && close(C.W.value, ec.W, 0.01, 0.002) && !has('E12'), 4, `f06fb.${has('E12') ? 'E12' : 'launch'}`),
    item('f06.kinetic', repOk && close(C.K1.value, ec.K1, 0.02, 0.002) && close(C.eff.value, ec.eff, 0.02, 0.5) && !has('E11'), 3, `f06fb.${has('E11') ? 'E11' : 'kinetic'}`),
    item('f06.heightsCalc', heightOk, 3, 'f06fb.heightsCalc'),
    item('f06.lossCalc', lossOk && !has('E09') && !has('E10'), 3, `f06fb.${['E10', 'E09'].find(has) ?? 'lossCalc'}`),
    item('f06.power', pendOk && close(C.Pmax.value, ec.Pmax, 0.05, 0.5) && !has('E19'), 3, `f06fb.${has('E19') ? 'E19' : 'power'}`),
  ];

  const k = answeredCountF6(nb);
  const analysis = [
    item('f06.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f06fb.hypothesis', undefined, 0.6),
    item('f06.mcq', nb.mcq === 'dissipated', 1, `f06fb.${has('E16') ? 'E16' : 'mcq'}`),
    item('f06.questions', k >= 3 ? null : false, 3, 'f06fb.questions', { n: k }, (k / 4) * 0.6),
    item('f06.contrastText', answered(nb.contrastText) ? null : false, 2, 'f06fb.contrastText', undefined, 0.6),
    item('f06.closure', answered(nb.closure) ? null : false, 2, 'f06fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F06_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F06_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F06_WEIGHTS.execution, execution),
    finalizeComponent('data', F06_WEIGHTS.data, data),
    finalizeComponent('modelling', F06_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F06_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f06.hypothesis', k >= 3 ? 'f06.questions' : '', answered(nb.contrastText) ? 'f06.contrastText' : '', answered(nb.closure) ? 'f06.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}
