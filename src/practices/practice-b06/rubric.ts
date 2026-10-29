/**
 * Rúbrica pura de B06 (§13): 15 % seguridad y conservación del equipo, 15 % preparaciones frescas, 20 % operación
 * óptica, 20 % observaciones comparativas, 15 % morfometría y razonamiento, 15 % libreta. Compara contra lo que el
 * estudiante pudo medir y el activo que realmente observó; las respuestas abiertas quedan `ok: null`. Una incidencia
 * de recursos (CEL-072…075) difiere el ítem afectado (`null`), nunca lo tacha; el 100X solo puntúa con el módulo.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { DivWorld } from '../../simulation/div-world/types';
import { mountUsable } from '../../simulation/specimens/mount-world';
import { b06StageEvidence, motilityDone } from './evidence';
import { capturedSpecimens, deferredSpecimens, obsSpecimen, observation, ownCaptures, twoMagnifications, validMarks } from './expected-results';
import { answeredCount, parseNum, type B06Notebook } from './notebook';

export const B06_WEIGHTS = { safety: 0.15, fresh: 0.15, optics: 0.2, observations: 0.2, morphometry: 0.15, notebook: 0.15 } as const;

const n = (w: DivWorld, k: string) => w.evidence[k] ?? 0;
const near = (a: number, b: number, rel = 0.01) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= rel * Math.max(1e-9, Math.abs(b));
const filled = (s: string) => (s ?? '').trim() !== '';

/**
 * Errores de la libreta (`nb:CEL-0NN`): lo escrito, clasificado o rotulado contrastado con la captura propia, la
 * medición importada, las marcas del mundo y lo que la técnica puede demostrar.
 */
export function notebookIssuesB06(w: DivWorld, nb: B06Notebook): string[] {
  const out: string[] = [];
  const oc = w.params.microscope.ocularX;
  // CEL-037: aumento total escrito igual al del objetivo (40 en vez de 400).
  const eo = observation(w, nb.epidermis.observationId);
  if (eo?.objectiveX && oc !== 1 && filled(nb.epidermis.totalMag) && parseNum(nb.epidermis.totalMag) === eo.objectiveX) out.push('nb:CEL-037');
  // CEL-043: glucógeno «confirmado» con Lugol en Euglena (la reserva es paramilón; el Lugol no la prueba).
  const eu = nb.protists.euglena;
  if (eu.reserve === 'glycogen' || (eu.reserve !== '' && eu.reserve !== 'unknown' && eu.reserveMethod === 'lugol')) out.push('nb:CEL-043');
  // CEL-062 / CEL-046: velocidades sin video con escala temporal (la biblioteca no tiene videos de protistas).
  const speeds = [nb.protists.euglena, nb.protists.paramecium].filter((p) => filled(p.speedUmS));
  if (speeds.length) out.push('nb:CEL-062');
  if (speeds.length === 2) out.push('nb:CEL-046');
  // CEL-070: fotosíntesis «demostrada» por el color.
  if (nb.protists.euglena.photosynthesisProven || nb.protists.paramecium.photosynthesisProven) out.push('nb:CEL-070');
  // Filas que importan capturas: autenticidad, captura válida, taxón y evidencia visible.
  const rows: Array<{ id: string | null; spec?: string; nucleus?: string; wall?: string }> = [
    ...nb.prep.filter((r) => r.specimen).map((r) => ({ id: r.observationId, spec: r.specimen })),
    ...nb.organisms.filter((r) => r.specimen).map((r) => ({ id: r.observationId, spec: r.specimen, nucleus: r.nucleus, wall: r.wall })),
    ...(['euglena', 'paramecium'] as const).filter((k) => filled(nb.protists[k].features)).map((k) => ({ id: nb.protists[k].observationId, spec: k })),
    ...(nb.epidermis.specimen ? [{ id: nb.epidermis.observationId, spec: nb.epidermis.specimen }] : []),
    ...(filled(nb.bacteria.shape) || nb.bacteria.nucleolus ? [{ id: nb.bacteria.observationId, spec: 'bacillus' }] : []),
    ...(nb.blood.cells.length ? [{ id: nb.blood.observationId, spec: 'blood' }] : []),
  ];
  for (const r of rows) {
    if (!r.id) {
      out.push('nb:CEL-071');
      continue;
    }
    const o = w.observations[r.id];
    if (!o) {
      out.push('nb:CEL-067');
      continue;
    }
    if (!o.isObservationValid) out.push('nb:CEL-065');
    const kind = obsSpecimen(w, o);
    if (r.spec && kind && r.spec !== kind) out.push('nb:CEL-047');
    if (r.nucleus === 'visible' && !o.visibleRegionIds.includes('nucleus')) out.push('nb:CEL-066');
    if (r.wall === 'visible' && !o.visibleRegionIds.includes('cellWall')) out.push('nb:CEL-066');
  }
  // CEL-069: procariota/eucariota invertidos.
  const domainWrong = (spec: string, d: string) => (d === 'prokaryote' && spec !== 'bacillus' && spec !== 'cyano') || (d === 'eukaryote' && (spec === 'bacillus' || spec === 'cyano'));
  if (nb.organisms.some((r) => r.specimen && domainWrong(r.specimen, r.cellType)) || nb.comparison.some((r) => r.specimen && domainWrong(r.specimen, r.domain))) out.push('nb:CEL-069');
  // CEL-061: un estoma rotulado como cloroplasto (marca del mundo sobre el poro).
  if (w.div.marks.some((m) => m.structure === 'chloroplasts' && (m.hit === 'stoma' || m.hit === 'guardCells') && m.verdict !== 'valid')) out.push('nb:CEL-061');
  // Morfometría: unidades, conversión, incertidumbre.
  for (const r of nb.morpho) {
    if (!filled(r.lengthUm)) continue;
    if (!r.unit) out.push('nb:CEL-063');
    if (filled(r.lengthMm) && !near(parseNum(r.lengthMm) * 1000, parseNum(r.lengthUm))) out.push('nb:CEL-064');
    if (w.div.scale.available && r.measurementId && !(parseNum(r.uncertaintyUm) > 0)) out.push('nb:CEL-068');
    if (!r.measurementId && !r.observationId) out.push('nb:CEL-071');
  }
  return [...new Set(out)];
}

const firstOf = (w: DivWorld, codes: string[], fallback: string, issues: string[] = []) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b06fb.${c}` : `b06fb.${fallback}`;
};

export function evaluateB06(w: DivWorld, nb: B06Notebook): Evaluation {
  const flags = b06StageEvidence(w, nb);
  const issues = notebookIssuesB06(w, nb);
  const has = (...ks: string[]) => ks.some((k) => issues.includes(`nb:${k}`));
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const deferred = deferredSpecimens(w);
  const C = (...xs: number[]) => xs.map((x) => `CEL-${String(x).padStart(3, '0')}`);

  // ── Seguridad y conservación del equipo (15) ──
  let safety = [
    item('b06.ppe', flags.ppe && errs('CEL-001') === 0 ? true : flags.ppe ? null : false, 3, firstOf(w, C(1), 'ppe'), undefined, 0.5),
    item('b06.biosafety', errs(...C(2, 5, 6)) === 0, 3, firstOf(w, C(5, 6, 2), 'biosafety')),
    item('b06.sharps', errs(...C(3, 4, 8, 17)) === 0 && w.shards === 0, 3, firstOf(w, C(4, 3, 8, 17), 'sharps')),
    item('b06.equipment', errs(...C(7, 9, 28, 29, 38)) === 0, 3, firstOf(w, C(7, 28, 29, 9, 38), 'equipment')),
    item('b06.closure', flags.safeParked && flags.benchRestored && errs(...C(10, 52, 59)) === 0, 3, firstOf(w, C(10, 52, 59), 'closure')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b06fb.incident' }));

  // ── Preparaciones frescas (15) ──
  const ownMounts = Object.values(w.mounts).filter((m) => m.cell?.zones.some((z) => !z.premade));
  const freshKinds = ['tradescantia', 'buccal', 'paramecium', 'euglena', 'elodea'] as const;
  const done = freshKinds.filter((k) => deferred.includes(k) || ownMounts.some((m) => m.cell!.zones[0]?.kind === k && mountUsable(w.params.mount, m))).length;
  const buccalOk = ownCaptures(w, 'buccal').some((o) => (w.mounts[o.slideId ?? '']?.cell?.stainMl['methylene-blue'] ?? 0) > 0);
  const fresh = [
    item('b06.mounts', done >= 4, 5, 'b06fb.mounts', { n: done }, Math.min(1, done / 4) * 0.6),
    item('b06.mountTechnique', ownMounts.length > 0 && errs(...C(11, 12, 14, 15, 16)) === 0, 4, firstOf(w, C(11, 14, 15, 16, 12), 'mountTechnique')),
    item('b06.smear', buccalOk && errs('CEL-018') === 0, 3, firstOf(w, C(18), 'smear')),
    item('b06.identity', ownMounts.length > 0 && errs(...C(13, 19, 20, 22)) === 0, 3, firstOf(w, C(20, 13, 19, 22), 'identity')),
  ];

  // ── Operación óptica (20) ──
  const both = capturedSpecimens(w).filter((k) => twoMagnifications(w, k)).length;
  const optics = [
    item('b06.magnifications', both >= 4, 6, 'b06fb.magnifications', { n: both }, Math.min(1, both / 4) * 0.6),
    item('b06.clip', !!w.evidence.slideClamped && errs(...C(23, 24, 36)) === 0, 3, firstOf(w, C(23, 24, 36), 'clip')),
    item('b06.focus', both > 0 && errs(...C(25, 30, 34, 35)) === 0, 4, firstOf(w, C(25, 34, 35, 30), 'focus')),
    item('b06.light', both > 0 && errs(...C(31, 32, 33)) === 0, 3, firstOf(w, C(31, 33, 32), 'light')),
  ];
  if (w.div.immersion) {
    const oil100 = ownCaptures(w, 'bacillus').some((o) => o.objectiveX === 100);
    optics.push(item('b06.immersion', oil100 && errs(...C(26, 27, 53)) === 0, 4, firstOf(w, C(26, 27, 53), 'immersion')));
  } else optics.push(item('b06.objectives', errs('CEL-039') === 0, 4, firstOf(w, C(39), 'objectives')));

  // ── Observaciones comparativas (20) ──
  const protDeferred = deferred.includes('paramecium') && deferred.includes('euglena');
  const protOk = (['paramecium', 'euglena'] as const).every((k) => deferred.includes(k) || (ownCaptures(w, k).length > 0 && motilityDone(w, k)));
  const stomaOk = validMarks(w, 'stoma', 'tradescantia').length > 0 || (w.cell.variants?.blurStomata && ownCaptures(w, 'tradescantia').length > 0 && nb.epidermis.stoma === 'inferred');
  const observations = [
    item('b06.bacteria', validMarks(w, 'bacilli', 'bacillus').length > 0 && errs('CEL-054') === 0, 4, firstOf(w, C(54, 50, 51), 'bacteria')),
    item('b06.protists', protDeferred ? null : protOk && errs(...C(40, 41, 42, 44, 45, 48, 49)) === 0, 5, protDeferred ? 'b06fb.deferred' : firstOf(w, C(42, 45, 40, 41, 44, 48, 49), 'protists')),
    item('b06.plant', !!stomaOk && validMarks(w, 'chloroplasts', 'elodea').length > 0 && !has('CEL-061'), 4, firstOf(w, C(61, 21), 'plant', issues)),
    item('b06.blood', deferred.includes('blood') ? null : validMarks(w, 'erythrocyte', 'blood').length > 0 && validMarks(w, 'leukocyte', 'blood').length > 0 && errs(...C(56, 57, 58, 60)) === 0, 4, deferred.includes('blood') ? 'b06fb.deferred' : firstOf(w, C(56, 57, 58, 60), 'blood')),
    item('b06.buccal', validMarks(w, 'nucleus', 'buccal').length > 0, 3, 'b06fb.buccal'),
  ];

  // ── Morfometría y razonamiento (15) ──
  const oc = w.params.microscope.ocularX;
  const eo = observation(w, nb.epidermis.observationId);
  const magOk = !!eo?.objectiveX && parseNum(nb.epidermis.totalMag) === oc * eo.objectiveX;
  const linkedRows = nb.morpho.filter((r) => r.measurementId && w.div.measurements.some((m) => m.id === r.measurementId));
  const measureOk = linkedRows.some((r) => {
    const m = w.div.measurements.find((x) => x.id === r.measurementId)!;
    return r.unit === 'um' && near(parseNum(r.lengthUm), m.lengthUm) && near(parseNum(r.uncertaintyUm), m.uncertaintyUm, 0.05);
  });
  const noScale = !w.div.scale.available;
  const morphometry = [
    item('b06.magnification', magOk && !has('CEL-037'), 3, has('CEL-037') ? 'b06fb.CEL-037' : 'b06fb.magnification'),
    item('b06.measure', noScale ? (errs('CEL-055') ? false : null) : measureOk && !has('CEL-063', 'CEL-064', 'CEL-068') && errs('CEL-055') === 0, 5, noScale && !errs('CEL-055') ? 'b06fb.noScale' : firstOf(w, C(55, 63, 64, 68), 'measure', issues)),
    item('b06.prokaryote', nb.bacteria.nucleolus === 'absent' && errs('CEL-054') === 0 && !has('CEL-069'), 4, firstOf(w, C(54, 69), 'prokaryote', issues)),
    item('b06.speed', !has('CEL-046', 'CEL-062'), 3, firstOf(w, C(62, 46), 'speed', issues)),
  ];

  // ── Libreta, rotulación y conclusiones (15) ──
  const orgRows = nb.organisms.filter((r) => observation(w, r.observationId)?.isObservationValid && r.specimen && r.cellType).length;
  const k = answeredCount(nb);
  const notebook = [
    item('b06.records', orgRows >= 4 && !has('CEL-047', 'CEL-065', 'CEL-067', 'CEL-071'), 4, firstOf(w, C(67, 65, 47, 71), 'records', issues), { n: orgRows }),
    item('b06.interpretation', nb.comparison.filter((r) => r.specimen && r.domain && r.evidence).length >= 3 && !has('CEL-043', 'CEL-066', 'CEL-069', 'CEL-070'), 4, firstOf(w, C(43, 66, 69, 70), 'interpretation', issues)),
    item('b06.open', nb.open.limitations.trim().length > 5 ? null : false, 3, 'b06fb.open', undefined, 0.5),
    item('b06.answers', k >= 5 ? null : false, 4, 'b06fb.answers', { n: k }, Math.min(1, k / 8) * 0.6),
  ];

  const components = [
    finalizeComponent('safety', B06_WEIGHTS.safety, safety),
    finalizeComponent('fresh', B06_WEIGHTS.fresh, fresh),
    finalizeComponent('optics', B06_WEIGHTS.optics, optics),
    finalizeComponent('observations', B06_WEIGHTS.observations, observations),
    finalizeComponent('morphometry', B06_WEIGHTS.morphometry, morphometry),
    finalizeComponent('notebook', B06_WEIGHTS.notebook, notebook),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
