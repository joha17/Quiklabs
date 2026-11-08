/**
 * Resultados que corresponden a las lecturas REALES del intento (§8, interpretación): la libreta se corrige con los
 * datos del propio estudiante, su incertidumbre y el modo activo, nunca contra la tabla ideal. También selecciona qué
 * lecturas cuentan como evidencia de cada etapa.
 */
import type { F101World, ReadingF } from '../../simulation/f101-world/types';
import { add, angleDeg, components, cross, cylinderVolume, dot, norm, unit } from '../../simulation/models/f101/equations';
import { combinedMean, mean, uCylinderVolume, uDensity } from '../../simulation/models/f101/uncertainty';
import { DIM_INSTRUMENT, DIM_TARGET, parseNum, type Dim, type Entry, type F101Notebook } from './notebook';

export const readingsOf = (w: F101World): ReadingF[] => w.readingOrder.map((id) => w.readings[id]);
const lastOf = <T,>(a: T[]) => a[a.length - 1] ?? null;

/** Valor de una celda: el de la lectura importada si la hay; si no, lo escrito. */
export function cellValue(w: F101World, e: Entry): number {
  if (e.readingId && w.readings[e.readingId]) return w.readings[e.readingId].value;
  return parseNum(e.value);
}

/** Calidad que invalida una medida dimensional (técnica que cambia la magnitud medida). */
const BAD_LENGTH = ['FORCE', 'OBLIQUE'];
export const validLength = (r: ReadingF) => r.kind === 'length' && !r.qualityFlags.some((f) => BAD_LENGTH.includes(f));

export function dimReadings(w: F101World, dim: Dim): ReadingF[] {
  const t = DIM_TARGET[dim];
  return readingsOf(w).filter((r) => validLength(r) && r.instrumentId === DIM_INSTRUMENT[dim] && r.target === t.part && r.dimension === t.dimension);
}

export const zeroReading = (w: F101World, inst: 'caliper01' | 'micrometer01') => lastOf(readingsOf(w).filter((r) => r.instrumentId === inst && r.dimension === 'empty'));
export const standardReading = (w: F101World) => lastOf(readingsOf(w).filter((r) => r.kind === 'length' && r.target === 'gaugeBlock01' && validLength(r)));

export function massReading(w: F101World, part: string): ReadingF | null {
  return lastOf(readingsOf(w).filter((r) => r.kind === 'mass' && r.target === part && !r.qualityFlags.includes('UNSTABLE') && !r.qualityFlags.includes('NO_TARE') && r.value > 1));
}

export function volumeReadings(w: F101World) {
  const vs = readingsOf(w).filter((r) => r.kind === 'volume' && !r.qualityFlags.includes('PARALLAX') && !r.qualityFlags.includes('UNSTABLE'));
  return {
    initial: lastOf(vs.filter((r) => !(r.partsInside ?? []).length)),
    final: lastOf(vs.filter((r) => (r.partsInside ?? []).length > 0)),
  };
}

export const equilibriumReadings = (w: F101World) =>
  readingsOf(w).filter((r) => r.kind === 'equilibrium' && !r.qualityFlags.includes('TOUCHING') && !r.qualityFlags.includes('MOVING'));

/** Incertidumbre tipo B declarada por instrumento (en su unidad). */
export function instrumentUB(w: F101World, inst: string): number {
  const u = w.params.uB;
  return ({ caliper01: u.caliperMm, micrometer01: u.micrometerMm, ruler01: u.rulerMm } as Record<string, number>)[inst] ?? NaN;
}

/** Media corregida por el cero que el propio estudiante registró y su incertidumbre combinada. */
export function expectedDim(w: F101World, nb: F101Notebook, dim: Dim) {
  const inst = DIM_INSTRUMENT[dim];
  const zeroCell = inst === 'caliper01' ? nb.zeros.caliper : nb.zeros.micrometer;
  const z = cellValue(w, zeroCell);
  const zero = Number.isFinite(z) ? z : 0;
  const xs = nb.dims[dim].map((e) => cellValue(w, e)).filter(Number.isFinite).map((x) => x - zero);
  const uB = instrumentUB(w, inst);
  return { xs, mean: mean(xs), u: combinedMean(xs, uB), uB, zero };
}

export function expectedDensity(w: F101World, nb: F101Notebook) {
  const d = expectedDim(w, nb, 'cylD');
  const h = expectedDim(w, nb, 'cylH');
  const Vmm3 = cylinderVolume(d.mean, h.mean);
  const V = Vmm3 / 1000;
  const uV = uCylinderVolume(d.mean, d.u, h.mean, h.u) / 1000;
  const m = cellValue(w, nb.masses.cyl);
  const um = w.params.uB.balanceG;
  const rho = m / V;
  const urho = uDensity(m, um, V, uV);
  const vI = cellValue(w, nb.volumes.initial);
  const vF = cellValue(w, nb.volumes.final);
  const vDisp = vF - vI;
  return { d, h, V, uV, m, um, rho, urho, rhoSI: rho * 1000, vDisp, relErr: (100 * (vDisp - V)) / V };
}

export interface VecForce {
  F: number;
  theta: number;
  x: number;
  y: number;
}

/** Fuerzas de las filas de la libreta: m·g para las masas (g → kg) o la lectura del dinamómetro (N). */
export function expectedVectors(w: F101World, nb: F101Notebook) {
  const g = w.params.g;
  const q = nb.equilibriumId ? w.readings[nb.equilibriumId] : null;
  const forces: VecForce[] = nb.vectors.map((row, i) => {
    const src = q?.forces?.[i];
    // Las filas importan el TEXTO de cada fuerza del registro (la lectura de equilibrio agrupa varias fuerzas).
    const theta = parseNum(row.angle.value);
    const mOrN = parseNum(row.mass.value);
    const isDyn = src?.source === 'dynamometer01' || (row.mass.readingId === null && /n\s*$/i.test(row.mass.value.trim()));
    const F = isDyn ? mOrN : (mOrN / 1000) * g;
    const c = components(F, theta);
    return { F, theta, x: c.x, y: c.y };
  });
  const [f1, f2, f3] = forces;
  const R = add(f1, f2);
  const all = forces.filter((f) => Number.isFinite(f.F));
  const sum = add(...all);
  const u = unit(R);
  const thetaR = angleDeg(R);
  return {
    forces, R, Rmag: norm(R), thetaR, equilibrant: (thetaR + 180) % 360, residual: norm(sum), f3,
    dot12: dot(f1, f2), cross12: cross({ ...f1, z: 0 }, { ...f2, z: 0 }).z, unitX: u.x, unitY: u.y,
  };
}
