/**
 * Validador de ecuaciones químicas (Práctica 4, §15.2). Analiza fórmulas, átomos, carga, fases, disociación de
 * electrolitos fuertes, iones espectadores y proporciones; NUNCA compara el texto escrito.
 * Ecuaciones equivalentes (otro orden, «H₃O⁺» en lugar de «H⁺ + H₂O», coeficientes múltiplos) se reconocen como la
 * misma reacción, pero se exige la relación mínima entera.
 */
import { compositionKey, parseFormula, type ParsedFormula } from './formula';

export type StateTag = 's' | 'l' | 'g' | 'ac' | '';

export interface EqTerm {
  coef: number;
  formula: string;
  state: StateTag;
  /** Tachado como ion espectador (ecuación iónica completa). */
  struck?: boolean;
}

export interface ChemEquation {
  reactants: EqTerm[];
  products: EqTerm[];
}

export type EqKind = 'MOLECULAR' | 'COMPLETE_IONIC' | 'NET_IONIC' | 'OXIDATION' | 'REDUCTION';

export interface EquationError {
  code: string;
  params?: Record<string, string | number>;
}

export interface EquationValidation {
  complete: boolean;
  atomsBalanced: boolean;
  chargeBalanced: boolean;
  coefficientsLowestWholeNumbers: boolean;
  phasesCorrect: boolean;
  spectatorsCorrect?: boolean;
  reactionMatchesObservedMixture: boolean;
  errors: EquationError[];
  /** Todo correcto (para la evaluación y el indicador del editor). */
  ok: boolean;
}

export interface CompoundInfo {
  formula: string;
  state: 's' | 'l' | 'g' | 'ac';
  strong?: boolean;
  ions?: Array<[number, string]>;
}

export interface RefSide {
  reactants: Array<{ coef: number; formula: string; state: 's' | 'l' | 'g' | 'ac' }>;
  products: Array<{ coef: number; formula: string; state: 's' | 'l' | 'g' | 'ac' }>;
}

export interface EquationReference {
  kind: EqKind;
  /** Ecuación de referencia de ese tipo (para comparar proporciones, no texto). */
  expected: RefSide;
  spectators: string[];
  /** ¿El estudiante realizó el ensayo y se formó el producto? (§15.3) */
  observed: boolean;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

interface Parsed {
  term: EqTerm;
  side: -1 | 1;
  p: ParsedFormula;
}

function parseSide(terms: EqTerm[], side: -1 | 1, errors: EquationError[]): Parsed[] {
  const out: Parsed[] = [];
  for (const t of terms) {
    if (!t.formula.trim()) continue;
    const p = parseFormula(t.formula);
    if (!p) {
      errors.push({ code: 'PARSE', params: { f: t.formula } });
      continue;
    }
    out.push({ term: t, side, p });
  }
  return out;
}

const H_KEY = compositionKey(parseFormula('H^+')!);
const W_KEY = compositionKey(parseFormula('H2O')!);
const H3O_KEY = compositionKey(parseFormula('H3O^+')!);

/**
 * Mapa de la reacción, con H₃O⁺ ≡ H⁺ + H₂O. `net`: composición → coeficiente neto (productos +, reactivos −; las
 * especies repetidas a ambos lados se cancelan). Si no, cada lado por separado (iónica completa, molecular).
 */
function reactionMap(items: Array<{ coef: number; p: ParsedFormula; side: -1 | 1 }>, net: boolean): Map<string, number> {
  const m = new Map<string, number>();
  const add = (k: string, side: -1 | 1, v: number) => {
    const key = net ? k : `${side > 0 ? 'P' : 'R'}:${k}`;
    m.set(key, (m.get(key) ?? 0) + (net ? side * v : v));
  };
  for (const it of items) {
    const key = compositionKey(it.p);
    if (key === H3O_KEY) {
      add(H_KEY, it.side, it.coef);
      add(W_KEY, it.side, it.coef);
    } else add(key, it.side, it.coef);
  }
  return m;
}

/** ¿Son proporcionales (misma reacción) dos mapas netos? */
function proportional(a: Map<string, number>, b: Map<string, number>): boolean {
  const ka = [...a.keys()].filter((k) => Math.abs(a.get(k)!) > 1e-9);
  const kb = [...b.keys()].filter((k) => Math.abs(b.get(k)!) > 1e-9);
  if (!ka.length || ka.length !== kb.length) return false;
  let ratio: number | null = null;
  for (const k of ka) {
    const vb = b.get(k);
    if (vb === undefined || Math.abs(vb) < 1e-9) return false;
    const r = a.get(k)! / vb;
    if (r <= 0) return false;
    if (ratio === null) ratio = r;
    else if (Math.abs(r - ratio) > 1e-6 * Math.max(1, ratio)) return false;
  }
  return true;
}

function refItems(ref: RefSide): Array<{ coef: number; p: ParsedFormula; side: -1 | 1 }> {
  const out: Array<{ coef: number; p: ParsedFormula; side: -1 | 1 }> = [];
  for (const t of ref.reactants) out.push({ coef: t.coef, p: parseFormula(t.formula)!, side: -1 });
  for (const t of ref.products) out.push({ coef: t.coef, p: parseFormula(t.formula)!, side: 1 });
  return out;
}

export function validateEquation(eq: ChemEquation, ref: EquationReference, compounds: CompoundInfo[]): EquationValidation {
  const errors: EquationError[] = [];
  const items = [...parseSide(eq.reactants, -1, errors), ...parseSide(eq.products, 1, errors)];
  const hasReactants = items.some((i) => i.side === -1);
  const hasProducts = items.some((i) => i.side === 1);
  const complete = hasReactants && hasProducts && !errors.some((e) => e.code === 'PARSE');
  const res: EquationValidation = {
    complete, atomsBalanced: false, chargeBalanced: false, coefficientsLowestWholeNumbers: false, phasesCorrect: false,
    reactionMatchesObservedMixture: false, errors, ok: false,
  };
  if (!complete) {
    if (!hasReactants || !hasProducts) errors.push({ code: 'INCOMPLETE' });
    return res;
  }
  // ── Coeficientes enteros positivos ──
  let coefOk = true;
  for (const it of items) {
    if (!Number.isInteger(it.term.coef) || it.term.coef < 1) {
      coefOk = false;
      errors.push({ code: 'COEF_NOT_INTEGER', params: { f: it.term.formula } });
    }
  }
  // ── Átomos y carga (todas las especies, también las tachadas: siguen siendo parte de la ecuación) ──
  const el = new Map<string, number>();
  let charge = 0;
  for (const it of items) {
    for (const [e, k] of Object.entries(it.p.elements)) el.set(e, (el.get(e) ?? 0) + it.side * it.term.coef * k);
    charge += it.side * it.term.coef * it.p.charge;
  }
  const unbalanced = [...el].filter(([, v]) => Math.abs(v) > 1e-9).map(([e]) => e);
  res.atomsBalanced = unbalanced.length === 0;
  if (!res.atomsBalanced) errors.push({ code: 'ATOMS_UNBALANCED', params: { el: unbalanced.join(', ') } });
  res.chargeBalanced = Math.abs(charge) < 1e-9;
  if (!res.chargeBalanced) errors.push({ code: 'CHARGE_UNBALANCED', params: { q: charge } });
  // ── Relación mínima entera ──
  const g = items.reduce((acc, it) => gcd(acc, Math.round(it.term.coef)), 0);
  res.coefficientsLowestWholeNumbers = coefOk && g === 1;
  if (coefOk && g > 1) errors.push({ code: 'NOT_LOWEST', params: { g } });
  // ── Fases (§15.1): cada compuesto conocido con su estado correcto ──
  const byKey = new Map<string, CompoundInfo>();
  for (const c of compounds) {
    const p = parseFormula(c.formula);
    if (p) byKey.set(compositionKey(p), c);
  }
  let phasesOk = true;
  const half = ref.kind === 'OXIDATION' || ref.kind === 'REDUCTION';
  for (const it of items) {
    // Electrones y, en las semirreacciones, los iones (p. ej. Mg²⁺ en el óxido) no llevan una fase exigible.
    if (it.p.electron || (half && it.p.charge !== 0)) continue;
    const info = byKey.get(compositionKey(it.p));
    if (!it.term.state) {
      phasesOk = false;
      errors.push({ code: 'PHASE_MISSING', params: { f: it.term.formula } });
    } else if (info && info.state !== it.term.state) {
      phasesOk = false;
      errors.push({ code: 'PHASE_WRONG', params: { f: it.term.formula, s: info.state } });
    }
  }
  res.phasesCorrect = phasesOk;
  // ── Reglas por tipo de ecuación ──
  const kind = ref.kind;
  const ions = items.filter((i) => i.p.charge !== 0 && !i.p.electron);
  const electrons = items.filter((i) => i.p.electron);
  if (kind === 'MOLECULAR') {
    if (ions.length) errors.push({ code: 'IONS_IN_MOLECULAR' });
    if (electrons.length) errors.push({ code: 'ELECTRONS_NOT_ALLOWED' });
  }
  if (kind === 'COMPLETE_IONIC' || kind === 'NET_IONIC') {
    // Electrolitos fuertes en disolución: se escriben disociados.
    for (const it of items) {
      const info = byKey.get(compositionKey(it.p));
      if (info?.strong && it.term.state === 'ac' && it.p.charge === 0) errors.push({ code: 'NOT_DISSOCIATED', params: { f: it.term.formula } });
    }
    if (electrons.length) errors.push({ code: 'ELECTRONS_NOT_ALLOWED' });
  }
  if (kind === 'NET_IONIC') {
    const seen = new Map<string, Set<number>>();
    for (const it of items) {
      const k = compositionKey(it.p);
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k)!.add(it.side);
    }
    if ([...seen.values()].some((s) => s.size === 2)) errors.push({ code: 'SPECTATOR_NOT_CANCELLED' });
    if (items.some((i) => i.term.struck)) errors.push({ code: 'STRUCK_IN_NET' });
  }
  if (kind === 'OXIDATION' && !electrons.some((e) => e.side === 1)) errors.push({ code: 'ELECTRONS_SIDE', params: { side: 'productos' } });
  if (kind === 'REDUCTION' && !electrons.some((e) => e.side === -1)) errors.push({ code: 'ELECTRONS_SIDE', params: { side: 'reactivos' } });
  // ── Espectadores tachados (iónica completa) ──
  if (kind === 'COMPLETE_IONIC') {
    const struck = new Set(items.filter((i) => i.term.struck).map((i) => compositionKey(i.p)));
    const want = new Set(ref.spectators.map((f) => compositionKey(parseFormula(f)!)));
    res.spectatorsCorrect = struck.size === want.size && [...want].every((k) => struck.has(k));
    if (!res.spectatorsCorrect) errors.push({ code: struck.size ? 'SPECTATORS_WRONG' : 'SPECTATORS_NOT_MARKED' });
  }
  // ── ¿Es la reacción que ocurrió? (proporciones, no texto) ──
  const net = kind === 'NET_IONIC';
  const student = reactionMap(items.map((i) => ({ coef: i.term.coef, p: i.p, side: i.side })), net);
  const reference = reactionMap(refItems(ref.expected), net);
  const sameReaction = proportional(student, reference);
  if (!sameReaction) errors.push({ code: 'REACTION_MISMATCH' });
  if (sameReaction && !ref.observed) errors.push({ code: 'NOT_OBSERVED' });
  res.reactionMatchesObservedMixture = sameReaction && ref.observed;
  const structural = !errors.some((e) => ['IONS_IN_MOLECULAR', 'ELECTRONS_NOT_ALLOWED', 'NOT_DISSOCIATED', 'SPECTATOR_NOT_CANCELLED', 'STRUCK_IN_NET', 'ELECTRONS_SIDE', 'SPECTATORS_WRONG', 'SPECTATORS_NOT_MARKED'].includes(e.code));
  res.ok = res.atomsBalanced && res.chargeBalanced && res.coefficientsLowestWholeNumbers && res.phasesCorrect && sameReaction && structural;
  return res;
}

/** Ecuación vacía para el editor. */
export function emptyEquation(): ChemEquation {
  return { reactants: [], products: [] };
}

/** Texto accesible de una ecuación (lectura por tecnologías de asistencia, §26). */
export function equationText(eq: ChemEquation, pretty: (f: string) => string): string {
  const side = (ts: EqTerm[]) => ts.filter((t) => t.formula.trim()).map((t) => `${t.coef > 1 ? `${t.coef} ` : ''}${pretty(t.formula)}${t.state ? `(${t.state})` : ''}${t.struck ? ' [espectador]' : ''}`).join(' + ');
  return `${side(eq.reactants)} → ${side(eq.products)}`;
}
