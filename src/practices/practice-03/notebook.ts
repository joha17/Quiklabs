/**
 * Libreta digital de la Práctica 3 (§17): Cuadro 3.2, Cuadro 3.3, preguntas e incógnita.
 * Guarda observaciones propias; nunca se completa sola con las respuestas correctas.
 */
import { SOLUTION_ROWS, type SolutionRow } from './definition';

export const FLAME_ROWS = ['initial', 'capsule1', 'airOpen', 'capsule2'] as const;
export type FlameRow = (typeof FLAME_ROWS)[number];

export const FLAME_COLORS = ['amarillo', 'amarillo_anaranjado', 'amarilla_base_azul', 'azul', 'azul_palido', 'incolora'] as const;
export const FLAME_SHAPES = ['irregular', 'dos_conos', 'un_cono', 'levantada'] as const;
export const LUMINOSITY = ['luminosa', 'poco_luminosa', 'no_luminosa'] as const;
export const SOOT = ['negro', 'gris_tenue', 'no'] as const;

export const SOLUTION_COLORS = ['incolora', 'azul_verdosa_palida', 'amarillenta', 'otro'] as const;
export const EMISSION_COLORS = [
  'amarillo', 'amarillo_anaranjado', 'anaranjado', 'rojo_anaranjado', 'rojo', 'carmin', 'lila', 'violeta', 'azul', 'verde_azulado',
  'verde', 'amarillo_verdoso', 'oscura', 'sin_cambio',
] as const;
export const INTENSITY = ['intensa_persistente', 'intensa_breve', 'moderada', 'debil', 'no_concluyente'] as const;
export const CONFIDENCE = ['alta', 'media', 'baja'] as const;

export interface HistoryEntry {
  t: number;
  field: string;
  from: string;
  to: string;
}

export interface Row32 {
  color: string;
  shape: string;
  luminosity: string;
  soot: string;
  interpretation: string;
  updatedAt: number | null;
}

export interface Row33 {
  solutionColor: string;
  noFilter: string;
  filter: string;
  intensity: string;
  observations: string;
  updatedAt: number | null;
}

export interface UnknownAnswer {
  identity: string;
  justification: string;
  confidence: string;
}

export interface P3Notebook {
  table32: Record<FlameRow, Row32>;
  table33: Record<SolutionRow, Row33>;
  questions: { q1: string; q2: string; q3: string; q4: string; q5: string; q6: string; q7: string };
  unknown: UnknownAnswer & { initial: (UnknownAnswer & { t: number }) | null; corrections: number };
  history: HistoryEntry[];
}

const row32 = (): Row32 => ({ color: '', shape: '', luminosity: '', soot: '', interpretation: '', updatedAt: null });
const row33 = (): Row33 => ({ solutionColor: '', noFilter: '', filter: '', intensity: '', observations: '', updatedAt: null });

export function emptyP3Notebook(): P3Notebook {
  return {
    table32: Object.fromEntries(FLAME_ROWS.map((k) => [k, row32()])) as Record<FlameRow, Row32>,
    table33: Object.fromEntries(SOLUTION_ROWS.map((k) => [k, row33()])) as Record<SolutionRow, Row33>,
    questions: { q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '' },
    unknown: { identity: '', justification: '', confidence: '', initial: null, corrections: 0 },
    history: [],
  };
}

export const filledRow32 = (r: Row32, row: FlameRow) => !!(r.color && r.shape && r.luminosity && (row === 'initial' || row === 'airOpen' || r.soot));
export const filledRow33 = (r: Row33) => !!(r.solutionColor && r.noFilter && r.filter && r.intensity);

/** Partes del mechero (§6.1) en el orden de la guía. */
export const BURNER_PARTS = ['base', 'gasInlet', 'hose', 'needleValve', 'airInlets', 'airCollar', 'barrel', 'mouth', 'tableValve'] as const;
export type BurnerPart = (typeof BURNER_PARTS)[number];
