/**
 * Libreta de la Práctica 8 (§12): encabezado del intento, Cuadro A (predicción), Cuadro B (operaciones y lecturas),
 * Cuadro C (calidad y rendimiento) y diez actividades. Las celdas instrumentales guardan el `readingId` de una lectura
 * importada (solo existe tras observar el instrumento, §12.3); los cálculos son del estudiante y se corrigen contra SUS
 * lecturas. Los números se escriben con coma o punto decimal.
 */
import type { RouteId, SpeciesId } from '../../simulation/organic-world/types';

export interface Entry {
  value: string;
  uncertainty: string;
  readingId: string | null;
  /** Intento del que proviene la lectura importada (ORG60). */
  attemptId?: string;
}

/** Cuadro A — una fila por reactivo de la ruta (y su catalizador). */
export interface ReagentRow {
  species: SpeciesId | '';
  amount: string;
  unit: '' | 'g' | 'mL';
  /** Fracción másica usada en el cálculo (0–1 o %). */
  purity: string;
  moles: string;
  coefficient: string;
}

export interface TableA {
  equation: string;
  reactionType: '' | 'fischer' | 'acetylation';
  /** Grupo funcional que reacciona en el precursor. */
  functionalGroup: '' | 'carboxyl' | 'phenolHydroxyl' | 'alcoholHydroxyl';
  reagents: ReagentRow[];
  limiting: SpeciesId | '';
  theoreticalG: string;
  prediction: string;
  savedAtS: number | null;
}

/** Cuadro B — pesadas, dosificación y control de la reacción con sus lecturas. */
export const ROWS_B = ['massEmpty', 'massReagent1', 'massReagent2', 'vol1', 'vol2', 'temp1', 'temp2'] as const;
export type RowBKey = (typeof ROWS_B)[number];

export interface TableB {
  rows: Record<RowBKey, Entry>;
  heatingS: string;
  phases: string;
  waste: string;
}

/** Cuadro C — calidad, rendimiento y diagnóstico. */
export interface TableC {
  grossMass: Entry;
  supportMass: Entry;
  isolatedMass: Entry;
  technique: '' | 'mp' | 'purity' | 'density';
  analysis: Entry;
  density: Entry;
  densityTempC: string;
  purity: Entry;
  theoreticalG: string;
  apparentYield: string;
  correctedYield: string;
  balance: string;
  losses: [string, string, string];
}

export const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
export type Question = (typeof QUESTIONS)[number];

export interface P08Notebook {
  attemptId: string;
  route: RouteId;
  tableA: TableA;
  tableB: TableB;
  tableC: TableC;
  analysis: Record<Question, string>;
  conclusion: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const reagentRow = (species: SpeciesId | '' = ''): ReagentRow => ({ species, amount: '', unit: '', purity: '', moles: '', coefficient: '' });

export const REAGENT_ROWS: Record<RouteId, SpeciesId[]> = { ISO: ['IAA', 'AcOH', 'H2SO4'], ASA: ['SA', 'AA', 'H3PO4'], MS: ['SA', 'MeOH', 'H2SO4'] };

export function emptyP08Notebook(route: RouteId = 'ISO', attemptId = ''): P08Notebook {
  return {
    attemptId,
    route,
    tableA: { equation: '', reactionType: '', functionalGroup: '', reagents: REAGENT_ROWS[route].map((s) => reagentRow(s)), limiting: '', theoreticalG: '', prediction: '', savedAtS: null },
    tableB: { rows: Object.fromEntries(ROWS_B.map((k) => [k, entry()])) as TableB['rows'], heatingS: '', phases: '', waste: '' },
    tableC: {
      grossMass: entry(), supportMass: entry(), isolatedMass: entry(), technique: '', analysis: entry(), density: entry(), densityTempC: '', purity: entry(),
      theoreticalG: '', apparentYield: '', correctedYield: '', balance: '', losses: ['', '', ''],
    },
    analysis: Object.fromEntries(QUESTIONS.map((q) => [q, ''])) as P08Notebook['analysis'],
    conclusion: '',
    history: [],
  };
}

export function parseNum(s: string): number {
  const t = (s ?? '').trim().replace(/\s/g, '').replace('%', '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}

/** Pureza escrita como fracción (0–1) o porcentaje (0–100). */
export function parseFraction(s: string): number {
  const v = parseNum(s);
  if (!Number.isFinite(v)) return NaN;
  return v > 1.0000001 ? v / 100 : v;
}

export const isNum = (s: string) => Number.isFinite(parseNum(s));
export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: P08Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
