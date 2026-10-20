/**
 * Estado del mundo de la Práctica 1 (instrumentación y densidades). Datos puros, serializables y deterministas.
 * Unidades declaradas: cm sobre la mesada (x a lo largo, y en profundidad, z altura), g, mL (líquidos y
 * desplazamientos), cm³ (volúmenes geométricos), °C, s. La magnitud conservada del agua es su MASA; su volumen sale de
 * V = m/ρ(T). La escena solo dibuja este estado y le envía hechos geométricos (§1.3, §6).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { AnalyticalBalanceParams, AnalyticalBalanceState } from '../instruments/analytical-balance';
import type { UncertaintyConvention } from '../metrology/uncertainty';

export type { Pose, Severity, SimEvent };

export type P01ObjKind =
  | 'balance' | 'watchGlass' | 'pipette' | 'filler' | 'cylinder' | 'erlenmeyer' | 'washBottle' | 'thermometer' | 'caliper'
  | 'solidCylinder' | 'nailsDish' | 'weighBoat' | 'reservoir' | 'iceBath' | 'spillTray' | 'waste'
  | 'recBeaker' | 'recTubes' | 'recFunnel' | 'recFilter' | 'recSpatula' | 'recBurette' | 'recAnalytical' | 'recRuler';

export interface P01Object {
  id: string;
  kind: P01ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'pan' (platillo de la balanza), '<fluidId>' (pipeta o termómetro dentro de un recipiente),
   * 'iceBath01' (depósito en el baño), 'watchGlass01' (cilindro sobre el vidrio de reloj), 'pipette25' (pera puesta).
   */
  support: string;
  movable: boolean;
  /** Material de vidrio astillado (§11): no se usa; se sustituye. */
  damaged?: boolean;
}

/** Un cuerpo de agua: masa conservada, temperatura y película de las paredes. */
export interface WaterBody {
  id: string;
  /** Capacidad nominal (mL) y hasta el borde (mL). */
  capacityMl: number;
  brimMl: number;
  waterG: number;
  tempC: number;
  /** Agua adherida a las paredes (g): no se vierte; se evapora de a poco. */
  wetG: number;
  /** Sección interior (cm²) y altura del fondo interior (cm) para el nivel. */
  areaCm2: number;
  floorCm: number;
  /** Masa del recipiente vacío y seco (g); 0 si no se pesa. */
  glassG: number;
}

export interface Pour01 {
  sourceId: string;
  targetId: string | null;
  tiltDeg: number;
  startedS: number;
  transferredG: number;
}

/** Pipeta aforada TD de 25 mL con pera (§5.B, §6). */
export interface PipetteState01 {
  nominalMl: number;
  /** Volumen que entrega a la marca con drenaje completo (dentro de la tolerancia de clase). */
  trueDeliverMl: number;
  /** Residuo calibrado TD en la punta (mL) y película extra del escenario de pipeta sucia. */
  residualMl: number;
  filmExtraMl: number;
  fillerAttached: boolean;
  fillerContaminated: boolean;
  waterG: number;
  tempC: number;
  /** Aire atrapado bajo el menisco (mL). */
  airMl: number;
  /** Gota adherida por fuera de la punta (g de agua). */
  externalDropG: number;
  /** El agua de la pipeta tomó una burbuja inicial del escenario (una sola vez). */
  bubbleSeeded: boolean;
  /** Depósito del que vino el agua actual (serie). */
  sourceId: string | null;
  /** Mandos continuos del gesto (0–1): aspirar con la pera y abrir la descarga. */
  suction01: number;
  release01: number;
  /** Ajuste del menisco hecho (y sesgo de lectura con el que se hizo, mL). */
  adjusted: boolean;
  adjustBiasMl: number;
  /** Drenaje en el receptor: tiempo con la descarga abierta y película que aún escurre (mL). */
  drainS: number;
  afterFilmMl: number;
  delivering: boolean;
  blown: boolean;
  /** Restos de la muestra anterior (g) y su temperatura (arrastre si no se enjuaga). */
  residueG: number;
  residueTempC: number;
  residueFrom: string | null;
  rinsedWith: string | null;
}

/** Un clavo del lote (§3.5): masa y densidad propias; dónde está. */
export interface NailPiece {
  id: string;
  massG: number;
  rhoGPerMl: number;
  /** 'nailsBatch01', 'weighBoat01', 'cylinder50', 'bench', 'spillTray01'. */
  where: string;
}

export interface CylinderState01 {
  /** Aire atrapado entre los clavos (mL): suma volumen aparente hasta que se libera golpeando suavemente. */
  trappedAirMl: number;
  /** El nivel oscila hasta este instante (s) tras una entrada brusca. */
  unsettledUntil: number;
}

export interface ThermometerState01 {
  displayedC: number;
  biasC: number;
  tauS: number;
  resolutionC: number;
  /** Recipiente donde está la sonda ('air' si fuera). */
  where: string;
  depthCm: number;
  touchingWall: boolean;
}

export interface CaliperState01 {
  zeroBiasCm: number;
  /** Medida en curso: qué toca y cómo. */
  target: 'none' | 'empty' | 'diameter' | 'height';
  angleDeg: number;
  force01: number;
  /** Giro de la pieza alrededor de su eje al medir el diámetro (°). */
  orientationDeg: number;
  /** Apertura que muestra la escala (cm, sin redondear). */
  apertureCm: number;
  zeroChecked: boolean;
}

export interface BalanceState01 extends AnalyticalBalanceState {
  powered: boolean;
  /** Objetos sobre el platillo. */
  panIds: string[];
  /** Cero desplazado del instrumento (g) y agua sobre el platillo (g). */
  zeroBiasG: number;
  panWetG: number;
  /** Sesión de tara: cambia en cada tara (las diferencias deben usar la misma). */
  tareSession: number;
  /** Se comprobó/fijó el cero con el platillo vacío desde que se encendió. */
  zeroedEmpty: boolean;
  /** Carga sin lectura estable que se retiró hace poco (para detectar lecturas tras retirar la pieza). */
  removedUnreadAt: number | null;
}

/** Una alícuota entregada al Erlenmeyer (serie de agua). */
export interface WaterSample {
  index: number;
  series: 'room' | 'cold';
  sourceId: string;
  flaskId: string;
  startedS: number;
  endedS: number | null;
  /** Lo que realmente llegó (g) y su temperatura media al llegar (°C). */
  deliveredG: number;
  tempAtDeliveryC: number;
  /** Técnica observada durante la toma y entrega. */
  flags: string[];
}

export interface Reading01 {
  id: string;
  kind: 'mass' | 'volume' | 'temp' | 'length';
  instrumentId: string;
  value: number;
  unit: 'g' | 'mL' | '°C' | 'cm';
  resolution: number;
  /** Incertidumbre del instrumento declarada (semiancho o u directa según el parámetro). */
  uncertainty: number;
  t: number;
  tick: number;
  sourceObjectIds: string[];
  /** 'UNSTABLE', 'PARALLAX', 'TILTED', 'MOVING', 'NOT_ZEROED', 'UNLEVELED', 'WET', 'NO_TARE', 'SHALLOW', 'WALL', 'OBLIQUE', 'FORCE', 'EMPTY_PAN', 'NON_VOLUMETRIC'… */
  qualityFlags: string[];
  /** Valor físico que correspondía (solo docente; nunca se muestra en evaluación). */
  trueValue: number;
  eyeDzCm?: number;
  tareSession?: number;
  /** Para la probeta y la pipeta: qué recipiente; para el calibrador: 'diameter' | 'height' | 'empty'. */
  target?: string;
  /** Alícuota a la que pertenece una masa o temperatura del Erlenmeyer. */
  sampleIndex?: number;
  /** Clavos dentro de la probeta al leer (para V inicial/final). */
  nailsInCylinder?: number;
  /** Lo que había en el platillo: clavos sobre el recipiente de pesada, cilindro sobre el vidrio, agua en el Erlenmeyer. */
  load?: { nails: number; solid: boolean; waterG: number };
  /** Giro de la pieza al medir el diámetro (°). */
  orientationDeg?: number;
}

export interface SafetyState01 {
  ppe: { coat: boolean; goggles: boolean; shoes: boolean; hair: boolean };
  block: { code: string; since: number } | null;
  incident: { code: string; since: number; needs: string[]; done: string[] } | null;
  stoppedByTeacher: boolean;
}

export interface P01Params {
  dtS: number;
  roomTempC: number;
  coldBathTargetC: number;
  ambientWaterInitialMl: number;
  coldWaterInitialMl: number;
  pipetteNominalMl: number;
  pipetteToleranceHalfWidthMl: number;
  pipetteTipResidualMl: number;
  pipetteDrainTimeS: number;
  pipetteMaxFlowMlS: number;
  graduatedCylinderCapacityMl: number;
  graduatedCylinderDivisionMl: number;
  graduatedCylinderReadHalfWidthMl: number;
  nailsTargetMassG: number;
  nailsReferenceDensityGPerMl: number;
  initialDisplacementWaterMl: number;
  solidCylinderDiameterCm: number;
  solidCylinderHeightCm: number;
  cylinderMaterialDensityGPerMl: number;
  watchGlassMassG: number;
  weighBoatMassG: number;
  erlenmeyerMassG: number;
  balance: AnalyticalBalanceParams;
  balanceStableTimeS: number;
  caliperResolutionCm: number;
  caliperStandardUncertaintyCm: number;
  thermometerResolutionC: number;
  thermometerStandardUncertaintyC: number;
  thermometerResponseTauS: number;
  roomThermalExchangeRateSInv: number;
  bathThermalExchangeRateSInv: number;
  maxParallaxDivisions: number;
  caliperContactForceThreshold: number;
  spillAlertThresholdMl: number;
  /** Convención de incertidumbre del intento (§7): se congela al crearlo. */
  convention: UncertaintyConvention;
}

export interface P01World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: P01Params;
  mode: string;
  objects: Record<string, P01Object>;
  fluids: Record<string, WaterBody>;
  pours: Record<string, Pour01>;
  pipette: PipetteState01;
  nails: NailPiece[];
  cylinder: CylinderState01;
  /** Cilindro metálico: dimensiones reales (cm), densidad (g/cm³) y ovalización (fracción, escenario S09). */
  solid: { diameterCm: number; heightCm: number; rhoGPerCm3: number; ovality: number };
  thermometer: ThermometerState01;
  caliper: CaliperState01;
  balance: BalanceState01;
  /** Baño con hielo: temperatura del agua del baño (°C). */
  bath: { tempC: number };
  /** Agua descartada (desecho registrado) y evaporada desde películas (g). */
  ledger: { discardedG: number; evaporatedG: number };
  /** Agua adherida a objetos que no son recipientes (g): vidrio de reloj, recipiente de pesada, clavos, cilindro. */
  wetObjects: Record<string, number>;
  /** Momento de encendido de la balanza (s) o null si está apagada desde el inicio. */
  balanceOnAt: number | null;
  samples: WaterSample[];
  readings: Record<string, Reading01>;
  readingOrder: string[];
  safety: SafetyState01;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  initialTotals: { waterMassG: number; metalMassG: number; regularSolidMassG: number };
}
