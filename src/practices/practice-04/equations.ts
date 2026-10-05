/**
 * Referencias del editor de ecuaciones (§15.3): el editor conoce lo que REALMENTE ocurrió en el intento.
 * La iónica completa se deriva de la molecular disociando los electrolitos fuertes (no se escribe a mano).
 */
import { validateEquation, type ChemEquation, type EqKind, type EquationReference, type EquationValidation, type RefSide } from '../../simulation/chemistry/equation';
import type { P4World } from '../../simulation/reaction-world/types';
import { speciesMol } from '../../simulation/reaction-world/world';
import { COMPOUNDS } from './species';
import { EXPERIMENT_REFS, type ExperimentId, type RefTerm } from './reactions';
import type { P4Notebook } from './notebook';
import { parseFormula, compositionKey } from '../../simulation/chemistry/formula';

const STRONG = new Map(COMPOUNDS.filter((c) => c.strong).map((c) => [compositionKey(parseFormula(c.formula)!), c]));

function dissociate(terms: RefTerm[]): RefTerm[] {
  const out: RefTerm[] = [];
  for (const t of terms) {
    const c = t.state === 'ac' ? STRONG.get(compositionKey(parseFormula(t.formula)!)) : undefined;
    if (c?.ions) for (const [k, ion] of c.ions) out.push({ coef: t.coef * k, formula: ion, state: 'ac' });
    else out.push(t);
  }
  // Agrupa iones iguales del mismo lado.
  const merged: RefTerm[] = [];
  for (const t of out) {
    const same = merged.find((m) => m.formula === t.formula && m.state === t.state);
    if (same) same.coef += t.coef;
    else merged.push({ ...t });
  }
  return merged;
}

export function completeIonic(id: ExperimentId): RefSide {
  const r = EXPERIMENT_REFS[id];
  return { reactants: dissociate(r.molecular.reactants), products: dissociate(r.molecular.products) };
}

export function referenceSide(id: ExperimentId, kind: EqKind): RefSide {
  const r = EXPERIMENT_REFS[id];
  switch (kind) {
    case 'MOLECULAR':
      return r.molecular;
    case 'COMPLETE_IONIC':
      return completeIonic(id);
    case 'NET_IONIC':
      return r.net;
    case 'OXIDATION':
      return r.oxidation ?? r.net;
    case 'REDUCTION':
      return r.reduction ?? r.net;
  }
}

/** ¿El ensayo se realizó y se formó lo que la ecuación describe? (§15.3, §22.2 «no registrar precipitado que no se formó»). */
export function experimentObserved(w: P4World, id: ExperimentId): boolean {
  const vs = Object.values(w.vessels);
  switch (id) {
    case 'A':
      return !!w.vessels.beaker && (w.vessels.beaker.extents.neutralization ?? 0) > 1e-4;
    case 'B1':
      return vs.some((v) => speciesMol(v, 'CaCO3(s)') > 2e-5);
    case 'B2':
      return vs.some((v) => speciesMol(v, 'Fe(OH)3(s)') > 5e-6);
    case 'C1':
      return Object.values(w.metals).some((m) => m.segments.some((s) => s.cuMol > 0) && m.metal === 'Fe');
    case 'C2':
      return Object.values(w.ribbons).some((r) => r.burnFrac > 0.2);
    case 'C3':
      return (w.vessels.capsule?.extents.mgoHydration ?? 0) > 1e-7;
  }
}

export function equationRef(w: P4World, id: ExperimentId, kind: EqKind): EquationReference {
  return { kind, expected: referenceSide(id, kind), spectators: EXPERIMENT_REFS[id].spectators, observed: experimentObserved(w, id) };
}

export function validateFor(w: P4World, id: ExperimentId, kind: EqKind, eq: ChemEquation | undefined): EquationValidation | null {
  if (!eq) return null;
  return validateEquation(eq, equationRef(w, id, kind), COMPOUNDS);
}

/** Todas las ecuaciones pedidas por la libreta con su validación. */
export function allEquations(w: P4World, nb: P4Notebook): Array<{ id: ExperimentId; kind: EqKind; v: EquationValidation | null }> {
  const out: Array<{ id: ExperimentId; kind: EqKind; v: EquationValidation | null }> = [];
  for (const [id, ref] of Object.entries(EXPERIMENT_REFS) as Array<[ExperimentId, (typeof EXPERIMENT_REFS)[ExperimentId]]>) {
    for (const k of ref.kinds) out.push({ id, kind: k, v: validateFor(w, id, k, nb.eq[id]?.[k]) });
  }
  return out;
}
