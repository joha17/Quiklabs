/**
 * §12 — libreta de F07. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (masas de
 * los carros, anchos de las banderas e inclinación del riel, importados); choques elásticos (fotopuertas importadas;
 * v₁i, v₁f, v₂i, v₂f, Δp y e escritos); choque con velcro (fotopuertas importadas; v_f y energía perdida escritas);
 * impulso (registro de fuerza y fotopuertas importados; J₁, Δp₁ y F_máx escritos); centro de masa (cámara y masas de
 * los carros cargados importadas; v_CM antes y después escritas); cálculos con incertidumbre; opción múltiple;
 * contraste, análisis y cierre. Los datos brutos se importan (`readingId`).
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F7 = ['balance', 'caliper', 'level', 'gates', 'forceSensor', 'camera', 'ruler'] as const;
export type InstrumentF7 = (typeof INSTRUMENTS_F7)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F7 = ['mA', 'mB', 'flagA', 'flagB', 'tilt'] as const;
export type SetupFieldF7 = (typeof SETUP_FIELDS_F7)[number];
export const SETUP_UNIT_F7: Record<SetupFieldF7, string> = { mA: 'g', mB: 'g', flagA: 'cm', flagB: 'cm', tilt: '°' };

/** Choque elástico: fotopuertas importadas; velocidades con signo (m/s), Δp = p_después − p_antes (kg·m/s) y e escritos. */
export interface ElasticRow {
  readingId: string | null;
  v1i: string;
  v1f: string;
  v2i: string;
  v2f: string;
  dp: string;
  e: string;
}

/** Choque con velcro: fotopuertas importadas; v_f común (m/s) y energía cinética perdida (%) escritas. */
export interface StickRow {
  readingId: string | null;
  v1i: string;
  vf: string;
  Klost: string;
}

/** Impulso: registro de fuerza y fotopuertas importados; J₁ (N·s), Δp₁ (kg·m/s) y F_máx (N) escritos. */
export interface ImpulseRow {
  forceId: string | null;
  readingId: string | null;
  J1: string;
  dp1: string;
  Fmax: string;
}

/** Centro de masa: cámara y masas de los carros cargados importadas; v_CM (m/s) antes y después escritas. */
export interface CmRow {
  readingId: string | null;
  mA: Entry;
  mB: Entry;
  vBefore: string;
  vAfter: string;
}

export const CALC_FIELDS_F7 = ['dp', 'e', 'J', 'Klost', 'vcm', 'impDisc'] as const;
export type CalcFieldF7 = (typeof CALC_FIELDS_F7)[number];
export const CALC_UNIT_F7: Record<CalcFieldF7, string> = { dp: 'kg·m/s', e: '', J: 'N·s', Klost: '%', vcm: 'm/s', impDisc: '%' };

export const QUESTIONS_F7 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF7 = (typeof QUESTIONS_F7)[number];
/** Opción múltiple: qué pasa con la energía cinética en el choque con velcro. */
export const MCQ_OPTIONS_F7 = ['lost', 'conserved', 'created'] as const;

export const ELASTIC_ROWS = 3;

export interface F07Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF7, InstrumentRow>;
  setup: Record<SetupFieldF7, Entry>;
  elasticRows: ElasticRow[];
  stick: StickRow;
  impulse: ImpulseRow;
  cm: CmRow;
  calc: Record<CalcFieldF7, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF7, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });

export function emptyF07Notebook(): F07Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F7.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F07Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F7.map((k) => [k, entry()])) as F07Notebook['setup'],
    elasticRows: Array.from({ length: ELASTIC_ROWS }, () => ({ readingId: null, v1i: '', v1f: '', v2i: '', v2f: '', dp: '', e: '' })),
    stick: { readingId: null, v1i: '', vf: '', Klost: '' },
    impulse: { forceId: null, readingId: null, J1: '', dp1: '', Fmax: '' },
    cm: { readingId: null, mA: entry(), mB: entry(), vBefore: '', vAfter: '' },
    calc: Object.fromEntries(CALC_FIELDS_F7.map((k) => [k, entry()])) as F07Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F7.map((q) => [q, ''])) as F07Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF7 = (nb: F07Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
