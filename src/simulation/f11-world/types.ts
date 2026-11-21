/**
 * Estado del mundo de F11 — hidrostática, densidad y flotación. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). El tanque se describe con su coordenada propia
 * (x local de 0 a 60 cm desde la pared izquierda; z de 0 en el fondo interior a 45 en el borde). Los volúmenes de
 * líquido en cm³ (= mL), las masas en g, las densidades en kg/m³, las presiones del dominio en Pa (la sonda indica kPa)
 * y las fuerzas en N. Las lecturas conservan la unidad del instrumento: kPa de la sonda, cm de la regla de la guía, de
 * la escala de nivel, de la escala de calado y de la guía de inmersión, N del dinamómetro, g de la balanza y mL de la
 * probeta.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';

export type { Pose, Severity, SimEvent };

export type F11ObjKind =
  | 'tank' | 'tap' | 'reservoir' | 'pump' | 'drain' | 'agitator' | 'scale' | 'guide' | 'probe' | 'ruler' | 'holder' | 'logger'
  | 'floater' | 'bottle' | 'block' | 'ballast' | 'rack' | 'balance' | 'cylinder' | 'can' | 'catch' | 'dynamometer' | 'stand' | 'towel' | 'waste';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F11Object {
  id: string;
  kind: F11ObjKind;
  pose: Pose;
  /** 'bench', 'rack', 'tank', 'balance', 'stand', 'hand'… */
  support: string;
  movable: boolean;
}

/** Líquido A (agua del grifo) y B (salmuera del depósito). */
export type FluidId = 'A' | 'B';

/** Volumen por líquido (cm³). La masa sale de la densidad de cada uno. */
export type Volumes = Record<FluidId, number>;

export interface TankState {
  vol: Volumes;
  /** Estratificación de la salmuera (0 homogénea … 1 perfil completo, F11-S10). */
  strat: number;
  /** Hasta cuándo hay oleaje en la superficie (s de simulación). */
  waveUntil: number;
  /** Tubo de rebose a 43 cm (F11-S06): el exceso sale por él en lugar de derramarse. */
  overflowPipe: boolean;
  /** Tiempo acumulado con el agitador encendido desde que entró la salmuera (s). */
  agitatedS: number;
}

export interface ValvesState {
  tap: boolean;
  pump: boolean;
  drain: boolean;
  agitator: boolean;
}

export type ProbeMount = 'holder' | 'guide';

export interface ProbeState {
  mount: ProbeMount;
  /** Posición del carro de la guía (x local del tanque, cm) y altura de la membrana sobre el fondo (cm). */
  gx: number;
  z: number;
  locked: boolean;
  /** Bajada acumulada por la guía floja desde la última vez que se fijó la cota (cm, F11-E28). */
  driftCm: number;
  connected: boolean;
  rangeIdx: number;
  /** Sonda absoluta (F11-S08): indica p_atm + ρ g h y no admite cero. */
  absolute: boolean;
  offset: number;
  zeroed: boolean;
  /** El último cero se hizo con la membrana sumergida (F11-E01). */
  badZero: boolean;
  scale: number;
  calibrated: boolean;
  /** Burbuja atrapada en la membrana (F11-E03) y si la sonda ya se sumergió alguna vez. */
  bubble: boolean;
  bubbleArmed: boolean;
  wetted: boolean;
  /** Presión que «ve» la membrana con su retardo de primer orden (kPa, relativa). */
  lagKPa: number;
  /** Membrana golpeada contra el fondo (F11-E39). */
  damaged: boolean;
  movedAt: number;
}

export interface SeriesState {
  id: number;
  /** Lecturas de presión de la serie actual, densidad con que empezó y cambio de montaje a mitad (F11-E32). */
  n: number;
  rho0: number | null;
  configChanged: boolean;
}

export type FloatId = 'float1' | 'bottle1' | 'alu1';
export type FloatPlace = 'rack' | 'tank' | 'balance' | 'bench' | 'dyn';

export interface FloatState {
  where: FloatPlace;
  /** Centro en x local del tanque (cm), altura de la base sobre el fondo (cm) y velocidad vertical (cm/s). */
  x: number;
  zb: number;
  v: number;
  /** Hilo atado (F11-E09): con el hilo tenso no flota libre. */
  tethered: boolean;
  /** Apoyado sobre otro objeto (F11-E15). */
  on: FloatId | null;
  /** Lastre de la botella (g). */
  ballastG: number;
  sank: boolean;
}

export type CatchPlace = 'rack' | 'spout' | 'balance';
export type BalanceItem = FloatId | 'cyl' | 'catch';

export interface CanState {
  /** Agua en el vaso de rebose (cm³). */
  vol: number;
  catchAt: CatchPlace;
  catchVol: number;
  /** Hay una inmersión en curso (el bloque desplaza agua). */
  episode: boolean;
  /** El colector junta agua de una inmersión que empezó sin cebar (F11-E11), con derrame por el pico sin colector, o
   *  se retiró mientras el pico goteaba (F11-E30). Se borran al vaciarlo. */
  catchUnprimed: boolean;
  catchSpill: boolean;
  catchDripping: boolean;
  /** Fin del goteo del cebado: lo que sale antes va a la bandeja (s). */
  dripUntil: number;
}

export interface StandState {
  /** Altura de la base del bloque sobre el fondo del vaso (cm), consigna y referencia de la guía de inmersión. */
  zb: number;
  target: number;
  ref: number | null;
  /** La referencia se tomó con el bloque fuera de la superficie (F11-E21). */
  badRef: boolean;
  movedAt: number;
}

export interface DynState {
  offset: number;
  zeroed: boolean;
  aimDeg: number;
  holding: boolean;
  hungAt: number;
}

export interface BalanceState {
  on: BalanceItem | null;
  offset: number;
  zeroed: boolean;
  /** Con qué se taró (null = plato vacío) y si el recipiente estaba vacío (F11-E10). */
  taredWith: BalanceItem | null;
  taredEmpty: boolean;
}

export interface CylinderState {
  vol: number;
  where: 'rack' | 'balance';
}

/** Copia del montaje en un instante (va con cada lectura). */
export interface F11Setup {
  fluid: 'A' | 'B' | 'mix' | 'empty';
  level: number;
  z: number;
  gx: number;
  sensor: 'gauge' | 'absolute';
  range: number;
  rateHz: number;
  series: number;
  /** Solo docente: densidad verdadera del líquido del tanque (kg/m³), profundidad verdadera (cm) y estratificación. */
  trueRho: number;
  trueH: number;
  strat: number;
}

export type ReadingKindF11 = 'pressure' | 'ruler' | 'level' | 'draft' | 'weight' | 'mass' | 'volume' | 'immersion';

export interface ReadingF11 {
  id: string;
  trialId: string;
  kind: ReadingKindF11;
  instrumentId: string;
  value: number;
  unit: 'kPa' | 'cm' | 'N' | 'g' | 'mL';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NO_ZERO', 'BUBBLE', 'WALL', 'WAVES', 'MIXED', 'UNSTABLE', 'CLIPPED', 'PARALLAX', 'TETHERED', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('surface', 'tank', 'float1', 'cyl', 'catch', 'air', 'water'…). */
  target?: string;
  /** Serie del perfil de presión. */
  series?: number;
  /** Líquido del tanque o del recipiente al leer. */
  fluid?: string;
  /** Lastre de la botella al leer su masa o su calado (g). */
  ballastG?: number;
  setup?: Partial<F11Setup>;
  configVersion: number;
}

export interface SafetyStateF11 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface SolidProps {
  /** Medidas (cm): bloque L × W × H; botella diámetro d y alto H. */
  L: number;
  W: number;
  H: number;
  rho: number;
}

export interface F11Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (ρ_agua = 1000, sin ruido ni burbujas); 'REALISTIC': agua a 20 °C, sensores reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  rhoA: number;
  rhoB: number;
  pAtmKPa: number;
  tank: { L: number; W: number; H: number; overflowCm: number };
  fillCm: number;
  flows: { tap: number; pump: number; drain: number };
  resB0: number;
  waveS: number;
  waveAmpCm: number;
  stratDelta: number;
  agitateTauS: number;
  /** Viscosidad dinámica del líquido (Pa·s): fija el amortiguamiento de los cuerpos que flotan. */
  viscosity: number;
  probe: {
    ranges: number[]; resolutions: number[]; absRange: number; absRes: number; offsetKPa: number; uncalScale: number; tauS: number; bubbleTauS: number;
    bubbleKPa: number; damageKPa: number; wallKPa: number; noiseKPa: number; driftCmS: number; bubbleChance: number;
  };
  rates: number[];
  rulerResCm: number;
  levelResCm: number;
  draftResCm: number;
  standResCm: number;
  dyn: { rangeN: number; resN: number; offsetN: number };
  balance: { rangeG: number; resG: number; offsetG: number };
  cyl: { capML: number; resML: number; fillML: number; spreadML: number; dryG: number };
  can: { dCm: number; spoutCm: number; initCm: number };
  catchDryG: number;
  block: SolidProps;
  alu: SolidProps;
  bottle: SolidProps & { dryG: number };
  ballasts: number[];
  stand: { speedCmS: number; maxCm: number };
  settleS: number;
  noiseFactor: number;
  uB: { probeKPa: number; rulerCm: number; levelCm: number; draftCm: number; standCm: number; dynN: number; balanceG: number; cylML: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F11World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F11Params;
  mode: string;
  objects: Record<string, F11Object>;
  tank: TankState;
  valves: ValvesState;
  /** Depósito de salmuera (cm³), residuos (por líquido), derrame sobre la mesada, rebose del tubo y lo secado con la toalla. */
  resB: number;
  waste: Volumes;
  spill: Volumes;
  overflow: Volumes;
  /** Agua aportada por el grifo (cm³): flujo externo del balance. */
  supplied: number;
  probe: ProbeState;
  logger: { rateHz: number };
  series: SeriesState;
  floats: Record<FloatId, FloatState>;
  can: CanState;
  stand: StandState;
  dyn: DynState;
  balance: BalanceState;
  cyl: CylinderState;
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF11>;
  readingOrder: string[];
  safety: SafetyStateF11;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { liquidCm3: number; massesG: number };
}
