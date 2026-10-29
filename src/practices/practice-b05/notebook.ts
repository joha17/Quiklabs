/**
 * Libreta de la práctica B05 (§12): cuadros NB01–NB10 y diez preguntas. Las celdas de medida IMPORTAN una lectura del
 * propio intento (`readingId`: masa m*, volumen v*, temperatura t*, tiempo h*, pH p*, gas g*, absorbancia a*, color c*);
 * instrumento, valor, unidad, momento y lectura del cronómetro vienen del registro. Los cálculos (tasa inicial, mol de
 * O₂, balance, glucosilos, NADH) y las interpretaciones los escribe el estudiante y se contrastan con SUS lecturas.
 */
export const QUESTIONS_B05 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
export type QuestionB05 = (typeof QUESTIONS_B05)[number];

/** Rótulos de los tubos de la práctica (los elige el estudiante al rotular; el mundo usa su composición real). */
export const TUBE_LABELS_B05 = [
  'cat-base', 'cat-blank', 'cat-heat', 'cat-acid', 'cat-base-ph', 'amy', 'amy-ctrl',
  'L0', 'L1', 'L2', 'L3', 'B0', 'B3', 'Lc', 'Bc', 'adh-blank', 'adh-eth', 'adh-comp',
] as const;
export type TubeLabelB05 = (typeof TUBE_LABELS_B05)[number];

/** NB01: condiciones de partida de un tubo (lecturas importadas). */
export interface ConditionRow {
  label: string;
  massReadingId: string | null;
  tempReadingId: string | null;
  phReadingId: string | null;
  clockReadingId: string | null;
}

/** NB03: serie de gas de un tubo (lecturas g* del colector, cada una con su tiempo de cronómetro). */
export interface GasSeries {
  label: string;
  readingIds: Array<string | null>;
}

/** NB06: alícuota de amilasa con su lectura de color y el tiempo que el estudiante le asigna. */
export interface AssayRowB05 {
  label: string;
  readingId: string | null;
  timeS: string;
}

export interface B05Notebook {
  attemptId: string;
  hypothesis: { catalase: string; amylase: string; heat: '' | 'lowers' | 'raises' | 'none' };
  /** Lotes P1–P3 (§5): lecturas reales de masa, volumen y temperatura. */
  prep: { p1Mass: string | null; p1Water: string | null; p1Temp: string | null; p2Water: string | null; p2Temp: string | null; p3Mass: string | null; p3Water: string | null };
  conditions: ConditionRow[];
  /** NB02: qué tubo cumple cada papel de control (por rótulo). */
  controls: { blank: string; active: string; noEnzyme: string };
  gas: GasSeries[];
  /** NB04: tasa inicial, moles de O₂ y balance, escritos por el estudiante. */
  rate: {
    label: string;
    fromS: string;
    toS: string;
    rateMlS: string;
    rateMlMin: string;
    nO2Mmol: string;
    predictedO2Mmol: string;
    ventedIncluded: '' | 'yes' | 'no';
    attribution: '' | 'catalysis' | 'capture';
    ratePerG: string;
    normUnit: '' | 'gTissue' | 'mgEnzyme';
    uncertaintyMl: string;
  };
  /** NB05: tratamientos. */
  factors: { heatApparent: string; recovered: '' | 'yes' | 'no'; attribution: '' | 'ph' | 'temperature' | 'both' };
  amylase: { rows: AssayRowB05[]; benedictMeans: '' | 'reducing' | 'glucose'; lugolNegative: '' | 'complete' | 'notComplete' };
  /** NB07: unidades glucosilo iniciales del tubo activo (mmol) calculadas por el estudiante. */
  glucosyl: { initialMmol: string; note: string };
  /** NB08 (solo con ADH asignada). */
  adh: {
    blankReadingId: string | null;
    rows: Array<{ readingId: string | null }>;
    slope: string;
    nadhUM: string;
    pathCm: string;
    inhibitionType: '' | 'competitive' | 'noncompetitive' | 'undetermined';
    totalInhibition: '' | 'yes' | 'no';
    fehling: '' | 'specific' | 'nonspecific';
    iodoform: '' | 'exact' | 'qualitative';
    fehlingBlank: '' | 'needed' | 'notNeeded';
  };
  /** Gránulos de almidón de la papa (microscopio compartido). */
  micro: { observationId: string | null; structure: '' | 'starchGranules' | 'nuclei' | 'chloroplasts' };
  errors: string;
  analysis: Record<QuestionB05, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const conditionRow = (label = ''): ConditionRow => ({ label, massReadingId: null, tempReadingId: null, phReadingId: null, clockReadingId: null });
export const gasSeries = (label = ''): GasSeries => ({ label, readingIds: [null, null, null, null] });

export function emptyB05Notebook(attemptId = ''): B05Notebook {
  return {
    attemptId,
    hypothesis: { catalase: '', amylase: '', heat: '' },
    prep: { p1Mass: null, p1Water: null, p1Temp: null, p2Water: null, p2Temp: null, p3Mass: null, p3Water: null },
    conditions: ['cat-base', 'cat-heat', 'cat-acid', 'amy'].map(conditionRow),
    controls: { blank: '', active: '', noEnzyme: '' },
    gas: ['cat-base', 'cat-blank', 'cat-heat', 'cat-acid'].map(gasSeries),
    rate: { label: 'cat-base', fromS: '', toS: '', rateMlS: '', rateMlMin: '', nO2Mmol: '', predictedO2Mmol: '', ventedIncluded: '', attribution: '', ratePerG: '', normUnit: '', uncertaintyMl: '' },
    factors: { heatApparent: '', recovered: '', attribution: '' },
    amylase: { rows: ['L0', 'L1', 'L2', 'L3', 'B0', 'B3', 'Lc', 'Bc'].map((label) => ({ label, readingId: null, timeS: '' })), benedictMeans: '', lugolNegative: '' },
    glucosyl: { initialMmol: '', note: '' },
    adh: { blankReadingId: null, rows: [{ readingId: null }, { readingId: null }, { readingId: null }], slope: '', nadhUM: '', pathCm: '', inhibitionType: '', totalInhibition: '', fehling: '', iodoform: '', fehlingBlank: '' },
    micro: { observationId: null, structure: '' },
    errors: '',
    analysis: Object.fromEntries(QUESTIONS_B05.map((q) => [q, ''])) as B05Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B05Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
