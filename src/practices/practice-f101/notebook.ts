/**
 * §12 — libreta de F101. Cuadros: hipótesis; montaje e instrumentos (resolución, u_B, estado de calibración); ceros y
 * patrón; medidas brutas (tres repeticiones por dimensión, masas y volúmenes importados de lecturas observadas);
 * cálculos (volumen geométrico, desplazamiento, densidad con u, paso a SI, error relativo); vectores (Cuadro 8:
 * componentes, resultante, equilibrante, unitario, productos escalar y vectorial) con su contraste independiente;
 * análisis y cierre. Los datos brutos se importan (`readingId`); los cálculos los escribe el estudiante.
 */

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F = ['caliper', 'micrometer', 'ruler', 'balance', 'gradCyl', 'dynamometer', 'angle'] as const;
export type InstrumentF = (typeof INSTRUMENTS_F)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const DIMS = ['cylD', 'cylH', 'ballD'] as const;
export type Dim = (typeof DIMS)[number];
export const DIM_INSTRUMENT: Record<Dim, 'caliper01' | 'micrometer01'> = { cylD: 'caliper01', cylH: 'caliper01', ballD: 'micrometer01' };
export const DIM_TARGET: Record<Dim, { part: string; dimension: 'd' | 'h' }> = { cylD: { part: 'metalCyl01', dimension: 'd' }, cylH: { part: 'metalCyl01', dimension: 'h' }, ballD: { part: 'steelBall01', dimension: 'd' } };

export interface VectorRow {
  /** Fuerza importada del registro de equilibrio (masa rotulada en g o lectura del dinamómetro en N, y ángulo). */
  mass: Entry;
  angle: Entry;
  F: string;
  Fx: string;
  Fy: string;
}

export const CALC_FIELDS = ['volGeom', 'volDisp', 'rho', 'rhoSI', 'relErr'] as const;
export type CalcField = (typeof CALC_FIELDS)[number];
export const CALC_UNIT: Record<CalcField, string> = { volGeom: 'cm³', volDisp: 'cm³', rho: 'g/cm³', rhoSI: 'kg/m³', relErr: '%' };

export const VEC_FIELDS = ['Rx', 'Ry', 'R', 'thetaR', 'equilibrant', 'residual', 'dot12', 'cross12', 'unitX', 'unitY'] as const;
export type VecField = (typeof VEC_FIELDS)[number];
export const VEC_UNIT: Record<VecField, string> = { Rx: 'N', Ry: 'N', R: 'N', thetaR: '°', equilibrant: '°', residual: 'N', dot12: 'N²', cross12: 'N²', unitX: '', unitY: '' };

export const QUESTIONS_F = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF = (typeof QUESTIONS_F)[number];

export interface F101Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF, InstrumentRow>;
  zeros: { caliper: Entry; micrometer: Entry; standard: Entry };
  dims: Record<Dim, Entry[]>;
  means: Record<Dim, Entry>;
  masses: { cyl: Entry; ball: Entry };
  volumes: { initial: Entry; final: Entry };
  calc: Record<CalcField, Entry>;
  /** Registro de equilibrio importado (`q…`). */
  equilibriumId: string | null;
  vectors: VectorRow[];
  vec: Record<VecField, string>;
  /** Lectura independiente para el contraste: captura del sensor (`s…`) o dinamómetro (`f…`). */
  contrastId: string | null;
  contrastText: string;
  analysis: Record<QuestionF, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
const vrow = (): VectorRow => ({ mass: entry(), angle: entry(), F: '', Fx: '', Fy: '' });

export function emptyF101Notebook(): F101Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F101Notebook['instruments'],
    zeros: { caliper: entry(), micrometer: entry(), standard: entry() },
    dims: { cylD: [entry(), entry(), entry()], cylH: [entry(), entry(), entry()], ballD: [entry(), entry(), entry()] },
    means: { cylD: entry(), cylH: entry(), ballD: entry() },
    masses: { cyl: entry(), ball: entry() },
    volumes: { initial: entry(), final: entry() },
    calc: Object.fromEntries(CALC_FIELDS.map((k) => [k, entry()])) as F101Notebook['calc'],
    equilibriumId: null,
    vectors: [vrow(), vrow(), vrow()],
    vec: Object.fromEntries(VEC_FIELDS.map((k) => [k, ''])) as F101Notebook['vec'],
    contrastId: null,
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F.map((q) => [q, ''])) as F101Notebook['analysis'],
    closure: '',
    history: [],
  };
}

/** Lee un número escrito con coma o punto (y notación científica). */
export function parseNum(s: string): number {
  const m = /-?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/i.exec((s ?? '').replace(/\s/g, '').replace(/×10\^?/, 'e'));
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

export const isNum = (s: string) => Number.isFinite(parseNum(s));
/** Respuesta abierta con contenido (heurística transparente; la valoración final es del docente). */
export const answered = (s: string) => s.trim().length > 25;
export const answeredCount = (nb: F101Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
