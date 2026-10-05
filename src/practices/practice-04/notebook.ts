/**
 * Libreta digital de la Práctica 4 (§21): neutralización, precipitaciones, redox, magnesio, ecuaciones (§15),
 * análisis y la sección conceptual de complejos (§25). Guarda observaciones propias con historial de correcciones;
 * nunca se completa sola con respuestas correctas.
 */
import { emptyEquation, type ChemEquation, type EqKind } from '../../simulation/chemistry/equation';
import { EXPERIMENT_REFS, type ExperimentId } from './reactions';

export const COLORS = [
  'incolora', 'rosa_palido', 'rosa', 'fucsia', 'amarillo_palido', 'amarilla', 'naranja', 'azul_palido', 'azul', 'verde_palido', 'verdosa',
  'blanca', 'marron_rojizo', 'gris', 'rojizo_cobre',
] as const;
export const DURING = ['remolinos_rosados', 'rosa_persistente', 'sin_cambio', 'precipitado', 'burbujas'] as const;
export const THERMAL_TYPES = ['exotermica', 'endotermica', 'sin_cambio'] as const;
export const IMMEDIATE = ['turbidez_blanca', 'precipitado_marron', 'precipitado_azul', 'burbujas', 'cambio_color', 'sin_cambio'] as const;
export const TEXTURE = ['fino_blanco', 'gelatinoso_floculento', 'granular_metalico', 'no_hay'] as const;
export const SUPERNATANT = ['incoloro', 'amarillo', 'azul', 'turbio'] as const;
export const LIMITING = ['Ca2+', 'CO3^2-', 'Fe3+', 'OH-', 'H+', 'equivalentes', 'Cu2+', 'Fe', 'Mg', 'O2'] as const;
export const SURFACE = ['brillante', 'oxidado_opaco', 'lijado'] as const;
export const METAL_CHANGE = ['deposito_rojizo', 'sin_cambio', 'oscurecido', 'burbujas'] as const;
export const COMBUSTION = ['luz_blanca_intensa', 'llama_amarilla', 'sin_ignicion', 'chispas_humo'] as const;
export const RESIDUE = ['polvo_blanco', 'gris_metalico', 'negro', 'sin_residuo'] as const;
export const WATER_RESULT = ['suspension_blanca', 'disolucion_transparente', 'burbujas', 'sin_cambio'] as const;
export const RX_TYPES = ['ACIDO_BASE', 'PRECIPITACION', 'REDOX', 'COMBUSTION', 'HIDRATACION'] as const;

export interface HistoryEntry {
  t: number;
  field: string;
  from: string;
  to: string;
}

export type EqSet = Partial<Record<EqKind, ChemEquation>>;

export interface NeutralRow {
  hclVolMl: string;
  hclConc: string;
  naohVolMl: string;
  naohConc: string;
  colorInitial: string;
  during: string;
  colorFinal: string;
  tInitial: string;
  tFinal: string;
  thermal: string;
  pH: string;
  type: string;
  notes: string;
}

export interface PrecipRow {
  reagents: string;
  immediate: string;
  texture: string;
  pptColor: string;
  supernatant: string;
  temperature: string;
  thermal: string;
  limiting: string;
  excess: string;
  type: string;
  notes: string;
}

export interface RedoxRow {
  metal: string;
  surface: string;
  colorInitial: string;
  colorFinal: string;
  metalChange: string;
  timeMin: string;
  oxidized: string;
  reduced: string;
  type: string;
  notes: string;
}

export interface MagnesiumRow {
  lengthCm: string;
  massG: string;
  combustion: string;
  residue: string;
  waterResult: string;
  phenolColor: string;
  typeCombustion: string;
  typeWater: string;
  notes: string;
}

export interface P4Notebook {
  A: NeutralRow;
  B1: PrecipRow;
  B2: PrecipRow;
  C1: RedoxRow;
  Mg: MagnesiumRow;
  eq: Record<ExperimentId, EqSet>;
  /** Iones espectadores marcados por ensayo (además del tachado en la iónica completa). */
  analysis: { q1: string; q2: string; q3: string; q4: string; q5: string; q6: string };
  complexes: { read: boolean; eq: ChemEquation; note: string };
  history: HistoryEntry[];
}

const neutral = (): NeutralRow => ({ hclVolMl: '', hclConc: '', naohVolMl: '', naohConc: '', colorInitial: '', during: '', colorFinal: '', tInitial: '', tFinal: '', thermal: '', pH: '', type: '', notes: '' });
const precip = (): PrecipRow => ({ reagents: '', immediate: '', texture: '', pptColor: '', supernatant: '', temperature: '', thermal: '', limiting: '', excess: '', type: '', notes: '' });

export function emptyP4Notebook(): P4Notebook {
  const eq = {} as Record<ExperimentId, EqSet>;
  for (const [id, ref] of Object.entries(EXPERIMENT_REFS)) {
    eq[id as ExperimentId] = Object.fromEntries(ref.kinds.map((k) => [k, emptyEquation()])) as EqSet;
  }
  return {
    A: neutral(),
    B1: precip(),
    B2: precip(),
    C1: { metal: '', surface: '', colorInitial: '', colorFinal: '', metalChange: '', timeMin: '', oxidized: '', reduced: '', type: '', notes: '' },
    Mg: { lengthCm: '', massG: '', combustion: '', residue: '', waterResult: '', phenolColor: '', typeCombustion: '', typeWater: '', notes: '' },
    eq,
    analysis: { q1: '', q2: '', q3: '', q4: '', q5: '', q6: '' },
    complexes: { read: false, eq: emptyEquation(), note: '' },
    history: [],
  };
}

export const filledNeutral = (r: NeutralRow) => !!(r.hclVolMl && r.naohVolMl && r.colorInitial && r.colorFinal && r.tInitial && r.tFinal && r.thermal);
export const filledPrecip = (r: PrecipRow) => !!(r.immediate && r.pptColor && r.supernatant && r.limiting);
export const filledRedox = (r: RedoxRow) => !!(r.metal && r.colorInitial && r.colorFinal && r.metalChange && r.oxidized && r.reduced);
export const filledMg = (r: MagnesiumRow) => !!(r.combustion && r.residue && r.waterResult && r.phenolColor);
