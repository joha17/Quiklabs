/**
 * Evidencia de la Práctica 1 (§5): banderas por etapa que leen la máquina, la rúbrica y la entrega. Las etapas
 * experimentales quedan fijadas una vez cumplidas (`stage:*`): vaciar un recipiente no borra lo que ya se hizo.
 */
import type { P01World } from '../../simulation/density-world/types';
import { nailsSubmergedFraction } from '../../simulation/density-world/world';
import { INSTRUMENTS_A, answered, answeredCount, isNum, type P01Notebook } from './notebook';
import { caliperReadings, cylinderMassReadings, displacementReadings, nailMassReadings, sampleOf, sampleReadings, trialReadings } from './expected-results';

export interface P01StageFlags {
  ppeReady: boolean;
  identifiedInstruments: boolean;
  scaleCompared: boolean;
  balanceChecked: boolean;
  waterAmbientSampled: boolean;
  waterColdSampled: boolean;
  twoMassReadings: boolean;
  twoThermometerReadings: boolean;
  waterTableComplete: boolean;
  nailsNetMass: boolean;
  initialLevelRead: boolean;
  nailsSubmerged: boolean;
  finalLevelRead: boolean;
  displacementAnalysis: boolean;
  watchGlassMass: boolean;
  cylinderCombinedMass: boolean;
  caliperDiameterRepeats: boolean;
  caliperHeightRepeats: boolean;
  cylinderDensity: boolean;
  allRequiredTables: boolean;
  calculationsPresent: boolean;
  reflectionRecorded: boolean;
}

/** Etapas experimentales que se fijan (las de la libreta pueden cambiar mientras se edita). */
const LATCHED: Array<keyof P01StageFlags> = [
  'ppeReady', 'identifiedInstruments', 'scaleCompared', 'balanceChecked', 'waterAmbientSampled', 'waterColdSampled', 'twoMassReadings', 'twoThermometerReadings',
  'nailsNetMass', 'initialLevelRead', 'nailsSubmerged', 'finalLevelRead', 'watchGlassMass', 'cylinderCombinedMass', 'caliperDiameterRepeats', 'caliperHeightRepeats',
];

export function p01StageEvidence(w: P01World, nb: P01Notebook): P01StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** El agua fría solo cuenta si de verdad se enfrió en el baño (no basta con el rótulo). */
export function coldEnough(w: P01World, tC: number): boolean {
  return tC <= w.params.roomTempC - 5;
}

function currentEvidence(w: P01World, nb: P01Notebook): P01StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const trial = trialReadings(w);
  const room = sampleOf(w, 'room');
  const cold = sampleOf(w, 'cold');
  const rr = sampleReadings(w, 'room');
  const rc = sampleReadings(w, 'cold');
  const nm = nailMassReadings(w);
  const dr = displacementReadings(w);
  const cm = cylinderMassReadings(w);
  const cal = caliperReadings(w);
  const orients = new Set(cal.diameters.map((r) => Math.round((r.orientationDeg ?? 0) / 20)));
  const B = nb.tableB;
  const allNailsIn = w.nails.every((n) => n.where === 'cylinder50');
  const tableA = INSTRUMENTS_A.every((k) => nb.tableA[k].uncertainty.trim() !== '');
  return {
    ppeReady: w.ppe,
    identifiedInstruments: ['balance01', 'pipette25', 'cylinder50', 'thermometer01', 'caliper01'].every(ins),
    scaleCompared: ins('cylinder50') && ins('pipette25') && !!trial.probe && !!trial.pipette,
    balanceChecked: !!w.evidence.balanceOn && !!w.evidence.taredEmpty && w.balance.levelErrorDeg < 0.5,
    waterAmbientSampled: !!room,
    waterColdSampled: !!cold && coldEnough(w, cold.tempAtDeliveryC),
    twoMassReadings: !!rr.mass && !!rc.mass,
    twoThermometerReadings: !!rr.temp && !!rc.temp,
    waterTableComplete: isNum(B.room.density.value) && isNum(B.cold.density.value) && isNum(B.room.mass.value) && isNum(B.cold.mass.value),
    nailsNetMass: !!nm.boat && !!nm.boatNails,
    initialLevelRead: !!dr.initial,
    nailsSubmerged: allNailsIn && nailsSubmergedFraction(w) >= 0.98,
    finalLevelRead: !!dr.final && !dr.final.qualityFlags.includes('PARALLAX'),
    displacementAnalysis: isNum(nb.tableC.density.value) && isNum(nb.tableC.dV.value),
    watchGlassMass: !!cm.glass,
    cylinderCombinedMass: !!cm.total,
    caliperDiameterRepeats: cal.diameters.length >= 2 && orients.size >= 2,
    caliperHeightRepeats: cal.heights.length >= 2,
    cylinderDensity: isNum(nb.tableD.density.value) && isNum(nb.tableD.volume.value),
    allRequiredTables: tableA && isNum(B.room.density.value) && isNum(B.cold.density.value) && isNum(nb.tableC.density.value) && isNum(nb.tableD.density.value) && nb.convention !== '',
    calculationsPresent: answered(nb.procedure.mass) && answered(nb.procedure.volume) && answered(nb.procedure.density),
    reflectionRecorded: answeredCount(nb) >= 4 && [nb.sources.water, nb.sources.displacement, nb.sources.geometry].filter((s) => s.trim().length > 10).length >= 2,
  };
}
