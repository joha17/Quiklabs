/**
 * §28 — libreta digital de la Práctica 10: Cuadro 10.2 (pesada por diferencia), preparación de la disolución y
 * reactivo limitante, Cuadro 10.3 (dos réplicas de R), tabla de Boyle, ajustes, actividades (§25), análisis e
 * historial. Las lecturas se importan solo después de observar el instrumento; los cálculos los escribe el estudiante.
 */

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada (balanza `m…`, volumen `v…`, temperatura `t…`, barómetro `p…`, altura `h…`). */
  readingId: string | null;
}

export const T102_ROWS = ['glassEmpty', 'glassSample', 'bicarbMass', 'transferred'] as const;
export type T102Row = (typeof T102_ROWS)[number];

export const PREP_ROWS = ['flaskMl', 'conc', 'aliquotMl', 'nAliquot', 'vinegarMl', 'nAcid'] as const;
export type PrepRow = (typeof PREP_ROWS)[number];

/** Cuadro 10.3 ampliado: lecturas crudas (importables) y cálculos. */
export const T103_ROWS = ['readingInitial', 'readingFinal', 'tC', 'baroMmHg', 'hMm', 'nCo2', 'tK', 'vL', 'patm', 'pv', 'dP', 'pCo2', 'r', 'errorPct', 'uR'] as const;
export type T103Row = (typeof T103_ROWS)[number];
export const T103_IMPORT: T103Row[] = ['readingInitial', 'readingFinal', 'tC', 'baroMmHg', 'hMm'];
export const T103_UNIT: Record<T103Row, string> = {
  readingInitial: 'mL', readingFinal: 'mL', tC: '°C', baroMmHg: 'mmHg', hMm: 'mm H₂O', nCo2: 'mol', tK: 'K', vL: 'L', patm: 'atm', pv: 'atm', dP: 'atm',
  pCo2: 'atm', r: 'L·atm·mol⁻¹·K⁻¹', errorPct: '%', uR: 'L·atm·mol⁻¹·K⁻¹',
};
export type Rep = 'r1' | 'r2';
export const REPS: Rep[] = ['r1', 'r2'];

export interface BoyleRow {
  /** Punto del sensor importado (índice) o null si se escribió a mano. */
  pointIndex: number | null;
  markMl: string;
  deadMl: string;
  totalMl: string;
  pKPa: string;
  tK: string;
}

export interface P10Notebook {
  t102: Record<T102Row, Entry>;
  prep: Record<PrepRow, string>;
  vinegarBasis: 'm/m' | 'm/v' | 'v/v' | '';
  limiting: 'CH3COOH' | 'NaHCO3' | '';
  /** Coeficientes de la ecuación (CH₃COOH, NaHCO₃, CH₃COONa, CO₂, H₂O). */
  equation: { acid: string; bicarb: string; acetate: string; co2: string; water: string };
  t103: Record<T103Row, Record<Rep, Entry>>;
  rUnit: 'L·atm/(mol·K)' | 'J/(mol·K)' | 'kPa·L/(mol·K)' | '';
  boyle: BoyleRow[];
  /** El sensor es absoluto (no se suma la atmosférica) o manométrico (se suma). */
  pressureKind: 'ABSOLUTE' | 'GAUGE' | '';
  fit: { nFree: string; better: 'MINUS_ONE' | 'PLUS_ONE' | ''; conclusion: string };
  activities: { charles: string; boyle: string; idealN: string };
  analysis: { q1: string; q2: string; q3: string; q4: string };
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });

export function emptyP10Notebook(): P10Notebook {
  return {
    t102: Object.fromEntries(T102_ROWS.map((r) => [r, entry()])) as P10Notebook['t102'],
    prep: Object.fromEntries(PREP_ROWS.map((r) => [r, ''])) as P10Notebook['prep'],
    vinegarBasis: '',
    limiting: '',
    equation: { acid: '', bicarb: '', acetate: '', co2: '', water: '' },
    t103: Object.fromEntries(T103_ROWS.map((r) => [r, { r1: entry(), r2: entry() }])) as P10Notebook['t103'],
    rUnit: '',
    boyle: [],
    pressureKind: '',
    fit: { nFree: '', better: '', conclusion: '' },
    activities: { charles: '', boyle: '', idealN: '' },
    analysis: { q1: '', q2: '', q3: '', q4: '' },
    history: [],
  };
}

/** Lee un número escrito con coma o punto (y notación científica). */
export function parseNum(s: string): number {
  const m = /-?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/i.exec(s.replace(/\s/g, '').replace(/×10\^?/, 'e'));
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

export const answered = (s: string) => s.trim().length > 25;
export const filledAnalysis = (nb: P10Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
