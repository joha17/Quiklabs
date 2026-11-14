/**
 * Evaluación por evidencia de F08 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF08` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (mano en el plano de giro o sólido desmontado girando) anula solo el componente de seguridad.
 */
import type { F08World, ReadingF8 } from '../../simulation/f08-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f08StageEvidence } from './evidence';
import { expectedCalcF8, expectedEnergyF8, expectedRunF8, expectedTensionF8, runKindF8, validRuns, type RunKind } from './expected-results';
import { answered, answeredCountF8, isNum, parseNum, SETUP_FIELDS_F8, type F08Notebook, type RunRow } from './notebook';

const n = (w: F08World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
const rd = (w: F08World, id: string | null): ReadingF8 | null => (id ? (w.readings[id] ?? null) : null);

export const F08_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (g ↔ kg, cm ↔ m, cm² ↔ m²). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1, 1e4, 1e-4];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF08(w: F08World, nb: F08Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  if (SETUP_FIELDS_F8.some((k) => nb.setup[k].value.trim() && !nb.setup[k].readingId)) add('E31');
  const imported = (id: string | null, kind: ReadingF8['kind'], fields: string[]) => {
    const r = rd(w, id);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== kind) {
      add('E33');
      return null;
    }
    if (r.qualityFlags.includes('SUPPORT_MOVED')) add('E20');
    return r;
  };
  // Ensayos de torque: tabla correcta, T = m g, sin roce, c como α, α redondeada y conversiones.
  const checkRow = (row: RunRow, kind: RunKind) => {
    const r = imported(row.readingId, 'encoder', [row.alpha, row.T, row.I]);
    if (!r) return;
    if (runKindF8(r) !== kind) add('E33');
    const e = expectedRunF8(w, nb, r);
    const T = parseNum(row.T);
    if (near(T, e.Tmg, 0.002) && !near(T, e.T, 0.002)) add('E08');
    const a = parseNum(row.alpha);
    if (near(a, e.c, 0.01) && !near(a, e.alpha, 0.01)) add('E17');
    const I = parseNum(row.I);
    if (e.alphaC > 0.01 * e.alpha && near(I, e.Inofric, 0.003) && !near(I, e.I, 0.003)) add('E13');
    if (e.roundedDiffers && near(I, e.Irounded, 0.001) && !near(I, e.I, 0.001)) add('E35');
    if (!near(I, e.Ihalf, 0.01) && misScaled(I, e.I)) add('E34');
  };
  checkRow(nb.axle, 'axle');
  nb.diskRows.forEach((r) => checkRow(r, 'disc'));
  checkRow(nb.ring, 'ring');
  nb.massRows.forEach((r) => checkRow(r, 'bar'));
  checkRow(nb.parallel, 'parallel');
  nb.massRows.forEach((r) => {
    if (r.rId && rd(w, r.rId)?.kind !== 'radius') add('E33');
  });
  // Tensión medida frente al modelo.
  const tr = imported(nb.tension.readingId, 'tension', [nb.tension.T]);
  const er = imported(nb.tension.encId, 'encoder', [nb.tension.Tmodel]);
  if (tr && er && tr.trialId !== er.trialId) add('E33');
  if (er) {
    const te = expectedTensionF8(w, nb);
    if (near(parseNum(nb.tension.Tmodel), te.Tmg, 0.002) && !near(parseNum(nb.tension.Tmodel), te.Tmodel, 0.002)) add('E08');
  }
  // Energía: rpm usadas como rad/s y conversiones.
  const gr = imported(nb.energy.readingId, 'gate', [nb.energy.v, nb.energy.bal]);
  const tc = imported(nb.energy.tachId, 'tach', [nb.energy.omega]);
  if (gr && runKindF8(gr) !== 'disc') add('E33');
  if (tc && gr && tc.trialId !== gr.trialId) add('E33');
  const en = expectedEnergyF8(w, nb);
  if (tc) {
    const om = parseNum(nb.energy.omega);
    if (near(om, en.rpm, 0.01) && !near(om, en.omega, 0.01)) add('E16');
  }
  if (gr && misScaled(parseNum(nb.energy.v), en.v)) add('E34');
  // Cálculos.
  const ec = expectedCalcF8(w, nb);
  const C = nb.calc;
  const Ip = parseNum(C.Ipred.value);
  if (near(Ip, ec.IpredDiam, 0.01) && !near(Ip, ec.Ipred, 0.01)) add('E02');
  else if (misScaled(Ip, ec.Ipred)) add('E34');
  const Id = parseNum(C.Idisk.value);
  if (Number.isFinite(ec.I0) && ec.I0 > 0.05 * Math.abs(ec.Idisk) && near(Id, ec.IdiskNoI0, 0.01) && !near(Id, ec.Idisk, 0.01)) add('E09');
  const Ipp = parseNum(nb.parallel.Ipred);
  if (near(Ipp, ec.IparNoMd2, 0.01) && !near(Ipp, ec.IparPred, 0.01)) add('E15');
  const sl = parseNum(C.slope.value);
  if (Math.abs(ec.slope) > 1e-6 && near(sl, 1 / ec.slope, 0.02) && !near(sl, ec.slope, 0.02)) add('E36');
  const valid = nb.diskRows.filter((x) => validRuns(w, 'disc').some((r) => r.id === x.readingId)).length;
  if (isNum(C.Idisk.value) && valid < 3) add('E37');
  const lt = (s: string, uB: number) => {
    const u = parseNum(s);
    return Number.isFinite(u) && Number.isFinite(uB) && u < uB * 0.95;
  };
  if (lt(C.Idisk.uncertainty, ec.uBI) || lt(C.Iring.uncertainty, ec.uIring)) add('E38');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF08(nb: F08Notebook): number {
  const rowCells = (rows: RunRow[]) => rows.filter((r) => r.readingId || isNum(r.I)).map((r) => !!r.readingId);
  const cells = [
    ...SETUP_FIELDS_F8.map((k) => !!nb.setup[k].readingId),
    ...rowCells([nb.axle, ...nb.diskRows, nb.ring, ...nb.massRows, nb.parallel]),
    ...nb.massRows.filter((r) => r.readingId).map((r) => !!r.rId),
    ...(nb.tension.readingId || isNum(nb.tension.T) ? [!!nb.tension.readingId && !!nb.tension.encId] : []),
    ...(nb.energy.readingId || isNum(nb.energy.v) ? [!!nb.energy.readingId && !!nb.energy.tachId] : []),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF08(w: F08World, nb: F08Notebook): Evaluation {
  const flags = f08StageEvidence(w, nb);
  const issues = notebookIssuesF08(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const hand = n(w, 'handInPlane') > 0;
  const accident = hand || n(w, 'spinningDismount') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f08.accident', false, 15, `f08fb.${hand ? 'E19' : 'E40'}`)]
    : [
      item('f08.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f08fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f08.guard', !err('E18').length, 3, 'f08fb.E18'),
      item('f08.drop', !err('E12').length, 3, 'f08fb.E12'),
      item('f08.hands', !err('E11', 'E14').length, 2, `f08fb.${err('E11', 'E14')[0] ?? 'E11'}`),
      item('f08.closed', flags.stationClosed, 3, 'f08fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f08.${key}`, gate && e.length === 0, max, `f08fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f08.inspected', flags.instrumentsInspected, 2, 'f08fb.inspected'),
    instE(['E21', 'E30'], 'balance', 3, flags.massesWeighed),
    instE(['E06', 'E07', 'E27', 'E29'], 'encoder', 5, flags.encoderReady),
    instE(['E21', 'E23', 'E26'], 'tension', 3, flags.tensionMeasured),
    instE(['E22', 'E25'], 'tachGate', 4, flags.energyDone),
    instE(['E24'], 'logger', 3, flags.sensorsReady),
  ];

  const execution = [
    instE(['E28', 'E10'], 'support', 4, flags.supportReady && flags.diskDone),
    instE(['E01'], 'centering', 3, flags.ringDone),
    instE(['E03', 'E04'], 'masses', 3, flags.massesDone),
    instE(['E05'], 'winding', 3, flags.diskDone),
    item('f08.parallelRun', flags.parallelDone, 3, 'f08fb.parallelRun'),
    instE(['E32'], 'control', 2),
    instE(['E39'], 'integrity', 2),
  ];

  const importedF = importedFractionF08(nb);
  const C = nb.calc;
  const data = [
    item('f08.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f08fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f08.repeats', flags.diskDone && !has('E37'), 3, 'f08fb.E37'),
    item('f08.sameSetup', !has('E33') && !has('E20'), 2, `f08fb.${has('E20') ? 'E20' : 'E33'}`),
    item('f08.uncertainty', isNum(C.Idisk.uncertainty) && isNum(C.Iring.uncertainty) && isNum(C.slope.uncertainty) && !has('E38'), 4, `f08fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f08.units', !has('E35') && !has('E34') && !has('E16'), 2, `f08fb.${['E35', 'E34', 'E16'].find(has) ?? 'E34'}`),
  ];

  const ec = expectedCalcF8(w, nb);
  const rowOk = (row: RunRow) => {
    if (!row.readingId) return false;
    const e = expectedRunF8(w, nb, rd(w, row.readingId));
    return close(row.alpha, e.alpha, 0.01, 0.002) && close(row.alphaC, e.alphaC, 0.05, 0.003) && close(row.T, e.T, 0.01, 0.002) && close(row.I, e.I, 0.02, 2e-5);
  };
  const runsOk = [nb.axle, ...nb.diskRows, nb.ring].every(rowOk);
  const te = expectedTensionF8(w, nb);
  const en = expectedEnergyF8(w, nb);
  const modelling = [
    item('f08.inertia', runsOk && close(C.Ipred.value, ec.Ipred, 0.01) && close(C.Idisk.value, ec.Idisk, 0.02, 2e-5) && close(C.Iring.value, ec.Iring, 0.02, 2e-5) && close(C.ratio.value, ec.ratio, 0.03) && !['E02', 'E08', 'E09', 'E13', 'E17'].some(has), 6, `f08fb.${['E02', 'E08', 'E09', 'E13', 'E17'].find(has) ?? 'inertia'}`),
    item('f08.tensionCalc', !!te.tr && close(nb.tension.Tmodel, te.Tmodel, 0.01, 0.002) && close(nb.tension.diff, te.diff, 0.1, 0.5), 3, `f08fb.${has('E08') ? 'E08' : 'tensionCalc'}`),
    item('f08.parallel', rowOk(nb.parallel) && close(nb.parallel.Ipred, ec.IparPred, 0.02, 2e-5) && close(C.parDisc.value, ec.parDisc, 0.1, 1) && !has('E15'), 4, `f08fb.${has('E15') ? 'E15' : 'parallel'}`),
    item('f08.slope', nb.massRows.every(rowOk) && close(C.slope.value, ec.slope, 0.05, 0.002) && !has('E36'), 4, `f08fb.${has('E36') ? 'E36' : 'slope'}`),
    item('f08.energy', !!en.gr && close(nb.energy.v, en.v, 0.01, 0.002) && close(nb.energy.bal, en.bal, 0.03, 1) && close(C.Ebal.value, ec.Ebal, 0.03, 1) && !has('E16'), 3, `f08fb.${has('E16') ? 'E16' : 'energy'}`),
  ];

  const k = answeredCountF8(nb);
  const analysis = [
    item('f08.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f08fb.hypothesis', undefined, 0.6),
    item('f08.mcq', nb.mcq === 'farther', 1, 'f08fb.mcq'),
    item('f08.questions', k >= 3 ? null : false, 3, 'f08fb.questions', { n: k }, (k / 4) * 0.6),
    item('f08.contrastText', answered(nb.contrastText) ? null : false, 2, 'f08fb.contrastText', undefined, 0.6),
    item('f08.closure', answered(nb.closure) ? null : false, 2, 'f08fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F08_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F08_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F08_WEIGHTS.execution, execution),
    finalizeComponent('data', F08_WEIGHTS.data, data),
    finalizeComponent('modelling', F08_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F08_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f08.hypothesis', k >= 3 ? 'f08.questions' : '', answered(nb.contrastText) ? 'f08.contrastText' : '', answered(nb.closure) ? 'f08.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}
