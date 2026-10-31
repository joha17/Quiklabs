/**
 * Rúbrica pura de B08 (§13): 15 % seguridad, 15 % diseño, 20 % luz/oscuridad, 15 % DIC–BTB, 20 % pigmentos, 15 % cálculos y
 * conclusiones. Califica contra las lecturas PROPIAS, no contra un ideal. Sin calibración o con un recurso ausente el ítem
 * queda en `null` (revisión), nunca tachado. Un módulo no asignado se excluye y los pesos se reparten antes de empezar.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { BTB, TUBES, bandsOf } from '../../simulation/photo-world/world';
import { grossEstimate } from '../../simulation/photosynthesis/photokinetics';
import { rfOf } from '../../simulation/photosynthesis/paper-chromatography';
import { b08StageEvidence } from './evidence';
import { answeredCount, parseNum, type B08Notebook } from './notebook';
import { NB_CODES_B08 } from './error-scenarios';

export const B08_WEIGHTS = { safety: 0.15, design: 0.15, gas: 0.2, btb: 0.15, pigments: 0.2, reporting: 0.15 } as const;

const code = (x: number) => `FOT-${String(x).padStart(2, '0')}`;
const filled = (s: string) => (s ?? '').trim() !== '';
const close = (a: number, b: number, abs = 0.05) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= abs;
const rd = (w: PhotoWorld, id: string | null) => (id ? w.photo.readings.find((r) => r.id === id) ?? null : null);

/** Errores de la libreta (`nb:FOT-NN`): lo escrito contrastado con la lectura propia y lo que el método demuestra. */
export function notebookIssuesB08(w: PhotoWorld, nb: B08Notebook): string[] {
  const out = new Set<string>();
  const add = (x: number) => {
    if (NB_CODES_B08.includes(x)) out.add(`nb:${code(x)}`);
  };
  const p = w.params.photo!;
  for (const r of nb.gas) {
    const f = rd(w, r.finalId);
    const b = rd(w, r.baselineId);
    if ((f && f.target !== r.tubeId) || (b && b.target !== r.tubeId)) add(17);
    if (filled(r.radiusMm) && w.photo.radiusCertified && !close(parseNum(r.radiusMm), p.capillaryRadiusCm * 10, 0.005)) add(23);
    if (filled(r.slope) && r.slopeUnit === 'umol/min') add(24);
    if (p.gasProfile === 'realistic' && filled(r.umol) && !nb.gross.humidityCorrected) add(25);
    if (filled(r.hours) && close(parseNum(r.hours), 0.167, 0.01)) add(68);
    if ((filled(r.slope) && !r.slopeUnit) || (filled(r.dvMl) && !filled(r.radiusMm) && !r.noCalibration)) add(72);
  }
  if (nb.claims.btbMeasuresGlucose) add(31);
  for (const r of nb.btb) {
    const a = rd(w, r.readingId0);
    const z = rd(w, r.readingIdEnd);
    if ((a && filled(r.color0) && a.color !== r.color0) || (z && filled(r.colorEnd) && z.color !== r.colorEnd)) add(35);
  }
  for (const r of nb.bands) {
    const cen = rd(w, r.readingId);
    const fr = rd(w, r.frontReadingId);
    const o = w.photo.paper.originMm ?? 0;
    if (cen && filled(r.dBand) && close(parseNum(r.dBand), cen.value, 0.5) && o > 0.5) add(57);
    if (filled(r.rf) && parseNum(r.rf) > 1 && !r.anomaly) add(58);
    if (fr && fr.kind !== 'front') add(75);
    if (filled(r.dFront) && cen && close(parseNum(r.dFront), cen.value - o, 0.5)) add(75);
  }
  if (nb.claims.identityFromColor) add(59);
  if (filled(nb.gross.gross)) {
    const net = parseNum(nb.gross.net);
    const dark = parseNum(nb.gross.dark);
    if (Number.isFinite(net) && Number.isFinite(dark) && !close(parseNum(nb.gross.gross), grossEstimate(net, dark), Math.max(0.01, 0.03 * Math.abs(net) + 0.01))) add(69);
    if (!filled(nb.gross.unit)) add(72);
  }
  if (nb.claims.absentPigment) add(70);
  if (nb.claims.dicIsFreeCo2) add(73);
  if (nb.claims.darkEqualsLightResp || (filled(nb.gross.gross) && !nb.gross.assumptionStated)) add(74);
  if (nb.claims.photoAsMetric) add(76);
  return [...out];
}

export function evaluateB08(w: PhotoWorld, nb: B08Notebook): Evaluation {
  const flags = b08StageEvidence(w, nb);
  const issues = notebookIssuesB08(w, nb);
  const hasNb = (...xs: number[]) => xs.some((x) => issues.includes(`nb:${code(x)}`));
  const n = (k: string) => w.evidence[k] ?? 0;
  const errs = (...xs: number[]) => xs.reduce((s, x) => s + n(`err:${code(x)}`), 0);
  const firstOf = (xs: number[], fallback: string) => {
    const c = xs.map(code).find((k) => n(`err:${k}`) > 0 || issues.includes(`nb:${k}`));
    return c ? `b08fb.${c}` : `b08fb.${fallback}`;
  };
  const m = w.photo;
  const mods = m.modules;
  const calibrated = m.radiusCertified;

  // ── Seguridad, organización y cierre (15) ──
  let safety = [
    item('b08.ppe', flags.ppe && errs(60) === 0, 4, firstOf([60], 'ppe')),
    item('b08.hood', errs(61, 62, 63) === 0, 5, firstOf([62, 61, 63], 'hood')),
    item('b08.closure', flags.safeParked && flags.benchRestored && errs(64, 65, 66, 67) === 0, 6, firstOf([64, 65, 66, 67], 'closure')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b08fb.incident' }));

  // ── Diseño de controles (15) ──
  const prepOk = nb.prep.filter((r) => r.treatment && filled(r.biomass) && filled(r.volume)).length;
  const design = [
    item('b08.hypothesis', m.hypothesis.recorded, 3, 'b08fb.hypothesis'),
    item('b08.pair', !mods.gas || (!!w.evidence.gasRunStarted && errs(1, 2, 3, 4, 6, 7, 8, 9) === 0), 7, firstOf([1, 2, 3, 4, 6, 7, 8, 9], 'pair')),
    item('b08.variables', !mods.gas || (errs(5, 10) === 0 && prepOk === 2), 5, firstOf([5, 10], 'variables'), { n: prepOk }, 0.5 * Math.min(1, prepOk / 2)),
  ];

  // ── Luz/oscuridad y capilar (20) ──
  const gasRows = nb.gas.filter((r) => rd(w, r.baselineId) && rd(w, r.finalId));
  const dhOk = gasRows.length === 2 && gasRows.every((r) => close(parseNum(r.dh), rd(w, r.finalId)!.value - rd(w, r.baselineId)!.value, 0.5));
  const gas = [
    item('b08.seal', errs(11, 12, 13, 21, 22) === 0 && !!w.evidence.gasRunStarted, 6, firstOf([11, 12, 13, 21, 22], 'seal')),
    item('b08.meniscus', errs(14, 15, 16, 19) === 0 && TUBES.every((id) => m.tubes[id].finalId), 7, firstOf([16, 14, 15, 19], 'meniscus')),
    item('b08.run', errs(18, 20) === 0 && dhOk && !hasNb(17), 7, firstOf([20, 18, 17], 'run')),
  ];

  // ── DIC–BTB (15) ──
  const btbRows = nb.btb.filter((r) => rd(w, r.readingIdEnd) && filled(r.colorEnd));
  const btb = [
    item('b08.controls', !!w.evidence.seriesStarted && errs(26, 27, 28, 29, 30, 33, 34) === 0, 7, firstOf([29, 26, 27, 28, 30, 33, 34], 'controls')),
    item('b08.colorRecord', btbRows.length === 3 && !hasNb(35), 4, firstOf([35], 'colorRecord'), { n: btbRows.length }, (btbRows.length / 3) * 0.6),
    item('b08.btbMeaning', errs(32) === 0 && !hasNb(31, 73), 4, firstOf([32, 31, 73], 'btbMeaning')),
  ];

  // ── Pigmentos (20) ──
  const bandRows = nb.bands.filter((r) => rd(w, r.readingId));
  const o = m.paper.originMm ?? 0;
  const rfOk = bandRows.filter((r) => {
    const fr = rd(w, r.frontReadingId);
    return fr && close(parseNum(r.rf), rfOf(rd(w, r.readingId)!.value, o, fr.value), 0.03);
  }).length;
  const front = !m.paper.frontLost && m.paper.frontMarkMm !== null;
  const pigments = [
    item('b08.extraction', !!w.evidence.pigmentExtractReady && errs(36, 37, 38, 39, 40, 41, 42, 43, 44, 45) === 0, 7, firstOf([45, 36, 37, 38, 39, 40, 41, 42, 43, 44], 'extraction')),
    item('b08.paper', !!w.evidence.spotPrepared && errs(46, 47, 48, 49, 50, 51, 52) === 0, 5, firstOf([48, 46, 47, 49, 50, 51, 52], 'paper')),
    item('b08.front', front && errs(53, 54, 55, 56) === 0, 4, firstOf([55, 54, 53, 56], 'front')),
    item('b08.rf', bandRows.length > 0 && rfOk === bandRows.length && !hasNb(57, 58, 75), 4, firstOf([57, 58, 75], 'rf'), { n: rfOk }, bandRows.length ? (rfOk / bandRows.length) * 0.6 : 0),
  ];

  // ── Cálculos, incertidumbre y conclusiones (15) ──
  const slopeOk = gasRows.length === 2 && gasRows.every((r) => {
    const f = rd(w, r.finalId)!;
    const b = rd(w, r.baselineId)!;
    const hours = parseNum(r.hours);
    return r.slopeUnit === 'mm/h' && close(hours, (f.elapsedS ?? 0) / 3600, 0.02) && close(parseNum(r.slope), (f.value - b.value) / hours, Math.max(0.5, Math.abs(parseNum(r.slope)) * 0.03));
  });
  const reporting = [
    item('b08.slope', mods.gas ? slopeOk && !hasNb(24, 68, 72) : true, 5, firstOf([68, 24, 72], 'slope')),
    item('b08.gross', !mods.gas ? true : !calibrated ? (filled(nb.gross.gross) ? false : null) : filled(nb.gross.gross) && !hasNb(23, 25, 69, 74), 3, calibrated ? firstOf([23, 25, 69, 74], 'gross') : 'b08fb.noCalibration'),
    item('b08.claims', !hasNb(59, 70, 76) && errs(71) === 0, 3, firstOf([70, 59, 76, 71], 'claimsFb')),
    item('b08.conclusion', filled(nb.synthesis.conclusion) && filled(nb.synthesis.limits) ? null : false, 2, 'b08fb.conclusion', undefined, 0.5),
    item('b08.answers', answeredCount(nb) >= 5 ? null : false, 2, 'b08fb.answers', { n: answeredCount(nb) }, 0.5),
  ];

  // Reponderación fijada por el escenario ANTES de empezar (regla 6).
  const raw: Array<[string, number, ReturnType<typeof item>[], boolean]> = [
    ['safety', B08_WEIGHTS.safety, safety, true],
    ['design', B08_WEIGHTS.design, design, true],
    ['gas', B08_WEIGHTS.gas, gas, mods.gas],
    ['btb', B08_WEIGHTS.btb, btb, mods.btb],
    ['pigments', B08_WEIGHTS.pigments, pigments, mods.pig],
    ['reporting', B08_WEIGHTS.reporting, reporting, true],
  ];
  const active = raw.filter((x) => x[3]);
  const sum = active.reduce((s, x) => s + x[1], 0);
  const components = active.map(([id, wt, items]) => finalizeComponent(id, wt / sum, items));
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}

/** Bandas reales de la corrida (para la interfaz y la revisión docente). */
export const bandsForReview = (w: PhotoWorld) => bandsOf(w);
export const allBtbRead = (w: PhotoWorld) => BTB.every((id) => w.photo.btb[id].finalId);
