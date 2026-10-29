/**
 * Libreta de la práctica B04 (§11): cuadros A–H y ocho preguntas. Las celdas medibles IMPORTAN una lectura del propio
 * intento (`readingId`: m*, v*, t*, p*, c*, gas*, abs*) u observación del microscopio; las interpretaciones las
 * escribe el estudiante y se contrastan con SUS lecturas (color, fase, gas, absorbancia), nunca con un color ideal.
 */
import type { StructureId } from '../../simulation/specimens/assets';

export type AssayResult = '' | 'positive' | 'negative' | 'ambiguous';
export type Molecule = '' | 'starch' | 'protein' | 'lipid' | 'reducingSugar' | 'reducingAgent' | 'none';

export interface InventoryRow {
  lot: string;
  initialReadingId: string | null;
  role: '' | 'sample' | 'negative' | 'positive' | 'unknown';
}

export interface AssayRow {
  /** Rótulo del tubo (`LUG/L-PAP`); la lectura importada debe ser de ese tubo. */
  label: string;
  readingId: string | null;
  result: AssayResult;
  molecule: Molecule;
}

export interface FeulgenRow {
  observationId: string | null;
  structures: StructureId[];
  /** El estudiante afirma ver ADN teñido en esa captura (F09 si la región no lo sostiene). */
  dnaClaim: boolean;
  comment: string;
}

export interface CatalaseRow {
  readingId: string | null;
  condition: string;
  /** Actividad normalizada que calcula el estudiante (mL O₂·min⁻¹·g⁻¹ o equivalente). */
  normalized: string;
}

export const QUESTIONS_B04 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;
export type QuestionB04 = (typeof QUESTIONS_B04)[number];

export interface B04Notebook {
  attemptId: string;
  inventory: { rows: InventoryRow[]; massReadingId: string | null; uncertainty: string };
  assays: { rows: AssayRow[] };
  feulgen: { rows: FeulgenRow[] };
  catalase: {
    rows: CatalaseRow[];
    liverMassReadingId: string | null;
    /** Cómo compara el estudiante dos preparaciones (C08 si afirma «más activa» sin normalizar). */
    normalizedBy: '' | 'mass' | 'activity' | 'none';
    claim: '' | 'sourceDiffers' | 'heatInactivates' | 'noDifference';
    conclusion: string;
  };
  amylase: {
    lugolReadingId: string | null;
    benedictReadingId: string | null;
    controlReadingId: string | null;
    phReadingId: string | null;
    claim: '' | 'noHydrolysis' | 'partial' | 'complete';
    basis: '' | 'benedict' | 'lugol' | 'both';
    conclusion: string;
  };
  adh: {
    readingIds: string[];
    methanolClaim: '' | 'total' | 'competitive' | 'none';
    fehlingClaim: '' | 'acetaldehydeOnly' | 'nonspecific';
    iodoformClaim: '' | 'ethanolOnly' | 'nonspecific';
    conclusion: string;
  };
  comparison: { energy: string; structure: string; information: string };
  errors: Array<{ observed: string; cause: string; action: string }>;
  analysis: Record<QuestionB04, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const assayRow = (label = ''): AssayRow => ({ label, readingId: null, result: '', molecule: '' });
export const feulgenRow = (): FeulgenRow => ({ observationId: null, structures: [], dnaClaim: false, comment: '' });
export const catalaseRow = (): CatalaseRow => ({ readingId: null, condition: '', normalized: '' });

export function emptyB04Notebook(attemptId = ''): B04Notebook {
  return {
    attemptId,
    inventory: { rows: ['L-AGU', 'L-PRO', 'L-GLU', 'L-ACE', 'P1'].map((lot) => ({ lot, initialReadingId: null, role: '' as const })), massReadingId: null, uncertainty: '' },
    assays: { rows: Array.from({ length: 8 }, () => assayRow()) },
    feulgen: { rows: [feulgenRow(), feulgenRow()] },
    catalase: { rows: [catalaseRow(), catalaseRow(), catalaseRow(), catalaseRow()], liverMassReadingId: null, normalizedBy: '', claim: '', conclusion: '' },
    amylase: { lugolReadingId: null, benedictReadingId: null, controlReadingId: null, phReadingId: null, claim: '', basis: '', conclusion: '' },
    adh: { readingIds: [], methanolClaim: '', fehlingClaim: '', iodoformClaim: '', conclusion: '' },
    comparison: { energy: '', structure: '', information: '' },
    errors: [{ observed: '', cause: '', action: '' }],
    analysis: Object.fromEntries(QUESTIONS_B04.map((q) => [q, ''])) as B04Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B04Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
