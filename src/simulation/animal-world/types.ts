/**
 * Mundo de la práctica B10 «Tejidos animales y anatomía comparada» (§6). REUTILIZA el de B06 (microscopio, estereoscopio, caja,
 * montajes, marcas y mediciones) y le agrega lo propio: clasificación inicial, modelos 3D con orientación y rótulos, tipos
 * funcionales de aves, cráneos y huellas con luz rasante. JSON puro.
 */
import type { DivWorld } from '../div-world/types';
import type { AnatomyPart, BeakType, FootType, SkullDiet, TrackSupport } from './catalog';

export type MaterialClass = 'slide' | 'specimen' | 'model' | 'track';
export type MaterialInstrument = 'microscope' | 'stereo' | 'viewer';
export type B10Module = 'histology' | 'muscle' | 'invertebrates' | 'small' | 'zoology' | 'birds' | 'skulls' | 'teeth' | 'tracks';

export interface AnimalParams {
  /** Orientación útil: giro acumulado (°) para acreditar que un modelo se miró por todos lados. */
  rotateEvidenceDeg: number;
  /** Rótulos errados seguidos en un modelo a partir de los cuales el intento es tanteo (TA-TRIAL). */
  trialErrorLimit: number;
  /** Ángulos de luz distintos (°) que acreditan haber mirado el relieve de una huella. */
  lightSweepDeg: number;
  /** Fracción mínima de materiales bien clasificados en la etapa 1 (§5). */
  classifyMin: number;
}

export interface ModelView {
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
  /** Grados girados en total. */
  rotatedDeg: number;
  opened: boolean;
}

export interface RegionLabel {
  modelId: string;
  regionId: string;
  part: AnatomyPart;
  ok: boolean;
  /** La región no miraba a la cámara cuando se rotuló. */
  hidden: boolean;
  /** Con los nombres de estudio a la vista: no acredita identificación. */
  studyLabels: boolean;
}

export interface TrackLight {
  azimuthDeg: number;
  elevationDeg: number;
  minAz: number;
  maxAz: number;
}

export interface MaterialCard {
  materialClass: MaterialClass;
  instrument: MaterialInstrument;
  classOk: boolean;
  instrumentOk: boolean;
}

export interface BirdAnswer { beak: BeakType | null; foot: FootType | null; beakOk: boolean | null; footOk: boolean | null }
export interface SkullAnswer { taxon: string; diet: SkullDiet | ''; ok: boolean }
export interface TrackAnswer { digits: number; support: TrackSupport; claws: boolean; digitsOk: boolean; supportOk: boolean; clawsOk: boolean; sawRelief: boolean }

export interface AnimalState {
  modules: B10Module[];
  requiredSlides: string[];
  requiredModels: string[];
  requiredTracks: string[];
  stereoRequired: string[];
  /** Montaje fresco activo (S29). */
  freshMount: boolean;
  /** Etiquetas neutras en la caja y el visor (evaluación). */
  neutralNames: boolean;
  /** Los nombres de estudio se pueden mostrar (nunca en Evaluación). */
  studyAllowed: boolean;
  /** Videos asignados que no llegaron (S31) y activos en falla (S33). */
  videoAssigned: boolean;
  faultyModel: string | null;
  assetScope: string;
  /** Modelo y comparación abiertos en el visor. */
  openModel: string | null;
  compareWith: string | null;
  showStudyLabels: boolean;
  views: Record<string, ModelView>;
  labels: RegionLabel[];
  /** Errores seguidos por modelo (se reinicia con cada acierto). */
  wrongStreak: Record<string, number>;
  lights: Record<string, TrackLight>;
  cards: Record<string, MaterialCard>;
  /** Organismo que el estudiante cree ver en cada modelo. */
  identified: Record<string, { guess: string; ok: boolean }>;
  birds: Record<string, BirdAnswer>;
  skulls: Record<string, SkullAnswer>;
  tracks: Record<string, TrackAnswer>;
  labelsRead: string[];
  compared: string[];
  reportedAssets: string[];
}

export interface AnimalWorld extends DivWorld {
  animal: AnimalState;
}
