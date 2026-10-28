/**
 * Banderas de evidencia de B03 (§5): cada etapa se acredita por HECHOS del mundo (lecturas instrumentales, tubos
 * trazables, capturas de montajes propios) y por la importación a la libreta, nunca por un botón. Las etapas logradas
 * quedan fijadas (`stage:*`), así se puede volver a una estación y repetir sin perder lo acreditado.
 */
import type { PermWorld } from '../../simulation/perm-world/types';
import type { B03Notebook } from './notebook';
import { ASSAY_LABELS, MEDIA, controlRead, mediaDone, osmosisReadings, reading, tubeTraceable } from './expected-results';

export interface B03StageFlags {
  ppe: boolean;
  setup: boolean;
  diffusion: boolean;
  dialysis: boolean;
  osmosis: boolean;
  microscopy: boolean;
  safeParked: boolean;
  benchRestored: boolean;
  notebook: boolean;
}

const LATCHED: Array<keyof B03StageFlags> = ['ppe', 'setup', 'diffusion', 'dialysis', 'osmosis', 'microscopy'];
const e = (w: PermWorld, k: string) => !!w.evidence[k];

export function notebookComplete(w: PermWorld, nb: B03Notebook): boolean {
  const k = Object.values(nb.analysis).filter((s) => s.trim().length > 25).length;
  return !!nb.membrane.material && nb.diffusion.conclusion.trim().length > 10 && nb.dialysis.conclusion.trim().length > 10
    && nb.osmosis.explanation.trim().length > 10 && nb.micro.rows.filter((r) => r.observationId && r.treatment && r.condition).length >= 3 && k >= 5 && !!w;
}

function currentEvidence(w: PermWorld, nb: B03Notebook): B03StageFlags {
  const hyp = Object.values(nb.membrane.hypothesis).some(Boolean);
  const diffRows = nb.diffusion.rows.filter((r) => reading(w, r.readingId)?.targetId.startsWith('c1:')).length;
  const assayRows = nb.dialysis.rows.filter((r) => ASSAY_LABELS.includes(r.label as never) && r.interpretation && reading(w, r.readingId)).length;
  const microRows = nb.micro.rows.filter((r) => r.observationId && r.treatment && r.condition).length;
  return {
    ppe: w.ppe,
    setup: w.ppe && w.perm.leakTestPassed.length > 0 && !!nb.membrane.material && hyp,
    diffusion: e(w, 'diff:t0') && e(w, 'diff:t30') && e(w, 'diff:t60') && diffRows >= 3 && nb.diffusion.conclusion.trim().length > 10,
    dialysis: ASSAY_LABELS.every((l) => tubeTraceable(w, l)) && controlRead(w, 'blank') && (controlRead(w, 'pos-protein') || controlRead(w, 'pos-chloride'))
      && assayRows >= 4 && nb.dialysis.conclusion.trim().length > 10,
    osmosis: e(w, 'osm:start:A') && e(w, 'osm:start:B') && e(w, 'osm:end:A') && e(w, 'osm:end:B') && osmosisReadings(w, nb).ok && nb.osmosis.explanation.trim().length > 10,
    microscopy: mediaDone(w).length === MEDIA.length && microRows >= 3,
    safeParked: e(w, 'safeParked'),
    benchRestored: e(w, 'benchRestored'),
    notebook: notebookComplete(w, nb),
  };
}

export function b03StageEvidence(w: PermWorld, nb: B03Notebook): B03StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}
