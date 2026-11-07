/**
 * Estado del mundo de F102 — cinemática rectilínea, aceleración y caída libre. Datos puros, serializables y
 * deterministas.
 *
 * Unidades declaradas (regla de §3): la mesada en cm (x a lo largo, y en profundidad, z altura; 1 unidad 3D = 1 cm).
 * La dinámica se integra en SI (m, kg, s, N, J): el carril tiene su propia coordenada `s` (m) medida desde la cara
 * del lanzador hacia la polea; la torre, la altura `z` (m) sobre la mesada. Las lecturas conservan la unidad original
 * del instrumento (cm de la regla, s del cronómetro, ° del inclinómetro, mm del sensor de movimiento).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { GateTimerParams, GateState } from '../instruments/photogate';
import type { MotionSensorParams, MotionSensorState } from '../instruments/motion-sensor';

export type { Pose, Severity, SimEvent };

export type F102ObjKind =
  | 'track' | 'cart' | 'launcher' | 'gate' | 'gateTimer' | 'pulley' | 'hanger' | 'slotMass' | 'massRack' | 'cartBar'
  | 'tapeTimer' | 'inclinometer' | 'tower' | 'magnet' | 'sphere' | 'pad' | 'photocell' | 'motionSensor' | 'filter'
  | 'returnTray';

/** Estado de calibración de un instrumento o constante (§7). */
export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F102Object {
  id: string;
  kind: F102ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'rack', 'tray', 'cart01' (barra sobre el carro), 'hanger01' (pesa en el portapesas),
   * 'string' (portapesas colgado del cordel), 'magnet01' (esfera o filtros en el electroimán), 'air' (cayendo),
   * 'pad01' / 'base' (en reposo en la torre), '<filterId>' (filtro anidado sobre otro), 'track01' (inclinómetro).
   */
  support: string;
  movable: boolean;
}

/** Carril de 150 cm con un pie roscado en el extremo del lanzador (§4 A). */
export interface TrackState {
  /** Altura del pie roscado respecto de la referencia nivelada (mm): define la inclinación. */
  footMm: number;
  /** Inclinación (°, positiva: el lanzador más alto, la gravedad empuja hacia la polea). */
  angleDeg: number;
}

/** Carro sobre el carril: posición del centro (m desde la cara del lanzador) y velocidad (m/s). */
export interface CartState {
  s: number;
  v: number;
  /** La mano lo sostiene (cinemático) o está libre sobre el carril. */
  held: boolean;
  /** Masa real del carro y de las barras cargadas (kg). */
  massKg: number;
  bars: string[];
  /** Bandera: ancho real (m) y si quedó doblada por un choque fuerte (E39). */
  flagW: number;
  flagBent: boolean;
  /** Rotación acumulada de las ruedas (rad), solo para la vista (sale de s). */
  wheelRad: number;
}

export interface LauncherState {
  /** Muesca del émbolo (cm comprimidos: 0, 1, 2, 3) y si el pestillo lo retiene. */
  notchCm: number;
  latched: boolean;
}

/** Cordel, polea y masa colgante (§4 C). */
export interface StringState {
  attached: boolean;
  /** Cordel sobre la ranura de la polea o rozando el costado (E08). */
  onWheel: boolean;
  /** Largo del cordel (m) del gancho del carro a la masa. */
  lengthM: number;
  /** Profundidad de la masa bajo el eje de la polea (m) y su velocidad (m/s, + hacia abajo). */
  depth: number;
  vd: number;
  taut: boolean;
  landed: boolean;
  tensionN: number;
  /** Ángulo de la rueda (rad), para la vista. */
  wheelRad: number;
}

export interface TapeTimerState {
  /** Cinta enganchada al carro y pasando por la guía. */
  attached: boolean;
  /** Cinta floja o cruzada en la guía (E06): roza y frena. */
  slack: boolean;
  running: boolean;
  startedS: number;
  /** El carro ya se movía cuando arrancó (E05). */
  lateStart: boolean;
  nextS: number;
  dots: Array<[number, number]>;
  impactS: number | null;
  landedS: number | null;
  configAtStart: number;
  configChanged: boolean;
}

/** Cronómetro de las fotocompuertas y lo que pasó durante su corrida. */
export interface GateTimerState {
  running: boolean;
  startedS: number;
  connected: Record<string, boolean>;
  configAtStart: number;
  configChanged: boolean;
  /** Choque con el tope y masa en el suelo durante la corrida (s de simulación, null si no ocurrió). */
  impactS: number | null;
  landedS: number | null;
  /** Recorrido del centro de la bandera durante la corrida (m). */
  sMin: number;
  sMax: number;
}

/** Inclinómetro digital: cero sobre la mesada y lectura sobre el carril (0,1°). */
export interface InclinometerState {
  zeroed: boolean;
  offsetDeg: number;
  /** Se estabiliza tras apoyarlo (s de simulación en que quedó quieto). */
  placedS: number;
}

export interface FallTimerState {
  armed: boolean;
  /** Arranca al cortar el electroimán; se detiene con el primer bloqueo del haz. */
  startS: number | null;
  stopS: number | null;
  running: boolean;
}

/** Cuerpo que cae en la torre (uno a la vez): esfera o pila de filtros. */
export interface FallingBody {
  id: string;
  /** Posición horizontal respecto del eje de la torre (m) y altura del borde inferior sobre la mesada (m). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  massKg: number;
  /** Área frontal (m²), coeficiente de arrastre y radio (m). */
  area: number;
  cd: number;
  radius: number;
  /** Filtros: cayendo en tumbos (área y Cd variables, E16). */
  tumbling: boolean;
  releasedS: number;
  releasedBy: 'magnet' | 'hand';
  landed: boolean;
  landedOn: 'pad' | 'bench' | null;
  impactV: number;
  /** El cuerpo cruzó el haz de la fotocelda (y cuándo). */
  beamS: number | null;
  /** Fracción máxima del peso que alcanzó el arrastre (0 en el vacío). */
  dragFrac: number;
}

/** Electroimán con prensa sobre la columna (§4 D). */
export interface MagnetState {
  on: boolean;
  /** Altura de la cara del polo sobre el haz de la fotocelda (m): la escala de la torre la indica. */
  h: number;
  clampTight: boolean;
  /** Brazo sobre el eje (sostiene cuerpos; tapa el sensor de movimiento, E25) o girado afuera. */
  armIn: boolean;
  /** Lo que sostiene y su desplazamiento lateral respecto del polo (m, E12). */
  holding: string | null;
  offsetM: number;
  /** Tiempo hasta soltar tras cortar la corriente (retardo de desmagnetización, s). */
  releaseAt: number | null;
}

export interface FilterState {
  massKg: number;
  crumpled: boolean;
  /** Anidado descentrado sobre el filtro de abajo (F102-E16). */
  offCenter: boolean;
}

export interface ReadingF2 {
  id: string;
  trialId: string;
  kind: 'angle' | 'length' | 'gates' | 'tape' | 'fall' | 'motion';
  instrumentId: string;
  value: number;
  unit: '°' | 'cm' | 's' | 'mm';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'UNSTABLE', 'PARALLAX', 'EDGE', 'MISSED', 'OVERLAP', 'MOVING', 'PUSHED', 'UNLEVELED', 'IMPACT', 'LATE_START', 'SLACK_TAPE', 'LANDED', 'OFF_WHEEL', 'LATERAL', 'NO_STOP', 'DRAG', 'TUMBLING', 'MIXED', 'CLIPPED', 'LOW_RATE', 'OCCLUDED', 'TILTED', 'UNCALIBRATED', 'LOOSE_CLAMP', 'CONFIG_CHANGED', 'POST_IMPACT', 'UNPLUGGED'… */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  /** false cuando el instrumento no dio valor (falta un cruce de compuerta, cronómetro sin detenerse). */
  valid?: boolean;
  /** Qué se midió ('gate1', 'gate2', 'flag', 'track', 'magnet', 'sphereS', 'filters:2'…). */
  target?: string;
  /** Fotocompuertas: tiempos de entrada y salida (s) desde el arranque del cronómetro. */
  gates?: { t1In: number | null; t1Out: number | null; t2In: number | null; t2Out: number | null };
  /** Cinta: puntos (t s, x cm) desde el primer punto; sensor de movimiento: (t s, d mm). */
  samples?: Array<[number, number]>;
  /** Montaje del ensayo: masa colgante y del carro (g), separación de puertas (cm), altura (cm), filtros. */
  /** Cinta: instante (s desde el primer punto) en que cambió el modelo (masa en el suelo o choque). */
  cutS?: number;
  setup?: { hangG?: number; cartG?: number; gateSepCm?: number; hCm?: number; body?: string; filters?: number; launcherCm?: number };
  configVersion: number;
}

export interface SafetyStateF2 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F102Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin rozamiento, polea sin inercia, sin arrastre en la esfera); 'REALISTIC': con pérdidas. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  airDensity: number;
  cartMassKg: number;
  barMassKg: number;
  /** Rozamiento viscoso del carro (N·s/m) y de rodadura (N). */
  cartDragNsPerM: number;
  rollingN: number;
  /** Inercia de la polea expresada como masa equivalente I/r² (kg) y su rozamiento (N). */
  pulleyEqKg: number;
  pulleyFrictionN: number;
  launcherKNPerM: number;
  endStopRestitution: number;
  /** Velocidad de choque (m/s) a partir de la cual la bandera se dobla. */
  flagBendMs: number;
  flagWidthM: number;
  stringLengthM: number;
  /** Profundidad del suelo bajo el eje de la polea (m). */
  floorDepthM: number;
  tapeDragN: number;
  tapeSlackDragN: number;
  tapeRateHz: number;
  rulerResolutionCm: number;
  towerScaleResolutionCm: number;
  inclinometerResolutionDeg: number;
  inclinometerOffsetDeg: number;
  footPitchMm: number;
  feetSpanM: number;
  gateTimer: GateTimerParams;
  motion: MotionSensorParams;
  /** Retardo de desmagnetización del electroimán (s). */
  magnetDelayS: number;
  sphereCd: number;
  filterCd: number;
  filterMassKg: number;
  filterRadiusM: number;
  windMs: number;
  uB: { rulerCm: number; gateS: number; tapeCm: number; towerCm: number; fallS: number; motionMm: number; angleDeg: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F102World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F102Params;
  mode: string;
  objects: Record<string, F102Object>;
  track: TrackState;
  cart: CartState;
  launcher: LauncherState;
  string: StringState;
  gates: Record<string, GateState>;
  gateTimer: GateTimerState;
  tape: TapeTimerState;
  inclinometer: InclinometerState;
  magnet: MagnetState;
  fallTimer: FallTimerState;
  photocellCapped: boolean;
  fall: FallingBody | null;
  motion: MotionSensorState;
  filters: Record<string, FilterState>;
  /** Masas nominales y reales (g) de portapesas, pesas, barras, esferas y carro. */
  masses: Record<string, { nominalG: number; trueG: number }>;
  /** Balance de energía del carril y de la torre (J): mecánica, disipada y trabajo externo de la mano o el resorte. */
  energy: { dissipatedJ: number; externalJ: number };
  /** Última liberación del carro: con empujón de la mano, con el lanzador y cuándo (control experimental). */
  run: { pushed: boolean; launched: boolean; startS: number };
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF2>;
  readingOrder: string[];
  safety: SafetyStateF2;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
