/**
 * Estado del mundo de F09 — movimiento circular, torque y momento angular. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). La dinámica se integra en SI: el ángulo de la
 * mesa giratoria θ (rad, + antihorario visto desde arriba), su velocidad ω (rad/s), radios en m, torques en N·m,
 * momentos de inercia en kg·m² y energías en J. Las lecturas conservan la unidad del instrumento: g de la balanza, cm
 * de la regla radial, N del sensor de fuerza y del dinamómetro, s del cronómetro de la fotopuerta y rad/s del encoder
 * (y rad/s² de su ajuste lineal ω(t)).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { GateTimerParams } from '../instruments/photogate';
import type { ForceSensorParams } from '../instruments/force-sensor';

export type { Pose, Severity, SimEvent };

export type F09ObjKind =
  | 'base' | 'guard' | 'hub' | 'guide' | 'orbitMass' | 'radialMass' | 'pullRing' | 'drum' | 'dynamometer' | 'brake' | 'motor'
  | 'forceSensor' | 'gate' | 'encoder' | 'logger' | 'balance' | 'radialRuler' | 'massRack' | 'level';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F09Object {
  id: string;
  kind: F09ObjKind;
  pose: Pose;
  /** 'bench', 'rack' (estante de masas), 'guide' (guía radial), 'bar' (barra de masas radiales), 'balance', 'hand'. */
  support: string;
  movable: boolean;
}

export type SlideId = 'slide1' | 'slide2';
export type MassId = 'orbit01' | SlideId;

/** Mesa giratoria: plataforma Ø 60 cm con su eje, tambor de torque y barra de masas radiales. */
export interface RotorState {
  theta: number;
  omega: number;
  /** Freno ajustable: 0 suelto, 1 roce (arrastre), 2 retención. */
  brake: 0 | 1 | 2;
  /** Inclinación del eje respecto de la vertical (°): el soporte sin nivelar hace que el eje precese (F09-E17). */
  tiltDeg: number;
  /** Protección de sobrevelocidad disparada (el freno actúa solo). */
  tripped: boolean;
}

/** Masa orbitante sobre la guía radial, atada por un cordón que pasa por el eje hasta el sensor de fuerza. */
export interface OrbitState {
  /** Radio del centro de la masa (m) fijado por el largo del cordón. */
  r: number;
  /** Tope radial de la guía trabado. */
  stopLocked: boolean;
  /** Cordón con holgura (m): la masa se va hacia afuera hasta tensarlo y la tensión cae a cero a ratos (F09-E19). */
  slackM: number;
  /** La masa salió de la guía y quedó contra la guarda (F09-E01). */
  off: boolean;
}

/** Masa radial gemela sobre la barra: radio (m), pasador de bloqueo y cordón central que la sostiene. */
export interface SlideState {
  r: number;
  locked: boolean;
}

/** Tambor escalonado de torque con su cordón y el dinamómetro de fuerza constante en el carro del canto. */
export interface DrumState {
  /** Radio de la ranura en uso (brazo de palanca, m). */
  armR: number;
  /** Vueltas de cordón enrolladas al empezar y sentido (+1 antihorario, −1 horario). */
  turns: number;
  dir: 1 | -1;
  /** Ángulo ya desenrollado (rad, con signo del sentido). */
  unwound: number;
  /** Fuerza que el carro sostiene en el dinamómetro (N) y ángulo del cordón fuera del plano del tambor (°). */
  pullN: number;
  aimDeg: number;
  pulling: boolean;
}

export interface MotorState {
  /** Consigna (rad/s) y embrague acoplado. */
  target: number;
  clutch: boolean;
  /** Torque que entrega en este subpaso (N·m). */
  tau: number;
}

export interface EncoderState {
  connected: boolean;
  scale: number;
  calibrated: boolean;
}

export interface ForceSensorState {
  connected: boolean;
  offset: number;
  zeroed: boolean;
  scale: number;
  rangeIdx: number;
  /** Ángulo del sensor respecto del cordón (°): mide T cos α (F09-E26). */
  angleDeg: number;
}

export interface GateState {
  connected: boolean;
  /** El cable del sensor de fuerza está sujeto con su presilla; suelto, cuelga frente al haz (F09-E25). */
  cableRouted: boolean;
}

export interface DynState {
  /** Corrimiento del cero del dinamómetro (N) y si se ajustó. */
  offset: number;
  zeroed: boolean;
}

export interface BaseState {
  clamped: boolean;
  /** Giro acumulado de la base sin sujetar por la reacción del torque (rad, F09-E28). */
  driftRad: number;
  guardClosed: boolean;
}

/** Copia del montaje en un instante (va con cada lectura). */
export interface RunSetup {
  orbitR: number;
  orbitOn: boolean;
  slack: boolean;
  slides: [number, number];
  locked: [boolean, boolean];
  armR: number;
  dir: number;
  turns: number;
  pullN: number;
  aimDeg: number;
  brake: number;
  clutch: boolean;
  motorTarget: number;
  tiltDeg: number;
  baseClamped: boolean;
  guardClosed: boolean;
  enc: { connected: boolean; calibrated: boolean; scale: number };
  force: { connected: boolean; zeroed: boolean; angleDeg: number; range: number };
  gate: { connected: boolean; cableRouted: boolean };
  rateHz: number;
  damaged: boolean;
  /** Momento de inercia verdadero de la mesa (solo docente, kg·m²) y roce del eje (N·m). */
  trueI: number;
  frictionNm: number;
}

/** Muestra del registrador: [t (s), θ verdadero (rad), ω (rad/s), τ del cordón verdadero (N·m)]. */
export type RunSample = [number, number, number, number];

/** Ensayo de torque: del tirón del dinamómetro hasta que la mesa gira libre unos segundos. */
export interface PullRun {
  id: number;
  startS: number;
  samples: RunSample[];
  /** Instante (s desde el inicio) en que el cordón se soltó del tambor y ω verdadera entonces. */
  endT: number | null;
  endOmega: number | null;
  startOmega: number;
  peakOmega: number;
  overspeedT: number | null;
  brakeT: number | null;
  configChangedT: number | null;
  driftRad: number;
  done: boolean;
  nextT: number;
  setup: RunSetup;
  configVersion: number;
}

/** Condición de giro: cada cambio de consigna del motor (o tirón, o recogida de masas) abre un ensayo con su trialId. */
export interface SpinTrial {
  id: number;
  startS: number;
  surge: boolean;
  configChangedT: number | null;
  driftRad: number;
  brakeT: number | null;
  motorDuringPull: boolean;
  asymPull: boolean;
  pulledIn: boolean;
  forceRead: boolean;
}

/** Cronometraje de n vueltas con la fotopuerta (el borde de la plataforma corta el haz). */
export interface TimingState {
  turns: number;
  startS: number;
  startTheta: number;
  trial: number;
  accel: boolean;
}

export interface ReadingF9 {
  id: string;
  trialId: string;
  kind: 'mass' | 'radius' | 'force' | 'period' | 'omega' | 'encoder' | 'dyn';
  instrumentId: string;
  value: number;
  unit: 'g' | 'cm' | 'N' | 's' | 'rad/s' | 'rad/s²';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'UNCALIBRATED', 'PARALLAX', 'CLIPPED', 'UNSTABLE', 'EDGE_REF', 'HALF_TURN', 'OCCLUDED', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('orbit01', 'slide1', 'arm', 'rotor'…). */
  target?: string;
  /** Período: vueltas cronometradas. */
  turns?: number;
  /**
   * Encoder: pendiente del ajuste lineal ω(t) durante el tirón (α) y del tramo libre (α_c), ω al soltar y número de
   * muestras. Campos sin dato en null (NaN no sobrevive al JSON).
   */
  fit?: { alpha: number | null; alphaC: number | null; n: number; nc: number; trueAlpha: number | null; trueAlphaC: number | null; trueTau: number | null; trueI: number | null };
  setup?: Partial<RunSetup>;
  configVersion: number;
}

export interface SafetyStateF9 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F09Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin roce ni ruido); 'REALISTIC': roce del eje, inclinación del soporte y sensores reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  /** Inercia de la mesa (plataforma, eje, tambor, guía con contrapeso y barra) sin las masas (kg·m²). */
  I0: number;
  orbitKg: number;
  orbitMinR: number;
  /** Tope radial (m) y fin físico de la guía (m). */
  orbitStopR: number;
  orbitMaxR: number;
  /** Medio ancho radial de la masa orbitante (m): la regla leída al borde da r − w/2 (F09-E05). */
  orbitHalf: number;
  slackM: number;
  slideKg: number;
  slideMinR: number;
  slideMaxR: number;
  /** Velocidad radial de las masas al recoger el cordón central (m/s). */
  pullSpeed: number;
  armRadii: number[];
  maxCordTurns: number;
  /** Roce del eje (N·m) en modo realista, roce adicional configurable y roce por desbalance (k U ω²). */
  bearingNm: number;
  frictionNm: number;
  imbalanceK: number;
  /** Roce adicional por grado de inclinación del eje (N·m/°) (precesión y fuerzas laterales, F09-E17). */
  tiltNmPerDeg: number;
  brakeNm: [number, number, number];
  /** Motor: ganancia (N·m·s), torque máximo (N·m) y salto de consigna que se considera brusco (rad/s, F09-E09). */
  motorKp: number;
  motorMaxNm: number;
  surgeRad: number;
  omegaMax: number;
  /** Rozamiento de la masa radial con la barra cuando un cordón estirado la deja correr (F09-E04, m). */
  creepSlideM: number;
  /** Giro de la base sin sujetar por N·m de reacción (rad/(N·m·s)) y tope (rad). */
  baseCreepK: number;
  baseCreepMax: number;
  guardR: number;
  noiseFactor: number;
  encoderResRad: number;
  encoderUncalScale: number;
  force: ForceSensorParams;
  /** Dinamómetro: alcance (N), resolución (N) y corrimiento sin ajustar (N). */
  dyn: { rangeN: number; resN: number; offsetN: number };
  gate: GateTimerParams;
  rates: number[];
  balanceResolutionG: number;
  rulerResCm: number;
  uB: { balanceG: number; rulerCm: number; forceN: number; gateS: number; encoderRad: number; dynN: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F09World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F09Params;
  mode: string;
  objects: Record<string, F09Object>;
  rotor: RotorState;
  orbit: OrbitState;
  slides: Record<SlideId, SlideState>;
  /** Radio al que el cordón central está llevando las masas radiales sueltas (m) o null si quieto. */
  pullTarget: number | null;
  drum: DrumState;
  motor: MotorState;
  base: BaseState;
  encoder: EncoderState;
  force: ForceSensorState;
  gate: GateState;
  dyn: DynState;
  logger: { rateHz: number };
  /** Guía doblada tras la salida de la masa (F09-E39). */
  damaged: boolean;
  balance: { on: string | null; placedS: number; offsetG: number; tared: boolean };
  spin: SpinTrial | null;
  timing: TimingState | null;
  run: PullRun | null;
  runs: PullRun[];
  /** Ventana de ω de los últimos 2 s [t, ω] para el encoder y la estabilidad. */
  omegaLog: Array<[number, number]>;
  /** Balances: energía disipada, trabajo externo (manos, motor, dinamómetro, cordón central) y trabajo interno (J). */
  energy: { dissipatedJ: number; externalJ: number; motorJ: number; pullJ: number };
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF9>;
  readingOrder: string[];
  safety: SafetyStateF9;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
