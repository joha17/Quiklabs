/**
 * Libreta de la práctica B06 (§12): preinforme, diez cuadros (preparación, organismos, protistas, epidermis,
 * permanentes, sangre, morfometría, comparación, observaciones abiertas y el cierre importado del mundo) y ocho
 * actividades de razonamiento. Las filas IMPORTAN una captura propia (`observationId`) o una medición (`measurementId`);
 * lo que el estudiante clasifica e interpreta se contrasta con la evidencia de esa captura y del manifiesto.
 */
import type { DivSpecimen } from '../../simulation/div-world/types';

export type Material = '' | 'fresh' | 'fixed';
export type Evidence3 = '' | 'visible' | 'inferred' | 'notVisible';

export interface PrepRowB06 {
  observationId: string | null;
  specimen: DivSpecimen | '';
  material: Material;
  stain: string;
  volumeMl: string;
  timeS: string;
  quality: string;
}

export interface OrganismRow {
  observationId: string | null;
  specimen: DivSpecimen | '';
  cellType: '' | 'prokaryote' | 'eukaryote';
  group: '' | 'bacteria' | 'protist' | 'plant' | 'animal';
  motility: '' | 'moving' | 'immobile' | 'notEvaluable';
  cells: '' | 'uni' | 'multi';
  wall: Evidence3;
  nucleus: Evidence3;
}

export interface ProtistRow {
  observationId: string | null;
  features: string;
  motilityEvidence: '' | 'model' | 'video' | 'none';
  treatment: '' | 'plain' | 'methylcellulose' | 'lugol' | 'nigrosin';
  /** Velocidad (µm/s): solo con video con escala temporal (CEL-046/062 si se escribe sin él). */
  speedUmS: string;
  reserve: '' | 'paramylon' | 'glycogen' | 'starch' | 'unknown';
  reserveMethod: '' | 'lugol' | 'literature' | 'none';
  /** «La fotosíntesis quedó demostrada» (CEL-070 si se marca a partir del color). */
  photosynthesisProven: boolean;
}

export interface FixedRowB06 {
  observationId: string | null;
  label: string;
  technique: string;
  objective: string;
  oil: boolean;
  region: string;
  returned: boolean;
}

export interface MorphoRow {
  observationId: string | null;
  measurementId: string | null;
  pixels: string;
  umPerPx: string;
  lengthUm: string;
  uncertaintyUm: string;
  unit: '' | 'um' | 'mm';
  /** Misma longitud en mm (CEL-064 si la conversión no es ×1000). */
  lengthMm: string;
}

export interface ComparisonRow {
  specimen: DivSpecimen | '';
  domain: '' | 'prokaryote' | 'eukaryote';
  organization: '' | 'uni' | 'multi';
  evidence: '' | 'observed' | 'inferred' | 'notDistinguishable';
}

export const QUESTIONS_B06 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;
export type QuestionB06 = (typeof QUESTIONS_B06)[number];

export interface B06Notebook {
  attemptId: string;
  prereport: { hypothesis: string; expected: string; precautions: string };
  prep: PrepRowB06[];
  organisms: OrganismRow[];
  protists: { euglena: ProtistRow; paramecium: ProtistRow; comparison: string };
  epidermis: { observationId: string | null; specimen: '' | 'tradescantia' | 'elodea'; totalMag: string; stoma: Evidence3; chloroplasts: Evidence3; limits: string };
  fixed: FixedRowB06[];
  /** Pregunta explícita de la ruta D: ¿hay nucléolo en la bacteria? (REF-08). */
  bacteria: { observationId: string | null; shape: string; nucleolus: '' | 'present' | 'absent' };
  blood: { observationId: string | null; cells: Array<'erythrocyte' | 'leukocyte' | 'platelet'>; nuclear: string; contrast: string; subtype: string };
  morpho: MorphoRow[];
  comparison: ComparisonRow[];
  open: { notes: string; limitations: string; errors: string };
  analysis: Record<QuestionB06, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const prepRowB06 = (): PrepRowB06 => ({ observationId: null, specimen: '', material: '', stain: '', volumeMl: '', timeS: '', quality: '' });
export const organismRow = (): OrganismRow => ({ observationId: null, specimen: '', cellType: '', group: '', motility: '', cells: '', wall: '', nucleus: '' });
export const protistRow = (): ProtistRow => ({ observationId: null, features: '', motilityEvidence: '', treatment: '', speedUmS: '', reserve: '', reserveMethod: '', photosynthesisProven: false });
export const fixedRowB06 = (): FixedRowB06 => ({ observationId: null, label: '', technique: '', objective: '', oil: false, region: '', returned: false });
export const morphoRow = (): MorphoRow => ({ observationId: null, measurementId: null, pixels: '', umPerPx: '', lengthUm: '', uncertaintyUm: '', unit: '', lengthMm: '' });
export const comparisonRow = (): ComparisonRow => ({ specimen: '', domain: '', organization: '', evidence: '' });

export function emptyB06Notebook(attemptId = ''): B06Notebook {
  return {
    attemptId,
    prereport: { hypothesis: '', expected: '', precautions: '' },
    prep: [prepRowB06(), prepRowB06(), prepRowB06(), prepRowB06()],
    organisms: [organismRow(), organismRow(), organismRow(), organismRow(), organismRow()],
    protists: { euglena: protistRow(), paramecium: protistRow(), comparison: '' },
    epidermis: { observationId: null, specimen: '', totalMag: '', stoma: '', chloroplasts: '', limits: '' },
    fixed: [fixedRowB06(), fixedRowB06()],
    bacteria: { observationId: null, shape: '', nucleolus: '' },
    blood: { observationId: null, cells: [], nuclear: '', contrast: '', subtype: '' },
    morpho: [morphoRow(), morphoRow()],
    comparison: [comparisonRow(), comparisonRow(), comparisonRow(), comparisonRow()],
    open: { notes: '', limitations: '', errors: '' },
    analysis: Object.fromEntries(QUESTIONS_B06.map((q) => [q, ''])) as B06Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B06Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
