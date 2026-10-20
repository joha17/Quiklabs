/**
 * Resultados esperados de la Práctica 7 (§12.8), calculados desde el estado y las lecturas PROPIAS del intento:
 * qué pares de disolventes se observaron, qué contactos del detector fueron válidos, qué lecturas de κ son blanco,
 * electrolito fuerte, no electrolito o débil, qué pruebas independientes se hicieron sobre cada incógnita y la
 * concentración que corresponde a las masas y volúmenes que el estudiante midió. Nunca contra valores ideales.
 */
import type { MaterialId, P07World, Reading07 } from '../../simulation/bonding-world/types';
import { MATERIALS } from '../../simulation/solution-properties/materials';
import { parseNum, type Entry, type P07Notebook, type RowD } from './notebook';

export const readingsOf = (w: P07World): Reading07[] => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
export const reading = (w: P07World, id: string | null | undefined): Reading07 | null => (id ? w.readings[id] ?? null : null);
export const cellValue = (w: P07World, e: Entry) => (e.readingId && w.readings[e.readingId] ? w.readings[e.readingId].value : parseNum(e.value));

const SOLVENTS = new Set<MaterialId>(['water', 'heptane']);
const samplesOf = (r: Reading07) => r.snapshot.materials.filter((m) => !SOLVENTS.has(m));

export interface PairObservation {
  id: string;
  tubeId: string;
  solvent: 'water' | 'heptane' | 'both' | 'none';
  samples: MaterialId[];
  equilibrated: boolean;
  phases: number;
  undissolvedG: number;
}

/** Observaciones de mezcla de un recipiente con un solo disolvente y su muestra. */
export function pairObservations(w: P07World): PairObservation[] {
  return readingsOf(w)
    .filter((r) => r.kind === 'observation')
    .map((r) => {
      const sol = r.snapshot.solvents ?? [];
      const solvent = sol.length === 2 ? 'both' : sol[0] === 'water' ? 'water' : sol[0] === 'heptane' ? 'heptane' : 'none';
      return {
        id: r.id, tubeId: r.targetId, solvent, samples: samplesOf(r), equilibrated: (r.snapshot.sinceAddS ?? 0) >= w.params.mixObservationS && !r.qualityFlags.includes('NOT_EQUILIBRATED'),
        phases: r.snapshot.phases ?? 0, undissolvedG: r.snapshot.undissolvedG ?? 0,
      };
    });
}

/** Muestras comparadas en AMBOS disolventes con observación en equilibrio (§5.B). */
export function comparedSamples(w: P07World): MaterialId[] {
  const obs = pairObservations(w).filter((o) => o.equilibrated && o.samples.length === 1);
  const out: MaterialId[] = [];
  for (const o of obs) {
    const m = o.samples[0];
    if (out.includes(m)) continue;
    if (obs.some((x) => x.samples[0] === m && x.solvent === 'water') && obs.some((x) => x.samples[0] === m && x.solvent === 'heptane')) out.push(m);
  }
  return out;
}

export const volumeReadings = (w: P07World) => readingsOf(w).filter((r) => r.kind === 'volume' && r.valid);

/** Lecturas válidas del detector sobre muestras (no el panel de control). */
export function contactReadings(w: P07World) {
  return readingsOf(w).filter((r) => r.kind === 'current' && r.valid && r.targetId !== 'det01pad' && r.snapshot.specimenId);
}

export const controlReadings = (w: P07World) => readingsOf(w).filter((r) => r.kind === 'current' && r.valid && r.targetId === 'det01pad');

export function contactOf(w: P07World, family: 'metal' | 'ionicDry' | 'graphite') {
  return contactReadings(w).filter((r) => {
    const sp = w.specimens[r.snapshot.specimenId!];
    if (!sp || sp.unknownCode) return false;
    const f = MATERIALS[sp.material].family;
    if (family === 'metal') return f === 'metal' || f === 'alloy';
    if (family === 'graphite') return sp.material === 'graphite';
    return f === 'ionic-solid' && !r.snapshot.wetSurface;
  });
}

export type KappaClass = 'blank' | 'strong' | 'nonElectrolyte' | 'weak' | 'standard' | 'other';

/** Qué se midió en una lectura de κ según lo que contenía el recipiente (no según lo que diga el rótulo). */
export function kappaClass(r: Reading07): KappaClass {
  if (r.targetId.startsWith('std')) return 'standard';
  const mats = samplesOf(r);
  if (!mats.length) return 'blank';
  if (mats.includes('acetic')) return 'weak';
  if (mats.some((m) => MATERIALS[m].dissociation)) return 'strong';
  if (mats.every((m) => MATERIALS[m].family === 'molecular' || MATERIALS[m].family === 'mixture')) return 'nonElectrolyte';
  return 'other';
}

export const kappaReadings = (w: P07World, cls?: KappaClass) => readingsOf(w).filter((r) => r.kind === 'conductivity' && r.valid && (!cls || kappaClass(r) === cls));

/** Concentraciones distintas (verdad del motor) de electrolito fuerte medidas (§5.D: dos niveles). */
export function strongLevels(w: P07World): number[] {
  const out: number[] = [];
  for (const r of kappaReadings(w, 'strong')) {
    const c = r.snapshot.trueConcM ?? 0;
    if (c > 0 && !out.some((x) => Math.abs(x - c) / Math.max(x, c) < 0.25)) out.push(c);
  }
  return out;
}

export type TestGroup = 'contact' | 'mixing' | 'solution';

/** Grupos de prueba INDEPENDIENTES realizados con lecturas válidas sobre una incógnita (§5.E). */
export function unknownTests(w: P07World, k: 'X' | 'Y'): Set<TestGroup> {
  const u = w.unknowns[k];
  const out = new Set<TestGroup>();
  if (!u) return out;
  const fromUnk = (r: Reading07) => (r.snapshot.sources ?? []).includes(u.jarId);
  for (const r of readingsOf(w)) {
    if (r.kind === 'current' && r.valid && u.specimenId && r.snapshot.specimenId === u.specimenId) out.add('contact');
    if (r.kind === 'observation' && fromUnk(r) && (r.snapshot.sinceAddS ?? 0) >= w.params.mixObservationS) out.add('mixing');
    // κ del líquido puro = prueba de conducción del material; κ en agua = prueba de la disolución.
    if (r.kind === 'conductivity' && r.valid && fromUnk(r)) out.add(r.snapshot.materials.includes('water') ? 'solution' : 'contact');
  }
  return out;
}

/** Grupo al que pertenece cada tipo de prueba declarado en el Cuadro E. */
export const testGroupOf = (t: string): TestGroup | null =>
  t === 'solidContact' || t === 'pureKappa' ? 'contact' : t === 'mixWater' || t === 'mixApolar' ? 'mixing' : t === 'solutionKappa' ? 'solution' : null;

/** Categoría química que corresponde a cada familia (para revisar la clasificación DESPUÉS de la entrega). */
export function expectedClass(m: MaterialId): string {
  const f = MATERIALS[m].family;
  if (f === 'metal' || f === 'alloy') return 'metallic';
  if (f === 'ionic-solid') return 'ionic';
  if (f === 'covalent-network') return 'covalentNetwork';
  return 'molecular';
}

/**
 * Concentración «reportable» de una fila del Cuadro D (§12.8): la que corresponde a la masa y el volumen que el
 * estudiante midió (lecturas importadas o escritas), con la masa molar del soluto que contenía la medición.
 */
export function reportableConc(w: P07World, row: RowD): number {
  const k = reading(w, row.kappa.readingId);
  const m = cellValue(w, row.mass);
  const v = cellValue(w, row.volume);
  const solute = k ? samplesOf(k).find((x) => MATERIALS[x].molarMassGmol) : undefined;
  if (!solute || !(m > 0) || !(v > 0)) return NaN;
  return m / MATERIALS[solute].molarMassGmol! / (v / 1000);
}

/** Concentración verdadera (motor) de la lectura de κ de una fila: solo docente y auditoría. */
export const trueConcOf = (w: P07World, row: RowD) => reading(w, row.kappa.readingId)?.snapshot.trueConcM ?? NaN;

/** Valor de κ de la lectura importada en la unidad elegida por el estudiante. */
export function kappaIn(r: Reading07, unit: string): number {
  const us = r.unit === 'mS/cm' ? r.value * 1000 : r.value;
  if (unit === 'µS/cm') return us;
  if (unit === 'mS/cm') return us / 1000;
  if (unit === 'S/m') return us / 1e4;
  return NaN;
}

export const notebookUsesReading = (nb: P07Notebook, id: string) =>
  Object.values(nb.tableD).some((r) => r.kappa.readingId === id) || Object.values(nb.tableC).some((r) => r.readingId === id);
