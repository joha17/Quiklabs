/**
 * §12 — libreta de F04. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (masa del
 * carro y del portapesas de la balanza, posiciones de las fotopuertas en la escala del carril, aceleración en reposo del
 * acelerómetro, todas importadas; ancho rotulado de la bandera); ensayos repetidos (lectura del registrador importada;
 * v₁, v₂ y a de las fotopuertas escritas); barrido de masa colgante (ensayo importado; m_h y a_pred escritas); pares de
 * la tercera ley (lectura importada; suma escrita); cálculos con incertidumbre; pregunta de opción múltiple; contraste,
 * análisis y cierre. Los datos brutos se importan (`readingId`); los cálculos los escribe el estudiante.
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F4 = ['balance', 'forceA', 'dyn', 'accel', 'gates', 'trackScale'] as const;
export type InstrumentF4 = (typeof INSTRUMENTS_F4)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F4 = ['cartM', 'hangerM', 'g1', 'g2', 'aRest'] as const;
export type SetupFieldF4 = (typeof SETUP_FIELDS_F4)[number];
export const SETUP_UNIT_F4: Record<SetupFieldF4, string> = { cartM: 'g', hangerM: 'g', g1: 'cm', g2: 'cm', aRest: 'm/s²' };

/** Ensayo repetido con la misma configuración: lectura del registrador importada; v₁, v₂ y a de las fotopuertas escritas. */
export interface RunRow {
  readingId: string | null;
  v1: string;
  v2: string;
  aGates: string;
}

/** Ensayo con otra masa colgante: lectura importada; m_h (kg) y a_pred escritas. */
export interface MassRow {
  readingId: string | null;
  mh: string;
  aPred: string;
}

/** Par de la tercera ley: lectura simultánea importada; suma F_PQ + F_QP escrita. */
export interface PairRow {
  readingId: string | null;
  sum: string;
}

export const CALC_FIELDS_F4 = ['aMean', 'TMean', 'aPred', 'Tpred', 'discrepancy', 'mEff', 'aPredI', 'slopeK', 'mSys', 'sumF'] as const;
export type CalcFieldF4 = (typeof CALC_FIELDS_F4)[number];
export const CALC_UNIT_F4: Record<CalcFieldF4, string> = {
  aMean: 'm/s²', TMean: 'N', aPred: 'm/s²', Tpred: 'N', discrepancy: '%', mEff: 'kg', aPredI: 'm/s²', slopeK: 'kg', mSys: 'kg', sumF: 'N',
};

export const QUESTIONS_F4 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF4 = (typeof QUESTIONS_F4)[number];
/** Opción múltiple: qué relación muestran los datos entre la fuerza neta y el movimiento. */
export const MCQ_OPTIONS_F4 = ['accel', 'velocity', 'none'] as const;

export const RUN_ROWS = 3;
export const MASS_ROWS = 3;
export const PAIR_ROWS = 2;

export interface F04Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF4, InstrumentRow>;
  setup: Record<SetupFieldF4, Entry>;
  /** Ancho rotulado de la bandera (cm): dato del fabricante, se escribe. */
  flagW: string;
  runs: RunRow[];
  massRuns: MassRow[];
  pairs: PairRow[];
  calc: Record<CalcFieldF4, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF4, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const rrow = (): RunRow => ({ readingId: null, v1: '', v2: '', aGates: '' });
const mrow = (): MassRow => ({ readingId: null, mh: '', aPred: '' });
const prow = (): PairRow => ({ readingId: null, sum: '' });

export function emptyF04Notebook(): F04Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F4.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F04Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F4.map((k) => [k, entry()])) as F04Notebook['setup'],
    flagW: '',
    runs: Array.from({ length: RUN_ROWS }, rrow),
    massRuns: Array.from({ length: MASS_ROWS }, mrow),
    pairs: Array.from({ length: PAIR_ROWS }, prow),
    calc: Object.fromEntries(CALC_FIELDS_F4.map((k) => [k, entry()])) as F04Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F4.map((q) => [q, ''])) as F04Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF4 = (nb: F04Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
