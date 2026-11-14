/**
 * Estado del mundo de F08 — rotación de cuerpos rígidos y momento de inercia. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). La dinámica se integra en SI: el ángulo del
 * rotor θ (rad, + antihorario visto desde arriba), su velocidad ω (rad/s), la caída de la masa colgante y (m, + hacia
 * abajo), torques en N·m, momentos de inercia en kg·m² y energías en J. Las lecturas conservan la unidad del
 * instrumento: g de la balanza, cm del calibre y de la regla radial, ° del transportador y del encoder, rpm del
 * tacómetro, N del indicador de tensión y s de la fotopuerta. El encoder entrega los coeficientes de su ajuste
 * cuadrático θ(t) = a + b t + c t² en rad, rad/s y rad/s².
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { GateTimerParams } from '../instruments/photogate';
import type { ForceSensorParams } from '../instruments/force-sensor';

export type { Pose, Severity, SimEvent };

export type F08ObjKind =
  | 'base' | 'guard' | 'hub' | 'solid' | 'slideMass' | 'solidRack' | 'pulley' | 'dropMass' | 'massRack' | 'dropColumn' | 'catch' | 'gate'
  | 'encoder' | 'tach' | 'tensionSensor' | 'logger' | 'balance' | 'caliper' | 'radialRuler';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F08Object {
  id: string;
  kind: F08ObjKind;
  pose: Pose;
  /** 'bench', 'rack', 'hub', 'bar01', 'hook', 'balance', 'massRack', 'hand'. */
  support: string;
  movable: boolean;
}

export type SolidId = 'disc01' | 'ring01' | 'bar01';
export type SlideId = 'slide1' | 'slide2';
export type DropId = 'drop20' | 'drop50' | 'drop100';

/** Rotor: plataforma con su eje y tambor, más el sólido montado. */
export interface RotorState {
  theta: number;
  omega: number;
  /** Sólido acoplado al eje (o null), agujero usado (m del centro) y excentricidad de montaje (m). */
  solid: SolidId | null;
  hole: number;
  ecc: number;
  /** Freno de mano del eje, dedo sobre la tapa del eje (roce, E11) y protección de sobrevelocidad disparada. */
  brake: boolean;
  touch: boolean;
  tripped: boolean;
}

/** Masa corrediza sobre la barra: radio (m, desde el centro de la barra) y fijador. Lado + (1) o − (2). */
export interface SlideState {
  r: number;
  locked: boolean;
}

/** Cuerda enrollada en el tambor y masa colgante. */
export interface StringState {
  /** Radio del escalón del tambor en uso (m). */
  drumR: number;
  /** Vueltas enrolladas al soltar y ángulo ya desenrollado desde entonces (rad). */
  turns: number;
  unwound: number;
  /** Lazo enganchado en el pasador del tambor (se suelta al desenrollarse del todo). */
  attached: boolean;
  /** Masa colgada del gancho o null. */
  mass: DropId | null;
  /** La mano sostiene la masa (antes de soltar): la cuerda no tira. */
  held: boolean;
  /** Altura de la base de la masa al soltar (cm de la sala), caída desde entonces (m) y su velocidad (m/s, + hacia abajo). */
  z0: number;
  y: number;
  v: number;
  /** La masa quedó apoyada (en el tope o en el suelo). */
  landed: boolean;
  /** Altura de la polea respecto del tambor (cm): la cuerda sale inclinada si no coinciden (E10). */
  pulleyDzCm: number;
}

export interface DropColumnState {
  /** Tope blando colocado y su altura (cm de la sala, negativa bajo la mesada); fotopuerta y su altura. */
  catchOn: boolean;
  catchZ: number;
  gateZ: number;
}

export interface EncoderState {
  connected: boolean;
  /** Ángulo verdadero del rotor donde se puso el cero (rad) y desalineación respecto de la marca (rad). */
  zeroAt: number;
  zeroed: boolean;
  zeroErr: number;
  /** Factor de escala (cuentas por vuelta mal configuradas = 400/360) y sentido de conteo. */
  scale: number;
  calibrated: boolean;
  dir: 1 | -1;
}

export interface TensionState {
  connected: boolean;
  offset: number;
  zeroed: boolean;
  scale: number;
  rangeIdx: number;
  angleDeg: number;
}

export interface TachState {
  connected: boolean;
  rangeIdx: number;
}

export interface LoggerState {
  rateHz: number;
  gateConnected: boolean;
}

export interface BaseState {
  clamped: boolean;
  /** Corrimiento del soporte hacia la polea (m) cuando la base no está sujeta (E28). */
  driftM: number;
  guardClosed: boolean;
}

export interface RunSetup {
  solid: SolidId | null;
  hole: number;
  eccMm: number;
  slides: [number, number];
  locked: [boolean, boolean];
  drumR: number;
  turns: number;
  mass: DropId | null;
  massKg: number;
  catchOn: boolean;
  catchZ: number;
  gateZ: number;
  z0: number;
  stringDeg: number;
  baseClamped: boolean;
  guardClosed: boolean;
  enc: { connected: boolean; zeroed: boolean; zeroErrDeg: number; calibrated: boolean; dir: number; scale: number };
  ten: { connected: boolean; zeroed: boolean; angleDeg: number; range: number };
  tach: { connected: boolean; range: number };
  gateConnected: boolean;
  rateHz: number;
  damaged: boolean;
  startOmega: number;
  overlap: boolean;
  asym: boolean;
  /** Momento de inercia verdadero del rotor al soltar (solo docente, kg·m²) y roce del eje (N·m). */
  trueI: number;
  frictionNm: number;
}

/** Muestra del registrador: [t (s), θ verdadero (rad), ω (rad/s), T verdadera (N), caída y (m)]. */
export type RunSample = [number, number, number, number, number];

export interface RunRecord {
  id: number;
  startS: number;
  samples: RunSample[];
  /** Instante en que la cuerda dejó de tirar (s desde el inicio) y ángulo y ω verdaderos entonces. */
  slackT: number | null;
  slackTheta: number | null;
  slackOmega: number | null;
  /** Máximo de |ω| del ensayo (lo retiene el tacómetro). */
  peakOmega: number;
  /** Cruce de la masa por la fotopuerta: entrada, salida (s) y velocidad verdadera. */
  gateIn: number | null;
  gateOut: number | null;
  gateV: number | null;
  groundT: number | null;
  touchT: number | null;
  overspeedT: number | null;
  slidT: number | null;
  configChangedT: number | null;
  guardHitT: number | null;
  driftM: number;
  done: boolean;
  nextT: number;
  stillS: number;
  setup: RunSetup;
  configVersion: number;
}

export interface ReadingF8 {
  id: string;
  trialId: string;
  kind: 'mass' | 'length' | 'scale' | 'angle' | 'radius' | 'encoder' | 'tension' | 'tach' | 'gate';
  instrumentId: string;
  value: number;
  unit: 'g' | 'cm' | '°' | 'rad/s²' | 'N' | 'rpm' | 's';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'ENC_OFFSET', 'REVERSED', 'UNCALIBRATED', 'PARALLAX', 'CLIPPED', 'LOW_RATE', 'UNSTABLE', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('disc01', 'drum', 'slide1', 'rotor'…). */
  target?: string;
  /**
   * Encoder: coeficientes del ajuste cuadrático del tramo con la cuerda tensa (a, b, c) y del tramo libre (cc), instante
   * en que la cuerda dejó de tirar y número de muestras. Campos sin dato en null (NaN no sobrevive al JSON).
   */
  fit?: { a: number | null; b: number | null; c: number | null; cc: number | null; tS: number | null; n: number; nc: number; trueAlpha: number | null; trueAlphaC: number | null; trueOmegaS: number | null; trueThetaS: number | null; trueI: number | null };
  /** Tacómetro: lectura instantánea o retenida (máximo del ensayo). */
  tach?: { peak: boolean; trueRpm: number | null };
  /** Fotopuerta de la masa: tiempo de bloqueo y velocidad verdadera. */
  gate?: { dt: number | null; trueV: number | null };
  setup?: Partial<RunSetup> & { load?: number };
  configVersion: number;
}

export interface SafetyStateF8 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface SolidSpec {
  M: number;
  /** Radio exterior (disco y aro) o largo (barra), m. */
  R: number;
  /** Momento de inercia respecto de su centro (kg·m²), sin las masas corredizas. */
  Icm: number;
  /** Radio máximo que barre al girar (m), para la guarda. */
  reach: number;
}

export interface F08Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin roce ni ruido); 'REALISTIC': roce de rodamientos, desbalance y sensores reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  /** Inercia de la plataforma giratoria con su eje y tambor (kg·m²). */
  I0: number;
  disc: { M: number; R: number };
  ring: { M: number; R: number };
  bar: { M: number; L: number };
  slideKg: number;
  slideMinR: number;
  slideMaxR: number;
  holes: number[];
  ringEccMaxMm: number;
  drumRadii: number[];
  layerTurns: number;
  stringDr: number;
  dropKg: Record<DropId, number>;
  /** Roce de los rodamientos (N·m) en modo realista y roce adicional configurable por el docente. */
  bearingNm: number;
  frictionNm: number;
  /** Roce por desbalance: τ = k U ω² con U el desbalance (kg·m). */
  imbalanceK: number;
  brakeNm: number;
  touchNm: number;
  omegaMax: number;
  slideMu: number;
  /** Distancia horizontal del tambor a la polea (m) y desalineación sembrada de la polea (cm, máximo). */
  pulleyDist: number;
  pulleyDzMax: number;
  /** Deriva de la base sin sujetar: velocidad por newton de tensión (m/s/N) y tope (m). */
  creepK: number;
  creepMax: number;
  /** Radio de la guarda (m). */
  guardR: number;
  noiseFactor: number;
  encoderResDeg: number;
  encoderUncalScale: number;
  tension: ForceSensorParams;
  tach: { ranges: number[]; resolutions: number[]; noiseRpm: number };
  gate: GateTimerParams;
  rates: number[];
  balanceResolutionG: number;
  caliperResCm: number;
  protractorResDeg: number;
  rulerResCm: number;
  uB: { balanceG: number; caliperCm: number; protractorDeg: number; rulerCm: number; encoderDeg: number; tensionN: number; tachRpm: number; gateS: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F08World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F08Params;
  mode: string;
  objects: Record<string, F08Object>;
  rotor: RotorState;
  slides: Record<SlideId, SlideState>;
  string: StringState;
  column: DropColumnState;
  base: BaseState;
  encoder: EncoderState;
  tension: TensionState;
  tach: TachState;
  logger: LoggerState;
  /** Sólidos golpeados contra la guarda (E39) y excentricidad de montaje sembrada del aro (m). */
  damaged: Record<SolidId, boolean>;
  ringPlay: number;
  /** Ángulo verdadero del rotor donde está la marca 0 del transportador (rad). */
  markTheta: number;
  balance: { on: string | null; placedS: number; offsetG: number; tared: boolean };
  run: RunRecord | null;
  runs: RunRecord[];
  /** Balances: energía disipada y trabajo externo (J). */
  energy: { dissipatedJ: number; externalJ: number };
  /** Tensión verdadera de la cuerda en el último subpaso (N). */
  lastT: number;
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF8>;
  readingOrder: string[];
  safety: SafetyStateF8;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
