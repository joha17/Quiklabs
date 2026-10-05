/**
 * Evaluación por evidencia de la Práctica 4 (§22). Acepta acciones independientes en distinto orden cuando son
 * seguras; exige las dependencias científicas y de seguridad. La retroalimentación describe la consecuencia
 * observada y muestra los cálculos con las cantidades realmente usadas (§24.1).
 */
import type { P4World } from '../../simulation/reaction-world/types';
import { metalCuMg, observedVessel, speciesMol, submissionBlockers } from '../../simulation/reaction-world/world';
import { finalizeComponent, item, type Evaluation, type ScoreItem } from '../../simulation/scoring/types';
import { contextFor } from './index';
import { deliveredMl, experimentVessels, redoxElapsedS } from './evidence';
import { expectedResults } from './expected-results';
import { allEquations } from './equations';
import type { P4Notebook } from './notebook';

const n = (w: P4World, k: string) => w.evidence[k] ?? 0;
const near = (v: number | undefined, target: number, tol: number) => v !== undefined && Math.abs(v - target) <= tol;
const filled = (s: string) => s.trim().length > 15;

/** Campos de la libreta que no coinciden con lo esperado para lo que se hizo (para la revisión). */
export function wrongFields(w: P4World, nb: P4Notebook, row: 'A' | 'B1' | 'B2' | 'C1' | 'Mg'): string[] {
  const exp = expectedResults(w)[row];
  const rec = nb[row] as unknown as Record<string, string>;
  return Object.keys(exp).filter((k) => rec[k] && !exp[k].includes(rec[k]));
}

export function evaluateP4(w: P4World, nb: P4Notebook, opts: { ppeConfirmed: boolean }): Evaluation {
  const ctx = contextFor(w);
  const ev = experimentVessels(w);
  const blockers = submissionBlockers(w, ctx);
  const exp = expectedResults(w);
  const eqs = allEquations(w, nb);
  const okEq = (id: string, kinds?: string[]) => eqs.filter((e) => e.id === id && (!kinds || kinds.includes(e.kind)));
  const eqScore = (list: typeof eqs) => (list.length ? list.filter((e) => e.v?.ok).length / list.length : 0);
  const recOk = (row: 'A' | 'B1' | 'B2' | 'C1' | 'Mg', field: string) => {
    const r = (nb[row] as unknown as Record<string, string>)[field];
    return !!r && exp[row][field]?.includes(r);
  };

  // ── 1. Seguridad, selección y medición (20 %) ──
  const a = deliveredMl(w, ev.A);
  const b1 = deliveredMl(w, ev.B1);
  const b2 = deliveredMl(w, ev.B2);
  const c1 = deliveredMl(w, ev.C1);
  const c3 = deliveredMl(w, ev.C3);
  const measures = [
    near(a.hcl, 5, 0.3), near((a.naoh10 ?? 0) + (a.naohX ?? 0), 5, 0.3), near(b1.na2co3, 1, 0.15), near(b1.cacl2, 1, 0.15), near(b2.fecl3, 1, 0.15),
    near((b2.naoh15 ?? 0) + (b2.naohX ?? 0), 1, 0.15), near(c1.cuso4, 2.5, 0.3), near(c3.water, 5, 0.5),
  ];
  const measured = measures.filter(Boolean).length;
  const critical = ['err:burn', 'err:ethanolFlame', 'err:waterHotMg', 'err:drain', 'err:mgSetup', 'err:mgHand', 'err:spillUncleaned'].filter((k) => n(w, k));
  const wrongReagentA = (a.naoh15 ?? 0) > 0.5 || (a.cacl2 ?? 0) + (a.fecl3 ?? 0) + (a.na2co3 ?? 0) > 0;
  const lit = w.gas.burner.litOnceAt !== null;
  const safety: ScoreItem[] = [
    item('p4.ppe', opts.ppeConfirmed, 2, 'p4fb.ppe'),
    item('p4.inspect', Object.keys(w.evidence).some((k) => k.startsWith('inspected:')), 1, 'p4fb.inspect'),
    item('p4.noCritical', critical.length === 0, 4, 'p4fb.noCritical', { list: critical.map((c) => c.replace('err:', '')).join(', ') }),
    item('p4.measure', measured >= 7 ? true : measured >= 4 ? null : false, 4, 'p4fb.measure', { n: measured, m: measures.length }, measured / measures.length),
    item('p4.reagents', !!ev.A && !wrongReagentA, 2, 'p4fb.reagents'),
    item('p4.noCross', !n(w, 'err:crossDropper'), 2, 'p4fb.noCross'),
    item('p4.noSpill', n(w, 'err:spill') < 0.5 && !n(w, 'err:broken'), 2, 'p4fb.noSpill'),
    item('p4.burnerOrder', lit && w.gas.evidence.firstIgnitionOrderOk === 1, 2, lit ? 'p4fb.burnerOrder' : 'p4fb.notLit'),
    item('p4.ethanolAway', !n(w, 'err:ethanolFlame'), 1, 'p4fb.ethanolAway'),
  ];

  // ── 2. Neutralización y pH (15 %) ──
  const aV = observedVessel(w, ev.A);
  const neutral: ScoreItem[] = [
    item('p4.aDone', !!aV && (a.hcl ?? 0) > 3 && ((a.naoh10 ?? 0) + (a.naohX ?? 0) + (a.naoh15 ?? 0)) > 3, 3, 'p4fb.aDone'),
    item('p4.indicator', near(a.pheno, 0.1, 0.06), 1, 'p4fb.indicator', { ml: (a.pheno ?? 0).toFixed(2) }),
    item('p4.slowStir', n(w, 'pinkSwirlS') > 1 && !!aV && !!w.evidence[`stirred:${aV.id}`], 2, 'p4fb.slowStir'),
    item('p4.probe', !!aV && !!w.evidence[`probeRead:${aV.id}`], 2, 'p4fb.probe'),
    item('p4.aColors', recOk('A', 'colorInitial') && recOk('A', 'colorFinal'), 3, 'p4fb.aColors'),
    item('p4.aThermal', recOk('A', 'thermal') && !!nb.A.tInitial && !!nb.A.tFinal, 2, 'p4fb.aThermal'),
    item('p4.aEquations', eqScore(okEq('A')) === 1 ? true : eqScore(okEq('A')) > 0 ? null : false, 2, 'p4fb.aEquations', undefined, eqScore(okEq('A'))),
  ];

  // ── 3. Precipitación y ecuaciones iónicas (20 %) ──
  const b2v = observedVessel(w, ev.B2);
  const precip: ScoreItem[] = [
    item('p4.b1Done', !!ev.B1 && speciesMol(observedVessel(w, ev.B1)!, 'CaCO3(s)') > 5e-5, 3, 'p4fb.b1Done'),
    item('p4.b2Done', !!b2v && speciesMol(b2v, 'Fe(OH)3(s)') > 1e-5, 3, 'p4fb.b2Done'),
    item('p4.b1Record', recOk('B1', 'immediate') && recOk('B1', 'pptColor'), 2, 'p4fb.b1Record'),
    item('p4.b2Record', recOk('B2', 'pptColor') && recOk('B2', 'supernatant'), 2, 'p4fb.b2Record'),
    item('p4.limiting', recOk('B1', 'limiting') && recOk('B2', 'limiting'), 3, 'p4fb.limiting', {
      fe: ((((b2.fecl3 ?? 0) / 1000) * 0.15) * 1e3).toFixed(3), oh: ((((b2.naoh15 ?? 0) / 1000) * 0.15) * 1e3).toFixed(3),
    }),
    item('p4.ionicEq', eqScore([...okEq('B1'), ...okEq('B2')]) >= 0.99 ? true : eqScore([...okEq('B1'), ...okEq('B2')]) > 0.3 ? null : false, 5, 'p4fb.ionicEq', undefined, eqScore([...okEq('B1'), ...okEq('B2')])),
    item('p4.settle', !!ev.B1 && !!w.evidence[`stirred:${ev.B1}`], 1, 'p4fb.settle'),
  ];

  // ── 4. Redox Fe/Cu (15 %) ──
  const nail = w.metals.nail;
  const elapsed = redoxElapsedS(w);
  const redox: ScoreItem[] = [
    item('p4.nailInspect', !!nail?.inspectedBefore, 1, 'p4fb.nailInspect'),
    item('p4.c1Time', elapsed >= w.params.redoxObserveS * 0.98, 3, 'p4fb.c1Time', { min: (elapsed / 60).toFixed(1) }),
    item('p4.stopwatch', w.stopwatch.starts.length > 0, 1, 'p4fb.stopwatch'),
    item('p4.copper', !!nail && metalCuMg(nail) > 2, 2, 'p4fb.copper', { mg: nail ? metalCuMg(nail).toFixed(1) : '0' }),
    item('p4.c1Record', recOk('C1', 'colorInitial') && recOk('C1', 'colorFinal') && recOk('C1', 'metalChange'), 3, 'p4fb.c1Record'),
    item('p4.oxRed', recOk('C1', 'oxidized') && recOk('C1', 'reduced'), 2, 'p4fb.oxRed'),
    item('p4.c1Eq', eqScore(okEq('C1')) >= 0.99 ? true : eqScore(okEq('C1')) > 0.3 ? null : false, 3, 'p4fb.c1Eq', undefined, eqScore(okEq('C1'))),
  ];

  // ── 5. Combustión e hidratación del Mg (15 %) ──
  const ribbons = Object.values(w.ribbons);
  const burned = ribbons.find((r) => r.burnFrac > 0.9);
  const theo = burned ? (burned.massInitialG / 24.305) : 0;
  const recovered = burned ? burned.toCapsuleMol / Math.max(1e-12, theo) : 0;
  const cap = w.vessels.capsule;
  const mg: ScoreItem[] = [
    item('p4.mgSafety', !n(w, 'err:mgSetup') && !n(w, 'err:mgHand') && !n(w, 'err:wrongTongs') && w.safety.mgWarningAccepted, 3, 'p4fb.mgSafety'),
    item('p4.mgBurn', !!burned, 3, 'p4fb.mgBurn'),
    item('p4.mgCollect', recovered > 0.6, 2, 'p4fb.mgCollect', { pct: Math.round(recovered * 100) }),
    item('p4.noLook', n(w, 'lookDirectS') < 0.5, 2, 'p4fb.noLook'),
    item('p4.cooled', !!burned && !n(w, 'err:waterHotMg'), 1, 'p4fb.cooled'),
    item('p4.hydration', !!cap && (cap.extents.mgoHydration ?? 0) > 1e-6 && (deliveredMl(w, 'capsule').pheno ?? 0) > 0, 2, 'p4fb.hydration'),
    item('p4.mgRecord', recOk('Mg', 'combustion') && recOk('Mg', 'residue') && recOk('Mg', 'phenolColor'), 2, 'p4fb.mgRecord'),
    item('p4.mgEq', eqScore([...okEq('C2'), ...okEq('C3')]) >= 0.99 ? true : eqScore([...okEq('C2'), ...okEq('C3')]) > 0.3 ? null : false, 2, 'p4fb.mgEq', undefined, eqScore([...okEq('C2'), ...okEq('C3')])),
  ];

  // ── 6. Ecuaciones, análisis y residuos (15 %) ──
  const disposals = w.disposals;
  const wrongWaste = disposals.filter((d) => !d.correct).length;
  const qAnswered = (['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).filter((q) => filled(nb.analysis[q])).length;
  const analysis: ScoreItem[] = [
    item('p4.waste', disposals.length > 0 && wrongWaste === 0, 4, disposals.length ? 'p4fb.waste' : 'p4fb.wasteNone', { n: wrongWaste }),
    item('p4.nailWaste', !!w.objects.nail?.support.startsWith('disposed:waste_metals'), 1, 'p4fb.nailWaste'),
    item('p4.finalSafe', blockers.length === 0, 3, 'p4fb.finalSafe', { list: blockers.join(', ') }),
    item('p4.gloves', w.safety.gloves, 1, 'p4fb.gloves'),
    item('p4.complexes', nb.complexes.read, 1, 'p4fb.complexes'),
    item('p4.analysis', qAnswered === 6 ? null : false, 4, qAnswered === 6 ? undefined : 'p4fb.analysis', { n: qAnswered }, (qAnswered / 6) * 0.6),
  ];

  const components = [
    finalizeComponent('p4safety', 0.2, safety),
    finalizeComponent('p4neutral', 0.15, neutral),
    finalizeComponent('p4precip', 0.2, precip),
    finalizeComponent('p4redox', 0.15, redox),
    finalizeComponent('p4mg', 0.15, mg),
    finalizeComponent('p4analysis', 0.15, analysis),
  ];
  const total = components.reduce((s, c) => s + c.score * c.weight, 0);
  const needsTeacherReview = (['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).filter((q) => nb.analysis[q].trim());
  return { components, total, needsTeacherReview };
}
