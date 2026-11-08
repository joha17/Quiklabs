/**
 * §12 — libreta de F103. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje
 * (inclinación del deck, altura de la boca, cero de la cinta y ángulo de la trayectoria importados de lecturas; diámetro
 * rotulado de la esfera); rapidez de salida (lecturas de la fotopuerta, v₀ de cada disparo); barrido de ángulos
 * (impacto, ángulo y posición de la plataforma importados; R medido, R y T predichos); condiciones (otra altura y
 * viento); trayectoria (marcas de la pantalla y su posición en la cinta); cálculos con incertidumbre; contraste,
 * análisis y cierre. Los datos brutos se importan (`readingId`); los cálculos los escribe el estudiante.
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F3 = ['protractor', 'level', 'floorTape', 'heightRuler', 'gate', 'platform', 'screen'] as const;
export type InstrumentF3 = (typeof INSTRUMENTS_F3)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F3 = ['tilt', 'muzzleH', 'tapeZero', 'trajAngle'] as const;
export type SetupFieldF3 = (typeof SETUP_FIELDS_F3)[number];
export const SETUP_UNIT_F3: Record<SetupFieldF3, string> = { tilt: '°', muzzleH: 'cm', tapeZero: 'cm', trajAngle: '°' };

/** Disparo contra la pantalla segura: Δt de la fotopuerta importado; v₀ escrita. */
export interface VelocityRow {
  readingId: string | null;
  v0: string;
}

/** Disparo del barrido: impacto importado; ángulo y posición de la plataforma importados; R, R_pred y T_pred escritos. */
export interface AngleRow {
  readingId: string | null;
  angle: Entry;
  xPlat: Entry;
  R: string;
  Rpred: string;
  Tpred: string;
}

/** Disparo en otra condición: impacto, altura de la boca y posición de la plataforma importados; R y R_pred escritos. */
export interface ConditionRow {
  readingId: string | null;
  h: Entry;
  xPlat: Entry;
  R: string;
  Rpred: string;
}

/** Punto de la trayectoria: marca de la pantalla importada y posición de la pantalla en la cinta. */
export interface TrajectoryRow {
  readingId: string | null;
  x: Entry;
}

export const CALC_FIELDS_F3 = ['v0Mean', 'rangeErr', 'fitC1', 'fitC2', 'fitV0', 'vx', 'vy1', 'vy2'] as const;
export type CalcFieldF3 = (typeof CALC_FIELDS_F3)[number];
export const CALC_UNIT_F3: Record<CalcFieldF3, string> = { v0Mean: 'm/s', rangeErr: '%', fitC1: '', fitC2: '1/m', fitV0: 'm/s', vx: 'm/s', vy1: 'm/s', vy2: 'm/s' };
/** Instantes (s) en que se piden las componentes v_y de la trayectoria. */
export const VY_TIMES = { vy1: 0.1, vy2: 0.4 } as const;

export const QUESTIONS_F3 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF3 = (typeof QUESTIONS_F3)[number];

export const VELOCITY_ROWS = 3;
export const ANGLE_ROWS = 4;
export const CONDITION_ROWS = 3;
export const TRAJECTORY_ROWS = 4;

export interface F103Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF3, InstrumentRow>;
  setup: Record<SetupFieldF3, Entry>;
  /** Diámetro rotulado de la esfera (cm): dato del fabricante, se escribe. */
  ballD: string;
  velocity: VelocityRow[];
  angles: AngleRow[];
  conditions: ConditionRow[];
  trajectory: TrajectoryRow[];
  calc: Record<CalcFieldF3, Entry>;
  contrastText: string;
  analysis: Record<QuestionF3, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const vrow = (): VelocityRow => ({ readingId: null, v0: '' });
const arow = (): AngleRow => ({ readingId: null, angle: entry(), xPlat: entry(), R: '', Rpred: '', Tpred: '' });
const crow = (): ConditionRow => ({ readingId: null, h: entry(), xPlat: entry(), R: '', Rpred: '' });
const trow = (): TrajectoryRow => ({ readingId: null, x: entry() });

export function emptyF103Notebook(): F103Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F3.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F103Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F3.map((k) => [k, entry()])) as F103Notebook['setup'],
    ballD: '',
    velocity: Array.from({ length: VELOCITY_ROWS }, vrow),
    angles: Array.from({ length: ANGLE_ROWS }, arow),
    conditions: Array.from({ length: CONDITION_ROWS }, crow),
    trajectory: Array.from({ length: TRAJECTORY_ROWS }, trow),
    calc: Object.fromEntries(CALC_FIELDS_F3.map((k) => [k, entry()])) as F103Notebook['calc'],
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F3.map((q) => [q, ''])) as F103Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF3 = (nb: F103Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
