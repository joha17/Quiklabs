/**
 * Estado del mundo de F103 — proyectiles y trayectorias bidimensionales. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (x a lo largo de la pista, y en profundidad, z altura; 1 unidad 3D =
 * 1 cm, z = 0 en la cara de la mesada y el suelo en z = −88). La dinámica del vuelo se integra en SI con el origen en el
 * suelo (m, kg, s, N, J). Las lecturas conservan la unidad original del instrumento: ° del transportador y del nivel,
 * cm de la cinta del suelo, de la regla vertical, de la plataforma y de la pantalla, s del temporizador.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { BallGateParams } from '../instruments/ball-gate';
import type { ClockRange, ImpactPlatformParams } from '../instruments/impact-platform';

export type { Pose, Severity, SimEvent };

export type F103ObjKind =
  | 'lane' | 'stand' | 'launcher' | 'gate' | 'timer' | 'platform' | 'screen' | 'barrier' | 'fan' | 'ball' | 'tray' | 'floorTape' | 'plumb' | 'heightRuler';

/** Estado de calibración de un instrumento o constante (§7). */
export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F103Object {
  id: string;
  kind: F103ObjKind;
  pose: Pose;
  /** 'floor', 'tray' (bandeja del soporte), 'hand', 'launcher' (en el cañón), 'air' (en vuelo), 'bench'. */
  support: string;
  movable: boolean;
}

/** Soporte de patas regulables (estación A). */
export interface StandState {
  /** Altura del deck sobre el suelo (cm). */
  heightCm: number;
  /** Inclinación del deck en el plano de tiro (°, + levanta el frente) que dejan las patas desniveladas. */
  tiltDeg: number;
  /** Bridas del soporte a la placa del suelo apretadas (base anclada). */
  anchored: boolean;
  /** Cuándo se tocó el nivel por última vez (la burbuja se asienta). */
  touchedS: number;
}

/** Lanzador de resorte con transportador (estación B). */
export interface LauncherState {
  /** Ángulo del cañón respecto del deck que fija el mando de elevación (°). */
  angleDeg: number;
  /** Azimut respecto del eje de la pista (°, + hacia la mesada). */
  yawDeg: number;
  /** Boca (eje de giro) sobre el suelo (m, coordenadas de la pista). */
  x: number;
  y: number;
  /** Muesca del resorte cargada (0 = descargado, 1–3). */
  notch: number;
  /** Esfera dentro del cañón. */
  loaded: string | null;
  /** Protector del cañón puesto. */
  capOn: boolean;
  /** Error de cero del transportador (°) y si ya se ajustó (con el nivel sobre el cañón horizontal). */
  protractorOffsetDeg: number;
  zeroed: boolean;
  /** Inclinación del deck cuando se ajustó el cero: si cambia después, la lectura deja de ser la elevación real. */
  levelRefDeg: number;
  /** Cuándo se movió el puntero del transportador por última vez (oscila hasta asentarse). */
  touchedS: number;
}

export interface GateState {
  mounted: boolean;
  /** Desplazamiento del haz respecto del eje del cañón (mm). */
  offsetMm: number;
  connected: boolean;
}

/** Interfaz de adquisición: temporizador de la fotopuerta y reloj de la plataforma. */
export interface TimerState {
  rateHz: number;
  range: ClockRange;
}

export interface PlatformState {
  /** Centro de la placa sobre el suelo (m). */
  x: number;
  y: number;
  calibrated: boolean;
  connected: boolean;
  movedS: number;
}

export interface ScreenState {
  /** Plano de la pantalla (m) y si está dentro de la pista. */
  x: number;
  inLane: boolean;
  /** Marcas del papel carbónico: altura del centro de la esfera (m) y posición transversal (m). */
  marks: Array<{ z: number; y: number; shot: number }>;
}

export interface FanState {
  /** 0 apagado, 1 bajo, 2 alto. */
  speed: number;
  dir: 'side' | 'head' | 'tail';
}

export interface BallSpec {
  massKg: number;
  diameterM: number;
  /** Diámetro rotulado (cm) y masa rotulada (g). */
  nominalCm: number;
  nominalG: number;
  /** Abollada por un choque fuerte (F103-E39). */
  damaged: boolean;
}

export interface Contact {
  t: number;
  x: number;
  y: number;
  z: number;
  on: 'platform' | 'floor' | 'screen' | 'backstop';
  v: number;
}

/** Esfera en vuelo (una a la vez): posición del centro sobre el suelo (m) y velocidad (m/s). */
export interface Flight {
  ball: string;
  shot: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  massKg: number;
  radius: number;
  area: number;
  launchedS: number;
  v0: number;
  gateIn: number | null;
  gateOut: number | null;
  chord: number;
  contacts: Contact[];
  peakZ: number;
  done: boolean;
  /** Ventilador encendido o apagado durante el vuelo (F103-E16) y otro cambio de montaje (F103-E32). */
  windChanged: boolean;
  configChanged: boolean;
  /** Arrastre máximo como fracción del peso. */
  dragFrac: number;
}

/** Lo que registró la interfaz del último disparo. */
export interface ShotRecord {
  shot: number;
  ball: string;
  launchedS: number;
  gateDt: number | null;
  gateMissed: boolean;
  gateUsable: boolean;
  /** Primer contacto en la plataforma (puede ser un rebote si el primero cayó en el suelo). */
  platformContact: Contact | null;
  platformIndex: number;
  firstOn: Contact['on'] | null;
  platformAt: { x: number; y: number; settled: boolean; calibrated: boolean; connected: boolean };
  setup: ShotSetup;
  configVersion: number;
  unanchored: boolean;
  tilted: boolean;
  damaged: boolean;
  windChanged: boolean;
  configChanged: boolean;
  landed: boolean;
  readGate: boolean;
  readImpact: boolean;
}

export interface ShotSetup {
  notch: number;
  angleDeg: number;
  standCm: number;
  ball: string;
  ballCm: number;
  windMs: number;
  windDir: FanState['dir'];
  yawDeg: number;
  /** Distancia de la pantalla a la boca (cm) si estaba dentro de la pista; null si no. */
  screenCm: number | null;
}

export interface ReadingF3 {
  id: string;
  trialId: string;
  kind: 'angle' | 'level' | 'length' | 'height' | 'gate' | 'impact' | 'mark';
  instrumentId: string;
  value: number;
  unit: '°' | 'cm' | 's';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'UNSTABLE', 'PARALLAX', 'TILTED', 'UNALIGNED', 'BASE', 'DECK', 'MISSED', 'EDGE', 'LOW_RATE', 'UNPLUGGED', 'NOT_MOUNTED', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('platform', 'screen', 'plumb', 'muzzle', 'deck', 'launcher', 'stand'…). */
  target?: string;
  /** Plataforma: posición del contacto (cm) y tiempo de vuelo (s) desde el haz de la fotopuerta. */
  impact?: { xCm: number; yCm: number; tFlight: number; index: number };
  /** Montaje del disparo (o de la pieza leída: posición verdadera en cm, para vincular lecturas del mismo montaje). */
  setup?: Partial<ShotSetup> & { posCm?: number };
  shot?: number;
  configVersion: number;
}

export interface SafetyStateF3 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F103Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin aire, resorte sin pérdidas); 'REALISTIC': con arrastre, pérdidas y dispersión. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  airDensity: number;
  /** Arrastre forzado aun en modo curricular (escenario S02). */
  dragAlways: boolean;
  sphereCd: number;
  /** Resorte: constante rotulada (N/m), factor real, compresiones de las muescas (m), émbolo (kg), rendimiento. */
  springK: number;
  springTrueFactor: number;
  notchM: number[];
  pistonKg: number;
  springEfficiency: number;
  /** Dispersión de la compresión en cada disparo (fracción). */
  shotJitter: number;
  /** Soporte sin anclar: masa y rozamiento de las patas con el suelo. */
  standKg: number;
  standFloorMu: number;
  restitution: number;
  /** Fricción horizontal en el rebote (fracción de la velocidad tangencial que conserva). */
  bounceKeep: number;
  /** Velocidad a partir de la cual un choque contra la pantalla o el colchón abolla la esfera (m/s). */
  damageMs: number;
  /** Viento del ventilador por velocidad (m/s) y corriente ambiental lateral (m/s). */
  fanMs: number[];
  ambientSideMs: number;
  protractorResolutionDeg: number;
  protractorOffsetDeg: number;
  levelResolutionDeg: number;
  tapeResolutionCm: number;
  rulerResolutionCm: number;
  screenResolutionCm: number;
  gate: BallGateParams;
  platform: ImpactPlatformParams;
  uB: { protractorDeg: number; levelDeg: number; tapeCm: number; rulerCm: number; screenCm: number; gateS: number; platformCm: number; clockS: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F103World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F103Params;
  mode: string;
  objects: Record<string, F103Object>;
  stand: StandState;
  launcher: LauncherState;
  gate: GateState;
  timer: TimerState;
  platform: PlatformState;
  screen: ScreenState;
  fan: FanState;
  barrierClosed: boolean;
  /** Cinta métrica del suelo: posición x (m) de su cero, y marca de la plomada en el suelo (m) o null. */
  tapeZeroX: number;
  plumbMark: { x: number; y: number } | null;
  balls: Record<string, BallSpec>;
  flight: Flight | null;
  lastShot: ShotRecord | null;
  /** Balance de energía (J): mecánica, disipada y trabajo externo de la mano (cargar el resorte, levantar esferas). */
  energy: { dissipatedJ: number; externalJ: number };
  /** Momento lineal horizontal entregado al soporte en los disparos sin anclar (kg·m/s, control de conservación). */
  recoil: { impulse: number; shots: number };
  trial: number;
  shots: number;
  configVersion: number;
  readings: Record<string, ReadingF3>;
  readingOrder: string[];
  safety: SafetyStateF3;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number; balls: number };
}
