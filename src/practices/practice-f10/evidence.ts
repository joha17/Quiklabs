/**
 * Evidencia de F10 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: guardar la viga o desmontar la probeta no borra lo que ya se midió. Nunca hay un evento
 * «Siguiente». Toda lectura que cuenta tiene `trialId` e `instrumentId` desde su creación.
 */
import type { F10World } from '../../simulation/f10-world/types';
import { answered, answeredCountF10, isNum, type ElRow, type EqRow, type F10Notebook } from './notebook';
import { diameterOf, elasticPairs, eqTriples, residualReadings, reversibleReadings, validCurves, validReactions, validTapes, weightOf } from './expected-results';

export interface F10StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  weighed: boolean;
  cgFound: boolean;
  supportsReady: boolean;
  equilibriumDone: boolean;
  armDone: boolean;
  pressReady: boolean;
  elasticDone: boolean;
  plasticDone: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F10StageFlags> = ['ppeReady', 'instrumentsInspected', 'weighed', 'cgFound', 'supportsReady', 'equilibriumDone', 'armDone', 'pressReady', 'elasticDone', 'plasticDone', 'stationClosed'];

export const INSPECT_REQUIRED_F10 = ['beam01', 'supportA', 'supportB', 'load1', 'dyn01', 'wedge01', 'level01', 'tape01', 'caliper01', 'press01', 'spec1', 'crank01', 'loadCell01', 'gauge01', 'shield01', 'logger01'];

export function f10StageEvidence(w: F10World, nb: F10Notebook): F10StageFlags {
  const f = currentEvidenceF10(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

const eqOk = (r: EqRow) => !!r.raId && !!r.rbId && !!r.xId && isNum(r.RbPred) && isNum(r.RaPred) && isNum(r.sumF) && isNum(r.tauA);
const elOk = (r: ElRow) => !!r.fId && !!r.eId && isNum(r.sigma) && isNum(r.eps);

function currentEvidenceF10(w: F10World, nb: F10Notebook): F10StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const C = nb.calc;
  const P = nb.plastic;
  const g = w.gauge;
  const pr = w.press;
  const positions = new Set(eqTriples(w).map((t) => Math.round(t.x.value)));
  const forces = new Set(elasticPairs(w).map((x) => Math.round(x.f.value / 20)));
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F10.every(ins),
    weighed: !!weightOf(w, 'beam') && !!weightOf(w, 'load1'),
    cgFound: validTapes(w, 'cg').length >= 1,
    // Por lecturas (persisten aunque luego se guarde la viga): una reacción válida con la viga asentada en apoyos trabados.
    supportsReady: validReactions(w).some((r) => !!r.setup?.seated && !!r.setup.clamped?.every(Boolean)) && validTapes(w, 'supA').length >= 1 && validTapes(w, 'supB').length >= 1,
    equilibriumDone: positions.size >= 1,
    armDone: positions.size >= 3,
    pressReady:
      !!pr.specimen && pr.gripTop && pr.gripBottom && pr.eccMm <= 0.02 && pr.preloadMm === 0 && g.mounted === 'axial' && g.connected && g.zeroed && g.calibrated && g.angleDeg < 3 && g.cableRouted &&
      w.loadCell.connected && w.loadCell.zeroed && w.loadCell.rangeIdx >= 1 && w.logger.rateHz >= 20 && pr.shieldClosed && !!diameterOf(w) && validTapes(w, 'L0').length >= 1,
    elasticDone: forces.size >= 5 && reversibleReadings(w).length >= 1,
    plasticDone: validCurves(w).length >= 1 && residualReadings(w).length >= 1,
    tables: nb.eqRows.filter(eqOk).length >= 3 && nb.elRows.filter(elOk).length >= 5 && !!P.revId && !!P.curveId && !!P.resId && isNum(P.epsRev) && isNum(P.sigmaMax) && isNum(P.epsRes),
    calculations: isNum(C.E.value) && isNum(C.E.uncertainty) && isNum(C.Edev.value) && isNum(C.W1slope.value) && isNum(C.W1slope.uncertainty),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF10(nb) >= 3 && answered(nb.closure),
  };
}
