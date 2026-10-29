/**
 * Mundo de la práctica B06 «Atlas celular comparado» (§6.3). REUTILIZA el mundo celular de B02 (microscopio, caja de
 * láminas fijas, montajes, frotis, gotero y observaciones) y le agrega lo propio de la diversidad celular: protistas
 * vivos con su viabilidad, el aceite de inmersión del módulo 100X y la contaminación de las lentes secas, las marcas de
 * región sobre capturas validadas contra el manifiesto, las mediciones calibradas, la tinción de Wright opcional y los
 * bloqueos de bioseguridad. JSON puro y serializable.
 */
import type { CellWorld } from '../cell-world/types';
import type { StructureId } from '../specimens/assets';

/** Fichas del reto de clasificación (§5, ruta A): siete muestras y la cianobacteria opcional. */
export type DivSpecimen = 'bacillus' | 'euglena' | 'paramecium' | 'elodea' | 'tradescantia' | 'buccal' | 'blood' | 'cyano';
export const DIV_SPECIMENS: DivSpecimen[] = ['bacillus', 'euglena', 'paramecium', 'elodea', 'tradescantia', 'buccal', 'blood'];
/** Respuesta correcta de cada ficha (permanente: bacterias y sangre; el resto, montaje fresco). */
export const FIXED_SPECIMENS: DivSpecimen[] = ['bacillus', 'blood', 'cyano'];

/** Lo que el estudiante puede rotular: estructuras anotables y las que NUNCA se validan (nucléolo bacteriano, subtipos). */
export type MarkStructure = StructureId | 'nucleolus' | 'eosinophil' | 'basophil' | 'monocyte';

export interface DivParams {
  /** Volumen de una gota de aceite (mL), mínimo útil bajo el 100X y exceso que escurre (§7). */
  oilDropMl: number;
  oilMinMl: number;
  oilMaxMl: number;
  /** Imagen capturada: píxeles a lo ancho del campo (la escala µm/px sale del campo visual calibrado). */
  imagePx: number;
  /** Incertidumbre relativa de la escala (sin y con micrómetro trazable) e incertidumbre de marcado (px). */
  scaleRelU: number;
  scaleRelUTraceable: number;
  pointUPx: number;
  /** Modelo PREDICTIVO de motilidad (sin video): velocidad de referencia (µm/s), viscosidad por fracción de metilcelulosa. */
  speedUmS: { euglena: number; paramecium: number };
  mcViscosityK: number;
  mcMaxFraction: number;
  /** Exposición de la captura (s) y desenfoque de movimiento tolerado (fracción del campo). */
  exposureS: number;
  blurFovFraction: number;
  /** Viabilidad: pérdida por secado, por nigrosina, por calor de la lámpara y umbral de inmovilidad (1/s, s, 0–1). */
  dryLossPerS: number;
  nigrosinLossPerS: number;
  lampHotLight01: number;
  lampHotS: number;
  lampLossPerS: number;
  immobileBelow: number;
  /** Lugol: contacto que inmoviliza (s). */
  lugolKillS: number;
  /** Desplazamiento del cubreobjetos que arrastra la muestra viva (cm). */
  coverDragCm: number;
  /** Wright: contacto mínimo del colorante y del tampón (s). */
  wrightMinS: number;
  bufferMinS: number;
  /** Volumen de una gota de Wright, tampón o agua de enjuague sobre la lámina (mL). */
  stainDropMl: number;
}

/** Protista vivo sobre un portaobjetos. */
export interface LiveSample {
  kind: 'euglena' | 'paramecium';
  viability01: number;
  /** Cuándo recibió Lugol o nigrosina (s); null si no. */
  lugolAt: number | null;
  nigrosinAt: number | null;
  /** Segundos de lámpara intensa sobre la preparación. */
  heatS: number;
  /** Registro cualitativo de movilidad (modelo predictivo; la velocidad exige video). */
  motility: 'moving' | 'immobile' | null;
  motilityAt: number | null;
  /** El cubreobjetos se arrastró sobre la muestra (CEL-022). */
  dragged: boolean;
}

/** Marca de región sobre una captura propia, con el veredicto del manifiesto. */
export interface RegionMark {
  id: string;
  observationId: string;
  structure: MarkStructure;
  /** Punto marcado en la captura (0–1 a lo ancho y alto del campo). */
  u: number;
  v: number;
  verdict: 'valid' | 'not-visible' | 'bubble' | 'outside' | 'wrong' | 'never';
  /** Estructura anotada bajo el punto (si hay). */
  hit: StructureId | null;
  assetId: string;
  objectiveX: number;
}

/** Medición sobre una captura calibrada (§12.2): L = p·s; u = √((p·u_s)² + (s·u_p)²). */
export interface Measurement {
  id: string;
  observationId: string;
  assetId: string;
  objectiveX: number;
  rawPixelDistance: number;
  umPerPx: number;
  lengthUm: number;
  uncertaintyUm: number;
  calibrationHash: string;
  /** Extremos del segmento en px de la captura (0–`imagePx`). */
  seg?: [number, number, number, number];
}

export interface WrightState {
  wrightAt: number | null;
  bufferAt: number | null;
  rinsedAt: number | null;
  wrightMl: number;
  bufferMl: number;
}

export interface DivLedger {
  initialMl: number;
  wasteMl: number;
  spilledMl: number;
}

export interface DivState {
  classification: Partial<Record<DivSpecimen, 'fresh' | 'fixed'>>;
  /** Módulo de inmersión instalado (revólver de cuatro objetivos con 100X, §3.2). */
  immersion: boolean;
  /** Frascos propios de B06 (mL): aceite, Wright y tampón. */
  bottles: { oil: number; wri: number; buf: number };
  ledger: { oil: DivLedger; wri: DivLedger; buf: DivLedger };
  /** Aceite sobre cada lámina (mL) y lentes secas contaminadas (objetivo → 1). */
  oil: Record<string, number>;
  lensOil: Record<string, number>;
  live: Record<string, LiveSample>;
  /** Etiqueta escrita en cada portaobjetos fresco. */
  labels: Record<string, string>;
  marks: RegionMark[];
  measurements: Measurement[];
  seq: number;
  /** Portaobjetos y láminas permanentes rotos (no montables). */
  brokenSlides: string[];
  brokenFixed: string[];
  /** Líquido derramado sobre el microscopio (bloqueo eléctrico hasta secarlo). */
  micWet: boolean;
  /** Bisturí llevado en la mano al cambiar de estación (riesgo persistente). */
  sharpCarried: boolean;
  station: string;
  wright: Record<string, WrightState>;
  /** Escala certificada disponible y si es un micrómetro trazable (SC-METROLOGY). */
  scale: { available: boolean; traceable: boolean };
  /** Metadatos de cada captura propia: burbujas (normalizadas en el activo) y si la muestra estaba viva. */
  obsMeta: Record<string, { bubbles: [number, number, number][]; live: boolean; oil: boolean }>;
}

export interface DivWorld extends CellWorld {
  div: DivState;
}
