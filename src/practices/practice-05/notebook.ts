/**
 * §20 — libreta digital de la Práctica 5: Cuadro 5.1 (masas con incertidumbre y temperatura), Cuadro 5.2 (cálculos),
 * cadenas de análisis dimensional (§21.3), ecuación (§21.1) y preguntas de análisis. Los datos de masa se importan solo
 * desde lecturas válidas de la balanza; los cálculos los escribe el estudiante.
 */
import type { Factor } from '../../simulation/stoichiometry/stoich';
import { emptyP5Equation, type P5Equation } from './equation';

export const TABLE1_ROWS = ['tubeEmpty', 'tubeMnO2', 'mno2Diff', 'tubeMnO2KClO3', 'kclo3Diff', 'heat1', 'heat2', 'heat3', 'constant', 'kclExp', 'nKClExp'] as const;
export type Table1Row = (typeof TABLE1_ROWS)[number];
/** Filas que se llenan con una lectura de la balanza (las demás se calculan). */
export const MEASURED_ROWS: Table1Row[] = ['tubeEmpty', 'tubeMnO2', 'tubeMnO2KClO3', 'heat1', 'heat2', 'heat3', 'constant'];

export interface Table1Entry {
  value: string;
  uncertainty: string;
  observations: string;
  /** Lectura de la balanza importada (id), si la hay. */
  measurementId: string | null;
}

export const TABLE2_ROWS = ['nKClO3', 'nKClTheo', 'mKClTheo', 'nO2Theo', 'mO2Theo', 'mKClExp', 'yieldPct'] as const;
export type Table2Row = (typeof TABLE2_ROWS)[number];

export const ANALYSIS_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

export interface P5Notebook {
  table1: Record<Table1Row, Table1Entry>;
  table2: Record<Table2Row, string>;
  chains: { kcl: Factor[]; o2: Factor[] };
  equation: P5Equation;
  analysis: Record<(typeof ANALYSIS_KEYS)[number], string>;
  /** Historial de correcciones (§20.3). */
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

const entry = (): Table1Entry => ({ value: '', uncertainty: '', observations: '', measurementId: null });

export function emptyP5Notebook(): P5Notebook {
  return {
    table1: Object.fromEntries(TABLE1_ROWS.map((r) => [r, entry()])) as Record<Table1Row, Table1Entry>,
    table2: Object.fromEntries(TABLE2_ROWS.map((r) => [r, ''])) as Record<Table2Row, string>,
    chains: { kcl: [], o2: [] },
    equation: emptyP5Equation(),
    analysis: { q1: '', q2: '', q3: '', q4: '', q5: '' },
    history: [],
  };
}

/** Lee un número escrito con coma o punto («1,52», «1.52 g»). */
export function parseNum(s: string): number {
  const m = /-?\d+(?:[.,]\d+)?(?:e-?\d+)?/i.exec(s.replace(/\s/g, ''));
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

export const filledAnalysis = (nb: P5Notebook) => ANALYSIS_KEYS.filter((k) => nb.analysis[k].trim().length > 25).length;
