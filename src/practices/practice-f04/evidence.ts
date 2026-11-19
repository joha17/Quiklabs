/**
 * Evidencia de F04 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un aparato no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F04World } from '../../simulation/f04-world/types';
import { answered, answeredCountF4, isNum, type F04Notebook } from './notebook';
import { massReading, scaleReading, tiltReading, validPairs, validRuns } from './expected-results';

export interface F04StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  massesWeighed: boolean;
  fbdDone: boolean;
  trackLevel: boolean;
  stringReady: boolean;
  gatesRead: boolean;
  sensorsReady: boolean;
  repeatedRuns: boolean;
  massRuns: boolean;
  pairsDone: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F04StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'massesWeighed', 'fbdDone', 'trackLevel', 'stringReady', 'gatesRead', 'sensorsReady', 'repeatedRuns', 'massRuns', 'pairsDone', 'stationClosed',
];

export const INSPECT_REQUIRED_F4 = ['track01', 'cart01', 'pulley01', 'hanger01', 'forceA', 'accel01', 'logger01', 'gate1', 'balance01', 'dynP'];

export function f04StageEvidence(w: F04World, nb: F04Notebook): F04StageFlags {
  const f = currentEvidenceF4(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** Cuántas configuraciones distintas (redondeadas a `step`) hay en un conjunto de valores. */
const distinct = (xs: number[], step: number) => new Set(xs.filter(Number.isFinite).map((x) => Math.round(x / step))).size;

function currentEvidenceF4(w: F04World, nb: F04Notebook): F04StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const runs = validRuns(w);
  const byCfg = new Map<number, number>();
  for (const r of runs) byCfg.set(r.configVersion, (byCfg.get(r.configVersion) ?? 0) + 1);
  const pairs = validPairs(w);
  const st = w.string;
  const fa = w.sensors.forceA;
  const C = nb.calc;
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F4.every(ins),
    massesWeighed: !!massReading(w, 'cart01') && !!massReading(w, 'hanger01'),
    fbdDone: !!w.evidence['fbdOk:cart'] && !!w.evidence['fbdOk:hanger'],
    trackLevel: !!w.evidence.trackLevel && !!tiltReading(w) && Math.abs(w.track.tiltDeg) <= 0.1,
    stringReady: (st.path === 'groove' && st.attached && st.hung && !st.held && st.clamped && !!w.evidence.taut) || !!w.evidence.stringOk,
    gatesRead: !!scaleReading(w, 'gate1') && !!scaleReading(w, 'gate2'),
    sensorsReady: w.sensors.accel01.connected && fa.connected && fa.zeroed && fa.calibrated && w.logger.gatesConnected && w.logger.rateHz >= 50,
    repeatedRuns: [...byCfg.values()].some((n) => n >= 3),
    massRuns: distinct(runs.map((r) => r.setup?.hangLoad ?? NaN), 1) >= 3,
    pairsDone: distinct(pairs.map((r) => Math.abs(r.pair?.FA ?? NaN)), 0.3) >= 2 && !!w.evidence['fbdOk:cartP'],
    tables: nb.runs.filter((r) => !!r.readingId && isNum(r.aGates)).length >= 3 && nb.massRuns.filter((r) => !!r.readingId && isNum(r.mh)).length >= 2 && nb.pairs.some((r) => !!r.readingId && isNum(r.sum)),
    calculations: isNum(C.aMean.value) && isNum(C.aMean.uncertainty) && isNum(C.aPred.value) && isNum(C.discrepancy.value) && isNum(C.slopeK.value) && isNum(C.sumF.value),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF4(nb) >= 3 && answered(nb.closure),
  };
}
