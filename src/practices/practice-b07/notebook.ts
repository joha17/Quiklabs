/**
 * Libreta de la práctica B07 (§12): tablas A–G y diez preguntas. Las filas IMPORTAN una lectura propia (`readingId`,
 * `measureId`, `trialId`, `observationId`); lo que el estudiante clasifica e interpreta se contrasta con esa evidencia.
 */
export const QUESTIONS_B07 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
export type QuestionB07 = (typeof QUESTIONS_B07)[number];

export type GramReading = '' | 'gram-positive' | 'gram-negative' | 'mixed' | 'indeterminate';

export interface MediaRow {
  mediaId: string;
  consistency: '' | 'solid' | 'liquid';
  formulation: '' | 'complex' | 'defined';
  func: '' | 'general' | 'selective' | 'differential' | 'selectiveDifferential';
  /** Qué significa cada adjetivo en EMB (MIC-03 si se intercambian). */
  selectiveMeans: '' | 'inhibits' | 'distinguishes';
  differentialMeans: '' | 'inhibits' | 'distinguishes';
  compositionSource: '' | 'card' | 'inferred' | 'invented';
  appearance: string;
  justification: string;
  sterileClaim: boolean;
  /** «En este medio se describirán colonias» (MIC-08 para el caldo). */
  coloniesExpected: boolean;
}

export interface ColonyRow {
  readingId: string | null;
  plateId: string;
  colonyId: string;
  form: string;
  margin: string;
  elevation: string;
  surface: string;
  pigment: string;
  measureId: string | null;
  diameter: string;
  uncertainty: string;
  unit: '' | 'mm' | 'px';
  borderDeclared: boolean;
  count: string;
  countUnit: '' | 'visibleColonies' | 'bacteria';
  identity: '' | 'preliminary' | 'species';
}

export interface TechniqueRow {
  trialId: string | null;
  technique: string;
  overlap: string;
  separation: string;
  limits: string;
  /** Se comparan placas de medios distintos como réplicas (MIC-12). */
  replicates: boolean;
}

export interface GramRow {
  observationId: string | null;
  sampleCode: string;
  controlPosObs: string | null;
  controlNegObs: string | null;
  quality: string;
  color: '' | 'violet' | 'pink' | 'mixed' | 'none';
  shape: '' | 'cocci' | 'rods' | 'both' | 'notResolved';
  interpretation: GramReading;
  species: string;
  limits: string;
  membraneVisible: boolean;
  negativeStainSame: boolean;
}

export interface OpticsRow {
  observationId: string | null;
  objective: string;
  ocular: string;
  totalMag: string;
  oil: boolean;
  focus: string;
  zone: string;
}

export interface B07Notebook {
  attemptId: string;
  prereport: { hypothesis: string; expected: string; precautions: string };
  media: MediaRow[];
  colonies: ColonyRow[];
  techniques: TechniqueRow[];
  gram: GramRow[];
  optics: OpticsRow[];
  integrative: { hypothesis: string; medium: string; colony: string; gram: string; contradictions: string; confidence: string; claim: '' | 'preliminary' | 'species' | 'insufficient'; conclusion: string; nextTest: string };
  open: { notes: string; limitations: string; errors: string };
  analysis: Record<QuestionB07, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const mediaRow = (mediaId: string): MediaRow => ({ mediaId, consistency: '', formulation: '', func: '', selectiveMeans: '', differentialMeans: '', compositionSource: '', appearance: '', justification: '', sterileClaim: false, coloniesExpected: false });
export const colonyRow = (): ColonyRow => ({ readingId: null, plateId: '', colonyId: '', form: '', margin: '', elevation: '', surface: '', pigment: '', measureId: null, diameter: '', uncertainty: '', unit: '', borderDeclared: false, count: '', countUnit: '', identity: '' });
export const techniqueRow = (): TechniqueRow => ({ trialId: null, technique: '', overlap: '', separation: '', limits: '', replicates: false });
export const gramRow = (): GramRow => ({ observationId: null, sampleCode: '', controlPosObs: null, controlNegObs: null, quality: '', color: '', shape: '', interpretation: '', species: '', limits: '', membraneVisible: false, negativeStainSame: false });
export const opticsRow = (): OpticsRow => ({ observationId: null, objective: '', ocular: '', totalMag: '', oil: false, focus: '', zone: '' });

export function emptyB07Notebook(attemptId = ''): B07Notebook {
  return {
    attemptId,
    prereport: { hypothesis: '', expected: '', precautions: '' },
    media: ['mNA', 'mEMB', 'mNB'].map(mediaRow),
    colonies: [colonyRow(), colonyRow(), colonyRow()],
    techniques: [techniqueRow(), techniqueRow()],
    gram: [gramRow(), gramRow()],
    optics: [opticsRow(), opticsRow()],
    integrative: { hypothesis: '', medium: '', colony: '', gram: '', contradictions: '', confidence: '', claim: '', conclusion: '', nextTest: '' },
    open: { notes: '', limitations: '', errors: '' },
    analysis: Object.fromEntries(QUESTIONS_B07.map((q) => [q, ''])) as B07Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B07Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
