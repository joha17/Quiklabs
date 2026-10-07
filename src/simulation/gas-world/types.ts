/**
 * Estado del mundo de la Práctica 10 (gases ideales y ley de Boyle). Datos puros, serializables y deterministas.
 * Unidades: cm sobre la mesada (x a lo largo, y en profundidad, z altura), mL, g, mol, °C/K, kPa, s.
 * Los valores científicos viven aquí; la escena solo los dibuja (§4.2).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { AnalyticalBalanceParams, AnalyticalBalanceState } from '../instruments/analytical-balance';
import type { PressureSensorState, SensorModel } from '../instruments/pressure-sensor';
import type { VaporModel } from '../gas-laws/vapor';
import type { VinegarProfile } from '../gas-laws/stoich';

export type { Pose, Severity, SimEvent };

export type P10ObjKind =
  | 'abalance' | 'watchGlass' | 'spatula' | 'bicarbJar' | 'beaker150' | 'funnel' | 'flask' | 'pipette' | 'propipette'
  | 'washBottle' | 'waterBottle' | 'vinegarBottle' | 'cylinder' | 'erlenmeyer' | 'stopper' | 'beaker600' | 'burette'
  | 'stand' | 'uTube' | 'thermometer' | 'barometer' | 'ruler' | 'sensor' | 'datalogger' | 'syringe' | 'sink';

export interface P10Object {
  id: string;
  kind: P10ObjKind;
  pose: Pose;
  /**
   * 'bench', 'hand', 'pan' (balanza), 'funnel:<id>' (embudo sobre un recipiente), 'clamp' (bureta en la prensa),
   * 'beaker600' (bureta, tubo en U o termómetro en el baño), 'burette' (punta del tubo en U en la boca de la bureta),
   * 'erlenmeyer' (tapón puesto), 'sensor' (jeringa conectada), 'wall', 'sink'.
   */
  support: string;
  movable: boolean;
}

/** Un recipiente con líquido acuoso (mL ≈ g). Solutos en mol. */
export interface LiquidVessel {
  id: string;
  capacityMl: number;
  /** Volumen de líquido (mL). */
  ml: number;
  /** Película adherida a las paredes (mL), que no se vierte. */
  wetMl: number;
  nBicarb: number;
  nAcid: number;
  nAcetate: number;
  /** CO₂ disuelto (mol). */
  nCo2Aq: number;
  /** Sólido sin disolver (g de NaHCO₃). */
  solidBicarbG: number;
  tempC: number;
  /** Sección interior (cm²) y altura del fondo interior (cm). */
  areaCm2: number;
  floorCm: number;
}

export interface Pour {
  sourceId: string;
  targetId: string | null;
  tiltDeg: number;
  startedS: number;
  transferredMl: number;
}

/** Balón aforado (§9.1, §10.3): homogeneidad y estado del aforo. */
export interface FlaskState {
  /** Capacidad nominal (mL) y volumen real a la marca (tolerancia de clase A). */
  nominalMl: number;
  trueMarkMl: number;
  stoppered: boolean;
  /** 0 = sin mezclar (gradiente); 1 = homogéneo. */
  mix: number;
  inversions: number;
  /** Se completó el último tramo con chorro rápido (riesgo de pasarse). */
  fastFinish: boolean;
}

/** Pipeta volumétrica TD con propipeta (§9.2). */
export interface PipetteState {
  nominalMl: number;
  /** Volumen real que entrega a la marca (tolerancia). */
  trueDeliverMl: number;
  propipette: boolean;
  /** Acondicionada con la disolución (si no, el agua de las paredes diluye la alícuota). */
  conditioned: boolean;
  /** Agua de enjuague en las paredes (mL). */
  waterFilmMl: number;
  ml: number;
  nBicarb: number;
  /** Posición del menisco respecto de la marca (mL; + = por encima). */
  aboveMarkMl: number;
  adjusted: boolean;
  bubble: boolean;
  /** Se sopló la última gota (no permitido en una TD sin «blow-out»). */
  blown: boolean;
}

/** Unión de gas (§6.2). */
export interface GasConnection {
  id: string;
  connectedFrom: string | null;
  connectedTo: string | null;
  internalVolumeMl: number;
  /** Conductancia de fuga (mol·s⁻¹·kPa⁻¹) cuando no está asegurada o está dañada. */
  leakConductanceMolPerSKPa: number;
  /** Fracción de la sección perdida por un doblez (0–1). */
  kinkFraction: number;
  /** Líquido dentro (0–1). */
  wetFraction: number;
  secured: boolean;
}

/** Reactor (§12.1, §29.2). */
export interface ReactorState {
  stage: 'OPEN' | 'ALIQUOT_LOADED' | 'CONNECTED' | 'ACID_ADDED' | 'SEALING' | 'REACTING' | 'DEGASSING' | 'COMPLETE' | 'SAFE_TO_OPEN';
  stoppered: boolean;
  /** Volumen interno total del Erlenmeyer bajo el tapón (mL). */
  totalVolumeMl: number;
  /** Gas del espacio de cabeza (mol). */
  nAir: number;
  nCo2Gas: number;
  /** Presión del espacio de cabeza (kPa). */
  pressureKPa: number;
  foam: number;
  /** Agitación 0–1 (decae). */
  stir: number;
  /** Índice de mezcla de los reactivos (0–1). */
  mixing: number;
  /** CO₂ generado en total (mol) y su destino. */
  co2Generated: number;
  co2Escaped: number;
  co2Leaked: number;
  /** Instantes: vinagre añadido, tapón puesto, reacción terminada. */
  acidAddedAt: number | null;
  sealedAt: number | null;
  completeAt: number | null;
  /** Tiempo con generación baja y sin burbujas nuevas (s). */
  quietS: number;
}

/** Bureta invertida (§9.4, §16, §29.3). La escala impresa queda al revés: 50 arriba (llave), 0 abajo (boca). */
export interface BuretteState {
  stage: 'EMPTY' | 'WATER_FILLED' | 'INVERTING' | 'SUBMERGED' | 'CLAMPED' | 'BASELINE_READY' | 'GAS_COLLECTING' | 'EQUILIBRATING' | 'READABLE';
  /** Agua dentro (mL) mientras no está invertida. */
  waterMl: number;
  inverted: boolean;
  /** Volumen interno entre la llave y la marca de 50 mL (sin graduar) y entre la marca de 0 y la boca (mL). */
  topUngraduatedMl: number;
  mouthUngraduatedMl: number;
  /** Gas en la parte superior (mol) y su temperatura (°C). */
  nAir: number;
  nCo2: number;
  gasC: number;
  /** CO₂ disuelto en el agua de la bureta (mol). */
  nCo2Aq: number;
  stopcockOpen: boolean;
  clamped: boolean;
  tiltDeg: number;
  /** Altura de la boca sobre el fondo del beaker (cm). */
  mouthAboveFloorCm: number;
  /** Gas que escapó por la boca al sobrepasar la capacidad (mol). */
  overflowMol: number;
  /** Aire que entró al invertir mal o llenar incompleto (mL a P atm). */
  initialAirMl: number;
}

export interface ThermometerState {
  displayedC: number;
  timeConstantS: number;
  resolutionC: number;
  offsetC: number;
  /** 'air', 'beaker600', 'erlenmeyer'. */
  where: string;
  /** Toca la pared o el fondo. */
  touching: boolean;
}

/** Jeringa del ensayo de Boyle (§20, §22). */
export interface SyringeState {
  stage: 'DISCONNECTED' | 'SET_TO_10_ML' | 'CONNECTED' | 'COLLECTING' | 'VOLUME_SELECTED' | 'PRESSURE_STABILIZING' | 'POINT_READY' | 'POINT_SAVED' | 'NEXT_VOLUME' | 'FITTING' | 'COMPLETE';
  /** Posición del borde frontal del sello (mL de la escala). */
  markMl: number;
  /** La mano sostiene el émbolo y hacia dónde lo lleva (mL). */
  held: boolean;
  targetMl: number;
  velocityMlS: number;
  connected: boolean;
  /** Válvula del sensor: hacia la jeringa (correcto) o abierta al ambiente. */
  valve: 'TO_SYRINGE' | 'VENT';
  sealDamaged: boolean;
  /** Aire encerrado (mol) y su temperatura (K). */
  nAir: number;
  gasK: number;
  /** Presión real del gas (kPa absolutos). */
  pressureKPa: number;
  /** Volumen adicional de conectores y tubos (mL), además del interno del sensor. */
  extraVolumeMl: number;
  collecting: boolean;
  /** Fuga acumulada (mol). */
  leakedMol: number;
}

/** Un punto guardado con «Keep» (§23.2). */
export interface BoylePoint {
  index: number;
  t: number;
  /** Marca real de la jeringa al guardar y el volumen total que ingresó el estudiante. */
  markMl: number;
  enteredTotalMl: number;
  displayedKPa: number;
  trueKPa: number;
  gasK: number;
  stable: boolean;
  held: boolean;
}

export interface MassReading {
  id: string;
  t: number;
  displayedG: number;
  trueG: number;
  objectId: string | null;
  /** Contenido de NaHCO₃ del objeto pesado (g). */
  bicarbG: number;
  stable: boolean;
  doorsOpen: boolean;
  valid: boolean;
  invalidReason?: string;
  tare: boolean;
}

export interface VolumeReading {
  id: string;
  t: number;
  instrument: 'cylinder' | 'burette' | 'flask' | 'pipette';
  valueMl: number;
  trueMl: number;
  eyeDzCm: number;
  atEyeLevel: boolean;
  /** Para la bureta: lectura inválida (inclinada, fuera de escala). */
  invalid?: 'TILTED' | 'OFF_SCALE' | 'NOT_INVERTED';
  changing?: boolean;
}

export interface TempReading {
  id: string;
  t: number;
  valueC: number;
  where: string;
  changing: boolean;
}

export interface HeightReading {
  id: string;
  t: number;
  /** h = nivel interno − nivel externo (mm, con signo) leído y verdadero. */
  valueMm: number;
  trueMm: number;
  eyeDzCm: number;
  rulerAligned: boolean;
}

export interface BaroReading {
  id: string;
  t: number;
  mmHg: number;
  source: 'LOCAL' | 'WEATHER_SEA_LEVEL';
}

/** Un ensayo de la Parte A (§17.4). */
export interface GasRun {
  index: number;
  aliquotMl: number;
  nBicarb: number;
  nAcid: number;
  limiting: 'CH3COOH' | 'NaHCO3' | 'NONE';
  acidAddedAt: number;
  sealedAt: number | null;
  /** Gas en la bureta al tapar (mol) y volumen del gas de la bureta al tapar (mL, verdad). */
  buretteGasMlAtSeal: number | null;
  co2Generated: number;
  /** Gas (mol) que el reactor empujó a la bureta: aire desplazado + CO₂; equivale a lo generado si nada se pierde. */
  co2Collected: number;
  co2Dissolved: number;
  co2Leaked: number;
  co2Escaped: number;
  endedS: number | null;
}

export interface SafetyState10 {
  ppe: boolean;
  block: { code: string; since: number } | null;
  incident: { code: string; since: number; needs: string[]; done: string[] } | null;
  stoppedByTeacher: boolean;
  lastInteractionS: number;
}

export interface P10Params {
  dtS: number;
  ambientC: number;
  /** Presión atmosférica local (kPa) y altitud del laboratorio (m): la presión «del clima» se reduce al nivel del mar. */
  pressureKPa: number;
  altitudeM: number;
  /** 'CURRICULAR' (§3.1) o 'REALISTIC' (§3.2), visible para el estudiante. */
  model: 'CURRICULAR' | 'REALISTIC';
  vapor: VaporModel;
  /** Relación de densidades de la corrección curricular (13,5) o física (ρ dependiente de T). */
  densityRatio: number;
  balance: AnalyticalBalanceParams;
  /** Balón: 100,00 mL (o el alternativo de 50,00 mL) y tolerancia. */
  flaskMl: number;
  flaskTolMl: number;
  pipetteMl: number;
  pipetteTolMl: number;
  cylinderMl: number;
  cylinderUncertaintyMl: number;
  vinegar: VinegarProfile;
  vinegarMl: number;
  targetBicarbG: number;
  bathWaterMl: number;
  /** Agua del baño: fresca (absorbe CO₂) o saturada. */
  bathWater: 'FRESH' | 'SATURATED';
  /** Temperatura inicial del agua del grifo (°C). */
  tapWaterC: number;
  /** Volumen de mangueras y tubo en U (mL). */
  linesVolumeMl: number;
  /** Calidad de las conexiones: conductancia de fuga si quedan flojas. */
  looseLeakMolPerSKPa: number;
  /** Cinética: constante (s⁻¹) y desgasificación (s⁻¹). */
  reactionK: number;
  degasK: number;
  /** Transferencia de CO₂ al agua de la bureta (mL·s⁻¹ de «volumen equivalente»). */
  buretteKla: number;
  thermometer: { timeConstantS: number; resolutionC: number; uncertaintyC: number };
  barometer: { resolutionMmHg: number; uncertaintyMmHg: number };
  ruler: { resolutionMm: number; uncertaintyMm: number };
  buretteUncertaintyMl: number;
  // Boyle
  sensorModel: SensorModel;
  /** Volumen interno del sensor configurado (mL); null = el del perfil. */
  sensorInternalMl: number | null;
  syringeMl: number;
  /** Sección del émbolo (cm²), fricción estática y cinética (N), amortiguamiento (N·s/m). */
  syringeAreaCm2: number;
  frictionStaticN: number;
  frictionKineticN: number;
  plungerDampingNsPerM: number;
  handStiffnessNPerM: number;
  handMaxN: number;
  /** Transferencia de calor gas–pared (W/K) y compliance del sistema (mL/kPa). */
  syringeHeatWPerK: number;
  complianceMlPerKPa: number;
  /** Conductancia de fuga de la jeringa (mol·s⁻¹·kPa⁻¹) con conexión floja y con sello dañado. */
  syringeLeakLoose: number;
  syringeLeakSeal: number;
  /** Daño del sensor por sobrepresión (solo modo avanzado). */
  allowSensorDamage: boolean;
  replicates: number;
}

export interface P10World {
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: P10Params;
  objects: Record<string, P10Object>;
  balance: AnalyticalBalanceState;
  liquids: Record<string, LiquidVessel>;
  pours: Record<string, Pour>;
  /** NaHCO₃ sólido: frasco, vidrio de reloj, espátula, derrames (g). */
  solids: { jarG: number; watchGlassG: number; spatulaG: number; spilledG: number; funnelG: number; watchGlassWetG: number };
  watchGlassGlassG: number;
  flask: FlaskState;
  pipette: PipetteState;
  connections: Record<string, GasConnection>;
  reactor: ReactorState;
  burette: BuretteState;
  thermometer: ThermometerState;
  /** Temperatura del agua del baño (°C). */
  bathC: number;
  syringe: SyringeState;
  sensor: PressureSensorState;
  points: BoylePoint[];
  runs: GasRun[];
  massReadings: MassReading[];
  volumeReadings: VolumeReading[];
  tempReadings: TempReading[];
  heightReadings: HeightReading[];
  baroReadings: BaroReading[];
  /** Series de 1 Hz: lectura del sensor y presión/temperatura reales (docente). */
  series: { sensor: Array<{ t: number; p: number; pTrue: number; tK: number; mark: number }> };
  safety: SafetyState10;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  /** Elementos (C, H, O, Na) y agua totales al inicio (balances §3.3). */
  initialElements: Record<string, number>;
}
