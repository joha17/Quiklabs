/**
 * Resultados esperados de B04 calculados con las lecturas PROPIAS del intento (§11.2, §12.2): qué tubos son trazables,
 * qué ensayo recibió cada uno, qué controles se leyeron, qué condiciones de catalasa tienen gas registrado y qué
 * capturas de Feulgen valen. La referencia sale de los datos registrados, no del color ideal de una guía.
 */
import type { BioReading, BioTube, BioWorld } from '../../simulation/bio-world/types';
import { LOT_CODE, POS_CONTROL, lotOfCode } from '../../simulation/bio-world/world';
import { fixedCaptures, observation } from '../practice-b01/expected-results';

export { observation };

export const reading = (w: BioWorld, id: string | null | undefined): BioReading | null => (id ? w.bio.readings[id] ?? null : null);

export type Assay = 'LUG' | 'BIU' | 'EMU' | 'BEN' | 'CAT' | 'AMY' | 'ADH';

/** Ensayo que REALMENTE recibió un tubo, por sus reactivos (no por su rótulo). */
export function assayOf(t: BioTube): Assay | null {
  if (t.reagents.iodine !== undefined) return 'LUG';
  if (t.reagents.benedict !== undefined) return 'BEN';
  if (t.reagents.cu !== undefined) return 'BIU';
  if (t.reagents.ethanol !== undefined) return 'EMU';
  if (t.reagents.h2o2 !== undefined) return 'CAT';
  if (t.reagents.amylase !== undefined) return 'AMY';
  return null;
}

/** Lotes trazables de un tubo (frascos y preparaciones). */
export const lotsOf = (w: BioWorld, tubeId: string) => w.bio.vessels[tubeId].tags.filter((x) => LOT_CODE[x]);

/** Tubo leído, rotulado y con el ensayo que dice su rótulo. */
export function traceable(w: BioWorld, tubeId: string): boolean {
  const t = w.bio.tubes[tubeId];
  if (!t?.label || t.readAt === null) return false;
  const [assay, code] = t.label.split('/');
  const lot = lotOfCode(code);
  return assayOf(t) === assay && (!lot || w.bio.vessels[tubeId].tags.includes(lot));
}

export const tubeByLabel = (w: BioWorld, label: string) => Object.keys(w.bio.tubes).find((id) => w.bio.tubes[id].label === label) ?? null;

/** Ensayos de biomoléculas con tubos leídos, y su control negativo y positivo. */
export function assayControls(w: BioWorld, assay: 'LUG' | 'BIU' | 'EMU' | 'BEN') {
  const tubes = Object.keys(w.bio.tubes).filter((id) => {
    const t = w.bio.tubes[id];
    return t.readAt !== null && assayOf(t) === assay && !t.sources.some((s) => s.endsWith('*'));
  });
  const neg = tubes.some((id) => {
    const l = lotsOf(w, id);
    return l.length === 1 && l[0] === 'bW';
  });
  const pos = tubes.some((id) => lotsOf(w, id).some((x) => POS_CONTROL[assay].includes(x)));
  const samples = tubes.filter((id) => lotsOf(w, id).some((x) => x !== 'bW' && !POS_CONTROL[assay].includes(x)));
  return { tubes, neg, pos, samples };
}

/** Condiciones de catalasa con gas medido (incluido el blanco `none`). */
export function catalaseConditions(w: BioWorld): string[] {
  return [...new Set(Object.values(w.bio.tubes).filter((t) => t.gasReadsS.length > 0 && t.condition).map((t) => t.condition!))];
}

/** Alícuotas de una hidrólisis (marcadas `*`) leídas con Lugol y con Benedict por separado, y su control sin enzima. */
export function amylaseContrast(w: BioWorld) {
  const split = Object.values(w.bio.tubes).filter((t) => t.readAt !== null && t.sources.some((s) => s.endsWith('*')));
  const lugol = split.some((t) => assayOf(t) === 'LUG' && t.reagents.benedict === undefined);
  const benedict = split.some((t) => assayOf(t) === 'BEN' && t.reagents.iodine === undefined);
  // Control sin enzima: almidón del mismo lote (P1), sin amilasa, leído con Lugol o Benedict.
  const control = Object.entries(w.bio.tubes).some(([id, t]) => {
    const tags = w.bio.vessels[id].tags;
    return t.readAt !== null && tags.includes('P1') && !tags.includes('P3') && (assayOf(t) === 'LUG' || assayOf(t) === 'BEN');
  });
  return { lugol, benedict, control };
}

/** Capturas válidas de las láminas de Feulgen asignadas a ≥ 10X. */
export const feulgenCaptures = (w: BioWorld) => fixedCaptures(w).filter((o) => (o.objectiveX ?? 0) >= 10 && String(o.assetId).startsWith('feulgen'));

/** Condiciones de ADH leídas en el fotómetro. */
export const adhConditions = (w: BioWorld) => Object.values(w.bio.readings).filter((r) => r.instrument === 'photometer').map((r) => r.quality ?? '');
