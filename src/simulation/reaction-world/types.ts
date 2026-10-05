/**
 * Estado del mundo de la Práctica 4 (reacciones químicas). Datos puros, serializables y deterministas.
 * Unidades: cm sobre la mesada (x a lo largo, y en profundidad desde el canto frontal, z altura), mL, mol, °C, s.
 * El mechero es el MISMO modelo de la Práctica 3: vive en un sub-mundo `gas` (FlameWorld) con su llave de mesa,
 * manguera, encendedor, CO y gas acumulado (§29-14).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { Cell } from '../chemistry/types';
import type { FlameWorld } from '../flame-world/types';

export type { Pose, Severity, SimEvent, Cell };

export type P4ObjKind =
  | 'bottle' | 'dropperBottle' | 'dropper' | 'cylinder' | 'beaker' | 'tube' | 'rack' | 'capsule' | 'tile'
  | 'rod' | 'probe' | 'washBottle' | 'waste' | 'sink' | 'towel' | 'phPaper'
  | 'nail' | 'alStrip' | 'nailDish' | 'sandpaper' | 'tubeTongs' | 'crucibleTongs' | 'mgRibbon' | 'mgDish' | 'shield';

export type VesselKind = 'BOTTLE' | 'DROPPER_BOTTLE' | 'DROPPER' | 'CYL10' | 'CYL25' | 'BEAKER100' | 'TUBE' | 'CAPSULE' | 'WASH_BOTTLE' | 'WASTE' | 'SINK';

export interface P4Object {
  id: string;
  kind: P4ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'rack:<i>', 'tile', 'in:<recipiente>', 'cap:<frasco>' (gotero en su frasco), 'tongs:<pinza>',
   * 'stand' (pantalla colocada), 'falling', 'wall', 'disposed:<contenedor>', 'dish' (clavo/cinta en su plato).
   */
  support: string;
  movable: boolean;
  temperatureC: number;
}

/** Estado de una población de partículas sólidas (§11.1). */
export interface ParticleState {
  /** Fracción del sólido en suspensión (el resto es sedimento). */
  suspended: number;
  /** Floculación 0–1 (flóculos más grandes sedimentan más rápido). */
  floc: number;
  /** Radio medio (µm) y dispersión relativa de tamaños. */
  meanRadiusUm: number;
  sizeVariance: number;
  /** Fracción formada cerca de la superficie (nube localizada donde se encuentran los reactivos). */
  localized: number;
}

export interface Addition {
  t: number;
  fromId: string;
  /** Reactivo de origen (frasco) si se conoce. */
  reagent: string | null;
  volumeMl: number;
  /** Moles transferidos por especie (§22.3). */
  mol: Record<string, number>;
  how: 'POUR' | 'DROP' | 'SQUEEZE' | 'SOLID';
}

/** §23.2 — estado de la reacción en el recipiente (derivado) y estados alternos. */
export type VesselRxState =
  | 'EMPTY' | 'UNMIXED' | 'CONTACTING' | 'LOCAL_REACTION' | 'MIXING' | 'REACTION_PROGRESS' | 'EQUILIBRATING' | 'SETTLING' | 'OBSERVABLE_FINAL'
  | 'CONTAMINATED' | 'SPILLED' | 'OVERHEATED' | 'MISLABELED' | 'DISPOSED';

/** Instantánea del contenido de un recipiente (§22: se evalúa lo que se hizo, aunque luego se deseche). */
export interface ObservedContent {
  t: number;
  bulk: Cell;
  plume: Cell;
  particles: P4Vessel['particles'];
  temperatureC: number;
}

export interface P4Vessel {
  id: string;
  kind: VesselKind;
  capacityMl: number;
  /** §7.4 — mezcla espacial simplificada: seno del líquido y penacho local donde cae lo añadido. */
  bulk: Cell;
  plume: Cell;
  temperatureC: number;
  particles: Record<string, ParticleState>;
  /** Agitación actual (0–1) y herramienta. */
  agitation: number;
  agitationTool: 'NONE' | 'ROD' | 'SHAKE' | 'SWIRL';
  /** Reactivo del frasco (frascos y goteros) o rótulo del estudiante (tubos). */
  reagent: string | null;
  label: string | null;
  additions: Addition[];
  /** Sólidos y gases que salieron (CO₂ liberado, etc.), para el balance. */
  released: Record<string, number>;
  /** Avance acumulado por reacción en este recipiente (§22.3). */
  extents: Record<string, number>;
  heatJ: number;
  tempLog: { min: number; max: number; first: number | null };
  broken: boolean;
  /** Contenedor donde se desechó el contenido por última vez. */
  disposedTo: string | null;
  /** Contenido justo antes de empezar a desecharlo: la evidencia del ensayo sigue disponible para evaluar. */
  observed?: ObservedContent | null;
  rx: VesselRxState;
  /** Reacción en el penacho (mol/s) del último paso: para «remolinos» y reacción localizada. */
  localRate: number;
  bulkRate: number;
  /** Cambios pendientes de equilibrar (evita resolver recipientes quietos). */
  dirty: boolean;
  /** Recipiente limpio/seco verificado por el estudiante. */
  inspected: boolean;
  /** pH comprobado con papel indicador (para el desecho, §18.4). */
  phChecked: number | null;
  /** Temperatura del residuo sólido (cápsula con ceniza de Mg recién caída). */
  residueTempC: number;
  /** Contenido ajeno al reactivo del frasco o gotero (contaminación cruzada). */
  contaminated: boolean;
  /** Película de agua o residuo previo (recipiente húmedo o sucio). */
  wet: boolean;
  /** Último instante con burbujas de gas (efervescencia). */
  lastBubbleS: number;
}

export interface PourStream {
  targetId: string | null;
  rateMlS: number;
  tiltDeg: number;
  startedS: number;
  transferredMl: number;
  spilledMl: number;
}

export interface MetalSegment {
  /** Fracción cubierta de óxido (0 limpio – 1 oxidado). */
  oxide: number;
  /** Cobre depositado sobre el segmento (mol). */
  cuMol: number;
}

/** §23.3 — estado del metal. */
export type MetalState =
  | 'CLEAN_OR_OXIDIZED' | 'IMMERSED' | 'NUCLEATION' | 'COPPER_GROWTH' | 'PARTIALLY_COATED' | 'COATING_LIMITED' | 'REMOVED_WET' | 'RINSED_OR_STORED';

export interface MetalPiece {
  id: string;
  metal: 'Fe' | 'Al';
  lengthCm: number;
  /** Clavo: diámetro; tira de Al: ancho y espesor. */
  diameterCm: number;
  widthCm: number;
  thicknessCm: number;
  metalMol: number;
  initialMetalMol: number;
  /** Mapa de superficie a lo largo (de la punta a la cabeza), §16.4. */
  segments: MetalSegment[];
  /** Rugosidad por lijado (multiplica el área activa). */
  roughness: number;
  sandStrokes: number;
  /** Película pasivante (Al₂O₃), 0–1. */
  passivation: number;
  immersedIn: string | null;
  immersedSince: number | null;
  totalImmersedS: number;
  removedAt: number | null;
  wet: boolean;
  rinsed: boolean;
  /** Cobre desprendido hacia el fondo (mol). */
  detachedCuMol: number;
  state: MetalState;
  inspectedBefore: boolean;
  inspectedAfter: boolean;
  /** Fracción de óxido inicial (para comparar «antes/después», §12.6). */
  initialOxide: number;
}

export type MgPhase = 'COLD_METAL' | 'HEATING' | 'IGNITION_THRESHOLD' | 'BRIGHT_COMBUSTION' | 'GLOWING_RESIDUE' | 'COOLING_RESIDUE';

export interface MgRibbon {
  id: string;
  lengthCm: number;
  widthCm: number;
  thicknessCm: number;
  massInitialG: number;
  mgMol: number;
  /** Ceniza unida a la cinta (MgO y Mg₃N₂). */
  mgoMol: number;
  mg3n2Mol: number;
  temperatureC: number;
  phase: MgPhase;
  /** Fracción quemada (0–1) y frente de combustión. */
  burnFrac: number;
  ignitedAt: number | null;
  endedAt: number | null;
  /** Combustión autosostenida (sigue fuera de la llama). */
  established: boolean;
  /** Toda la cinta entró de golpe a la llama (§13.6). */
  abrupt: boolean;
  /** MgO producido por destino (mol). */
  toCapsuleMol: number;
  toBenchMol: number;
  smokeMol: number;
  /** Exposición visual directa acumulada mientras arde (s). */
  directViewS: number;
  /** Fracción de humo/escape configurada por la semilla. */
  smokeFrac: number;
}

export interface Spill {
  id: string;
  x: number;
  y: number;
  cell: Cell;
  t: number;
  cleaned: boolean;
  /** Origen (recipiente) del derrame. */
  from: string;
}

export interface Disposal {
  t: number;
  sourceId: string;
  containerId: string;
  volumeMl: number;
  /** Categoría correcta según el contenido y si coincide con el contenedor. */
  expected: string;
  correct: boolean;
  mol: Record<string, number>;
}

export interface WasteRules {
  /** Se permite el desagüe para la disolución neutralizada (pH 6–8) — configuración institucional. */
  allowNeutralDrain: boolean;
}

export interface P4Params {
  dtS: number;
  ambientC: number;
  /** Volumen de gota del gotero de reactivo (mL) y del de fenolftaleína; la semilla los varía ±8 %. */
  dropMl: number;
  phenolDropMl: number;
  /** Retención en las paredes después de vaciar (mL) por tipo de recipiente. */
  holdupMl: Partial<Record<VesselKind, number>>;
  /** Mezcla: constante base (1/s) y por agitación. */
  mixBase: number;
  mixStir: number;
  /** Fracción de líquido del seno que arrastra el penacho por mL añadido. */
  entrainment: number;
  /** Redox Fe/Cu²⁺: constante (mol·s⁻¹·cm⁻²·M⁻¹), recubrimiento de referencia (mg/cm²) y desprendimiento. */
  kRedoxFe: number;
  kRedoxAl: number;
  cuCoatRefMgCm2: number;
  oxideDissolveTauS: number;
  /** Combustión del Mg. */
  mgIgnitionC: number;
  mgBurnCmS: number;
  mgNitrideFrac: number;
  oxygenAvailability: number;
  /** Hidratación del MgO (1/s por unidad de superficie relativa). */
  kHydration: number;
  /** Distancia mínima entre la fenolftaleína (etanol) y la llama (cm). */
  ethanolSafeCm: number;
  /** Tiempo de observación pedido para Fe/Cu (s). */
  redoxObserveS: number;
  waste: WasteRules;
  /** Variante con aluminio habilitada por el docente (§12.5). */
  aluminumEnabled: boolean;
  /** Demostración de exceso básico (§8.5) y comparación 3 mL de NaOH (§10.4). */
  excessBaseDemo: boolean;
  feComparison: boolean;
  /** NaOH: dos frascos (0,10 y 0,15 M) o uno solo con la concentración configurada (§2). */
  naohSingle: number | null;
}

export interface SafetyState4 {
  block: { code: string; since: number; reasons?: string[] } | null;
  incident: { code: string; since: number; needs: Array<'FIRST_AID' | 'CLEAN_SPILL' | 'SHUTOFF' | 'EYEWASH'>; done: string[] } | null;
  burns: number;
  stoppedByTeacher: boolean;
  mgWarningAccepted: boolean;
  gloves: boolean;
}

export interface Stopwatch {
  running: boolean;
  startedAt: number | null;
  /** Tiempo acumulado (s) hasta la última detención. */
  accumS: number;
  starts: number[];
}

export interface P4World {
  kind: 'practice-04';
  seed: number;
  rng: number;
  tick: number;
  timeS: number;
  params: P4Params;
  ppe: boolean;
  /** Mechero, llave, manguera, encendedor, CO y gas acumulado: el modelo seguro de la Práctica 3. */
  gas: FlameWorld;
  objects: Record<string, P4Object>;
  vessels: Record<string, P4Vessel>;
  metals: Record<string, MetalPiece>;
  ribbons: Record<string, MgRibbon>;
  /** Pinzas: qué sostienen. */
  tongs: Record<string, { holding: string | null; grip: number }>;
  probe: { vesselId: string | null; touchingBottom: boolean; readingC: number; tipInLiquid: boolean };
  rod: { vesselId: string | null; broken: boolean; spares: number };
  /** Lo que salió de los recipientes (derrames), el desagüe y el aire consumido/humo, para el balance global. */
  spills: Spill[];
  ledger: { drained: Record<string, number>; smoke: Record<string, number>; air: Record<string, number>; towels: Record<string, number>; dust: Record<string, number> };
  disposals: Disposal[];
  /** Vertidos y chorros de piseta en curso (por recipiente de origen). */
  pours: Record<string, PourStream>;
  squeezes: Record<string, { targetId: string | null; rateMlS: number }>;
  stopwatch: Stopwatch;
  /** Pantalla para Mg (alineación entre la vista y la cinta, la calcula la escena). */
  shield: { alignment: number; placed: boolean };
  /** Vista de la combustión: la escena informa si la cinta encendida está en pantalla y si la pantalla la cubre. */
  mgView: { inView: boolean; shielded: boolean };
  safety: SafetyState4;
  /** Escenarios docentes aplicados (§17). */
  scenarios: string[];
  evidence: Record<string, number>;
  events: SimEvent[];
}
