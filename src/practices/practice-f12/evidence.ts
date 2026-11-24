/**
 * Evidencia de F12 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: cambiar el tramo o apagar la bomba no borra lo que ya se midió. Nunca hay un evento
 * «Siguiente». Toda lectura que cuenta tiene `trialId` e `instrumentId` desde su creación.
 */
import type { F12World } from '../../simulation/f12-world/types';
import { leakingF12 } from '../../simulation/f12-world/world';
import { answered, answeredCountF12, isNum, type F12Notebook, type FlowRow, type LossRow } from './notebook';
import { diameterOf, distinctFlows, flowPoints, heightOf, meterDuringCollect, staticSets, sumpLevelOf, timeOf, volumeOf } from './expected-results';

export interface F12StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  circuitReady: boolean;
  calibrated: boolean;
  flowSeries: boolean;
  volumetric: boolean;
  lossSeries: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F12StageFlags> = ['ppeReady', 'instrumentsInspected', 'circuitReady', 'calibrated', 'flowSeries', 'volumetric', 'lossSeries', 'stationClosed'];

export const INSPECT_REQUIRED_F12 = [
  'sump01', 'pump01', 'meter01', 'jointJ1', 'jointJ2', 'jointJ3', 'venturi01', 'clamp01', 'spool01', 'tap1', 'tap2', 'tap3', 'purge01', 'valve01', 'outlet01', 'beaker01',
  'timer01', 'panel01', 'logger01', 'ruler01', 'caliper01',
];

export function f12StageEvidence(w: F12World, nb: F12Notebook): F12StageFlags {
  const f = currentEvidenceF12(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

const fOk = (r: FlowRow) => !!r.qId && !!r.p1Id && !!r.p2Id && isNum(r.v1) && isNum(r.v2) && isNum(r.dp12) && isNum(r.dp12Pred);
const lOk = (r: LossRow) => !!r.qId && !!r.p1Id && !!r.p3Id && isNum(r.v1) && isNum(r.dp13) && isNum(r.K);

function currentEvidenceF12(w: F12World, nb: F12Notebook): F12StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const c = w.circuit;
  const C = nb.calc;
  const sealed = (['J1', 'J2', 'J3'] as const).every((j) => c.joints[j].connected && c.joints[j].gasket) && !leakingF12(w);
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F12.every(ins),
    // Etapa 1: circuito cerrado con empaquetaduras, sin aire, purga cerrada y nivel del depósito leído después de llenar.
    circuitReady: sealed && c.airCm3 < 5 && !c.purgeOpen && !!sumpLevelOf(w),
    // Etapa 2: diámetros internos, cotas de las tomas y referencia de presión con la bomba detenida.
    calibrated: !!diameterOf(w, 'D1') && !!diameterOf(w, 'D2') && !!heightOf(w, 1) && !!heightOf(w, 3) && staticSets(w).length >= 1,
    flowSeries: distinctFlows(flowPoints(w, 'smooth')).size >= 5,
    volumetric: !!volumeOf(w) && !!timeOf(w) && !!meterDuringCollect(w),
    lossSeries: distinctFlows(flowPoints(w, 'rough')).size >= 3,
    tables: nb.flowRows.filter(fOk).length >= 5 && nb.lossRows.filter(lOk).length >= 3,
    calculations: isNum(C.Qvol.value) && isNum(C.Qvol.uncertainty) && isNum(C.QDev.value) && isNum(C.rhoFit.value) && isNum(C.rhoFit.uncertainty) && isNum(C.K.value),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF12(nb) >= 3 && answered(nb.closure),
  };
}
