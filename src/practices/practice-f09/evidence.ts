/**
 * Evidencia de F09 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: retirar la masa orbitante no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 * Toda lectura que cuenta tiene `trialId` e `instrumentId` desde su creación.
 */
import type { F09World } from '../../simulation/f09-world/types';
import { answered, answeredCountF9, isNum, type CircRow, type F09Notebook, type TorqueRow } from './notebook';
import { circPairs, massReading, momentumPairs, radiusReadings, torquePairs } from './expected-results';

export interface F09StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  massesWeighed: boolean;
  radiusMeasured: boolean;
  supportReady: boolean;
  sensorsReady: boolean;
  circDone: boolean;
  torqueDone: boolean;
  momentumDone: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F09StageFlags> = ['ppeReady', 'instrumentsInspected', 'massesWeighed', 'radiusMeasured', 'supportReady', 'sensorsReady', 'circDone', 'torqueDone', 'momentumDone', 'stationClosed'];

export const INSPECT_REQUIRED_F9 = ['base01', 'level01', 'guard01', 'hub01', 'guide01', 'orbit01', 'slide1', 'drum01', 'dyn01', 'brake01', 'motor01', 'force01', 'gate01', 'encoder01', 'logger01', 'balance01'];

export function f09StageEvidence(w: F09World, nb: F09Notebook): F09StageFlags {
  const f = currentEvidenceF9(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

const circOk = (r: CircRow) => !!r.forceId && !!r.periodId && isNum(r.T) && isNum(r.omega) && isNum(r.Fpred);
const torqueOk = (r: TorqueRow) => !!r.dynId && !!r.encId && isNum(r.tau) && isNum(r.alpha) && isNum(r.I);

function currentEvidenceF9(w: F09World, nb: F09Notebook): F09StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const f = w.force;
  const C = nb.calc;
  const M = nb.momentum;
  const speeds = new Set(circPairs(w).map((x) => Math.round(Math.abs(x.p.value / (x.p.turns ?? 1)) * 100)));
  const torques = new Set(torquePairs(w).map((x) => Math.round((x.e.setup?.armR ?? 0) * (x.e.setup?.pullN ?? 0) * 1000)));
  const slideRadii = new Set(radiusReadings(w, 'slide1').map((r) => Math.round(r.value)));
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F9.every(ins),
    massesWeighed: !!massReading(w, 'orbit01') && !!massReading(w, 'slide1'),
    radiusMeasured: radiusReadings(w, 'orbit01').length >= 1 && radiusReadings(w, 'arm').length >= 1,
    supportReady: w.base.clamped && w.rotor.tiltDeg <= 0.5 && w.orbit.slackM === 0 && !!w.evidence.stopLocked && !!w.evidence.cordTight && !w.damaged,
    sensorsReady: f.connected && f.zeroed && f.angleDeg < 3 && f.rangeIdx >= 1 && w.gate.connected && w.gate.cableRouted && w.encoder.connected && w.encoder.calibrated && w.logger.rateHz >= 50 && w.dyn.zeroed,
    circDone: speeds.size >= 4,
    torqueDone: torques.size >= 2,
    momentumDone: momentumPairs(w).length >= 1 && slideRadii.size >= 2,
    tables: nb.circRows.filter(circOk).length >= 4 && nb.torqueRows.filter(torqueOk).length >= 2 && !!M.w1Id && !!M.w2Id && !!M.r1Id && !!M.r2Id && isNum(M.L1) && isNum(M.L2) && isNum(M.K1) && isNum(M.K2),
    calculations: isNum(C.mr.value) && isNum(C.mr.uncertainty) && isNum(C.mrPred.value) && isNum(C.Itorque.value) && isNum(C.Itorque.uncertainty) && isNum(C.I0.value) && isNum(C.Lratio.value) && isNum(C.Kratio.value) && isNum(C.tauFc.value),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF9(nb) >= 3 && answered(nb.closure),
  };
}
