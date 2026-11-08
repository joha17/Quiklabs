/**
 * Evidencia de F101 (§5): predicados físicos fijados desde el estado (`stage:*`). Las etapas experimentales quedan
 * fijadas una vez cumplidas: desmontar un aparato no borra lo que ya se midió. Nunca hay un evento «Siguiente».
 */
import type { F101World } from '../../simulation/f101-world/types';
import { answered, answeredCount, isNum, type F101Notebook } from './notebook';
import { dimReadings, equilibriumReadings, massReading, readingsOf, standardReading, volumeReadings } from './expected-results';

export interface F101StageFlags {
  ppeReady: boolean;
  instrumentsInspected: boolean;
  zerosChecked: boolean;
  standardMeasured: boolean;
  cylDiameterRepeats: boolean;
  cylHeightRepeats: boolean;
  ballDiameterRepeats: boolean;
  balanceReady: boolean;
  cylMass: boolean;
  ballMass: boolean;
  volumeInitial: boolean;
  volumeFinal: boolean;
  equilibrium: boolean;
  vectorTable: boolean;
  calculations: boolean;
  contrast: boolean;
  stationClosed: boolean;
  reflection: boolean;
}

const LATCHED: Array<keyof F101StageFlags> = [
  'ppeReady', 'instrumentsInspected', 'zerosChecked', 'standardMeasured', 'cylDiameterRepeats', 'cylHeightRepeats', 'ballDiameterRepeats',
  'balanceReady', 'cylMass', 'ballMass', 'volumeInitial', 'volumeFinal', 'equilibrium', 'stationClosed',
];

export function f101StageEvidence(w: F101World, nb: F101Notebook): F101StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** Tres lecturas válidas y, para un diámetro, al menos dos «caras» (giros distintos de la pieza). */
function repeats(rs: ReturnType<typeof dimReadings>, faces: boolean): boolean {
  if (rs.length < 3) return false;
  if (!faces) return true;
  return new Set(rs.map((r) => Math.round(((r.spinDeg ?? 0) % 180) / 30))).size >= 2;
}

function currentEvidence(w: F101World, nb: F101Notebook): F101StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const vols = volumeReadings(w);
  const eq = equilibriumReadings(w);
  const rs = readingsOf(w);
  const S8 = w.scenarios.includes('F101-S08_oblique_forces');
  const eq3 = eq.filter((r) => (r.forces?.length ?? 0) >= 3 && (!S8 || (r.forces ?? []).every((x) => x.angleRead % 90 !== 0)));
  const contrastR = nb.contrastId ? w.readings[nb.contrastId] : null;
  const V = nb.vec;
  return {
    ppeReady: w.ppe,
    instrumentsInspected: ['caliper01', 'micrometer01', 'ruler01'].every(ins),
    zerosChecked: !!w.evidence.caliperZero && !!w.evidence.microZero,
    standardMeasured: !!standardReading(w),
    cylDiameterRepeats: repeats(dimReadings(w, 'cylD'), true),
    cylHeightRepeats: repeats(dimReadings(w, 'cylH'), false),
    ballDiameterRepeats: repeats(dimReadings(w, 'ballD'), false),
    balanceReady: !!w.evidence.balanceOn && !!w.evidence.tared && w.balance.levelErrorDeg < 0.5,
    cylMass: !!massReading(w, 'metalCyl01'),
    ballMass: !!massReading(w, 'steelBall01'),
    volumeInitial: !!vols.initial,
    volumeFinal: !!vols.final && !!w.evidence.meniscusEyeLevel,
    equilibrium: eq3.length > 0,
    vectorTable: !!nb.equilibriumId && isNum(V.Rx) && isNum(V.Ry) && isNum(V.R) && isNum(V.thetaR),
    calculations: isNum(nb.calc.volGeom.value) && isNum(nb.calc.rho.value) && isNum(nb.calc.rho.uncertainty) && isNum(nb.calc.volDisp.value),
    contrast: !!contrastR && (contrastR.kind === 'vector' || contrastR.kind === 'force') && rs.includes(contrastR),
    stationClosed: !!w.evidence.stationClosed,
    reflection: answeredCount(nb) >= 3 && answered(nb.closure),
  };
}
