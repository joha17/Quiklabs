/**
 * Evidencia de la Práctica 7 (§5, §6.4): banderas por estación que leen la máquina, la rúbrica y la entrega. Ninguna
 * exige acertar una hipótesis ni una clasificación; solo que las mediciones se hayan hecho de verdad. Las etapas
 * experimentales quedan fijadas una vez cumplidas (`stage:*`): lavar un tubo después no borra lo que ya se hizo.
 */
import type { P07World } from '../../simulation/bonding-world/types';
import { answeredCount, isNum, type P07Notebook } from './notebook';
import { comparedSamples, contactOf, controlReadings, kappaReadings, pairObservations, strongLevels, unknownTests, volumeReadings } from './expected-results';

export interface P07StageFlags {
  ppeReady: boolean;
  hypothesesRecorded: boolean;
  instrumentsChecked: boolean;
  controlReading: boolean;
  pairsCompared: boolean;
  volumeMeasured: boolean;
  observationInterval: boolean;
  metalContact: boolean;
  ionicDryContact: boolean;
  graphiteContact: boolean;
  blankKappa: boolean;
  strongTwoLevels: boolean;
  contrastKappa: boolean;
  unknownsStudied: boolean;
  tablesComplete: boolean;
  reflectionRecorded: boolean;
}

const LATCHED: Array<keyof P07StageFlags> = [
  'ppeReady', 'instrumentsChecked', 'controlReading', 'pairsCompared', 'volumeMeasured', 'observationInterval', 'metalContact', 'ionicDryContact', 'graphiteContact',
  'blankKappa', 'strongTwoLevels', 'contrastKappa', 'unknownsStudied',
];

export function p07StageEvidence(w: P07World, nb: P07Notebook): P07StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

/** Una hipótesis cuenta si tiene muestra, predicción de conducción y de mezcla, y quedó guardada con su tiempo. */
export const hypothesesCount = (nb: P07Notebook) => nb.tableA.filter((r) => r.sample && r.conducts && r.water && r.savedAtS !== null).length;

function currentEvidence(w: P07World, nb: P07Notebook): P07StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const unk = (['X', 'Y'] as const).filter((k) => unknownTests(w, k).size >= 2).length;
  const rowsB = Object.values(nb.tableB).filter((r) => r.observationId && r.interpretation).length;
  const rowsC = Object.values(nb.tableC).filter((r) => r.readingId).length;
  const rowsD = Object.values(nb.tableD).filter((r) => r.kappa.readingId && (r.sample === 'blank' || isNum(r.conc.value) || r.sample !== '')).length;
  const rowsE = Object.values(nb.tableE).filter((r) => r.classification && (r.result1 || r.result2)).length;
  return {
    ppeReady: w.ppe,
    hypothesesRecorded: hypothesesCount(nb) >= 3,
    instrumentsChecked: ins('det01') && ins('cond01'),
    controlReading: controlReadings(w).length > 0,
    pairsCompared: comparedSamples(w).length >= w.params.minimumPairComparisons,
    volumeMeasured: volumeReadings(w).some((r) => r.instrumentId === 'cyl10' || r.instrumentId.startsWith('dp')),
    observationInterval: pairObservations(w).some((o) => o.equilibrated),
    metalContact: contactOf(w, 'metal').length > 0,
    ionicDryContact: contactOf(w, 'ionicDry').length > 0,
    graphiteContact: contactOf(w, 'graphite').length > 0,
    blankKappa: kappaReadings(w, 'blank').length > 0,
    strongTwoLevels: strongLevels(w).length >= 2,
    contrastKappa: kappaReadings(w, 'nonElectrolyte').length > 0 || kappaReadings(w, 'weak').length > 0,
    unknownsStudied: unk >= w.params.minimumUnknowns,
    tablesComplete: rowsB >= 4 && rowsC >= 3 && rowsD >= 4 && rowsE >= 2,
    reflectionRecorded: answeredCount(nb) >= 6 && nb.conclusion.trim().length > 25,
  };
}
