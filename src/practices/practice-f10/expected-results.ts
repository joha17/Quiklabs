/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus pesos, sus posiciones, sus reacciones, sus fuerzas y alargamientos), su
 * incertidumbre y el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia.
 */
import type { F10World, ReadingF10 } from '../../simulation/f10-world/types';
import { circleArea, linearFit, relDiff } from '../../simulation/models/f10/equations';
import { mean } from '../../simulation/models/f10/uncertainty';
import { relUYoung } from '../../simulation/models/f10/uncertainty';
import { parseNum, type ElRow, type Entry, type EqRow, type F10Notebook } from './notebook';

export const readingsOfF10 = (w: F10World): ReadingF10[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF10, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF10 = (w: F10World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF10(w: F10World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

export const BAD_WEIGHT = ['EMPTY', 'OBLIQUE', 'NOT_ZEROED', 'UNSTABLE', 'PARALLAX', 'CLIPPED'];
export const BAD_TAPE = ['PARALLAX', 'NOT_BALANCED', 'BENCH_TILTED', 'TIPPED'];
export const BAD_REACTION = ['NOT_SEATED', 'NO_BEAM', 'TIPPED', 'HAND_ON', 'ILL_COND', 'SUPPORT_MOVED', 'UNSTABLE', 'POST_IMPACT', 'NOT_ZEROED', 'UNPLUGGED', 'CLIPPED'];
export const BAD_PRESS = ['NO_SPECIMEN', 'ECCENTRIC', 'PRELOAD', 'PREDEFORMED', 'TRANSIENT', 'CONFIG_CHANGED', 'UNPLUGGED', 'NOT_ZEROED', 'UNSTABLE', 'CLIPPED'];
export const BAD_GAUGE = [...BAD_PRESS, 'NO_GAUGE', 'TRANSVERSE', 'TILTED_GAUGE', 'OCCLUDED', 'UNCALIBRATED', 'VIBRATION'];
export const BAD_CURVE = ['UNPLUGGED', 'NOT_ZEROED', 'UNCALIBRATED', 'NO_GAUGE', 'TRANSVERSE', 'TILTED_GAUGE', 'OCCLUDED', 'ECCENTRIC', 'PRELOAD', 'PREDEFORMED', 'LOW_RATE', 'CLIPPED', 'CONFIG_CHANGED', 'TRANSIENT', 'NO_DATA'];

const valid = (w: F10World, kind: ReadingF10['kind'], flags: string[]) => readingsOfF10(w).filter((r) => r.kind === kind && Number.isFinite(r.value) && r.valid !== false && !bad(r, flags));
export const validWeights = (w: F10World) => valid(w, 'weight', BAD_WEIGHT);
export const validTapes = (w: F10World, target?: string) => valid(w, 'position', BAD_TAPE).filter((r) => !target || r.target === target);
export const validReactions = (w: F10World) => valid(w, 'reaction', BAD_REACTION);
export const validForcesF10 = (w: F10World) => valid(w, 'force', BAD_PRESS);
export const validElongs = (w: F10World) => valid(w, 'elong', BAD_GAUGE);
export const validCurves = (w: F10World) => valid(w, 'curve', BAD_CURVE).filter((r) => r.fit?.Fmax !== null && r.fit?.k !== null);
export const weightOf = (w: F10World, target: string) => lastOf(validWeights(w).filter((r) => r.target === target));
export const diameterOf = (w: F10World) => lastOf(readingsOfF10(w).filter((r) => r.kind === 'diameter'));

/** Ternas (R_A, R_B, x de la carga) válidas del mismo ensayo, una por ensayo. */
export function eqTriples(w: F10World): Array<{ a: ReadingF10; b: ReadingF10; x: ReadingF10 }> {
  const rs = validReactions(w);
  const xs = validTapes(w, 'load1');
  const out: Array<{ a: ReadingF10; b: ReadingF10; x: ReadingF10 }> = [];
  const seen = new Set<string>();
  for (const a of rs) {
    if (a.target !== 'A' || seen.has(a.trialId)) continue;
    const b = rs.find((r) => r.target === 'B' && r.trialId === a.trialId);
    const x = xs.find((r) => r.trialId === a.trialId);
    if (b && x) {
      out.push({ a, b, x });
      seen.add(a.trialId);
    }
  }
  return out;
}

/** Pares (fuerza, alargamiento) elásticos válidos del mismo escalón con carga (sin plasticidad). */
export function elasticPairs(w: F10World): Array<{ f: ReadingF10; e: ReadingF10 }> {
  const es = validElongs(w).filter((r) => !r.qualityFlags.includes('PLASTIC'));
  const out: Array<{ f: ReadingF10; e: ReadingF10 }> = [];
  const seen = new Set<string>();
  for (const f of validForcesF10(w)) {
    if (f.qualityFlags.includes('PLASTIC') || f.value < 10 || seen.has(f.trialId)) continue;
    const e = es.find((r) => r.trialId === f.trialId);
    if (e) {
      out.push({ f, e });
      seen.add(f.trialId);
    }
  }
  return out;
}

/** Residual tras descargar dentro de la zona elástica (comparador sin carga, sin plasticidad). */
export const reversibleReadings = (w: F10World) => {
  const first = elasticPairs(w)[0];
  return first ? validElongs(w).filter((r) => r.t > first.e.t && (r.trueForceN ?? 99) < 5 && !r.qualityFlags.includes('PLASTIC')) : [];
};

/** Residual tras la fluencia: comparador sin carga con la probeta plastificada, después de una curva válida. */
export const residualReadings = (w: F10World) => {
  const c = validCurves(w)[0];
  const flags = BAD_GAUGE.filter((f) => f !== 'PREDEFORMED');
  return c ? readingsOfF10(w).filter((r) => r.kind === 'elong' && r.t >= c.t && Number.isFinite(r.value) && !bad(r, flags) && r.qualityFlags.includes('PLASTIC') && (r.trueForceN ?? 99) < 5) : [];
};

// ─────────────────────────── Valores esperados ───────────────────────────

/** Medidas que usa el estudiante: pesos (N), posiciones (cm), diámetro (mm) y largo calibrado (mm). */
export function setupF10(w: F10World, nb: F10Notebook) {
  const v = (k: keyof F10Notebook['setup']) => cellValueF10(w, nb.setup[k]);
  const d = v('d');
  return { Wb: v('Wb'), W1: v('W1'), xCG: v('xCG'), xA: v('xA'), xB: v('xB'), dMm: d, L0mm: v('L0') * 10, A: circleArea(d * 1e-3) };
}

/** R_B y R_A previstas, ΣF y Στ_A medidos de una posición de la carga (y variantes de errores). */
export function expectedEqF10(w: F10World, nb: F10Notebook, row: EqRow) {
  const s = setupF10(w, nb);
  const ra = rdF10(w, row.raId);
  const rb = rdF10(w, row.rbId);
  const xr = rdF10(w, row.xId);
  const RA = ra && ra.kind === 'reaction' ? ra.value : NaN;
  const RB = rb && rb.kind === 'reaction' ? rb.value : NaN;
  const x = xr && xr.kind === 'position' ? xr.value : NaN;
  const span = s.xB - s.xA;
  const RbPred = (s.Wb * (s.xCG - s.xA) + s.W1 * (x - s.xA)) / span;
  const RaPred = s.Wb + s.W1 - RbPred;
  const tauA = (RB * span - s.Wb * (s.xCG - s.xA) - s.W1 * (x - s.xA)) / 100;
  return {
    ra, rb, xr, RA, RB, x, RbPred, RaPred, sumF: RA + RB - s.Wb - s.W1, tauA,
    /** Variantes: sin el peso de la viga (E03), brazos desde s = 0 (E04) y signo de las cargas invertido (E10). */
    RbNoBeam: (s.W1 * (x - s.xA)) / span,
    RbFromEnd: (s.Wb * s.xCG + s.W1 * x) / s.xB,
    tauFlipped: (RB * span + s.Wb * (s.xCG - s.xA) + s.W1 * (x - s.xA)) / 100,
  };
}

/** σ y ε de un escalón con el diámetro y el largo del estudiante (y variantes de errores). */
export function expectedElF10(w: F10World, nb: F10Notebook, row: ElRow) {
  const s = setupF10(w, nb);
  const fr = rdF10(w, row.fId);
  const er = rdF10(w, row.eId);
  const F = fr && fr.kind === 'force' ? fr.value : NaN;
  const dL = er && er.kind === 'elong' ? er.value : NaN;
  const sigma = F / s.A;
  const eps = dL / s.L0mm;
  return { fr, er, F, dL, sigma, eps, epsRounded: Math.round(dL * 100) / 100 / s.L0mm, roundedDiffers: Math.abs(Math.round(dL * 100) / 100 - dL) > 1e-4 };
}

/** ε reversible, σ máx y ε residual del ciclo plástico. */
export function expectedPlasticF10(w: F10World, nb: F10Notebook) {
  const s = setupF10(w, nb);
  const P = nb.plastic;
  const rev = rdF10(w, P.revId);
  const cur = rdF10(w, P.curveId);
  const res = rdF10(w, P.resId);
  return {
    rev, cur, res,
    epsRev: rev && rev.kind === 'elong' ? rev.value / s.L0mm : NaN,
    sigmaMax: cur && cur.kind === 'curve' ? cur.value / s.A : NaN,
    epsRes: res && res.kind === 'elong' ? res.value / s.L0mm : NaN,
  };
}

/** E (pendiente σ–ε), su desviación respecto del valor de tabla, y W₁ desde la pendiente R_B–x. */
export function expectedCalcF10(w: F10World, nb: F10Notebook) {
  const s = setupF10(w, nb);
  const p = w.params;
  const el = nb.elRows.map((r) => expectedElF10(w, nb, r)).filter((e) => Number.isFinite(e.sigma) && Number.isFinite(e.eps));
  const fit = linearFit(el.map((e) => e.eps), el.map((e) => e.sigma));
  const E = fit ? fit.b : NaN;
  const Fm = mean(el.map((e) => e.F));
  const dLm = mean(el.map((e) => e.dL));
  const relB = relUYoung(Number.isFinite(Fm) ? Fm : 1, p.uB.loadCellN, s.L0mm, p.uB.tapeCm * 10, s.dMm, p.uB.caliperMm, Number.isFinite(dLm) && dLm > 0 ? dLm : 1, p.uB.gaugeMm);
  const uBE = Math.abs(E) * relB;
  const uE = fit ? Math.hypot(fit.ub, uBE) : NaN;
  const inv = linearFit(el.map((e) => e.sigma), el.map((e) => e.eps));
  const Enom = p.materials[p.material].E;
  const eq = nb.eqRows.map((r) => expectedEqF10(w, nb, r)).filter((e) => Number.isFinite(e.RB) && Number.isFinite(e.x));
  const span = s.xB - s.xA;
  const rf = linearFit(eq.map((e) => e.x), eq.map((e) => e.RB));
  const W1slope = rf ? rf.b * span : NaN;
  const uW1 = rf ? Math.hypot(rf.ub * span, p.uB.cellN * Math.SQRT2) : NaN;
  return { E, uE, uBE, Einv: inv ? inv.b : NaN, Enom, Edev: relDiff(E, Enom), W1slope, uW1, nEl: el.length, nEq: new Set(eq.map((e) => Math.round(e.x))).size };
}
