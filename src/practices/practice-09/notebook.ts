/**
 * Libreta de la Práctica 9 (§11): Cuadros A–H. Las celdas instrumentales guardan el `readingId` de una lectura propia
 * (solo existe si se observó el instrumento) y su `attemptId`; las predicciones, ecuaciones, estados de identificación,
 * el diagrama de separación y las explicaciones son del estudiante. Nada revela la composición de la incógnita.
 */
import type { ColorCategory } from '../../simulation/cation-analysis-world/types';

export interface Entry {
  value: string;
  uncertainty: string;
  readingId: string | null;
  attemptId?: string;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });

export const CATIONS = ['Sr2+', 'Fe3+', 'K+'] as const;
export type Cation = (typeof CATIONS)[number];

/** A — Control del ensayo y predicciones (antes de medir). */
export interface RowA {
  predictedSolid: '' | 'sulfate' | 'hydroxide' | 'none';
  predictedColor: '' | ColorCategory;
  reason: string;
}

/** B — Atlas de emisión. */
export const ATLAS_KEYS = ['ctlSr', 'ctlK', 'ctlNa', 'ctlLi', 'ctlCa', 'ctlBlank', 'ctlNaK'] as const;
export type AtlasKey = (typeof ATLAS_KEYS)[number];
export interface RowB {
  readingId: string | null;
  color: '' | ColorCategory;
  intensity: '' | 'weak' | 'medium' | 'strong';
  lightPct: string;
  contamination: string;
}

/** C — Comparación de soportes. */
export interface TableC {
  loopId: string | null;
  glassId: string | null;
  cupId: string | null;
  differences: string;
  glassRating: '' | 'virtualOnly' | 'heatResistant' | 'unsure';
}

/** D — Pruebas de precipitación (una fila por reactivo). */
export interface RowD {
  tube: string;
  reagent: '' | 'sulfate' | 'hydroxide' | 'water';
  drops: string;
  dropVolumeMl: string;
  volumeAdded: Entry;
  turbidityId: string | null;
  observationId: string | null;
  solid: '' | 'white' | 'brown' | 'none';
  /** Coeficientes de la ecuación iónica neta escritos por el estudiante. */
  nuCation: string;
  nuAnion: string;
}

/** E — Separación (centrifugación y decantación). */
export interface RowE {
  tube: string;
  counterTube: string;
  massTube: Entry;
  massCounter: Entry;
  spinS: string;
  decantedMl: Entry;
  losses: string;
}

/** F — Identificación de la incógnita. */
export interface RowF {
  status: '' | 'detected' | 'notDetected' | 'indeterminate';
  evidenceIds: string[];
  limitation: string;
}

/** G — Diagrama de separación propio (aristas desde ids reales de tubos). */
export interface EdgeG {
  from: string;
  action: '' | 'aliquot' | 'sulfate' | 'hydroxide' | 'centrifuge' | 'decant' | 'flame';
  to: string;
}

export const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;
export type Question = (typeof QUESTIONS)[number];

export interface P09Notebook {
  attemptId: string;
  tableA: Record<Cation, RowA> & { savedAtS: number | null };
  tableB: Record<AtlasKey, RowB>;
  tableC: TableC;
  tableD: { sr: RowD; fe: RowD };
  tableE: { rows: [RowE, RowE]; reserveTube: string };
  tableF: Record<Cation, RowF> & { kCharge: string };
  tableG: EdgeG[];
  analysis: Record<Question, string>;
  explanation: string;
  errorReflection: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

const rowA = (): RowA => ({ predictedSolid: '', predictedColor: '', reason: '' });
const rowB = (): RowB => ({ readingId: null, color: '', intensity: '', lightPct: '', contamination: '' });
const rowD = (): RowD => ({ tube: '', reagent: '', drops: '', dropVolumeMl: '', volumeAdded: entry(), turbidityId: null, observationId: null, solid: '', nuCation: '', nuAnion: '' });
const rowE = (): RowE => ({ tube: '', counterTube: '', massTube: entry(), massCounter: entry(), spinS: '', decantedMl: entry(), losses: '' });
const rowF = (): RowF => ({ status: '', evidenceIds: [], limitation: '' });

export function emptyP09Notebook(attemptId = ''): P09Notebook {
  return {
    attemptId,
    tableA: { 'Sr2+': rowA(), 'Fe3+': rowA(), 'K+': rowA(), savedAtS: null },
    tableB: Object.fromEntries(ATLAS_KEYS.map((k) => [k, rowB()])) as P09Notebook['tableB'],
    tableC: { loopId: null, glassId: null, cupId: null, differences: '', glassRating: '' },
    tableD: { sr: rowD(), fe: rowD() },
    tableE: { rows: [rowE(), rowE()], reserveTube: '' },
    tableF: { 'Sr2+': rowF(), 'Fe3+': rowF(), 'K+': rowF(), kCharge: '' },
    tableG: [],
    analysis: Object.fromEntries(QUESTIONS.map((q) => [q, ''])) as P09Notebook['analysis'],
    explanation: '',
    errorReflection: '',
    history: [],
  };
}

export function parseNum(s: string): number {
  const t = (s ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}

export const isNum = (s: string) => Number.isFinite(parseNum(s));
export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: P09Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
