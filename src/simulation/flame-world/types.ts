/**
 * Estado del mundo de la Práctica 3 (mechero y prueba de llama). Datos puros, serializables y deterministas.
 * Unidades: cm sobre la mesada (x a lo largo, y en profundidad desde el canto frontal, z altura), °C, mg, s.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { FlameState, FuelId } from '../combustion/combustion';

export type { Pose, Severity, SimEvent };

export type FlameStateName =
  | 'OFF' | 'GAS_RELEASED' | 'IGNITING' | 'YELLOW_LUMINOUS' | 'TRANSITIONAL' | 'BLUE_STABLE' | 'LIFTED' | 'FLASHBACK' | 'EXTINGUISHED';

/** §6.2 — estado lógico del mechero. */
export interface BurnerState {
  tableGasValve: number;
  needleGasValve: number;
  airCollar: number;
  hoseConnected: boolean;
  hoseIntegrity: number;
  hoseDistanceFromFlameCm: number;
  ventilation: number;
  ignitionSourceAtMouth: boolean;
  accumulatedFuelMl: number;
  fuel: FuelId;
  flameState: FlameStateName;
  bodyTemperatureC: number;
  /** Corte maestro de gas del laboratorio (emergencia). */
  supplyOn: boolean;
  flame: FlameState;
  /** Temporizadores internos. */
  ignitingS: number;
  liftedS: number;
  flashbackS: number;
  /** Destello breve al encender con gas ya acumulado (visual, sin explosión). */
  flareS: number;
  /** Historial corto de la válvula de aguja (para detectar aperturas bruscas). */
  needleHistory: number[];
  litOnceAt: number | null;
}

export interface HoseState {
  /** Punto medio de la manguera (el estudiante puede arrastrarlo). */
  mid: { x: number; y: number; z: number };
  temperatureC: number;
  /** Defecto oculto (escenario docente o aleatorio): se descubre al inspeccionar o con agua jabonosa. */
  cracked: boolean;
  crackFound: boolean;
  inspected: boolean;
  soapTested: boolean;
  replaced: number;
}

export interface LighterState {
  sparking: boolean;
  sparks: number;
}

export interface CapsuleExposure {
  startS: number;
  durationS: number;
  /** Segundos en cada régimen durante la exposición. */
  regimeS: Partial<Record<FlameStateName, number>>;
  sootBeforeMg: number;
  sootAfterMg: number;
  maxTempC: number;
  maxContact: number;
  tongs: boolean;
}

export interface CapsuleState {
  sootMassMg: number;
  sootCoverage: number;
  /** Hollín depositado por régimen (trazabilidad: el residuo no se atribuye a la segunda llama, §8.3). */
  sootByRegimeMg: Partial<Record<FlameStateName, number>>;
  exposures: CapsuleExposure[];
  activeExposure: CapsuleExposure | null;
  wipes: number;
  cleanedAt: number | null;
  /** Tomada con pinzas (id de la pinza) o null. */
  clampedBy: string | null;
  gripQuality: number;
  burned: boolean;
}

export interface TongsState {
  holding: string | null;
}

/** §10.1 — estado del asa de nicromio. */
export interface NichromeLoopState {
  id: string;
  assignedSolutionId?: string;
  temperatureC: number;
  surfaceWaterMg: number;
  depositedSpeciesMg: Record<string, number>;
  contaminationSpeciesMg: Record<string, number>;
  oxideCondition: number;
  isCleanForTest: boolean;
  lastContact?: string;
  /** §21.3 — fase derivada del asa. */
  phase: LoopPhase;
  /** Emisión del último paso (para la escena y la evidencia). */
  emission: number;
  /** Tiempo dentro de la llama en esta carga. */
  inFlameS: number;
  /** Comprobación de limpieza (llama sin color antes de cargar). */
  checkedClean: boolean;
  /** Ácido sobre el asa (después del HCl y antes de enjuagar). */
  acidWet: boolean;
  /** Tubo en el que está sumergida ahora (o null). */
  immersedIn: string | null;
  immersionDepthCm: number;
  /** Superficie sobre la que se dejó (soporte, mesada…). */
  restingOn: string | null;
  spare: boolean;
  /** Consumo actual por especie (mg/s) mientras emite. */
  emissionRates: Record<string, number>;
  /** Cargó muestra desde la última limpieza. */
  loadedSinceClean: boolean;
  /** Demasiada muestra (vástago mojado): chisporroteo al entrar en la llama. */
  overloaded: boolean;
  sputtered: boolean;
}

export type LoopPhase =
  | 'COOL_CLEAN' | 'SAMPLE_LOADING' | 'LOADED' | 'ENTERING_FLAME' | 'WATER_EVAPORATING' | 'EMITTING' | 'DEPLETED_HOT'
  | 'COOLING' | 'COOL_CONTAMINATED' | 'CLEANING';

/** §20 — disolución de un tubo. */
export interface SolutionState {
  id: string;
  label: string;
  volumeMl: number;
  concentrationPercent: number;
  /** Fracción de masa de sal por catión (mg de sal por mg de disolución). */
  species: Record<string, number>;
  displayColor: number;
  displayOpacity: number;
  /** Contaminación (mg de sal ajena acumulada en el tubo). */
  contamination: Record<string, number>;
  spilled: boolean;
  /** Asas distintas de la asignada que entraron al tubo. */
  foreignLoops: string[];
}

export interface OpticalFilterState {
  type: 'COBALT_BLUE_GLASS';
  transmissionCurveId: string;
  cleanliness: number;
  /** 0–1: fracción de la llama que queda detrás del vidrio desde la cámara (lo calcula la escena). */
  alignment: number;
  distanceToCameraCm: number;
  damaged: boolean;
}

export interface AtomizerState {
  solutionId: string;
  yawRad: number;
  residueMg: Record<string, number>;
  bursts: number;
  /** Emisor de aerosol activo en la llama (mg de sal por especie que todavía emite). */
  aerosolInFlameMg: Record<string, number>;
  lastHitFraction: number;
}

export interface Practice3Object {
  id: string;
  kind: ObjKind;
  pose: Pose;
  /** 'bench', 'hand', 'tongs:<id>', 'rack:<i>', 'holder:<i>', 'tile', 'station'… */
  support: string;
  temperatureC: number;
  movable: boolean;
}

export type ObjKind =
  | 'burner' | 'lighter' | 'capsule' | 'tongs' | 'tile' | 'loop' | 'tube' | 'rack' | 'loopHolder' | 'glass' | 'cloth'
  | 'rinseBeaker' | 'waste' | 'hclVial' | 'extinguisher' | 'blanket' | 'gasTap' | 'emergencyStop' | 'extractor'
  | 'coDetector' | 'ruler' | 'atomizer' | 'soapBottle' | 'backdrop';

export interface RoomState {
  /** Ventilación general (0–1) y extracción localizada encendida. */
  ventilation: number;
  extractionOn: boolean;
  /** Corriente de aire (escenario docente, 0–1). */
  draft: number;
  coPpm: number;
  /** Combustible sin quemar acumulado cerca de la mesada (mL). */
  gasAccumMl: number;
  alarm: boolean;
  /** Na ambiental (polvo, sudor): interferencia débil. */
  ambientSodium: number;
}

export interface SafetyState {
  block: { code: string; since: number } | null;
  /** Incidente que detiene la práctica hasta aplicar la respuesta de emergencia. */
  incident: { code: string; since: number; needs: Array<'SHUTOFF' | 'BLANKET' | 'EXTINGUISHER' | 'FIRST_AID'>; done: string[] } | null;
  burns: number;
  /** Elementos de seguridad localizados por el estudiante (§7.1). */
  located: Record<string, boolean>;
  stoppedByTeacher: boolean;
}

export interface CationObservation {
  /** Mejor señal registrada sin filtro / con filtro. */
  noFilter: ObservedColor | null;
  filter: ObservedColor | null;
  emittingS: number;
  /** Observaciones con llama no azul (fondo luminoso que oculta, §14.3). */
  yellowFlameS: number;
  /** Fracción máxima de la señal que provenía de contaminación. */
  maxContaminationShare: number;
  tests: number;
}

export interface ObservedColor {
  rgb: [number, number, number];
  intensity: number;
  region: string;
  dominantNm?: number;
  /** Fracción de la señal debida al sodio (para explicar el enmascaramiento). */
  sodiumShare: number;
  t: number;
}

export interface Practice3Params {
  dtS: number;
  ambientC: number;
  /** Ver CombustionParams. */
  nominalMaxFlowMlS: number;
  intakeEfficiency: number;
  yellowMax: number;
  transitionalMax: number;
  blueMax: number;
  minFlow: number;
  flashbackAirMix: number;
  flashbackMaxFlow: number;
  liftAirMix: number;
  liftMinFlow: number;
  liftHighFlow: number;
  sootShare: number;
  /** Mezcla aire–combustible acumulada que bloquea el encendido (mL). */
  gasWarnMl: number;
  gasAlarmMl: number;
  gasBlockMl: number;
  /** Volumen efectivo de la zona de trabajo para CO (mol de aire). */
  roomAirMol: number;
  coWarnPpm: number;
  coAlarmPpm: number;
  coShutdownPpm: number;
  /** Exposición del modelo espectral → pantalla. */
  exposure: number;
  /** Escala de emisión por mg/s de sal consumida. */
  emissionScale: number;
  /** Consumo de la muestra (1/s) a excitación completa. */
  sampleConsumption: number;
  /** Capacidad del aro (mg de disolución) y del vástago si se sumerge de más. */
  loopRingCapacityMg: number;
  loopStemCapacityMgPerCm: number;
  targetFlameCm: number;
  flameToleranceCm: number;
  /** Modo de asas: dedicadas (predeterminado) o compartida con estación de HCl. */
  loopMode: 'DEDICATED' | 'SHARED';
  atomizerEnabled: boolean;
  /** Orden de encendido (§7.2, configurable por el docente). */
  ignitionOrder: 'GUIDE' | 'INSTITUTIONAL';
}

export interface UnknownSample {
  number: number;
  cation: string;
  intensityFactor: number;
  background: Record<string, number>;
}

export interface FlameWorld {
  kind: 'practice-03';
  seed: number;
  rng: number;
  tick: number;
  timeS: number;
  params: Practice3Params;
  ppe: boolean;
  burner: BurnerState;
  hose: HoseState;
  lighter: LighterState;
  capsule: CapsuleState;
  tongs: Record<string, TongsState>;
  loops: Record<string, NichromeLoopState>;
  solutions: Record<string, SolutionState>;
  glass: OpticalFilterState;
  atomizers: Record<string, AtomizerState>;
  hcl: { open: boolean; openedS: number; dips: number; hotDips: number };
  objects: Record<string, Practice3Object>;
  room: RoomState;
  safety: SafetyState;
  unknown: UnknownSample;
  /** Identificación de partes (§6.1): parte → respuesta del estudiante. */
  parts: { answers: Record<string, string>; attempts: number; wrong: number };
  observations: Record<string, CationObservation>;
  /** Observación de la llama (para Cuadro 3.2 y evidencia). */
  flameLog: { yellowSeenS: number; blueSeenS: number; transitionSeen: boolean; heightOkS: number; twoConesS: number; maxBlueHeightCm: number };
  evidence: Record<string, number>;
  events: SimEvent[];
}
