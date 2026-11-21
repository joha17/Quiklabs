/**
 * Evidencia de F11 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: vaciar el tanque o guardar los objetos no borra lo que ya se midió. Nunca hay un evento
 * «Siguiente». Toda lectura que cuenta tiene `trialId` e `instrumentId` desde su creación.
 */
import type { F11World } from '../../simulation/f11-world/types';
import { answered, answeredCountF11, isNum, type BuoyRow, type F11Notebook, type FloatRow, type PRow } from './notebook';
import {
  airWeightOf, buoyPairs, catchMassOf, cylMassOf, cylVolumeOf, floatDrafts, floatKey, levelOf, profileDepths, sankDrafts, surfaceReadings,
} from './expected-results';

export interface F11StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  tankFilled: boolean;
  profileA: boolean;
  profileB: boolean;
  densityCyl: boolean;
  buoyancy: boolean;
  flotation: boolean;
  tables: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F11StageFlags> = ['ppeReady', 'instrumentsInspected', 'tankFilled', 'profileA', 'profileB', 'densityCyl', 'buoyancy', 'flotation', 'stationClosed'];

export const INSPECT_REQUIRED_F11 = ['tank01', 'tapA', 'resB', 'pumpB', 'drain01', 'agitator01', 'scale01', 'guide01', 'probe01', 'ruler01', 'logger01', 'float1', 'bottle1', 'alu1', 'balance01', 'cyl01', 'can01', 'catch01', 'dyn01', 'stand01'];

export function f11StageEvidence(w: F11World, nb: F11Notebook): F11StageFlags {
  const f = currentEvidenceF11(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

const pOk = (r: PRow) => !!r.pId && !!r.zId && isNum(r.h) && isNum(r.p);
const bOk = (r: BuoyRow) => !!r.fId && !!r.iId && isNum(r.Vsub) && isNum(r.Fb) && isNum(r.FbPred);
const fOk = (r: FloatRow) => !!r.mId && !!r.dId && isNum(r.rho) && isNum(r.fPred) && isNum(r.fMeas);

function currentEvidenceF11(w: F11World, nb: F11Notebook): F11StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const C = nb.calc;
  const floaters = new Set(floatDrafts(w).map(floatKey));
  return {
    ppeReady: w.ppe,
    instrumentsInspected: INSPECT_REQUIRED_F11.every(ins),
    // Etapa 1: tanque lleno por vertido (nivel leído) y referencia de presión en la superficie.
    tankFilled: !!levelOf(w, 'A') && surfaceReadings(w).length >= 1,
    profileA: profileDepths(w, 'A').size >= 5,
    profileB: profileDepths(w, 'B').size >= 5 && !!levelOf(w, 'B'),
    densityCyl: !!cylMassOf(w) && !!cylVolumeOf(w),
    buoyancy: !!airWeightOf(w) && new Set(buoyPairs(w).map((x) => Math.round(x.i.value * 10))).size >= 4 && !!catchMassOf(w),
    flotation: floaters.size >= 2 && sankDrafts(w).length >= 1,
    tables: nb.pARows.filter(pOk).length >= 5 && nb.pBRows.filter(pOk).length >= 5 && nb.buoyRows.filter(bOk).length >= 4 && nb.floatRows.filter(fOk).length >= 3,
    calculations: isNum(C.rhoA.value) && isNum(C.rhoA.uncertainty) && isNum(C.rhoB.value) && isNum(C.rhoB.uncertainty) && isNum(C.rhoCyl.value) && isNum(C.rhoCyl.uncertainty) && isNum(C.FbDev.value),
    contrast: answered(nb.contrastText) && !!nb.mcq,
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCountF11(nb) >= 3 && answered(nb.closure),
  };
}
