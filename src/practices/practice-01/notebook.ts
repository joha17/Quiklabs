/**
 * §12 — libreta digital de la Práctica 1: Tabla A (caracterización instrumental con dos lecturas de prueba), Tabla B
 * (agua a dos temperaturas), Tabla C (clavos por desplazamiento), Tabla D (cilindro por geometría), convención de
 * incertidumbre, desarrollo de cálculos, fuentes de incertidumbre, preguntas de análisis e historial. Las lecturas se
 * importan solo de instrumentos observados (id `m…`, `v…`, `t…`, `h…`); los cálculos los escribe el estudiante.
 */
import type { UncertaintyConvention } from '../../simulation/metrology/uncertainty';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada (`m…` masa, `v…` volumen, `t…` temperatura, `h…` longitud) o null si se escribió. */
  readingId: string | null;
}

export const INSTRUMENTS_A = ['balance', 'pipette', 'cylinder', 'thermometer', 'caliper'] as const;
export type InstrumentA = (typeof INSTRUMENTS_A)[number];

export interface RowA {
  capacity: string;
  division: string;
  uncertainty: string;
  use: string;
}

export const SERIES = ['room', 'cold'] as const;
export type Series = (typeof SERIES)[number];

export interface RowB {
  mass: Entry;
  volume: Entry;
  temp: Entry;
  density: Entry;
  notes: string;
}

export const ROWS_C = ['boatMass', 'boatNailsMass', 'netMass', 'vInitial', 'vFinal', 'dV', 'temp', 'density'] as const;
export type RowC = (typeof ROWS_C)[number];
export const IMPORT_C: RowC[] = ['boatMass', 'boatNailsMass', 'vInitial', 'vFinal', 'temp'];
export const UNIT_C: Record<RowC, string> = { boatMass: 'g', boatNailsMass: 'g', netMass: 'g', vInitial: 'mL', vFinal: 'mL', dV: 'mL', temp: '°C', density: 'g/mL' };

export const ROWS_D = ['glassMass', 'totalMass', 'netMass', 'd1', 'd2', 'h1', 'h2', 'dMean', 'hMean', 'volume', 'density'] as const;
export type RowD = (typeof ROWS_D)[number];
export const IMPORT_D: RowD[] = ['glassMass', 'totalMass', 'd1', 'd2', 'h1', 'h2'];
export const UNIT_D: Record<RowD, string> = { glassMass: 'g', totalMass: 'g', netMass: 'g', d1: 'cm', d2: 'cm', h1: 'cm', h2: 'cm', dMean: 'cm', hMean: 'cm', volume: 'cm³', density: 'g/cm³' };

export const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;
export type Question = (typeof QUESTIONS)[number];

export interface P01Notebook {
  tableA: Record<InstrumentA, RowA>;
  /** Lecturas de prueba de 25 mL (§5.A): con la probeta y con la pipeta. */
  trialProbe: Entry;
  trialPipette: Entry;
  compareText: string;
  convention: UncertaintyConvention | '';
  tableB: Record<Series, RowB>;
  tableC: Record<RowC, Entry>;
  referenceC: string;
  errorC: string;
  tableD: Record<RowD, Entry>;
  referenceD: string;
  errorD: string;
  /** Desarrollo de los cálculos (§5.E-2). */
  procedure: { mass: string; volume: string; density: string };
  /** Mayor fuente de incertidumbre de cada método (§5.E-3). */
  sources: { water: string; displacement: string; geometry: string };
  analysis: Record<Question, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const rowA = (): RowA => ({ capacity: '', division: '', uncertainty: '', use: '' });
const rowB = (): RowB => ({ mass: entry(), volume: entry(), temp: entry(), density: entry(), notes: '' });

export function emptyP01Notebook(): P01Notebook {
  return {
    tableA: Object.fromEntries(INSTRUMENTS_A.map((k) => [k, rowA()])) as P01Notebook['tableA'],
    trialProbe: entry(),
    trialPipette: entry(),
    compareText: '',
    convention: '',
    tableB: { room: rowB(), cold: rowB() },
    tableC: Object.fromEntries(ROWS_C.map((r) => [r, entry()])) as P01Notebook['tableC'],
    referenceC: '',
    errorC: '',
    tableD: Object.fromEntries(ROWS_D.map((r) => [r, entry()])) as P01Notebook['tableD'],
    referenceD: '',
    errorD: '',
    procedure: { mass: '', volume: '', density: '' },
    sources: { water: '', displacement: '', geometry: '' },
    analysis: Object.fromEntries(QUESTIONS.map((q) => [q, ''])) as P01Notebook['analysis'],
    history: [],
  };
}

/** Lee un número escrito con coma o punto (y notación científica). */
export function parseNum(s: string): number {
  const m = /-?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/i.exec((s ?? '').replace(/\s/g, '').replace(/×10\^?/, 'e'));
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

export const isNum = (s: string) => Number.isFinite(parseNum(s));
/** Respuesta abierta con contenido (heurística transparente; la valoración final es del docente). */
export const answered = (s: string) => s.trim().length > 25;
export const answeredCount = (nb: P01Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
