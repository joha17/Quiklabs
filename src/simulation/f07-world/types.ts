/**
 * Estado del mundo de F07 — impulso, colisiones y momento lineal. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). La dinámica se integra en SI: la coordenada
 * de cada carro a lo largo del riel s (m, desde el tope izquierdo), velocidades en m/s, fuerzas en N, impulsos en N·s,
 * momentos en kg·m/s y energías en J. Las lecturas conservan la unidad del instrumento: g de la balanza, cm del calibre
 * y de la regla de posición, ° del nivel, s de las fotopuertas, N·s del registro de fuerza y m/s de la cámara.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { GateState, GateTimerParams } from '../instruments/photogate';
import type { ForceSensorParams } from '../instruments/force-sensor';

export type { Pose, Severity, SimEvent };

export type F07ObjKind =
  | 'track' | 'endStop' | 'launcher' | 'level' | 'cart' | 'cartMass' | 'massRack' | 'balance' | 'caliper'
  | 'gate' | 'forceSensor' | 'logger' | 'camera' | 'posRuler' | 'bumperKit';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F07Object {
  id: string;
  kind: F07ObjKind;
  pose: Pose;
  /** 'bench', 'rack', 'track', 'cartA', 'cartB', 'balance', 'hand'. */
  support: string;
  movable: boolean;
}

export type CartId = 'cartA' | 'cartB';
/** Par de paragolpes montado en las caras enfrentadas: resorte, imanes o velcro. */
export type BumperType = 'spring' | 'magnet' | 'velcro';

/** Carro sobre el riel: centro en s (m), velocidad (m/s). */
export interface CartState {
  on: 'track' | 'balance';
  s: number;
  v: number;
  /** Trabado en su lanzador con el émbolo comprimido (m). */
  latched: boolean;
  compression: number;
  /** Freno de estacionamiento de las ruedas (F07-E10). */
  brake: boolean;
  /** Una rueda que no gira libre (F07-E16): roce de rodadura extra hasta liberarla. */
  wheelBind: boolean;
  /** Desalineación lateral respecto del eje del riel (mm): con distinta desalineación el choque es oblicuo (E15). */
  offsetMm: number;
  /** Ancho de la bandera montada (cm) y su giro respecto de la vertical (°). */
  flagW: number;
  flagYawDeg: number;
  /** Rueda torcida por un golpe contra el tope sin amortiguar (E39). */
  damaged: boolean;
}

export interface BumperState {
  type: BumperType;
  /** Imanes enfrentados con polos iguales (repelen). Con polos opuestos se atraen y se pegan (E07). */
  polarityOk: boolean;
  /** Velcro apretado y fijado en las dos caras (sin eso se despega, E06). */
  velcroFixed: boolean;
  /** Los carros quedaron unidos por el velcro (o por los imanes atrayéndose). */
  joined: boolean;
}

export interface TrackState {
  /** Inclinación verdadera (°, + baja hacia la derecha) = de la mesada + tornillo de nivelación. */
  baseTiltDeg: number;
  screwDeg: number;
  touchedS: number;
  /** Amortiguadores de los topes de los extremos. */
  endDampers: boolean;
  /** Abrazaderas de las fotopuertas (sin ellas la compuerta se corre al pasar el carro, E28). */
  gatesClamped: boolean;
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
  gatesConnected: boolean;
  cameraOn: boolean;
}

export interface RunSetup {
  mA: number;
  mB: number;
  loadA: number;
  loadB: number;
  bumper: BumperType;
  polarityOk: boolean;
  velcroFixed: boolean;
  tiltDeg: number;
  gA: number;
  gB: number;
  flagA: number;
  flagB: number;
  cockA: number;
  cockB: number;
  rateHz: number;
  sensor: { connected: boolean; zeroed: boolean; calibrated: boolean; angleDeg: number; range: number };
  gatesConnected: boolean;
  cameraOn: boolean;
  gatesClamped: boolean;
  endDampers: boolean;
  brakes: boolean;
  wheelBind: boolean;
  oblique: boolean;
  overlap: boolean;
  occluded: boolean;
  damaged: boolean;
  frictionN: number;
}

/** Muestra de fuerza en el choque: [t (s), F indicada (N), F verdadera sobre B (N)]. */
export type ForceSample = [number, number, number];
/** Muestra de la cámara a 20 Hz: [t (s), s_A (m), s_B (m), v_A (m/s), v_B (m/s)]. */
export type TrackSample = [number, number, number, number, number];
/** Cruce de una fotopuerta: compuerta, carro, entrada (s), salida (s o null), sentido (+1 derecha, −1 izquierda). */
export type Crossing = [string, CartId, number, number | null, number];

export interface RunRecord {
  id: number;
  startS: number;
  force: ForceSample[];
  track: TrackSample[];
  crossings: Crossing[];
  /** Inicio y fin del contacto (s desde el disparo). */
  contactT: number | null;
  contactEndT: number | null;
  /** Momento total, velocidades y energía cinética verdaderas antes y después del choque (solo docente). */
  pBefore: number | null;
  pAfter: number | null;
  vBefore: [number, number] | null;
  vAfter: [number, number] | null;
  trueJ: number;
  /** Impulso externo que recibió el sistema durante el choque (roce, rieles; solo docente, N·s). */
  extJ: number;
  stuck: boolean;
  endHitT: number | null;
  /** Primer contacto de un carro con un tope después del choque (s): la cámara ajusta hasta ahí. */
  stopT: number | null;
  massChangedT: number | null;
  configChangedT: number | null;
  pushedT: number | null;
  handInGateT: number | null;
  slipT: number | null;
  targetMoving: boolean;
  gateInZone: boolean;
  postCrossed: Record<CartId, boolean>;
  done: boolean;
  nextT: number;
  nextTrackT: number;
  stillS: number;
  setup: RunSetup;
  configVersion: number;
}

export interface ReadingF7 {
  id: string;
  trialId: string;
  kind: 'mass' | 'length' | 'level' | 'position' | 'gates' | 'force' | 'motion';
  instrumentId: string;
  value: number;
  unit: 'g' | 'cm' | '°' | 's' | 'N·s' | 'm/s';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'UNSTABLE', 'PARALLAX', 'CLIPPED', 'LOW_RATE', 'INCLINED', 'OBLIQUE', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('cartA', 'cartB', 'cw100a', 'track01'…). */
  target?: string;
  /**
   * Fotopuertas: cruces con compuerta, carro, tiempo de bloqueo (s) y sentido observado; instante del choque.
   * Campos sin dato quedan en null (NaN no sobrevive al JSON).
   */
  gates?: { crossings: Array<{ g: string; cart: CartId; t: number; dt: number | null; dir: number }>; tc: number | null; stuck: boolean; restAfter: CartId[]; trueV: { A1: number | null; A2: number | null; B1: number | null; B2: number | null } };
  /** Sensor de fuerza en el paragolpes de B: impulso (área bajo F–t), pico, duración del contacto y muestras. */
  force?: { J: number | null; Fmax: number | null; tContact: number | null; n: number; trueJ: number | null };
  /** Cámara: velocidad de cada carro antes y después (ajuste lineal de x(t) a 20 Hz), centro de masa verdadero (docente). */
  motion?: { vA1: number | null; vB1: number | null; vA2: number | null; vB2: number | null; n: number; trueVcm: number | null };
  setup?: Partial<RunSetup> & { load?: number; flag?: number; cart?: CartId; screw?: number };
  configVersion: number;
}

export interface SafetyStateF7 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F07Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin ruido, sin rodadura); 'REALISTIC': rodadura y sensores reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  /** Masas de los carros sin carga (kg) y de las pesas adicionales. */
  m1: number;
  m2: number;
  cartMassKg: Record<string, number>;
  /** Rapidez de cada lanzador en la muesca de referencia (3 cm) con el carro sin carga (m/s); v2 con signo (− hacia la izquierda). */
  v1: number;
  v2: number;
  /** Coeficiente de restitución de los paragolpes de resorte e imanes. */
  e: number;
  /** Roce adicional del riel (N) y rodadura de cada carro (N). */
  frictionN: number;
  rollN: number;
  bindN: number;
  damagedRollN: number;
  /** Roce lateral de las pestañas contra el riel en un choque oblicuo o contra el límite lateral (fracción de F). */
  sideMu: number;
  sideRubN: number;
  /** Rigidez de contacto del paragolpes de resorte (N/m); el de imanes es más blando y de mayor alcance. */
  contactK: number;
  magnetFactor: number;
  magnetRangeM: number;
  /** Restitución de un velcro sin fijar y del tope del extremo con y sin amortiguador. */
  looseVelcroE: number;
  endE: number;
  endHardE: number;
  /** Inclinación de la mesada (°, máximo absoluto) y corrimiento de la compuerta sin abrazadera (m). */
  baseTiltMax: number;
  gateSlipM: number;
  /** Desalineación lateral inicial (mm, máximo) y giro de la bandera (°). */
  offsetMaxMm: number;
  flagYaw0: number;
  noiseFactor: number;
  balanceResolutionG: number;
  caliperResCm: number;
  levelResDeg: number;
  rulerResCm: number;
  force: ForceSensorParams;
  gate: GateTimerParams;
  rates: number[];
  uB: { balanceG: number; caliperCm: number; levelDeg: number; rulerCm: number; forceN: number; gateS: number; cameraMs: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F07World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F07Params;
  mode: string;
  objects: Record<string, F07Object>;
  carts: Record<CartId, CartState>;
  bumper: BumperState;
  track: TrackState;
  sensor: ForceSensorState;
  logger: LoggerState;
  gates: Record<string, GateState>;
  /** Balanza: objeto sobre el plato, cuándo se colocó, corrimiento sin tarar (g). */
  balance: { on: string | null; placedS: number; offsetG: number; tared: boolean };
  /** Carga que tenía cada carro en su última pesada válida (g; −1 sin pesar) y banderas medidas con el calibre (cm). */
  weighed: Record<CartId, number>;
  flagMeasured: Record<CartId, number>;
  run: RunRecord | null;
  runs: RunRecord[];
  /** Balances: energía disipada y trabajo externo (J); impulso externo acumulado sobre los carros (N·s). */
  energy: { dissipatedJ: number; externalJ: number };
  momentum: { externalNs: number };
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF7>;
  readingOrder: string[];
  safety: SafetyStateF7;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
