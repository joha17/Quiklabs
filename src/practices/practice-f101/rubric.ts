/**
 * Evaluación por evidencia de F101 (§13): seguridad y montaje 15, operación directa de instrumentos 20, ejecución
 * física y control experimental 20, datos e incertidumbre 15, modelización y cálculos 20, análisis y libreta 10.
 * `evaluateF101` es pura: el Worker la recalcula desde la semilla y la cinta. Los cálculos se comparan con lo que
 * corresponde a las lecturas del propio estudiante; las respuestas abiertas quedan para revisión docente (`ok: null`).
 * Un accidente consumado (probeta rota, masas caídas, resorte suelto) anula solo el componente de seguridad.
 */
import type { F101World } from '../../simulation/f101-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { decimalsOf } from '../../simulation/models/f101/uncertainty';
import { angleDiffDeg } from '../../simulation/models/f101/equations';
import { f101StageEvidence } from './evidence';
import { cellValue, dimReadings, expectedDensity, expectedDim, expectedVectors } from './expected-results';
import { DIMS, answered, answeredCount, isNum, parseNum, type F101Notebook } from './notebook';

const n = (w: F101World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !(s ?? '').trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;

export const F101_WEIGHTS = { safety: 0.15, instruments: 0.2, execution: 0.2, data: 0.15, modelling: 0.2, analysis: 0.1 } as const;

/** Errores de cálculo y de registro detectados en la libreta (`nb:Exx`). */
export function notebookIssuesF101(w: F101World, nb: F101Notebook): string[] {
  const out: string[] = [];
  const ev = expectedVectors(w, nb);
  const g = w.params.g;
  // E14 y E15: componentes y módulo de cada fuerza.
  nb.vectors.forEach((row, i) => {
    const f = ev.forces[i];
    if (!Number.isFinite(f?.F)) return;
    const Fx = parseNum(row.Fx);
    const Fy = parseNum(row.Fy);
    const s = Math.sin((f.theta * Math.PI) / 180);
    const c = Math.cos((f.theta * Math.PI) / 180);
    const tol = Math.max(0.02, Math.abs(f.F) * 0.02);
    const swapped = Number.isFinite(Fx) && Number.isFinite(Fy) && Math.abs(Fx - f.F * s) < tol && Math.abs(Fy - f.F * c) < tol && Math.abs(s - c) > 0.1;
    if (swapped) out.push('nb:E14');
    const m = parseNum(row.mass.value);
    const F = parseNum(row.F);
    if (Number.isFinite(F) && Number.isFinite(m) && m > 0 && (near(F, m, 0.01) || near(F, m / 1000, 0.01)) && !near(F, (m / 1000) * g, 0.05)) out.push('nb:E15');
  });
  // E16: repeticiones de una dimensión en unidades distintas.
  for (const d of DIMS) {
    const xs = nb.dims[d].map((e) => cellValue(w, e)).filter((x) => Number.isFinite(x) && x > 0);
    if (xs.some((a) => xs.some((b) => near(a * 10, b, 0.05)))) out.push('nb:E16');
  }
  const ed = expectedDensity(w, nb);
  // E17: densidad sin incertidumbre.
  if (isNum(nb.calc.rho.value) && !isNum(nb.calc.rho.uncertainty)) out.push('nb:E17');
  // E18 y E38: incertidumbre de las medias.
  for (const d of DIMS) {
    const e = expectedDim(w, nb, d);
    const u = parseNum(nb.means[d].uncertainty);
    if (!Number.isFinite(u) || e.xs.length < 2) continue;
    const divided = e.uB / Math.sqrt(e.xs.length);
    if (near(u, divided, 0.12) && !near(u, e.u, 0.12)) out.push('nb:E18');
    else if (u < e.uB * 0.95) out.push('nb:E38');
  }
  // E31: datos brutos escritos sin importar de una lectura.
  const raw = [...DIMS.flatMap((d) => nb.dims[d]), nb.masses.cyl, nb.masses.ball, nb.volumes.initial, nb.volumes.final, nb.zeros.caliper, nb.zeros.micrometer];
  if (raw.some((e) => e.value.trim() && !e.readingId)) out.push('nb:E31');
  // E33: filas de vectores de otro registro, o contraste tomado antes del equilibrio que se analiza.
  const q = nb.equilibriumId ? w.readings[nb.equilibriumId] : null;
  if (nb.vectors.some((r) => r.mass.readingId && r.mass.readingId !== nb.equilibriumId)) out.push('nb:E33');
  const ct = nb.contrastId ? w.readings[nb.contrastId] : null;
  if (q && ct && ct.t < q.t) out.push('nb:E33');
  // E34: conversiones.
  const rhoSI = parseNum(nb.calc.rhoSI.value);
  if (Number.isFinite(rhoSI) && Number.isFinite(ed.rho) && [100, 1e6, 1e-3, 1].some((k) => near(rhoSI, ed.rho * k, 0.01)) && !near(rhoSI, ed.rhoSI, 0.01)) out.push('nb:E34');
  const vG = parseNum(nb.calc.volGeom.value);
  if (Number.isFinite(vG) && (near(vG, ed.V * 1000, 0.02) || near(vG, ed.V / 1000, 0.02))) out.push('nb:E34');
  // E35: medias redondeadas por debajo de la resolución.
  for (const d of DIMS) {
    const s = nb.means[d].value;
    if (isNum(s) && nb.dims[d].some((e) => e.value.trim() || e.readingId) && decimalsOf(s) < 2) out.push('nb:E35');
  }
  // E36: resultante con el ángulo de la equilibrante.
  const tR = parseNum(nb.vec.thetaR);
  if (Number.isFinite(tR) && Number.isFinite(ev.thetaR) && Math.abs(angleDiffDeg(tR, ev.equilibrant)) < 3) out.push('nb:E36');
  // E37: menos de tres repeticiones válidas por dimensión cuando ya se calcula.
  if (isNum(nb.calc.volGeom.value) && DIMS.some((d) => dimReadings(w, d).length < 3)) out.push('nb:E37');
  return [...new Set(out)];
}

/** Fracción de los datos brutos importados desde lecturas (trazabilidad). */
export function importedFractionF101(nb: F101Notebook): number {
  const cells = [...DIMS.flatMap((d) => nb.dims[d]), nb.masses.cyl, nb.masses.ball, nb.volumes.initial, nb.volumes.final];
  return cells.filter((c) => !!c.readingId).length / cells.length;
}

export function evaluateF101(w: F101World, nb: F101Notebook): Evaluation {
  const flags = f101StageEvidence(w, nb);
  const issues = notebookIssuesF101(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const err = (...codes: string[]) => codes.filter((c) => n(w, `err:${c}`) > 0);
  const accident = n(w, 'err:E40') > 0 || !!w.evidence.cylinderReplaced;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('f101.accident', false, 15, 'f101fb.accident')]
    : [
      item('f101.ppe', flags.ppeReady && ppeErrs === 0, 4, 'f101fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('f101.drop', !err('E09').length, 3, 'f101fb.E09'),
      item('f101.masses', !err('E20', 'E19').length, 3, `f101fb.${err('E20', 'E19')[0] ?? 'E20'}`),
      item('f101.bench', w.water.benchMl < 0.05, 2, 'f101fb.bench'),
      item('f101.closed', flags.stationClosed, 3, 'f101fb.closed'),
    ];

  const instE = (codes: string[], key: string, max: number, gate = true) => {
    const e = err(...codes);
    return item(`f101.${key}`, gate && e.length === 0, max, `f101fb.${e[0] ?? key}`);
  };
  const instruments = [
    item('f101.inspected', flags.instrumentsInspected, 2, 'f101fb.inspected'),
    instE(['E01', 'E21'], 'zeros', 4, flags.zerosChecked),
    instE(['E02', 'E03'], 'caliper', 4, flags.cylDiameterRepeats),
    instE(['E04', 'E05'], 'micrometer', 3, flags.ballDiameterRepeats),
    instE(['E06', 'E10', 'E29'], 'reading', 3),
    instE(['E22', 'E23', 'E24', 'E27'], 'sensor', 2, flags.contrast),
    instE(['E25', 'E26'], 'lineOfSight', 2),
  ];

  const execution = [
    item('f101.standard', flags.standardMeasured, 2, 'f101fb.standard'),
    item('f101.dimensions', flags.cylDiameterRepeats && flags.cylHeightRepeats && flags.ballDiameterRepeats, 3, 'f101fb.dimensions'),
    instE(['E07', 'E08', 'E30'], 'massVolume', 4, flags.cylMass && flags.ballMass && flags.volumeFinal),
    instE(['E11', 'E12', 'E13', 'E28'], 'equilibrium', 5, flags.equilibrium),
    instE(['E32', 'E39'], 'control', 3),
    item('f101.contrast', flags.contrast, 3, 'f101fb.contrast'),
  ];

  const importedF = importedFractionF101(nb);
  const dataIssues = ['E16', 'E18', 'E35', 'E37', 'E38'].filter(has);
  const data = [
    item('f101.traceable', importedF >= 0.9 && !has('E31') ? true : importedF >= 0.5 ? null : false, 4, 'f101fb.E31', { pct: Math.round(importedF * 100) }, importedF),
    item('f101.repeats', flags.cylDiameterRepeats && !has('E37'), 3, 'f101fb.E37'),
    item('f101.units', !has('E16'), 2, 'f101fb.E16'),
    item('f101.uncertainty', DIMS.every((d) => isNum(nb.means[d].uncertainty)) && !has('E18') && !has('E38'), 4, `f101fb.${['E18', 'E38'].find(has) ?? 'uncertainty'}`),
    item('f101.resolution', !has('E35'), 2, dataIssues.length ? `f101fb.${dataIssues[0]}` : 'f101fb.E35'),
  ];

  const ed = expectedDensity(w, nb);
  const ev = expectedVectors(w, nb);
  const C = nb.calc;
  const V = nb.vec;
  const rowsOk = nb.vectors.every((r, i) => !Number.isFinite(ev.forces[i]?.F) || (close(r.Fx, ev.forces[i].x, 0.02, 0.01) && close(r.Fy, ev.forces[i].y, 0.02, 0.01)));
  const modelling = [
    item('f101.volGeom', close(C.volGeom.value, ed.V, 0.004) && !has('E34'), 3, `f101fb.${has('E34') ? 'E34' : 'volGeom'}`),
    item('f101.rho', close(C.rho.value, ed.rho, 0.006), 3, 'f101fb.rho', { rho: Number.isFinite(ed.rho) ? ed.rho.toFixed(3) : '—' }),
    item('f101.uRho', close(C.rho.uncertainty, ed.urho, 0.35) && !has('E17'), 3, `f101fb.${has('E17') ? 'E17' : 'uRho'}`),
    item('f101.rhoSI', close(C.rhoSI.value, ed.rhoSI, 0.006), 1, 'f101fb.E34'),
    item('f101.components', !!nb.equilibriumId && rowsOk && !has('E14') && !has('E15'), 4, `f101fb.${['E14', 'E15'].find(has) ?? 'components'}`),
    item('f101.resultant', close(V.R, ev.Rmag, 0.02, 0.01) && Number.isFinite(parseNum(V.thetaR)) && Math.abs(angleDiffDeg(parseNum(V.thetaR), ev.thetaR)) <= 2 && !has('E36'), 3, `f101fb.${has('E36') ? 'E36' : 'resultant'}`),
    item('f101.products', close(V.dot12, ev.dot12, 0.03, 0.01) && close(V.cross12, ev.cross12, 0.03, 0.01), 2, 'f101fb.products'),
    item('f101.relErr', close(C.relErr.value, ed.relErr, 0.1, 0.3) || close(C.relErr.value, -ed.relErr, 0.1, 0.3), 1, 'f101fb.relErr'),
  ];

  const k = answeredCount(nb);
  const analysis = [
    item('f101.hypothesis', answered(nb.hypothesis.question) || answered(nb.hypothesis.prediction) ? null : false, 2, 'f101fb.hypothesis', undefined, 0.6),
    item('f101.questions', k >= 3 ? null : false, 4, 'f101fb.questions', { n: k }, (k / 4) * 0.6),
    item('f101.contrastText', answered(nb.contrastText) ? null : false, 2, 'f101fb.contrastText', undefined, 0.6),
    item('f101.closure', answered(nb.closure) ? null : false, 2, 'f101fb.closure', undefined, 0.6),
  ];

  const components = [
    finalizeComponent('safety', F101_WEIGHTS.safety, safety),
    finalizeComponent('instruments', F101_WEIGHTS.instruments, instruments),
    finalizeComponent('execution', F101_WEIGHTS.execution, execution),
    finalizeComponent('data', F101_WEIGHTS.data, data),
    finalizeComponent('modelling', F101_WEIGHTS.modelling, modelling),
    finalizeComponent('analysis', F101_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = ['f101.hypothesis', k >= 3 ? 'f101.questions' : '', answered(nb.contrastText) ? 'f101.contrastText' : '', answered(nb.closure) ? 'f101.closure' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}
