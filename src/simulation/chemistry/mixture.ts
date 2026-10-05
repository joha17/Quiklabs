/**
 * Motor de mezclas acuosas (Práctica 4, §7.2–7.5): transferencia física, disociación, equilibrios rápidos,
 * precipitación con Ksp, pH continuo y energía.
 *
 * Reglas que garantiza este módulo:
 * - Las reacciones se aplican como AVANCES de ecuaciones balanceadas: átomos, masa y carga se conservan siempre.
 * - Nunca hay moles negativos. H⁺ y OH⁻ están respaldados por el agua: consumir OH⁻ que ya no hay equivale a
 *   H₂O → H⁺ + OH⁻ seguido del consumo (y al revés); después, H⁺ + OH⁻ → H₂O se completa (Kw).
 * - El calor de cada cambio se calcula con las entalpías de formación (ley de Hess), incluida la neutralización.
 * - La concentración libre de H⁺ sale del exceso neto de protones y Kw(T): pH = −log((d + √(d² + 4Kw))/2).
 */
import { clamp, interpolateTable } from '../core/math';
import type { Cell, ChemContext, ReactionDef, ReactionOutcome, SpeciesDef } from './types';

export const WATER = 'H2O';
export const HPLUS = 'H+';
export const OHMINUS = 'OH-';
/** Densidad del agua (mol/L) para el agua «disolvente» de las disoluciones diluidas. */
export const WATER_MOL_PER_L = 55.35;

const TINY = 1e-18;
const LN10 = Math.log(10);

export function emptyCell(): Cell {
  return { volL: 0, mol: {} };
}

export function cloneCell(c: Cell): Cell {
  return { volL: c.volL, mol: { ...c.mol }, ...(c.origin ? { origin: { ...c.origin } } : {}) };
}

function moveOrigin(from: Cell, to: Cell, k: number) {
  if (!from.origin || k <= 0) return;
  to.origin ??= {};
  for (const [r, ml] of Object.entries(from.origin)) {
    const d = ml * k;
    from.origin[r] = ml - d;
    to.origin[r] = (to.origin[r] ?? 0) + d;
    if (from.origin[r] < 1e-9) delete from.origin[r];
  }
}

export function n(c: Cell, id: string): number {
  return c.mol[id] ?? 0;
}

export function addMol(c: Cell, id: string, mol: number) {
  const v = (c.mol[id] ?? 0) + mol;
  if (v <= TINY) delete c.mol[id];
  else c.mol[id] = v;
}

/** Mueve una fracción de cada especie (filtro opcional) y del volumen de `from` a `to`. */
export function transferFraction(from: Cell, to: Cell, f: number, filter?: (id: string) => number) {
  const k = clamp(f, 0, 1);
  if (k <= 0) return;
  for (const [id, m] of Object.entries(from.mol)) {
    const kk = filter ? clamp(k * filter(id), 0, 1) : k;
    if (kk <= 0) continue;
    const d = m * kk;
    addMol(from, id, -d);
    addMol(to, id, d);
  }
  const dv = from.volL * k;
  from.volL = Math.max(0, from.volL - dv);
  to.volL += dv;
  moveOrigin(from, to, k);
}

/** Une `src` dentro de `dst` (todo). */
export function mergeInto(dst: Cell, src: Cell) {
  for (const [id, m] of Object.entries(src.mol)) addMol(dst, id, m);
  dst.volL += src.volL;
  moveOrigin(src, dst, 1);
  src.mol = {};
  src.volL = 0;
  delete src.origin;
}

export function totalMol(cells: Cell[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cells) for (const [id, m] of Object.entries(c.mol)) out[id] = (out[id] ?? 0) + m;
  return out;
}

/** Átomos y carga totales (para comprobar la conservación). */
export function elementTotals(mol: Record<string, number>, ctx: ChemContext): Record<string, number> {
  const out: Record<string, number> = { charge: 0 };
  for (const [id, m] of Object.entries(mol)) {
    const sp = ctx.species[id];
    if (!sp) continue;
    for (const [el, k] of Object.entries(sp.elements)) out[el] = (out[el] ?? 0) + k * m;
    out.charge += sp.charge * m;
  }
  return out;
}

export function massG(mol: Record<string, number>, ctx: ChemContext, filter?: (sp: SpeciesDef) => boolean): number {
  let g = 0;
  for (const [id, m] of Object.entries(mol)) {
    const sp = ctx.species[id];
    if (!sp || (filter && !filter(sp))) continue;
    g += m * sp.molarMass;
  }
  return g;
}

// ─────────────────────────── Agua, Kw y pH ───────────────────────────

/** pKw en función de la temperatura (°C), tabla de referencia. */
const PKW: ReadonlyArray<readonly [number, number]> = [[0, 14.94], [25, 14.0], [50, 13.26], [75, 12.7], [100, 12.26]];

export function kw(tempC: number): number {
  return 10 ** -interpolateTable(PKW, tempC);
}

/** pH neutro a la temperatura dada (§8.4). */
export function neutralPH(tempC: number): number {
  return interpolateTable(PKW, tempC) / 2;
}

/** [H⁺] libre (mol/L) a partir del exceso neto de protones `d` (mol/L). */
export function hFromNet(d: number, tempC: number): number {
  const K = kw(tempC);
  return (d + Math.sqrt(d * d + 4 * K)) / 2;
}

export function netProtonM(c: Cell): number {
  if (c.volL <= 1e-9) return 0;
  return (n(c, HPLUS) - n(c, OHMINUS)) / c.volL;
}

export function pH(c: Cell, tempC: number): number {
  if (c.volL <= 1e-9) return NaN;
  return -Math.log10(hFromNet(netProtonM(c), tempC));
}

/** Calor liberado (J) por un cambio de moles (ley de Hess). */
function heatOf(delta: Record<string, number>, ctx: ChemContext): number {
  let h = 0;
  for (const [id, d] of Object.entries(delta)) h += d * (ctx.species[id]?.dHf ?? 0);
  return -h * 1000;
}

/** H⁺ + OH⁻ → H₂O hasta agotar uno de los dos (§8.2). Devuelve el calor liberado (J) y el avance. */
export function normalizeWater(c: Cell, ctx: ChemContext): { heatJ: number; extent: number } {
  const m = Math.min(n(c, HPLUS), n(c, OHMINUS));
  if (m <= TINY) return { heatJ: 0, extent: 0 };
  addMol(c, HPLUS, -m);
  addMol(c, OHMINUS, -m);
  addMol(c, WATER, m);
  return { heatJ: heatOf({ [HPLUS]: -m, [OHMINUS]: -m, [WATER]: m }, ctx), extent: m };
}

/**
 * Aplica `xi` mol de avance de la reacción `r` a la celda. H⁺/OH⁻ consumidos de más se toman del agua (y se
 * recombinan al final), así que nunca quedan moles negativos. Devuelve el calor liberado (J).
 */
export function applyExtent(c: Cell, r: ReactionDef, xi: number, ctx: ChemContext): number {
  if (xi === 0) return 0;
  const before: Record<string, number> = {};
  const touch = new Set([...Object.keys(r.nu), HPLUS, OHMINUS, WATER]);
  for (const id of touch) before[id] = n(c, id);
  const nuH = r.nu[HPLUS] ?? 0;
  const nuOH = r.nu[OHMINUS] ?? 0;
  const nuW = r.nu[WATER] ?? 0;
  for (const [id, v] of Object.entries(r.nu)) {
    if (id === HPLUS || id === OHMINUS || id === WATER) continue;
    const next = n(c, id) + v * xi;
    // Tolerancia numérica: los límites del avance ya impiden agotar de más.
    c.mol[id] = next;
    if (next <= TINY) delete c.mol[id];
  }
  // Balance de protones con respaldo del agua (ver cabecera).
  const nH = before[HPLUS];
  const nOH = before[OHMINUS];
  const P = nH - nOH + xi * (nuH - nuOH);
  const nOH2 = Math.max(-P, 0);
  const nH2 = Math.max(P, 0);
  const nW2 = Math.max(0, nOH + before[WATER] + xi * (nuOH + nuW) - nOH2);
  if (nH2 > TINY) c.mol[HPLUS] = nH2;
  else delete c.mol[HPLUS];
  if (nOH2 > TINY) c.mol[OHMINUS] = nOH2;
  else delete c.mol[OHMINUS];
  c.mol[WATER] = nW2;
  const delta: Record<string, number> = {};
  for (const id of touch) delta[id] = n(c, id) - before[id];
  return heatOf(delta, ctx);
}

/** Concentración (mol/L) para el cociente de reacción; H⁺/OH⁻ libres desde el exceso neto y Kw. */
function logConc(c: Cell, id: string, sp: SpeciesDef | undefined, extra: number, hLog: number, kwLog: number): number | null {
  if (!sp || sp.phase === 'SOLID' || sp.phase === 'LIQUID' || id === WATER || sp.phase === 'GAS' || sp.phase === 'SURFACE') return null;
  if (id === HPLUS) return hLog;
  if (id === OHMINUS) return kwLog - hLog;
  const m = n(c, id) + extra;
  return Math.log10(Math.max(m, 1e-300) / c.volL);
}

/** log₁₀ Q de la reacción `r` si se aplicara un avance `xi`. */
export function logQ(c: Cell, r: ReactionDef, xi: number, ctx: ChemContext, tempC: number): number {
  const K = kw(tempC);
  const d = (n(c, HPLUS) - n(c, OHMINUS) + xi * ((r.nu[HPLUS] ?? 0) - (r.nu[OHMINUS] ?? 0))) / c.volL;
  const h = (d + Math.sqrt(d * d + 4 * K)) / 2;
  const hLog = Math.log10(Math.max(h, 1e-300));
  const kwLog = Math.log10(K);
  let q = 0;
  for (const [id, v] of Object.entries(r.nu)) {
    const lc = logConc(c, id, ctx.species[id], v * xi, hLog, kwLog);
    if (lc !== null) q += v * lc;
  }
  return q;
}

/** Límites del avance para no dejar moles negativos (H⁺/OH⁻ respaldados por el agua). */
export function extentBounds(c: Cell, r: ReactionDef): [number, number] {
  let hi = Infinity;
  let lo = -Infinity;
  const water = n(c, WATER);
  for (const [id, v] of Object.entries(r.nu)) {
    const avail = id === HPLUS || id === OHMINUS ? n(c, id) + water : n(c, id);
    if (v < 0) hi = Math.min(hi, avail / -v);
    else if (v > 0) lo = Math.max(lo, -avail / v);
  }
  if (!Number.isFinite(hi)) hi = 0;
  if (!Number.isFinite(lo)) lo = 0;
  return [lo, hi];
}

/** Avance que lleva la reacción al equilibrio (Q = K), acotado por la disponibilidad. */
export function equilibriumExtent(c: Cell, r: ReactionDef, ctx: ChemContext, tempC: number): number {
  if (r.logK === undefined || c.volL <= 1e-9) return 0;
  const [lo, hi] = extentBounds(c, r);
  if (hi - lo <= TINY) return 0;
  const f = (x: number) => logQ(c, r, x, ctx, tempC) - (r.logK as number);
  const f0 = f(0);
  if (Math.abs(f0) < 1e-6) return 0;
  let a: number;
  let b: number;
  if (f0 < 0) {
    // Avanza hacia productos.
    if (hi <= 0) return 0;
    if (f(hi) <= 0) return hi;
    a = 0;
    b = hi;
  } else {
    if (lo >= 0) return 0;
    if (f(lo) >= 0) return lo;
    a = lo;
    b = 0;
  }
  for (let i = 0; i < 64; i++) {
    const m = (a + b) / 2;
    if (f(m) < 0) a = m;
    else b = m;
    if (b - a <= Math.max(1e-16, Math.abs(m) * 1e-10)) break;
  }
  return (a + b) / 2;
}

/** ¿Participa la celda en la reacción (hay algún reactivo o producto con moles)? */
function relevant(c: Cell, r: ReactionDef, forward: boolean): boolean {
  let any = false;
  for (const [id, v] of Object.entries(r.nu)) {
    if (id === WATER || id === HPLUS || id === OHMINUS) continue;
    if ((forward ? v < 0 : v > 0) && n(c, id) <= TINY) return false;
    any = true;
  }
  return any;
}

/**
 * Equilibrios rápidos (ácido–base, hidrólisis): barridos de Gauss–Seidel hasta converger. La neutralización
 * H⁺ + OH⁻ → H₂O se completa antes y después de cada barrido.
 */
export function equilibrate(c: Cell, ctx: ChemContext, tempC: number, out?: ReactionOutcome): ReactionOutcome {
  const res = out ?? { heatJ: 0, extents: {} };
  const nw = normalizeWater(c, ctx);
  res.heatJ += nw.heatJ;
  if (nw.extent) res.extents.neutralization = (res.extents.neutralization ?? 0) + nw.extent;
  if (c.volL <= 1e-9) return res;
  for (let sweep = 0; sweep < 40; sweep++) {
    let moved = 0;
    for (const r of ctx.fast) {
      if (!relevant(c, r, true) && !relevant(c, r, false)) continue;
      const xi = equilibriumExtent(c, r, ctx, tempC);
      if (xi === 0) continue;
      res.heatJ += applyExtent(c, r, xi, ctx);
      res.extents[r.id] = (res.extents[r.id] ?? 0) + xi;
      const w = normalizeWater(c, ctx);
      res.heatJ += w.heatJ;
      if (w.extent) res.extents.neutralization = (res.extents.neutralization ?? 0) + w.extent;
      moved = Math.max(moved, Math.abs(xi) / Math.max(1e-12, c.volL));
    }
    if (moved < 1e-10) break;
  }
  return res;
}

/** Cociente de saturación log₁₀(Q/Ksp) de un sólido (positivo = sobresaturado). Para la vista docente. */
export function saturationIndex(c: Cell, r: ReactionDef, ctx: ChemContext, tempC: number): number {
  if (r.logK === undefined || c.volL <= 1e-9) return -Infinity;
  // La reacción está escrita como formación: Q_formación = 1/IAP ⇒ log(IAP/Ksp) = logK − logQ.
  return (r.logK as number) - logQ(c, r, 0, ctx, tempC);
}

/**
 * Paso de precipitación/disolución (§9.4, §11): para cada sólido posible se calcula el avance de equilibrio
 * (Q → Ksp) y se aplica una fracción 1 − e^(−k·dt). La rapidez crece con la sobresaturación y la mezcla; la
 * cantidad final la fija la estequiometría (la agitación no crea producto).
 */
export function precipitationStep(c: Cell, ctx: ChemContext, tempC: number, dt: number, mixing: number, out?: ReactionOutcome): ReactionOutcome {
  const res = out ?? { heatJ: 0, extents: {} };
  if (c.volL <= 1e-9) return res;
  for (const r of ctx.precip) {
    const solid = Object.keys(r.nu).find((id) => ctx.species[id]?.phase === 'SOLID');
    const hasSolid = !!solid && n(c, solid) > TINY;
    if (!relevant(c, r, true) && !hasSolid) continue;
    const xi = equilibriumExtent(c, r, ctx, tempC);
    if (Math.abs(xi) <= 1e-15) continue;
    let k: number;
    if (xi > 0) {
      const si = saturationIndex(c, r, ctx, tempC);
      // Nucleación: con sobresaturación baja y sin sólido previo, casi no aparece (metaestable).
      const drive = clamp(si / 2.5, hasSolid ? 0.2 : 0.02, 1);
      k = (r.kPrecip ?? 2) * drive * (0.6 + 0.4 * clamp(mixing, 0, 1)) * (1 + 0.02 * (tempC - 25));
    } else k = (r.kDissolve ?? 0.05) * (0.5 + 0.5 * clamp(mixing, 0, 1));
    const frac = 1 - Math.exp(-Math.max(0, k) * dt);
    let step = xi * frac;
    // Cola final: si queda muy poco, se completa (evita un acercamiento asintótico interminable).
    if (Math.abs(xi) < 1e-12) step = xi;
    res.heatJ += applyExtent(c, r, step, ctx);
    res.extents[r.id] = (res.extents[r.id] ?? 0) + step;
    const w = normalizeWater(c, ctx);
    res.heatJ += w.heatJ;
    if (w.extent) res.extents.neutralization = (res.extents.neutralization ?? 0) + w.extent;
  }
  return res;
}

// ─────────────────────────── Apariencia (§6) ───────────────────────────

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Fracción rosada de la fenolftaleína (§8.5): continua, transición pH 8,2–10,0. */
export function phenolphthaleinPink(pHv: number): number {
  if (!Number.isFinite(pHv)) return 0;
  return smooth(8.2, 10.0, pHv);
}

/** Absorbancia molar del dianión rosado de la fenolftaleína por canal (L·mol⁻¹·cm⁻¹). */
export const PHENOLPHTHALEIN_PINK_ABS: [number, number, number] = [150, 21000, 600];

/**
 * Transmitancia (0–1 por canal) de la fase líquida para un camino óptico `pathCm` (Beer–Lambert). El color depende
 * de la concentración real y del espesor atravesado, no de un color fijo por recipiente.
 */
export function transmittance(c: Cell, ctx: ChemContext, tempC: number, pathCm: number, indicatorId = 'HIn'): [number, number, number] {
  if (c.volL <= 1e-9) return [1, 1, 1];
  const a: [number, number, number] = [0, 0, 0];
  for (const [id, m] of Object.entries(c.mol)) {
    const sp = ctx.species[id];
    if (!sp?.absorbRgb) continue;
    const conc = m / c.volL;
    for (let i = 0; i < 3; i++) a[i] += sp.absorbRgb[i] * conc * pathCm;
  }
  const ind = n(c, indicatorId);
  if (ind > 0) {
    const pink = phenolphthaleinPink(pH(c, tempC)) * (ind / c.volL);
    for (let i = 0; i < 3; i++) a[i] += PHENOLPHTHALEIN_PINK_ABS[i] * pink * pathCm;
  }
  return [10 ** -a[0], 10 ** -a[1], 10 ** -a[2]];
}

/** Moles de un sólido presentes en las celdas. */
export function solidIds(c: Cell, ctx: ChemContext): string[] {
  return Object.keys(c.mol).filter((id) => ctx.species[id]?.phase === 'SOLID' && (c.mol[id] ?? 0) > TINY);
}

export { LN10 };
