/**
 * §12 — libreta de F05. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (masa del
 * bloque y de un lastre en la balanza, temperatura de la sala, posiciones de las compuertas en la escala del tablero y
 * ángulo de la bajada, todas importadas; ancho rotulado de la bandera); material declarado; réplicas del pico estático
 * (lectura del tirón importada; N y μ_s escritas); réplicas de la meseta cinética (N y μ_k escritas); barrido de carga
 * (N escrita); ángulos críticos (material y μ_s = tan θ escritos); bajada (v₁, v₂, a y μ_k escritas); cálculos con
 * incertidumbre; opción múltiple; contraste, análisis y cierre. Los datos brutos se importan (`readingId`).
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';
import type { Material } from '../../simulation/f05-world/commands';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F5 = ['balance', 'loadCell', 'goniometer', 'gates', 'planeScale', 'thermometer'] as const;
export type InstrumentF5 = (typeof INSTRUMENTS_F5)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F5 = ['blockM', 'ballastM', 'temp', 'g1', 'g2', 'slideTheta'] as const;
export type SetupFieldF5 = (typeof SETUP_FIELDS_F5)[number];
export const SETUP_UNIT_F5: Record<SetupFieldF5, string> = { blockM: 'g', ballastM: 'g', temp: '°C', g1: 'cm', g2: 'cm', slideTheta: '°' };

/** Réplica del pico estático: tirón importado; N (N) y μ_s escritas. */
export interface StaticRow {
  readingId: string | null;
  N: string;
  muS: string;
}

/** Réplica de la meseta cinética: tirón importado; N y μ_k escritas. */
export interface KineticRow {
  readingId: string | null;
  N: string;
  muK: string;
}

/** Barrido de carga: tirón importado con otra carga; N escrita (F_k = la media de la lectura). */
export interface LoadRow {
  readingId: string | null;
  N: string;
}

/** Ángulo crítico: lectura del goniómetro importada; material y μ_s = tan θ escritos. */
export interface AngleRow {
  readingId: string | null;
  material: string;
  muS: string;
}

/** Bajada por el plano: lectura del registrador importada; v₁, v₂, a y μ_k escritas. */
export interface SlideRow {
  readingId: string | null;
  v1: string;
  v2: string;
  a: string;
  muK: string;
}

export const CALC_FIELDS_F5 = ['muS', 'muK', 'slopeMu', 'thetaPred', 'thetaDisc', 'muKSlide', 'Wfr'] as const;
export type CalcFieldF5 = (typeof CALC_FIELDS_F5)[number];
export const CALC_UNIT_F5: Record<CalcFieldF5, string> = { muS: '', muK: '', slopeMu: '', thetaPred: '°', thetaDisc: '%', muKSlide: '', Wfr: 'J' };

export const QUESTIONS_F5 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF5 = (typeof QUESTIONS_F5)[number];
/** Opción múltiple: cómo depende el roce cinético de la normal. */
export const MCQ_OPTIONS_F5 = ['proportional', 'constant', 'area'] as const;
export const MATERIAL_OPTIONS_F5: Material[] = ['wood', 'paper', 'rubber'];

export const STATIC_ROWS = 3;
export const KINETIC_ROWS = 3;
export const LOAD_ROWS = 3;
export const ANGLE_ROWS = 2;

export interface F05Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF5, InstrumentRow>;
  setup: Record<SetupFieldF5, Entry>;
  /** Ancho rotulado de la bandera (cm): dato del fabricante, se escribe. */
  flagW: string;
  /** Material de los tirones horizontales (madera, papel o goma). */
  material: string;
  staticRows: StaticRow[];
  kineticRows: KineticRow[];
  loadRows: LoadRow[];
  angleRows: AngleRow[];
  slide: SlideRow;
  calc: Record<CalcFieldF5, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF5, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const srow = (): StaticRow => ({ readingId: null, N: '', muS: '' });
const krow = (): KineticRow => ({ readingId: null, N: '', muK: '' });
const lrow = (): LoadRow => ({ readingId: null, N: '' });
const arow = (): AngleRow => ({ readingId: null, material: '', muS: '' });

export function emptyF05Notebook(): F05Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F5.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F05Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F5.map((k) => [k, entry()])) as F05Notebook['setup'],
    flagW: '',
    material: '',
    staticRows: Array.from({ length: STATIC_ROWS }, srow),
    kineticRows: Array.from({ length: KINETIC_ROWS }, krow),
    loadRows: Array.from({ length: LOAD_ROWS }, lrow),
    angleRows: Array.from({ length: ANGLE_ROWS }, arow),
    slide: { readingId: null, v1: '', v2: '', a: '', muK: '' },
    calc: Object.fromEntries(CALC_FIELDS_F5.map((k) => [k, entry()])) as F05Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F5.map((q) => [q, ''])) as F05Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF5 = (nb: F05Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
