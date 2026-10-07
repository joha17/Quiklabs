/**
 * Evidencia de la Práctica 10 (§29.1, §31.1): banderas por etapa. La máquina avanza solo con evidencia; las etapas
 * experimentales quedan fijadas una vez cumplidas (vaciar el reactor no borra lo que ya se hizo).
 */
import type { P10World } from '../../simulation/gas-world/types';
import { solveBurette } from '../../simulation/gas-world/world';
import { answered, filledAnalysis, parseNum, type P10Notebook } from './notebook';
import { massReadings, readingsForRun, runOf } from './expected-results';

export interface P10StageFlags {
  ppe: boolean;
  inventory: boolean;
  gasSetup: boolean;
  weighing: boolean;
  solution: boolean;
  aliquot: boolean;
  reactionSetup: boolean;
  generation: boolean;
  equilibration: boolean;
  measurements: boolean;
  rCalc: boolean;
  secondReplicate: boolean;
  boyleSetup: boolean;
  boyleCollection: boolean;
  curveAnalysis: boolean;
  activities: boolean;
  report: boolean;
}

const LATCHED: Array<keyof P10StageFlags> = [
  'ppe', 'inventory', 'gasSetup', 'weighing', 'solution', 'aliquot', 'reactionSetup', 'generation', 'equilibration', 'measurements', 'secondReplicate',
  'boyleSetup', 'boyleCollection',
];

export function p10StageEvidence(w: P10World, nb: P10Notebook): P10StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

const num = (s: string) => Number.isFinite(parseNum(s));

function measured(w: P10World, i: 0 | 1): boolean {
  const run = w.runs[i];
  if (!run) return false;
  const r = readingsForRun(w, run);
  return !!(r.final && r.temp && r.baro && r.height);
}

function currentEvidence(w: P10World, nb: P10Notebook): P10StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const m = massReadings(w);
  const b = w.burette;
  const s = b.inverted ? solveBurette(w) : null;
  const run1 = runOf(w, 'r1');
  return {
    ppe: w.ppe,
    inventory: ins('abalance') && ins('burette') && ins('hose') && ins('syringe'),
    gasSetup: (b.inverted && b.clamped && !!s?.mouthSubmerged && w.connections.c_tip.connectedTo !== null && !!w.evidence.aforo50) || !!run1,
    weighing: !!(m.empty && m.sample),
    solution: (w.liquids.flask.ml > w.flask.trueMarkMl - 0.2 && w.flask.mix > 0.95) || !!w.evidence.aliquotDelivered,
    aliquot: !!w.evidence.aliquotDelivered,
    reactionSetup: (!!w.connections.c_stopper.connectedTo && !!w.connections.c_hose_u.connectedTo && !!w.evidence.leakTested) || !!run1,
    generation: !!run1?.sealedAt,
    equilibration: !!w.evidence['reactionComplete:1'] && (b.stage === 'READABLE' || measured(w, 0)),
    measurements: measured(w, 0),
    rCalc: num(nb.t103.r.r1.value) && num(nb.t103.pCo2.r1.value) && num(nb.t103.vL.r1.value),
    secondReplicate: w.params.replicates < 2 || (measured(w, 1) && num(nb.t103.r.r2.value)),
    boyleSetup: w.syringe.connected || w.points.length > 0,
    boyleCollection: w.points.length >= 6,
    curveAnalysis: num(nb.fit.nFree) && nb.fit.better !== '' && answered(nb.fit.conclusion),
    activities: num(nb.activities.charles) && num(nb.activities.boyle) && num(nb.activities.idealN),
    report: filledAnalysis(nb) >= 3,
  };
}
