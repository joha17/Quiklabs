/**
 * Evidencia de F07 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un aparato no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F07World } from '../../simulation/f07-world/types';
import { answered, answeredCountF7, isNum, type F07Notebook } from './notebook';
import { massReading, validElastic, validForces, validLevels, validMotions, validStick } from './expected-results';

export interface F07StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  cartsWeighed: boolean;
  trackLeveled: boolean;
  gatesReady: boolean;
  sensorReady: boolean;
  elasticDone: boolean;
  impulseMeasured: boolean;
  stickDone: boolean;
  cmDone: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F07StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'cartsWeighed', 'trackLeveled', 'gatesReady', 'sensorReady', 'elasticDone', 'impulseMeasured', 'stickDone', 'cmDone', 'stationClosed',
];

export const INSPECT_REQUIRED_F7 = ['track01', 'ends01', 'launcherA', 'level01', 'cartA', 'cartB', 'bumpers01', 'gateA', 'gateB', 'force01', 'logger01', 'camera01', 'balance01', 'caliper01'];

export function f07StageEvidence(w: F07World, nb: F07Notebook): F07StageFlags {
  const f = currentEvidenceF7(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

function currentEvidenceF7(w: F07World, nb: F07Notebook): F07StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const s = w.sensor;
  const lg = w.logger;
  const C = nb.calc;
  const el = validElastic(w);
  // Tres choques elásticos con el mismo montaje (paragolpes y masas).
  const groups = new Map<string, number>();
  for (const r of el) {
    const k = `${r.setup?.bumper}|${r.setup?.mA}|${r.setup?.mB}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F7.every(ins),
    cartsWeighed: !!massReading(w, 'cartA') && !!massReading(w, 'cartB'),
    trackLeveled: validLevels(w).some((r) => Math.abs(r.value) <= 0.1),
    gatesReady: lg.gatesConnected && w.track.gatesClamped && !!w.evidence['flag:cartA'] && !!w.evidence['flag:cartB'],
    sensorReady: s.connected && s.zeroed && s.calibrated && s.rangeIdx >= 1 && s.angleDeg < 3 && lg.rateHz >= 1000,
    elasticDone: [...groups.values()].some((x) => x >= 3),
    impulseMeasured: validForces(w).some((r) => r.setup?.bumper !== 'velcro'),
    stickDone: validStick(w).length >= 1,
    cmDone: validMotions(w).some((r) => (r.setup?.loadA ?? 0) + (r.setup?.loadB ?? 0) > 0),
    tables:
      nb.elasticRows.filter((r) => !!r.readingId && isNum(r.dp) && isNum(r.e)).length >= 3 && !!nb.stick.readingId && isNum(nb.stick.vf) && isNum(nb.stick.Klost) &&
      !!nb.impulse.forceId && !!nb.impulse.readingId && isNum(nb.impulse.J1) && isNum(nb.impulse.dp1) && !!nb.cm.readingId && isNum(nb.cm.vBefore) && isNum(nb.cm.vAfter),
    calculations: isNum(C.dp.value) && isNum(C.dp.uncertainty) && isNum(C.e.value) && isNum(C.e.uncertainty) && isNum(C.J.value) && isNum(C.J.uncertainty) && isNum(C.Klost.value) && isNum(C.vcm.value) && isNum(C.impDisc.value),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF7(nb) >= 3 && answered(nb.closure),
  };
}
