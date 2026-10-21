/**
 * Libreta de la práctica B01 (§12): ocho cuadros y siete preguntas. Las filas de microscopía, láminas fijas y
 * estereoscopía IMPORTAN una observación propia del intento (`observationId`): el objetivo, el ocular, el zoom y las
 * estructuras visibles vienen del registro, no se escriben a mano. El aumento total, las estructuras señaladas, las
 * funciones de las partes y las respuestas son del estudiante.
 */
import { MICROSCOPE_PARTS, type MicroscopePart } from '../../simulation/instruments/optical/microscope-types';
import { STEREO_PARTS, type StereoPart } from '../../simulation/instruments/optical/stereo-types';
import type { StructureId } from '../../simulation/specimens/assets';

export interface PartRow {
  action: string;
  function: string;
}

export interface MicroRow {
  observationId: string | null;
  /** Muestra que el estudiante dice haber observado (E62). */
  specimen: '' | 'elodea' | 'fixed' | 'leaf' | 'insect';
  totalMag: string;
  region: string;
  structures: StructureId[];
}

export interface FixedRow {
  observationId: string | null;
  label: string;
  slot: string;
  description: string;
  returned: boolean;
}

export interface StereoRow {
  observationId: string | null;
  light: '' | 'incident' | 'transmitted' | 'both';
  structures: StructureId[];
}

export const QUESTIONS_B01 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;
export type QuestionB01 = (typeof QUESTIONS_B01)[number];

export interface B01Notebook {
  attemptId: string;
  parts: Record<MicroscopePart, PartRow>;
  stereoParts: Record<StereoPart, PartRow>;
  prep: { specimen: '' | 'elodea'; cutType: '' | 'none' | 'fragment'; waterMl: string; cover: '' | 'angled' | 'flat' | 'none'; incidents: string };
  micro: MicroRow[];
  fixed: FixedRow[];
  stereo: { leaf: StereoRow; insect: StereoRow };
  comparison: { fov: string; depth: string; purpose: string };
  incidents: { error: string; consequence: string; recovery: string; inventory: string };
  calc: { mag4: string; mag10: string; mag40: string; fov4: string; fov10: string; fov40: string };
  analysis: Record<QuestionB01, string>;
  history: Array<{ t: number; field: string; from: string; to: string }>;
}

const part = (): PartRow => ({ action: '', function: '' });
export const microRow = (): MicroRow => ({ observationId: null, specimen: '', totalMag: '', region: '', structures: [] });
export const fixedRow = (): FixedRow => ({ observationId: null, label: '', slot: '', description: '', returned: false });
const stereoRow = (): StereoRow => ({ observationId: null, light: '', structures: [] });

export function emptyB01Notebook(attemptId = ''): B01Notebook {
  return {
    attemptId,
    parts: Object.fromEntries(MICROSCOPE_PARTS.map((p) => [p, part()])) as B01Notebook['parts'],
    stereoParts: Object.fromEntries(STEREO_PARTS.map((p) => [p, part()])) as B01Notebook['stereoParts'],
    prep: { specimen: '', cutType: '', waterMl: '', cover: '', incidents: '' },
    micro: [microRow(), microRow(), microRow()],
    fixed: [fixedRow()],
    stereo: { leaf: stereoRow(), insect: stereoRow() },
    comparison: { fov: '', depth: '', purpose: '' },
    incidents: { error: '', consequence: '', recovery: '', inventory: '' },
    calc: { mag4: '', mag10: '', mag40: '', fov4: '', fov10: '', fov40: '' },
    analysis: Object.fromEntries(QUESTIONS_B01.map((q) => [q, ''])) as B01Notebook['analysis'],
    history: [],
  };
}

export function parseNum(s: string): number {
  const t = (s ?? '').trim().replace(/\s/g, '').replace(/[xX×]$/, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}

export const answered = (s: string) => (s ?? '').trim().length > 25;
export const answeredCount = (nb: B01Notebook) => (Object.values(nb.analysis) as string[]).filter(answered).length;
