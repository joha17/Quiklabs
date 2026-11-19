/**
 * Estado del mundo de F06 — trabajo, resortes y conservación de la energía. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). La dinámica se integra en SI: la coordenada
 * del carro a lo largo del riel s (m, horizontal desde la cara trasera del lanzador), el alargamiento del resorte del
 * soporte (m), el ángulo del péndulo (rad dentro de las cuentas, ° en el estado), velocidades en m/s, fuerzas en N y
 * energías en J. Las lecturas conservan la unidad del instrumento: g de la balanza, cm de la regla, del medidor de
 * altura y de la escala del péndulo, N y m del sensor de fuerza y del de posición, s de las fotopuertas, ° del captador.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { GateState, GateTimerParams } from '../instruments/photogate';
import type { ForceSensorParams } from '../instruments/force-sensor';

export type { Pose, Severity, SimEvent };

export type F06ObjKind =
  | 'stand' | 'ruler' | 'spring' | 'hanger' | 'slotMass' | 'massRack' | 'balance'
  | 'track' | 'launcher' | 'cart' | 'cartMass' | 'brake' | 'gauge' | 'gate' | 'pad' | 'damper' | 'forceSensor' | 'posSensor' | 'logger'
  | 'pendulum' | 'angleSensor';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F06Object {
  id: string;
  kind: F06ObjKind;
  pose: Pose;
  /** 'bench', 'rack', 'stand', 'launcher', 'hanger', 'cart', 'balance', 'track', 'hand'. */
  support: string;
  movable: boolean;
}

/** Resorte intercambiable (dos iguales: el de trabajo y el de repuesto). */
export interface SpringState {
  /** Dónde está: soporte de la estación A, lanzador del riel o estante. */
  at: 'stand' | 'launcher' | 'rack';
  /** Factor de rigidez propio (el repuesto difiere un poco del nominal). */
  kFactor: number;
  /** Superó el límite elástico: queda con rigidez menor e histéresis (F06-E01, E18). */
  damaged: boolean;
}

/** Soporte de la estación A: resorte colgado, porta-pesas, pesas ranuradas y regla de 1 mm. */
export interface StandState {
  hangerOn: boolean;
  /** Alargamiento del resorte (m, + hacia abajo) y su velocidad. */
  x: number;
  v: number;
  /** Corrimiento del cero de la regla respecto del puntero del resorte sin carga (cm). */
  rulerOffsetCm: number;
  /** El cero se alineó con carga colgada (también queda corrido). */
  zeroLoaded: boolean;
  /** Último cambio de carga (s): la lectura necesita esperar a que la oscilación se extinga. */
  loadedS: number;
}

/** Carro sobre el riel: centro en s (m horizontal), velocidad ds/dt (m/s). */
export interface CartState {
  on: 'track' | 'balance';
  s: number;
  v: number;
  /** Retenido por el trinquete del lanzador con el resorte comprimido x (m). */
  latched: boolean;
  compression: number;
  /** Rueda torcida por un golpe contra el tope (F06-E13): roce extra y lecturas posteriores al impacto (E39). */
  damaged: boolean;
  /** Retenido por el freno magnético del extremo alto. */
  held: boolean;
}

export interface TrackState {
  /** Altura de la parte alta sobre el tramo del lanzador (m). */
  h: number;
  /** Abrazadera de la columna de elevación (sin ella la columna cede con cada pasada, F06-E28). */
  clamped: boolean;
  /** Versión de la altura (cambia con cada ajuste o corrimiento): vincula la lectura con el ensayo. */
  version: number;
  touchedS: number;
  brakeOn: boolean;
  /** Patín de roce (N) y amortiguador magnético (N·s/m) del tramo de pérdidas. */
  frictionN: number;
  damperC: number;
  /** Resorte del lanzador asegurado con su presilla (sin ella se suelta al disparar, F06-E02). */
  springSecured: boolean;
}

export interface ForceSensorState {
  connected: boolean;
  offset: number;
  zeroed: boolean;
  scale: number;
  calibrated: boolean;
  rangeIdx: number;
  angleDeg: number;
}

export interface LoggerState {
  rateHz: number;
  posConnected: boolean;
  gatesConnected: boolean;
  angleConnected: boolean;
  /** Canales de fuerza y posición con la misma base de tiempo (sin ella la posición llega retrasada, F06-E15). */
  synced: boolean;
}

/** Péndulo simple de la estación C (oscila a lo largo de la mesada). */
export interface PendulumState {
  L: number;
  /** Ángulo (°) y velocidad angular (rad/s); desplazamiento y velocidad laterales de la esfera (m, m/s). */
  thetaDeg: number;
  omega: number;
  y: number;
  vy: number;
  /** Sostenido con la mano en el ángulo de partida. */
  held: boolean;
  touchedS: number;
}

export interface RunSetup {
  h: number;
  heightVersion: number;
  compression: number;
  cartKg: number;
  cartLoadG: number;
  frictionN: number;
  damperC: number;
  losses: boolean;
  brakeOn: boolean;
  g1: number;
  g2: number;
  rateHz: number;
  springId: string;
  springDamaged: boolean;
  secured: boolean;
  pushMs: number;
  sensor: { connected: boolean; zeroed: boolean; calibrated: boolean; angleDeg: number; range: number };
  posConnected: boolean;
  gatesConnected: boolean;
  synced: boolean;
  occluded: boolean;
  clamped: boolean;
  cartDamaged: boolean;
}

/** Muestra del disparo: [t (s), F indicada (N), F verdadera (N), posición indicada (m), compresión verdadera (m), v (m/s)]. */
export type LaunchSample = [number, number, number, number, number, number];
/** Muestra gruesa del recorrido a 20 Hz: [t (s), s (m), v (m/s), z (m)]. */
export type TrackSample = [number, number, number, number];

export interface RunRecord {
  id: number;
  startS: number;
  launch: LaunchSample[];
  track: TrackSample[];
  gates: Record<string, Array<[number, number | null]>>;
  /** Separación del carro y el émbolo (s desde el disparo). */
  sepT: number | null;
  impactT: number | null;
  impactV: number;
  slipT: number | null;
  massChangedT: number | null;
  configChangedT: number | null;
  /** Compresión inicial (m) y energía elástica que tenía el resorte al soltar (J, solo docente). */
  x0: number;
  uel: number;
  /** Lo más alto que llegó el carro (m sobre el lanzador). */
  maxZ: number;
  crested: boolean;
  done: boolean;
  nextT: number;
  nextTrackT: number;
  stillS: number;
  setup: RunSetup;
  configVersion: number;
}

export interface PendRecord {
  id: number;
  startS: number;
  theta0: number;
  L: number;
  lateralMs: number;
  gate: Array<[number, number | null]>;
  /** Ángulo indicado por el captador al soltar (°). */
  angleShown: number | null;
  vBottom: number;
  configChangedT: number | null;
  done: boolean;
  setup: { L: number; theta0: number; angleConnected: boolean; gatesConnected: boolean; lateralMs: number; bobKg: number };
  configVersion: number;
}

export interface ReadingF6 {
  id: string;
  trialId: string;
  kind: 'mass' | 'length' | 'height' | 'launch' | 'gates' | 'pendulum';
  instrumentId: string;
  value: number;
  unit: 'g' | 'cm' | 'J' | 's' | '°';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'UNSTABLE', 'PARALLAX', 'ZERO_OFFSET', 'OSCILLATING', 'CLIPPED', 'LOW_RATE', 'UNSYNCED', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('cart01', 'ruler01', 'gauge01', 'pendulum'…). */
  target?: string;
  /** Disparo: análisis de las señales F(t) y x(t). Campos sin dato quedan en null (NaN no sobrevive al JSON). */
  launch?: { W: number | null; Fmax: number | null; xmax: number | null; Pmax: number | null; Pavg: number | null; tPush: number | null; n: number; trueW: number | null };
  /** Fotopuertas del riel: tiempos de bloqueo abajo (gate1) y arriba (gate2). */
  gates?: { dt1: number | null; dt2: number | null; crested: boolean; trueV1: number | null; trueV2: number | null };
  /** Péndulo: ángulo de partida, tiempo de bloqueo en la parte baja y largo. */
  pend?: { theta0: number | null; dt: number | null; L: number; trueV: number | null };
  setup?: Partial<RunSetup> & { slots?: number; hanger?: boolean; ref?: string; L?: number; theta0?: number };
  configVersion: number;
}

export interface SafetyStateF6 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F06Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin ruido, sin roce de rodadura ni masa del émbolo); 'REALISTIC': pérdidas y sensores reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  /** Resorte: rigidez (N/m), fin del tramo lineal (m), rigidización más allá (1/m) y factor del repuesto. */
  springK: number;
  xLin: number;
  kNL: number;
  spareFactor: number;
  damagedFactor: number;
  hysteresisC: number;
  standC: number;
  hangerKg: number;
  slotKg: Record<string, number>;
  cartKg: number;
  cartMassKg: Record<string, number>;
  plungerKg: number;
  rollN: number;
  damagedRollN: number;
  /** Separación de un resorte sin presilla: fracción de la energía que llega al carro. */
  detachEta: number;
  brakeC: number;
  /** Altura inicial de la parte alta (m), corrimiento de la columna sin abrazadera (m). */
  h0: number;
  riserSlipM: number;
  frictionN0: number;
  damperC0: number;
  /** Péndulo: largo inicial, masa y diámetro de la esfera, amortiguamiento del aire (1/s), amplitudes de la ruta (°). */
  pendL0: number;
  bobKg: number;
  bobD: number;
  airGamma: number;
  pendAmps: number[];
  /** Retardo del canal de posición sin sincronizar (s). */
  lagS: number;
  noiseFactor: number;
  balanceResolutionG: number;
  rulerResCm: number;
  gaugeResCm: number;
  scaleResCm: number;
  angleResDeg: number;
  posResM: number;
  force: ForceSensorParams;
  gate: GateTimerParams;
  rates: number[];
  uB: { balanceG: number; rulerCm: number; gaugeCm: number; forceN: number; posM: number; gateS: number; angleDeg: number; scaleCm: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F06World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F06Params;
  mode: string;
  objects: Record<string, F06Object>;
  springs: Record<string, SpringState>;
  stand: StandState;
  cart: CartState;
  track: TrackState;
  sensor: ForceSensorState;
  logger: LoggerState;
  gates: Record<string, GateState>;
  pend: PendulumState;
  /** Balanza: objeto sobre el plato, cuándo se colocó, corrimiento sin tarar (g). */
  balance: { on: string | null; placedS: number; offsetG: number; tared: boolean };
  run: RunRecord | null;
  runs: RunRecord[];
  swing: PendRecord | null;
  swings: PendRecord[];
  /** Balance de energía (J): disipada (roces, amortiguadores, golpes, émbolo) y trabajo externo (mano). */
  energy: { dissipatedJ: number; externalJ: number };
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF6>;
  readingOrder: string[];
  safety: SafetyStateF6;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
