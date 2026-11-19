/**
 * §12 — libreta de F06. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (masas del
 * carro, del porta-pesas y de una pesa en la balanza y largo del péndulo, importados; ancho rotulado de la bandera y
 * diámetro de la esfera, escritos); calibración del resorte (lectura de la regla importada; F escrita); disparos
 * (lectura del registrador importada; W = área bajo F–x y U_el = ½ k x² escritas); réplicas a la altura de referencia
 * (v₁ y K₁ escritas); alturas (lectura del medidor importada; v₂, U_g y K₂ escritas); ensayo con pérdidas (W_nc
 * escrito); péndulo (v y h escritas); cálculos con incertidumbre; opción múltiple; contraste, análisis y cierre. Los
 * datos brutos se importan (`readingId`).
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F6 = ['balance', 'ruler', 'gauge', 'forceSensor', 'posSensor', 'gates', 'angleSensor'] as const;
export type InstrumentF6 = (typeof INSTRUMENTS_F6)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F6 = ['cartM', 'hangerM', 'slotM', 'pendL'] as const;
export type SetupFieldF6 = (typeof SETUP_FIELDS_F6)[number];
export const SETUP_UNIT_F6: Record<SetupFieldF6, string> = { cartM: 'g', hangerM: 'g', slotM: 'g', pendL: 'cm' };

/** Calibración: lectura de la regla importada (alargamiento, cm); fuerza F (N) escrita. */
export interface SpringRow {
  readingId: string | null;
  F: string;
}

/** Disparo: lectura del registrador importada; W (área bajo F–x, J) y U_el = ½ k x² (J) escritas. */
export interface LaunchRow {
  readingId: string | null;
  W: string;
  Uel: string;
}

/** Réplica a la altura de referencia: fotopuertas importadas; v₁ (m/s) y K₁ (J) escritas. */
export interface RepRow {
  readingId: string | null;
  v1: string;
  K1: string;
}

/** Altura: fotopuertas y medidor importados; v₂ (m/s), U_g (J) y K₂ (J) escritas. */
export interface HeightRow {
  readingId: string | null;
  heightId: string | null;
  v2: string;
  Ug: string;
  K2: string;
}

/** Ensayo con pérdidas: fotopuertas y medidor importados; v₁, v₂ y W_nc (J) escritos. */
export interface LossRow {
  readingId: string | null;
  heightId: string | null;
  v1: string;
  v2: string;
  Wnc: string;
}

/** Péndulo: lectura del captador y la compuerta importada; v (m/s) y h (m) escritas. */
export interface PendRow {
  readingId: string | null;
  v: string;
  h: string;
}

export const CALC_FIELDS_F6 = ['k', 'W', 'K1', 'eff', 'Wnet', 'Pmax', 'pendDisc'] as const;
export type CalcFieldF6 = (typeof CALC_FIELDS_F6)[number];
export const CALC_UNIT_F6: Record<CalcFieldF6, string> = { k: 'N/m', W: 'J', K1: 'J', eff: '%', Wnet: 'J', Pmax: 'W', pendDisc: '%' };

export const QUESTIONS_F6 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF6 = (typeof QUESTIONS_F6)[number];
/** Opción múltiple: qué pasa con la energía mecánica en el tramo con patín o amortiguador. */
export const MCQ_OPTIONS_F6 = ['dissipated', 'conserved', 'created'] as const;

export const SPRING_ROWS = 5;
export const LAUNCH_ROWS = 3;
export const REP_ROWS = 3;
export const HEIGHT_ROWS = 3;
export const PEND_ROWS = 2;

export interface F06Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF6, InstrumentRow>;
  setup: Record<SetupFieldF6, Entry>;
  /** Ancho rotulado de la bandera del carro (cm) y diámetro de la esfera (cm): datos del fabricante, se escriben. */
  flagW: string;
  bobD: string;
  springRows: SpringRow[];
  launchRows: LaunchRow[];
  repRows: RepRow[];
  heightRows: HeightRow[];
  loss: LossRow;
  pendRows: PendRow[];
  calc: Record<CalcFieldF6, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF6, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });

export function emptyF06Notebook(): F06Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F6.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F06Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F6.map((k) => [k, entry()])) as F06Notebook['setup'],
    flagW: '',
    bobD: '',
    springRows: Array.from({ length: SPRING_ROWS }, () => ({ readingId: null, F: '' })),
    launchRows: Array.from({ length: LAUNCH_ROWS }, () => ({ readingId: null, W: '', Uel: '' })),
    repRows: Array.from({ length: REP_ROWS }, () => ({ readingId: null, v1: '', K1: '' })),
    heightRows: Array.from({ length: HEIGHT_ROWS }, () => ({ readingId: null, heightId: null, v2: '', Ug: '', K2: '' })),
    loss: { readingId: null, heightId: null, v1: '', v2: '', Wnc: '' },
    pendRows: Array.from({ length: PEND_ROWS }, () => ({ readingId: null, v: '', h: '' })),
    calc: Object.fromEntries(CALC_FIELDS_F6.map((k) => [k, entry()])) as F06Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F6.map((q) => [q, ''])) as F06Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF6 = (nb: F06Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
