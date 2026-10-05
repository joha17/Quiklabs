/**
 * Evidencia de la Práctica 4 (§22.2, §23.1): qué ensayo se hizo en qué recipiente, con qué cantidades reales,
 * y banderas por etapa. La máquina de la práctica avanza solo con evidencia, nunca con botones «Siguiente».
 */
import type { P4Vessel, P4World } from '../../simulation/reaction-world/types';
import { isLit } from '../../simulation/flame-world/world';
import { liquidMl, observedVessel, speciesMol, submissionBlockers, vesselOrigin } from '../../simulation/reaction-world/world';
import { contextFor } from './index';
import { allEquations } from './equations';
import { filledMg, filledNeutral, filledPrecip, filledRedox, type P4Notebook } from './notebook';

const used = (v: P4Vessel) => vesselOrigin(v);

/** Recipiente donde se hizo cada ensayo (el que mejor corresponde por reactivos y productos). */
export function experimentVessels(w: P4World): { A: string | null; B1: string | null; B2: string | null; B2x: string | null; C1: string | null; C3: string | null } {
  const vs = Object.values(w.vessels).filter((v) => ['BEAKER100', 'TUBE', 'CAPSULE', 'CYL10', 'CYL25'].includes(v.kind)).map((v) => observedVessel(w, v.id)!);
  const pick = (f: (v: P4Vessel) => number) => {
    let best: string | null = null;
    let bv = 0;
    for (const v of vs) {
      const s = f(v);
      if (s > bv) {
        bv = s;
        best = v.id;
      }
    }
    return best;
  };
  const naoh = (o: Record<string, number>) => (o.naoh15 ?? 0) + (o.naohX ?? 0);
  const b2 = pick((v) => (used(v).fecl3 && naoh(used(v)) < 2.2 ? speciesMol(v, 'Fe(OH)3(s)') + 1e-9 : 0));
  return {
    A: pick((v) => (v.kind === 'BEAKER100' || v.kind === 'TUBE' ? Math.min(used(v).hcl ?? 0, (used(v).naoh10 ?? 0) + (used(v).naoh15 ?? 0) + (used(v).naohX ?? 0)) : 0)),
    B1: pick((v) => speciesMol(v, 'CaCO3(s)') + (used(v).na2co3 && used(v).cacl2 ? 1e-9 : 0)),
    B2: b2,
    B2x: pick((v) => (v.id !== b2 && used(v).fecl3 && naoh(used(v)) >= 2.2 ? 1 : 0)),
    C1: w.metals.nail?.immersedIn ?? pick((v) => (used(v).cuso4 ?? 0)),
    C3: w.vessels.capsule ? 'capsule' : null,
  };
}

/** Volúmenes reales entregados por reactivo en un recipiente (mL), §16.1. */
export function deliveredMl(w: P4World, id: string | null): Record<string, number> {
  const v = observedVessel(w, id);
  return v ? used(v) : {};
}

export interface P4StageFlags {
  ppeSetup: boolean;
  neutralization: boolean;
  caco3: boolean;
  feoh3: boolean;
  redox: boolean;
  mgSetup: boolean;
  mgCombustion: boolean;
  mgHydration: boolean;
  equations: boolean;
  waste: boolean;
  notebookDone: boolean;
}

export function redoxElapsedS(w: P4World): number {
  const m = w.metals.nail;
  if (!m) return 0;
  return m.totalImmersedS + (m.immersedIn && m.immersedSince !== null ? w.timeS - m.immersedSince : 0);
}

/** Etapas experimentales cuya evidencia queda fijada una vez observada (desechar los residuos no la borra). */
const LATCHED: Array<keyof P4StageFlags> = ['ppeSetup', 'neutralization', 'caco3', 'feoh3', 'redox', 'mgSetup', 'mgCombustion', 'mgHydration'];

/**
 * Banderas de evidencia por etapa. Las experimentales se fijan en `w.evidence['stage:*']` la primera vez que se
 * cumplen (la app las calcula en cada tic del flujo), así siguen valiendo después de desechar el contenido.
 */
export function p4StageEvidence(w: P4World, nb: P4Notebook): P4StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

function currentEvidence(w: P4World, nb: P4Notebook): P4StageFlags {
  const ev = experimentVessels(w);
  const a = observedVessel(w, ev.A);
  const ao = a ? used(a) : {};
  const ctx = contextFor(w);
  const eqs = allEquations(w, nb);
  const cap = observedVessel(w, 'capsule');
  const capO = cap ? used(cap) : {};
  return {
    ppeSetup: w.ppe && Object.keys(w.evidence).some((k) => k.startsWith('inspected:')),
    neutralization: !!a && (ao.hcl ?? 0) > 3 && ((ao.naoh10 ?? 0) + (ao.naoh15 ?? 0) + (ao.naohX ?? 0)) > 3 && (ao.pheno ?? 0) > 0 && !!w.evidence[`stirred:${a.id}`],
    caco3: !!ev.B1 && speciesMol(observedVessel(w, ev.B1)!, 'CaCO3(s)') > 5e-5,
    feoh3: !!ev.B2 && speciesMol(observedVessel(w, ev.B2)!, 'Fe(OH)3(s)') > 1e-5,
    redox: redoxElapsedS(w) >= w.params.redoxObserveS * 0.98 && Object.values(w.metals).some((m) => m.segments.some((s) => s.cuMol > 1e-6)),
    mgSetup: w.safety.mgWarningAccepted && w.shield.placed && w.gas.burner.litOnceAt !== null && !!w.evidence['tongs:crucible_tongs:mgRibbon'],
    mgCombustion: Object.values(w.ribbons).some((r) => r.burnFrac > 0.9) && !!cap && speciesMol(cap, 'MgO(s)') + speciesMol(cap, 'Mg(OH)2(s)') > 1e-5,
    mgHydration: !!cap && (capO.water ?? 0) + (capO.wash ?? 0) >= 3 && (capO.pheno ?? 0) > 0 && (cap.extents.mgoHydration ?? 0) > 1e-6 && liquidMl(cap) > 2,
    equations: eqs.filter((e) => e.v?.ok).length >= Math.ceil(eqs.length * 0.6),
    waste: !isLit(w.gas) && w.gas.burner.tableGasValve <= 0.02 && submissionBlockers(w, ctx).length === 0 && w.disposals.length > 0,
    notebookDone: filledNeutral(nb.A) && filledPrecip(nb.B1) && filledPrecip(nb.B2) && filledRedox(nb.C1) && filledMg(nb.Mg),
  };
}
