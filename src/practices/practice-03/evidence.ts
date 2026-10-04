/**
 * Evidencia por etapa (§21.1): banderas calculadas a partir del mundo y la libreta. La máquina de la práctica
 * avanza solo con evidencia, nunca con botones «Siguiente».
 */
import type { FlameWorld } from '../../simulation/flame-world/types';
import { isLit } from '../../simulation/flame-world/world';
import { SOLUTION_ROWS, UNKNOWN_ID } from './definition';
import { BURNER_PARTS, FLAME_ROWS, filledRow32, filledRow33, type P3Notebook } from './notebook';

export interface P3StageFlags {
  safetyDone: boolean;
  inspected: boolean;
  partsDone: boolean;
  ignited: boolean;
  yellowDone: boolean;
  capsule1Done: boolean;
  blueDone: boolean;
  capsule2Done: boolean;
  cationSetup: boolean;
  knownDone: boolean;
  mixDone: boolean;
  unknownDone: boolean;
  shutdownDone: boolean;
  notebookDone: boolean;
}

const KNOWN = ['sol_nacl', 'sol_kcl', 'sol_cacl2', 'sol_cucl2', 'sol_licl', 'sol_bacl2'];

export function capsuleTests(w: FlameWorld) {
  const ex = w.capsule.exposures;
  const yellow = ex.find((e) => (e.regimeS.YELLOW_LUMINOUS ?? 0) > e.durationS * 0.6 && e.durationS >= 3 && e.sootAfterMg - e.sootBeforeMg > 0.25);
  const blue = ex.find((e) => yellow && e.startS > yellow.startS && (e.regimeS.BLUE_STABLE ?? 0) > e.durationS * 0.6 && e.durationS >= 3);
  return { yellow, blue };
}

export function p3StageEvidence(w: FlameWorld, nb: P3Notebook): P3StageFlags {
  const ev = w.evidence;
  const loc = w.safety.located;
  const caps = capsuleTests(w);
  const obs = w.observations;
  const parts = BURNER_PARTS.filter((p) => w.parts.answers[p] === p).length;
  return {
    safetyDone: !!(w.ppe && loc.extinguisher && loc.blanket && loc.estop && (w.room.extractionOn || loc.extractor)),
    inspected: !!(w.hose.inspected && ev.inspectedBurner),
    partsDone: parts >= 7,
    ignited: w.burner.litOnceAt !== null,
    yellowDone: w.flameLog.yellowSeenS >= 3,
    capsule1Done: !!caps.yellow,
    blueDone: w.flameLog.twoConesS >= 3,
    capsule2Done: !!caps.blue,
    cationSetup: Object.keys(ev).some((k) => k.startsWith('cleanChecked:')) || Object.values(obs).some((o) => o.tests > 0),
    knownDone: KNOWN.every((id) => !!obs[id]?.noFilter),
    mixDone: !!(obs.sol_mix?.noFilter && obs.sol_mix?.filter),
    unknownDone: !!(obs[UNKNOWN_ID]?.noFilter && nb.unknown.identity),
    shutdownDone: w.burner.litOnceAt !== null && !isLit(w) && w.burner.needleGasValve <= 0.02 && w.burner.tableGasValve <= 0.02,
    notebookDone: FLAME_ROWS.every((r) => filledRow32(nb.table32[r], r)) && SOLUTION_ROWS.every((r) => filledRow33(nb.table33[r])) && Object.values(nb.questions).filter((q) => q.trim().length > 10).length >= 5,
  };
}
