/**
 * Banderas de evidencia de B08 (§5): cada etapa se acredita por HECHOS del mundo y por la importación a la libreta, nunca por
 * un botón. Lo logrado queda fijado (`stage:*`) y un módulo no asignado (S26, S27) se da por cumplido antes de empezar.
 */
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { BTB, TUBES } from '../../simulation/photo-world/world';
import type { B08Notebook } from './notebook';
import { answeredCount } from './notebook';

export interface B08StageFlags {
  ppe: boolean;
  hypothesis: boolean;
  gas: boolean;
  btb: boolean;
  extract: boolean;
  chrom: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B08StageFlags> = ['ppe', 'hypothesis', 'gas', 'btb', 'extract', 'chrom'];

const readingOf = (w: PhotoWorld, id: string | null) => (id ? w.photo.readings.find((r) => r.id === id) ?? null : null);

export function notebookCompleteB08(w: PhotoWorld, nb: B08Notebook): boolean {
  const m = w.photo.modules;
  const gas = !m.gas || nb.gas.every((r) => readingOf(w, r.baselineId) && readingOf(w, r.finalId) && r.dh);
  const btb = !m.btb || nb.btb.every((r) => readingOf(w, r.readingIdEnd) && r.colorEnd);
  const bands = !m.pig || nb.bands.some((r) => readingOf(w, r.readingId) && r.rf);
  return gas && btb && bands && !!nb.synthesis.conclusion.trim() && answeredCount(nb) >= 5;
}

function currentEvidence(w: PhotoWorld, nb: B08Notebook): B08StageFlags {
  const v = (k: string) => !!w.evidence[k];
  const m = w.photo;
  return {
    ppe: w.ppe,
    hypothesis: m.hypothesis.recorded,
    gas: !m.modules.gas || (v('gasRunStarted') && TUBES.every((id) => m.tubes[id].finalId)),
    btb: !m.modules.btb || (v('seriesStarted') && BTB.every((id) => m.btb[id].finalId)),
    extract: !m.modules.pig || v('pigmentExtractReady'),
    chrom: !m.modules.pig || (v('frontMarked') && v('bandMarked')),
    safeParked: v('safeParked'),
    benchRestored: v('benchRestored'),
    notebook: notebookCompleteB08(w, nb),
  };
}

export function b08StageEvidence(w: PhotoWorld, nb: B08Notebook): B08StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
