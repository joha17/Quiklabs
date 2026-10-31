/**
 * Mundo de la práctica B08 «Energía luminosa y pigmentos» (§6.2). REUTILIZA el mundo de B06 (microscopio opcional, caja de
 * láminas y capturas) y agrega tubos de intercambio gaseoso con capilar, lámparas, indicador BTB, campana, extracción con
 * balance por pigmento y cromatografía en papel. Los valores son perfiles sintéticos rotulados (§7). JSON serializable.
 */
import type { DivWorld } from '../div-world/types';
import type { PhotoKinetics } from '../photosynthesis/photokinetics';
import type { BtbColor } from '../photosynthesis/carbonate-btb';
import type { PigmentId, PigmentLedger } from '../photosynthesis/pigment-extraction';

export interface PhotoParams {
  kinetics: PhotoKinetics;
  runDurationS: number;
  seriesDurationS: number;
  capillaryRadiusCm: number;
  headspaceMl: number;
  ambientC: number;
  pressureKPa: number;
  /** Distancia de referencia de la lámpara (cm) y radio bajo el que calienta un montaje sin baño. */
  lampRefCm: number;
  lampHotCm: number;
  mediumDicMM: number;
  btbAlkMM: number;
  btbTransition: [number, number];
  btbCalibrated: boolean;
  /** Unidades del dispensador → mmol/L de CO₂ añadido. */
  co2PerUnitMM: number;
  leafMassG: number;
  acetoneMl: number;
  waterMl: number;
  hydrocarbonMl: number;
  grindStrokes: number;
  settleS: number;
  spotDryS: number;
  paperLengthMm: number;
  originMm: number;
  frontKMmPerSqrtS: number;
  frontFadeS: number;
  /** Separación útil mínima para una lectura de Rf (mm desde el origen). */
  minUsefulMm: number;
  rulerUMm: number;
  /** µg de cada pigmento por g de hoja (perfil sintético). */
  pigmentUgPerG: Record<PigmentId, number>;
  rf: Record<PigmentId, number>;
  gasProfile: 'curricular' | 'realistic';
}

export interface Sprig {
  g: number;
  damaged: boolean;
}

export interface GasTube {
  sprig: string | null;
  mL: number;
  label: '' | 'light' | 'dark';
  bubble: boolean;
  stopper01: number;
  contact01: number;
  capConnected: boolean;
  plugCleared: boolean;
  levelDeg: number;
  tempC: number;
  /** Altura real del menisco (mm) respecto de la marca cero. */
  hMm: number;
  dicUmol: number;
  /** Carbono fijado neto en biomasa y O₂ neto por compartimento (µmol). */
  biomassUmol: number;
  o2GasUmol: number;
  o2LeakUmol: number;
  dicInitialUmol: number;
  perturbMm: number;
  baselineId: string | null;
  finalId: string | null;
  opened: boolean;
  stirredAt: number | null;
}

export interface BtbTube {
  sprig: string | null;
  mL: number;
  drops: number;
  dicUmol: number;
  addedUmol: number;
  biomassUmol: number;
  o2Umol: number;
  fillUmol: number;
  baselineId: string | null;
  finalId: string | null;
}

export interface PhotoReading {
  id: string;
  tick: number;
  kind: 'baseline' | 'meniscus' | 'btb' | 'front' | 'band';
  target: string;
  value: number;
  unit: string;
  resolution: number;
  u: number;
  /** s desde el inicio de la corrida o serie (`null` antes de empezar). */
  elapsedS: number | null;
  color?: BtbColor;
  ph?: number | null;
  tempC?: number;
}

export interface Band {
  id: string;
  rf: number;
  centerMm: number;
  widthMm: number;
  color: string;
  /** 0–1: masa relativa del pigmento (o varios) en el papel. */
  intensity: number;
  composite: boolean;
  foreign: boolean;
}

export interface PaperState {
  cut: boolean;
  originMm: number | null;
  originTool: 'pencil' | 'pen' | null;
  spots: number;
  large: boolean;
  wetRespot: boolean;
  lastSpotAt: number | null;
  eluentMm: number;
  eluent: string | null;
  hung: boolean;
  tiltDeg: number;
  chamberClosed: boolean;
  developS: number;
  frontMm: number;
  removedAt: number | null;
  frontMarkMm: number | null;
  frontLost: boolean;
  submerged: boolean;
  offEdge: boolean;
  /** Corrida alterada por cámara abierta o por el escenario (S19). */
  evaporated: boolean;
  bandMarks: Record<string, string>;
}

export interface SolventState {
  open: boolean;
  ml: number;
  initialMl: number;
  usedMl: number;
}

export interface SepTube {
  acetoneMl: number;
  waterMl: number;
  hydroMl: number;
  closed: boolean;
  mix01: number;
  settledAt: number | null;
  aspirated: boolean;
  contaminated: boolean;
}

export interface PhotoControls {
  dicKnown: boolean;
  tempC: number;
  distanceCm: number;
  powerIndex: number;
  lightUnit: 'au' | 'par';
}

export interface PhotoState {
  modules: { gas: boolean; btb: boolean; pig: boolean };
  hypothesis: { recorded: boolean; variable: string };
  sprigs: Record<string, Sprig>;
  rateFactor: number;
  tubes: Record<string, GasTube>;
  covers: Record<string, number>;
  controls: PhotoControls | null;
  runStartedAt: number | null;
  lamps: Record<string, { on: boolean; powerPct: number }>;
  btb: Record<string, BtbTube>;
  seriesStartedAt: number | null;
  co2DispensedUmol: number;
  hood: { on: boolean; sashOk: boolean };
  solvents: Record<string, SolventState>;
  leaf: { weighedG: number | null; transferredG: number; strokes: number };
  sep: SepTube;
  ledger: PigmentLedger;
  ledgerInitial: Record<PigmentId, number>;
  vialReady: boolean;
  vialExposed: boolean;
  paper: PaperState;
  readings: PhotoReading[];
  assetScope: string[];
  /** Recursos que el escenario retiró (I01–I05): sin penalización. */
  radiusCertified: boolean;
  seq: number;
}

export interface PhotoWorld extends DivWorld {
  photo: PhotoState;
}
