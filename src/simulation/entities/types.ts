import type { ComponentId, OilId, SubstanceId } from '../substances/types';

/** Cantidades por componente (g). */
export type Amounts = Partial<Record<ComponentId, number>>;

/** §13 — tipos mínimos del documento. */
export type Phase = 'SOLID' | 'LIQUID' | 'AQUEOUS' | 'SUSPENDED_SOLID';

export interface SubstanceAmount {
  substanceId: string;
  massG: number;
  phase: Phase;
  dissolved?: boolean;
  particleSizeUm?: number;
}

export interface CrystalPopulation {
  substanceId: 'KNO3';
  massG: number;
  meanSizeMm: number;
  sizeVariance: number;
  purityFraction: number;
  nucleated: boolean;
}

/**
 * Contenido de un recipiente.
 * - `solid`: sólido particulado no disuelto (reactivo, sedimento o en suspensión).
 * - `dissolved`: soluto en la fase acuosa.
 * - `oil`: fase líquida inmiscible.
 * - `crystals`: KNO₃ cristalizado dentro del recipiente (no se mezcla con `solid`).
 */
export interface Mixture {
  waterG: number;
  iceG: number;
  solid: Partial<Record<SubstanceId, number>>;
  dissolved: Partial<Record<SubstanceId, number>>;
  oil: Partial<Record<OilId, number>>;
  /** Fracción (0–1) de cada sólido que está en suspensión (el resto sedimentado). */
  suspended: Partial<Record<SubstanceId, number>>;
  /** 0–1: grado de emulsión temporal del aceite. Nunca es disolución. */
  emulsion: number;
  crystals: CrystalPopulation | null;
}

export type VesselType =
  | 'BEAKER'
  | 'TEST_TUBE'
  | 'GRADUATED_CYLINDER'
  | 'PORCELAIN_DISH'
  | 'FUNNEL'
  | 'FILTER_PAPER'
  | 'BATH'
  | 'REAGENT_JAR'
  | 'REAGENT_BOTTLE'
  | 'VIAL'
  | 'WEIGH_PAPER'
  | 'WASH_BOTTLE'
  | 'JUG'
  | 'ICE_BUCKET'
  | 'SPATULA'
  | 'SCOOP'
  | 'DROPPER'
  | 'WASTE'
  | 'TOWEL';

export type CrystPhase =
  | 'DILUTE'
  | 'CONCENTRATING'
  | 'UNSATURATED'
  | 'SATURATED'
  | 'SUPERSATURATED'
  | 'NUCLEATING'
  | 'CRYSTAL_GROWTH'
  | 'EQUILIBRATED';

/**
 * Pose en cm de mesada: x a lo largo, y en profundidad, z altura; `rotationRad` = inclinación al verter.
 * `quat` (opcional) guarda la orientación libre de un objeto en reposo (p. ej. volcado por la física);
 * es solo presentación y persistencia: la ciencia no la usa.
 */
export interface Pose {
  x: number;
  y: number;
  z: number;
  rotationRad: number;
  quat?: [number, number, number, number];
}

export interface ThermalProps {
  /** Masa del recipiente (g) y su calor específico. */
  containerMassG: number;
  containerCpJPerGK: number;
  /** Conductancias térmicas (W/K). */
  hPlate: number;
  hAir: number;
  hBath: number;
  /** Área libre de evaporación (cm²). */
  openAreaCm2: number;
}

export type FoldState = 'FLAT' | 'HALF' | 'QUARTER' | 'CONE_OK' | 'CONE_BAD' | 'CRUMPLED';

/** §13 FilterState + estado de doblado. */
export interface FilterState {
  fold: FoldState;
  foldedCorrectly: boolean;
  wetted: boolean;
  torn: boolean;
  overflowed: boolean;
  retainedLiquidMl: number;
  flowRateMlPerS: number;
  /** Agua aplicada para humedecer (mL). */
  wettingWaterMl: number;
}

export interface FunnelState {
  paperId: string | null;
  dripTargetId: string | null;
  stemTouchingWall: boolean;
  /** Caudal de filtrado instantáneo (mL/s). */
  dripRateMlPerS: number;
}

export type AgitationTool = 'NONE' | 'ROD' | 'SHAKE' | 'SWIRL';

export interface CrystState {
  phase: CrystPhase;
  nucleationProgress: number;
  baseDelayS: number;
  scrapeBoostUntilS: number;
  /** Velocidad de enfriamiento suavizada (°C/s, positiva al enfriar). */
  coolingRate: number;
  lastTempC: number;
  seeded: boolean;
  nucleiCount?: number;
}

export type CoverMode = 'NONE' | 'PARTIAL' | 'SEALED';

export interface Vessel {
  id: string;
  type: VesselType;
  capacityMl: number;
  temperatureC: number;
  mix: Mixture;
  integrity: 0 | 1;
  pose: Pose;
  label: string | null;
  tareMassG: number;
  cover: CoverMode;
  /** Soporte actual: 'bench', 'hotplate', 'balance', 'rack:0'…'rack:5', 'ring', 'bath', 'funnel', 'dish' o null (en mano). */
  support: string | null;
  thermal: ThermalProps;
  agitation: number;
  agitationTool: AgitationTool;
  lastAgitatedS: number;
  agitatedTotalS: number;
  tipped: boolean;
  cryst: CrystState;
  maxTempC: number;
  /** Evidencia de técnica por recipiente. */
  fanned: boolean;
  waterBeforeSample: boolean;
  filter?: FilterState;
  funnel?: FunnelState;
  /** Máximo de sólido particulado que ha contenido (para la fracción que queda adherida a la pared). */
  maxParticulateG: number;
  /** Para herramientas (espátula/gotero): sustancia de la última carga. */
  lastLoaded?: SubstanceId | null;
  /** La carga actual se tomó con restos de OTRA sustancia (espátula sin limpiar): depositarla contamina. */
  mixedLoad?: boolean;
  /** El recipiente se considera "nuevo/limpio" de repuesto. */
  spare?: boolean;
}

export interface Hotplate {
  powerPct: number;
  plateTempC: number;
  lastPowerPct: number;
  lastPowerChangeS: number;
  emptyHeatingS: number;
}

/** Objeto no-recipiente (placa, balanza, soporte, gradilla, varilla, sonda…): solo pose y soporte. */
export interface Prop {
  id: string;
  kind: string;
  pose: Pose;
  support: string | null;
}

export interface Devices {
  hotplate: Hotplate;
  balance: { tareOffsetG: number };
  probe: { vesselId: string | null; touchingBottom: boolean };
  rod: { vesselId: string | null; integrity: 0 | 1 };
  stand: { ringHeightCm: number; assembled: boolean };
  hand: { mode: 'HAND' | 'TONGS' };
}

export type Severity = 'INFO' | 'WARN' | 'ALERT' | 'CRITICAL';

export interface SimEvent {
  seq?: number;
  t: number;
  code: string;
  severity: Severity;
  vesselId?: string;
  params?: Record<string, string | number | boolean>;
}

export interface PourState {
  sourceId: string;
  targetId: string | null;
  liquidRateMlS: number;
  solidRateGS: number;
  tiltDeg: number;
  guided: boolean;
  startedS: number;
  transferredMl: number;
  transferredSolidG: number;
  spilledMl: number;
}

export interface SafetyBlock {
  code: string;
  params?: Record<string, string | number | boolean>;
}

export interface Ledger {
  spilled: Amounts;
  adhered: Amounts;
  evaporated: Amounts;
}

export interface SimParams {
  dtS: number;
  ambientC: number;
  relativeHumidity: number;
  spatulaNominalG: number;
  spatulaMinG: number;
  spatulaMaxG: number;
  spatulaResidueG: number;
  dropMl: number;
  reagentPurity: number;
  oilProfile: 'OIL_VEG' | 'OIL_MIN';
  hotplateMaxC: number;
  hotplateTauS: number;
  latentJPerG: number;
  fusionJPerG: number;
  cpWater: number;
  evapK: number;
  coverEvapFactor: number;
  coverSplashFactor: number;
  restDissolveFactor: number;
  dissolveTempScaleC: number;
  ebullioscopicK: number;
  maxBoilingElevationC: number;
  filter: {
    baseK: number;
    holdupBaseMl: number;
    holdupPerGSolidMl: number;
    efficiencyOk: number;
    efficiencyDry: number;
    efficiencyBadFold: number;
    efficiencyTorn: number;
    bypassDry: number;
    bypassBadFold: number;
    bypassTorn: number;
    coneCapacityMl: number;
    funnelCapacityMl: number;
    tearRateThresholdMlS: number;
    splashNoWallFrac: number;
  };
  crystal: {
    growthK: number;
    baseDelayMinS: number;
    baseDelayMaxS: number;
    scrapeBoost: number;
    agitationBoost: number;
    minPurity: number;
    maxPurity: number;
  };
  safety: {
    hotTouchC: number;
    dryWaterFraction: number;
    dryCarbonMinG: number;
    emptyHeatLimitS: number;
    overheatIncidentC: number;
    discolorC: number;
    majorSpillMl: number;
    thermalShockDeltaC: number;
  };
  bathOverflowLevelCm: number;
  adheredFilmMl: number;
}

export interface World {
  version: 1;
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: SimParams;
  vessels: Record<string, Vessel>;
  props: Record<string, Prop>;
  devices: Devices;
  pours: Record<string, PourState>;
  ledger: Ledger;
  /** Totales iniciales por componente en todo el mundo (para la auditoría). */
  initialTotals: Amounts;
  /** Contenido inicial de los envases de reactivo (para calcular la muestra tomada). */
  reagentInitial: Record<string, Amounts>;
  spareCount: number;
  bench: { spillMl: number; spillOpen: boolean; shards: string[] };
  safety: { block: SafetyBlock | null; halted: boolean; burns: number; incident: string | null };
  evidence: Record<string, number>;
  events: SimEvent[];
}
