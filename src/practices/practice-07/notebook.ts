/**
 * Libreta de la Práctica 7 (§12): cuadros originales A–F y actividades. Las celdas instrumentales guardan el
 * `readingId` de una lectura importada (su valor no se edita a mano; el estudiante puede no usarla y repetir la
 * medición). Las predicciones y explicaciones son texto libre. Los números se escriben con coma o punto decimal.
 */

export interface Entry {
  value: string;
  uncertainty: string;
  readingId: string | null;
}

export type Tri = '' | 'yes' | 'no' | 'unsure';

/** Cuadro A — hipótesis registradas ANTES del ensayo (§12.1). */
export interface RowA {
  sample: string;
  appearance: string;
  conducts: Tri;
  conductsWhy: string;
  water: '' | 'homogeneous' | 'twoPhases' | 'unsure';
  evidence: string;
  /** Tiempo de simulación en que se guardó (null = todavía no). */
  savedAtS: number | null;
}

/** Cuadro B — contraste de disolventes (§12.2). */
export interface RowB {
  tubeId: string;
  sample: string;
  amount: Entry;
  solvent: '' | 'water' | 'heptane';
  volume: Entry;
  observationId: string | null;
  observationText: string;
  interpretation: '' | 'soluble' | 'partial' | 'insoluble' | 'miscible' | 'immiscible';
  note: string;
}

/** Cuadro C — conducción en material puro (§12.3). */
export interface RowC {
  specimen: string;
  surface: '' | 'dry' | 'wet';
  readingId: string | null;
  conducts: Tri;
  explanation: string;
}

/** Cuadro D — composición y propiedades eléctricas de soluciones (§12.4). */
export interface RowD {
  sample: string;
  mass: Entry;
  volume: Entry;
  /** Concentración escrita por el estudiante (mol/L). */
  conc: Entry;
  kappa: Entry;
  kappaUnit: '' | 'µS/cm' | 'mS/cm' | 'S/m';
  temp: string;
}

export type TestType = '' | 'solidContact' | 'mixWater' | 'mixApolar' | 'solutionKappa' | 'pureKappa' | 'appearance';
export type Classification = '' | 'ionic' | 'molecular' | 'metallic' | 'covalentNetwork' | 'undetermined';

/** Cuadro E — ruta de descubrimiento de incógnitas (§12.5). */
export interface RowE {
  test1: TestType;
  reason1: string;
  result1: string | null;
  test2: TestType;
  reason2: string;
  result2: string | null;
  classification: Classification;
  limitation: string;
}

/** Cuadro F — matriz de interpretación de propiedades (§12.6). */
export interface RowF {
  explanation: string;
  exception: Tri;
  confidence: '' | 'high' | 'medium' | 'low';
  why: string;
}

export const ROWS_A = 4;
export const ROWS_B = ['M1A', 'M1B', 'M2A', 'M2B', 'M3A', 'M3B'] as const;
export type RowBKey = (typeof ROWS_B)[number];
export const ROWS_C = ['control', 'metal', 'graphite', 'ionic'] as const;
export type RowCKey = (typeof ROWS_C)[number];
export const ROWS_D = ['blank', 'strongA', 'strongB', 'nonElectrolyte', 'weak'] as const;
export type RowDKey = (typeof ROWS_D)[number];
export const ROWS_E = ['X', 'Y'] as const;
export const ROWS_F = ['graphite', 'salt', 'sucrose', 'acetic', 'oil'] as const;
export type RowFKey = (typeof ROWS_F)[number];
export const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
export type Question = (typeof QUESTIONS)[number];

export interface P07Notebook {
  tableA: RowA[];
  tableB: Record<RowBKey, RowB>;
  tableC: Record<RowCKey, RowC>;
  tableD: Record<RowDKey, RowD>;
  tableE: Record<'X' | 'Y', RowE>;
  tableF: Record<RowFKey, RowF>;
  analysis: Record<Question, string>;
  conclusion: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const rowA = (): RowA => ({ sample: '', appearance: '', conducts: '', conductsWhy: '', water: '', evidence: '', savedAtS: null });
const rowB = (): RowB => ({ tubeId: '', sample: '', amount: entry(), solvent: '', volume: entry(), observationId: null, observationText: '', interpretation: '', note: '' });
const rowC = (): RowC => ({ specimen: '', surface: '', readingId: null, conducts: '', explanation: '' });
const rowD = (): RowD => ({ sample: '', mass: entry(), volume: entry(), conc: entry(), kappa: entry(), kappaUnit: '', temp: '' });
const rowE = (): RowE => ({ test1: '', reason1: '', result1: null, test2: '', reason2: '', result2: null, classification: '', limitation: '' });
const rowF = (): RowF => ({ explanation: '', exception: '', confidence: '', why: '' });

export function emptyP07Notebook(): P07Notebook {
  return {
    tableA: Array.from({ length: ROWS_A }, rowA),
    tableB: Object.fromEntries(ROWS_B.map((k) => [k, rowB()])) as P07Notebook['tableB'],
    tableC: Object.fromEntries(ROWS_C.map((k) => [k, rowC()])) as P07Notebook['tableC'],
    tableD: Object.fromEntries(ROWS_D.map((k) => [k, rowD()])) as P07Notebook['tableD'],
    tableE: { X: rowE(), Y: rowE() },
    tableF: Object.fromEntries(ROWS_F.map((k) => [k, rowF()])) as P07Notebook['tableF'],
    analysis: Object.fromEntries(QUESTIONS.map((q) => [q, ''])) as P07Notebook['analysis'],
    conclusion: '',
    history: [],
  };
}

export function parseNum(s: string): number {
  const t = (s ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}

export const isNum = (s: string) => Number.isFinite(parseNum(s));
export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: P07Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
/** Decimales escritos (para precisión injustificada, L59). */
export const decimals = (s: string) => {
  const m = /[.,](\d+)/.exec((s ?? '').trim());
  return m ? m[1].length : 0;
};
