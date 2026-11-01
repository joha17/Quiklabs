/**
 * Libreta de la práctica B10 (§12): preinforme y once secciones. La clasificación, los rótulos y las respuestas del visor se importan
 * del mundo; las filas IMPORTAN una captura propia (`observationId`) y lo interpretado lo escribe el estudiante.
 */
export type Evidence3 = '' | 'visible' | 'absent' | 'notResolved';
export type TissueGuess = '' | 'epithelial' | 'connective' | 'nervous' | 'skeletal' | 'cardiac' | 'smooth';

export interface TissueRow {
  observationId: string | null;
  tissue: TissueGuess;
  level: '' | 'tissue' | 'organism';
  structures: string;
  functionText: string;
  /** Rasgo observado que sostiene la función (TA-FUNCTION). */
  basis: '' | 'observedFeature' | 'memory';
  totalMag: string;
}

export interface MuscleTable {
  skeletalObservationId: string | null;
  cardiacObservationId: string | null;
  /** Lo que el estudiante cree de la lámina importada en cada columna. */
  skeletalGuess: TissueGuess;
  cardiacGuess: TissueGuess;
  skeletalNuclei: '' | 'multi' | 'single' | 'notResolved';
  cardiacDiscs: Evidence3;
  cardiacBranching: Evidence3;
  prepQuality: '' | 'considered' | 'ignored';
}

export interface InvertRow {
  observationId: string | null;
  organism: '' | 'sponge' | 'coral' | 'medusa' | 'planaria' | 'fluke' | 'nematode' | 'cestode' | 'earthworm';
  organization: '' | 'cellular' | 'trueTissues';
  symmetry: '' | 'radial' | 'bilateral' | 'none';
  form: '' | 'polyp' | 'medusa' | 'colony' | 'notApplicable';
  segmented: '' | 'yes' | 'no' | 'pseudo';
  trait: string;
}

export interface SmallRow {
  observationId: string | null;
  organism: '' | 'daphnia' | 'louse';
  instrument: '' | 'microscope' | 'stereo';
  stage: '' | 'adult' | 'nit' | 'nymph' | 'notDetermined';
  /** Con imagen fija el movimiento no se evalúa (§3.8). */
  motion: '' | 'observed' | 'notEvaluable';
  trait: string;
}

export interface ZooRow {
  modelId: string;
  groupName: string;
  trait: string;
  comparedWith: string;
  difference: string;
}

export interface SkullTable {
  horseTrait: string;
  cowTrait: string;
  dietInference: string;
}

export interface TrackRow {
  trackId: string;
  justification: string;
}

export const QUESTIONS_B10 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;
export type QuestionB10 = (typeof QUESTIONS_B10)[number];

export interface B10Notebook {
  attemptId: string;
  prereport: { hypothesis: string; instruments: string; precautions: string };
  tissues: TissueRow[];
  muscle: MuscleTable;
  inverts: InvertRow[];
  small: SmallRow[];
  zoo: ZooRow[];
  birdsFunction: string;
  skull: SkullTable;
  trackRows: TrackRow[];
  atlas: { conclusions: string; delivered: boolean };
  claims: { allGroupsSameOrganization: boolean; allSpongesTrueTissues: boolean };
  closure: { notes: string };
  analysis: Record<QuestionB10, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const tissueRow = (): TissueRow => ({ observationId: null, tissue: '', level: '', structures: '', functionText: '', basis: '', totalMag: '' });
export const invertRow = (): InvertRow => ({ observationId: null, organism: '', organization: '', symmetry: '', form: '', segmented: '', trait: '' });
export const smallRow = (): SmallRow => ({ observationId: null, organism: '', instrument: '', stage: '', motion: '', trait: '' });
export const zooRow = (): ZooRow => ({ modelId: '', groupName: '', trait: '', comparedWith: '', difference: '' });
export const trackRow = (): TrackRow => ({ trackId: '', justification: '' });

export function emptyB10Notebook(attemptId = ''): B10Notebook {
  return {
    attemptId,
    prereport: { hypothesis: '', instruments: '', precautions: '' },
    tissues: Array.from({ length: 4 }, tissueRow),
    muscle: { skeletalObservationId: null, cardiacObservationId: null, skeletalGuess: '', cardiacGuess: '', skeletalNuclei: '', cardiacDiscs: '', cardiacBranching: '', prepQuality: '' },
    inverts: Array.from({ length: 6 }, invertRow),
    small: Array.from({ length: 2 }, smallRow),
    zoo: Array.from({ length: 4 }, zooRow),
    birdsFunction: '',
    skull: { horseTrait: '', cowTrait: '', dietInference: '' },
    trackRows: Array.from({ length: 3 }, trackRow),
    atlas: { conclusions: '', delivered: false },
    claims: { allGroupsSameOrganization: false, allSpongesTrueTissues: false },
    closure: { notes: '' },
    analysis: Object.fromEntries(QUESTIONS_B10.map((q) => [q, ''])) as B10Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B10Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
