/**
 * Libreta de la práctica B09 (§12): preinforme y nueve cuadros (órganos, cortes, tinción, atlas de raíz, tallo y hoja, medidas,
 * matriz final y el cierre importado del mundo) más ocho tareas de reflexión. Las filas IMPORTAN una captura propia
 * (`observationId`) o una medición (`measurementId`); los cálculos los escribe el estudiante y se contrastan con SUS lecturas.
 */
import type { CutPlane, PlantSpecimenId } from '../../simulation/plant-world/types';

export type Evidence3 = '' | 'visible' | 'absent' | 'notResolved';
export type Group = '' | 'eudicot' | 'monocot';

export interface ExternalRow {
  specimen: PlantSpecimenId | '';
  taxon: string;
  rootPattern: '' | 'taproot' | 'fibrous';
  venation: '' | 'reticulate' | 'parallel';
  petiole: '' | 'present' | 'absent';
  stereoObservationId: string | null;
}

export interface SectionRow {
  observationId: string | null;
  organ: '' | 'celery' | 'pear' | 'leaf';
  plane: CutPlane | '';
  thicknessUm: string;
  treatment: '' | 'water' | 'wiesner';
  cover: string;
  result: string;
}

export interface StainTable {
  observationId: string | null;
  controlObservationId: string | null;
  redMeans: '' | 'lignifiedWall' | 'xylemOnly' | 'ligninPercent';
  collenchymaLignified: '' | 'yes' | 'no' | 'notDiagnosed';
  treatmentOfCapture: '' | 'water' | 'wiesner';
  limits: string;
}

export interface RootRow {
  observationId: string | null;
  group: Group;
  plane: CutPlane | '';
  xylemPattern: '' | 'star' | 'ring' | 'notResolved';
  pith: Evidence3;
  endodermis: Evidence3;
  cambium: Evidence3;
  casparian: Evidence3;
  /** Rasgo que sostiene la conclusión (TV-44 si solo se cita la etiqueta). */
  basis: '' | 'observedFeature' | 'labelOnly';
}

export interface StemRow {
  observationId: string | null;
  group: Group;
  bundles: '' | 'ring' | 'scattered';
  pith: Evidence3;
  cambium: Evidence3;
  collenchyma: Evidence3;
  xylemSide: '' | 'inner' | 'outer';
  basis: '' | 'observedFeature' | 'labelOnly';
}

export interface LeafRow {
  observationId: string | null;
  group: Group;
  mesophyll: '' | 'dorsiventral' | 'undifferentiated';
  stoma: Evidence3;
  orientationChecked: boolean;
  xylemFace: '' | 'adaxial' | 'abaxial';
}

export interface MeasureRow {
  observationId: string | null;
  measurementId: string | null;
  structure: string;
  pixels: string;
  umPerPx: string;
  lengthUm: string;
  uncertaintyUm: string;
  unit: '' | 'um' | 'px';
  totalMag: string;
  /** Valor tomado del campo visual en vez del segmento (TV-54). */
  usedFieldAsCell: boolean;
}

export interface MatrixRow {
  organ: '' | 'root' | 'stem' | 'leaf';
  system: '' | 'dermal' | 'ground' | 'vascular' | 'meristem';
  evidenceObservationId: string | null;
  observation: string;
  inference: string;
}

export interface WoodTable {
  observationId: string | null;
  ringCount: string;
  ageYears: string;
  limit: string;
}

export const QUESTIONS_B09 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;
export type QuestionB09 = (typeof QUESTIONS_B09)[number];

export interface B09Notebook {
  attemptId: string;
  prereport: { hypothesis: string; instruments: string; precautions: string };
  external: ExternalRow[];
  sections: SectionRow[];
  stain: StainTable;
  roots: RootRow[];
  stems: StemRow[];
  leaves: LeafRow[];
  wood: WoodTable;
  measures: MeasureRow[];
  matrix: MatrixRow[];
  claims: { allMonocotsNoPetiole: boolean; allParenchymaStarch: boolean };
  closure: { notes: string };
  analysis: Record<QuestionB09, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const externalRow = (): ExternalRow => ({ specimen: '', taxon: '', rootPattern: '', venation: '', petiole: '', stereoObservationId: null });
export const sectionRow = (): SectionRow => ({ observationId: null, organ: '', plane: '', thicknessUm: '', treatment: '', cover: '', result: '' });
export const rootRow = (): RootRow => ({ observationId: null, group: '', plane: '', xylemPattern: '', pith: '', endodermis: '', cambium: '', casparian: '', basis: '' });
export const stemRow = (): StemRow => ({ observationId: null, group: '', bundles: '', pith: '', cambium: '', collenchyma: '', xylemSide: '', basis: '' });
export const leafRow = (): LeafRow => ({ observationId: null, group: '', mesophyll: '', stoma: '', orientationChecked: false, xylemFace: '' });
export const measureRow = (): MeasureRow => ({ observationId: null, measurementId: null, structure: '', pixels: '', umPerPx: '', lengthUm: '', uncertaintyUm: '', unit: '', totalMag: '', usedFieldAsCell: false });
export const matrixRow = (): MatrixRow => ({ organ: '', system: '', evidenceObservationId: null, observation: '', inference: '' });

export function emptyB09Notebook(attemptId = ''): B09Notebook {
  return {
    attemptId,
    prereport: { hypothesis: '', instruments: '', precautions: '' },
    external: [externalRow(), externalRow()],
    sections: [sectionRow(), sectionRow(), sectionRow()],
    stain: { observationId: null, controlObservationId: null, redMeans: '', collenchymaLignified: '', treatmentOfCapture: '', limits: '' },
    roots: [rootRow(), rootRow(), rootRow()],
    stems: [stemRow(), stemRow()],
    leaves: [leafRow(), leafRow()],
    wood: { observationId: null, ringCount: '', ageYears: '', limit: '' },
    measures: [measureRow(), measureRow()],
    matrix: [matrixRow(), matrixRow(), matrixRow(), matrixRow()],
    claims: { allMonocotsNoPetiole: false, allParenchymaStarch: false },
    closure: { notes: '' },
    analysis: Object.fromEntries(QUESTIONS_B09.map((q) => [q, ''])) as B09Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B09Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
