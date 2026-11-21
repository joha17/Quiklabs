/**
 * Evaluación por evidencia de F11 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF11` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (tanque desbordado sobre la mesada) anula solo el componente de seguridad.
 */
import type { F11World, ReadingF11 } from '../../simulation/f11-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { f11StageEvidence } from './evidence';
import {
  buoyPairs, expectedBuoyF11, expectedCalcF11, expectedFloatF11, expectedPRowF11, floatDrafts, profilePairs, validDrafts, validMasses, validPressures, validWeights,
} from './expected-results';
import { answered, answeredCountF11, isNum, parseNum, SETUP_FIELDS_F11, SETUP_SOURCE_F11, type BuoyRow, type F11Notebook, type FloatRow, type PRow } from './notebook';

const n = (w: F11World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
const rd = (w: F11World, id: string | null): ReadingF11 | null => (id ? (w.readings[id] ?? null) : null);

export const F11_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Escalas de una conversión mal hecha (kPa ↔ Pa, cm ↔ m, cm³ ↔ m³, g ↔ kg…). */
const WRONG_SCALES = [1000, 0.001, 100, 0.01, 10, 0.1, 1e6, 1e-6];
const misScaled = (x: number, v: number) => Number.isFinite(x) && Number.isFinite(v) && v !== 0 && WRONG_SCALES.some((k) => near(x, v * k, 0.02)) && !near(x, v, 0.02);

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF11(w: F11World, nb: F11Notebook): string[] {
  const out: string[] = [];
  const add = (k: string) => out.push(`nb:${k}`);
  for (const k of SETUP_FIELDS_F11) {
    const e = nb.setup[k];
    if (e.value.trim() && !e.readingId) add('E31');
    const r = rd(w, e.readingId);
    if (r && (r.kind !== SETUP_SOURCE_F11[k].kind || (k === 'LA' && r.fluid !== 'A') || (k === 'LB' && r.fluid !== 'B'))) add('E33');
  }
  const imported = (id: string | null, kind: ReadingF11['kind'], fields: string[]) => {
    const r = rd(w, id);
    if (!r && fields.some(isNum)) add('E31');
    if (!r) return null;
    if (r.kind !== kind) {
      add('E33');
      return null;
    }
    return r;
  };
  const absolute = w.probe.absolute;
  // Perfiles: misma cota, h desde la superficie, superficie restada, escala y redondeo.
  const profile = (rows: PRow[], fluid: 'A' | 'B') =>
    rows.forEach((row) => {
      const p = imported(row.pId, 'pressure', [row.p]);
      const z = imported(row.zId, 'ruler', [row.h]);
      if (p && z && p.trialId !== z.trialId) add('E33');
      if (p && p.fluid && p.fluid !== fluid) add('E33');
      if (!p || !z) return;
      const e = expectedPRowF11(w, nb, row, fluid);
      const h = parseNum(row.h);
      const pv = parseNum(row.p);
      if (near(h, e.hFromBottom, 0.01) && !near(h, e.h, 0.01)) add('E02');
      else if (e.roundedDiffers && near(h, e.hRounded, 0.0005, 1e-6) && !near(h, e.h, 0.0005, 1e-6)) add('E35');
      else if (misScaled(h, e.h)) add('E34');
      if (absolute && near(pv, e.pNoP0, 0.005) && !near(pv, e.p, 0.005, 5)) add('E06');
      else if (misScaled(pv, e.p)) add('E34');
    });
  profile(nb.pARows, 'A');
  profile(nb.pBRows, 'B');
  // Empuje: mismo ensayo, parcial tomado como total, signo y escala.
  nb.buoyRows.forEach((row: BuoyRow) => {
    const f = imported(row.fId, 'weight', [row.Fb]);
    const i = imported(row.iId, 'immersion', [row.Vsub]);
    if (f && i && f.trialId !== i.trialId) add('E33');
    if (!f || !i) return;
    const e = expectedBuoyF11(w, nb, row);
    const Fb = parseNum(row.Fb);
    const Fp = parseNum(row.FbPred);
    if (near(Fb, e.FbNeg, 0.01) && !near(Fb, e.Fb, 0.01)) add('E16');
    else if (misScaled(Fb, e.Fb)) add('E34');
    if (e.partial && near(Fp, e.FbPredTotal, 0.01) && !near(Fp, e.FbPred, 0.01)) add('E07');
    else if (misScaled(Fp, e.FbPred)) add('E34');
    if (misScaled(parseNum(row.Vsub), e.Vsub)) add('E34');
  });
  // Flotación: masa y calado del mismo objeto y lastre, masa como densidad, escala.
  nb.floatRows.forEach((row: FloatRow) => {
    const m = imported(row.mId, 'mass', [row.rho]);
    const d = imported(row.dId, 'draft', [row.fMeas]);
    if (m && d && (m.target !== d.target || (m.ballastG ?? 0) !== (d.ballastG ?? 0))) add('E33');
    if (!m || !d) return;
    const e = expectedFloatF11(w, nb, row);
    const rho = parseNum(row.rho);
    if ((near(rho, e.rhoAsMass, 0.01) || near(parseNum(row.fPred), e.fPredAsMass, 0.01)) && !near(rho, e.rho, 0.01)) add('E13');
    else if (misScaled(rho, e.rho)) add('E34');
  });
  // Cálculos: pendientes invertidas, perfil estratificado, escala.
  const C = nb.calc;
  const ec = expectedCalcF11(w, nb);
  const g = w.params.g;
  const inverted = (x: number, inv: number) => Number.isFinite(inv) && (near(x, inv, 0.03) || near(x, inv / g, 0.03) || near(x, inv * g, 0.03));
  const rA = parseNum(C.rhoA.value);
  const rB = parseNum(C.rhoB.value);
  if ((inverted(rA, ec.invA) && !near(rA, ec.rhoA, 0.03)) || (inverted(rB, ec.invB) && !near(rB, ec.rhoB, 0.03))) add('E36');
  else if (misScaled(rA, ec.rhoA) || misScaled(rB, ec.rhoB)) add('E34');
  if (misScaled(parseNum(C.rhoCyl.value), ec.rhoCyl)) add('E34');
  const strat = nb.pBRows.some((r) => rd(w, r.pId)?.qualityFlags.includes('STRATIFIED'));
  if (strat && isNum(C.rhoB.value)) add('E18');
  const pairsOk = (rows: PRow[], fluid: 'A' | 'B') =>
    new Set(rows.filter((x) => profilePairs(w, fluid).some((p) => p.p.id === x.pId && p.z.id === x.zId)).map((x) => Math.round(rd(w, x.zId)?.value ?? -1))).size;
  const okBuoy = new Set(nb.buoyRows.filter((x) => buoyPairs(w).some((p) => p.f.id === x.fId && p.i.id === x.iId)).map((x) => Math.round((rd(w, x.iId)?.value ?? -1) * 10))).size;
  if ((isNum(C.rhoA.value) && pairsOk(nb.pARows, 'A') < 5) || (isNum(C.rhoB.value) && pairsOk(nb.pBRows, 'B') < 5) || (isNum(C.FbDev.value) && okBuoy < 4)) add('E37');
  const u = parseNum(C.rhoA.uncertainty);
  const uB = parseNum(C.rhoB.uncertainty);
  if ((Number.isFinite(u) && Number.isFinite(ec.uBA) && u < ec.uBA * 0.95) || (Number.isFinite(uB) && Number.isFinite(ec.uBB) && uB < ec.uBB * 0.95)) add('E38');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF11(nb: F11Notebook): number {
  const cells = [
    ...SETUP_FIELDS_F11.map((k) => !!nb.setup[k].readingId),
    ...[...nb.pARows, ...nb.pBRows].filter((r) => r.pId || r.zId || isNum(r.p)).map((r) => !!r.pId && !!r.zId),
    ...nb.buoyRows.filter((r) => r.fId || r.iId || isNum(r.Fb)).map((r) => !!r.fId && !!r.iId),
    ...nb.floatRows.filter((r) => r.mId || r.dId || isNum(r.rho)).map((r) => !!r.mId && !!r.dId),
  ];
  return cells.length ? cells.filter(Boolean).length / cells.length : 0;
}

export function evaluateF11(w: F11World, nb: F11Notebook): Evaluation {
  const flags = f11StageEvidence(w, nb);
  const issues = notebookIssuesF11(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  /** Errores cometidos con un instrumento concreto (F11-E21 vale para varios). */
  const errAt = (insts: string[], codes: string[]) => codes.filter((c) => insts.some((i) => n(w, `inst:${i}:${c}`) > 0));
  const accident = n(w, 'tankSpill') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f11.accident', false, 15, 'f11fb.E11')]
    : [
      item('f11.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f11fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f11.impact', n(w, 'probeImpact') === 0, 3, 'f11fb.E39'),
      item('f11.spill', !err('E11').length, 3, 'f11fb.E11'),
      item('f11.safeClose', !err('E40').length, 2, 'f11fb.E40'),
      item('f11.closed', flags.stationClosed, 3, 'f11fb.closed'),
    ];

  const inst = (insts: string[], codes: string[], key: string, max: number, gate = true) => {
    const e = errAt(insts, codes);
    return item(`f11.${key}`, gate && e.length === 0, max, `f11fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f11.inspected', flags.instrumentsInspected, 2, 'f11fb.inspected'),
    inst(['probe01'], ['E01', 'E03', 'E22', 'E23', 'E27', 'E30'], 'probe', 5, flags.profileA),
    inst(['ruler01', 'scale01', 'draft01', 'cyl01'], ['E25', 'E29'], 'scales', 2, flags.profileA),
    inst(['dyn01', 'stand01'], ['E21', 'E26', 'E29', 'E30'], 'dyn', 3, flags.buoyancy),
    inst(['balance01'], ['E10', 'E21', 'E30'], 'balance', 3, flags.densityCyl),
    inst(['probe01', 'ruler01'], ['E04', 'E28'], 'guide', 3, flags.profileA),
    inst(['probe01'], ['E24', 'E32'], 'logger', 2, flags.profileB),
  ];

  const exe = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f11.${key}`, gate && e.length === 0, max, `f11fb.${e[0] ?? key}`);
  };
  const execution = [
    exe(['E05', 'E14'], 'fluids', 4, flags.profileB),
    exe(['E12'], 'waves', 3),
    exe(['E08', 'E11', 'E19'], 'buoyancy', 4, flags.buoyancy),
    exe(['E09', 'E15', 'E17'], 'flotation', 4, flags.flotation),
    exe(['E39'], 'integrity', 2),
    exe(['E30', 'E20'], 'control', 3),
  ];

  const importedF = importedFractionF11(nb);
  const C = nb.calc;
  const data = [
    item('f11.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f11fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f11.repeats', flags.profileA && flags.profileB && flags.buoyancy && !has('E37'), 3, 'f11fb.E37'),
    item('f11.sameSetup', !has('E33'), 2, 'f11fb.E33'),
    item('f11.uncertainty', isNum(C.rhoA.uncertainty) && isNum(C.rhoB.uncertainty) && isNum(C.rhoCyl.uncertainty) && !has('E38'), 4, `f11fb.${has('E38') ? 'E38' : 'uncertainty'}`),
    item('f11.units', !has('E34') && !has('E35'), 2, `f11fb.${['E35', 'E34'].find(has) ?? 'E34'}`),
  ];

  const ec = expectedCalcF11(w, nb);
  const pOk = (fluid: 'A' | 'B') => (row: PRow) => {
    if (!row.pId || !row.zId) return false;
    const e = expectedPRowF11(w, nb, row, fluid);
    return close(row.h, e.h, 0.005, 2e-4) && close(row.p, e.p, 0.01, 2);
  };
  const bOk = (row: BuoyRow) => {
    if (!row.fId || !row.iId) return false;
    const e = expectedBuoyF11(w, nb, row);
    return close(row.Vsub, e.Vsub, 0.01, 0.5) && close(row.Fb, e.Fb, 0.01, 0.01) && close(row.FbPred, e.FbPred, 0.02, 0.01);
  };
  const fOk = (row: FloatRow) => {
    if (!row.mId || !row.dId) return false;
    const e = expectedFloatF11(w, nb, row);
    return close(row.rho, e.rho, 0.01, 1) && close(row.fPred, e.fPred, 0.02, 0.005) && close(row.fMeas, e.fMeas, 0.01, 0.005);
  };
  const filledA = nb.pARows.filter((r) => r.pId || r.zId);
  const filledB = nb.pBRows.filter((r) => r.pId || r.zId);
  const filledBuoy = nb.buoyRows.filter((r) => r.fId || r.iId);
  const filledF = nb.floatRows.filter((r) => r.mId || r.dId);
  const modelling = [
    item('f11.profiles', filledA.length >= 5 && filledB.length >= 5 && filledA.every(pOk('A')) && filledB.every(pOk('B')) && !['E02', 'E06'].some(has), 6, `f11fb.${['E02', 'E06'].find(has) ?? 'profiles'}`),
    item('f11.densities', close(C.rhoA.value, ec.rhoA, 0.01) && close(C.rhoB.value, ec.rhoB, 0.01) && close(C.rhoCyl.value, ec.rhoCyl, 0.01) && !['E18', 'E36'].some(has), 5, `f11fb.${['E18', 'E36'].find(has) ?? 'densities'}`),
    item('f11.buoyancy', filledBuoy.length >= 4 && filledBuoy.every(bOk) && !['E07', 'E16'].some(has), 5, `f11fb.${['E07', 'E16'].find(has) ?? 'buoyancy'}`),
    item('f11.flotation', filledF.length >= 3 && filledF.every(fOk) && !has('E13'), 3, `f11fb.${has('E13') ? 'E13' : 'flotationCalc'}`),
    item('f11.FbDev', close(C.FbDev.value, ec.FbDev, 0.1, 0.3), 1, 'f11fb.FbDev'),
  ];

  const k = answeredCountF11(nb);
  const analysis = [
    item('f11.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f11fb.hypothesis', undefined, 0.6),
    item('f11.mcq', nb.mcq === 'less', 1, 'f11fb.mcq'),
    item('f11.questions', k >= 3 ? null : false, 3, 'f11fb.questions', { n: k }, (k / 4) * 0.6),
    item('f11.contrastText', answered(nb.contrastText) ? null : false, 2, 'f11fb.contrastText', undefined, 0.6),
    item('f11.closure', answered(nb.closure) ? null : false, 2, 'f11fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F11_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F11_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F11_WEIGHTS.execution, execution),
    finalizeComponent('data', F11_WEIGHTS.data, data),
    finalizeComponent('modelling', F11_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F11_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f11.hypothesis', k >= 3 ? 'f11.questions' : '', answered(nb.contrastText) ? 'f11.contrastText' : '', answered(nb.closure) ? 'f11.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}

/** Lecturas válidas por tipo (para el panel del docente). */
export const validCountsF11 = (w: F11World) => ({
  pressure: validPressures(w).length, weight: validWeights(w).length, mass: validMasses(w).length, draft: validDrafts(w).length, floats: floatDrafts(w).length,
});
