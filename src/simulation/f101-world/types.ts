/**
 * Estado del mundo de F101 — metrología experimental y suma vectorial. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la mesada en cm (x a lo largo, y en profundidad, z altura; 1 unidad 3D = 1 cm);
 * los instrumentos dimensionales en mm (su unidad original), las masas en g, los volúmenes de líquido en mL, las
 * fuerzas en N y los ángulos de la mesa de fuerzas en grados desde +x, en sentido antihorario visto desde arriba.
 * La dinámica del anillo se integra en SI (m, kg, s, N). La escena solo dibuja este estado y envía hechos geométricos.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { AnalyticalBalanceParams, AnalyticalBalanceState } from '../instruments/analytical-balance';
import type { CaliperParams, CaliperState } from '../instruments/vernier-caliper';
import type { MicrometerParams, MicrometerState } from '../instruments/micrometer';

export type { Pose, Severity, SimEvent };

export type F101ObjKind =
  | 'gaugeBlock' | 'massStd' | 'tissue' | 'returnTray' | 'level'
  | 'caliper' | 'micrometer' | 'ruler' | 'metalCyl' | 'steelBall'
  | 'balance' | 'dish' | 'gradCyl'
  | 'forceTable' | 'pulley' | 'hanger' | 'slotMass' | 'massRack'
  | 'dynamometer' | 'sensorBox';

/** Estado de calibración de un instrumento o patrón (§7). */
export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F101Object {
  id: string;
  kind: F101ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'pan' (platillo), 'dish01' (sobre la cápsula), 'caliper01' / 'micrometer01' / 'ruler01' (entre
   * las caras o sobre la regla), 'gradCyl01' (sumergida), 'rim' (polea o dinamómetro en el borde de la mesa),
   * '<pulleyId>' (portapesas colgado), '<hangerId>' (pesa ranurada en el portapesas), 'rack', 'tray'.
   */
  support: string;
  movable: boolean;
  /** Cilindro: de pie (las mordazas miden el diámetro) o acostado (miden la altura). */
  orient?: 'upright' | 'lying';
  /** Giro de la pieza alrededor de su eje entre las caras (°): otra «cara» del diámetro. */
  spinDeg?: number;
}

/** Sólido medible: geometría real (mm), masa (g), material y rigidez de contacto (N/mm). */
export interface SolidPart {
  id: string;
  shape: 'cylinder' | 'sphere' | 'block' | 'slotted';
  material: 'aluminum' | 'nylon' | 'steel' | 'brass';
  /** Cilindro y esfera: diámetro medio (mm); bloque: longitud nominal (mm). */
  dMm: number;
  /** Cilindro: altura; bloque: lado transversal (mm). */
  hMm: number;
  /** Ovalización (semiamplitud del diámetro con el giro, mm). */
  ovalMm: number;
  massG: number;
  stiffNPerMm: number;
  /** Agua adherida (g) tras sacarla de la probeta. */
  wetG: number;
  /** Patrón: valor del certificado y su estado. */
  certified?: { nominal: number; unit: 'mm' | 'g'; status: CalibrationStatus };
}

/** Masas colgantes (§4 D): nominal rotulada y real (g). */
export interface MassPiece {
  id: string;
  nominalG: number;
  trueG: number;
}

export interface PulleyState {
  angleDeg: number;
  /** Prensa apretada sobre el borde: si no, la polea gira bajo la carga y la tensión sale desviada (E11). */
  seated: boolean;
  /** Hilo sobre la rueda; sin él, el hilo roza el borde y la tensión cae por fricción (E12). */
  threaded: boolean;
  /** Desviación de la dirección real cuando la prensa está floja (°, signo por semilla). */
  looseOffsetDeg: number;
}

export interface DynamometerState {
  onRim: boolean;
  angleDeg: number;
  /** Tornillo tensor (mm): estira el resorte con el anillo centrado. */
  tensionMm: number;
  /** Desalineación del cuerpo respecto del hilo (°, E26). */
  alignDeg: number;
  /** Desplazamiento del cero al usarlo horizontal (N) y si se ajustó en la posición de uso. */
  zeroOffsetN: number;
  zeroed: boolean;
  zeroedLoaded: boolean;
}

export interface SensorCapture {
  startedS: number;
  samples: Array<[number, number, number]>;
  transient: boolean;
  configAtStart: number;
  configChanged: boolean;
  nextS: number;
}

export interface Sensor2DState {
  connected: boolean;
  rangeN: 2 | 10;
  rateHz: 5 | 50;
  /** Factor de escala real del sensor (1 = calibrado). */
  scale: number;
  calibrated: boolean;
  capture: SensorCapture | null;
}

export interface ForceTableState {
  /** Anillo (m, respecto del perno central) y su velocidad (m/s). */
  ring: { x: number; y: number; vx: number; vy: number };
  pinIn: boolean;
  touching: boolean;
  /** Fuerza que el anillo ejerce sobre el perno (N) — lo que mide el sensor 2D. */
  pinForce: { x: number; y: number };
  /** Fuerza neta aplicada por hilos, resorte e inclinación (N). */
  applied: { x: number; y: number };
  levelDeg: number;
  levelDirDeg: number;
  pulleys: Record<string, PulleyState>;
  dyn: DynamometerState;
  sensor: Sensor2DState;
  stillS: number;
  stuck: boolean;
  tapUntil: number;
  limitHit: boolean;
  /** Versión del montaje: cambia con cada masa o ángulo (ensayo nuevo, E32/E33). */
  configVersion: number;
  peakSpeed: number;
}

export interface GradCylState {
  waterMl: number;
  foamMl: number;
  unsettledUntil: number;
  cracked: boolean;
  leakedMl: number;
  parts: string[];
  /** Número de probeta (se reemplaza tras un incidente). */
  serial: number;
}

export interface BalanceStateF extends AnalyticalBalanceState {
  powered: boolean;
  panIds: string[];
  tareSession: number;
  tareLoadG: number;
  /** Clave de lo que había en el platillo al tarar (para detectar «sin tara», E08). */
  tareKey: string;
}

export interface ReadingF {
  id: string;
  trialId: string;
  kind: 'length' | 'mass' | 'volume' | 'force' | 'equilibrium' | 'vector';
  instrumentId: string;
  value: number;
  unit: 'mm' | 'g' | 'mL' | 'N' | '°';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'PARALLAX', 'FORCE', 'OBLIQUE', 'DIRTY', 'NOT_ZEROED', 'UNSTABLE', 'UNLEVELED', 'NO_TARE', 'FOAM', 'MOVING', 'TOUCHING', 'UNSEATED', 'UNTHREADED', 'NOT_LEVEL', 'TILTED', 'CLIPPED', 'UNCALIBRATED', 'POST_IMPACT', 'WET', 'OVERRANGE'… */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  /** Pieza medida y dimensión ('d', 'h', 'L', 'empty'). */
  target?: string;
  dimension?: 'd' | 'h' | 'L' | 'empty';
  spinDeg?: number;
  tareSession?: number;
  partsInside?: string[];
  /** Equilibrio: fuerzas leídas (masa rotulada, ángulo leído) y verdad del motor. */
  forces?: Array<{ source: string; massG?: number; readN?: number; angleRead: number; angleTrue: number; trueN: number }>;
  vector?: { x: number; y: number };
  ringOffsetMm?: number;
  configVersion?: number;
}

export interface SafetyStateF {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface F101Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal, sin pérdidas; 'REALISTIC': fricción de poleas y anillo, flexión de mordazas. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  caliper: CaliperParams;
  micrometer: MicrometerParams;
  rulerResolutionMm: number;
  balance: AnalyticalBalanceParams;
  gradCylCapacityMl: number;
  gradCylDivisionMl: number;
  gradCylInitialMl: number;
  cylinderDiameterMm: number;
  cylinderHeightMm: number;
  ballDiameterMm: number;
  gaugeBlockMm: number;
  standardMassG: number;
  tableRadiusCm: number;
  pulleyFriction: number;
  ringFrictionN: number;
  ringMassG: number;
  hangerMassG: number;
  dynStiffNPerMm: number;
  dynRangeN: number;
  dynDivisionN: number;
  angleDivisionDeg: number;
  /** Incertidumbres tipo B declaradas por instrumento (en su unidad). */
  uB: { caliperMm: number; micrometerMm: number; rulerMm: number; balanceG: number; gradCylMl: number; dynamometerN: number; angleDeg: number; massRel: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F101World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F101Params;
  mode: string;
  objects: Record<string, F101Object>;
  parts: Record<string, SolidPart>;
  masses: Record<string, MassPiece>;
  caliper: CaliperState;
  micrometer: MicrometerState;
  balance: BalanceStateF;
  gradCyl: GradCylState;
  table: ForceTableState;
  /** Agua fuera de la probeta (mL): derramada en la mesada y descartada. */
  water: { benchMl: number; discardedMl: number };
  trial: number;
  readings: Record<string, ReadingF>;
  readingOrder: string[];
  safety: SafetyStateF;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { waterMl: number; metalG: number; massesG: number };
}
