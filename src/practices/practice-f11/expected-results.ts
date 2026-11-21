/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus niveles, sus presiones y cotas, sus pesos, masas y calados), su incertidumbre y el
 * modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia.
 */
import type { F11World, ReadingF11 } from '../../simulation/f11-world/types';
import { linearFit, relDiff } from '../../simulation/models/f11/equations';
import { uDensity, uRhoSlopeB } from '../../simulation/models/f11/uncertainty';
import { OBJECT_LABELS_F11, parseNum, type BuoyRow, type Entry, type F11Notebook, type FloatRow, type PRow } from './notebook';

export const readingsOfF11 = (w: F11World): ReadingF11[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF11, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF11 = (w: F11World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF11(w: F11World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

export const BAD_PRESSURE = ['UNPLUGGED', 'NO_ZERO', 'UNCALIBRATED', 'BUBBLE', 'WALL', 'POST_IMPACT', 'UNSTABLE', 'WAVES', 'DRIFT', 'MIXED', 'STRATIFIED', 'LOW_RATE', 'CLIPPED', 'CONFIG_CHANGED', 'RHO_CHANGED'];
export const BAD_RULER = ['PARALLAX', 'DRIFT'];
export const BAD_LEVEL = ['PARALLAX', 'WAVES', 'OCCLUDED'];
export const BAD_DRAFT = ['PARALLAX', 'WAVES', 'MOVING', 'STACKED', 'TETHERED'];
export const BAD_WEIGHT = ['EMPTY', 'OBLIQUE', 'NOT_ZEROED', 'UNSTABLE', 'MOVING', 'PARALLAX', 'CLIPPED', 'ON_BOTTOM'];
export const BAD_IMMERSION = ['NOT_ZEROED', 'MOVING', 'PARALLAX'];
export const BAD_MASS = ['NOT_ZEROED', 'NOT_TARED', 'NOT_PRIMED', 'SPILL', 'UNSTABLE', 'CLIPPED'];
export const BAD_VOLUME = ['PARALLAX', 'EMPTY'];

const valid = (w: F11World, kind: ReadingF11['kind'], flags: string[]) => readingsOfF11(w).filter((r) => r.kind === kind && Number.isFinite(r.value) && r.valid !== false && !bad(r, flags));
export const validPressures = (w: F11World) => valid(w, 'pressure', BAD_PRESSURE);
export const validRulers = (w: F11World) => valid(w, 'ruler', BAD_RULER);
export const validLevels = (w: F11World, fluid?: string) => valid(w, 'level', BAD_LEVEL).filter((r) => !fluid || r.fluid === fluid);
export const validDrafts = (w: F11World) => valid(w, 'draft', BAD_DRAFT);
export const validWeights = (w: F11World) => valid(w, 'weight', BAD_WEIGHT);
export const validImmersions = (w: F11World) => valid(w, 'immersion', BAD_IMMERSION);
export const validMasses = (w: F11World, target?: string) => valid(w, 'mass', BAD_MASS).filter((r) => !target || r.target === target);
export const validVolumes = (w: F11World) => valid(w, 'volume', BAD_VOLUME);

/** Presión en la superficie (porta-sonda o membrana fuera del líquido). */
export const surfaceReadings = (w: F11World) => validPressures(w).filter((r) => r.target === 'surface');
export const levelOf = (w: F11World, fluid: 'A' | 'B') => lastOf(validLevels(w, fluid).filter((r) => r.value > 30));

/** Pares (presión, cota) válidos del mismo ensayo en el líquido dado, uno por ensayo. */
export function profilePairs(w: F11World, fluid: 'A' | 'B'): Array<{ p: ReadingF11; z: ReadingF11 }> {
  const zs = validRulers(w);
  const out: Array<{ p: ReadingF11; z: ReadingF11 }> = [];
  const seen = new Set<string>();
  for (const p of validPressures(w)) {
    if (p.target !== 'tank' || p.fluid !== fluid || seen.has(p.trialId)) continue;
    const z = zs.find((r) => r.trialId === p.trialId);
    if (z) {
      out.push({ p, z });
      seen.add(p.trialId);
    }
  }
  return out;
}

/** Profundidades distintas (cm redondeados) de un perfil. */
export const profileDepths = (w: F11World, fluid: 'A' | 'B') => new Set(profilePairs(w, fluid).map((x) => Math.round(x.z.value)));

/** Pares (peso aparente, inmersión) válidos del mismo ensayo con el bloque en el agua. */
export function buoyPairs(w: F11World): Array<{ f: ReadingF11; i: ReadingF11 }> {
  const is = validImmersions(w);
  const out: Array<{ f: ReadingF11; i: ReadingF11 }> = [];
  const seen = new Set<string>();
  for (const f of validWeights(w)) {
    if (f.target !== 'water' || seen.has(f.trialId)) continue;
    const i = is.find((r) => r.trialId === f.trialId);
    if (i && i.value > 0) {
      out.push({ f, i });
      seen.add(f.trialId);
    }
  }
  return out;
}

export const airWeightOf = (w: F11World) => lastOf(validWeights(w).filter((r) => r.target === 'air'));
export const catchMassOf = (w: F11World) => lastOf(validMasses(w, 'catch'));
export const cylMassOf = (w: F11World) => lastOf(validMasses(w, 'cyl'));
export const cylVolumeOf = (w: F11World) => lastOf(validVolumes(w));

/** Calados válidos de objetos que flotan (no hundidos) y de objetos que se hundieron. */
export const floatDrafts = (w: F11World) => validDrafts(w).filter((r) => !r.qualityFlags.includes('SANK'));
export const sankDrafts = (w: F11World) => validDrafts(w).filter((r) => r.qualityFlags.includes('SANK'));
/** Ensayos de flotación distintos: objeto y lastre. */
export const floatKey = (r: ReadingF11) => `${r.target}:${r.ballastG ?? 0}`;

// ─────────────────────────── Valores esperados ───────────────────────────

/** Medidas del montaje que usa el estudiante. */
export function setupF11(w: F11World, nb: F11Notebook) {
  const v = (k: keyof F11Notebook['setup']) => cellValueF11(w, nb.setup[k]);
  return { LA: v('LA'), LB: v('LB'), p0: v('p0'), mCyl: v('mCyl'), VCyl: v('VCyl'), W: v('W'), mOver: v('mOver') };
}

/** h (m) y p (Pa) de una cota del perfil con el nivel L (cm), y variantes de errores. */
export function expectedPRowF11(w: F11World, nb: F11Notebook, row: PRow, fluid: 'A' | 'B') {
  const s = setupF11(w, nb);
  const L = fluid === 'A' ? s.LA : s.LB;
  const pr = rdF11(w, row.pId);
  const zr = rdF11(w, row.zId);
  const r = pr && pr.kind === 'pressure' ? pr.value : NaN;
  const z = zr && zr.kind === 'ruler' ? zr.value : NaN;
  const h = (L - z) / 100;
  const hRounded = Math.round(h * 100) / 100;
  return {
    pr, zr, r, z, L, h, p: (r - s.p0) * 1000,
    /** Variantes: h medida desde el fondo (E02), sin restar la superficie (E06) y h redondeada al cm (E35). */
    hFromBottom: z / 100,
    pNoP0: r * 1000,
    hRounded,
    roundedDiffers: Math.abs(hRounded - h) > 1e-4,
  };
}

/** Densidad del agua que usa el estudiante: la que escribió o, si no, la que sale de sus lecturas. */
function rhoForBuoy(w: F11World, nb: F11Notebook): number {
  const x = parseNum(nb.calc.rhoA.value);
  return Number.isFinite(x) && x > 500 ? x : profileFit(w, nb, 'A').rho;
}

/** V_sub (cm³), F_b y F_b prevista (N) de una inmersión, y variantes de errores. */
export function expectedBuoyF11(w: F11World, nb: F11Notebook, row: BuoyRow) {
  const s = setupF11(w, nb);
  const g = w.params.g;
  const L = OBJECT_LABELS_F11.alu1;
  const fr = rdF11(w, row.fId);
  const ir = rdF11(w, row.iId);
  const F = fr && fr.kind === 'weight' ? fr.value : NaN;
  const d = ir && ir.kind === 'immersion' ? ir.value : NaN;
  const Vsub = Math.min(Math.max(d, 0), L.H) * L.area;
  const rho = rhoForBuoy(w, nb);
  return {
    fr, ir, F, d, Vsub, Fb: s.W - F, FbPred: rho * g * Vsub * 1e-6, partial: d < L.H - 1e-6,
    /** Variantes: bloque parcial tomado como completo (E07) y empuje con el signo invertido (E16). */
    FbPredTotal: rho * g * L.V * 1e-6,
    FbNeg: F - s.W,
  };
}

/** Objeto de un ensayo de flotación desde sus lecturas. */
const objOf = (r: ReadingF11 | null) => (r && (r.target === 'float1' || r.target === 'bottle1') ? r.target : null);

/** ρ del objeto, fracción prevista y medida de un ensayo de flotación, y variantes de errores. */
export function expectedFloatF11(w: F11World, nb: F11Notebook, row: FloatRow) {
  const mr = rdF11(w, row.mId);
  const dr = rdF11(w, row.dId);
  const id = objOf(mr) ?? objOf(dr);
  const lab = id ? OBJECT_LABELS_F11[id] : null;
  const m = mr && mr.kind === 'mass' ? mr.value : NaN;
  const d = dr && dr.kind === 'draft' ? dr.value : NaN;
  const rho = lab ? (m / lab.V) * 1000 : NaN;
  const fluidRho = dr?.fluid === 'A' ? cellValueF11(w, nb.calc.rhoA) : cellValueF11(w, nb.calc.rhoB);
  const rf = Number.isFinite(fluidRho) && fluidRho > 500 ? fluidRho : dr?.fluid === 'A' ? profileFit(w, nb, 'A').rho : profileFit(w, nb, 'B').rho;
  return {
    mr, dr, id, m, d, rho, fPred: rho / rf, fMeas: lab ? d / lab.H : NaN, rhoFluid: rf,
    /** Variantes: la masa usada como densidad (E13). */
    rhoAsMass: m,
    fPredAsMass: m / rf,
  };
}

/** Ajuste p–h de un perfil escrito en la libreta: ρ = pendiente / g, con incertidumbre de ajuste y tipo B. */
export function profileFit(w: F11World, nb: F11Notebook, fluid: 'A' | 'B') {
  const p = w.params;
  const rows = (fluid === 'A' ? nb.pARows : nb.pBRows).map((r) => expectedPRowF11(w, nb, r, fluid)).filter((e) => Number.isFinite(e.h) && Number.isFinite(e.p));
  const fit = linearFit(rows.map((e) => e.h), rows.map((e) => e.p));
  const rho = fit ? fit.b / p.g : NaN;
  const hs = rows.map((e) => e.h);
  const ps = rows.map((e) => e.p);
  const dH = hs.length ? Math.max(...hs) - Math.min(...hs) : NaN;
  const dP = ps.length ? Math.max(...ps) - Math.min(...ps) : NaN;
  const uB = uRhoSlopeB(rho, p.uB.probeKPa * 1000, dP, p.uB.rulerCm / 100, dH);
  const u = fit ? Math.hypot(fit.ub / p.g, Number.isFinite(uB) ? uB : 0) : NaN;
  const inv = linearFit(ps, hs);
  return { rho, u, uB, inv: inv ? inv.b : NaN, n: rows.length, fit };
}

/** ρ_A y ρ_B de las pendientes, ρ de la probeta y desviación del empuje respecto del peso del agua rebosada. */
export function expectedCalcF11(w: F11World, nb: F11Notebook) {
  const s = setupF11(w, nb);
  const p = w.params;
  const A = profileFit(w, nb, 'A');
  const B = profileFit(w, nb, 'B');
  const rhoCyl = (s.mCyl / s.VCyl) * 1000;
  const uCyl = uDensity(rhoCyl, s.mCyl, p.uB.balanceG * Math.SQRT2, s.VCyl, p.uB.cylML);
  const buoys = nb.buoyRows.map((r) => expectedBuoyF11(w, nb, r)).filter((e) => Number.isFinite(e.F) && Number.isFinite(e.d));
  const deepest = buoys.reduce<(typeof buoys)[number] | null>((a, e) => (!a || e.d > a.d ? e : a), null);
  const FbFull = deepest ? deepest.Fb : NaN;
  const Fover = (s.mOver * p.g) / 1000;
  return {
    rhoA: A.rho, uA: A.u, uBA: A.uB, invA: A.inv, rhoB: B.rho, uB: B.u, uBB: B.uB, invB: B.inv, rhoCyl, uCyl,
    FbFull, Fover, FbDev: relDiff(FbFull, Fover), nA: A.n, nB: B.n, nBuoy: new Set(buoys.map((e) => Math.round(e.d * 10))).size,
  };
}
