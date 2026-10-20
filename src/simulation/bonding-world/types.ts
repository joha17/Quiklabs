/**
 * Estado del mundo de la Práctica 7 (enlaces y propiedades). Datos puros, JSON serializables y deterministas (§6.3).
 * Unidades: cm sobre la mesada (x a lo largo, y en profundidad, z altura), g, mL, °C, s; conductividad interna en S/m.
 *
 * La materia se guarda como INVENTARIO DE COMPONENTES en gramos por compartimento (§3.2): fase líquida polar, fase
 * líquida apolar y sólido no disuelto de cada recipiente, carga de herramientas, película de la sonda, derrames y
 * residuos. Los iones NO se guardan aparte: se derivan de la masa disuelta y de la ficha (sin duplicar masa, §6.5).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { AnalyticalBalanceParams, AnalyticalBalanceState } from '../instruments/analytical-balance';
import type { MaterialId } from '../solution-properties/materials';
import type { VesselShape } from './geometry';
import type { Comp } from '../solution-properties/conservation';

export type { Pose, Severity, SimEvent, MaterialId };

/** Masa de cada componente (g). */
export type { Comp };

export type P07ObjKind =
  | 'balance' | 'watchGlass' | 'spatula' | 'washBottle' | 'dropper' | 'stirRod' | 'cylinder10' | 'tube' | 'rack'
  | 'bottle' | 'jar' | 'beaker' | 'flask' | 'waste' | 'detector' | 'tip' | 'meter' | 'probe' | 'vial' | 'specimen' | 'tile'
  | 'ppeBoard';

export interface P07Object {
  id: string;
  kind: P07ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'pan', '<rackId>:<slot>' (tubo en la gradilla), '<vesselId>' (gotero, agitador, sonda o puntas
   * dentro o sobre algo), '<specimenId>' (punta apoyada en una muestra), '<watchGlassId>' (muestra sobre el vidrio).
   */
  support: string;
  movable: boolean;
  /** Etiqueta escrita por el estudiante (tubos) o rótulo (frascos); las incógnitas muestran solo su código. */
  label?: string;
  /** Masa del objeto vacío y seco (g) para la balanza. */
  massG?: number;
}

/** Un recipiente: fases líquidas, sólido sin disolver y su geometría (el mismo perfil que la escena, §4.1). */
export interface Vessel {
  id: string;
  shape: VesselShape;
  /** Capacidad nominal y hasta el borde (mL). */
  capacityMl: number;
  brimMl: number;
  /** Sección interior (cm²) y altura del fondo interior (cm) para niveles. */
  areaCm2: number;
  floorCm: number;
  /** Fase polar (agua y lo que lleva disuelto o mezclado). */
  polar: Comp;
  /** Fase apolar (heptano, aceite y lo que llevan disuelto). */
  apolar: Comp;
  /** Sólido sin disolver (sedimento o partículas). */
  solid: Comp;
  tempC: number;
  /** Homogeneidad de la mezcla líquida (0 = recién agregado sin mezclar, 1 = homogénea). */
  mixed01: number;
  /** Emulsión/turbidez temporal por agitación de dos fases (0–1). */
  emulsion01: number;
  /** Última adición (s): el equilibrio se juzga desde aquí (§5.B). */
  lastAddS: number;
  /** Agitación actual 0–1 (la aporta el controlador mientras se agita). */
  stir01: number;
  /** Frascos de reactivo: tapa puesta (§11, L08). */
  capped?: boolean;
  /** Materiales de las muestras que pasaron por aquí (trazabilidad, L11). */
  history: MaterialId[];
  /** Recipientes de los que vino lo que contiene (procedencia transitiva: incógnitas, §5.E). */
  from: string[];
}

export interface Pour07 {
  sourceId: string;
  targetId: string | null;
  tiltDeg: number;
  startedS: number;
  transferredG: number;
}

/** Gotero graduado de 5 mL: contenido homogéneo de la fase de la que se aspiró (§6.1). */
export interface DropperState {
  content: Comp;
  /** Última fase aspirada (para detectar arrastre apolar → agua, L20). */
  lastPhase: 'polar' | 'apolar' | null;
  squeeze01: number;
  from: string[];
}

/** Espátula: carga y película que queda (contaminación, L14). */
export interface SpatulaState {
  load: Comp;
  residue: Comp;
  from: string[];
}

/** Muestra sólida para el detector (§5.C). */
export interface SpecimenState {
  id: string;
  material: MaterialId;
  lengthCm: number;
  widthCm: number;
  thickCm: number;
  /** 'flat' = acostada (grafito: recorrido en el plano); 'edge' = de canto (recorrido a través de las capas). */
  orientation: 'flat' | 'edge';
  /** Película superficial de agua con sal disuelta (g); escenario S05 o muestra mojada por el estudiante. */
  surfaceWaterG: number;
  surfaceSaltG: number;
  /** Película de óxido aislante en la superficie (aluminio, S06). */
  oxide: boolean;
  /** Muestra de incógnita: código visible en lugar del nombre. */
  unknownCode?: string;
}

export interface SurfaceHit {
  /** Muestra, el panel de control del detector, la otra punta, un recipiente (mal uso) o el aire. */
  targetId: string;
  /** Posición del contacto sobre la pieza (cm, coordenadas locales a lo largo y a lo ancho). */
  u: number;
  v: number;
  /** Separación entre la punta y la superficie (cm): > 0,02 ya no hay contacto. */
  gapCm: number;
  /** Presión sobre el contacto (0–1). */
  force01: number;
}

/** Detector de conducción para sólidos: fuente limitada, dos puntas, rango e indicador (§3.5). */
export interface DetectorState {
  powered: boolean;
  range: 'LOW' | 'HIGH';
  cablesOk: boolean;
  /** Prueba del circuito con el panel de control incorporado (L05, L30). */
  controlTest: 'none' | 'passed' | 'failed';
  inspected: boolean;
  a: SurfaceHit | null;
  b: SurfaceHit | null;
  /** Instante en que se estableció el contacto actual (estabilización, L28). */
  contactSince: number | null;
  /** Corriente que circula (mA) y lo que muestra el indicador (0–1). */
  currentMA: number;
  shownMA: number;
  indicator01: number;
}

/** Conductímetro con sonda (perfil genérico, §4.1). */
export interface MeterState {
  powered: boolean;
  range: 'LOW' | 'MID' | 'HIGH';
  /** Compensación automática de temperatura a 25 °C. */
  atc: boolean;
  /** Patrón elegido en el menú del equipo (µS/cm). */
  standardSetting: 1413 | 12880;
  /** Factor real de la celda respecto del nominal (sin calibrar ≠ 1) y factor de calibración aplicado. */
  cellError: number;
  calibFactor: number;
  calibratedWith: string | null;
  inspected: boolean;
  /** Dónde está la sonda, cuánto se sumerge y si toca el fondo. */
  vesselId: string | null;
  immersionCm: number;
  bottomContact: boolean;
  probeTempC: number;
  /** Película de líquido en la sonda (composición, g), arrastrada al siguiente recipiente si no se enjuaga (L33). */
  film: Comp;
  filmFrom: string | null;
  /** Indicación (S/m antes de la conversión de pantalla) y estabilidad. */
  shownSPerM: number;
  /** Valor de referencia de la ventana de estabilidad. */
  refSPerM: number;
  quietS: number;
  stable: boolean;
}

export interface BalanceState07 extends AnalyticalBalanceState {
  powered: boolean;
  panIds: string[];
  zeroBiasG: number;
  tareSession: number;
}

export type ReadingKind = 'mass' | 'volume' | 'temperature' | 'conductivity' | 'current' | 'observation';

/** Lectura instrumental u observación registrada (§6.6). Solo las válidas cuentan para evidencia y rúbrica. */
export interface Reading07 {
  id: string;
  tick: number;
  t: number;
  kind: ReadingKind;
  instrumentId: string;
  targetId: string;
  value: number;
  unit: 'g' | 'mL' | '°C' | 'µS/cm' | 'mS/cm' | 'mA' | '';
  resolution: number;
  standardUncertainty: number;
  valid: boolean;
  stable: boolean;
  qualityFlags: string[];
  /** Verdad del motor (solo docente y auditoría). */
  trueValue: number;
  /** Instantánea de las condiciones (materiales presentes, temperatura, rango, orientación…). */
  snapshot: ReadingSnapshot;
}

export interface ReadingSnapshot {
  materials: MaterialId[];
  /** Procedencia del contenido medido u observado. */
  sources?: string[];
  tempC?: number;
  range?: string;
  /** Observaciones de mezcla. */
  phases?: number;
  undissolvedG?: number;
  turbid?: boolean;
  sinceAddS?: number;
  solvents?: MaterialId[];
  /** Detector: tipo de recorrido y muestra. */
  specimenId?: string;
  path?: 'inPlane' | 'perpendicular' | 'iso';
  wetSurface?: boolean;
  /** Conductímetro: calibrado, compensado. */
  calibrated?: boolean;
  atc?: boolean;
  tareSession?: number;
  /** Concentraciones verdaderas (mol/L) del contenido medido (docente). */
  trueConcM?: number;
  /** Fase en la que midió la sonda. */
  phase?: 'polar' | 'apolar';
}

export interface SafetyState07 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; gloves: 'none' | 'nitrile' | 'latex' };
  block: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface P07Params {
  dtS: number;
  initialTemperatureC: number;
  waterPairVolumeMl: number;
  apolarPairVolumeMl: number;
  minimumPairComparisons: number;
  minimumUnknowns: number;
  probeStabilityS: number;
  probeResponseTauS: number;
  probeMinImmersionCm: number;
  probeFilmMl: number;
  mixObservationS: number;
  balance: AnalyticalBalanceParams;
  cylinderCapacityMl: number;
  cylinderDivisionMl: number;
  /** Fondo iónico del agua de referencia (S/m): agua purificada en equilibrio con el aire, no cero. */
  waterBackgroundSPerM: number;
  detectorVoltageV: number;
  detectorLimitOhm: number;
  detectorThresholdMA: number;
  detectorStabilityS: number;
  contactOhm: number;
  oxideContactOhm: number;
  meterRanges: Record<'LOW' | 'MID' | 'HIGH', { maxUsPerCm: number; resolutionUsPerCm: number }>;
  spatulaScoopG: number;
  spatulaResidueFraction: number;
  aceticStockM: number;
  allowRestricted: boolean;
  parallaxSlopeThreshold: number;
}

export interface P07World {
  schemaVersion: number;
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: P07Params;
  mode: string;
  objects: Record<string, P07Object>;
  vessels: Record<string, Vessel>;
  pours: Record<string, Pour07>;
  droppers: Record<string, DropperState>;
  spatula: SpatulaState;
  specimens: Record<string, SpecimenState>;
  detector: DetectorState;
  meter: MeterState;
  balance: BalanceState07;
  /** Derrames y residuos contabilizados (g por componente). */
  spills: Record<'bench' | 'electrics', Comp>;
  /** Incógnitas asignadas por semilla (identidad oculta al alumno en Evaluación). */
  unknowns: Record<string, { code: string; material: MaterialId; jarId: string; specimenId?: string }>;
  readings: Record<string, Reading07>;
  readingOrder: string[];
  safety: SafetyState07;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  paused: boolean;
  /** Inventario inicial por componente (g) para el balance (§6.5). */
  initialTotals: Comp;
}
