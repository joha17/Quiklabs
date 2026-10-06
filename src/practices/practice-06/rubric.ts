/**
 * Evaluación por evidencia de la Práctica 6 (§26): seguridad e inspección 15 %, balanza y probeta 15 %, montaje 10 %,
 * calentamiento y transferencia 20 %, registro de temperatura 10 %, cálculos e incertidumbre 20 %, interpretación e
 * identificación 10 %. La bomba calorimétrica se evalúa aparte (peso 0 en el total). Los cálculos se comparan con lo
 * que corresponde a las lecturas que el estudiante realmente obtuvo.
 */
import type { P6World } from '../../simulation/calorimetry-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { convertEnergyPerMass } from '../../simulation/calorimetry/heat';
import { p6StageEvidence } from './evidence';
import { expectedActivities, expectedBomb, expectedCol, expectedIdentification, readingsFor, runFor } from './expected-results';
import { answered, filledAnalysis, parseNum, type P6Notebook } from './notebook';

const n = (w: P6World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number | null, rel = 0.03, abs = 0.011) => {
  if (v === null || !s.trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};

export const P6_WEIGHTS = { safety: 0.15, balance: 0.15, setup: 0.1, heating: 0.2, temperature: 0.1, calc: 0.2, interpretation: 0.1, bomb: 0 } as const;

export function evaluateP6(w: P6World, nb: P6Notebook): Evaluation {
  const flags = p6StageEvidence(w, nb);
  const fe = expectedCol(w, 'fe');
  const x = expectedCol(w, 'x');
  const run = runFor(w, 'fe');
  const rFe = readingsFor(w, run, 'fe');
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const critical = ['err:beakerDry', 'err:tubeCracked', 'err:bomb:OPEN_PRESSURIZED'].filter((k) => n(w, k));

  const safety = [
    item('p6.ppe', flags.ppe, 2, 'p6fb.ppe'),
    item('p6.inspect', ins('balance') && ins('cylinder') && ins('tube_fe') && ins('tube_x') && ins('therm_cal'), 2, 'p6fb.inspect'),
    item('p6.noBurns', w.safety.burns === 0, 3, 'p6fb.noBurns'),
    item('p6.noCritical', critical.length === 0, 3, 'p6fb.noCritical', { list: critical.map((c) => c.replace('err:', '')).join(', ') }),
    item('p6.tongs', !n(w, 'err:hotHandling'), 2, 'p6fb.tongs'),
    item('p6.plateOff', w.plate.knob < 0.01, 1, 'p6fb.plateOff'),
  ];

  const balance = [
    item('p6.calibrated', !!w.evidence.calibrated, 3, 'p6fb.calibrated'),
    item('p6.noUncalibrated', !n(w, 'err:uncalibrated'), 1, 'p6fb.noUncalibrated'),
    item('p6.waitStable', !n(w, 'err:unstable'), 1, 'p6fb.waitStable'),
    item('p6.waterDiff', !!(rFe.cylEmpty && rFe.cylWater), 2, 'p6fb.waterDiff'),
    item('p6.metalDiff', !!(rFe.tubeEmpty && rFe.tubeMetal), 2, 'p6fb.metalDiff'),
    item('p6.meniscus', w.volumeReadings.some((v) => v.atEyeLevel) && !n(w, 'err:parallax'), 2, 'p6fb.meniscus'),
    item('p6.noWetWeigh', !n(w, 'err:wetWeigh'), 1, 'p6fb.noWetWeigh'),
    item('p6.noHotWeigh', !n(w, 'err:hotWeigh'), 1, 'p6fb.noHotWeigh'),
    item('p6.noTouching', !n(w, 'err:touching'), 1, 'p6fb.noTouching'),
  ];

  const setup = [
    item('p6.immersion', !n(w, 'err:bulb') && !n(w, 'err:thermoTouching'), 2, 'p6fb.immersion'),
    item('p6.stirrer', !!w.evidence.stirrerInCup, 1, 'p6fb.stirrer'),
    item('p6.lidBefore', !!w.evidence.lidClosed && (!run || (w.evidence.lidClosed ?? 1e9) < run.startS), 2, 'p6fb.lidBefore'),
    item('p6.tiStable', !!rFe.tiWater && !rFe.tiWater.changing, 3, 'p6fb.tiStable'),
    item('p6.water50', fe.waterMass !== null && Math.abs(fe.waterMass - 50) <= 3, 2, 'p6fb.water50', { g: fe.waterMass?.toFixed(1) ?? '—' }),
  ];

  const heating = [
    item('p6.bathOk', !!w.evidence.beakerOnPlate && !n(w, 'latch:dryBeaker'), 2, 'p6fb.bathOk'),
    item('p6.metalBelow', !n(w, 'err:metalAbove'), 2, 'p6fb.metalBelow'),
    item('p6.noWaterInTube', !n(w, 'err:waterInTube'), 2, 'p6fb.noWaterInTube'),
    item('p6.notOnBottom', !n(w, 'err:tubeBottom'), 1, 'p6fb.notOnBottom'),
    item('p6.soak', !n(w, 'err:shortSoak') && !!run, 4, 'p6fb.soak'),
    item('p6.bathMeasured', !n(w, 'err:bathNotMeasured') && !!run, 2, 'p6fb.bathMeasured'),
    item('p6.fastTransfer', !!run && !n(w, 'err:slowTransfer'), 3, 'p6fb.fastTransfer', { s: run ? Math.round(run.transferS) : '—' }),
    item('p6.noPiecesLost', !n(w, 'err:pieceLost') && !n(w, 'err:pieceStuck'), 2, 'p6fb.noPiecesLost'),
    item('p6.noBathWater', !n(w, 'err:bathWater') && !n(w, 'err:splash'), 2, 'p6fb.noBathWater'),
  ];

  const j = run?.recorded?.judgement;
  const temperature = [
    item('p6.stirred', !!run && !n(w, 'err:notStirred') && !n(w, 'err:violentStir'), 3, 'p6fb.stirred'),
    item('p6.peakOk', j === 'OK', 4, j === 'EARLY' ? 'p6fb.peakEarly' : j === 'LATE' ? 'p6fb.peakLate' : 'p6fb.peakMissing', undefined, j ? 0.3 : 0),
    item('p6.lidClosedRun', !!run && !n(w, 'err:lidOpen'), 3, 'p6fb.lidClosedRun'),
  ];

  const t61 = nb.t61;
  const t62 = nb.t62;
  const calc = [
    item('p6.waterMass', close(t61.waterMass.fe.value, fe.waterMass, 0, 0.051), 2, 'p6fb.waterMass'),
    item('p6.metalMass', close(t62.metalMass.fe.value, fe.metalMass, 0, 0.051), 2, 'p6fb.metalMass'),
    item('p6.qWater', close(t61.qWater.fe.value, fe.qWater, 0.03, 2) && parseNum(t61.qWater.fe.value) > 0, 3, 'p6fb.qWater'),
    item('p6.cExp', close(t62.cExp.fe.value, fe.cIdeal, 0.03, 0.006) && parseNum(t62.cExp.fe.value) > 0, 4, 'p6fb.cExp'),
    item('p6.errorPct', close(t62.errorPct.fe.value, fe.errorPct, 0.05, 0.6), 2, 'p6fb.errorPct'),
    item('p6.cCorr', w.params.model === 'IDEAL' || close(t62.cCorr.fe.value, fe.cCorr, 0.03, 0.006), 3, 'p6fb.cCorr'),
    item('p6.uncertainty', fe.uC !== null && close(t62.cExp.fe.uncertainty, fe.uC, 0.35, 0.004), 2, 'p6fb.uncertainty'),
    item('p6.cUnknown', close(t62.cExp.x.value, x.cIdeal, 0.03, 0.006), 2, 'p6fb.cUnknown'),
  ];

  const id = expectedIdentification(w);
  const idOk = !!id && (nb.identification.metal === 'AMBIGUOUS' ? id.ambiguous : id.unique !== null ? nb.identification.metal === id.unique : id.rows.slice(0, 1).some((r) => r.id === nb.identification.metal));
  const act = expectedActivities(Number.isFinite(parseNum(nb.activities.a2Ambient)) ? parseNum(nb.activities.a2Ambient) : 25);
  const answeredN = filledAnalysis(nb);
  const interpretation = [
    item('p6.identification', idOk && answered(nb.identification.reason), 4, 'p6fb.identification', { list: id ? id.rows.filter((r) => r.cls !== 'UNLIKELY').map((r) => r.id).join(', ') : '—' }),
    item('p6.a2', close(nb.activities.a2q, act.a2KJ, 0.02, 0.05) && Number.isFinite(parseNum(nb.activities.a2Ambient)), 2, 'p6fb.a2'),
    item('p6.a3', close(nb.activities.a3Ti, act.a3C, 0.01, 1) && answered(nb.activities.a3Interp), 2, 'p6fb.a3'),
    item('p6.analysis', answeredN >= 4 ? null : false, 2, answeredN >= 4 ? undefined : 'p6fb.analysis', { n: answeredN }, (answeredN / 4) * 0.6),
  ];

  const eb = expectedBomb(w);
  const hcJ = Number.isFinite(parseNum(nb.t63.hc)) ? convertEnergyPerMass(parseNum(nb.t63.hc), nb.hcUnit, 'J/g') : NaN;
  const bombErr = Object.keys(w.evidence).filter((k) => k.startsWith('err:bomb:') && w.evidence[k]);
  const bomb = w.params.bombEnabled && !nb.bombSkipped ? [
    item('p6.bombProfile', !!w.evidence['bomb:profile'], 1, 'p6fb.bombProfile'),
    item('p6.bombInspect', !!w.evidence['bomb:inspected'], 1, 'p6fb.bombInspect'),
    item('p6.bombInterlocks', bombErr.length === 0, 2, 'p6fb.bombInterlocks', { list: bombErr.map((k) => k.replace('err:bomb:', '')).join(', ') }),
    item('p6.bombDone', !!w.evidence['bomb:opened'], 2, 'p6fb.bombDone'),
    item('p6.bombHc', !!eb && Number.isFinite(hcJ) && Math.abs(hcJ - eb.hcJPerG) <= eb.hcJPerG * 0.03, 3, 'p6fb.bombHc'),
    item('p6.bombConvention', nb.convention !== '' && answered(nb.conventionReason), 1, 'p6fb.bombConvention'),
  ] : [item('p6.bombSkipped', null, 1)];

  const components = [
    finalizeComponent('safety', P6_WEIGHTS.safety, safety),
    finalizeComponent('balance', P6_WEIGHTS.balance, balance),
    finalizeComponent('setup', P6_WEIGHTS.setup, setup),
    finalizeComponent('heating', P6_WEIGHTS.heating, heating),
    finalizeComponent('temperature', P6_WEIGHTS.temperature, temperature),
    finalizeComponent('calc', P6_WEIGHTS.calc, calc),
    finalizeComponent('interpretation', P6_WEIGHTS.interpretation, interpretation),
    finalizeComponent('bomb', P6_WEIGHTS.bomb, bomb),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = answeredN >= 4 ? ['p6.analysis'] : [];
  return { components, total, needsTeacherReview };
}
