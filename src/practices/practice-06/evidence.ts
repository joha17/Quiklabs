/**
 * Evidencia de la Práctica 6 (§24.1, §26.1): banderas por etapa. La máquina avanza solo con evidencia; las etapas
 * experimentales quedan fijadas una vez cumplidas (vaciar el calorímetro no borra lo que ya se hizo).
 */
import type { P6World } from '../../simulation/calorimetry-world/types';
import { metalGAt, tubeInBath } from '../../simulation/calorimetry-world/world';
import { answered, filledAnalysis, parseNum, type P6Notebook } from './notebook';
import { readingsFor, runFor } from './expected-results';

export interface P6StageFlags {
  ppe: boolean;
  inspected: boolean;
  waterMass: boolean;
  calSetup: boolean;
  metalMass: boolean;
  bath: boolean;
  heating: boolean;
  transfer: boolean;
  mixing: boolean;
  peak: boolean;
  calculation: boolean;
  unknownRepeat: boolean;
  identification: boolean;
  bomb: boolean;
  report: boolean;
}

const LATCHED: Array<keyof P6StageFlags> = ['ppe', 'inspected', 'waterMass', 'calSetup', 'metalMass', 'bath', 'heating', 'transfer', 'mixing', 'peak', 'unknownRepeat', 'bomb'];

export function p6StageEvidence(w: P6World, nb: P6Notebook): P6StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

const num = (s: string) => Number.isFinite(parseNum(s));

function currentEvidence(w: P6World, nb: P6Notebook): P6StageFlags {
  const run0 = runFor(w, 'fe');
  const r = readingsFor(w, run0, 'fe');
  const runX = runFor(w, 'x');
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const anyTubeInBath = Object.keys(w.tubes).some((id) => tubeInBath(w, id).inBath && metalGAt(w, `tube:${id}`) > 0);
  const soaked = Object.values(w.tubes).some((t) => t.boilingSoakS >= w.params.minSoakS * 0.8);
  const fe = (row: 'waterMass' | 'qWater') => num(nb.t61[row].fe.value);
  const bombDone = !w.params.bombEnabled || nb.bombSkipped || (!!w.evidence['bomb:opened'] && num(nb.t63.hc));
  return {
    ppe: w.ppe,
    inspected: ins('balance') && ins('cylinder') && ins('tube_fe') && ins('therm_cal'),
    waterMass: !!(r.cylEmpty && r.cylWater) || !!run0,
    calSetup: (w.vessels.cup.waterG > 40 && w.objects.therm_cal.support === 'cup' && w.objects.stirrer.support === 'cup' && w.cal.lidClosed) || !!run0,
    metalMass: !!(r.tubeEmpty && r.tubeMetal) || !!run0,
    bath: (w.objects.beaker.support === 'plate' && w.vessels.beaker.waterG > 150 && w.objects.therm_bath.support === 'bath') || !!run0,
    heating: (anyTubeInBath && soaked) || !!run0,
    transfer: !!run0,
    mixing: !!run0 && ((w.evidence.stirS ?? 0) - (w.evidence[`stirAtRun:${run0.index}`] ?? 0) >= 3 || !!run0.recorded),
    peak: !!run0?.recorded,
    calculation: fe('waterMass') && num(nb.t62.metalMass.fe.value) && fe('qWater') && num(nb.t62.cExp.fe.value),
    unknownRepeat: !!runX?.recorded,
    identification: nb.identification.metal !== '' && num(nb.t62.cExp.x.value) && answered(nb.identification.reason),
    bomb: bombDone,
    report: filledAnalysis(nb) >= 3 && num(nb.activities.a2q) && num(nb.activities.a3Ti),
  };
}
