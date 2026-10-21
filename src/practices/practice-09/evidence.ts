/**
 * Evidencia de la Práctica 9 (§5): banderas `stage:*` por estación que leen la máquina, la rúbrica y la entrega. Ninguna
 * exige un resultado positivo (una incógnita sin Sr²⁺ también completa D si se hizo la prueba, §17 `flow:scenario`).
 * Las etapas experimentales quedan fijadas una vez cumplidas.
 */
import type { P09World } from '../../simulation/cation-analysis-world/types';
import { REAGENT } from '../../simulation/cation-analysis-world/world';
import { CONTROLS } from './definition';
import { answeredCount, CATIONS, type P09Notebook } from './notebook';
import { emissionsOf, finalFlameReadings, precipitationTests, validOf } from './expected-results';

export interface P09StageFlags {
  ppe: boolean;
  inspection: boolean;
  hypotheses: boolean;
  controls: boolean;
  blank: boolean;
  interference: boolean;
  comparison: boolean;
  twoLights: boolean;
  srTested: boolean;
  feTested: boolean;
  fractions: boolean;
  crossCheck: boolean;
  notebook: boolean;
  diagram: boolean;
}

const LATCHED: Array<keyof P09StageFlags> = ['ppe', 'inspection', 'controls', 'blank', 'interference', 'comparison', 'twoLights', 'srTested', 'feTested', 'fractions', 'crossCheck'];

export function p09StageEvidence(w: P09World, nb: P09Notebook): P09StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

export const hypothesesSaved = (nb: P09Notebook) => nb.tableA.savedAtS !== null && CATIONS.every((c) => nb.tableA[c].predictedSolid !== '');

/** Raíces probadas con el asa o los soportes (lecturas válidas). */
export const testedControls = (w: P09World) => CONTROLS.filter((c) => c !== 'ctlBlank' && c !== 'ctlNaK' && emissionsOf(w, c).length > 0);

/** La misma muestra observada en el asa y en el vidrio de reloj virtual. */
export function supportComparison(w: P09World) {
  const em = validOf(w, 'emission');
  const roots = new Set(em.filter((r) => r.snapshot.support === 'loop').map((r) => r.snapshot.root));
  return em.some((r) => r.snapshot.support === 'watchGlass' && roots.has(r.snapshot.root));
}

/** Diagrama: aristas que corresponden a transferencias reales (el destino trae al origen en su trazabilidad). */
export function validEdges(w: P09World, nb: P09Notebook) {
  return nb.tableG.filter((e) => {
    const to = w.vessels[e.to];
    if (!e.action || !w.vessels[e.from]) return false;
    if (e.action === 'flame') return validOf(w, 'emission').some((r) => r.snapshot.source === e.from) || validOf(w, 'spectrum').some((r) => r.snapshot.source === e.from);
    if (e.action === 'centrifuge') return !!w.evidence[`spun:${e.from}`];
    if (e.action === 'sulfate') return !!w.evidence[`dosed:${e.from}:${REAGENT.sulfate}`];
    if (e.action === 'hydroxide') return !!w.evidence[`dosed:${e.from}:${REAGENT.alkali}`];
    return !!to && to.from.includes(e.from);
  });
}

function currentEvidence(w: P09World, nb: P09Notebook): P09StageFlags {
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const lights = new Set(validOf(w, 'emission').map((r) => r.snapshot.lightPct));
  const decanted = Object.keys(w.evidence).some((k) => k.startsWith('decant:'));
  const F = nb.tableF;
  return {
    ppe: w.ppe,
    inspection: ins('hood01') && ins('cf01') && ins('smp1'),
    hypotheses: hypothesesSaved(nb),
    controls: testedControls(w).length >= 3,
    blank: emissionsOf(w, 'ctlBlank').length > 0,
    interference: emissionsOf(w, 'ctlNaK').length > 0,
    comparison: supportComparison(w),
    twoLights: lights.size >= 2,
    srTested: precipitationTests(w, REAGENT.sulfate).length > 0,
    feTested: precipitationTests(w, REAGENT.alkali).length > 0,
    fractions: !!w.evidence.spinDone && decanted,
    crossCheck: finalFlameReadings(w).length > 0 && (precipitationTests(w, REAGENT.sulfate).length > 0 || precipitationTests(w, REAGENT.alkali).length > 0),
    notebook: CATIONS.every((c) => F[c].status !== '') && !!nb.tableD.sr.reagent && !!nb.tableD.fe.reagent && answeredCount(nb) >= 3,
    diagram: validEdges(w, nb).length >= 3,
  };
}
