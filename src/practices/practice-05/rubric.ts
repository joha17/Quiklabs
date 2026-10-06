/**
 * Evaluación por evidencia de la Práctica 5 (§22): seguridad e inspección 20 %, balanza y pesadas 20 %, preparación y
 * montaje 15 %, calentamiento y masa constante 20 %, cálculos estequiométricos 15 %, análisis 10 %. Los cálculos se
 * comparan con los que corresponden a las masas que el estudiante REALMENTE midió (§24.1).
 */
import type { P5World } from '../../simulation/stoich-world/types';
import { expelledG, heatingBlockers } from '../../simulation/stoich-world/world';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { validateChain } from '../../simulation/stoichiometry/stoich';
import { CTX5 } from './index';
import { classify, differences, p5StageEvidence } from './evidence';
import { expectedResults } from './expected-results';
import { validateP5Equation } from './equation';
import { filledAnalysis, parseNum, type P5Notebook } from './notebook';

const n = (w: P5World, k: string) => w.evidence[k] ?? 0;
const closeRel = (s: string, v: number | null, rel = 0.03, abs = 0.011) => {
  if (v === null || !s.trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};

export const P5_WEIGHTS = { safety: 0.2, balance: 0.2, prep: 0.15, heating: 0.2, calc: 0.15, analysis: 0.1 } as const;

export function evaluateP5(w: P5World, nb: P5Notebook): Evaluation {
  const flags = p5StageEvidence(w, nb);
  const exp = expectedResults(w);
  const d = differences(w);
  const p = w.params;
  const measured = w.measurements;
  const critical = ['err:CONTAMINATED_MIXTURE', 'err:TUBE_STOPPERED', 'err:MOUTH_TOWARD_PERSON', 'err:grind', 'err:waterOnHot', 'err:burn', 'err:unattended', 'err:contamination'].filter((k) => n(w, k));

  const safety = [
    item('p5.ppe', flags.ppe, 2, 'p5fb.ppe'),
    item('p5.inspectTube', w.tube.inspected, 1, 'p5fb.inspectTube'),
    item('p5.inspectSafety', ['extinguisher', 'blanket', 'estop'].every((t) => w.evidence[`inspected:${t}`]), 1, 'p5fb.inspectSafety'),
    item('p5.noCritical', critical.length === 0, 4, 'p5fb.noCritical', { list: critical.map((c) => c.replace('err:', '')).join(', ') }),
    item('p5.shield', !!w.evidence.shield, 2, 'p5fb.shield'),
    item('p5.noBurns', w.safety.burns === 0, 2, 'p5fb.noBurns'),
    item('p5.dedicatedSpatulas', !n(w, 'err:wrongSpatula') && !n(w, 'err:returnToBottle'), 2, 'p5fb.dedicatedSpatulas'),
  ];

  const balance = [
    item('p5.calibrated', flags.calibrated, 3, 'p5fb.calibrated'),
    item('p5.noUncalibrated', !n(w, 'err:uncalibrated'), 1, 'p5fb.noUncalibrated'),
    item('p5.waitStable', !n(w, 'err:unstable'), 1, 'p5fb.waitStable'),
    item('p5.threeReadings', flags.emptyTube && flags.catalyst && !!d.readings.tubeInitial, 3, 'p5fb.threeReadings'),
    item('p5.order', !n(w, 'err:order'), 2, 'p5fb.order'),
    item('p5.noHotReading', !n(w, 'err:hotWeigh'), 2, 'p5fb.noHotReading'),
    item('p5.recorded', closeRel(nb.table1.tubeEmpty.value, d.readings.tubeEmpty?.displayedMassG ?? null, 0, 0.051) && closeRel(nb.table1.tubeMnO2KClO3.value, d.readings.tubeInitial?.displayedMassG ?? null, 0, 0.051), 2, 'p5fb.recorded'),
  ];

  const kclo3 = d.kclo3;
  const prep = [
    item('p5.kclo3Range', kclo3 !== null && kclo3 >= p.kclo3MinG - 0.05 && kclo3 <= p.kclo3MaxG + 0.05, 2, 'p5fb.kclo3Range', { g: kclo3?.toFixed(1) ?? '—' }),
    item('p5.mno2Weighed', d.mno2 !== null && d.mno2 > 0, 2, 'p5fb.mno2Weighed'),
    item('p5.mixed', flags.mixed, 2, 'p5fb.mixed', { h: Math.round(w.tube.homogeneity * 100) }),
    item('p5.noGrind', !n(w, 'err:grind') && !n(w, 'err:violentTap'), 1, 'p5fb.noGrind'),
    item('p5.assembled', !!w.evidence['stage:assembled'], 3, 'p5fb.assembled'),
    item('p5.angle', !n(w, 'err:angle'), 1, 'p5fb.angle'),
    item('p5.noStopper', !n(w, 'err:TUBE_STOPPERED'), 1, 'p5fb.noStopper'),
  ];

  const heating = [
    item('p5.gradual', !n(w, 'err:expelled') && expelledG(w) < 0.02, 3, 'p5fb.gradual', { g: expelledG(w).toFixed(2) }),
    item('p5.firstCycle', (w.tube.cycles[0]?.heatedS ?? 0) >= p.firstCycleS * 0.8, 2, 'p5fb.firstCycle', { min: ((w.tube.cycles[0]?.heatedS ?? 0) / 60).toFixed(1) }),
    item('p5.cooled', flags.cooledWeighed, 2, 'p5fb.cooled'),
    item('p5.twoReadings', d.readings.afterHeat.length >= 2, 2, 'p5fb.twoReadings'),
    item('p5.constantMass', flags.constantMass, 3, 'p5fb.constantMass'),
    item('p5.noCrack', !w.tube.cracked, 2, 'p5fb.noCrack'),
  ];

  const t2 = nb.table2;
  const chainKCl = nb.chains.kcl.length ? validateChain({ value: kclo3 ?? 0, unit: 'g', species: 'KClO3' }, nb.chains.kcl, { unit: 'g', species: 'KCl' }) : null;
  const chainO2 = nb.chains.o2.length ? validateChain({ value: kclo3 ?? 0, unit: 'g', species: 'KClO3' }, nb.chains.o2, { unit: 'g', species: 'O2' }) : null;
  const calc = [
    item('p5.equation', validateP5Equation(nb.equation).ok, 3, 'p5fb.equation'),
    item('p5.nKClO3', closeRel(t2.nKClO3, exp.nKClO3), 2, 'p5fb.nKClO3'),
    item('p5.mKClTheo', closeRel(t2.mKClTheo, exp.mKClTheo), 2, 'p5fb.mKClTheo'),
    item('p5.mO2Theo', closeRel(t2.mO2Theo, exp.mO2Theo), 2, 'p5fb.mO2Theo'),
    item('p5.mKClExp', closeRel(t2.mKClExp, exp.mKClExp, 0.02, 0.051), 2, 'p5fb.mKClExp'),
    item('p5.yield', closeRel(t2.yieldPct, exp.yieldPct, 0.02, 1.5), 2, 'p5fb.yield'),
    item('p5.chains', !!chainKCl?.ok && !!chainO2?.ok, 2, 'p5fb.chains'),
  ];

  const answered = filledAnalysis(nb);
  const analysis = [
    // Texto libre: lo corrige el docente; se otorga parcial si está respondido.
    item('p5.analysis', answered >= 5 ? null : false, 4, answered >= 5 ? undefined : 'p5fb.analysis', { n: answered }, (answered / 5) * 0.6),
    item('p5.disposal', flags.waste, 2, 'p5fb.disposal'),
    item('p5.safeEnd', heatingBlockers(w, CTX5).filter((b) => b !== 'SHIELD_MISSING' && b !== 'NUT_LOOSE' && b !== 'PPE_MISSING').length === 0 && !w.safety.block, 1, 'p5fb.safeEnd'),
  ];

  const components = [
    finalizeComponent('safety', P5_WEIGHTS.safety, safety),
    finalizeComponent('balance', P5_WEIGHTS.balance, balance),
    finalizeComponent('prep', P5_WEIGHTS.prep, prep),
    finalizeComponent('heating', P5_WEIGHTS.heating, heating),
    finalizeComponent('calc', P5_WEIGHTS.calc, calc),
    finalizeComponent('analysis', P5_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = answered >= 5 ? ['p5.analysis'] : [];
  void classify;
  void measured;
  return { components, total, needsTeacherReview };
}
