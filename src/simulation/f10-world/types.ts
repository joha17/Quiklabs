/**
 * Estado del mundo de F10 — equilibrio de vigas y elasticidad de materiales. Datos puros, serializables y deterministas.
 *
 * Unidades declaradas (regla de §3): la sala en cm (1 unidad 3D = 1 cm). La viga se describe con su coordenada propia
 * s (cm, 0 en el extremo izquierdo y 120 en el derecho, la misma de su escala impresa); las fuerzas en N y los torques
 * en N·m (los brazos se pasan a m al calcular). La prensa trabaja en mm (travesaño, alargamiento) y N; el material en Pa.
 * Las lecturas conservan la unidad del instrumento: N del dinamómetro y de los sensores de reacción y de la prensa, cm
 * de la cinta métrica, mm del calibre y del comparador.
 */
import type { Pose, Severity, SimEvent } from '../entities/types';

export type { Pose, Severity, SimEvent };

export type F10ObjKind =
  | 'beam' | 'support' | 'rail' | 'load' | 'rack' | 'gantry' | 'dynamometer' | 'wedge' | 'tape' | 'level' | 'caliper'
  | 'press' | 'specimen' | 'grip' | 'crank' | 'loadCell' | 'gauge' | 'shield' | 'logger';

export type CalibrationStatus = 'verified' | 'hypothetical' | 'pending';

export interface F10Object {
  id: string;
  kind: F10ObjKind;
  pose: Pose;
  /** 'bench', 'rack' (estante de cargas y probetas), 'beam', 'gantry' (gancho del dinamómetro), 'press', 'hand'. */
  support: string;
  movable: boolean;
}

export type SupportId = 'A' | 'B';
export type BeamPlace = 'rack' | 'wedge' | 'supports' | 'gantry';
export type LoadPlace = 'rack' | 'beam' | 'gantry' | 'bench';
export type MaterialId = 'steel' | 'aluminium';

/** Apoyo regulable: soporte con filo sobre un sensor de reacción, deslizable a lo largo del riel. */
export interface SupportState {
  /** Posición del filo en la coordenada de la viga (cm). */
  s: number;
  clamped: boolean;
  /** Filo flojo en su soporte (F10-S10): la viga no asienta hasta ajustarlo. */
  loose: boolean;
  /** Corrimiento acumulado por haber cargado el apoyo sin trabar (cm, F10-E28). */
  driftCm: number;
}

export interface BeamState {
  where: BeamPlace;
  /** Asentada sobre los dos filos (F10-E01). */
  seated: boolean;
  /** Giro en el vuelco (rad, + hacia el extremo derecho) y su velocidad (rad/s). */
  angle: number;
  omega: number;
  /** Apoyo sobre el que vuelca, y sentido (+1 baja el extremo derecho). */
  pivot: SupportId | null;
  dir: 1 | -1;
  tipped: boolean;
  /** Coordenada de la viga sobre la cuña de equilibrio (cm). */
  wedgeS: number;
  /** Mano sobre la viga (F10-E06). */
  hand: boolean;
  /** Hasta cuándo oscila tras un cambio de carga (s de simulación). */
  settleUntil: number;
}

export interface LoadState {
  where: LoadPlace;
  /** Posición de la línea del gancho en la viga (cm). */
  s: number;
  hookClosed: boolean;
  /** Instante en que se colgó con el gancho abierto (cae a los 0,5 s, F10-E07). */
  slipAt: number | null;
}

/** Sensores de reacción bajo los filos (conectados al registrador). */
export interface CellState {
  offset: number;
  tared: boolean;
}

export interface DynState {
  offset: number;
  zeroed: boolean;
  /** Inclinación respecto de la vertical (°, F10-E05). */
  aimDeg: number;
  holding: 'beam' | 'load1' | null;
  hungAt: number;
}

/** Probeta: material, diámetro real y estado plástico. */
export interface SpecimenState {
  id: string;
  dMm: number;
  /** Deformación plástica acumulada y fluencia actual (endurecimiento isótropo). */
  epsP: number;
  sigmaY: number;
  /** Ya fluyó y se descargó: recargarla no parte de cero (F10-E16). */
  yielded: boolean;
  reloaded: boolean;
}

export interface PressState {
  /** Probeta montada (id) o null. */
  specimen: string | null;
  gripTop: boolean;
  gripBottom: boolean;
  /** Excentricidad de la probeta en las mordazas (mm, F10-E15). */
  eccMm: number;
  /** Travesaño (mm), consigna de la manivela (mm) y velocidad actual (mm/s). */
  u: number;
  target: number;
  speed: number;
  /** Freno de la manivela puesto (el travesaño no flota). */
  crankLocked: boolean;
  /** Travesaño al cerrar la segunda mordaza y precarga por cierre con el freno puesto (mm, F10-E19). */
  uRef: number;
  preloadMm: number;
  shieldClosed: boolean;
  /** Fin del transitorio tras una descarga brusca (s, F10-E14) y última vez que el travesaño se movió (s, F10-E18). */
  transientUntil: number;
  movedAt: number;
  /** Fuerza axial verdadera (N) y alargamiento verdadero de la zona calibrada (mm). */
  forceN: number;
  elongMm: number;
}

export interface GaugeState {
  mounted: 'axial' | 'transverse' | null;
  connected: boolean;
  offset: number;
  zeroed: boolean;
  scale: number;
  calibrated: boolean;
  angleDeg: number;
  /** Cable del comparador en su presilla; suelto, la puerta del protector lo aprieta contra el vástago (F10-E25). */
  cableRouted: boolean;
}

export interface LoadCellState {
  connected: boolean;
  offset: number;
  zeroed: boolean;
  rangeIdx: number;
}

/** Copia del montaje en un instante (va con cada lectura). */
export interface F10Setup {
  sA: number;
  sB: number;
  load: number | null;
  loadOn: boolean;
  seated: boolean;
  clamped: [boolean, boolean];
  tiltDeg: number;
  /** Solo docente: centro de masa verdadero (cm) y reacciones verdaderas (N). */
  trueCg: number;
  trueRA: number;
  trueRB: number;
}

export interface PressSetup {
  material: MaterialId;
  dMm: number;
  eccMm: number;
  preloadMm: number;
  gauge: { mounted: string | null; connected: boolean; zeroed: boolean; calibrated: boolean; angleDeg: number; cableRouted: boolean; scale: number };
  cell: { connected: boolean; zeroed: boolean; range: number };
  rateHz: number;
  /** Solo docente: módulo y fluencia verdaderos (Pa) y deformación plástica (adim.). */
  trueE: number;
  trueSigmaY: number;
  epsP: number;
}

/** Muestra del registrador: [t (s), F indicada (N), ΔL indicado (mm), F verdadera, ΔL verdadero]. */
export type CurveSample = [number, number, number, number, number];

/** Ciclo de carga registrado (del arranque al paro del registrador). */
export interface CurveRun {
  id: number;
  startS: number;
  samples: CurveSample[];
  nextT: number;
  done: boolean;
  configChangedT: number | null;
  quickT: number | null;
  clippedT: number | null;
  peakTrueN: number;
  setup: PressSetup;
  configVersion: number;
}

export type ReadingKindF10 = 'weight' | 'position' | 'reaction' | 'diameter' | 'force' | 'elong' | 'curve';

export interface ReadingF10 {
  id: string;
  trialId: string;
  kind: ReadingKindF10;
  instrumentId: string;
  value: number;
  unit: 'N' | 'cm' | 'mm';
  resolution: number;
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'NOT_ZEROED', 'PARALLAX', 'UNSTABLE', 'CLIPPED', 'NOT_SEATED', 'HAND_ON', 'PLASTIC', … */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca en evaluación). */
  trueValue: number;
  valid?: boolean;
  /** Qué se midió ('beam', 'load1', 'supA', 'cg', 'A', 'B', 'spec1', 'L0', 'press'…). */
  target?: string;
  /**
   * Curva: rigidez del tramo elástico de la carga (N/mm), fuerza máxima y alargamiento residual indicados, muestras.
   * Campos sin dato en null (NaN no sobrevive al JSON).
   */
  fit?: { k: number | null; Fmax: number | null; res: number | null; n: number; trueK: number | null; trueFmax: number | null; trueRes: number | null };
  setup?: Partial<F10Setup>;
  press?: Partial<PressSetup>;
  /** Solo docente: fuerza axial verdadera en la probeta al leer (N). */
  trueForceN?: number;
  configVersion: number;
}

export interface SafetyStateF10 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface MaterialProps {
  E: number;
  sigmaY: number;
  nu: number;
}

export interface F10Params {
  dtS: number;
  subSteps: number;
  /** 'CURRICULAR': ideal (sin ruido, centro de masa centrado, mesada nivelada); 'REALISTIC': sensores y montaje reales. */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  g: number;
  beamKg: number;
  beamLenCm: number;
  /** Corrimiento del centro de masa por la ferretería de un extremo (cm). */
  cgOffsetCm: number;
  /** Altura del centro de masa sobre el filo de la cuña (cm): en la mesada inclinada corre el punto de equilibrio (F10-E20). */
  hcCm: number;
  /** Tolerancia de equilibrio sobre la cuña (cm). */
  wedgeTolCm: number;
  supportMinCm: number;
  supportMaxCm: number;
  loadKg: number;
  /** Apoyos más cerca que esto: sistema mal condicionado (cm, F10-E09). */
  illCondCm: number;
  /** Fracción del peso que se corre de un filo al otro con la viga sin asentar (F10-E01). */
  seatBias: number;
  /** Fuerza de la mano que sostiene la viga (N) y dónde apoya (cm). */
  handN: number;
  handS: number;
  /** Corrimiento de un apoyo sin trabar al cargarlo (cm, F10-E28). */
  driftCm: number;
  settleS: number;
  /** Caída hasta los topes de seguridad bajo los extremos (cm). */
  tipDropCm: number;
  cell: { rangeN: number; resN: number; offsetN: number; noiseN: number };
  dyn: { rangeN: number; resN: number; offsetN: number };
  tapeResCm: number;
  caliperResMm: number;
  material: MaterialId;
  materials: Record<MaterialId, MaterialProps>;
  /** Pendiente plástica relativa (E_t / E). */
  hardening: number;
  specimenDmm: number;
  dSpreadMm: number;
  L0mm: number;
  eccMm: number;
  preloadMm: number;
  crankSpeedMmS: number;
  quickSpeedMmS: number;
  crankMaxMm: number;
  transientS: number;
  vibrationS: number;
  quickRelease: boolean;
  loadCell: { ranges: number[]; resolutions: number[]; offsetN: number; noiseN: number };
  gauge: { resMm: number; rangeMm: number; offsetMm: number; uncalScale: number; noiseMm: number };
  rates: number[];
  benchTiltDeg: number;
  noiseFactor: number;
  uB: { dynN: number; cellN: number; tapeCm: number; caliperMm: number; loadCellN: number; gaugeMm: number };
  calibration: Record<string, CalibrationStatus>;
}

export interface F10World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: F10Params;
  mode: string;
  objects: Record<string, F10Object>;
  beam: BeamState;
  supports: Record<SupportId, SupportState>;
  loads: Record<'load1', LoadState>;
  cells: Record<SupportId, CellState> & { connected: boolean };
  dyn: DynState;
  bench: { tiltDeg: number };
  /** Centro de masa verdadero de la viga (cm). */
  cgS: number;
  specimens: Record<string, SpecimenState>;
  press: PressState;
  gauge: GaugeState;
  loadCell: LoadCellState;
  logger: { rateHz: number };
  run: CurveRun | null;
  runs: CurveRun[];
  /** Viga o filo golpeados tras un vuelco o una carga caída (F10-E39). */
  damaged: boolean;
  /** Balances: energía mecánica de la viga que vuelca, elástica de la probeta, disipada y trabajo externo (J). */
  energy: { dissipatedJ: number; externalJ: number; crankJ: number; plasticJ: number };
  trial: number;
  configVersion: number;
  readings: Record<string, ReadingF10>;
  readingOrder: string[];
  safety: SafetyStateF10;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { massesG: number };
}
