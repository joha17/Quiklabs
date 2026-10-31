/**
 * Mundo de la práctica B09 «Arquitectura vegetal» (§6.3). REUTILIZA el mundo de B06 (microscopio, estereoscopio, caja de
 * láminas, montajes, marcas y mediciones) y le agrega lo propio: morfología externa de las plántulas, sujeción y corte
 * por plano, calidad de cada sección, reacción de Wiesner virtual, bloqueos de seguridad y fracciones de área. JSON puro.
 */
import type { DivWorld } from '../div-world/types';

export type CutPlane = 'transverse' | 'longitudinal' | 'epidermal';
export type ExternalPart = 'primaryRoot' | 'lateralRoot' | 'fibrousRoot' | 'apicalBud' | 'node' | 'internode' | 'petiole' | 'blade' | 'sheath';
export type PlantSpecimenId = 'bean' | 'maize';

export interface PlantParams {
  /** Grosor objetivo, máximo útil y mínimo manipulable de una sección (µm). Escenario didáctico calibrable (§7). */
  freshSectionTargetUm: number;
  sectionUsableMaxUm: number;
  sectionFragileMinUm: number;
  minSectionIntegrity: number;
  /** Presión del bisturí que aplasta las células (0–1) y fracción de cada corte que se pierde como residuo. */
  crushPressure01: number;
  cutLossFraction: number;
  /** Ventana de contacto del ácido con recurso aprobado (s), derivada de `referenceDyeContactS` = 60 s. */
  wiesnerMinS: number;
  wiesnerMaxS: number;
  /** Volumen de una dosis de reactivo (mL) y límite del lavado antes de arrastrar la sección (mL). */
  reagentDropMl: number;
  rinseMaxMl: number;
  /** Presión sobre el cubreobjetos que deforma la sección sin romper el vidrio (0–1). */
  coverDeformForce01: number;
  /** Incertidumbre de selección manual (px) y relativa de la escala (fracción). */
  measurementPixelUncertainty: number;
  defaultScaleRelativeUncertainty: number;
}

/** Calidad de una sección obtenida (hechos del gesto, nunca un corte perfecto por clic). */
export interface SectionRecord {
  id: string;
  sourceId: string;
  plane: CutPlane;
  /** Plano resultante: sin sujetar, el tejido gira y el corte se desvía. */
  actualPlane: CutPlane | 'oblique';
  region: string;
  regionOk: boolean;
  thicknessUm: number;
  integrity01: number;
  viableAreaFraction: number;
  crushed: boolean;
  held: boolean;
  /** Portaobjetos donde terminó (null: sigue en la tabla o la pinza). */
  slideId: string | null;
  lostMg: number;
}

export interface ExternalLabel {
  specimen: PlantSpecimenId;
  regionId: string;
  part: ExternalPart;
  ok: boolean;
}

export interface AreaRecord {
  id: string;
  observationId: string;
  regionPx2: number;
  totalPx2: number;
  fraction: number;
}

export interface PlantState {
  /** Grados girados por plántula (la evidencia de haberla mirado por todos lados). */
  rotated: Record<string, number>;
  labels: ExternalLabel[];
  /** Fuente sujeta con la pinza durante el corte. */
  holding: string | null;
  sections: SectionRecord[];
  /** Sección aún sin depositar (en la tabla o la pinza). */
  pendingSection: string | null;
  /** Rutas asignadas por el docente. */
  wiesnerAssigned: boolean;
  stereoRequired: boolean;
  requiredSlides: string[];
  /** Lámina cuya etiqueta no coincide con la imagen (S18). */
  mislabeled: string | null;
  /** Primer cubreobjetos forzado a un ángulo malo (S20). */
  coverJam: boolean;
  /** Áreas trazadas sobre capturas propias. */
  areas: AreaRecord[];
  areaSeq: number;
  /** Etiquetas neutras (S23). */
  unknowns: boolean;
  /** Recursos autorizados para el curso (S25). */
  assetScope: string;
  /** Anillos: metadato ambiental (S17: no anuales). */
  ringsAnnualKnown: boolean;
}

export interface PlantWorld extends DivWorld {
  plant: PlantState;
}
