/**
 * Mundo de la práctica B02 «Células bajo la lente» (§6.3). REUTILIZA el mundo óptico de B01 (microscopio,
 * estereoscopio, caja de láminas, montajes, observaciones y balance de líquido) y le agrega el estado celular: fuentes
 * de tejido, fragmentos en las herramientas, hisopos, goteros contaminados, balance por colorante y de biomasa
 * didáctica, y la asignación de recursos (versiones docentes y faltantes). JSON puro y serializable.
 */
import type { OpticalWorld } from '../optical-world/types';
import type { CellFragment, CellKind, CellPrepParams, StainId } from '../specimens/thin-section';

export type { CellFragment, CellKind, StainId };

export interface CellSource {
  kind: CellKind;
  massMg: number;
  initialMg: number;
}

export interface SwabState {
  state: 'box' | 'loaded' | 'used';
  /** Células recogidas (mg didácticos). */
  loadedMg: number;
}

export interface StainLedger {
  initialMl: number;
  wasteMl: number;
  spilledMl: number;
}

export interface CellState {
  /** Muestras asignadas por el docente (las demás están en la mesa pero no corresponden a la actividad). */
  assigned: CellKind[];
  /** Rutas opcionales activadas en la asignación (§13.1: solo puntúan si están activas). */
  routes: { fixed: boolean; stereo: boolean; video: boolean };
  sources: Record<string, CellSource>;
  /** Fragmento cortado que espera sobre la tabla de corte. */
  board: CellFragment | null;
  /** Lo que lleva cada herramienta (`fc` pinza, `sp` espátula). */
  held: Record<string, CellFragment | null>;
  /** Restos de tejido en cada herramienta (contaminación cruzada, CEL10). */
  toolResidue: Record<string, CellKind | null>;
  swabs: Record<string, SwabState>;
  /** Punta de cada gotero contaminada por contacto con tejido (CEL29). */
  dropperTip: Record<string, number>;
  /** Balance por colorante (el agua es el resto del balance total de líquido). */
  stainLedger: Record<Exclude<StainId, 'water'>, StainLedger>;
  /** Colorante derramado en la mesa (pasa a residuos al limpiar). */
  benchStainMl: Partial<Record<StainId, number>>;
  biomass: { initialMg: number; wasteMg: number };
  /** Recurso base → versión docente asignada (S17) y recursos faltantes (S18). */
  assetOverride: Record<string, string>;
  missingAssets: string[];
  /** Incidencias técnicas sin culpa (CEL68): recurso faltante, video no disponible. */
  incidents: string[];
  /** Contador de zonas creadas (identificadores `m:<muestra>:<n>`). */
  zoneSeq: number;
  /** Medios admitidos además de la receta (B03; ausente en B02). */
  extraAllowed?: Partial<Record<CellKind, StainId[]>>;
}

export interface CellWorld extends OpticalWorld {
  cell: CellState;
}

export type { CellPrepParams };
