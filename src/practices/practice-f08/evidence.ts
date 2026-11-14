/**
 * Evidencia de F08 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un sólido no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F08World } from '../../simulation/f08-world/types';
import { answered, answeredCountF8, isNum, type F08Notebook } from './notebook';
import { lengthReading, massReading, radiusReadings, validGates, validRuns, validTachs, validTensions } from './expected-results';

export interface F08StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  massesWeighed: boolean;
  solidsMeasured: boolean;
  supportReady: boolean;
  encoderReady: boolean;
  sensorsReady: boolean;
  axleDone: boolean;
  diskDone: boolean;
  tensionMeasured: boolean;
  ringDone: boolean;
  energyDone: boolean;
  massesDone: boolean;
  parallelDone: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F08StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'massesWeighed', 'solidsMeasured', 'supportReady', 'encoderReady', 'sensorsReady', 'axleDone', 'diskDone', 'tensionMeasured', 'ringDone', 'energyDone',
  'massesDone', 'parallelDone', 'stationClosed',
];

export const INSPECT_REQUIRED_F8 = ['base01', 'guard01', 'hub01', 'disc01', 'ring01', 'bar01', 'pulley01', 'column01', 'gate01', 'encoder01', 'tach01', 'tension01', 'logger01', 'balance01', 'caliper01'];

export function f08StageEvidence(w: F08World, nb: F08Notebook): F08StageFlags {
  const f = currentEvidenceF8(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

const runRowOk = (r: { readingId: string | null; alpha: string; T: string; I: string }) => !!r.readingId && isNum(r.alpha) && isNum(r.T) && isNum(r.I);

function currentEvidenceF8(w: F08World, nb: F08Notebook): F08StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const e = w.encoder;
  const t = w.tension;
  const C = nb.calc;
  // Masas corredizas: dos ensayos válidos con la barra simétrica y fijada a radios distintos, con la regla radial leída.
  const radii = new Set(validRuns(w, 'bar').map((r) => Math.round((r.setup?.slides?.[0] ?? 0) * 1000)));
  const anyDrop = ['drop20', 'drop50', 'drop100'].some((d) => !!massReading(w, d));
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F8.every(ins),
    massesWeighed: !!massReading(w, 'disc01') && !!massReading(w, 'ring01') && anyDrop && !!massReading(w, 'slide1'),
    solidsMeasured: ['disc01', 'ring01', 'drum', 'flag', 'hole'].every((k) => !!lengthReading(w, k)),
    supportReady: w.base.clamped && Math.abs(w.string.pulleyDzCm) < 0.5 && w.column.catchOn,
    encoderReady: e.connected && e.calibrated && e.zeroed && Math.abs(e.zeroErr) <= Math.PI / 180 && e.dir === 1,
    sensorsReady: t.connected && t.zeroed && t.angleDeg < 3 && w.tach.connected && w.tach.rangeIdx >= 1 && w.logger.gateConnected && w.logger.rateHz >= 50,
    axleDone: validRuns(w, 'axle').length >= 1,
    diskDone: validRuns(w, 'disc').length >= 3,
    tensionMeasured: validTensions(w).length >= 1,
    ringDone: validRuns(w, 'ring').length >= 1,
    energyDone: validGates(w).length >= 1 && validTachs(w).length >= 1,
    massesDone: radii.size >= 2 && radiusReadings(w).length >= 2,
    parallelDone: validRuns(w, 'parallel').length >= 1,
    tables:
      runRowOk(nb.axle) && nb.diskRows.filter(runRowOk).length >= 3 && runRowOk(nb.ring) && nb.massRows.filter((r) => runRowOk(r) && !!r.rId).length >= 2 && runRowOk(nb.parallel) &&
      !!nb.tension.readingId && isNum(nb.tension.Tmodel) && !!nb.energy.readingId && isNum(nb.energy.v) && isNum(nb.energy.bal),
    calculations:
      isNum(C.Ipred.value) && isNum(C.Idisk.value) && isNum(C.Idisk.uncertainty) && isNum(C.Iring.value) && isNum(C.Iring.uncertainty) && isNum(C.ratio.value) && isNum(C.Ebal.value) &&
      isNum(C.parDisc.value) && isNum(C.slope.value) && isNum(C.slope.uncertainty),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF8(nb) >= 3 && answered(nb.closure),
  };
}
