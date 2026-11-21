/**
 * §12 — libreta de F11. Cuadros: hipótesis; instrumentos (resolución, u_B, estado de calibración); montaje (niveles del
 * tanque con cada líquido, presión en la superficie, masa y volumen de la salmuera de la probeta, peso del bloque en el
 * aire y masa del agua rebosada, importados); perfiles A y B ×5 (presión y cota importadas; h y p escritas); empuje ×5
 * (peso aparente e inmersión importados; V_sub, F_b y F_b prevista escritos); flotación ×3 (masa y calado importados;
 * densidad del objeto y fracciones sumergidas escritas); cálculos con incertidumbre; opción múltiple; contraste,
 * análisis y cierre. Los volúmenes y alturas grabados en los objetos son constantes del material, no datos brutos.
 */
import { answered, isNum, parseNum } from '../practice-f101/notebook';

export interface Entry {
  value: string;
  uncertainty: string;
  /** Lectura importada o null si se escribió a mano. */
  readingId: string | null;
}

export const INSTRUMENTS_F11 = ['probe', 'ruler', 'scale', 'dyn', 'balance', 'cylinder'] as const;
export type InstrumentF11 = (typeof INSTRUMENTS_F11)[number];

export interface InstrumentRow {
  resolution: string;
  uncertainty: string;
  status: string;
}

export const SETUP_FIELDS_F11 = ['LA', 'LB', 'p0', 'mCyl', 'VCyl', 'W', 'mOver'] as const;
export type SetupFieldF11 = (typeof SETUP_FIELDS_F11)[number];
export const SETUP_UNIT_F11: Record<SetupFieldF11, string> = { LA: 'cm', LB: 'cm', p0: 'kPa', mCyl: 'g', VCyl: 'mL', W: 'N', mOver: 'g' };
/** Lectura que corresponde a cada campo del montaje (tipo y objetivo). */
export const SETUP_SOURCE_F11: Record<SetupFieldF11, { kind: string; target: string }> = {
  LA: { kind: 'level', target: 'tank' }, LB: { kind: 'level', target: 'tank' }, p0: { kind: 'pressure', target: 'surface' }, mCyl: { kind: 'mass', target: 'cyl' },
  VCyl: { kind: 'volume', target: 'cyl' }, W: { kind: 'weight', target: 'air' }, mOver: { kind: 'mass', target: 'catch' },
};

/** Una cota de la sonda: presión y cota de la membrana importadas; h (m) y p (Pa) escritas. */
export interface PRow {
  pId: string | null;
  zId: string | null;
  h: string;
  p: string;
}

/** Una inmersión del bloque: peso aparente e inmersión importados; V_sub (cm³), F_b (N) y F_b prevista (N) escritos. */
export interface BuoyRow {
  fId: string | null;
  iId: string | null;
  Vsub: string;
  Fb: string;
  FbPred: string;
}

/** Un ensayo de flotación: masa y calado importados; ρ del objeto (kg/m³), fracción prevista y medida escritas. */
export interface FloatRow {
  mId: string | null;
  dId: string | null;
  rho: string;
  fPred: string;
  fMeas: string;
}

export const CALC_FIELDS_F11 = ['rhoA', 'rhoB', 'rhoCyl', 'FbDev'] as const;
export type CalcFieldF11 = (typeof CALC_FIELDS_F11)[number];
export const CALC_UNIT_F11: Record<CalcFieldF11, string> = { rhoA: 'kg/m³', rhoB: 'kg/m³', rhoCyl: 'kg/m³', FbDev: '%' };

export const QUESTIONS_F11 = ['q1', 'q2', 'q3', 'q4'] as const;
export type QuestionF11 = (typeof QUESTIONS_F11)[number];
/** Opción múltiple: qué le pasa al calado del bloque de madera si pasa del agua a la salmuera. */
export const MCQ_OPTIONS_F11 = ['less', 'same', 'more'] as const;

export const P_ROWS = 5;
export const BUOY_ROWS = 5;
export const FLOAT_ROWS = 3;

/** Volumen y altura grabados en cada objeto (constantes del material: no son datos brutos). */
export const OBJECT_LABELS_F11 = {
  float1: { V: 500, H: 5 },
  bottle1: { V: 424.1, H: 15 },
  alu1: { V: 500, H: 5, area: 100 },
} as const;

export interface F11Notebook {
  hypothesis: { question: string; prediction: string };
  instruments: Record<InstrumentF11, InstrumentRow>;
  setup: Record<SetupFieldF11, Entry>;
  pARows: PRow[];
  pBRows: PRow[];
  buoyRows: BuoyRow[];
  floatRows: FloatRow[];
  calc: Record<CalcFieldF11, Entry>;
  mcq: string;
  contrastText: string;
  analysis: Record<QuestionF11, string>;
  closure: string;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const entry = (): Entry => ({ value: '', uncertainty: '', readingId: null });
export const pRow = (): PRow => ({ pId: null, zId: null, h: '', p: '' });
export const buoyRow = (): BuoyRow => ({ fId: null, iId: null, Vsub: '', Fb: '', FbPred: '' });
export const floatRow = (): FloatRow => ({ mId: null, dId: null, rho: '', fPred: '', fMeas: '' });

export function emptyF11Notebook(): F11Notebook {
  return {
    hypothesis: { question: '', prediction: '' },
    instruments: Object.fromEntries(INSTRUMENTS_F11.map((k) => [k, { resolution: '', uncertainty: '', status: '' }])) as F11Notebook['instruments'],
    setup: Object.fromEntries(SETUP_FIELDS_F11.map((k) => [k, entry()])) as F11Notebook['setup'],
    pARows: Array.from({ length: P_ROWS }, pRow),
    pBRows: Array.from({ length: P_ROWS }, pRow),
    buoyRows: Array.from({ length: BUOY_ROWS }, buoyRow),
    floatRows: Array.from({ length: FLOAT_ROWS }, floatRow),
    calc: Object.fromEntries(CALC_FIELDS_F11.map((k) => [k, entry()])) as F11Notebook['calc'],
    mcq: '',
    contrastText: '',
    analysis: Object.fromEntries(QUESTIONS_F11.map((q) => [q, ''])) as F11Notebook['analysis'],
    closure: '',
    history: [],
  };
}

export { parseNum, isNum, answered };
export const answeredCountF11 = (nb: F11Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
