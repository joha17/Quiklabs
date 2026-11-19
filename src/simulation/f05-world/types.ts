/**
 * Estado del mundo de F05 — rozamiento y dinámica de planos inclinados. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). La dinámica se integra en SI: la coordenada
 * del bloque a lo largo del plano s (m, crece hacia el extremo alto), velocidades en m/s, fuerzas en N, energías en J,
 * ángulos en grados en el estado y en radianes solo dentro de las cuentas. Las lecturas conservan la unidad del
 * instrumento: g de la balanza, N de la célula de carga, ° del goniómetro, cm de la escala del tablero, °C del
 * termómetro.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { GateState, GateTimerParams } from '../instruments/photogate';
import type { ForceSensorParams } from '../instruments/force-sensor';
import type { FbdBody, FbdDir, FbdForce, FbdPartner, Material } from './commands';

export type { Pose, Severity, SimEvent };

export type F05ObjKind =
  | 'plane' | 'block' | 'ballast' | 'massRack' | 'strip' | 'stripRack' | 'puller' | 'loadCell' | 'spring' | 'goniometer' | 'elevator'
  | 'catcher' | 'logger' | 'gate' | 'balance' | 'thermometer';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F05Object {
  id: string;
  kind: F05ObjKind;
  pose: Pose;
  /** 'bench', 'plane', 'rack', 'block01', 'balance', 'hand', 'floor'. */
  support: string;
  movable: boolean;
}

/** Plano inclinable (estaciones A y D). */
export interface PlaneState {
  /** Ángulo del tablero respecto de su base (°), el que marca la escala del elevador. */
  relDeg: number;
  /** Inclinación de la base sobre la mesada (°): el goniómetro de plomada lee relDeg + baseDeg. */
  baseDeg: number;
  /** Tuerca de bloqueo del elevador apretada (sin ella el tablero cede, F05-E03). */
  locked: boolean;
  /** Pie del elevador sujeto a la base (sin la abrazadera el soporte cede con los golpes, F05-E28). */
  clamped: boolean;
  /** Veces que el soporte suelto cedió. */
  shifts: number;
  touchedS: number;
  /** Cuántas veces se movió el tablero (para vincular la lectura del ángulo con el deslizamiento). */
  version: number;
  /** Tamaño del último giro del elevador (°): un salto grueso sobrepasa el ángulo crítico. */
  lastStepDeg: number;
}

export interface SurfaceState {
  material: Material;
  /** Tira rayada por un tirón o un golpe: su rozamiento cambió (F05-E16). */
  worn: Record<Material, boolean>;
  /** El desgaste quedó registrado (se inspeccionó la tira después del daño). */
  wornLogged: Record<Material, boolean>;
}

/** Bloque: centro en s (m), velocidad (m/s, + hacia el extremo alto). */
export interface BlockState {
  on: 'plane' | 'balance' | 'bench';
  s: number;
  v: number;
  /** Desplazamiento lateral del centro sobre el tablero (cm, 0 en el eje). */
  lateralCm: number;
  /** Retenido por el pasador del extremo alto. */
  pinned: boolean;
  /** Tiempo quieto acumulado (s): la adherencia crece con el tiempo de contacto. */
  restS: number;
  /** Bandera torcida por un golpe sin espuma: las compuertas ven otro ancho (F05-E39). */
  flagBent: boolean;
}

/** Cable con el resorte del dinamómetro y el tirador de husillo (estación C). */
export interface PullerState {
  attached: boolean;
  /** Altura del gancho del tirador sobre el tablero (cm); 2 cm = alineado con el gancho del bloque. */
  heightCm: number;
  /** Posición del gancho del tirador (m de plano) y su velocidad de motor (m/s). */
  p: number;
  driveMs: number;
  /** Tensión del cable (N) y estiramiento del resorte (m) en el último subpaso. */
  tensionN: number;
  ext: number;
}

export interface SensorState {
  connected: boolean;
  offset: number;
  zeroed: boolean;
  scale: number;
  calibrated: boolean;
  rangeIdx: number;
  /** Inclinación del eje de la célula respecto del cable (°). */
  angleDeg: number;
}

export interface LoggerState {
  rateHz: number;
  gatesConnected: boolean;
  videoOn: boolean;
}

export interface PullSetup {
  material: Material;
  /** Lastre sobre el bloque (g nominales) y masa verdadera bloque + lastre (g). */
  loadG: number;
  massG: number;
  relDeg: number;
  thetaDeg: number;
  cableDeg: number;
  rateHz: number;
  driveCmS: number;
  sensor: { zeroed: boolean; calibrated: boolean; angleDeg: number; connected: boolean; range: number };
  worn: boolean;
  wornLogged: boolean;
  clamped: boolean;
  looseLoad: boolean;
}

/** Muestra del tirón: [t (s), F indicada (N), F verdadera (N), x del bloque (cm), v verdadera (m/s), recortada (0/1)]. */
export type PullSample = [number, number, number, number, number, number];

export interface PullRecord {
  id: number;
  startS: number;
  samples: PullSample[];
  /** Instante del primer deslizamiento (s desde el arranque) y fuerza verdadera en ese instante. */
  slipT: number | null;
  slipF: number;
  jerkT: number | null;
  loadShiftT: number | null;
  configChangedT: number | null;
  clippedT: number | null;
  done: boolean;
  nextT: number;
  stillS: number;
  setup: PullSetup;
  configVersion: number;
}

/** Muestra del deslizamiento: [t (s), x indicada por el video (cm), x verdadera (cm), v (m/s), a (m/s²)]. */
export type SlideSample = [number, number, number, number, number];

export interface SlideRecord {
  id: number;
  startS: number;
  samples: SlideSample[];
  gates: Record<string, Array<[number, number | null]>>;
  impactT: number | null;
  impactV: number;
  driftT: number | null;
  baseSlipT: number | null;
  loadShiftT: number | null;
  configChangedT: number | null;
  done: boolean;
  nextT: number;
  stillS: number;
  setup: { material: Material; relDeg: number; thetaDeg: number; loadG: number; massG: number; g1: number; g2: number; rateHz: number; gatesOn: boolean; videoOn: boolean; occluded: string[]; flagBent: boolean; worn: boolean; wornLogged: boolean; locked: boolean };
  configVersion: number;
}

/** Deslizamiento al inclinar: ángulo (rel) en que arrancó, tamaño del último giro y versión del plano. */
export interface TiltState {
  slipRelDeg: number | null;
  slipStepDeg: number;
  slipVersion: number | null;
  material: Material;
  /** El soporte cedió después del deslizamiento: el ángulo ya no es el del arranque. */
  shifted: boolean;
  /** Armado al girar el elevador con el bloque en reposo: solo ese deslizamiento cuenta como ángulo crítico. */
  armed: boolean;
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

export interface ReadingF5 {
  id: string;
  trialId: string;
  kind: 'mass' | 'temp' | 'length' | 'angle' | 'pull' | 'slide';
  instrumentId: string;
  value: number;
  unit: 'g' | '°C' | 'cm' | '°' | 'N' | 'm/s²';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'UNSTABLE', 'PARALLAX', 'NO_SLIP', 'ACCELERATING', 'OSCILLATING', 'CLIPPED', 'LOW_RATE', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('block01', 'w250a', 'plane', 'gate1'…). */
  target?: string;
  /** Tirón: pico antes del deslizamiento y media de la ventana. Campos sin dato quedan en null (NaN no sobrevive al JSON). */
  pull?: { Fpeak: number | null; Fmean: number | null; t0: number; t1: number; n: number; slipT: number | null; aMean: number | null; trueMean: number | null; truePeak: number | null };
  /** Deslizamiento: aceleración del video y tiempos de las compuertas. */
  slide?: { a: number | null; dt1: number | null; dt2: number | null; t1g: number | null; t2g: number | null; trueA: number | null };
  /** Ángulo: si el bloque había arrancado con el tablero sin tocar desde entonces. */
  angle?: { slipped: boolean; coarse: boolean; material: Material; relDeg: number };
  setup?: Partial<PullSetup> & Partial<SlideRecord['setup']> & { load?: number; posCm?: number };
  configVersion: number;
}

export interface SafetyStateF5 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface MuPair {
  s: number;
  k: number;
}

export interface F05Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin ruido, adherencia instantánea, sin desgaste); 'REALISTIC': sensores y material reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  blockKg: number;
  ballastKg: Record<string, number>;
  mu: Record<Material, MuPair>;
  /** Variación de μ a lo largo del plano (fracción, amplitud senoidal), 0 salvo escenario. */
  muRipple: number;
  /** Factor de μ de una tira rayada. */
  wornFactor: number;
  /** Tiempo característico (s) en que la adherencia vuelve a μs tras detenerse. */
  restTau: number;
  springK: number;
  springC: number;
  /** Rapidez del motor del tirador (cm/s) disponibles. */
  drives: number[];
  jerkM: number;
  /** Deriva del tablero sin bloqueo (°/s) y lo que baja el tablero cuando el soporte suelto cede con un golpe (°). */
  driftDegS: number;
  supportSlipDeg: number;
  /** Grados por vuelta del elevador. */
  degPerTurn: number;
  /** Aceleración a la que se cae un lastre mal asentado (m/s²) e inclinación a la que resbala (°). */
  looseFallA: number;
  looseFallDeg: number;
  /** Golpe contra el tope sin espuma que tuerce la bandera (m/s). */
  bendMs: number;
  bentFactor: number;
  releaseJitter: number;
  noiseFactor: number;
  balanceResolutionG: number;
  balanceOffsetG: number;
  scaleResolutionCm: number;
  goniometerResDeg: number;
  supportResDeg: number;
  thermoResC: number;
  roomC: number;
  videoResCm: number;
  force: ForceSensorParams;
  gate: GateTimerParams;
  rates: number[];
  uB: { balanceG: number; forceN: number; angleDeg: number; scaleCm: number; gateS: number; videoCm: number; tempC: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F05World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F05Params;
  mode: string;
  objects: Record<string, F05Object>;
  plane: PlaneState;
  surface: SurfaceState;
  block: BlockState;
  puller: PullerState;
  sensor: SensorState;
  logger: LoggerState;
  catcherOn: boolean;
  gates: Record<string, GateState>;
  /** Balanza: objeto sobre el plato, cuándo se colocó, corrimiento sin tarar (g). */
  balance: { on: string | null; placedS: number; offsetG: number; tared: boolean };
  /** Lastres: asentados en el perno del bloque o sueltos. */
  seated: Record<string, boolean>;
  pull: PullRecord | null;
  pulls: PullRecord[];
  slide: SlideRecord | null;
  slides: SlideRecord[];
  tilt: TiltState;
  fbd: Record<FbdBody, FbdState>;
  /** Balance de energía (J): disipada (roce, amortiguador, golpes) y trabajo externo (tirador y mano). */
  energy: { dissipatedJ: number; externalJ: number };
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF5>;
  readingOrder: string[];
  safety: SafetyStateF5;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
