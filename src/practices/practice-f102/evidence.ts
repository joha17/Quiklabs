/**
 * Evidencia de F102 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un aparato no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F102World } from '../../simulation/f102-world/types';
import { answered, answeredCountF2, isNum, type F102Notebook } from './notebook';
import { fallRuns, gateRuns, motionRuns, rulerReading, tapeRuns } from './expected-results';

export interface F102StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  inclinometerZeroed: boolean;
  trackLevel: boolean;
  gatesReady: boolean;
  setupMeasured: boolean;
  uniformRuns: boolean;
  accelRuns: boolean;
  fallRuns: boolean;
  dragRuns: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F102StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'inclinometerZeroed', 'trackLevel', 'gatesReady', 'setupMeasured', 'uniformRuns', 'accelRuns', 'fallRuns', 'dragRuns', 'stationClosed',
];

export function f102StageEvidence(w: F102World, nb: F102Notebook): F102StageFlags {
  const f = currentEvidenceF2(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** Las condiciones distintas de un conjunto de valores (redondeados a `step`). */
const distinct = (xs: number[], step: number) => new Set(xs.filter(Number.isFinite).map((x) => Math.round(x / step))).size;

function currentEvidenceF2(w: F102World, nb: F102Notebook): F102StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const gr = gateRuns(w);
  const fr = fallRuns(w);
  const mr = motionRuns(w);
  const C = nb.calc;
  return {
    ppeReady: w.ppe,
    instrumentsInspected: ['track01', 'gate1', 'gate2', 'gateTimer01', 'inclinometer01'].every(ins),
    inclinometerZeroed: !!w.evidence.inclinometerZeroed,
    trackLevel: !!w.evidence.trackLevel,
    gatesReady: !!w.evidence['connected:gate1'] && !!w.evidence['connected:gate2'] && Object.values(w.gates).every((g) => Math.abs(g.yawDeg) <= 3),
    setupMeasured: !!rulerReading(w, 'gate1') && !!rulerReading(w, 'gate2') && !!rulerReading(w, 'flag'),
    uniformRuns: gr.length >= 3 && distinct(gr.map((r) => r.setup?.gateSepCm ?? NaN), 5) >= 2,
    accelRuns: tapeRuns(w).length >= 3,
    fallRuns: fr.length >= 3 && distinct(fr.map((r) => r.setup?.hCm ?? NaN), 5) >= 2,
    dragRuns: mr.length >= 2 && distinct(mr.map((r) => r.setup?.filters ?? NaN), 1) >= 2,
    tables: nb.uniform.some((r) => !!r.readingId && isNum(r.v1)) && nb.accel.some((r) => !!r.readingId && isNum(r.a)) && nb.fall.some((r) => !!r.readingId && isNum(r.g)),
    calculations: isNum(C.aMean.value) && isNum(C.aPred.value) && isNum(C.gMean.value) && isNum(C.gMean.uncertainty),
    contrast: answered(nb.contrastText),
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF2(nb) >= 3 && answered(nb.closure),
  };
}
