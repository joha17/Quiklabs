/**
 * Evidencia de F103 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un aparato no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F103World } from '../../simulation/f103-world/types';
import { answered, answeredCountF3, isNum, type F103Notebook } from './notebook';
import { angleReading, gateRuns, heightReading, impactRuns, markRuns, tapeReading } from './expected-results';

export interface F103StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  standAnchored: boolean;
  standLevel: boolean;
  protractorZeroed: boolean;
  setupMeasured: boolean;
  gateReady: boolean;
  velocityRuns: boolean;
  angleRuns: boolean;
  conditionRuns: boolean;
  trajectoryRuns: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F103StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'standAnchored', 'standLevel', 'protractorZeroed', 'setupMeasured', 'gateReady', 'velocityRuns', 'angleRuns', 'conditionRuns', 'trajectoryRuns', 'stationClosed',
];

export const INSPECT_REQUIRED_F3 = ['launcher01', 'stand01', 'gate01', 'timer01', 'platform01', 'screen01', 'floorTape01', 'heightRuler01'];

export function f103StageEvidence(w: F103World, nb: F103Notebook): F103StageFlags {
  const f = currentEvidenceF3(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** Las condiciones distintas de un conjunto de valores (redondeados a `step`). */
const distinct = (xs: number[], step: number) => new Set(xs.filter(Number.isFinite).map((x) => Math.round(x / step))).size;

function currentEvidenceF3(w: F103World, nb: F103Notebook): F103StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const gr = gateRuns(w);
  const ir = impactRuns(w);
  const mr = markRuns(w);
  const C = nb.calc;
  const notches = new Set(gr.map((r) => r.setup?.notch));
  const baseH = ir.length ? ir[0].setup?.standCm : undefined;
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F3.every(ins),
    standAnchored: !!w.evidence.anchored && w.stand.anchored,
    standLevel: !!w.evidence.standLevel,
    protractorZeroed: !!w.evidence.protractorZeroed && !!angleReading(w),
    setupMeasured: !!heightReading(w) && !!w.evidence.tapeAligned && !!tapeReading(w, 'plumb'),
    gateReady: !!w.evidence.gateMounted && !!w.evidence['connected:gate'] && Math.abs(w.gate.offsetMm) <= 2 && w.timer.rateHz >= 10000,
    velocityRuns: gr.length >= 3 && notches.size === 1,
    angleRuns: distinct(ir.filter((r) => r.setup?.standCm === baseH && (r.setup?.windMs ?? 0) < 1.4).map((r) => r.setup?.angleDeg ?? NaN), 2) >= 4,
    conditionRuns: distinct(ir.map((r) => r.setup?.standCm ?? NaN), 5) >= 2 && ir.some((r) => (r.setup?.windMs ?? 0) >= 1.4),
    trajectoryRuns: distinct(mr.map((r) => r.setup?.posCm ?? NaN), 10) >= 4,
    tables: nb.velocity.some((r) => !!r.readingId && isNum(r.v0)) && nb.angles.some((r) => !!r.readingId && isNum(r.R) && isNum(r.Rpred)) && nb.trajectory.filter((r) => !!r.readingId).length >= 3,
    calculations: isNum(C.v0Mean.value) && isNum(C.v0Mean.uncertainty) && isNum(C.rangeErr.value) && isNum(C.fitV0.value) && isNum(C.vx.value),
    contrast: answered(nb.contrastText),
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF3(nb) >= 3 && answered(nb.closure),
  };
}
