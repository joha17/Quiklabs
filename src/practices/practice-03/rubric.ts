/**
 * Evaluación por evidencia de la Práctica 3 (§19). No exige una trayectoria idéntica para acciones independientes;
 * sí exige las dependencias de seguridad y científicas. La retroalimentación explica la consecuencia observada.
 */
import type { FlameWorld } from '../../simulation/flame-world/types';
import { submissionBlockers } from '../../simulation/flame-world/world';
import { finalizeComponent, item, type Evaluation, type ScoreItem } from '../../simulation/scoring/types';
import { UNKNOWN_ID, SOLUTION_ROWS, type SolutionRow } from './definition';
import { capsuleTests } from './evidence';
import { EXPECTED_32, EXPECTED_BY_CATION, ROW_CATION } from './expected-results';
import { BURNER_PARTS, FLAME_ROWS, type P3Notebook } from './notebook';

const n = (w: FlameWorld, k: string) => w.evidence[k] ?? 0;

/** Color observado (región cromática del dominio) → vocabulario de la libreta. */
export function regionToNotebook(region: string | undefined): string {
  if (!region) return '';
  if (region === 'sin_color' || region === 'blanquecino') return 'oscura';
  return region;
}

export function expectedFor(w: FlameWorld, row: SolutionRow) {
  const cation = row === UNKNOWN_ID ? w.unknown.cation : ROW_CATION[row as Exclude<SolutionRow, 'sol_unknown'>];
  return EXPECTED_BY_CATION[cation];
}

/** Campos de la libreta que no coinciden con la referencia (para la revisión y el modo práctica). */
export function wrong33(w: FlameWorld, nb: P3Notebook, row: SolutionRow): string[] {
  const exp = expectedFor(w, row);
  const r = nb.table33[row];
  const out: string[] = [];
  if (r.solutionColor && !exp.solutionColor.includes(r.solutionColor)) out.push('solutionColor');
  if (r.noFilter && !exp.noFilter.includes(r.noFilter)) out.push('noFilter');
  if (r.filter && !exp.filter.includes(r.filter)) out.push('filter');
  return out;
}

export function evaluateP3(w: FlameWorld, nb: P3Notebook, opts: { ppeConfirmed: boolean }): Evaluation {
  const blockers = submissionBlockers(w);
  const ev = w.evidence;
  const caps = capsuleTests(w);
  const obs = w.observations;

  // ── 1. Seguridad e inspección (20 %) ──
  const located = ['extinguisher', 'blanket', 'estop'].filter((k) => w.safety.located[k]).length;
  // Los criterios «sin errores» solo cuentan si se realizó la actividad correspondiente.
  const lit = w.burner.litOnceAt !== null;
  const safety: ScoreItem[] = [
    item('p3.ppe', opts.ppeConfirmed, 2, 'p3fb.ppe'),
    item('p3.locate', located === 3, 2, 'p3fb.locate', { n: located }),
    item('p3.hoseInspect', w.hose.inspected && (!w.hose.cracked || w.hose.crackFound), 2, 'p3fb.hoseInspect'),
    item('p3.precheckFirst', !ev.ignitionWithoutPrecheck && w.burner.litOnceAt !== null, 2, 'p3fb.precheckFirst'),
    item('p3.ventilation', lit && n(w, 'litNoExtractionS') < 10, 2, lit ? 'p3fb.ventilation' : 'p3fb.notLit'),
    item('p3.hoseAway', lit && n(w, 'hoseNearFlameS') < 1 && w.burner.hoseIntegrity > 0.9, 2, lit ? 'p3fb.hoseAway' : 'p3fb.notLit'),
    item('p3.noCritical', lit && !n(w, 'err:burn') && !n(w, 'err:leakFlameTest') && !n(w, 'err:igniteAccumulated') && !n(w, 'err:hoseFire') && !n(w, 'err:hotHcl'), 3, 'p3fb.noCritical'),
    item('p3.finalSafe', lit && blockers.length === 0, 3, 'p3fb.finalSafe', { list: blockers.join(', ') }),
  ];

  // ── 2. Encendido, regulación y apagado (20 %) ──
  const parts = BURNER_PARTS.filter((p) => w.parts.answers[p] === p).length;
  const burner: ScoreItem[] = [
    item('p3.parts', parts >= 8 ? true : parts >= 5 ? null : false, 2, 'p3fb.parts', { n: parts }, 0.5),
    item('p3.ignitionOrder', ev.firstIgnitionOrderOk === 1, 3, 'p3fb.ignitionOrder'),
    item('p3.noFlashback', lit && !n(w, 'err:flashback') && !n(w, 'err:lifted'), 2, lit ? 'p3fb.noFlashback' : 'p3fb.notLit'),
    item('p3.yellowHeight', n(w, 'heightOkYellowS') >= 2, 2, 'p3fb.yellowHeight'),
    item('p3.blueCones', w.flameLog.twoConesS >= 3, 2, 'p3fb.blueCones'),
    item('p3.blueHeight', n(w, 'heightOkBlueS') >= 2, 2, 'p3fb.blueHeight'),
    item('p3.shutdownOrder', ev.shutdownAirFirst === 1 && ev.shutdownNeedleFirst === 1, 3, 'p3fb.shutdownOrder'),
    item('p3.shutdownConfirm', lit && !!ev.shutdownConfirmed, 1, 'p3fb.shutdownConfirm'),
    item('p3.cooled', lit && w.burner.bodyTemperatureC < 60, 1, 'p3fb.cooled'),
  ];

  // ── 3. Combustión y cápsula (15 %) ──
  const r32 = nb.table32;
  const ok32 = (row: (typeof FLAME_ROWS)[number]) => {
    const e = EXPECTED_32[row];
    const r = r32[row];
    return e.color.includes(r.color) && e.shape.includes(r.shape) && e.luminosity.includes(r.luminosity) && (!e.soot || e.soot.includes(r.soot));
  };
  const combustion: ScoreItem[] = [
    item('p3.capsule1', !!caps.yellow, 3, 'p3fb.capsule1'),
    item('p3.tongs', !!caps.yellow?.tongs && (!caps.blue || caps.blue.tongs), 2, 'p3fb.tongs'),
    item('p3.cleanBetween', !!caps.blue && caps.blue.sootBeforeMg < 0.05, 2, 'p3fb.cleanBetween'),
    item('p3.capsule2', !!caps.blue && caps.blue.sootAfterMg - caps.blue.sootBeforeMg < 0.1, 3, 'p3fb.capsule2'),
    item('p3.table32', FLAME_ROWS.every(ok32) ? true : FLAME_ROWS.filter(ok32).length >= 2 ? null : false, 3, 'p3fb.table32', undefined, 0.5),
    item('p3.q5', nb.questions.q5.trim().length > 15 ? null : false, 2, nb.questions.q5.trim().length > 15 ? undefined : 'p3fb.q5', undefined, 0.5),
  ];

  // ── 4. Técnica de asas y contaminación (15 %) ──
  const usedLoops = Object.values(w.loops).filter((l) => l.lastContact);
  const checked = usedLoops.filter((l) => w.evidence[`cleanChecked:${l.id}`] || w.evidence[`dirtySeen:${l.id}`]).length;
  const contamShares = SOLUTION_ROWS.map((r) => obs[r]?.maxContaminationShare ?? 0);
  const inHolder = Object.values(w.loops).filter((l) => w.objects[l.id]?.support.startsWith('holder:')).length;
  const used = usedLoops.length > 0;
  const loops: ScoreItem[] = [
    item('p3.cleanCheck', usedLoops.length > 0 && checked >= Math.ceil(usedLoops.length * 0.75), 3, 'p3fb.cleanCheck', { n: checked, m: usedLoops.length }),
    item('p3.noWrongLoop', used && !n(w, 'err:wrongLoop') && !n(w, 'err:sharedNotCleaned'), 3, used ? 'p3fb.noWrongLoop' : 'p3fb.loopsUnused'),
    item('p3.noTouch', used && !n(w, 'err:loopsTouched'), 1, used ? 'p3fb.noTouch' : 'p3fb.loopsUnused'),
    item('p3.coolBeforeDip', used && !n(w, 'err:hotLoopTube') && !n(w, 'err:hotHcl'), 2, used ? 'p3fb.coolBeforeDip' : 'p3fb.loopsUnused'),
    item('p3.noOverload', used && !n(w, 'err:overload'), 1, used ? 'p3fb.noOverload' : 'p3fb.loopsUnused'),
    item('p3.pureSignals', used && contamShares.every((s) => s < 0.35), 3, used ? 'p3fb.pureSignals' : 'p3fb.loopsUnused'),
    item('p3.loopsStored', used && inHolder >= Object.keys(w.loops).length - n(w, 'spareLoops'), 1, used ? 'p3fb.loopsStored' : 'p3fb.loopsUnused'),
  ];

  // ── 5. Registro de colores y uso del filtro (15 %) ──
  const known = SOLUTION_ROWS.filter((r) => r !== UNKNOWN_ID);
  const observedBlue = known.filter((r) => obs[r]?.noFilter && (obs[r]!.yellowFlameS < obs[r]!.emittingS * 0.5)).length;
  const recordedOk = known.filter((r) => nb.table33[r].noFilter && wrong33(w, nb, r).length === 0).length;
  // Coherencia: lo registrado coincide con lo que realmente se observó (no con lo esperado de memoria).
  const coherent = known.filter((r) => {
    const o = obs[r]?.noFilter;
    const rec = nb.table33[r].noFilter;
    return !!o && !!rec && (regionToNotebook(o.region) === rec || expectedFor(w, r).noFilter.includes(rec) && expectedFor(w, r).noFilter.includes(regionToNotebook(o.region)));
  }).length;
  const colors: ScoreItem[] = [
    item('p3.observedAll', observedBlue === known.length ? true : observedBlue >= 4 ? null : false, 3, 'p3fb.observedAll', { n: observedBlue, m: known.length }, observedBlue / known.length),
    item('p3.filterMix', !!obs.sol_mix?.filter && !!obs.sol_mix?.noFilter, 3, 'p3fb.filterMix'),
    item('p3.filterOthers', known.filter((r) => obs[r]?.filter).length >= 4, 1, 'p3fb.filterOthers'),
    item('p3.table33', recordedOk === known.length ? true : recordedOk >= 4 ? null : false, 4, 'p3fb.table33', { n: recordedOk, m: known.length }, recordedOk / known.length),
    item('p3.coherence', coherent >= known.length - 1, 2, 'p3fb.coherence'),
    item('p3.q6', nb.questions.q6.trim().length > 15 ? null : false, 2, nb.questions.q6.trim().length > 15 ? undefined : 'p3fb.q6', undefined, 0.5),
  ];

  // ── 6. Incógnita y análisis conceptual (15 %) ──
  const uo = obs[UNKNOWN_ID];
  const identity = nb.unknown.identity;
  const qAnswered = (['q1', 'q2', 'q3', 'q4', 'q7'] as const).filter((q) => nb.questions[q].trim().length > 15).length;
  const unknown: ScoreItem[] = [
    item('p3.unknownTested', !!uo?.noFilter && uo.yellowFlameS < uo.emittingS * 0.5, 3, 'p3fb.unknownTested'),
    item('p3.unknownFilter', !!uo?.filter, 1, 'p3fb.unknownFilter'),
    item('p3.unknownId', identity === w.unknown.cation, 5, 'p3fb.unknownId'),
    item('p3.unknownJustify', nb.unknown.justification.trim().length > 20 ? null : false, 2, nb.unknown.justification.trim().length > 20 ? undefined : 'p3fb.unknownJustify', undefined, 0.6),
    item('p3.questions', qAnswered === 5 ? null : false, 4, qAnswered === 5 ? undefined : 'p3fb.questions', { n: qAnswered }, qAnswered / 5 * 0.6),
  ];

  const components = [
    finalizeComponent('p3safety', 0.2, safety),
    finalizeComponent('p3burner', 0.2, burner),
    finalizeComponent('p3combustion', 0.15, combustion),
    finalizeComponent('p3loops', 0.15, loops),
    finalizeComponent('p3colors', 0.15, colors),
    finalizeComponent('p3unknown', 0.15, unknown),
  ];
  const total = components.reduce((s, c) => s + c.score * c.weight, 0);
  const needsTeacherReview = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'unknownJustification'].filter((k) => k === 'unknownJustification' ? nb.unknown.justification.trim() : nb.questions[k as 'q1'].trim());
  return { components, total, needsTeacherReview };
}
