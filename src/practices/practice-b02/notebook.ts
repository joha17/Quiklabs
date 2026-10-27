/**
 * Libreta de la práctica B02 (§12): hipótesis, preparación, atlas de plastidios, cuadros por muestra, rutas
 * opcionales, comparación, bitácora, figuras y diez preguntas integradoras. Las filas de observación IMPORTAN una
 * captura propia (`observationId`): objetivo, recurso y estructuras visibles vienen del registro; lo que el
 * estudiante señala, clasifica e interpreta es suyo y se contrasta con la evidencia de esa captura.
 */
import type { StructureId } from '../../simulation/specimens/assets';
import type { CellKind, StainId } from '../../simulation/specimens/thin-section';

export type Plastid = '' | 'chloroplast' | 'chromoplast' | 'amyloplast' | 'none';
export type Technique = '' | 'leaf' | 'cut' | 'scrape' | 'smear';

export interface HypothesisRow {
  material: CellKind | '';
  expected: Plastid | 'sclereids' | 'nucleus';
  reason: string;
}

export interface PrepRow {
  specimen: CellKind | '';
  technique: Technique;
  reagent: StainId | '';
  cover: '' | 'clean' | 'bubbles' | 'none';
  state: string;
}

export interface AtlasRow {
  observationId: string | null;
  /** Muestra que el estudiante dice haber observado. */
  specimen: CellKind | '';
  totalMag: string;
  plastid: Plastid;
  color: string;
  structures: StructureId[];
}

export interface FigureRow {
  observationId: string | null;
  specimen: CellKind | 'leaf' | 'insect' | 'fixed' | '';
  caption: string;
}

export const QUESTIONS_B02 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
export type QuestionB02 = (typeof QUESTIONS_B02)[number];

export interface B02Notebook {
  attemptId: string;
  hypotheses: HypothesisRow[];
  prep: PrepRow[];
  atlas: AtlasRow[];
  potato: { observationId: string | null; stained: '' | 'yes' | 'no'; grains: '' | 'visible' | 'notVisible'; interpretation: string };
  sclereids: {
    observationId: string | null;
    fruit: CellKind | '';
    region: string;
    walls: '' | 'thick' | 'thin';
    /** Qué demuestra la eosina (CEL25 si se toma como prueba de lignina). */
    eosinShows: '' | 'contrast' | 'lignin' | 'notUsed';
    /** Causa del engrosamiento según el estudiante (CEL51 si se atribuye a la señal de eosina). */
    wallCause: '' | 'secondaryWall' | 'eosinLignin' | 'unknown';
  };
  buccal: { observationId: string | null; stain: StainId | ''; smear: string; structures: StructureId[] };
  elodea: { observationId: string | null; totalMag: string; structures: StructureId[]; motion: '' | 'notShown' | 'observed' | 'needsVideo' };
  fixed: { observationId: string | null; slot: string; label: string; structures: StructureId[]; returned: boolean };
  stereo: { observationId: string | null; light: '' | 'incident' | 'transmitted' | 'both'; features: string };
  comparison: { plantAnimal: string; plastids: string; limits: string };
  log: { action: string; failure: string; correction: string; consequence: string };
  figures: FigureRow[];
  /** Escala física: sin calibración publicada debe quedar vacía (CEL54). */
  scaleUm: string;
  analysis: Record<QuestionB02, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

export const hypothesisRow = (): HypothesisRow => ({ material: '', expected: '', reason: '' });
export const prepRow = (): PrepRow => ({ specimen: '', technique: '', reagent: '', cover: '', state: '' });
export const atlasRow = (): AtlasRow => ({ observationId: null, specimen: '', totalMag: '', plastid: '', color: '', structures: [] });
export const figureRow = (): FigureRow => ({ observationId: null, specimen: '', caption: '' });

export function emptyB02Notebook(attemptId = ''): B02Notebook {
  return {
    attemptId,
    hypotheses: [hypothesisRow(), hypothesisRow(), hypothesisRow()],
    prep: [prepRow(), prepRow(), prepRow(), prepRow()],
    atlas: [atlasRow(), atlasRow(), atlasRow(), atlasRow()],
    potato: { observationId: null, stained: '', grains: '', interpretation: '' },
    sclereids: { observationId: null, fruit: '', region: '', walls: '', eosinShows: '', wallCause: '' },
    buccal: { observationId: null, stain: '', smear: '', structures: [] },
    elodea: { observationId: null, totalMag: '', structures: [], motion: '' },
    fixed: { observationId: null, slot: '', label: '', structures: [], returned: false },
    stereo: { observationId: null, light: '', features: '' },
    comparison: { plantAnimal: '', plastids: '', limits: '' },
    log: { action: '', failure: '', correction: '', consequence: '' },
    figures: [figureRow(), figureRow()],
    scaleUm: '',
    analysis: Object.fromEntries(QUESTIONS_B02.map((q) => [q, ''])) as B02Notebook['analysis'],
    history: [],
  };
}

export { parseNum } from '../practice-b01/notebook';

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B02Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
