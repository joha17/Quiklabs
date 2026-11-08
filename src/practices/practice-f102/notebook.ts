/**
 * §12 — libreta de F102. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (ángulo
 * del carril, ancho de bandera y posiciones de las compuertas importadas de lecturas); MRU (tiempos importados de las
 * corridas con compuertas, v₁, v₂ y v̄); MRUA (cintas importadas, a y v₀ del ajuste, masas del montaje) con la
 * predicción a = m g/(M + m); caída libre (alturas de la escala y tiempos de la fotocelda, g de cada corrida); arrastre
 * (capturas del sensor, n filtros y velocidad límite); cálculos con incertidumbre; contraste, análisis y cierre.
 * Los datos brutos se importan (`readingId`); los cálculos los escribe el estudiante.
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F2 = ['ruler', 'gateTimer', 'tapeTimer', 'towerScale', 'fallTimer', 'motionSensor', 'inclinometer'] as const;
export type InstrumentF2 = (typeof INSTRUMENTS_F2)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS = ['angle', 'flag', 'gate1', 'gate2'] as const;
export type SetupField = (typeof SETUP_FIELDS)[number];
export const SETUP_UNIT: Record<SetupField, string> = { angle: '°', flag: 'cm', gate1: 'cm', gate2: 'cm' };

/** Corrida de MRU: tiempos importados del temporizador de compuertas; velocidades escritas por el estudiante. */
export interface UniformRow {
  readingId: string | null;
  v1: string;
  v2: string;
  vAvg: string;
}

/** Corrida de MRUA: cinta importada; masas del montaje, a y v₀ del ajuste escritos por el estudiante. */
export interface AccelRow {
  readingId: string | null;
  mHang: string;
  mCart: string;
  a: string;
  ua: string;
  v0: string;
}

/** Corrida de caída: altura de la escala de la torre y tiempo de la fotocelda importados; g escrita. */
export interface FallRow {
  readingId: string | null;
  h: Entry;
  g: string;
}

/** Captura de filtros: lectura del sensor de movimiento importada; n y velocidad límite escritas. */
export interface DragRow {
  readingId: string | null;
  n: string;
  vt: string;
}

export const CALC_FIELDS_F2 = ['aMean', 'aPred', 'gMean', 'relErrG', 'vtRatio'] as const;
export type CalcFieldF2 = (typeof CALC_FIELDS_F2)[number];
export const CALC_UNIT_F2: Record<CalcFieldF2, string> = { aMean: 'm/s²', aPred: 'm/s²', gMean: 'm/s²', relErrG: '%', vtRatio: '' };

export const QUESTIONS_F2 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF2 = (typeof QUESTIONS_F2)[number];

export const UNIFORM_ROWS = 3;
export const ACCEL_ROWS = 3;
export const FALL_ROWS = 4;
export const DRAG_ROWS = 2;

export interface F102Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF2, InstrumentRow>;
  setup: Record<SetupField, Entry>;
  uniform: UniformRow[];
  accel: AccelRow[];
  fall: FallRow[];
  drag: DragRow[];
  calc: Record<CalcFieldF2, Entry>;
  contrastText: string;
  analysis: Record<QuestionF2, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const urow = (): UniformRow => ({ readingId: null, v1: '', v2: '', vAvg: '' });
const arow = (): AccelRow => ({ readingId: null, mHang: '', mCart: '', a: '', ua: '', v0: '' });
const frow = (): FallRow => ({ readingId: null, h: entry(), g: '' });
const drow = (): DragRow => ({ readingId: null, n: '', vt: '' });

export function emptyF102Notebook(): F102Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F2.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F102Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS.map((k) => [k, entry()])) as F102Notebook['setup'],
    uniform: Array.from({ length: UNIFORM_ROWS }, urow),
    accel: Array.from({ length: ACCEL_ROWS }, arow),
    fall: Array.from({ length: FALL_ROWS }, frow),
    drag: Array.from({ length: DRAG_ROWS }, drow),
    calc: Object.fromEntries(CALC_FIELDS_F2.map((k) => [k, entry()])) as F102Notebook['calc'],
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F2.map((q) => [q, ''])) as F102Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF2 = (nb: F102Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
