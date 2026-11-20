/**
 * §12 — libreta de F10. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (pesos de la
 * viga y de la carga, centro de masa, posiciones de los apoyos, diámetro y largo calibrado de la probeta, importados);
 * equilibrio ×4 (reacciones y posición de la carga importadas; R_B y R_A previstas, ΣF y Στ_A escritos); tracción ×5
 * (fuerza y alargamiento importados; σ y ε escritos); ciclo plástico (residual reversible, curva y residual plástico
 * importados; ε y σ máx escritos); cálculos con incertidumbre; opción múltiple; contraste, análisis y cierre.
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F10 = ['dyn', 'cells', 'tape', 'caliper', 'loadCell', 'gauge'] as const;
export type InstrumentF10 = (typeof INSTRUMENTS_F10)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F10 = ['Wb', 'W1', 'xCG', 'xA', 'xB', 'd', 'L0'] as const;
export type SetupFieldF10 = (typeof SETUP_FIELDS_F10)[number];
export const SETUP_UNIT_F10: Record<SetupFieldF10, string> = { Wb: 'N', W1: 'N', xCG: 'cm', xA: 'cm', xB: 'cm', d: 'mm', L0: 'cm' };
/** Lectura que corresponde a cada campo del montaje (tipo y objetivo). */
export const SETUP_SOURCE_F10: Record<SetupFieldF10, { kind: string; target: string }> = {
  Wb: { kind: 'weight', target: 'beam' }, W1: { kind: 'weight', target: 'load1' }, xCG: { kind: 'position', target: 'cg' }, xA: { kind: 'position', target: 'supA' },
  xB: { kind: 'position', target: 'supB' }, d: { kind: 'diameter', target: 'spec1' }, L0: { kind: 'position', target: 'L0' },
};

/** Una posición de la carga: R_A, R_B y x importados; R_B y R_A previstas (N), ΣF (N) y Στ_A (N·m) escritos. */
export interface EqRow {
  raId: string | null;
  rbId: string | null;
  xId: string | null;
  RbPred: string;
  RaPred: string;
  sumF: string;
  tauA: string;
}

/** Un escalón de la manivela: fuerza y alargamiento importados; σ (Pa) y ε escritos. */
export interface ElRow {
  fId: string | null;
  eId: string | null;
  sigma: string;
  eps: string;
}

/** Ciclo plástico: residual tras la descarga elástica, curva F–ΔL y residual tras la fluencia importados. */
export interface PlasticRow {
  revId: string | null;
  curveId: string | null;
  resId: string | null;
  epsRev: string;
  sigmaMax: string;
  epsRes: string;
}

export const CALC_FIELDS_F10 = ['E', 'Edev', 'W1slope'] as const;
export type CalcFieldF10 = (typeof CALC_FIELDS_F10)[number];
export const CALC_UNIT_F10: Record<CalcFieldF10, string> = { E: 'Pa', Edev: '%', W1slope: 'N' };

export const QUESTIONS_F10 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF10 = (typeof QUESTIONS_F10)[number];
/** Opción múltiple: qué le pasa a la probeta que pasó la fluencia al descargarla. */
export const MCQ_OPTIONS_F10 = ['residual', 'recovers', 'shorter'] as const;

export const EQ_ROWS = 4;
export const EL_ROWS = 5;

export interface F10Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF10, InstrumentRow>;
  setup: Record<SetupFieldF10, Entry>;
  eqRows: EqRow[];
  elRows: ElRow[];
  plastic: PlasticRow;
  calc: Record<CalcFieldF10, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF10, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
export const eqRow = (): EqRow => ({ raId: null, rbId: null, xId: null, RbPred: '', RaPred: '', sumF: '', tauA: '' });
export const elRow = (): ElRow => ({ fId: null, eId: null, sigma: '', eps: '' });
export const plasticRow = (): PlasticRow => ({ revId: null, curveId: null, resId: null, epsRev: '', sigmaMax: '', epsRes: '' });

export function emptyF10Notebook(): F10Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F10.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F10Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F10.map((k) => [k, entry()])) as F10Notebook['setup'],
    eqRows: Array.from({ length: EQ_ROWS }, eqRow),
    elRows: Array.from({ length: EL_ROWS }, elRow),
    plastic: plasticRow(),
    calc: Object.fromEntries(CALC_FIELDS_F10.map((k) => [k, entry()])) as F10Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F10.map((q) => [q, ''])) as F10Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF10 = (nb: F10Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
