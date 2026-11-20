/**
 * Evaluación por evidencia de F10 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF10` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (viga volcada o carga caída) anula solo el componente de seguridad.
 */
import type { F10World, ReadingF10 } from '../../simulation/f10-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f10StageEvidence } from './evidence';
import { elasticPairs, eqTriples, expectedCalcF10, expectedElF10, expectedEqF10, expectedPlasticF10, validCurves, validElongs, validForcesF10, validReactions, validWeights } from './expected-results';
import { answered, answeredCountF10, isNum, parseNum, SETUP_FIELDS_F10, SETUP_SOURCE_F10, type ElRow, type EqRow, type F10Notebook } from './notebook';

const n = (w: F10World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
const rd = (w: F10World, id: string | null): ReadingF10 | null => (id ? (w.readings[id] ?? null) : null);

export const F10_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (cm ↔ m, mm ↔ m, N ↔ kN, MPa ↔ Pa…). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1, 1e4, 1e-4];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);
const megaScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && (near(x, v * 1e6, 0.02) || near(x, v * 1e-6, 0.02));

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF10(w: F10World, nb: F10Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  for (const k of SETUP_FIELDS_F10) {
    const e = nb.setup[k];
    if (e.value.trim() && !e.readingId) add('E31');
    const r = rd(w, e.readingId);
    if (r && r.kind !== SETUP_SOURCE_F10[k].kind) add('E33');
  }
  const imported = (id: string | null, kind: ReadingF10['kind'], fields: string[]) => {
    const r = rd(w, id);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== kind) {
      add('E33');
      return null;
    }
    return r;
  };
  // Equilibrio: misma posición, peso propio, brazos desde A, signo de los torques y reacciones negativas.
  nb.eqRows.forEach((row: EqRow) => {
    const a = imported(row.raId, 'reaction', [row.RaPred, row.sumF]);
    const b = imported(row.rbId, 'reaction', [row.RbPred, row.tauA]);
    const x = imported(row.xId, 'position', [row.RbPred]);
    if ((a && b && a.trialId !== b.trialId) || (a && x && a.trialId !== x.trialId)) add('E33');
    if (!a || !b || !x) return;
    const e = expectedEqF10(w, nb, row);
    const Rb = parseNum(row.RbPred);
    const Ra = parseNum(row.RaPred);
    if (near(Rb, e.RbNoBeam, 0.01) && !near(Rb, e.RbPred, 0.01)) add('E03');
    else if (near(Rb, e.RbFromEnd, 0.01) && !near(Rb, e.RbPred, 0.01)) add('E04');
    else if (misScaled(Rb, e.RbPred)) add('E34');
    if ((Number.isFinite(Rb) && Rb < 0) || (Number.isFinite(Ra) && Ra < 0)) add('E08');
    const t = parseNum(row.tauA);
    if (near(t, e.tauFlipped, 0.02) && !near(t, e.tauA, 0.02, 0.02)) add('E10');
  });
  // Tracción: fuerza y alargamiento del mismo escalón, escala de σ, columnas, plasticidad y redondeo.
  nb.elRows.forEach((row: ElRow) => {
    const f = imported(row.fId, 'force', [row.sigma]);
    const el = imported(row.eId, 'elong', [row.eps]);
    if (f && el && f.trialId !== el.trialId) add('E33');
    if (!f || !el) return;
    if ((f.qualityFlags.includes('PLASTIC') || el.qualityFlags.includes('PLASTIC')) && (isNum(nb.calc.E.value) || isNum(row.sigma))) add('E13');
    const e = expectedElF10(w, nb, row);
    const s = parseNum(row.sigma);
    const ep = parseNum(row.eps);
    if (near(s, e.eps, 0.02) && near(ep, e.sigma, 0.02)) add('E17');
    else if (megaScaled(s, e.sigma)) add('E12');
    else if (misScaled(s, e.sigma)) add('E34');
    if (e.roundedDiffers && near(ep, e.epsRounded, 0.002) && !near(ep, e.eps, 0.002)) add('E35');
    else if (misScaled(ep, e.eps)) add('E34');
  });
  const P = nb.plastic;
  imported(P.revId, 'elong', [P.epsRev]);
  imported(P.curveId, 'curve', [P.sigmaMax]);
  imported(P.resId, 'elong', [P.epsRes]);
  const ep = expectedPlasticF10(w, nb);
  if (megaScaled(parseNum(P.sigmaMax), ep.sigmaMax)) add('E12');
  else if (misScaled(parseNum(P.sigmaMax), ep.sigmaMax)) add('E34');
  // Cálculos.
  const C = nb.calc;
  const ec = expectedCalcF10(w, nb);
  const E = parseNum(C.E.value);
  if (near(E, ec.Einv, 0.03) && !near(E, ec.E, 0.03)) add('E36');
  else if (megaScaled(E, ec.E)) add('E12');
  else if (misScaled(E, ec.E)) add('E34');
  if (misScaled(parseNum(C.W1slope.value), ec.W1slope)) add('E34');
  const okEl = nb.elRows.filter((x) => elasticPairs(w).some((p) => p.f.id === x.fId && p.e.id === x.eId)).length;
  const okEq = new Set(nb.eqRows.filter((x) => eqTriples(w).some((t) => t.a.id === x.raId && t.b.id === x.rbId && t.x.id === x.xId)).map((x) => Math.round(rd(w, x.xId)?.value ?? -1))).size;
  if ((isNum(C.E.value) && okEl < 5) || (isNum(C.W1slope.value) && okEq < 3)) add('E37');
  const u = parseNum(C.E.uncertainty);
  if (Number.isFinite(u) && Number.isFinite(ec.uBE) && u < ec.uBE * 0.95) add('E38');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF10(nb: F10Notebook): number {
  const P = nb.plastic;
  const cells = [
    ...SETUP_FIELDS_F10.map((k) => !!nb.setup[k].readingId),
    ...nb.eqRows.filter((r) => r.raId || r.rbId || r.xId || isNum(r.RbPred)).map((r) => !!r.raId && !!r.rbId && !!r.xId),
    ...nb.elRows.filter((r) => r.fId || r.eId || isNum(r.sigma)).map((r) => !!r.fId && !!r.eId),
    ...(P.revId || P.curveId || P.resId || isNum(P.sigmaMax) ? [!!P.revId && !!P.curveId && !!P.resId] : []),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF10(w: F10World, nb: F10Notebook): Evaluation {
  const flags = f10StageEvidence(w, nb);
  const issues = notebookIssuesF10(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  /** Errores cometidos con un instrumento concreto (F10-E21 vale para varios). */
  const errAt = (insts: string[], codes: string[]) => codes.filter((c) => insts.some((i) => n(w, `inst:${i}:${c}`) > 0));
  const tipped = n(w, 'beamTipped') > 0;
  const accident = tipped || n(w, 'massDropped') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f10.accident', false, 15, `f10fb.${tipped ? 'E02' : 'E07'}`)]
    : [
      item('f10.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f10fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f10.interlock', n(w, 'interlock') === 0, 3, 'f10fb.interlock'),
      item('f10.unload', !err('E14').length, 3, 'f10fb.E14'),
      item('f10.safeClose', !err('E40').length, 2, 'f10fb.E40'),
      item('f10.closed', flags.stationClosed, 3, 'f10fb.closed'),
    ];

  const inst = (insts: string[], codes: string[], key: string, max: number, gate = true) => {
    const e = errAt(insts, codes);
    return item(`f10.${key}`, gate && e.length === 0, max, `f10fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f10.inspected', flags.instrumentsInspected, 2, 'f10fb.inspected'),
    inst(['dyn01'], ['E05', 'E21', 'E29', 'E30'], 'dyn', 3, flags.weighed),
    inst(['supportA', 'supportB'], ['E21', 'E23', 'E30'], 'cells', 3, flags.equilibriumDone),
    inst(['tape01'], ['E29', 'E20'], 'tape', 2, flags.cgFound),
    inst(['loadCell01'], ['E21', 'E22', 'E23'], 'loadCell', 3, flags.elasticDone),
    inst(['gauge01'], ['E21', 'E11', 'E26', 'E27', 'E25', 'E23'], 'gauge', 4, flags.elasticDone),
    inst(['logger01'], ['E24', 'E32'], 'logger', 3, flags.plasticDone),
  ];

  const exe = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f10.${key}`, gate && e.length === 0, max, `f10fb.${e[0] ?? key}`);
  };
  const execution = [
    exe(['E28', 'E01', 'E09'], 'supports', 4, flags.supportsReady && flags.armDone),
    exe(['E20'], 'cg', 2, flags.cgFound),
    exe(['E06'], 'loads', 2, flags.armDone),
    exe(['E15', 'E19'], 'grips', 4, flags.elasticDone),
    exe(['E16'], 'plastic', 3, flags.plasticDone),
    exe(['E32', 'E30', 'E18'], 'control', 2),
    exe(['E39'], 'integrity', 3),
  ];

  const importedF = importedFractionF10(nb);
  const C = nb.calc;
  const data = [
    item('f10.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f10fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f10.repeats', flags.armDone && flags.elasticDone && !has('E37'), 3, 'f10fb.E37'),
    item('f10.sameSetup', !has('E33'), 2, 'f10fb.E33'),
    item('f10.uncertainty', isNum(C.E.uncertainty) && isNum(C.W1slope.uncertainty) && !has('E38'), 4, `f10fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f10.units', !has('E12') && !has('E34') && !has('E35'), 2, `f10fb.${['E12', 'E35', 'E34'].find(has) ?? 'E34'}`),
  ];

  const ec = expectedCalcF10(w, nb);
  const eqOk = (row: EqRow) => {
    if (!row.raId || !row.rbId || !row.xId) return false;
    const e = expectedEqF10(w, nb, row);
    return close(row.RbPred, e.RbPred, 0.01, 0.01) && close(row.RaPred, e.RaPred, 0.01, 0.01) && close(row.sumF, e.sumF, 0.05, 0.02);
  };
  const tauOk = (row: EqRow) => {
    if (!row.raId || !row.rbId || !row.xId) return false;
    return close(row.tauA, expectedEqF10(w, nb, row).tauA, 0.05, 0.005);
  };
  const elOk = (row: ElRow) => {
    if (!row.fId || !row.eId) return false;
    const e = expectedElF10(w, nb, row);
    return close(row.sigma, e.sigma, 0.01) && close(row.eps, e.eps, 0.01, 1e-7);
  };
  const ep = expectedPlasticF10(w, nb);
  const P = nb.plastic;
  const filledEq = nb.eqRows.filter((r) => r.raId || r.rbId || r.xId);
  const modelling = [
    item('f10.equilibrium', filledEq.length >= 3 && filledEq.every(eqOk) && !['E03', 'E04', 'E08'].some(has), 6, `f10fb.${['E03', 'E04', 'E08'].find(has) ?? 'equilibrium'}`),
    item('f10.torque', filledEq.length >= 3 && filledEq.every(tauOk) && !has('E10'), 3, `f10fb.${has('E10') ? 'E10' : 'torque'}`),
    item('f10.elastic', nb.elRows.every(elOk) && close(C.E.value, ec.E, 0.02) && !['E12', 'E13', 'E17', 'E36'].some(has), 6, `f10fb.${['E13', 'E17', 'E36', 'E12'].find(has) ?? 'elastic'}`),
    item('f10.plastic', close(P.epsRev, ep.epsRev, 0.05, 2e-6) && close(P.sigmaMax, ep.sigmaMax, 0.01) && close(P.epsRes, ep.epsRes, 0.02, 2e-6), 3, 'f10fb.plastic'),
    item('f10.Edev', close(C.Edev.value, ec.Edev, 0.1, 0.3) && close(C.W1slope.value, ec.W1slope, 0.03, 0.02), 2, 'f10fb.Edev'),
  ];

  const k = answeredCountF10(nb);
  const analysis = [
    item('f10.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f10fb.hypothesis', undefined, 0.6),
    item('f10.mcq', nb.mcq === 'residual', 1, 'f10fb.mcq'),
    item('f10.questions', k >= 3 ? null : false, 3, 'f10fb.questions', { n: k }, (k / 4) * 0.6),
    item('f10.contrastText', answered(nb.contrastText) ? null : false, 2, 'f10fb.contrastText', undefined, 0.6),
    item('f10.closure', answered(nb.closure) ? null : false, 2, 'f10fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F10_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F10_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F10_WEIGHTS.execution, execution),
    finalizeComponent('data', F10_WEIGHTS.data, data),
    finalizeComponent('modelling', F10_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F10_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f10.hypothesis', k >= 3 ? 'f10.questions' : '', answered(nb.contrastText) ? 'f10.contrastText' : '', answered(nb.closure) ? 'f10.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}

/** Lecturas válidas por tipo (para el panel del docente). */
export const validCountsF10 = (w: F10World) => ({
  weight: validWeights(w).length, reaction: validReactions(w).length, force: validForcesF10(w).length, elong: validElongs(w).length, curve: validCurves(w).length,
});
