/**
 * Resultados que corresponden a las lecturas REALES del intento (§12.4): con ellas se corrige la libreta. Si una mala
 * técnica dio 24,70 g, lo correcto es 24,70 g / volumen declarado, no la masa ideal. También reúne qué lecturas son
 * las de prueba, las de cada serie de agua, las de los clavos y las del cilindro (para la evidencia y la revisión).
 */
import type { P01World, Reading01 } from '../../simulation/density-world/types';
import { density, errorPctAbs } from '../../simulation/density-models/solids';
import { mean, standardFromHalfWidth, uncertaintyCylinderVolume, uncertaintyDensity, uncertaintySubtract, type UncertaintyConvention } from '../../simulation/metrology/uncertainty';
import { parseNum, type Entry, type P01Notebook, type Series } from './notebook';

export const readingsOf = (w: P01World): Reading01[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValue(w: P01World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

/** Convención efectiva del intento: la que eligió el estudiante en la libreta, o la del parámetro. */
export const conventionOf = (w: P01World, nb: P01Notebook): UncertaintyConvention => (nb.convention || w.params.convention) as UncertaintyConvention;

/** Incertidumbres estándar de cada instrumento según la convención (§7, «distinción metrológica»). */
export function instrumentU(w: P01World, conv: UncertaintyConvention) {
  const p = w.params;
  return {
    balance: p.balance.uncertaintyG,
    pipette: standardFromHalfWidth(p.pipetteToleranceHalfWidthMl, conv),
    cylinder: standardFromHalfWidth(p.graduatedCylinderReadHalfWidthMl, conv),
    thermometer: p.thermometerStandardUncertaintyC,
    caliper: p.caliperStandardUncertaintyCm,
  };
}

// ─────────────────────────── Selección de lecturas (evidencia) ───────────────────────────

/** Lecturas de prueba de 25 mL (§5.A): la primera de la probeta sin clavos con 15–35 mL y la primera de la pipeta. */
export function trialReadings(w: P01World) {
  const rs = readingsOf(w);
  return {
    probe: rs.find((r) => r.kind === 'volume' && r.instrumentId === 'cylinder50' && (r.nailsInCylinder ?? 0) === 0 && r.value >= 15 && r.value <= 35) ?? null,
    pipette: rs.find((r) => r.kind === 'volume' && r.instrumentId === 'pipette25') ?? null,
  };
}

/** Alícuotas terminadas de cada serie (la última). */
export function sampleOf(w: P01World, series: Series) {
  return lastOf(w.samples.filter((s) => s.series === series && s.endedS !== null && s.deliveredG > 20));
}

/** Lecturas de masa y temperatura de una alícuota (las válidas, la última). */
export function sampleReadings(w: P01World, series: Series) {
  const s = sampleOf(w, series);
  if (!s) return { mass: null, temp: null };
  const rs = readingsOf(w).filter((r) => r.sampleIndex === s.index);
  return {
    mass: lastOf(rs.filter((r) => r.kind === 'mass' && !r.qualityFlags.includes('TARE') && r.value > 20)),
    temp: lastOf(rs.filter((r) => r.kind === 'temp')),
  };
}

/** Pesadas de la estación C: recipiente solo y recipiente con clavos. */
export function nailMassReadings(w: P01World) {
  const rs = readingsOf(w).filter((r) => r.kind === 'mass' && !r.qualityFlags.includes('TARE') && r.sourceObjectIds.includes('weighBoat01') && r.sourceObjectIds.length === 1);
  return { boat: lastOf(rs.filter((r) => (r.load?.nails ?? 0) === 0)), boatNails: lastOf(rs.filter((r) => (r.load?.nails ?? 0) > 0)) };
}

/** Lecturas de la probeta para el desplazamiento: inicial (sin clavos) y final (con clavos). */
export function displacementReadings(w: P01World) {
  const rs = readingsOf(w).filter((r) => r.kind === 'volume' && r.instrumentId === 'cylinder50');
  const fin = lastOf(rs.filter((r) => (r.nailsInCylinder ?? 0) > 0));
  const before = fin ? rs.filter((r) => r.t < fin.t) : rs;
  return { initial: lastOf(before.filter((r) => (r.nailsInCylinder ?? 0) === 0 && r.value > 5)), final: fin };
}

/** Pesadas de la estación D: vidrio solo y vidrio con el cilindro. */
export function cylinderMassReadings(w: P01World) {
  const rs = readingsOf(w).filter((r) => r.kind === 'mass' && !r.qualityFlags.includes('TARE') && r.sourceObjectIds.includes('watchGlass01') && r.sourceObjectIds.length === 1);
  return { glass: lastOf(rs.filter((r) => !r.load?.solid)), total: lastOf(rs.filter((r) => !!r.load?.solid)) };
}

export function caliperReadings(w: P01World) {
  const rs = readingsOf(w).filter((r) => r.kind === 'length');
  return { diameters: rs.filter((r) => r.target === 'diameter'), heights: rs.filter((r) => r.target === 'height'), zero: rs.filter((r) => r.target === 'empty') };
}

// ─────────────────────────── Cálculos que corresponden a las lecturas del estudiante ───────────────────────────

export interface WaterExpected {
  m: number;
  V: number;
  T: number;
  um: number;
  uV: number;
  rho: number;
  urho: number;
}

export function expectedWater(w: P01World, nb: P01Notebook, series: Series): WaterExpected {
  const conv = conventionOf(w, nb);
  const u = instrumentU(w, conv);
  const row = nb.tableB[series];
  const m = cellValue(w, row.mass);
  const vTyped = parseNum(row.volume.value);
  const V = Number.isFinite(vTyped) ? vTyped : w.params.pipetteNominalMl;
  const rho = density(m, V);
  return { m, V, T: cellValue(w, row.temp), um: u.balance, uV: u.pipette, rho, urho: uncertaintyDensity(m, u.balance, V, u.pipette) };
}

export interface DisplacementExpected {
  mNet: number;
  um: number;
  vI: number;
  vF: number;
  dV: number;
  udV: number;
  rho: number;
  urho: number;
  errPct: number;
}

export function expectedDisplacement(w: P01World, nb: P01Notebook): DisplacementExpected {
  const u = instrumentU(w, conventionOf(w, nb));
  const c = nb.tableC;
  const mNet = cellValue(w, c.boatNailsMass) - cellValue(w, c.boatMass);
  const vI = cellValue(w, c.vInitial);
  const vF = cellValue(w, c.vFinal);
  const dV = vF - vI;
  const um = uncertaintySubtract(u.balance, u.balance);
  const udV = uncertaintySubtract(u.cylinder, u.cylinder);
  const rho = density(mNet, dV);
  return { mNet, um, vI, vF, dV, udV, rho, urho: uncertaintyDensity(mNet, um, dV, udV), errPct: errorPctAbs(rho, w.params.nailsReferenceDensityGPerMl) };
}

export interface GeometryExpected {
  mNet: number;
  um: number;
  dMean: number;
  hMean: number;
  ud: number;
  uh: number;
  V: number;
  uV: number;
  rho: number;
  urho: number;
  errPct: number;
}

export function expectedGeometry(w: P01World, nb: P01Notebook): GeometryExpected {
  const u = instrumentU(w, conventionOf(w, nb));
  const d = nb.tableD;
  const mNet = cellValue(w, d.totalMass) - cellValue(w, d.glassMass);
  const um = uncertaintySubtract(u.balance, u.balance);
  const dMean = mean([cellValue(w, d.d1), cellValue(w, d.d2)]);
  const hMean = mean([cellValue(w, d.h1), cellValue(w, d.h2)]);
  const V = Math.PI * (dMean / 2) ** 2 * hMean;
  const uV = uncertaintyCylinderVolume(dMean, u.caliper, hMean, u.caliper);
  const rho = density(mNet, V);
  return { mNet, um, dMean, hMean, ud: u.caliper, uh: u.caliper, V, uV, rho, urho: uncertaintyDensity(mNet, um, V, uV), errPct: errorPctAbs(rho, w.params.cylinderMaterialDensityGPerMl) };
}

// ─────────────────────────── Verdad del motor (revisión y docente) ───────────────────────────

/** Lo que de verdad pasó en cada serie: masa entregada, temperatura y técnica observada. */
export function seriesTruth(w: P01World, series: Series) {
  const s = sampleOf(w, series);
  return s ? { deliveredG: s.deliveredG, tempC: s.tempAtDeliveryC, flags: s.flags } : null;
}
