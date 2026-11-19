/**
 * §12 — libreta de F09. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (masa
 * orbitante y masa radial pesadas, radio de la órbita, brazos del tambor y radio de las masas radiales en el ensayo de
 * torque, importados); fuerza centrípeta ×4 (sensor de fuerza y fotopuerta importados; T, ω, v, F prevista y residuo
 * escritos); torque ×2 (dinamómetro y encoder importados; τ, α, α_c e I escritos); momento angular (ω₁ y ω₂ del encoder
 * y radios de las masas antes y después importados; I, L y K escritos); cálculos con incertidumbre; opción múltiple;
 * contraste, análisis y cierre. Los datos brutos se importan (`readingId`).
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F9 = ['balance', 'ruler', 'force', 'gate', 'encoder', 'dyn'] as const;
export type InstrumentF9 = (typeof INSTRUMENTS_F9)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F9 = ['mOrb', 'mSlide', 'rOrb', 'rArm1', 'rArm2', 'rSlideC'] as const;
export type SetupFieldF9 = (typeof SETUP_FIELDS_F9)[number];
export const SETUP_UNIT_F9: Record<SetupFieldF9, string> = { mOrb: 'g', mSlide: 'g', rOrb: 'cm', rArm1: 'cm', rArm2: 'cm', rSlideC: 'cm' };

/** Una velocidad: fuerza del sensor y tiempo de n vueltas importados; T (s), ω (rad/s), v (m/s), F prevista (N) y residuo (%). */
export interface CircRow {
  forceId: string | null;
  periodId: string | null;
  T: string;
  omega: string;
  v: string;
  Fpred: string;
  diff: string;
}

/** Un tirón: dinamómetro y encoder importados; τ (N·m), α y |α_c| (rad/s²) e I (kg·m²) escritos. */
export interface TorqueRow {
  dynId: string | null;
  encId: string | null;
  tau: string;
  alpha: string;
  alphaC: string;
  I: string;
}

/** Conservación: ω₁ y ω₂ (encoder) y radios de una masa antes y después (regla) importados; I, L y K escritos. */
export interface MomentumRow {
  w1Id: string | null;
  w2Id: string | null;
  r1Id: string | null;
  r2Id: string | null;
  I1: string;
  I2: string;
  L1: string;
  L2: string;
  dL: string;
  K1: string;
  K2: string;
}

export const CALC_FIELDS_F9 = ['mr', 'mrPred', 'Itorque', 'I0', 'Lratio', 'Kratio', 'tauFc'] as const;
export type CalcFieldF9 = (typeof CALC_FIELDS_F9)[number];
export const CALC_UNIT_F9: Record<CalcFieldF9, string> = { mr: 'kg·m', mrPred: 'kg·m', Itorque: 'kg·m²', I0: 'kg·m²', Lratio: '', Kratio: '', tauFc: 'N·m' };

export const QUESTIONS_F9 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF9 = (typeof QUESTIONS_F9)[number];
/** Opción múltiple: qué hace la fuerza centrípeta sobre la velocidad de la masa. */
export const MCQ_OPTIONS_F9 = ['direction', 'speed', 'outward'] as const;

export const CIRC_ROWS = 4;
export const TORQUE_ROWS = 2;

export interface F09Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF9, InstrumentRow>;
  setup: Record<SetupFieldF9, Entry>;
  circRows: CircRow[];
  torqueRows: TorqueRow[];
  momentum: MomentumRow;
  calc: Record<CalcFieldF9, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF9, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
export const circRow = (): CircRow => ({ forceId: null, periodId: null, T: '', omega: '', v: '', Fpred: '', diff: '' });
export const torqueRow = (): TorqueRow => ({ dynId: null, encId: null, tau: '', alpha: '', alphaC: '', I: '' });
export const momentumRow = (): MomentumRow => ({ w1Id: null, w2Id: null, r1Id: null, r2Id: null, I1: '', I2: '', L1: '', L2: '', dL: '', K1: '', K2: '' });

export function emptyF09Notebook(): F09Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F9.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F09Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F9.map((k) => [k, entry()])) as F09Notebook['setup'],
    circRows: Array.from({ length: CIRC_ROWS }, circRow),
    torqueRows: Array.from({ length: TORQUE_ROWS }, torqueRow),
    momentum: momentumRow(),
    calc: Object.fromEntries(CALC_FIELDS_F9.map((k) => [k, entry()])) as F09Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F9.map((q) => [q, ''])) as F09Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF9 = (nb: F09Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
