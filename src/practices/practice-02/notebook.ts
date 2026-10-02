/**
 * Libreta digital (§11): Cuadro 2.1, Cuadro 2.2 y actividades. Datos puros (serializables).
 */
export const SUBSTANCE_ROWS = ['Zn', 'C', 'S', 'NaCl', 'sacarosa', 'aceite'] as const;
export type RowKey = (typeof SUBSTANCE_ROWS)[number];

export const CLASSIFICATIONS = ['ELEMENT', 'COMPOUND', 'HOMOGENEOUS_MIXTURE', 'HETEROGENEOUS_MIXTURE'] as const;
export const STATES = ['SOLID', 'LIQUID', 'GAS'] as const;
export const COLORS = ['gris_plateado', 'gris', 'gris_oscuro', 'negro', 'amarillo', 'amarillo_palido', 'blanco', 'incoloro', 'otro'] as const;
export const ODORS = ['inodoro', 'casi_inodoro', 'tenue', 'fuerte'] as const;
export const SOLUBILITY = ['soluble', 'insoluble', 'inmiscible', 'no_concluyente'] as const;
export const MIXTURE_TYPES = ['HOMOGENEOUS_MIXTURE', 'HETEROGENEOUS_MIXTURE', 'COMPOUND', 'ELEMENT'] as const;

export interface HistoryEntry {
  t: number;
  field: string;
  from: string;
  to: string;
}

export interface Row21 {
  formula: string;
  classification: string;
  state: string;
  color: string;
  odor: string;
  solubility: string;
  evidence: string;
  updatedAt: number | null;
}

export interface Row22 {
  observations: string;
  massG: string;
  appearance: string;
  updatedAt: number | null;
}

export interface NotebookState {
  table21: Record<RowKey, Row21>;
  table22: { EVAPORATION: Row22; CRYSTALLIZATION: Row22 };
  activities: {
    a1: { arenaSal: string; aguaArena: string; salAgua: string };
    a2: { destilacion: string; decantacion: string; filtracion: string; cristalizacion: string; evaporacion: string };
    a3: string;
    a4: string;
    a5: string;
  };
  history: HistoryEntry[];
}

const emptyRow21 = (): Row21 => ({ formula: '', classification: '', state: '', color: '', odor: '', solubility: '', evidence: '', updatedAt: null });
const emptyRow22 = (): Row22 => ({ observations: '', massG: '', appearance: '', updatedAt: null });

export function emptyNotebook(): NotebookState {
  return {
    table21: Object.fromEntries(SUBSTANCE_ROWS.map((k) => [k, emptyRow21()])) as Record<RowKey, Row21>,
    table22: { EVAPORATION: emptyRow22(), CRYSTALLIZATION: emptyRow22() },
    activities: {
      a1: { arenaSal: '', aguaArena: '', salAgua: '' },
      a2: { destilacion: '', decantacion: '', filtracion: '', cristalizacion: '', evaporacion: '' },
      a3: '',
      a4: '',
      a5: '',
    },
    history: [],
  };
}

/** Respuestas de referencia de la fila (para la evaluación, nunca se muestran antes de entregar). */
export const ROW_TRUTH: Record<RowKey, { substance: string; formula: string[]; classification: string; state: string }> = {
  Zn: { substance: 'Zn', formula: ['zn'], classification: 'ELEMENT', state: 'SOLID' },
  C: { substance: 'GRAPHITE', formula: ['c'], classification: 'ELEMENT', state: 'SOLID' },
  S: { substance: 'S8', formula: ['s', 's8', 's₈'], classification: 'ELEMENT', state: 'SOLID' },
  NaCl: { substance: 'NaCl', formula: ['nacl'], classification: 'COMPOUND', state: 'SOLID' },
  sacarosa: { substance: 'SUCROSE', formula: ['c12h22o11', 'c₁₂h₂₂o₁₁'], classification: 'COMPOUND', state: 'SOLID' },
  aceite: { substance: 'OIL', formula: ['mezcla', 'mezcla de triglicéridos', 'mezcla de trigliceridos', 'mezcla de hidrocarburos', '—', '-', 'no aplica', 'n/a'], classification: 'HOMOGENEOUS_MIXTURE', state: 'LIQUID' },
};

export function filledRow21(r: Row21): boolean {
  return !!(r.formula && r.classification && r.state && r.color && r.odor && r.solubility);
}
