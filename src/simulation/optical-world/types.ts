/**
 * Mundo de la práctica de microscopía y estereoscopía (B01, §6.3). Datos puros y JSON serializables (sin clases,
 * funciones ni fotografías): el montaje húmedo, el microscopio, el estereoscopio, la caja de láminas, las
 * observaciones registradas y el balance de líquido. Las imágenes viven fuera del dominio; aquí solo su id, versión y
 * hash de manifiesto (asignación congelada en el intento).
 */
import type { Pose, Severity, SimEvent } from '../entities/types';
import type { MicroscopeParams, MicroscopeState, ObjectiveX } from '../instruments/optical/microscope-types';
import type { StereoParams, StereoState } from '../instruments/optical/stereo-types';
import type { SlideCaseState } from '../instruments/optical/slide-carrier';
import type { FreshMount, MountParams } from '../specimens/mount-world';
import type { FluidLedger } from '../specimens/volumes';
import type { StructureId } from '../specimens/assets';
import type { CellPrepParams } from '../specimens/thin-section';
import type { CellState } from '../cell-world/types';
import type { PermParams } from '../perm-world/types';
import type { BioParams } from '../bio-world/types';
import type { EnzParams } from '../enz-world/types';
import type { DivParams } from '../div-world/types';

export type { Pose, Severity, SimEvent, ObjectiveX, StructureId };

export type B01ObjKind =
  | 'ppeTray' | 'prepBoard' | 'elodeaDish' | 'dropperBottle' | 'slide' | 'fixedSlide' | 'coverslip' | 'coverBox' | 'forceps' | 'scalpel'
  | 'paper' | 'lensPaper' | 'towel' | 'microscope' | 'slideCase' | 'stereo' | 'sampleTray' | 'leafSample' | 'insectSample'
  | 'glassBin' | 'bioWaste' | 'cleanTray'
  // B02: fuentes de tejido, tabla de corte, espátula, hisopos, fuente virtual de epitelio y residuos comunes.
  | 'tissueSource' | 'cuttingBoard' | 'spatula' | 'swabBox' | 'swab' | 'cheekSource' | 'trashBin'
  // B03: membranas, cámaras de dos compartimentos, frascos, probetas, pipeta, gradilla, tubos e instrumentos.
  | 'membraneTray' | 'membrane' | 'soakDish' | 'twoChamber' | 'reagentBottle' | 'gradCylinder' | 'pipette' | 'beaker' | 'tubeRack' | 'testTube'
  | 'thermometer' | 'colorimeter' | 'chemWaste'
  // B04: frascos de lotes, cristalería, placas con agitador, balanza, baños, colector de gas, fotómetro y frascos de Feulgen.
  | 'bioBottle' | 'bioCylinder' | 'bioPipette' | 'bioDropper' | 'bioRack' | 'bioTube' | 'bioBeaker' | 'hotplate' | 'stirBar' | 'balance' | 'weighBoat'
  | 'powderJar' | 'liverSample' | 'waterBath' | 'tongs' | 'bioThermo' | 'phStrips' | 'photometer' | 'cuvette' | 'stainJar' | 'burner' | 'rinseBeaker'
  // B05: estaciones de cinética enzimática (preparaciones, catalasa con colector, amilasa, baños y ADH).
  | 'enzBottle' | 'enzBeaker' | 'enzCylinder' | 'enzPipette' | 'enzDropper' | 'enzRack' | 'enzTube' | 'enzPlate' | 'enzStirBar' | 'enzBalance'
  | 'enzBoat' | 'enzJar' | 'enzSpatula' | 'enzLiver' | 'enzBoard' | 'enzKnife' | 'enzBath' | 'enzTongs' | 'enzThermo' | 'enzStrips' | 'enzCollector'
  | 'enzClock' | 'enzPhotometer' | 'enzCuvette' | 'enzBurner' | 'enzWaste' | 'enzRinse'
  // B06: epidermis de Tradescantia, aceite de inmersión, pañuelo, zona sin desinfectar, cultivo cerrado y lanceta bloqueada.
  | 'plantPot' | 'oilBottle' | 'tissue' | 'dirtyZone' | 'culturePlate' | 'lancetBox' | 'wrightBottle' | 'sampleCards';

export interface OpticalObject {
  id: string;
  kind: B01ObjKind;
  pose: Pose;
  /** 'bench', 'hand', 'prep', 'stage', 'case:sNN', 'stereoBase', 'sampleTray', 'cleanTray', 'coverBox', 'glassBin', 'bioWaste', 'fc' (en la pinza), '<slideId>' (cubreobjetos colocado). */
  support: string;
  movable: boolean;
  label?: string;
}

/** EPP de las prácticas ópticas; las gafas solo las exige B04 (reactivos cáusticos y yodo). */
export type PpeItemB01 = 'coat' | 'shoes' | 'hair' | 'hands' | 'gloves' | 'goggles';

export interface SafetyStateB01 {
  /** Las gafas faltan en los mundos de B01–B03 (no se exigen allí; un mundo nuevo de B04 las agrega). */
  ppe: Record<Exclude<PpeItemB01, 'goggles'>, boolean> & { goggles?: boolean };
  block: { code: string; since: number } | null;
  /** Accidente consumado (choque, vidrio roto): anula el componente de seguridad. */
  incident: { code: string; since: number } | null;
  stoppedByTeacher: boolean;
}

export interface SlideInfo {
  kind: 'blank' | 'fixed';
  /** Residuo sobre el vidrio (0–1, S01). */
  dirty01: number;
  faceDown: boolean;
  assetId?: string;
  label?: string;
}

export interface CoverInfo {
  state: 'box' | 'held' | 'placed' | 'broken';
  tiltDeg: number;
  onSlide: string | null;
}

export interface ForcepsState {
  holding: null | { kind: 'specimen'; assetId: string; sourceId: string; fragmentCm: number } | { kind: 'cover'; coverId: string } | { kind: 'sample'; sampleId: string };
  dirty01: number;
  /** Muestra de la que viene el residuo de la punta. */
  residueFrom: string | null;
}

export interface DispenserState {
  ml: number;
  reagent: 'water' | 'lugol' | 'methylene-blue' | 'eosin-1pct' | 'nacl-0.9' | 'nacl-5' | 'methylcellulose' | 'nigrosin';
}

export interface StereoSample {
  assetId: string;
  damage01: number;
}

export interface LabObservation {
  id: string;
  tick: number;
  t: number;
  instrument: 'compound' | 'stereo';
  /** Espécimen observado (montaje fresco), lámina fija o muestra del estereoscopio. */
  specimenId: string;
  slideId?: string;
  assetId: string;
  assetVersion: number;
  assetHash: string;
  viewId: string;
  objectiveX?: ObjectiveX;
  ocularX: number;
  zoomX?: number;
  magnification: number;
  fovMm: number;
  /** [cx, cy, ancho, alto] normalizados en la imagen del activo. */
  normalizedViewport: [number, number, number, number];
  focusErrorMm: number;
  sharpness01: number;
  light01: number;
  contrast01: number;
  issues: string[];
  visibleRegionIds: StructureId[];
  captureHash: string;
  isObservationValid: boolean;
  channel: 'mono' | 'stereo-pair';
}

/**
 * Gesto continuo en curso sobre una pieza (entre `gesture begin` y `end`). Guarda lo necesario para juzgar el gesto
 * completo: vueltas de macro a 40X, vista de partida de la platina y ajustes binoculares hechos con la imagen borrosa.
 */
export interface GestureB01 {
  part: string;
  coarse40Turns: number;
  stageStart: { centerMm: [number, number]; fovMm: number; visible: StructureId[]; assetId: string | null; locked: boolean } | null;
  binocularMm: number;
  diopterSum: number;
}

export interface B01Params {
  dtS: number;
  microscope: MicroscopeParams;
  stereo: StereoParams;
  mount: MountParams;
  slideThicknessMm: number;
  coverThicknessMm: number;
  /** Profundidad del tejido bajo la cara superior de la preparación (mm). */
  specimenDepthMm: number;
  fixedAboveMm: number;
  /** Tiempo mínimo de observación estable antes de registrar (s) `propuesta`. */
  observationHoldS: number;
  /** Desalineación máxima de la lámina en su asiento (mm). */
  seatTolMm: number;
  /** Elodea: tamaño de hoja normal y grande (S02, cm). */
  leafCm: number;
  bigLeafCm: number;
  dropperInitialMl: number;
  /** Aumentos distintos (incluido 4X) que deben registrarse del montaje fresco. */
  requiredMagnifications: number;
  caseSlots: number;
  /** Tiempo con la caja abierta a partir del cual manipular el equipo es inseguro (s). */
  caseOpenRiskS: number;
  /**
   * Catálogo de errores de otra práctica que reutiliza este mundo (B02): código de B01 → código propio; `''` lo
   * suprime (el hecho no es un error en esa práctica). Sin mapa, los códigos son los de B01.
   */
  codeMap?: Record<string, string>;
  /** EPP exigido para empezar (por omisión bata, calzado, cabello y manos; B03 agrega guantes por los reactivos). */
  ppeRequired?: PpeItemB01[];
  /** Parámetros de corte, raspado, frotis y tinción (B02). */
  cellPrep?: CellPrepParams;
  /** Membranas, cámaras, ensayos y respuesta de Elodea (B03). */
  perm?: PermParams;
  /** Lotes, preparaciones, ensayos de biomoléculas y enzimas (B04). */
  bio?: BioParams;
  /** Preparaciones, catalasa, amilasa, baños y ADH (B05). */
  enz?: EnzParams;
  /** Protistas vivos, aceite de inmersión, morfometría y tinción de Wright (B06). */
  div?: DivParams;
}

export interface OpticalWorld {
  schemaVersion: number;
  timeS: number;
  tick: number;
  seed: number;
  rng: number;
  params: B01Params;
  mode: string;
  scientificMode: 'curricular' | 'calibrated';
  /** Asignación congelada del intento (activos versionados). */
  assignment: { courseId: string; freshAsset: string; fixedSlideIds: string[]; stereoSampleIds: string[]; assetHashes: Record<string, string>; assignmentHash: string };
  objects: Record<string, OpticalObject>;
  slides: Record<string, SlideInfo>;
  mounts: Record<string, FreshMount>;
  covers: Record<string, CoverInfo>;
  forceps: ForcepsState;
  dispensers: Record<string, DispenserState>;
  dish: { leaves: number; leafCm: number; cutRequired: boolean };
  stereoSamples: Record<string, StereoSample>;
  microscope: MicroscopeState & { slideOnStage: string | null; slideOffsetMm: [number, number] };
  /** `headMovedAt`/`focusedAt`: número de orden del último gesto (no tiempo). */
  stereo: StereoState & { sampleOffsetMm: [number, number]; headMovedAt: number | null; focusedAt: number | null; locatedLowZoom: boolean };
  slideCase: SlideCaseState & { openedAt: number | null };
  /** Gesto continuo en curso (ausente en los mundos guardados antes de los gestos directos). */
  gesture?: GestureB01 | null;
  /** Ocular abierto y desde cuándo la configuración está estable (s). */
  view: { instrument: 'compound' | 'stereo' | null; openedAt: number; stableSince: number; capturedSinceOpen: boolean };
  observations: Record<string, LabObservation>;
  observationOrder: string[];
  fluids: FluidLedger;
  material: { initialCounts: Record<string, number>; brokenCounts: Record<string, number> };
  /** Fragmentos de vidrio pendientes de llevar al contenedor. */
  shards: number;
  benchSpillMl: number;
  safety: SafetyStateB01;
  events: SimEvent[];
  evidence: Record<string, number>;
  scenarios: string[];
  ppe: boolean;
  /** Estado celular de B02 (fuentes, herramientas, hisopos, balances por colorante); ausente en B01. */
  cell?: CellState;
}
