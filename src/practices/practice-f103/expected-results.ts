/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante (su altura de boca, sus ángulos leídos, sus posiciones de plataforma y de pantalla), su
 * incertidumbre y el modo activo, nunca contra la tabla ideal. También selecciona qué lecturas cuentan como evidencia.
 */
import type { F103World, ReadingF3 } from '../../simulation/f103-world/types';
import { DEG, flightTime, gateSpeed, levelRange, peakTime, rangeWithDrop, trajectoryFit, vyAt } from '../../simulation/models/f103/equations';
import { combinedMean, mean, uGateSpeed } from '../../simulation/models/f103/uncertainty';
import { GEOF103 } from '../../simulation/f103-world/geometry';
import { parseNum, VY_TIMES, type Entry, type F103Notebook } from './notebook';

export const readingsOfF3 = (w: F103World): ReadingF3[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;
const bad = (r: ReadingF3, flags: string[]) => r.qualityFlags.some((f) => flags.includes(f));
const rd = (w: F103World, id: string | null) => (id ? (w.readings[id] ?? null) : null);

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValueF3(w: F103World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

// ─────────────────────────── Selección de lecturas ───────────────────────────

export const BAD_GATE = ['MISSED', 'EDGE', 'LOW_RATE', 'UNANCHORED', 'POST_IMPACT'];
export const BAD_IMPACT = ['MISSED_PLATFORM', 'OCCLUDED', 'BOUNCE', 'UNSETTLED', 'UNCALIBRATED', 'CLIPPED', 'CONFIG_CHANGED', 'WIND_CHANGED', 'POST_IMPACT', 'UNANCHORED', 'TILTED'];
export const BAD_MARK = ['PARALLAX', 'CONFIG_CHANGED', 'WIND_CHANGED', 'UNANCHORED', 'POST_IMPACT'];

/** Disparos válidos con la fotopuerta: contra la pantalla segura (≤ 1,5 m de la boca) y sin defectos de técnica. */
export const gateRuns = (w: F103World) =>
  readingsOfF3(w).filter((r) => r.kind === 'gate' && Number.isFinite(r.value) && !bad(r, BAD_GATE) && r.setup?.screenCm != null && r.setup.screenCm <= 150);
export const impactRuns = (w: F103World) => readingsOfF3(w).filter((r) => r.kind === 'impact' && Number.isFinite(r.value) && !bad(r, BAD_IMPACT));
export const markRuns = (w: F103World) => readingsOfF3(w).filter((r) => r.kind === 'mark' && Number.isFinite(r.value) && !bad(r, BAD_MARK));
export const heightReading = (w: F103World) => lastOf(readingsOfF3(w).filter((r) => r.kind === 'height' && !r.qualityFlags.length));
export const angleReading = (w: F103World) => lastOf(readingsOfF3(w).filter((r) => r.kind === 'angle' && !r.qualityFlags.length));
export const levelReading = (w: F103World) => lastOf(readingsOfF3(w).filter((r) => r.kind === 'level' && !r.qualityFlags.length));
export const tapeReading = (w: F103World, target: string) => lastOf(readingsOfF3(w).filter((r) => r.kind === 'length' && r.target === target && !r.qualityFlags.length));

// ─────────────────────────── Valores esperados ───────────────────────────

/** Diámetro (m) que usa el estudiante: el rotulado que escribió; si falta, el de la esfera del disparo. */
export function ballDiameterM(nb: F103Notebook, r: ReadingF3 | null): number {
  const d = parseNum(nb.ballD);
  return Number.isFinite(d) && d > 0 ? d / 100 : (r?.setup?.ballCm ?? 2.5) / 100;
}

export function expectedVelocityRow(nb: F103Notebook, r: ReadingF3 | null) {
  if (!r || r.kind !== 'gate') return { v0: NaN, dt: NaN, v0Rounded: NaN };
  const d = ballDiameterM(nb, r);
  return { v0: gateSpeed(d, r.value), dt: r.value, v0Rounded: gateSpeed(d, Math.round(r.value * 1000) / 1000) };
}

/** v₀ media de los disparos importados, con u combinada (tipo A de la dispersión, tipo B del diámetro y del reloj). */
export function expectedVelocity(w: F103World, nb: F103Notebook) {
  const rows = nb.velocity.map((x) => expectedVelocityRow(nb, rd(w, x.readingId)));
  const vs = rows.map((x) => x.v0).filter(Number.isFinite);
  const dts = rows.map((x) => x.dt).filter(Number.isFinite);
  const first = nb.velocity.map((x) => rd(w, x.readingId)).find((r) => r?.kind === 'gate') ?? null;
  const ut = first ? first.uncertainty : w.params.uB.gateS;
  const uB = uGateSpeed(ballDiameterM(nb, first), 5e-5, mean(dts), ut);
  const v0Mean = mean(vs);
  return { rows, vs, v0Mean, uB, uV: combinedMean(vs, Number.isFinite(uB) ? uB : 0) };
}

/** v₀ con que se predice: la media escrita si es número; si no, la que corresponde a las lecturas. */
function v0ForPrediction(w: F103World, nb: F103Notebook): number {
  const ev = expectedVelocity(w, nb);
  return ev.v0Mean;
}

const R_BALL = 0.0125;
/** Caída (m) desde la boca hasta el centro de la esfera al tocar la placa. */
export const dropToPlatform = (hCm: number) => hCm / 100 - (GEOF103.platform.h / 100 + R_BALL);

/** Alcance medido de un impacto (m): desde la plomada hasta el primer contacto, con el desvío lateral si lo hay. */
export function measuredRange(w: F103World, nb: F103Notebook, r: ReadingF3 | null, xPlat: Entry) {
  const zero = cellValueF3(w, nb.setup.tapeZero);
  const z0 = Number.isFinite(zero) ? zero : 0;
  const xp = cellValueF3(w, xPlat);
  if (!r?.impact || !Number.isFinite(r.impact.xCm) || !Number.isFinite(xp)) return { R: NaN, dx: NaN, lateral: false };
  const dx = (xp - z0 + r.impact.xCm) / 100;
  const dy = r.impact.yCm / 100;
  const lateral = Math.abs(r.impact.yCm) > 3;
  return { R: lateral ? Math.hypot(dx, dy) : dx, dx, lateral };
}

export function expectedAngleRow(w: F103World, nb: F103Notebook, i: number, v0 = v0ForPrediction(w, nb)) {
  const row = nb.angles[i];
  const r = rd(w, row.readingId);
  const th = cellValueF3(w, row.angle);
  const h = cellValueF3(w, nb.setup.muzzleH);
  const drop = dropToPlatform(h);
  const m = measuredRange(w, nb, r, row.xPlat);
  return {
    ...m,
    theta: th,
    Rpred: rangeWithDrop(v0, th, drop, w.params.g),
    RpredLevel: levelRange(v0, th, w.params.g),
    RpredRad: rangeWithDrop(v0, th / DEG, drop, w.params.g),
    Tpred: flightTime(v0, th, drop, w.params.g),
    Tpeak: peakTime(v0, th, w.params.g),
    Tmeas: r?.impact?.tFlight ?? NaN,
    hCm: h,
  };
}

export function expectedConditionRow(w: F103World, nb: F103Notebook, i: number, v0 = v0ForPrediction(w, nb)) {
  const row = nb.conditions[i];
  const r = rd(w, row.readingId);
  const h = cellValueF3(w, row.h);
  const th = r?.setup?.angleDeg !== undefined ? impactAngle(w, nb, r) : NaN;
  const m = measuredRange(w, nb, r, row.xPlat);
  const drop = dropToPlatform(h);
  return { ...m, theta: th, hCm: h, Rpred: rangeWithDrop(v0, th, drop, w.params.g), RpredLevel: levelRange(v0, th, w.params.g) };
}

/**
 * Ángulo de un disparo de condición: el último ángulo leído en el transportador con el mismo mando antes del disparo
 * (el estudiante no vuelve a leer en cada disparo).
 */
export function impactAngle(w: F103World, _nb: F103Notebook, r: ReadingF3): number {
  const before = readingsOfF3(w).filter((x) => x.kind === 'angle' && !x.qualityFlags.length && x.tick <= r.tick && x.setup?.angleDeg === r.setup?.angleDeg);
  return lastOf(before)?.value ?? NaN;
}

export function expectedRanges(w: F103World, nb: F103Notebook) {
  const v0 = v0ForPrediction(w, nb);
  const rows = nb.angles.map((_, i) => expectedAngleRow(w, nb, i, v0));
  const errs = rows.filter((x, i) => nb.angles[i].readingId && Number.isFinite(x.R) && Number.isFinite(x.Rpred)).map((x) => (100 * (x.R - x.Rpred)) / x.Rpred);
  return { v0, rows, rangeErr: mean(errs), conditions: nb.conditions.map((_, i) => expectedConditionRow(w, nb, i, v0)) };
}

/** Puntos (x desde la plomada, y sobre el suelo) en m de la trayectoria marcada en la pantalla. */
export function trajectoryPoints(w: F103World, nb: F103Notebook): Array<[number, number]> {
  const zero = cellValueF3(w, nb.setup.tapeZero);
  const z0 = Number.isFinite(zero) ? zero : 0;
  const pts: Array<[number, number]> = [];
  for (const row of nb.trajectory) {
    const r = rd(w, row.readingId);
    const x = cellValueF3(w, row.x);
    if (r?.kind === 'mark' && Number.isFinite(r.value) && Number.isFinite(x)) pts.push([(x - z0) / 100, r.value / 100]);
  }
  return pts;
}

export function expectedTrajectory(w: F103World, nb: F103Notebook) {
  const pts = trajectoryPoints(w, nb);
  const fit = trajectoryFit(pts, w.params.g);
  const v0 = v0ForPrediction(w, nb);
  const th = cellValueF3(w, nb.setup.trajAngle);
  return {
    pts, fit,
    vx: Number.isFinite(v0) && Number.isFinite(th) ? v0 * Math.cos(th * DEG) : NaN,
    vy1: vyAt(v0, th, VY_TIMES.vy1, w.params.g),
    vy2: vyAt(v0, th, VY_TIMES.vy2, w.params.g),
  };
}
