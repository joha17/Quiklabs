/**
 * Escenarios docentes (§10) y catálogo de errores simulables (§9) de la práctica B10. Tipos: `err` del mundo, `nb` de la libreta y
 * `asset` incidencia sin culpa. Los gestos del visor se calculan en `animal-world/world.ts`; los de instrumentos son los de B01/B02/B06
 * traducidos por `CODE_MAP_B10`; los `nb` los evalúa la rúbrica. La guía lista 105 entradas: los siete pares equivalentes quedan
 * fusionados en un solo código y el total es 98, como pide su nota (B10-3).
 */
import { SC_B10 } from '../../simulation/animal-world/world';
import { TA_NAMES, taCode, type TaName } from '../../simulation/animal-world/codes';

export type B10Scenario = (typeof SC_B10)[keyof typeof SC_B10];

export interface B10ScenarioSpec {
  id: B10Scenario;
  excludes?: B10Scenario[];
}

const S = SC_B10;
export const B10_SCENARIOS: B10ScenarioSpec[] = Object.values(S).map((id) => {
  if (id === S.FRESH) return { id, excludes: [S.NO_FRESH] };
  if (id === S.NO_FRESH) return { id, excludes: [S.FRESH] };
  if (id === S.VIDEO) return { id, excludes: [S.STILLS] };
  if (id === S.STILLS) return { id, excludes: [S.VIDEO] };
  if (id === S.ADMIN) return { id, excludes: [S.TEACHER] };
  if (id === S.TEACHER) return { id, excludes: [S.ADMIN] };
  if (id === S.REVIEW) return { id, excludes: [S.EVAL_4, S.EVAL_8, S.EVAL_12] };
  if (id === S.EVAL_4 || id === S.EVAL_8 || id === S.EVAL_12) return { id, excludes: [S.REVIEW, ...[S.EVAL_4, S.EVAL_8, S.EVAL_12].filter((x) => x !== id)] };
  return { id };
});

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB10(list: string[]): B10Scenario[] {
  const known = new Set<string>(B10_SCENARIOS.map((s) => s.id));
  const out: B10Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B10Scenario)) continue;
    const spec = B10_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B10_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B10Scenario);
  }
  return out;
}

export interface SimulatedErrorB10 {
  code: string;
  name: TaName | null;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'asset';
  kind: 'err' | 'nb' | 'asset';
  evidenceKey: string;
  feedbackKey: string;
}

/** Los que solo se pueden detectar en lo que el estudiante escribe. */
const NOTEBOOK_ONLY = new Set<TaName>([
  'TISSUE_AS_ORGANISM', 'MIXED_OBSERVATIONS', 'MAG_CONFUSED', 'CARDIAC_AS_SKELETAL', 'SKELETAL_AS_SMOOTH', 'NUCLEI_OVERCLAIM', 'EPITHELIUM_AS_CONNECTIVE', 'NERVE_AS_MUSCLE', 'FUNCTION_UNSUPPORTED', 'BAD_PREP_IGNORED',
  'SPONGE_TRUE_TISSUES', 'CORAL_AS_MEDUSA', 'SYMMETRY_CONFUSED', 'POLYP_MEDUSA', 'COLONY_AS_MEDUSA', 'SAME_ORGANIZATION', 'DAPHNIA_LOUSE', 'MOTION_FROM_STILL', 'NO_COMPARISON', 'THUMBNAIL_ANSWER', 'CLOSED_UNSAVED', 'NO_ATLAS',
]);

const GROUPS: Array<[SimulatedErrorB10['group'], TaName]> = [
  ['A', 'WRONG_INSTRUMENT'], ['B', 'START_40X'], ['C', 'STEREO_SAMPLE_MISPLACED'], ['D', 'DIRTY_SLIDE'], ['E', 'CARDIAC_AS_SKELETAL'], ['F', 'SPONGE_TRUE_TISSUES'], ['G', 'PLANARIA_FLUKE'], ['H', 'DAPHNIA_LOUSE'], ['I', 'BONY_CARTILAGINOUS'], ['J', 'WRONG_VIEW_LABEL'], ['K', 'WRONG_CAPTURE'],
];
const groupOf = (i: number) => [...GROUPS].reverse().find(([, first]) => TA_NAMES.indexOf(first) <= i)![0];

const INCIDENTS = ['lowResolution', 'noScale', 'videoMissing', 'incompleteModel', 'lowRelief', 'labelSync'];

/** 98 entradas `TA-01…98` y las seis incidencias `TA-ASSET-*`, que nunca descuentan. */
export const SIMULATED_ERRORS_B10: SimulatedErrorB10[] = [
  ...TA_NAMES.map((name, i): SimulatedErrorB10 => {
    const code = taCode(name);
    const kind = NOTEBOOK_ONLY.has(name) ? 'nb' : 'err';
    return { code, name, group: groupOf(i), kind, evidenceKey: `${kind}:${code}`, feedbackKey: `b10fb.${code}` };
  }),
  ...INCIDENTS.map((k, i): SimulatedErrorB10 => {
    const code = `TA-ASSET-${String(i + 1).padStart(2, '0')}`;
    return { code, name: null, group: 'asset', kind: 'asset', evidenceKey: `asset:${k}`, feedbackKey: `b10fb.${code}` };
  }),
];

/** Prefijo de una incidencia → código. */
export function incidentCode(key: string): string {
  if (key.startsWith('lowResolution:')) return 'TA-ASSET-01';
  if (key.startsWith('noScale:') || key.startsWith('scale:')) return 'TA-ASSET-02';
  if (key.startsWith('video:')) return 'TA-ASSET-03';
  if (key.startsWith('model:') || key.startsWith('incomplete:') || key.startsWith('missing:')) return 'TA-ASSET-04';
  if (key.startsWith('lowRelief:')) return 'TA-ASSET-05';
  return 'TA-ASSET-06';
}
