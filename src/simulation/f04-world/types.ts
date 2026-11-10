/**
 * Estado del mundo de F04 — leyes de Newton y sistemas acoplados. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). La dinámica se integra en SI: la coordenada
 * del carril s (m, crece hacia la polea), la profundidad del portapesas bajo el cordel horizontal (m), velocidades en
 * m/s, fuerzas en N, energías en J. Las lecturas conservan la unidad del instrumento: g de la balanza, m/s² del
 * acelerómetro, N de los sensores de fuerza, cm de la escala del carril.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { GateState, GateTimerParams } from '../instruments/photogate';
import type { ForceSensorParams } from '../instruments/force-sensor';
import type { FbdBody, FbdDir, FbdForce, FbdPartner, SensorId } from './commands';

export type { Pose, Severity, SimEvent };

export type F04ObjKind =
  | 'track' | 'cart' | 'latch' | 'brake' | 'stop' | 'pulley' | 'hanger' | 'slotMass' | 'massRack' | 'forceSensor' | 'accelerometer'
  | 'logger' | 'gate' | 'balance' | 'pairTrack' | 'pairCart';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F04Object {
  id: string;
  kind: F04ObjKind;
  pose: Pose;
  /** 'bench', 'track', 'rack', 'hanger01', 'cart01', 'string', 'floor', 'balance', 'pairTrack', 'hand'. */
  support: string;
  movable: boolean;
}

/** Carril nivelable (estación A). */
export interface TrackState {
  /** Inclinación (°, + baja hacia la polea: el peso empuja el carro hacia ella). */
  tiltDeg: number;
  touchedS: number;
  /** Cuántas veces se movió el tornillo (versión del nivel, para vincular lecturas del mismo nivelado). */
  levelVersion: number;
}

/** Carro sobre el carril: centro en s (m) y velocidad (m/s, + hacia la polea). */
export interface CartState {
  s: number;
  v: number;
  latched: boolean;
  /** 'track' o 'balance' (el carro se pesa con sus sensores montados). */
  on: 'track' | 'balance';
  /** Choque fuerte contra el tope: el acelerómetro quedó con un corrimiento hasta reasentarlo (F04-E39). */
  shock: boolean;
}

/** Cordel, polea y portapesas (estación B). */
export interface StringState {
  /** Por dónde pasa el cordel sobre la polea. */
  path: 'groove' | 'axle' | 'none';
  /** Atado al gancho del sensor A del carro. */
  attached: boolean;
  /** Portapesas colgado del extremo libre del cordel. */
  hung: boolean;
  /** Portapesas sostenido a mano (en reposo) con el cordel flojo. */
  held: boolean;
  /** Holgura del cordel (m): 0 tenso. */
  slack: number;
  /** Profundidad del gancho bajo el cordel horizontal (m) y su velocidad (m/s, + hacia abajo). */
  depth: number;
  vh: number;
  /** Portapesas apoyado en el suelo. */
  landed: boolean;
  /** Ángulo de la polea (rad) para dibujarla girar según ω. */
  pulleyAngle: number;
  /** Abrazadera de la polea al canto de la mesada apretada. */
  clamped: boolean;
}

export interface BrakeState {
  on: boolean;
  /** Comienzo de la zona de frenado (m de carril). */
  s: number;
}

export interface SensorState {
  connected: boolean;
  /** Corrimiento de origen sin corregir (N o m/s²). */
  offset: number;
  zeroed: boolean;
  /** Pendiente de calibración (1 = calibrado). */
  scale: number;
  calibrated: boolean;
  rangeIdx: number;
  /** Inclinación del eje del sensor respecto de la línea de la fuerza (°). */
  angleDeg: number;
  /** Signo con que la interfaz proyecta la lectura sobre el eje x de la pista (pareja). */
  axisSign: 1 | -1;
}

export interface LoggerState {
  rateHz: number;
  gatesConnected: boolean;
  /** Cable del sensor A sujeto a la presilla del carro (sin rozar el carril). */
  cableClipped: boolean;
}

/** Muestra del ensayo: [t desde la suelta (s), a indicada (m/s²), T indicada (N), a verdadera, T verdadera, recortada (0/1)]. */
export type RunSample = [number, number, number, number, number, number];

export interface RunRecord {
  id: number;
  releasedS: number;
  samples: RunSample[];
  gates: Record<string, Array<[number, number | null]>>;
  /** Instantes (s desde la suelta) de los sucesos del ensayo (null si no ocurrieron). */
  slackT: number | null;
  landedT: number | null;
  brakeT: number | null;
  impactT: number | null;
  impactV: number;
  configChangedT: number | null;
  clippedT: number | null;
  done: boolean;
  /** Próximo instante de muestreo (s desde la suelta) y tiempo quieto acumulado. */
  nextT: number;
  stillS: number;
  /** Condiciones al soltar. */
  hand: boolean;
  slackAtRelease: boolean;
  setup: RunSetup;
  configVersion: number;
}

export interface RunSetup {
  /** Masa colgante total (g, verdadera) y carga sobre el carro (g). */
  hangLoad: number;
  cartLoad: number;
  g1: number;
  g2: number;
  rateHz: number;
  brakeOn: boolean;
  levelVersion: number;
  tiltDeg: number;
  path: StringState['path'];
  clamped: boolean;
  cableClipped: boolean;
  forceA: { zeroed: boolean; calibrated: boolean; angleDeg: number; connected: boolean; range: number };
  accel: { connected: boolean };
  gatesOn: boolean;
  occluded: string[];
  shock: boolean;
}

/** Pareja de carros de la estación D: posiciones (m sobre su pista) y velocidades (m/s). */
export interface PairState {
  /** Centros de P (izquierda) y Q (derecha) en m desde el extremo izquierdo de su pista. */
  xP: number;
  vP: number;
  xQ: number;
  vQ: number;
  /** Empuje de la mano en curso sobre P (N máximos, duración y tiempo transcurrido). */
  push: { forceN: number; durationS: number; t: number } | null;
  /** Compresión de los parachoques (m) y fuerza de contacto (N). */
  contactN: number;
  active: boolean;
}

/** Muestra de la pareja: [t (s), F_A indicada, F_B indicada, contacto verdadero (N), recortada (0/1)]. */
export type PairSample = [number, number, number, number, number];

export interface PairRecord {
  id: number;
  startS: number;
  samples: PairSample[];
  forceN: number;
  durationS: number;
  done: boolean;
  nextT: number;
  setup: { rateHz: number; signA: number; signB: number; zeroed: boolean; calibrated: boolean; angleA: number; angleB: number; rangeA: number; rangeB: number; connected: boolean };
  configVersion: number;
}

export interface FbdArrow {
  force: FbdForce;
  dir: FbdDir;
  partner: FbdPartner;
}

export interface FbdState {
  arrows: FbdArrow[];
  locked: boolean;
}

export interface ReadingF4 {
  id: string;
  trialId: string;
  kind: 'mass' | 'accelRest' | 'length' | 'run' | 'pair';
  instrumentId: string;
  value: number;
  unit: 'g' | 'm/s²' | 'cm' | 'N';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'UNSTABLE', 'PARALLAX', 'SLACK', 'LANDED', 'BRAKING', 'POST_IMPACT', 'CLIPPED', 'LOW_RATE', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('cart01', 'hanger01', 'gate1', 'track'…). */
  target?: string;
  /** Ensayo del carro: medias de la ventana y tiempos de las compuertas. */
  /** Campos sin dato (canal apagado, compuerta sin paso) quedan en null: NaN no sobrevive al JSON de la cinta. */
  run?: { a: number | null; T: number | null; t0: number; t1: number; n: number; dt1: number | null; dt2: number | null; t1g: number | null; t2g: number | null; trueA: number | null; trueT: number | null };
  /** Pareja: lectura simultánea de los dos sensores en el pico del contacto. */
  pair?: { FA: number | null; FB: number | null; t: number; trueC: number };
  /** Montaje del ensayo o de la pieza leída (para vincular lecturas del mismo montaje). */
  setup?: Partial<RunSetup> & { load?: number; posCm?: number };
  configVersion: number;
}

export interface SafetyStateF4 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F04Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin roce, polea sin inercia); 'REALISTIC': roce, inercia y sensores no ideales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  /** Cuerpo del carro (kg), sensor A y acelerómetro montados (kg). */
  cartBodyKg: number;
  forceSensorKg: number;
  accelKg: number;
  hangerKg: number;
  slotKg: Record<string, number>;
  pairPKg: number;
  pairQKg: number;
  pulleyR: number;
  pulleyI: number;
  /** Roce del rodamiento de la polea (N·m) y del carril (N). */
  bearingTorque: number;
  rollingN: number;
  /** Roce extra del cable que arrastra (N), del cordel en el eje (N) y de la abrazadera floja (N). */
  cableDragN: number;
  axleN: number;
  looseClampN: number;
  brakeB: number;
  stopRestitution: number;
  /** Rapidez de choque contra el tope que cuenta como golpe (m/s) y la que deja el acelerómetro corrido. */
  impactMs: number;
  shockMs: number;
  shockOffset: number;
  holdSlackM: number;
  /** Dispersión de la suelta (m/s) y factor de ruido de los sensores. */
  releaseJitter: number;
  noiseFactor: number;
  pairK: number;
  pairDamping: number;
  pairRollingN: number;
  levelDegPerTurn: number;
  balanceResolutionG: number;
  balanceOffsetG: number;
  scaleResolutionCm: number;
  accelRange: number;
  accelResolution: number;
  accelNoise: number;
  force: ForceSensorParams;
  gate: GateTimerParams;
  rates: number[];
  uB: { balanceG: number; accel: number; forceN: number; scaleCm: number; gateS: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F04World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F04Params;
  mode: string;
  objects: Record<string, F04Object>;
  track: TrackState;
  cart: CartState;
  string: StringState;
  brake: BrakeState;
  /** Cara del tope (m de carril). */
  stopS: number;
  gates: Record<string, GateState>;
  sensors: Record<SensorId, SensorState>;
  logger: LoggerState;
  /** Balanza: objeto sobre el plato, cuándo se colocó, corrimiento sin tarar (g). */
  balance: { on: string | null; placedS: number; offsetG: number; tared: boolean };
  run: RunRecord | null;
  runs: RunRecord[];
  pair: PairState;
  pairRec: PairRecord | null;
  fbd: Record<FbdBody, FbdState>;
  /** Balance de energía (J): disipada y trabajo externo de la mano. */
  energy: { dissipatedJ: number; externalJ: number };
  /** Impulso de la mano sobre la pareja (N·s) y momento de la pareja (control de conservación). */
  momentum: { handImpulse: number };
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF4>;
  readingOrder: string[];
  safety: SafetyStateF4;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
