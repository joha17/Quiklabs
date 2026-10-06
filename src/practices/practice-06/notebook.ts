/**
 * §23 — libreta digital de la Práctica 6: Cuadros 6.1 (agua), 6.2 (metal) y 6.3 (alimento), actividades de
 * aprendizaje (§19), análisis e historial de correcciones. Las lecturas se importan solo después de observar el
 * instrumento; los cálculos los escribe el estudiante.
 */
import type { EnergyPerMassUnit } from '../../simulation/calorimetry/heat';
import type { FoodId, MetalId } from '../../simulation/calorimetry/materials';

export type Col = 'fe' | 'x';
export const COLS: Col[] = ['fe', 'x'];

export const T61_ROWS = ['cylEmpty', 'cylWater', 'waterMass', 'tiWater', 'tf', 'qWater'] as const;
export type T61Row = (typeof T61_ROWS)[number];
export const T62_ROWS = ['tubeEmpty', 'tubeMetal', 'metalMass', 'tiMetal', 'tfMetal', 'cExp', 'cCorr', 'errorPct'] as const;
export type T62Row = (typeof T62_ROWS)[number];
/** Filas que se llenan con una lectura (balanza o termómetro). */
export const IMPORT_ROWS: Array<T61Row | T62Row> = ['cylEmpty', 'cylWater', 'tiWater', 'tf', 'tubeEmpty', 'tubeMetal', 'tiMetal', 'tfMetal'];
export const UNIT: Record<T61Row | T62Row, string> = {
  cylEmpty: 'g', cylWater: 'g', waterMass: 'g', tiWater: '°C', tf: '°C', qWater: 'J',
  tubeEmpty: 'g', tubeMetal: 'g', metalMass: 'g', tiMetal: '°C', tfMetal: '°C', cExp: 'J·g⁻¹·°C⁻¹', cCorr: 'J·g⁻¹·°C⁻¹', errorPct: '%',
};

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada (id de la balanza `m…` o del termómetro `t…`). */
  readingId: string | null;
}

export const T63_ROWS = ['sampleMass', 'pressure', 'cSystem', 'dT', 'wireJ', 'otherJ', 'hc'] as const;
export type T63Row = (typeof T63_ROWS)[number];

export interface P6Notebook {
  t61: Record<T61Row, Record<Col, Entry>>;
  t62: Record<T62Row, Record<Col, Entry>>;
  /** Volumen leído en la probeta (mL) por ensayo. */
  volume: Record<Col, string>;
  identification: { metal: MetalId | 'AMBIGUOUS' | ''; reason: string };
  t63: Record<T63Row, string>;
  food: FoodId | '';
  hcUnit: EnergyPerMassUnit;
  convention: 'GROSS_POSITIVE' | 'ENTHALPY_NEGATIVE' | '';
  conventionReason: string;
  /** El módulo opcional no se realiza (con la razón). */
  bombSkipped: boolean;
  activities: { a1: string; a2Ambient: string; a2q: string; a3Ti: string; a3Interp: string };
  analysis: { q1: string; q2: string; q3: string; q4: string };
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const cols = (): Record<Col, Entry> => ({ fe: entry(), x: entry() });

export function emptyP6Notebook(): P6Notebook {
  return {
    t61: Object.fromEntries(T61_ROWS.map((r) => [r, cols()])) as P6Notebook['t61'],
    t62: Object.fromEntries(T62_ROWS.map((r) => [r, cols()])) as P6Notebook['t62'],
    volume: { fe: '', x: '' },
    identification: { metal: '', reason: '' },
    t63: Object.fromEntries(T63_ROWS.map((r) => [r, ''])) as P6Notebook['t63'],
    food: '',
    hcUnit: 'kJ/g',
    convention: '',
    conventionReason: '',
    bombSkipped: false,
    activities: { a1: '', a2Ambient: '', a2q: '', a3Ti: '', a3Interp: '' },
    analysis: { q1: '', q2: '', q3: '', q4: '' },
    history: [],
  };
}

/** Lee un número escrito con coma o punto. */
export function parseNum(s: string): number {
  const m = /-?\d+(?:[.,]\d+)?(?:e-?\d+)?/i.exec(s.replace(/\s/g, ''));
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

export const answered = (s: string) => s.trim().length > 25;
export const filledAnalysis = (nb: P6Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
