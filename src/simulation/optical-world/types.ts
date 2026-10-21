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

export type { Pose, Severity, SimEvent, ObjectiveX, StructureId };

export type B01ObjKind =
  | 'ppeTray' | 'prepBoard' | 'elodeaDish' | 'dropperBottle' | 'slide' | 'fixedSlide' | 'coverslip' | 'coverBox' | 'forceps' | 'scalpel'
  | 'paper' | 'lensPaper' | 'towel' | 'microscope' | 'slideCase' | 'stereo' | 'sampleTray' | 'leafSample' | 'insectSample'
  | 'glassBin' | 'bioWaste' | 'cleanTray';

export interface OpticalObject {
  id: string;
  kind: B01ObjKind;
  pose: Pose;
  /** 'bench', 'hand', 'prep', 'stage', 'case:sNN', 'stereoBase', 'sampleTray', 'cleanTray', 'coverBox', 'glassBin', 'bioWaste', 'fc' (en la pinza), '<slideId>' (cubreobjetos colocado). */
  support: string;
  movable: boolean;
  label?: string;
}

export type PpeItemB01 = 'coat' | 'shoes' | 'hair' | 'hands' | 'gloves';

export interface SafetyStateB01 {
  ppe: Record<PpeItemB01, boolean>;
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
  reagent: 'water' | 'lugol';
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
}
