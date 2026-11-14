/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (sus masas pesadas, los anchos de bandera que midió, sus tiempos y su registro de
 * fuerza), su incertidumbre y el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan
 * como evidencia.
 */
import type { CartId, F07World, ReadingF7 } from '../../simulation/f07-world/types';
import { gateVelocity, keLostPct, restitution, stickVelocity } from '../../simulation/models/f07/equations';
import { combinedMean, mean } from '../../simulation/models/f07/uncertainty';
import { parseNum, type Entry, type F07Notebook } from './notebook';

export const readingsOfF7 = (w: F07World): ReadingF7[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF7, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
export const rdF7 = (w: F07World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF7(w: F07World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

/** Banderas que invalidan un choque como evidencia de conservación. */
export const BAD_RUN = [
  'UNPLUGGED', 'INCLINED', 'UNWEIGHED', 'TARGET_MOVING', 'FLAG_WIDTH', 'FLAG_TILT', 'GATE_IN_ZONE', 'VELCRO_LOOSE', 'MAGNET_POLARITY', 'OVERLAP', 'PUSHED', 'BRAKE_ON', 'END_HIT', 'OBLIQUE',
  'WHEEL_BIND', 'MASS_CHANGED', 'HAND_IN_GATE', 'OCCLUDED', 'GATE_SLIP', 'CONFIG_CHANGED', 'POST_IMPACT', 'NO_PASS', 'NO_COLLISION',
];
export const BAD_FORCE = [...BAD_RUN.filter((f) => !['FLAG_WIDTH', 'FLAG_TILT', 'GATE_SLIP', 'OCCLUDED', 'UNWEIGHED', 'NO_PASS'].includes(f)), 'NOT_ZEROED', 'UNCALIBRATED', 'TILTED_SENSOR', 'CLIPPED', 'LOW_RATE'];

const gatesOk = (r: ReadingF7) => r.kind === 'gates' && !!r.gates && r.gates.tc !== null && !bad(r, BAD_RUN);
export const validElastic = (w: F07World) => readingsOfF7(w).filter((r) => gatesOk(r) && !r.gates!.stuck && r.setup?.bumper !== 'velcro');
export const validStick = (w: F07World) => readingsOfF7(w).filter((r) => gatesOk(r) && r.gates!.stuck && r.setup?.bumper === 'velcro');
export const validForces = (w: F07World) => readingsOfF7(w).filter((r) => r.kind === 'force' && Number.isFinite(r.value) && !bad(r, BAD_FORCE));
export const validMotions = (w: F07World) => readingsOfF7(w).filter((r) => r.kind === 'motion' && r.motion && r.motion.vA2 !== null && !bad(r, BAD_FORCE));
export const validLevels = (w: F07World) => readingsOfF7(w).filter((r) => r.kind === 'level' && !r.qualityFlags.length);
export const massReading = (w: F07World, target: string, load = 0) => lastOf(readingsOfF7(w).filter((r) => r.kind === 'mass' && r.target === target && !r.qualityFlags.length && (r.setup?.load ?? 0) === load));
export const flagReading = (w: F07World, cart: CartId) => lastOf(readingsOfF7(w).filter((r) => r.kind === 'length' && r.target === cart));

// ─────────────────────────── Valores esperados ───────────────────────────

/** Masas (kg) y anchos de bandera (m) que usa el estudiante; sin bandera importada, la del ensayo. */
export function setupF7(w: F07World, nb: F07Notebook, r?: ReadingF7 | null) {
  const fw = (e: Entry, d: number | undefined) => {
    const x = cellValueF7(w, e);
    return Number.isFinite(x) && x > 0 ? x / 100 : (d ?? 2) / 100;
  };
  return { mA: cellValueF7(w, nb.setup.mA) / 1000, mB: cellValueF7(w, nb.setup.mB) / 1000, fA: fw(nb.setup.flagA, r?.setup?.flagA), fB: fw(nb.setup.flagB, r?.setup?.flagB) };
}

type Cross = NonNullable<ReadingF7['gates']>['crossings'][number];

/** Velocidades con signo antes (i) y después (f) de cada carro, desde los cruces de las fotopuertas. */
export function velocitiesF7(r: ReadingF7 | null, fA: number, fB: number, round = false) {
  const nan = { v1i: NaN, v2i: NaN, v1f: NaN, v2f: NaN };
  if (!r || r.kind !== 'gates' || !r.gates || r.gates.tc === null) return nan;
  const tc = r.gates.tc;
  const v = (c: Cross | undefined, f: number) => (c && c.dt !== null ? gateVelocity(f, round ? Math.round(c.dt * 1000) / 1000 : c.dt, c.dir) : NaN);
  const first = (cart: CartId, before: boolean) => r.gates!.crossings.find((c) => c.cart === cart && (before ? c.t < tc : c.t > tc));
  const pick = (cart: CartId, before: boolean) => {
    const c = first(cart, before);
    // Sin paso «antes», el carro estaba quieto (blanco en reposo); sin paso «después», quieto si se lo vio parado.
    return c ? v(c, cart === 'cartA' ? fA : fB) : before || r.gates!.restAfter.includes(cart) ? 0 : NaN;
  };
  let v1f = pick('cartA', false);
  let v2f = pick('cartB', false);
  // Pegados: la velocidad común la da el primer carro que pasa una compuerta después del choque.
  if (r.gates.stuck) {
    const c = r.gates.crossings.find((x) => x.t > tc);
    const vf = c ? v(c, c.cart === 'cartA' ? fA : fB) : NaN;
    v1f = vf;
    v2f = vf;
  }
  return { v1i: pick('cartA', true), v2i: pick('cartB', true), v1f, v2f };
}

export function expectedElasticRow(w: F07World, nb: F07Notebook, r: ReadingF7 | null) {
  const { mA, mB, fA, fB } = setupF7(w, nb, r);
  const v = velocitiesF7(r, fA, fB);
  const vr = velocitiesF7(r, fA, fB, true);
  const pb = mA * v.v1i + mB * v.v2i;
  const pa = mA * v.v1f + mB * v.v2f;
  return {
    ...v, pBefore: pb, pAfter: pa, dp: pa - pb, e: restitution(v.v1i, v.v2i, v.v1f, v.v2f),
    eNonRel: [Math.abs(v.v1f / v.v1i), v.v2f / v.v1i], v1fAbs: Math.abs(v.v1f), rounded: vr,
  };
}

export function expectedStick(w: F07World, nb: F07Notebook) {
  const r = rdF7(w, nb.stick.readingId);
  const { mA, mB, fA, fB } = setupF7(w, nb, r);
  const v = velocitiesF7(r, fA, fB);
  const Ki = 0.5 * mA * v.v1i ** 2 + 0.5 * mB * v.v2i ** 2;
  const Kf = 0.5 * (mA + mB) * v.v1f ** 2;
  return { r, v1i: v.v1i, vf: v.v1f, vfModel: stickVelocity(mA, mB, v.v1i, v.v2i), Klost: keLostPct(Ki, Kf) };
}

/** Impulso sobre el carro 1: el sensor está en el paragolpes de B, así que J₁ = −J_B (tercera ley). */
export function expectedImpulse(w: F07World, nb: F07Notebook) {
  const fr = rdF7(w, nb.impulse.forceId);
  const gr = rdF7(w, nb.impulse.readingId);
  const { mA, fA, fB } = setupF7(w, nb, gr);
  const v = velocitiesF7(gr, fA, fB);
  const JB = fr && fr.kind === 'force' ? fr.value : NaN;
  return { fr, gr, J1: -JB, JB, dp1: mA * (v.v1f - v.v1i), Fmax: fr?.force?.Fmax ?? NaN, tContact: fr?.force?.tContact ?? NaN };
}

/** Centro de masa: v_CM = (m_A v_A + m_B v_B) / (m_A + m_B) con las masas de los carros cargados. */
export function expectedCm(w: F07World, nb: F07Notebook) {
  const r = rdF7(w, nb.cm.readingId);
  const mA = cellValueF7(w, nb.cm.mA) / 1000;
  const mB = cellValueF7(w, nb.cm.mB) / 1000;
  const m = r?.motion;
  const vcm = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b !== null && b !== undefined ? (mA * a + mB * b) / (mA + mB) : NaN);
  return { r, mA, mB, vBefore: vcm(m?.vA1, m?.vB1), vAfter: vcm(m?.vA2, m?.vB2) };
}

/** Promedios con su incertidumbre: Δp y e de los choques elásticos, impulso, energía perdida y v_CM. */
export function expectedCalcF7(w: F07World, nb: F07Notebook) {
  const rows = nb.elasticRows.map((x) => expectedElasticRow(w, nb, rdF7(w, x.readingId)));
  const dps = rows.map((e) => e.dp).filter(Number.isFinite);
  const es = rows.map((e) => e.e).filter(Number.isFinite);
  const p0 = mean(rows.map((e) => e.pBefore).filter(Number.isFinite));
  // Tipo B: resolución de la balanza en la masa y del cronómetro en el tiempo, sobre p ≈ 0,2 kg·m/s.
  const uBdp = Number.isFinite(p0) ? Math.abs(p0) * Math.hypot(w.params.uB.balanceG / 200, w.params.uB.gateS / 0.02) * Math.SQRT2 : 3e-4;
  const uBe = 2 * (w.params.uB.gateS / 0.02);
  const imp = expectedImpulse(w, nb);
  const uBJ = w.params.uB.forceN * (Number.isFinite(imp.tContact) ? imp.tContact : 0.03);
  const st = expectedStick(w, nb);
  const cm = expectedCm(w, nb);
  return {
    rows,
    dp: mean(dps), udp: combinedMean(dps, uBdp), uBdp,
    e: mean(es), ue: combinedMean(es, uBe), uBe,
    J: imp.J1, uJ: uBJ, uBJ,
    Klost: st.Klost,
    vcm: cm.vBefore,
    impDisc: (100 * (imp.J1 - imp.dp1)) / imp.dp1,
    nE: es.length,
  };
}
