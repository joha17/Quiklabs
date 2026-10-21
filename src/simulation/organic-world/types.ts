/**
 * Estado del mundo de la Práctica 8 (síntesis orgánica comparativa, §5.1). Datos puros, JSON serializables y
 * deterministas. Toda la materia está en MOLES por especie y por compartimento (líquido y sólido de cada recipiente,
 * película exterior, carga de herramientas, muestra del analizador, mesada, extracción de la campana); la masa es
 * Σ n·M y la conservación se verifica por elementos C/H/O/Na/P/S (§3.1).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { AnalyticalBalanceParams, AnalyticalBalanceState } from '../instruments/analytical-balance';
import type { Element, Mol, SpeciesId } from '../organic-chemistry/species';
import type { RouteId } from '../organic-chemistry/stoichiometry';
import type { VesselShape08 } from './geometry';

export type { Pose, Severity, SimEvent, Mol, SpeciesId, RouteId, Element };

export type P08ObjKind =
  | 'ppeTray' | 'balance' | 'watchGlass' | 'spatula' | 'dropper' | 'cylinder' | 'washBottle' | 'bottle' | 'jar' | 'beaker' | 'erlenmeyer'
  | 'roundFlask' | 'corkRing' | 'clamp' | 'plate' | 'bath' | 'thermometer' | 'condenser' | 'iceBath' | 'sepFunnel' | 'funnelRing'
  | 'buchner' | 'kitasato' | 'filterPaper' | 'vacuumPump' | 'oven' | 'fractionModule' | 'vial' | 'analyzer' | 'mpApparatus' | 'burner'
  | 'plasticCup' | 'waste';

export interface P08Object {
  id: string;
  kind: P08ObjKind;
  pose: Pose;
  /** 'bench', 'hand', 'pan', '<vesselId>' (herramienta dentro), 'bath01', 'ice01', 'cork01', 'ring01', 'kitasato', 'buchner', 'oven01', 'rf' (condensador o termómetro en el balón). */
  support: string;
  movable: boolean;
  label?: string;
  massG?: number;
}

export interface Vessel08 {
  id: string;
  shape: VesselShape08;
  capacityMl: number;
  brimMl: number;
  areaCm2: number;
  floorCm: number;
  /** Contenido líquido (todas las fases juntas; el reparto se deriva en el equilibrio). */
  liq: Mol;
  /** Sólido: cristales, precursor sin disolver, desecante con su agua de hidratación. */
  solid: Mol;
  /** Película de líquido por FUERA del recipiente (pesa y se pierde al moverlo, ORG10). */
  ext: Mol;
  /** Gas en el espacio de cabeza (CO₂ del lavado con bicarbonato). */
  gas: Mol;
  tempC: number;
  /** Agitación (0–1) del contenido: varilla, agitador magnético o sacudida. */
  stir01: number;
  /** Emulsión pasajera tras agitar dos fases (0–1). */
  emulsion01: number;
  capped?: boolean;
  /** Embudo de separación: tapón y llave (0–1). */
  stoppered?: boolean;
  valve01?: number;
  receiverId?: string | null;
  lastAddS: number;
  history: SpeciesId[];
  from: string[];
}

export interface Pour08 {
  sourceId: string;
  targetId: string | null;
  tiltDeg: number;
  startedS: number;
  transferredG: number;
}

export interface DropperState08 {
  content: Mol;
  squeeze01: number;
  from: string[];
}

export interface SpatulaState08 {
  load: Mol;
  residue: Mol;
  from: string[];
}

export interface PlateState {
  on: boolean;
  setpointC: number;
  /** Agitador magnético (0–1). */
  stir01: number;
  bathTempC: number;
}

export interface RefluxState {
  /** El condensador está sobre el balón y su agua de refrigeración circula. */
  attached: boolean;
  waterOn: boolean;
  /** Sellado de las uniones (S07: fuga). */
  leakFraction: number;
}

export interface ThermometerState08 {
  where: string;
  inLiquid: boolean;
  shownC: number;
  biasC: number;
  /** Comprobado contra el agua con hielo (0 °C de referencia). */
  checkedAtIce: boolean;
}

export interface FiltrationState {
  sealed: boolean;
  vacuum: boolean;
  /** Papel colocado en el Büchner. */
  paperId: string | null;
}

export interface FractionState {
  cutLoC: number;
  cutHiC: number;
  running: boolean;
  doneAt: number | null;
  progress01: number;
}

export interface AnalysisState {
  sample: Mol;
  sampleFrom: string | null;
  sampleTempC: number;
  method: 'purity' | 'density' | 'mp' | null;
  readyAt: number | null;
  offset: number;
}

export interface BalanceState08 extends AnalyticalBalanceState {
  powered: boolean;
  panIds: string[];
  zeroBiasG: number;
  tareSession: number;
}

export type ReadingKind08 = 'mass' | 'volume' | 'temperature' | 'purity' | 'mp' | 'density';

export interface Reading08 {
  id: string;
  tick: number;
  t: number;
  kind: ReadingKind08;
  instrumentId: string;
  targetId: string;
  value: number;
  /** mp: segundo valor del intervalo (°C). */
  value2?: number;
  unit: 'g' | 'mL' | '°C' | 'g/mL' | '%' | '';
  resolution: number;
  standardUncertainty: number;
  valid: boolean;
  stable: boolean;
  qualityFlags: string[];
  trueValue: number;
  snapshot: {
    species: SpeciesId[];
    sources?: string[];
    tempC?: number;
    tareSession?: number;
    /** Ensayo de pureza: impurezas detectadas (cualitativo). */
    impurities?: SpeciesId[];
    /** Masa verdadera del producto en lo medido (docente). */
    productG?: number;
    waterG?: number;
    route?: RouteId;
  };
}

export interface SafetyState08 {
  ppe: { goggles: boolean; coat: boolean; gloves: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  /** Incidente consumado (no prevención): anula la seguridad (§13). */
  incident: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface P08Params {
  dtS: number;
  ambientTempC: number;
  balance: AnalyticalBalanceParams;
  cylinderDivisionMl: Record<'cyl10' | 'cyl25', number>;
  plateMaxRateCs: number;
  bathTauS: number;
  airTauS: number;
  iceTempC: number;
  ovenTempC: number;
  /** Capacidad del desecante (g de agua por g de Na₂SO₄) `[PENDIENTE]`. */
  dryingCapacity: number;
  /** Retención de líquido de la torta (g por g de cristales) con vacío sellado y sin sellar. */
  cakeRetentionSealed: number;
  cakeRetentionUnsealed: number;
  /** Paso de finos por un papel de poro grueso (fracción de cristales). */
  coarsePaperFines: number;
  hotObjectThresholdC: number;
  funnelVentKPa: number;
  analyzerUncertainty: number;
  dropMl: number;
  spatulaScoopG: number;
  spatulaResidueFraction: number;
  /** Docente: permitir mezclar rutas no está disponible; la ruta queda fija en el intento. */
  route: RouteId;
}

export interface P08World {
  schemaVersion: number;
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: P08Params;
  mode: string;
  route: RouteId;
  objects: Record<string, P08Object>;
  vessels: Record<string, Vessel08>;
  pours: Record<string, Pour08>;
  droppers: Record<string, DropperState08>;
  spatula: SpatulaState08;
  plate: PlateState;
  reflux: RefluxState;
  thermometer: ThermometerState08;
  filtration: FiltrationState;
  oven: { on: boolean };
  fractions: FractionState;
  analyzer: AnalysisState;
  burner: { lit: boolean };
  tongs: boolean;
  balance: BalanceState08;
  /** Compartimentos fuera de los recipientes: mesada (derrames) y extracción de la campana (vapores, CO₂). */
  outside: { bench: Mol; exhaust: Mol; analyzerWaste: Mol };
  readings: Record<string, Reading08>;
  readingOrder: string[];
  safety: SafetyState08;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialElements: Record<Element, number>;
}
