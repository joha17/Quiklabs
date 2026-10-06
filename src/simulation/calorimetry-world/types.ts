/**
 * Estado del mundo de la Práctica 6 (calorimetría). Datos puros, serializables y deterministas.
 * Unidades: cm sobre la mesada (x a lo largo, y en profundidad, z altura), g, °C, J, W, s.
 * Los valores científicos viven aquí; la escena solo los dibuja (§3.2).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { TripleBeamParams, TripleBeamState } from '../instruments/triple-beam';
import type { BombProfile, FoodId, MetalId } from '../calorimetry/materials';
import type { TempSample } from '../calorimetry/heat';

export type { Pose, Severity, SimEvent, TempSample };

export type P6ObjKind =
  | 'balance' | 'cylinder' | 'waterBottle' | 'washBottle' | 'cup' | 'thermometer' | 'stirrer' | 'tube' | 'spatula' | 'jar'
  | 'beaker' | 'hotplate' | 'tubeTongs' | 'rack' | 'towel' | 'sink'
  | 'bomb' | 'bombUnit' | 'oxygen' | 'analyticBalance' | 'foodDish';

export interface P6Object {
  id: string;
  kind: P6ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'pan' (balanza), 'plate' (beaker sobre la plantilla), 'bath' (tubo o termómetro en el baño),
   * 'cup' (termómetro o agitador en el calorímetro), 'rack' (tubos), 'tongs' (tubo en la pinza), 'unit' (bomba en la
   * cubeta), 'wall', 'disposed'.
   */
  support: string;
  movable: boolean;
}

/** Agua contenida (g) y su temperatura; `wetG` = película que queda en las paredes. */
export interface WaterVessel {
  id: string;
  /** Capacidad nominal (mL). */
  capacityMl: number;
  /** Masa del recipiente vacío y seco (g) y su calor específico. */
  glassMassG: number;
  glassCp: number;
  waterG: number;
  waterC: number;
  /** Agua adherida a las paredes (g) que no se vierte. */
  wetG: number;
  /** Área de la sección interior (cm²) y altura del fondo interior (cm). */
  areaCm2: number;
  floorCm: number;
}

/** Una pieza metálica (clavo, perdigón): sólido discreto (§6.2). */
export interface MetalPiece {
  id: string;
  metal: MetalId;
  massG: number;
  /** 'jar:<id>', 'tube:<id>', 'spatula', 'cup', 'bench', 'sink'. */
  loc: string;
  /** Temperatura de las piezas sueltas (en la mesada o en la espátula). */
  tempC: number;
}

export interface TubeState {
  id: string;
  glassMassG: number;
  glassC: number;
  /** Temperatura del metal dentro del tubo (nodo térmico único). */
  metalC: number;
  /** Agua que entró al tubo (g) y su temperatura (va con el metal). */
  waterG: number;
  wetG: number;
  cracked: boolean;
  /** Fondo del tubo sobre el fondo del beaker (cm) cuando está en el baño. */
  bottomAboveFloorCm: number;
  inspected: boolean;
  /** Estado térmico (§24.2). */
  hot: 'COLD' | 'HEATING' | 'HOT' | 'COOLING' | 'SAFE_TO_TOUCH';
  /** Instante en que salió del baño (para medir el traslado). */
  liftedAt: number | null;
  /** Temperatura del metal al salir del baño. */
  metalCAtLift: number | null;
  /** Segundos acumulados dentro del baño con el agua ≥ 95 % de la ebullición. */
  boilingSoakS: number;
}

export interface ThermometerState {
  id: string;
  displayedC: number;
  timeConstantS: number;
  resolutionC: number;
  offsetC: number;
  /** Profundidad de inmersión 0 (bulbo fuera) – 1 (toca el fondo). */
  depth: number;
  broken: boolean;
  /** Temperatura que ve el sensor (verdad para el docente). */
  sensorC: number;
}

export interface HotPlate {
  knob: number;
  plateC: number;
  /** Potencia instantánea (W). */
  powerW: number;
}

/** Nodos del calorímetro de vaso (§14). El agua se divide en capa inferior (junto al metal) y superior. */
export interface CupCalorimeter {
  lidClosed: boolean;
  lidOpenS: number;
  /** Agitación 0–1 (decae si no se agita). */
  stir: number;
  topC: number;
  bottomC: number;
  metalC: number;
  cupC: number;
  /** Agua perdida por salpicaduras y evaporación (g). */
  splashLossG: number;
  evaporatedG: number;
  /** Energía cedida al ambiente desde la última carga de agua (J). */
  lossToAmbientJ: number;
  state: 'EMPTY' | 'WATER_LOADED' | 'SENSOR_INSTALLED' | 'EQUILIBRATING' | 'READY' | 'METAL_RECEIVED' | 'MIXING' | 'PEAK_FOUND' | 'COOLING';
}

export interface Bath {
  boilingC: number;
  /** Intensidad de la ebullición 0–1. */
  vigor: number;
  evaporatedG: number;
  splashedG: number;
}

/** Un ensayo (§23): desde que el metal cae al calorímetro. */
export interface Run {
  index: number;
  metal: MetalId;
  tubeId: string;
  startS: number;
  metalMassG: number;
  metalCAtEntry: number;
  metalCAtLift: number;
  bathCAtLift: number;
  transferS: number;
  waterMassG: number;
  waterCAtEntry: number;
  cupCAtEntry: number;
  bathWaterInG: number;
  piecesLost: number;
  dropHeightCm: number;
  /** Máximo verdadero de la lectura del termómetro del calorímetro y su instante. */
  peakDisplayedC: number;
  peakT: number;
  /** El estudiante registró el máximo (valor, instante, juicio). */
  recorded: { c: number; t: number; judgement: 'EARLY' | 'OK' | 'LATE' } | null;
  endedS: number | null;
}

export interface P5LikeMeasurementBase {
  id: string;
  displayedMassG: number;
  trueMassG: number;
  resolutionG: number;
  uncertaintyG: number;
  stable: boolean;
  zeroCorrected: boolean;
  loadTemperatureC: number;
  timestampMs: number;
  objectId: string | null;
  valid: boolean;
  invalidReason?: 'UNSTABLE' | 'HOT_LOAD' | 'NOT_CALIBRATED' | 'OVERLOAD' | 'EMPTY' | 'TOUCHING';
}

/** Lectura de la balanza con lo que había en el platillo. */
export interface MassReading extends P5LikeMeasurementBase {
  zeroCheck: boolean;
  /** Contenido del objeto pesado. */
  waterG: number;
  wetG: number;
  metalG: number;
  metal: MetalId | null;
  /** Ensayos ya iniciados al leer. */
  runsBefore: number;
}

export interface VolumeReading {
  id: string;
  t: number;
  /** Lectura (mL) con el sesgo de paralaje. */
  valueMl: number;
  trueMl: number;
  /** Altura del ojo respecto del menisco (cm; + = encima). */
  eyeDzCm: number;
  atEyeLevel: boolean;
}

export interface TempReading {
  id: string;
  thermoId: string;
  t: number;
  valueC: number;
  where: 'cup' | 'bath' | 'air';
  /** Ensayos iniciados al leer (0 = antes del primero). */
  runsBefore: number;
  /** Lectura marcada como máximo. */
  peak: boolean;
  judgement?: 'EARLY' | 'OK' | 'LATE';
  /** La lectura todavía cambiaba (pendiente > 0,02 °C/s). */
  changing: boolean;
}

export interface Pour {
  sourceId: string;
  targetId: string | null;
  tiltDeg: number;
  startedS: number;
  transferredG: number;
}

// ─────────────────────────── Bomba calorimétrica (§20) ───────────────────────────

export type BombStage =
  | 'UNASSEMBLED' | 'SAMPLE_LOADED' | 'WIRE_CONNECTED' | 'SEALED' | 'LEAK_TESTED' | 'OXYGEN_CHARGED' | 'SUBMERGED'
  | 'BASELINE_STABLE' | 'ARMED' | 'IGNITED' | 'TEMPERATURE_RISE' | 'COMPLETE' | 'COOLED' | 'DEPRESSURIZED' | 'OPENED';

export interface BombState {
  profile: BombProfile['id'] | null;
  stage: BombStage;
  inspected: { vessel: boolean; seal: boolean; electrodes: boolean; valve: boolean };
  sealDamaged: boolean;
  /** Constante energética cargada (J/°C) o null. */
  energyEquivalent: number | null;
  food: FoodId | null;
  sampleG: number;
  /** Lectura de la balanza analítica del alimento (g). */
  sampleReadingG: number | null;
  sampleInCrucible: boolean;
  wireCm: number;
  wireContact: 'OK' | 'NO_TOUCH' | 'CRUCIBLE' | null;
  pressureAtm: number;
  leakTestPassed: boolean | null;
  bucketWaterG: number;
  inBucket: boolean;
  lidClosed: boolean;
  /** Temperatura de la cubeta (verdad) y la que muestra la unidad. */
  bucketC: number;
  displayedC: number;
  jacketC: number;
  baselineS: number;
  ignitedAt: number | null;
  /** Energías (J) del ensayo: muestra liberada, alambre, auxiliares (ácido nítrico). */
  qSampleJ: number;
  qWireJ: number;
  qAuxJ: number;
  /** Energía total aún por entregar a la cubeta. */
  pendingJ: number;
  completeness: number;
  residue: 'NONE' | 'SOOT' | 'UNBURNED';
  series: TempSample[];
  /** Constante efectiva real (perfil + agua de la cubeta distinta de la nominal). */
  effectiveJPerC: number;
  aborted: boolean;
}

export interface SafetyState6 {
  ppe: boolean;
  block: { code: string; since: number } | null;
  incident: { code: string; since: number; needs: string[]; done: string[] } | null;
  stoppedByTeacher: boolean;
  burns: number;
  lastInteractionS: number;
}

export interface P6Params {
  dtS: number;
  ambientC: number;
  pressureKPa: number;
  /** 'IDEAL': sin calorímetro ni pérdidas en el vaso (etiqueta visible); 'REALISTIC': todo activo. */
  model: 'IDEAL' | 'REALISTIC';
  /** Calor específico constante o dependiente de la temperatura (§14.6). */
  cpModel: 'CONSTANT' | 'T_DEPENDENT';
  balance: TripleBeamParams;
  cylinderUncertaintyMl: number;
  thermometer: { timeConstantS: number; resolutionC: number; uncertaintyC: number };
  // Calorímetro
  cupHeatCapJPerC: number;
  cupWaterGWPerC: number;
  cupAmbientWPerC: number;
  waterAmbientLidClosedWPerC: number;
  waterAmbientLidOpenWPerC: number;
  metalWaterBaseWPerC: number;
  metalWaterStirWPerC: number;
  mixBaseWPerC: number;
  mixStirWPerC: number;
  bottomFraction: number;
  // Baño y plantilla
  plateMaxW: number;
  plateMaxC: number;
  plateHeatCapJPerC: number;
  plateAirWPerC: number;
  plateBeakerWPerC: number;
  beakerAirWPerC: number;
  // Tubo
  tubeBathWPerC: number;
  tubeAirWPerC: number;
  metalTubeWPerC: number;
  metalTubeWetWPerC: number;
  tubeLengthCm: number;
  tubeAreaCm2: number;
  // Procedimiento
  targetWaterMl: number;
  targetMetalG: number;
  minSoakS: number;
  unknownMetal: MetalId;
  /** Dispersión entre muestras: 0 = valor nominal; 1 = todo el intervalo del material. */
  sampleDispersion: number;
  unknownCode: string;
  bombEnabled: boolean;
  bombProfile: BombProfile['id'];
  bombFood: FoodId;
}

export interface P6World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: P6Params;
  objects: Record<string, P6Object>;
  balance: TripleBeamState;
  vessels: Record<string, WaterVessel>;
  pieces: Record<string, MetalPiece>;
  /** Calor específico efectivo de cada metal de esta sesión (dentro de su intervalo). */
  sampleCp: Partial<Record<MetalId, number>>;
  tubes: Record<string, TubeState>;
  thermos: Record<string, ThermometerState>;
  plate: HotPlate;
  bath: Bath;
  cal: CupCalorimeter;
  /** Agua de la botella (fuente) a temperatura ligeramente distinta del ambiente. */
  sourceWaterC: number;
  pours: Record<string, Pour>;
  runs: Run[];
  massReadings: MassReading[];
  volumeReadings: VolumeReading[];
  tempReadings: TempReading[];
  /** Series observables (1 Hz) y verdaderas para el docente. */
  series: { cal: TempSample[]; bath: TempSample[]; metalTrue: TempSample[]; waterTrue: TempSample[] };
  bomb: BombState;
  /** Agua derramada sobre la mesada (g) y piezas fuera de lugar. */
  spilledG: number;
  safety: SafetyState6;
  stopwatch: { running: boolean; startedAt: number | null; accumulatedS: number };
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  /** Masa total inicial de agua y de metal (para los balances §30.1). */
  initialWaterG: number;
  initialMetalG: number;
}
