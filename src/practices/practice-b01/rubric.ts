/**
 * Rúbrica pura de B01 (§13): 15 % seguridad, 20 % preparación fresca, 25 % microscopio, 10 % láminas fijas,
 * 10 % estereoscopio, 20 % libreta. Usa las observaciones y los hechos del intento; las respuestas abiertas quedan
 * `ok: null` (revisión docente). Un accidente consumado anula SOLO el componente de seguridad.
 */
import type { OpticalWorld } from '../../simulation/optical-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { MICROSCOPE_PARTS } from '../../simulation/instruments/optical/microscope-types';
import { STEREO_PARTS } from '../../simulation/instruments/optical/stereo-types';
import { mountUsable } from '../../simulation/specimens/mount-world';
import { b01StageEvidence } from './evidence';
import { expectedFovMm, expectedMagnification, fixedCaptures, freshObjectives, observation, specimenFamily, stereoCaptures } from './expected-results';
import { answeredCount, parseNum, type B01Notebook } from './notebook';

export const B01_WEIGHTS = { safety: 0.15, prep: 0.2, compound: 0.25, fixed: 0.1, stereo: 0.1, notebook: 0.2 } as const;

const n = (w: OpticalWorld, k: string) => w.evidence[k] ?? 0;
const near = (a: number, b: number, rel = 0.02) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

/** Errores de la libreta (`nb:E60`–`nb:E62`): cálculos y rotulados contrastados con las observaciones propias. */
export function notebookIssuesB01(w: OpticalWorld, nb: B01Notebook): string[] {
  const out: string[] = [];
  const oc = w.params.microscope.ocularX;
  const rows = [...nb.micro.map((r) => ({ id: r.observationId, mag: r.totalMag, spec: r.specimen, st: r.structures })), ...nb.fixed.map((r) => ({ id: r.observationId, mag: '', spec: 'fixed' as const, st: [] }))];
  for (const r of rows) {
    const o = observation(w, r.id);
    if (!o) continue;
    const m = parseNum(r.mag);
    if (o.objectiveX && Number.isFinite(m) && near(m, oc + o.objectiveX, 0.001) && !near(m, oc * o.objectiveX, 0.001)) out.push('nb:E60');
    if (r.st.some((s) => !o.visibleRegionIds.includes(s))) out.push('nb:E61');
    if (r.spec && r.spec !== specimenFamily(w, o)) out.push('nb:E62');
  }
  for (const [k, x] of [['mag4', 4], ['mag10', 10], ['mag40', 40]] as const) {
    const m = parseNum(nb.calc[k]);
    if (Number.isFinite(m) && near(m, oc + x, 0.001) && !near(m, oc * x, 0.001)) out.push('nb:E60');
  }
  for (const [key, row] of [['leaf', nb.stereo.leaf], ['insect', nb.stereo.insect]] as const) {
    const o = observation(w, row.observationId);
    if (!o) continue;
    if (row.structures.some((s) => !o.visibleRegionIds.includes(s))) out.push('nb:E61');
    if (specimenFamily(w, o) !== key) out.push('nb:E62');
  }
  if (nb.prep.specimen && nb.prep.specimen !== 'elodea') out.push('nb:E62');
  return [...new Set(out)];
}

const firstOf = (w: OpticalWorld, codes: string[], fallback: string) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0);
  return c ? `b01fb.${c}` : `b01fb.${fallback}`;
};

export function evaluateB01(w: OpticalWorld, nb: B01Notebook): Evaluation {
  const flags = b01StageEvidence(w, nb);
  const issues = notebookIssuesB01(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `E${String(a + i).padStart(2, '0')}`);

  // ── Seguridad y montaje seguro del área (15) ──
  let safety = [
    item('b01.ppe', flags.ppe && errs('E68') === 0 ? true : flags.ppe ? null : false, 3, 'b01fb.E68', undefined, 0.5),
    item('b01.safetyInspect', flags.safetyInspected, 2, 'b01fb.safetyInspect'),
    item('b01.noCollision', errs('E20', 'E21', 'E22', 'E39') === 0, 4, firstOf(w, ['E21', 'E22', 'E20', 'E39'], 'noCollision')),
    item('b01.glass', errs('E11', 'E65') === 0 && w.shards === 0 && w.benchSpillMl < 0.005, 3, firstOf(w, ['E11', 'E65'], 'glass')),
    item('b01.closing', flags.safeParked && flags.benchRestored && errs('E64', 'E66', 'E67') === 0, 3, firstOf(w, ['E64', 'E66', 'E67'], 'closing')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b01fb.incident' }));

  // ── Preparación de la muestra fresca (20) ──
  const mount = Object.values(w.mounts).find((m) => m.specimenId);
  const usableNow = !!mount && mountUsable(w.params.mount, mount);
  const prep = [
    item('b01.mount', flags.mountUsable && usableNow ? true : flags.mountUsable ? null : false, 6, firstOf(w, ['E09', 'E10', 'E07', 'E06'], 'mount'), undefined, 0.5),
    item('b01.fragment', !!mount && errs('E02', 'E03', 'E04', 'E05') === 0, 4, firstOf(w, ['E02', 'E03', 'E04', 'E05'], 'fragment')),
    item('b01.liquid', !!mount && errs('E06', 'E07', 'E08', 'E12', 'E14') === 0, 4, firstOf(w, ['E06', 'E07', 'E08', 'E12', 'E14'], 'liquid')),
    item('b01.cover', !!mount?.coverId && errs('E09', 'E10', 'E11') === 0, 3, firstOf(w, ['E09', 'E10', 'E11'], 'cover')),
    item('b01.clean', !!mount && errs('E01', 'E13') === 0, 3, firstOf(w, ['E01', 'E13'], 'clean')),
  ];

  // ── Uso del microscopio (25) ──
  const objs = freshObjectives(w);
  const compound = [
    item('b01.magnifications', flags.freshObserved, 7, 'b01fb.magnifications', { n: objs.length }),
    item('b01.clip', !!w.evidence.slideClamped && errs('E15', 'E16', 'E17', 'E38') === 0, 3, firstOf(w, ['E15', 'E16', 'E17', 'E38'], 'clip')),
    item('b01.focus', flags.freshObserved && errs('E23', 'E24', 'E25', 'E35', 'E36') === 0, 5, firstOf(w, ['E35', 'E36', 'E23', 'E24', 'E25'], 'focus')),
    item('b01.lowFirst', objs.includes(4) && errs('E18', 'E19', 'E32') === 0, 3, firstOf(w, ['E18', 'E19', 'E32'], 'lowFirst')),
    item('b01.light', flags.freshObserved && errs('E26', 'E27', 'E28', 'E29', 'E30', 'E31') === 0, 4, firstOf(w, range(26, 31), 'light')),
    item('b01.stage', flags.freshObserved && errs('E33', 'E34', 'E37') === 0, 3, firstOf(w, ['E33', 'E34', 'E37'], 'stage')),
  ];

  // ── Láminas fijas (10) ──
  const fixed = [
    item('b01.fixedObserved', flags.fixedObserved && errs('E40', 'E47') === 0, 5, firstOf(w, ['E40', 'E47'], 'fixedObserved')),
    item('b01.fixedHandling', fixedCaptures(w).length > 0 && errs('E41', 'E42', 'E43', 'E46') === 0, 2, firstOf(w, ['E41', 'E42', 'E43', 'E46'], 'fixedHandling')),
    item('b01.fixedReturned', flags.fixedReturned && errs('E44', 'E45') === 0, 3, firstOf(w, ['E44', 'E45'], 'fixedReturned')),
  ];

  // ── Estereoscopio (10) ──
  const both = w.assignment.stereoSampleIds.filter((id) => stereoCaptures(w, id).length > 0).length;
  const stereo = [
    item('b01.stereoObserved', flags.stereoObserved, 4, 'b01fb.stereoObserved', { n: both }),
    item('b01.stereoTechnique', both > 0 && errs(...range(48, 57)) === 0, 4, firstOf(w, range(48, 57), 'stereoTechnique')),
    item('b01.stereoReturned', flags.samplesReturned && errs('E58', 'E59') === 0, 2, firstOf(w, ['E58', 'E59'], 'stereoReturned')),
  ];

  // ── Libreta, cálculos y análisis (20) ──
  const oc = w.params.microscope.ocularX;
  const calcOk = [4, 10, 40].every((x) => near(parseNum(nb.calc[`mag${x}` as 'mag4']), expectedMagnification(w, x)));
  const fovOk = [4, 10, 40].every((x) => near(parseNum(nb.calc[`fov${x}` as 'fov4']), expectedFovMm(w, x), 0.03));
  const rowsOk = nb.micro.filter((r) => {
    const o = observation(w, r.observationId);
    return !!o?.isObservationValid && !!o.objectiveX && near(parseNum(r.totalMag), oc * o.objectiveX, 0.001);
  }).length;
  const partsDone = MICROSCOPE_PARTS.filter((p) => nb.parts[p].function.trim().length > 3).length + STEREO_PARTS.filter((p) => nb.stereoParts[p].function.trim().length > 3).length;
  const k = answeredCount(nb);
  const notebook = [
    item('b01.calc', calcOk && fovOk && !has('E60'), 4, has('E60') ? 'b01fb.E60' : 'b01fb.calc'),
    item('b01.records', rowsOk >= w.params.requiredMagnifications && !has('E62'), 4, has('E62') ? 'b01fb.E62' : 'b01fb.records', { n: rowsOk }),
    item('b01.structures', nb.micro.some((r) => r.structures.length > 0) && !has('E61'), 3, has('E61') ? 'b01fb.E61' : 'b01fb.structures'),
    item('b01.parts', partsDone >= 10, 3, 'b01fb.parts', { n: partsDone }),
    item('b01.answers', k >= 4 ? null : false, 4, 'b01fb.answers', { n: k }, Math.min(1, k / 7) * 0.6),
    item('b01.reflection', nb.incidents.consequence.trim().length > 10 && nb.comparison.purpose.trim().length > 10 ? null : false, 2, 'b01fb.reflection', undefined, 0.5),
  ];

  const components = [
    finalizeComponent('safety', B01_WEIGHTS.safety, safety),
    finalizeComponent('prep', B01_WEIGHTS.prep, prep),
    finalizeComponent('compound', B01_WEIGHTS.compound, compound),
    finalizeComponent('fixed', B01_WEIGHTS.fixed, fixed),
    finalizeComponent('stereo', B01_WEIGHTS.stereo, stereo),
    finalizeComponent('notebook', B01_WEIGHTS.notebook, notebook),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
