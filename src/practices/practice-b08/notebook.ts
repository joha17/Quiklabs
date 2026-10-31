/**
 * Libreta de la práctica B08 (§12): tablas A–E y diez preguntas. Las filas IMPORTAN lecturas propias (`baselineId`,
 * `finalId`, `readingId`); lo que el estudiante calcula e interpreta se contrasta con esa evidencia, nunca con un ideal.
 */
export const QUESTIONS_B08 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
export type QuestionB08 = (typeof QUESTIONS_B08)[number];

export interface PrepRow {
  tubeId: string;
  treatment: '' | 'light' | 'dark';
  biomass: string;
  volume: string;
  dic: string;
  light: string;
  tempC: string;
  sealed: boolean;
}

export interface GasRow {
  tubeId: string;
  baselineId: string | null;
  finalId: string | null;
  initial: string;
  final: string;
  dh: string;
  minutes: string;
  hours: string;
  slope: string;
  slopeUnit: '' | 'mm/h' | 'umol/min';
  radiusMm: string;
  noCalibration: boolean;
  dvMl: string;
  umol: string;
}

export interface BtbRow {
  tubeId: string;
  plant: boolean;
  light: boolean;
  dic: string;
  btb: string;
  ph: string;
  readingId0: string | null;
  readingIdEnd: string | null;
  color0: string;
  colorMid: string;
  colorEnd: string;
  interpretation: string;
}

export interface BandRow {
  bandId: string;
  readingId: string | null;
  frontReadingId: string | null;
  color: string;
  origin: string;
  center: string;
  front: string;
  dBand: string;
  dFront: string;
  rf: string;
  u: string;
  identity: string;
  composite: boolean;
  anomaly: boolean;
}

export interface B08Notebook {
  attemptId: string;
  prereport: { hypothesis: string; variable: string; precautions: string };
  prep: PrepRow[];
  gas: GasRow[];
  gross: { net: string; dark: string; gross: string; unit: string; assumptionStated: boolean; humidityCorrected: boolean };
  btb: BtbRow[];
  extraction: { mass: string; volumes: string; grind: string; phase: string; aspect: string; lightNote: string };
  bands: BandRow[];
  /** Afirmaciones que el estudiante hace (cada una se puede contrastar con lo que el método demuestra). */
  claims: {
    btbMeasuresGlucose: boolean;
    dicIsFreeCo2: boolean;
    darkEqualsLightResp: boolean;
    absentPigment: boolean;
    identityFromColor: boolean;
    photoAsMetric: boolean;
  };
  synthesis: { hypothesisResult: string; conclusion: string; limits: string };
  open: { notes: string; limitations: string; errors: string };
  analysis: Record<QuestionB08, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const prepRow = (tubeId: string): PrepRow => ({ tubeId, treatment: '', biomass: '', volume: '', dic: '', light: '', tempC: '', sealed: false });
export const gasRow = (tubeId: string): GasRow => ({ tubeId, baselineId: null, finalId: null, initial: '', final: '', dh: '', minutes: '', hours: '', slope: '', slopeUnit: '', radiusMm: '', noCalibration: false, dvMl: '', umol: '' });
export const btbRow = (tubeId: string): BtbRow => ({ tubeId, plant: false, light: false, dic: '', btb: '', ph: '', readingId0: null, readingIdEnd: null, color0: '', colorMid: '', colorEnd: '', interpretation: '' });
export const bandRow = (): BandRow => ({ bandId: '', readingId: null, frontReadingId: null, color: '', origin: '', center: '', front: '', dBand: '', dFront: '', rf: '', u: '', identity: '', composite: false, anomaly: false });

export function emptyB08Notebook(attemptId = ''): B08Notebook {
  return {
    attemptId,
    prereport: { hypothesis: '', variable: '', precautions: '' },
    prep: ['gL', 'gD'].map(prepRow),
    gas: ['gL', 'gD'].map(gasRow),
    gross: { net: '', dark: '', gross: '', unit: '', assumptionStated: false, humidityCorrected: false },
    btb: ['bN', 'bL', 'bD'].map(btbRow),
    extraction: { mass: '', volumes: '', grind: '', phase: '', aspect: '', lightNote: '' },
    bands: [bandRow(), bandRow(), bandRow(), bandRow()],
    claims: { btbMeasuresGlucose: false, dicIsFreeCo2: false, darkEqualsLightResp: false, absentPigment: false, identityFromColor: false, photoAsMetric: false },
    synthesis: { hypothesisResult: '', conclusion: '', limits: '' },
    open: { notes: '', limitations: '', errors: '' },
    analysis: Object.fromEntries(QUESTIONS_B08.map((q) => [q, ''])) as B08Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B08Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
