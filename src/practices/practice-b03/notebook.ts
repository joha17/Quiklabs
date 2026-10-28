/**
 * Libreta de la práctica B03 (§12): seis cuadros y diez preguntas. Las celdas de medida IMPORTAN una lectura del
 * propio intento (`readingId`): instrumento, valor, unidad y momento vienen del registro; los cálculos (ΔV, flujo,
 * π) y las interpretaciones los escribe el estudiante y se contrastan con SUS lecturas, no con un resultado ideal.
 */
import type { StructureId } from '../../simulation/specimens/assets';
import type { MembraneMaterial } from '../../simulation/perm-world/types';

export type Passage = '' | 'pass' | 'retain' | 'unknown';
export type Treatment = '' | 'water' | 'nacl-0.9' | 'nacl-5';
export type Condition = '' | 'turgid' | 'plasmolyzed' | 'inconclusive';

export interface DiffusionRow {
  readingId: string | null;
  /** Concentración calculada por el estudiante: solo es evaluable con curva de calibración (PERM20). */
  concentration: string;
  note: string;
}

export interface AssayRow {
  /** Rótulo del tubo (`A-Biuret`, controles…); la lectura importada debe ser de un tubo con ese rótulo. */
  label: string;
  readingId: string | null;
  interpretation: '' | 'positive' | 'negative' | 'ambiguous';
}

export interface MicroRow {
  observationId: string | null;
  treatment: Treatment;
  totalMag: string;
  condition: Condition;
  structures: StructureId[];
}

export const QUESTIONS_B03 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
export type QuestionB03 = (typeof QUESTIONS_B03)[number];

export interface B03Notebook {
  attemptId: string;
  membrane: {
    material: MembraneMaterial | '';
    code: string;
    areaCm2: string;
    integrity: '' | 'intact' | 'torn' | 'unknown';
    control: '' | 'sealed' | 'leak';
    permeability: '' | 'known' | 'unknown';
    hypothesis: { water: Passage; salt: Passage; protein: Passage; tracer: Passage };
  };
  diffusion: {
    rows: DiffusionRow[];
    /** A qué atribuye el estudiante el color del lado observado (PERM62 si dice difusión con una fuga registrada). */
    attribution: '' | 'diffusion' | 'leak' | 'none';
    conclusion: string;
  };
  dialysis: {
    rows: AssayRow[];
    /** Qué demuestra el AgNO₃ (PERM61 si dice «todos los minerales»). */
    silverShows: '' | 'chloride' | 'allMinerals';
    conclusion: string;
  };
  osmosis: {
    vA0: string | null;
    vB0: string | null;
    vAf: string | null;
    vBf: string | null;
    tempReadingId: string | null;
    durationMin: string;
    dVA: string;
    dVB: string;
    fluxMlMin: string;
    fluxMlS: string;
    uncertaintyMl: string;
    /** Diferencia de osmolaridad que usa el estudiante (Osm/L) y la presión osmótica que calcula (kPa). */
    deltaOsm: string;
    piKPa: string;
    explanation: string;
  };
  micro: {
    rows: MicroRow[];
    /** Afirmación sobre el 0,9 % (PERM60 si se declara isotónico para cualquier célula). */
    iso09: '' | 'isotonic' | 'depends';
  };
  balance: { water: string; solutes: string; notSelective: string };
  analysis: Record<QuestionB03, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const diffusionRow = (): DiffusionRow => ({ readingId: null, concentration: '', note: '' });
export const microRow = (): MicroRow => ({ observationId: null, treatment: '', totalMag: '', condition: '', structures: [] });

export function emptyB03Notebook(attemptId = ''): B03Notebook {
  return {
    attemptId,
    membrane: { material: '', code: '', areaCm2: '', integrity: '', control: '', permeability: '', hypothesis: { water: '', salt: '', protein: '', tracer: '' } },
    diffusion: { rows: [diffusionRow(), diffusionRow(), diffusionRow(), diffusionRow()], attribution: '', conclusion: '' },
    dialysis: { rows: ['A-Biuret', 'A-Ag', 'B-Biuret', 'B-Ag', 'blank', 'pos-protein', 'pos-chloride'].map((label) => ({ label, readingId: null, interpretation: '' as const })), silverShows: '', conclusion: '' },
    osmosis: { vA0: null, vB0: null, vAf: null, vBf: null, tempReadingId: null, durationMin: '', dVA: '', dVB: '', fluxMlMin: '', fluxMlS: '', uncertaintyMl: '', deltaOsm: '', piKPa: '', explanation: '' },
    micro: { rows: [microRow(), microRow(), microRow()], iso09: '' },
    balance: { water: '', solutes: '', notSelective: '' },
    analysis: Object.fromEntries(QUESTIONS_B03.map((q) => [q, ''])) as B03Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B03Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
