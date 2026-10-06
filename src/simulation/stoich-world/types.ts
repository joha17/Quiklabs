/**
 * Estado del mundo de la Práctica 5 (relaciones estequiométricas: 2 KClO₃ → 2 KCl + 3 O₂ con MnO₂). Datos puros,
 * serializables y deterministas. Unidades: cm sobre la mesada (x a lo largo, y en profundidad, z altura), g, mol, °C, s.
 * El mechero es el MISMO modelo de la Práctica 3 (sub-mundo `gas`).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { FlameWorld } from '../flame-world/types';
import type { MassMeasurement } from '../stoichiometry/stoich';

export type { Pose, Severity, SimEvent, MassMeasurement };

export type P5ObjKind =
  | 'balance' | 'tube' | 'stand' | 'tubeTongs' | 'spatula' | 'bottle' | 'stopper' | 'shield' | 'rack'
  | 'irThermometer' | 'washBottle' | 'waste' | 'weighPaper' | 'sugarJar' | 'pestle' | 'tray' | 'brush';

export interface P5Object {
  id: string;
  kind: P5ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'pan' (platillo de la balanza), 'clamp' (pinza del soporte), 'rack' (gradilla refractaria),
   * 'tongs' (pinza para tubo), 'in:<frasco>' (espátula dentro del frasco), 'tube' (tapón puesto), 'stand' (pantalla),
   * 'wall', 'disposed'.
   */
  support: string;
  movable: boolean;
}

/** §6.2 — balanza de triple brazo (granataria). */
export interface BalanceState {
  capacityG: number;
  resolutionG: number;
  uncertaintyG: number;
  /** Posición de las pesas corredizas (g): brazo de 100 g (0–500), de 10 g (0–90) y de 0–10 g (continuo). */
  riders: [number, number, number];
  /** Corrección del tornillo de cero (g equivalentes); el estudiante la ajusta. */
  zeroScrewG: number;
  /** Error de fábrica / desajuste del cero que el tornillo debe compensar (g). */
  zeroErrorG: number;
  /** Desnivel (°): desplaza el cero y reduce la sensibilidad. */
  levelErrorDeg: number;
  /** Objeto sobre el platillo. */
  panObjectId: string | null;
  /** Polvo derramado sobre el platillo (mol por especie): masa falsa y contaminación. */
  panResidueMol: { KClO3: number; KCl: number; MnO2: number };
  /** Perturbación lenta del aire sobre el platillo (g), proceso suavizado. */
  noiseG: number;
  /** Segundos que el fiel lleva quieto (amplitud y velocidad pequeñas). */
  quietS: number;
  /** Fiel: posición −1…1 (0 = marca) y velocidad. */
  pointer: number;
  pointerVel: number;
  /** Corriente de aire (0–1) y vibración de la mesada (0–1). */
  airCurrent: number;
  vibration: number;
  /** El estudiante comprobó y ajustó el cero con el platillo vacío. */
  calibratedAt: number | null;
  /** El cero dejó de valer (se tocó el tornillo con carga, se niveló, etc.). */
  stable: boolean;
  /** §23.2 */
  state: 'UNLOADED' | 'READY' | 'LOADED_OSCILLATING' | 'BALANCED' | 'OVERLOADED' | 'HOT_LOAD' | 'UNSTABLE_SURFACE' | 'CONTAMINATED';
  /** Instante de la última carga o movimiento de pesa (para «esperar oscilación»). */
  disturbedAt: number;
}

/** Composición sólida del tubo (mol) y agua de humedad (g). */
export interface TubeContents {
  KClO3: number;
  KCl: number;
  MnO2: number;
  waterG: number;
  /** Contaminantes incompatibles presentes (papel, azúcar, grasa…). */
  contamination: string[];
}

/** Un ciclo de calentamiento (§13). */
export interface HeatCycle {
  index: number;
  startS: number;
  endS: number | null;
  /** Segundos con llama efectiva sobre el tubo. */
  heatedS: number;
  maxSampleC: number;
  o2MolReleased: number;
  solidLossG: number;
  /** Rapidez máxima de liberación de O₂ (mol/s). */
  peakRateMolS: number;
}

/** §10, §11, §12 — tubo resistente al calor. */
export interface TubeState {
  id: string;
  glassMassG: number;
  contents: TubeContents;
  /** Mezcla (§9.2). */
  homogeneity: number;
  compaction: number;
  /** Temperaturas: vidrio en contacto con la llama, muestra y parte superior. */
  glassC: number;
  sampleC: number;
  upperC: number;
  /** Tensión térmica acumulada (0–1; 1 = rotura). */
  stress: number;
  cracked: boolean;
  /** Grieta previa (escenario) que se ve al inspeccionar. */
  preCracked: boolean;
  inspected: boolean;
  stoppered: boolean;
  /** O₂ liberado al ambiente (mol) y rapidez actual (mol/s). */
  o2ReleasedMol: number;
  o2RateMolS: number;
  /** Agua evaporada (g). */
  waterLostG: number;
  /** Sólido expulsado por el flujo de gas o derramado (mol por especie). */
  lostMol: { KClO3: number; KCl: number; MnO2: number };
  /** Calor de reacción liberado (J), para el balance. */
  reactionHeatJ: number;
  cycles: HeatCycle[];
  /** §23.3 */
  state: 'CLEAN_DRY' | 'CATALYST_LOADED' | 'REACTANT_LOADED' | 'MIXED' | 'CLAMPED' | 'HEATING' | 'REACTING' | 'HOT_RESIDUE' | 'COOLING' | 'ROOM_TEMPERATURE' | 'WEIGHED' | 'BROKEN';
}

/** §10.1 — soporte universal con nuez y pinza/prensa. */
export interface ClampState {
  nutTight: boolean;
  /** Presión de las mordazas 0–1 (floja < 0,25; apretada > 0,8). */
  grip: number;
  /** Inclinación del tubo respecto a la horizontal (°), boca arriba. */
  angleDeg: number;
  /** Dirección hacia donde apunta la boca (°; 0 = hacia el fondo de la mesada, 180 = hacia la persona). */
  mouthYawDeg: number;
  /** Altura de la pinza sobre la mesada (cm). */
  heightCm: number;
  /** Punto donde se sujeta el tubo (0 = fondo, 1 = boca). */
  gripAt: number;
}

export interface SpatulaState {
  id: string;
  /** Reactivo al que está dedicada. */
  dedicatedTo: 'KClO3' | 'MnO2';
  /** Sólido que lleva cargado (mol). */
  loadMol: { KClO3: number; MnO2: number };
  /** Residuo adherido después de volcar (mol). */
  residueMol: { KClO3: number; MnO2: number };
  /** Contaminante orgánico (grasa, azúcar…) en la espátula. */
  contaminant: string | null;
  /** Se usó en el otro reactivo (contaminación cruzada). */
  crossed: boolean;
}

export interface BottleState {
  id: string;
  species: 'KClO3' | 'MnO2';
  mol: number;
  open: boolean;
  /** Se devolvió reactivo o entró otro sólido: el frasco quedó contaminado. */
  contaminated: boolean;
}

export interface SafetyState5 {
  ppe: boolean;
  shieldPlaced: boolean;
  block: { code: string; since: number; reasons?: string[] } | null;
  incident: { code: string; since: number; needs: string[]; done: string[] } | null;
  stoppedByTeacher: boolean;
  /** Último instante con interacción del estudiante (para «sin supervisión»). */
  lastInteractionS: number;
  burns: number;
}

/** Sólido derramado en la mesada (mol por especie). */
export interface Spill {
  id: string;
  t: number;
  x: number;
  y: number;
  mol: { KClO3: number; KCl: number; MnO2: number };
  cleaned: boolean;
}

export interface Stopwatch {
  running: boolean;
  startedAt: number | null;
  accumulatedS: number;
}

export interface P5Params {
  dtS: number;
  ambientC: number;
  // Balanza
  capacityG: number;
  resolutionG: number;
  uncertaintyG: number;
  pointerPeriodS: number;
  pointerDamping: number;
  /** g de desequilibrio que llevan el fiel al tope. */
  pointerSpanG: number;
  /** Empuje aparente por la corriente convectiva de una carga caliente (g/K). */
  hotLiftGPerK: number;
  hotFluctuationGPerK: number;
  allowedDeltaC: number;
  constantMassCriterionG: number;
  // Mezcla
  tapGain: number;
  tapLossThreshold: number;
  // Química (Arrhenius, mol/s por mol de KClO₃)
  catA: number;
  catEaJ: number;
  uncatA: number;
  uncatEaJ: number;
  /** Relación másica MnO₂/KClO₃ a la que el contacto se satura. */
  catalystSaturation: number;
  /** ΔH de 2 KClO₃ → 2 KCl + 3 O₂ (J por mol de KClO₃; negativo = exotérmico). */
  reactionHJPerMol: number;
  /** Rapidez máxima de descomposición (s⁻¹): la reacción sobre el catalizador se satura (cinética de superficie). */
  kMax: number;
  /** Rapidez específica de O₂ (s⁻¹) y calentamiento de la muestra (K/s) sobre los que el gas arrastra sólido. */
  expulsionThreshold: number;
  expulsionRampKs: number;
  expulsionGain: number;
  // Térmica del tubo
  glassHeatCapJK: number;
  /** Fracción de la potencia de la llama que llega al fondo del tubo con contacto pleno. */
  flameCaptureFrac: number;
  glassAirWK: number;
  glassSampleWK: number;
  sampleHeatCapJGK: number;
  sampleAirWK: number;
  upperCouplingWK: number;
  rackCouplingWK: number;
  /** Tensión térmica por gradiente vidrio–parte superior (1/(K·s)) y por calentamiento brusco. */
  stressGradientK: number;
  stressRampK: number;
  stressRelax: number;
  /** Minutos sin interacción con la llama encendida antes del corte por seguridad. */
  unattendedS: number;
  // Protocolo
  kclo3MinG: number;
  kclo3MaxG: number;
  mno2MinG: number;
  mno2MaxG: number;
  firstCycleS: number;
  angleMinDeg: number;
  angleMaxDeg: number;
}

/** Lectura de la balanza con el contexto que permite interpretarla (§6.6, §20.1). */
export interface P5Measurement extends MassMeasurement {
  /** Composición del tubo al leer (si el tubo estaba en el platillo). */
  contents: { KClO3: number; KCl: number; MnO2: number; waterG: number } | null;
  /** Ciclos de calentamiento terminados al leer. */
  cycle: number;
  /** Lectura con platillo vacío y pesas en cero (comprobación de cero). */
  zeroCheck: boolean;
}

export interface P5World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: P5Params;
  objects: Record<string, P5Object>;
  balance: BalanceState;
  tube: TubeState;
  clamp: ClampState;
  spatulas: Record<string, SpatulaState>;
  bottles: Record<string, BottleState>;
  spills: Spill[];
  measurements: P5Measurement[];
  safety: SafetyState5;
  stopwatch: Stopwatch;
  /** Sub-mundo del mechero (Práctica 3). */
  gas: FlameWorld;
  events: SimEvent[];
  evidence: Record<string, number>;
  /** Escenarios docentes activos (§18). */
  scenarios: string[];
  /** Total de cada elemento al inicio (mol), para el balance (§11.5). */
  initialElements: Record<string, number>;
  ppe: boolean;
}
