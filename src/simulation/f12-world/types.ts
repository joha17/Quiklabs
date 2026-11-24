/**
 * Estado del mundo de F12 — presión en flujo y continuidad. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). El dominio calcula en SI: caudal en m³/s,
 * presiones en Pa, densidad en kg/m³, velocidades en m/s. Los volúmenes de agua de los recipientes en cm³ (= mL). Las
 * lecturas conservan la unidad del instrumento: kPa de los sensores, L/s del caudalímetro, cm del calibre, de la regla
 * de cotas y del visor del depósito, mL del vaso volumétrico y s del cronómetro.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';

export type { Pose, Severity, SimEvent };

export type F12ObjKind =
  | 'sump' | 'pump' | 'meter' | 'joint' | 'venturi' | 'clamp' | 'spool' | 'tapPiece' | 'purge' | 'valve' | 'outlet' | 'beaker' | 'timer'
  | 'panel' | 'logger' | 'ruler' | 'gaskets' | 'spare' | 'caliper' | 'sample' | 'pitot' | 'stopper' | 'towel';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F12Object {
  id: string;
  kind: F12ObjKind;
  pose: Pose;
  support: string;
  movable: boolean;
}

export type JointId = 'J1' | 'J2' | 'J3';
export type PortId = 1 | 2 | 3;
export type SensorId = 1 | 2 | 3;
export type SpoolKind = 'smooth' | 'rough';

export interface JointState {
  connected: boolean;
  /** Empaquetadura colocada y si está gastada (fuga aunque la junta esté apretada, F12-S12). */
  gasket: boolean;
  worn: boolean;
  /** Aflojada por el corrimiento del Venturi sin abrazaderas (F12-E28). */
  loose: boolean;
}

export interface CircuitState {
  joints: Record<JointId, JointState>;
  /** Aire dentro del circuito (cm³): todo el volumen interior al empezar vacío. */
  airCm3: number;
  purgeOpen: boolean;
  spool: SpoolKind;
  /** Tapón de goma alojado en la garganta (F12-E18). */
  obstructed: boolean;
  clamped: boolean;
  /** Corrimiento axial del Venturi sin abrazaderas (cm, F12-E28). */
  driftCm: number;
}

export interface PumpState {
  on: boolean;
  /** Consigna de la perilla (0–1) y velocidad real del rotor (0–1) con su inercia. */
  set: number;
  n: number;
}

export interface ValveState {
  pos: number;
  /** Coeficiente de pérdida efectivo mientras la válvula gira (ref. v1). */
  kEff: number;
  /** Maniobra en curso: desde qué posición y cuándo empezó; último paso (para la rapidez de cierre, F12-E05). */
  moveStart: number;
  fromPos: number;
  lastT: number;
}

export interface FlowState {
  /** Caudal de la bomba (m³/s) y su derivada; promedio móvil de 1 s. */
  Q: number;
  dQdt: number;
  Qavg: number;
  /** Lectura del caudalímetro con su respuesta (m³/s). */
  meterQ: number;
  /** Sobrepresión del golpe de ariete en curso (Pa) y hasta cuándo dura. */
  surgePa: number;
  surgeUntil: number;
}

export interface PortState {
  capped: boolean;
  probe: 'static' | 'pitot';
}

export interface SensorState {
  port: PortId | null;
  offset: number;
  zeroed: boolean;
  /** El último cero se hizo con caudal (F12-E21). */
  badZero: boolean;
  scale: number;
  calibrated: boolean;
  /** Presión que «ve» la membrana con su retardo (kPa). */
  lagKPa: number;
  /** Promedio de 1 s del registrador sobre la membrana (kPa). */
  avgKPa: number;
  damaged: boolean;
}

export interface SeriesState {
  id: number;
  n: number;
  configChanged: boolean;
  spoolChanged: boolean;
}

export interface CollectState {
  /** Desviador del retorno: al depósito o al vaso. */
  diverter: 'sump' | 'beaker';
  beakerAt: 'outlet' | 'bench';
  beakerVol: number;
  /** Comienzo y fin de la última recolección (s). */
  startT: number;
  endT: number;
  overflowed: boolean;
}

export interface TimerState {
  running: boolean;
  startT: number;
  elapsed: number;
  /** Cuándo se arrancó y se detuvo por última vez (s de simulación). */
  startedAt: number;
  stoppedAt: number;
}

/** Copia del montaje en un instante (va con cada lectura). */
export interface F12Setup {
  speed: number;
  valve: number;
  spool: SpoolKind;
  series: number;
  rateHz: number;
  mode: 'gauge' | 'abs';
  range: number;
  /** Solo docente: caudal verdadero en el Venturi (L/s) y velocidad en la garganta (m/s). */
  trueQ: number;
  trueV2: number;
}

export type ReadingKindF12 = 'pressure' | 'flow' | 'diameter' | 'height' | 'level' | 'volume' | 'time';

export interface ReadingF12 {
  id: string;
  trialId: string;
  kind: ReadingKindF12;
  instrumentId: string;
  value: number;
  unit: 'kPa' | 'L/s' | 'cm' | 'mL' | 's';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió: canal 'ch1'…'ch3', 'meter', 'D1'/'D2', 'port1'…, 'sump', 'beaker', 'timer'. */
  target?: string;
  /** Canal, cara del calibre o sensor. */
  face?: 'inner' | 'outer';
  series?: number;
  /** Lecturas tomadas con caudal (true) o con la bomba detenida (false). */
  flowing?: boolean;
  spool?: SpoolKind;
  setup?: Partial<F12Setup>;
  configVersion: number;
}

export interface SafetyStateF12 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F12Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': Bernoulli ideal (sin pérdidas en el tramo de ensayo, sin ruido); 'REALISTIC': pérdidas y sensores reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  rho: number;
  pAtmKPa: number;
  /** Diámetros interiores (m) y pared del tubo (m). */
  D1: number;
  D2: number;
  wallM: number;
  /** Bomba centrífuga: Δp = H0 n² − kq Q² (Pa; Q en m³/s) y constante de tiempo del rotor (s). */
  pump: { H0: number; kq: number; tauS: number; pulse: number; pulseHz: number };
  /** Coeficientes de pérdida: aguas arriba (ref. v1), cono convergente y difusor (ref. v2), tramo liso y rugoso y
   *  retorno (ref. v1), válvula por posición (ref. v1; Infinity = cerrada). */
  K: { up: number; conv: number; diff: number; smooth: number; rough: number; ret: number; valve: number[] };
  /** Inercia hidráulica: largos equivalentes (m) aguas arriba, en el tramo de ensayo y aguas abajo. */
  lenM: { up: number; test: number; down: number };
  /** Volumen interior del circuito (cm³) y aire que queda atrapado sin purgar. */
  pipeCm3: number;
  trapCm3: number;
  purgeCm3S: number;
  /** Celeridad de la onda de presión en la tubería flexible (m/s) y tiempo de maniobra lento (s). */
  waveC: number;
  slowCloseS: number;
  /** Presión de apertura de la válvula de alivio (Pa) y límite de los sensores (Pa). */
  pSafe: number;
  pDamage: number;
  sump0: number;
  leakK: number;
  sensor: { ranges: number[]; resolutions: number[]; offsetKPa: number; uncalScale: number; tauS: number; airTauS: number; airKPa: number; noiseKPa: number; damageKPa: number };
  rates: number[];
  meter: { rangeLs: number; resLs: number; tauS: number; k: number; noiseLs: number };
  caliperResCm: number;
  rulerResCm: number;
  sumpResCm: number;
  beaker: { capML: number; resML: number; overML: number };
  timerResS: number;
  /** Reacción humana del cronómetro (s): desfase máximo entre desviar y arrancar o detener. */
  timingS: number;
  clampDriftCmS: number;
  settleS: number;
  noiseFactor: number;
  uB: { sensorKPa: number; meterLs: number; caliperCm: number; rulerCm: number; beakerML: number; timerS: number; sumpCm: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F12World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F12Params;
  mode: string;
  objects: Record<string, F12Object>;
  circuit: CircuitState;
  pump: PumpState;
  valve: ValveState;
  flow: FlowState;
  ports: Record<PortId, PortState>;
  sensors: Record<SensorId, SensorState>;
  logger: { rateHz: number; mode: 'gauge' | 'abs'; rangeIdx: number };
  series: SeriesState;
  collect: CollectState;
  timer: TimerState;
  /** Agua del depósito colector, derramada sobre la mesada y en la toalla (cm³). */
  sump: number;
  spill: number;
  mopped: number;
  /** Tapón de goma: sobre la mesada o dentro del tubo. */
  stopper: 'bench' | 'pipe';
  /** Elevación de cada toma sobre la mesada (cm). */
  tapZ: Record<PortId, number>;
  /** Venturi montado al revés (F12-S09). */
  reversed: boolean;
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF12>;
  readingOrder: string[];
  safety: SafetyStateF12;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { waterCm3: number };
}
