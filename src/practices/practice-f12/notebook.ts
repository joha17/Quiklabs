/**
 * §12 — libreta de F12. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (D1 y D2
 * del calibre, cotas de las tomas 1 y 3, volumen y tiempo de la recolección y caudalímetro durante ella, importados);
 * serie con el tramo liso ×5 (caudal y tres presiones importados; v1, v2, Δp12 medida y Δp12 de Bernoulli escritas);
 * serie con pérdidas ×3 (caudal, p1 y p3 importados; v1, Δp13 corregida por altura, K y potencia escritas); cálculos
 * con incertidumbre; opción múltiple; contraste, análisis y cierre.
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F12 = ['sensor', 'meter', 'caliper', 'beaker', 'timer', 'ruler'] as const;
export type InstrumentF12 = (typeof INSTRUMENTS_F12)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F12 = ['D1', 'D2', 'z1', 'z3', 'V', 't', 'Qm'] as const;
export type SetupFieldF12 = (typeof SETUP_FIELDS_F12)[number];
export const SETUP_UNIT_F12: Record<SetupFieldF12, string> = { D1: 'cm', D2: 'cm', z1: 'cm', z3: 'cm', V: 'mL', t: 's', Qm: 'L/s' };
/** Lectura que corresponde a cada campo del montaje (tipo y objetivo). */
export const SETUP_SOURCE_F12: Record<SetupFieldF12, { kind: string; target: string }> = {
  D1: { kind: 'diameter', target: 'D1' }, D2: { kind: 'diameter', target: 'D2' }, z1: { kind: 'height', target: 'port1' }, z3: { kind: 'height', target: 'port3' },
  V: { kind: 'volume', target: 'beaker' }, t: { kind: 'time', target: 'timer' }, Qm: { kind: 'flow', target: 'meter' },
};

/** Un caudal con el tramo liso: Q y p1, p2, p3 importados; v1, v2 (m/s), Δp12 y Δp12 de Bernoulli (Pa) escritos. */
export interface FlowRow {
  qId: string | null;
  p1Id: string | null;
  p2Id: string | null;
  p3Id: string | null;
  v1: string;
  v2: string;
  dp12: string;
  dp12Pred: string;
}

/** Un caudal con pérdidas: Q, p1 y p3 importados; v1 (m/s), Δp13 corregida (Pa), K y potencia (W) escritos. */
export interface LossRow {
  qId: string | null;
  p1Id: string | null;
  p3Id: string | null;
  v1: string;
  dp13: string;
  K: string;
  P: string;
}

export const CALC_FIELDS_F12 = ['Qvol', 'QDev', 'rhoFit', 'K'] as const;
export type CalcFieldF12 = (typeof CALC_FIELDS_F12)[number];
export const CALC_UNIT_F12: Record<CalcFieldF12, string> = { Qvol: 'L/s', QDev: '%', rhoFit: 'kg/m³', K: '—' };

export const QUESTIONS_F12 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF12 = (typeof QUESTIONS_F12)[number];
/** Opción múltiple: ¿vale la misma ecuación para aire a 100 m/s por este Venturi? */
export const MCQ_OPTIONS_F12 = ['yes', 'no_compressible', 'only_losses'] as const;

export const FLOW_ROWS = 5;
export const LOSS_ROWS = 3;

export interface F12Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF12, InstrumentRow>;
  setup: Record<SetupFieldF12, Entry>;
  flowRows: FlowRow[];
  lossRows: LossRow[];
  calc: Record<CalcFieldF12, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF12, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
export const flowRow = (): FlowRow => ({ qId: null, p1Id: null, p2Id: null, p3Id: null, v1: '', v2: '', dp12: '', dp12Pred: '' });
export const lossRow = (): LossRow => ({ qId: null, p1Id: null, p3Id: null, v1: '', dp13: '', K: '', P: '' });

export function emptyF12Notebook(): F12Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F12.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F12Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F12.map((k) => [k, entry()])) as F12Notebook['setup'],
    flowRows: Array.from({ length: FLOW_ROWS }, flowRow),
    lossRows: Array.from({ length: LOSS_ROWS }, lossRow),
    calc: Object.fromEntries(CALC_FIELDS_F12.map((k) => [k, entry()])) as F12Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F12.map((q) => [q, ''])) as F12Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF12 = (nb: F12Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
