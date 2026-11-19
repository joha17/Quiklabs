/**
 * Evidencia de F06 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un aparato no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F06World, ReadingF6 } from '../../simulation/f06-world/types';
import { springAt } from '../../simulation/f06-world/world';
import { answered, answeredCountF6, isNum, type F06Notebook } from './notebook';
import { massReading, validGates, validHeights, validLaunches, validPendulums, validRulers } from './expected-results';

export interface F06StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  massesWeighed: boolean;
  springCalibrated: boolean;
  springMounted: boolean;
  sensorReady: boolean;
  energyStored: boolean;
  heightsExplored: boolean;
  pendulumDone: boolean;
  lossesObserved: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F06StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'massesWeighed', 'springCalibrated', 'springMounted', 'sensorReady', 'energyStored', 'heightsExplored', 'pendulumDone', 'lossesObserved', 'stationClosed',
];

export const INSPECT_REQUIRED_F6 = ['stand01', 'ruler01', 'spring01', 'launcher01', 'cart01', 'track01', 'gauge01', 'force01', 'pos01', 'logger01', 'gate1', 'gate2', 'pend01', 'balance01'];

export function f06StageEvidence(w: F06World, nb: F06Notebook): F06StageFlags {
  const f = currentEvidenceF6(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** ¿Hay `n` lecturas con la misma clave? */
function sameKey(rs: ReadingF6[], key: (r: ReadingF6) => string, n: number): boolean {
  const g = new Map<string, number>();
  for (const r of rs) g.set(key(r), (g.get(key(r)) ?? 0) + 1);
  return [...g.values()].some((x) => x >= n);
}

function currentEvidenceF6(w: F06World, nb: F06Notebook): F06StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const s = w.sensor;
  const lg = w.logger;
  const gates = validGates(w);
  const ideal = gates.filter((r) => !r.setup?.losses);
  const C = nb.calc;
  const sp = springAt(w, 'launcher');
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F6.every(ins),
    massesWeighed: !!massReading(w, 'cart01') && !!massReading(w, 'hanger01') && SLOT_IDS.some((m) => !!massReading(w, m)),
    springCalibrated: new Set(validRulers(w).map((r) => r.setup?.slots)).size >= 4,
    springMounted: !!sp && w.track.springSecured,
    sensorReady: s.connected && s.zeroed && s.calibrated && s.rangeIdx >= 1 && s.angleDeg < 3 && lg.posConnected && lg.gatesConnected && lg.synced && lg.rateHz >= 1000,
    energyStored: sameKey(validLaunches(w), (r) => String(r.setup?.compression), 3) && sameKey(ideal, (r) => String(r.setup?.heightVersion), 3),
    heightsExplored: new Set(ideal.map((r) => r.setup?.h)).size >= 3 && new Set(validHeights(w).map((r) => r.setup?.h)).size >= 3,
    pendulumDone: new Set(validPendulums(w).map((r) => r.pend?.theta0)).size >= 2,
    lossesObserved: gates.some((r) => r.setup?.losses),
    tables:
      nb.springRows.filter((r) => !!r.readingId && isNum(r.F)).length >= 4 && nb.launchRows.filter((r) => !!r.readingId && isNum(r.W) && isNum(r.Uel)).length >= 3 &&
      nb.repRows.filter((r) => !!r.readingId && isNum(r.K1)).length >= 3 && nb.heightRows.filter((r) => !!r.readingId && !!r.heightId && isNum(r.Ug) && isNum(r.K2)).length >= 3 &&
      !!nb.loss.readingId && isNum(nb.loss.Wnc) && nb.pendRows.filter((r) => !!r.readingId && isNum(r.v) && isNum(r.h)).length >= 2,
    calculations: isNum(C.k.value) && isNum(C.k.uncertainty) && isNum(C.W.value) && isNum(C.W.uncertainty) && isNum(C.K1.value) && isNum(C.K1.uncertainty) && isNum(C.eff.value) && isNum(C.Wnet.value) && isNum(C.Pmax.value),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF6(nb) >= 3 && answered(nb.closure),
  };
}

const SLOT_IDS = ['m100a', 'm100b', 'm100c', 'm100d'];
