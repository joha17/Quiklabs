/**
 * §12 — libreta de F08. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (masas y
 * diámetros del disco y del aro, masa de caída, diámetro del tambor, ancho de la bandera, distancia del agujero y masa
 * corrediza, importados); eje solo, disco ×3, aro, masas corredizas ×2 y eje desplazado (encoder importado; α, α_c, T e I
 * escritos); tensión medida frente a m (g − α r); energía (fotopuerta y tacómetro importados); cálculos con
 * incertidumbre; opción múltiple; contraste, análisis y cierre. Los datos brutos se importan (`readingId`).
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F8 = ['balance', 'caliper', 'protractor', 'encoder', 'tension', 'tach', 'gate', 'ruler'] as const;
export type InstrumentF8 = (typeof INSTRUMENTS_F8)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F8 = ['mDisc', 'dDisc', 'mRing', 'dRing', 'mDrop', 'dDrum', 'wFlag', 'dHole', 'mSlide'] as const;
export type SetupFieldF8 = (typeof SETUP_FIELDS_F8)[number];
export const SETUP_UNIT_F8: Record<SetupFieldF8, string> = { mDisc: 'g', dDisc: 'cm', mRing: 'g', dRing: 'cm', mDrop: 'g', dDrum: 'cm', wFlag: 'cm', dHole: 'cm', mSlide: 'g' };

/** Un ensayo de torque: encoder importado; α = 2c y α_c = |2c_libre| (rad/s²), T (N) e I total del rotor (kg·m²) escritos. */
export interface RunRow {
  readingId: string | null;
  alpha: string;
  alphaC: string;
  T: string;
  I: string;
}

/** Masas corredizas: además del ensayo, la lectura de la regla radial (cm). */
export interface MassRow extends RunRow {
  rId: string | null;
}

/** Eje desplazado: I del disco sobre ese eje (I − I₀) y lo previsto con Steiner (I_disco + M d²). */
export interface ParallelRow extends RunRow {
  Ipar: string;
  Ipred: string;
}

/** Tensión medida por el sensor frente a la del modelo m (g − α r) del mismo ensayo. */
export interface TensionRow {
  readingId: string | null;
  encId: string | null;
  T: string;
  Tmodel: string;
  diff: string;
}

/** Energía: fotopuerta y tacómetro importados; h (cm), v (m/s), ω del tacómetro (rad/s), K y U (J) y balance (%). */
export interface EnergyRow {
  readingId: string | null;
  tachId: string | null;
  h: string;
  v: string;
  omega: string;
  K: string;
  U: string;
  bal: string;
}

export const CALC_FIELDS_F8 = ['Ipred', 'Idisk', 'Iring', 'ratio', 'Ebal', 'parDisc', 'slope'] as const;
export type CalcFieldF8 = (typeof CALC_FIELDS_F8)[number];
export const CALC_UNIT_F8: Record<CalcFieldF8, string> = { Ipred: 'kg·m²', Idisk: 'kg·m²', Iring: 'kg·m²', ratio: '', Ebal: '%', parDisc: '%', slope: 'kg' };

export const QUESTIONS_F8 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF8 = (typeof QUESTIONS_F8)[number];
/** Opción múltiple: qué aumenta más el momento de inercia con la misma masa. */
export const MCQ_OPTIONS_F8 = ['farther', 'heavier', 'friction'] as const;

export const DISK_ROWS = 3;
export const MASS_ROWS = 2;

export interface F08Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF8, InstrumentRow>;
  setup: Record<SetupFieldF8, Entry>;
  axle: RunRow;
  diskRows: RunRow[];
  ring: RunRow;
  massRows: MassRow[];
  parallel: ParallelRow;
  tension: TensionRow;
  energy: EnergyRow;
  calc: Record<CalcFieldF8, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF8, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
export const runRow = (): RunRow => ({ readingId: null, alpha: '', alphaC: '', T: '', I: '' });

export function emptyF08Notebook(): F08Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F8.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F08Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F8.map((k) => [k, entry()])) as F08Notebook['setup'],
    axle: runRow(),
    diskRows: Array.from({ length: DISK_ROWS }, runRow),
    ring: runRow(),
    massRows: Array.from({ length: MASS_ROWS }, () => ({ ...runRow(), rId: null })),
    parallel: { ...runRow(), Ipar: '', Ipred: '' },
    tension: { readingId: null, encId: null, T: '', Tmodel: '', diff: '' },
    energy: { readingId: null, tachId: null, h: '', v: '', omega: '', K: '', U: '', bal: '' },
    calc: Object.fromEntries(CALC_FIELDS_F8.map((k) => [k, entry()])) as F08Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F8.map((q) => [q, ''])) as F08Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF8 = (nb: F08Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
