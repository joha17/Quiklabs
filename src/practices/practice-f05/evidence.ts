/**
 * Evidencia de F05 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un aparato no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F05World, ReadingF5 } from '../../simulation/f05-world/types';
import { cableDegF5 } from '../../simulation/f05-world/world';
import { answered, answeredCountF5, isNum, type F05Notebook } from './notebook';
import { massReading, scaleReading, tempReading, validAngles, validMeans, validPeaks, validSlides } from './expected-results';

export interface F05StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  massesWeighed: boolean;
  fbdDone: boolean;
  sensorReady: boolean;
  cableAligned: boolean;
  staticRuns: boolean;
  kineticRuns: boolean;
  loadSweep: boolean;
  criticalAngles: boolean;
  gatesRead: boolean;
  slideDone: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F05StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'massesWeighed', 'fbdDone', 'sensorReady', 'cableAligned', 'staticRuns', 'kineticRuns', 'loadSweep', 'criticalAngles', 'gatesRead', 'slideDone',
  'stationClosed',
];

export const INSPECT_REQUIRED_F5 = ['plane01', 'block01', 'puller01', 'load01', 'gonio01', 'elevator01', 'logger01', 'gate1', 'balance01', 'thermo01'];

export function f05StageEvidence(w: F05World, nb: F05Notebook): F05StageFlags {
  const f = currentEvidenceF5(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** ¿Hay `n` lecturas con el mismo material y la misma carga? */
function sameGroup(rs: ReadingF5[], n: number): boolean {
  const g = new Map<string, number>();
  for (const r of rs) {
    const k = `${r.setup?.material}:${r.setup?.loadG}`;
    g.set(k, (g.get(k) ?? 0) + 1);
  }
  return [...g.values()].some((x) => x >= n);
}

function currentEvidenceF5(w: F05World, nb: F05Notebook): F05StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const s = w.sensor;
  const means = validMeans(w);
  const C = nb.calc;
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F5.every(ins),
    massesWeighed: !!massReading(w, 'block01') && (!!massReading(w, 'w250a') || !!massReading(w, 'w250b')) && !!tempReading(w),
    fbdDone: !!w.evidence['fbdOk:blockPull'] && !!w.evidence['fbdOk:blockSlide'],
    sensorReady: s.connected && s.zeroed && s.calibrated && s.angleDeg < 3 && w.logger.rateHz >= 50,
    cableAligned: !!w.evidence.cableAligned || (w.puller.attached && Math.abs(cableDegF5(w)) <= 3),
    staticRuns: sameGroup(validPeaks(w), 3),
    kineticRuns: sameGroup(means, 3),
    loadSweep: new Set(means.map((r) => r.setup?.loadG)).size >= 3,
    criticalAngles: new Set(validAngles(w).map((r) => r.angle?.material)).size >= 2,
    gatesRead: !!scaleReading(w, 'gate1') && !!scaleReading(w, 'gate2'),
    slideDone: validSlides(w).length >= 1,
    tables:
      nb.staticRows.filter((r) => !!r.readingId && isNum(r.muS)).length >= 3 && nb.kineticRows.filter((r) => !!r.readingId && isNum(r.muK)).length >= 3 &&
      nb.loadRows.filter((r) => !!r.readingId && isNum(r.N)).length >= 3 && nb.angleRows.filter((r) => !!r.readingId && isNum(r.muS)).length >= 2 && !!nb.slide.readingId && isNum(nb.slide.muK),
    calculations: isNum(C.muS.value) && isNum(C.muS.uncertainty) && isNum(C.muK.value) && isNum(C.muK.uncertainty) && isNum(C.slopeMu.value) && isNum(C.thetaPred.value) && isNum(C.Wfr.value),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF5(nb) >= 3 && answered(nb.closure),
  };
}
