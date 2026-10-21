/**
 * Estado del mundo de la Práctica 9 (identificación de cationes, §6.1). Datos puros, JSON serializables y
 * deterministas. Toda la materia está en MOLES por especie y por compartimento (líquido y sólido de cada recipiente,
 * carga del asa y su residuo, pipeta, goteros, muestra del soporte de llama, mesada, residuos y conducto de la campana);
 * la conservación se verifica por elementos y la electroneutralidad por la carga (§3.3, §6.4).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { AnalyticalBalanceParams, AnalyticalBalanceState } from '../instruments/analytical-balance';
import type { Element, Mol, SpeciesId } from './species';
import type { ColorCategory, EmitterId } from './emission-spectrum';
import type { VesselShape09 } from './geometry';

export type { Pose, Severity, SimEvent, Mol, SpeciesId, Element, ColorCategory, EmitterId };

export type P09ObjKind =
  | 'ppeTray' | 'rack' | 'tube' | 'cylinder' | 'beaker' | 'pipette' | 'dropperBottle' | 'bottle' | 'washBottle' | 'balance' | 'centrifuge'
  | 'hood' | 'emitter' | 'loop' | 'cleanCup' | 'watchGlass' | 'refractoryCup' | 'turbidimeter' | 'waste' | 'spectroCam';

export interface P09Object {
  id: string;
  kind: P09ObjKind;
  pose: Pose;
  /** 'bench', 'hand', 'pan', 'rack:i', 'cf:i', 'turb01', 'flame' (asa en la llama), 'flamePad' (soporte sobre el emisor), 'clean01', '<vesselId>'. */
  support: string;
  movable: boolean;
  label?: string;
  massG?: number;
}

export type SolidId = 'SrSO4(s)' | 'FeOH3(s)';

export interface Vessel09 {
  id: string;
  shape: VesselShape09;
  capacityMl: number;
  areaCm2: number;
  floorCm: number;
  liq: Mol;
  solid: Mol;
  /** Fracción de cada sólido que está en suspensión (el resto es el sedimento compacto, «pellet»). */
  suspended: Partial<Record<SolidId, number>>;
  capped?: boolean;
  /** Rótulo escrito por el estudiante (los frascos de reactivos traen su etiqueta impresa). */
  label?: string;
  stir01: number;
  /** Instante de la última adición de reactivo (para «mezclar» y «esperar», E28/E29). */
  lastReagentS: number;
  /** Se agitó después de la última adición. */
  mixedSinceReagent: boolean;
  tempC: number;
  /** Frascos y recipientes de los que vino el contenido (trazabilidad). */
  from: string[];
  /** Reactivos que entraron (para el diagrama y los errores de orden). */
  reagents: string[];
}

export interface PourState09 {
  sourceId: string;
  targetId: string | null;
  tiltDeg: number;
  transferredMl: number;
}

export interface PipetteState {
  content: Mol;
  /** Sólido aspirado (si la punta tocó el sedimento, E44). */
  solid: Mol;
  squeeze01: number;
  from: string[];
}

export interface LoopState {
  load: Mol;
  /** Residuo que queda en el alambre tras calentar (contaminación de la siguiente prueba, E13). */
  residue: Mol;
  /** Origen de la carga actual (para comparar soportes con la misma muestra). */
  root: string | null;
  from: string[];
  tempC: number;
}

export interface FlameState {
  ignited: boolean;
  ignitedAt: number | null;
  /** Emisión instantánea (mol/s que atraviesan la zona emisora) por emisor. */
  emitting: Partial<Record<EmitterId, number>>;
  /** Tensión térmica acumulada del vidrio de reloj virtual (E17). */
  glassStress: number;
  glassCracked: boolean;
}

export interface HoodState {
  fanOn: boolean;
  /** Altura de la mampara (cm desde la superficie de trabajo). */
  sashCm: number;
  /** Luz de observación LOCAL de la zona de análisis (%): 100 / 45 / 20. Nunca afecta la señalización. */
  lightPct: 100 | 45 | 20;
}

export interface CentrifugeState {
  lidClosed: boolean;
  rpm: number;
  targetRpm: number;
  spinUntil: number | null;
  /** Duración programada del último giro y tiempo efectivo a velocidad. */
  lastSpinS: number;
  lastSpinEndedAt: number | null;
}

export interface BalanceState09 extends AnalyticalBalanceState {
  powered: boolean;
  panIds: string[];
  tareSession: number;
}

export type ReadingKind09 = 'mass' | 'volume' | 'turbidity' | 'observation' | 'emission' | 'spectrum';

export interface SpectrumLine {
  nm: number;
  intensity: number;
}

export interface Reading09 {
  id: string;
  tick: number;
  t: number;
  kind: ReadingKind09;
  instrumentId: string;
  targetId: string;
  value: number;
  unit: 'g' | 'mL' | 'UT' | '' | 'u.a.';
  resolution: number;
  standardUncertainty: number;
  valid: boolean;
  qualityFlags: string[];
  trueValue: number;
  /** Observación cualitativa: color de llama percibido, sólido, etc. */
  category?: string;
  rgb?: [number, number, number];
  lines?: SpectrumLine[];
  snapshot: {
    support?: 'loop' | 'watchGlass' | 'refractoryCup';
    root?: string | null;
    /** Recipiente del que se cargó el soporte de llama. */
    source?: string | null;
    lightPct?: number;
    gain?: number;
    sinceIgnitionS?: number;
    /** Emisores presentes en la zona emisora (docente). */
    emitters?: EmitterId[];
    /** De dónde venía lo que emitía (carga de la muestra o residuo del soporte). */
    fromResidue?: EmitterId[];
    solids?: SolidId[];
    pellet?: boolean;
    ions?: SpeciesId[];
    volumeMl?: number;
  };
}

export interface SafetyState09 {
  ppe: { goggles: boolean; coat: boolean; gloves: boolean };
  block: { code: string; since: number } | null;
  incident: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface P09Params {
  dtS: number;
  ambientTempC: number;
  balance: AnalyticalBalanceParams;
  cylinderDivisionMl: number;
  /** Volumen nominal de gota (mL) y coeficiente de variación de los goteros `[VALIDAR]`. */
  dropMl: number;
  dropCV: number;
  kPrecipPerS: number;
  /** Sedimentación por gravedad y en la centrífuga (1/s a velocidad nominal) `[MODELO]`. */
  settleGravityPerS: number;
  settleCentrifugePerS: number;
  centrifugeRpm: number;
  /** Diferencia máxima de masa entre posiciones opuestas (g) `[VALIDAR]`. */
  maxRotorImbalanceG: number;
  /** Mampara: altura máxima de operación (cm) `[VALIDAR]`. */
  sashMaxCm: number;
  /** Carga del asa por inmersión (mL) y del vidrio/soporte por gota de pipeta. */
  loopLoadMl: number;
  loopTauS: number;
  glassTauS: number;
  cupTauS: number;
  residueFraction: number;
  glassStressMax: number;
  emissionNoise: number;
  spectrumNoiseFloor: number;
}

export interface P09World {
  schemaVersion: number;
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: P09Params;
  mode: string;
  objects: Record<string, P09Object>;
  vessels: Record<string, Vessel09>;
  pours: Record<string, PourState09>;
  pipette: PipetteState;
  loop: LoopState;
  flame: FlameState;
  hood: HoodState;
  centrifuge: CentrifugeState;
  balance: BalanceState09;
  /** Compartimentos externos: mesada (salpicaduras), conducto de la campana (lo vaporizado), bandeja de la campana. */
  outside: { bench: Mol; exhaust: Mol; hoodTray: Mol };
  readings: Record<string, Reading09>;
  readingOrder: string[];
  safety: SafetyState09;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  /** Composición de la muestra incógnita (se fija antes de la semilla, §7); solo el docente la ve. */
  unknown: { code: string; cations: Array<'Sr2+' | 'Fe3+' | 'K+' | 'Na+'> };
  ppe: boolean;
  initialElements: Record<Element, number>;
}
