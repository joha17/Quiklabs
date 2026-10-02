import type { SubstanceId, SubstanceTable } from '../substances/types';
import type { Vessel, World } from './types';
import { dominantSubstance, liquidVolumeMl, oilMass, particulateMassG, substanceMass } from '../solutions/mixture';
import { capacityG } from '../solutions/solubility';

/** §4.2 — máquina de estados del tubo. */
export type TubeState = 'EMPTY' | 'LABELED' | 'SAMPLE_ADDED' | 'WATER_ADDED' | 'MIXING' | 'SETTLING' | 'OBSERVABLE' | 'RECORDED';
export type TubeError = 'MISLABELED' | 'OVERFILLED' | 'CONTAMINATED' | 'SPILLED' | 'BROKEN';

/** Lo que se ve en el tubo (para retroalimentación y evaluación; nunca se muestra como respuesta). */
export type TubeAppearance =
  | 'NO_WATER'
  | 'CLEAR_SOLUTION'
  | 'SOLID_REMAINING'
  | 'DARK_CLOUD'
  | 'SEDIMENT'
  | 'FLOATING_PARTICLES'
  | 'EMULSION'
  | 'TWO_LAYERS'
  | 'INCONCLUSIVE';

export interface TubeStatus {
  state: TubeState;
  errors: TubeError[];
  sample: SubstanceId | null;
  sampleG: number;
  waterMl: number;
  appearance: TubeAppearance;
  contaminants: SubstanceId[];
  waterBeforeSample: boolean;
  shaken: boolean;
}

const SETTLE_S = 12;

export function tubeStatus(
  w: World,
  v: Vessel,
  subs: SubstanceTable,
  labelToSubstance: Record<string, SubstanceId>,
  recorded = false,
): TubeStatus {
  const m = v.mix;
  const sample = dominantSubstance(m);
  const sampleG = sample ? substanceMass(m, sample) : 0;
  const waterMl = m.waterG;
  const errors: TubeError[] = [];
  if (v.integrity === 0) errors.push('BROKEN');
  if (v.tipped) errors.push('SPILLED');
  if (v.label && sample && labelToSubstance[v.label] && labelToSubstance[v.label] !== sample) errors.push('MISLABELED');
  if (liquidVolumeMl(m, subs) > 4) errors.push('OVERFILLED');
  const contaminants: SubstanceId[] = [];
  if (sample) {
    const all = new Set<SubstanceId>([
      ...(Object.keys(m.solid) as SubstanceId[]),
      ...(Object.keys(m.dissolved) as SubstanceId[]),
      ...(Object.keys(m.oil) as SubstanceId[]),
    ]);
    for (const s of all) if (s !== sample && substanceMass(m, s) > 0.002) contaminants.push(s);
    if (contaminants.length) errors.push('CONTAMINATED');
  }

  const sinceAgit = w.timeS - v.lastAgitatedS;
  const shaken = v.agitatedTotalS > 1;
  let state: TubeState;
  if (!sample && m.waterG <= 0) state = v.label ? 'LABELED' : 'EMPTY';
  else if (m.waterG <= 0.05) state = 'SAMPLE_ADDED';
  else if (!sample) state = 'WATER_ADDED';
  else if (v.agitation > 0.15) state = 'MIXING';
  else if (!shaken) state = 'WATER_ADDED';
  else if (sinceAgit < SETTLE_S || m.emulsion > 0.15) state = 'SETTLING';
  else state = 'OBSERVABLE';
  if (recorded && state === 'OBSERVABLE') state = 'RECORDED';

  return {
    state,
    errors,
    sample,
    sampleG,
    waterMl,
    appearance: appearance(v, subs, sample, shaken),
    contaminants,
    waterBeforeSample: v.waterBeforeSample,
    shaken,
  };
}

function appearance(v: Vessel, subs: SubstanceTable, sample: SubstanceId | null, shaken: boolean): TubeAppearance {
  const m = v.mix;
  if (m.waterG <= 0.05) return 'NO_WATER';
  if (!sample) return 'CLEAR_SOLUTION';
  const def = subs[sample];
  if (def.waterBehavior === 'IMMISCIBLE') return m.emulsion > 0.15 ? 'EMULSION' : oilMass(m) > 0 ? 'TWO_LAYERS' : 'CLEAR_SOLUTION';
  const solid = particulateMassG(m);
  if (def.waterBehavior === 'SOLUBLE') {
    if (solid < 0.002) return 'CLEAR_SOLUTION';
    const cap = capacityG(def, v.temperatureC, m.waterG);
    // Saturada: el sólido remanente no se disolverá (posible falso «insoluble», A3).
    if ((m.dissolved[sample] ?? 0) >= cap * 0.98) return 'SOLID_REMAINING';
    return shaken ? 'INCONCLUSIVE' : 'INCONCLUSIVE';
  }
  const susp = m.suspended[sample] ?? 0;
  if (def.particle.floatFraction > 0.2) return 'FLOATING_PARTICLES';
  if (susp > 0.25 && def.particle.kind === 'POWDER') return 'DARK_CLOUD';
  return 'SEDIMENT';
}
