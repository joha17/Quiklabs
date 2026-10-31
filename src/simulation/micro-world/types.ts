/**
 * Mundo de la práctica B07 «Microbiología en evidencia: medios, colonias y tinción de Gram» (§6.2). REUTILIZA el mundo
 * de B06 (microscopio, caja de láminas, aceite, marcas y capturas) y agrega fichas de medios, placas selladas con su
 * disposición de colonias, visor calibrado, trazado digital, frotis simulados y tinción por fases. Todo es virtual:
 * no hay cultivo, incubación ni llama. JSON puro y serializable.
 */
import type { DivWorld } from '../div-world/types';
import type { GramClass, MediumId, PlateProfile, StreakMetrics } from './model';

export type StainPhase = 'primary' | 'mordant' | 'decolorizer' | 'counterstain';
export const STAIN_PHASES: StainPhase[] = ['primary', 'mordant', 'decolorizer', 'counterstain'];
export const STAIN_BOTTLE: Record<StainPhase, string> = { primary: 'stP', mordant: 'stM', decolorizer: 'stD', counterstain: 'stC' };
export type Technique = 'fourZone' | 'lawn' | 'single';

export interface MicroParams {
  stainDropMl: number;
  washMl: number;
  streakOverlapThreshold: number;
  coverageMin: number;
  coverageMax: number;
  /** Índice de decoloración adimensional a partir del cual el positivo ya no se distingue. */
  decolorOverU: number;
  /** Retención que separa una lectura violeta de una rosada en la ilustración. */
  retentionViolet: number;
  /** Secado virtual del frotis (s del mundo; dato de simulación, no un tiempo de laboratorio). */
  dryVirtualS: number;
  mmPerPx: number;
  uPx: number;
  uScaleMmPerPx: number;
  imagePx: number;
}

export interface PlateState {
  medium: MediumId;
  profile: PlateProfile;
  assigned: boolean;
  control: boolean;
  restricted: boolean;
  /** Rótulo visible (en S15 no coincide con el medio real). */
  label: string;
}

export interface ColonyReading {
  id: string;
  tick: number;
  plateId: string;
  colonyId: string;
  assetRef: string;
}

export interface ColonyMeasure {
  id: string;
  tick: number;
  plateId: string;
  colonyId: string | null;
  px: number;
  mmPerPx: number;
  mm: number;
  uMm: number;
  /** Fallos que invalidan la cifra: dos colonias, recorte sin recalibrar. */
  valid: boolean;
  hiddenEdge: boolean;
}

export interface StreakTrial extends StreakMetrics {
  id: string;
  tick: number;
  technique: Technique;
  strokes: number[][][];
}

export interface Smear {
  plateId: string;
  colonyId: string;
  declaredPlateId: string;
  gram: GramClass;
  coverage01: number;
  thick: boolean;
  sparse: boolean;
  mixed: boolean;
  /** Tiempo del mundo en que queda seco; `prematureDry` si se declaró seco antes. */
  dryAt: number;
  prematureDry: boolean;
  phases: StainPhase[];
  decolorU: number | null;
  rinsed: boolean[];
  invalidOrder: boolean;
  washMissed: boolean;
  ml: Partial<Record<StainPhase, number>>;
}

export interface MicroState {
  plates: Record<string, PlateState>;
  /** Medios inspeccionados y lo declarado (la evaluación los contrasta con la ficha). */
  inspected: string[];
  classified: Record<string, { consistency: string; func: string }>;
  labels: Record<string, string>;
  mediaCommitted: boolean;
  selectedPlate: string | null;
  platesViewed: string[];
  viewer: { zoom: number; calibratedZoom: number };
  loop: { plateId: string; colonyId: string } | null;
  readings: ColonyReading[];
  measures: ColonyMeasure[];
  trials: StreakTrial[];
  methodsCompared: boolean;
  smears: Record<string, Smear>;
  bottles: Record<string, number>;
  ledger: Record<string, { initialMl: number; wasteMl: number }>;
  immersionDirty: boolean;
  hypotheses: Array<{ sampleCode: string; observationId: string; interpretation: string }>;
  scaleAvailable: boolean;
  /** Recursos autorizados del curso (lo demás se rechaza). */
  assetScope: string[];
  seq: number;
}

export interface MicroWorld extends DivWorld {
  micro: MicroState;
}
