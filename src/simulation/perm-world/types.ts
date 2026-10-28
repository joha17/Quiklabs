/**
 * Mundo de la práctica B03 «Fronteras celulares» (§6.3). REUTILIZA el mundo celular de B02 (microscopio, montajes
 * húmedos, Elodea, balances por medio) y le agrega el estado de transporte: piezas de membrana, cámaras de dos
 * compartimentos, recipientes con su composición (frascos, probetas, pipeta, tubos, residuos), lecturas de
 * instrumentos y el estado hídrico de cada célula de Elodea. JSON puro y serializable.
 */
import type { Amounts } from '../membrane-transport/model';
import type { CellWorld } from '../cell-world/types';

export type MembraneMaterial = 'dialysis' | 'dialysisWide' | 'cellophane' | 'film';
export type Side = 'A' | 'B';

/** Líquido con su composición: cualquier recipiente, un compartimento, el derrame o el residuo. */
export interface Vessel {
  volumeMl: number;
  capacityMl: number;
  amounts: Amounts;
  /** Reactivo de Biuret (mL) y nitrato de plata (mmol) disueltos; AgCl precipitado (mmol, sólido en suspensión). */
  biuretMl: number;
  silverMmol: number;
  pptMmol: number;
  /** Frascos de los que proviene el contenido (procedencia: jarabe asignado, «light», concentrado…). */
  tags: string[];
}

export interface MembranePiece {
  material: MembraneMaterial;
  intact: boolean;
  /** Humectación (0–1): una membrana de diálisis seca es poco permeable al principio (PERM04). */
  wet01: number;
  inSoak: boolean;
  installedIn: string | null;
  /** Fracción del área de paso que queda útil (centrado del gesto, borde contaminado). */
  areaFactor: number;
  /** Borde con proteína: sello irregular (PERM06). */
  edgeContaminated: boolean;
  /** Solutos que quedaron impregnados de un ensayo anterior (PERM10). */
  carry: Amounts;
  usedIn: string[];
  /** Rota de fábrica (PERM09) o por apriete (PERM03). */
  tornBy: 'factory' | 'clamp' | null;
}

export interface TwoChamber {
  membraneId: string | null;
  /** Apriete de la abrazadera (vueltas, 0 = abierta). */
  clampTurns: number;
  sides: Record<Side, Vessel>;
  /** Agitación de cada lado (0–1). */
  mixing: Record<Side, number>;
  lidClosed: boolean;
  /** Mezcla de un lado al otro por encima del tabique (PERM15, PERM25). */
  crossContaminated: boolean;
  /** Volumen perdido por la junta (fuga hacia afuera, mL acumulados) y transferido de lado a lado por fuga. */
  leakOutMl: number;
  leakCrossMl: number;
  /** Primer contacto de trazador / carga del ensayo (s). */
  tracerAt: number | null;
  tracerSide: Side | null;
  tracerMl: number;
  loadedAt: number | null;
  /** Lecturas que abren y cierran la observación (ósmosis). */
  startReadAt: number | null;
  /** Lado donde se puso el jarabe (ósmosis). */
  syrupSide: Side | null;
  /** Junta del marco con proteína (líquido proteico cargado sin sellar): el borde de la membrana queda irregular. */
  gasketProtein: boolean;
  /** Última lectura de escala de esta cámara (s). */
  lastScaleAt: number | null;
  /** Tiempo con la tapa abierta durante la observación (s). */
  lidOpenS: number;
}

export interface AssayTube {
  label: string | null;
  /** Compartimentos y frascos de los que vino el contenido (trazabilidad). */
  sources: string[];
  reagentAt: number | null;
  readAt: number | null;
  discarded: boolean;
  /** Reactivos que recibió y si tenía muestra (persisten tras desecharlo: trazabilidad del ensayo). */
  gotBiuret: boolean;
  gotSilver: boolean;
  sampleMl: number;
}

export interface InstrumentReading {
  id: string;
  tick: number;
  t: number;
  instrument: 'scale' | 'eye' | 'colorimeter' | 'thermo';
  targetId: string;
  value: number;
  unit: string;
  /** Lectura cualitativa (color, turbidez, señal de Biuret). */
  quality?: string;
  /** Lectura con error de paralaje o sensor sin cero (la cifra registrada es la que se vio). */
  biased?: boolean;
}

export interface ElodeaCell {
  /** Volumen relativo del protoplasto (1 = turgente). */
  v: number;
  extOsm: number;
  exposureS: number;
  dried: boolean;
}

export interface PermState {
  membranes: Record<string, MembranePiece>;
  cells: Record<string, TwoChamber>;
  vessels: Record<string, Vessel>;
  tubes: Record<string, AssayTube>;
  /** Vertidos en curso (fuente → destino e inclinación). */
  pours: Record<string, { targetId: string; tiltDeg: number }>;
  /** Pipeta: de dónde viene lo que tiene y si su interior quedó con restos de otro lado (PERM27). */
  pipette: { from: string | null; residueFrom: string | null };
  readings: Record<string, InstrumentReading>;
  readingOrder: string[];
  colorimeterZeroed: boolean;
  /** Elodea en la pinza desde (s) y estado hídrico por zona. */
  leafOutSince: number | null;
  elodea: Record<string, ElodeaCell>;
  /** Balance de cada recipiente al empezar (volumen y solutos). */
  initial: { volumeMl: number; amounts: Amounts; silverMmol: number; biuretMl: number };
  evaporatedMl: number;
  /** Membrana asignada por el docente, trazador asignado y frasco de jarabe asignado. */
  assigned: { membrane: MembraneMaterial; tracerBottle: string; syrupBottle: string };
  incidents: string[];
  readingSeq: number;
  /** Prueba de fugas: primera lectura con agua sola por cámara y cámaras que la superaron. */
  leakTestStart: Record<string, { t: number; leakMl: number }>;
  leakTestPassed: string[];
  /** Curva de calibración del colorímetro disponible (SC-06) y jarabe con osmolalidad validada (SC-08). */
  curve: boolean;
  syrupValidated: boolean;
  /** Medio y estado celular congelados en cada captura de Elodea (observationId → condición). */
  elodeaCaptures: Record<string, { medium: string; state: string; v: number; slideId: string }>;
  /** Dosis de trazador ya verificada (PERM12/13 se evalúan una vez, en la primera lectura). */
  tracerChecked: boolean;
  dialysisChecked: boolean;
  /** Concentración del frasco de NaCl de la diálisis (mmol/mL) para comparar la dosis cargada. */
  saltMmolMl: number;
}

export interface PermWorld extends CellWorld {
  perm: PermState;
}

/** Propiedades de un material de membrana (curriculares, `pending`): permeabilidad por soluto (cm/s) y Lp. */
export interface MembraneSpec {
  validated: boolean;
  p: Amounts;
  /** Conductividad hidráulica Lp (mL·s⁻¹·cm⁻²·kPa⁻¹). */
  lp: number;
  needsPreWet: boolean;
  /** Vueltas de abrazadera a partir de las que la película se rasga. */
  tearTurns: number;
}

export interface CellGeom {
  windowCm2: number;
  capacityMl: number;
  /** Sección de la columna graduada de cada lado (cm²): la altura sale del volumen. */
  columnCm2A: number;
  columnCm2B: number;
}

/** Parámetros de la práctica B03 (§7.1): valores de software `pending`, no medidas de un material real. */
export interface PermParams {
  temperatureK: number;
  materials: Record<MembraneMaterial, MembraneSpec>;
  /** Membrana rota: paso convectivo de todo (cm/s) y Lp. */
  tornP: number;
  tornLp: number;
  /** Vueltas mínimas para sellar y fuga máxima con la abrazadera abierta (mL/s). */
  sealTurns: number;
  leakMaxMlS: number;
  dripFraction: number;
  centerTolCm: number;
  cells: Record<string, CellGeom>;
  /** Humectación por segundo en agua y mínima para instalar sin PERM04. */
  wetPerS: number;
  wetMin: number;
  pourMaxMlS: { bottle: number; cylinder: number; cell: number };
  pourMinTiltDeg: number;
  dropMl: number;
  pipetteCapMl: number;
  pipetteFilmMl: number;
  readRes: { cylinder: number; column: number; thermo: number };
  parallaxMlPerDeg: number;
  eyeTolDeg: number;
  tracer: { nominalMl: number; levels: number[]; epsilon: number; pathCm: number; t0WindowS: number };
  assay: { biuretDelayS: number; biuretMinMgMl: number; aggVisibleMmol: number; aliquotMinMl: number; aliquotMaxMl: number };
  osmosis: { syrupNominalMl: number; waterNominalMl: number; incubationS: number; tolMl: number };
  dialysis: { eggNominalMl: number; saltNominalMl: number; minProteinMg: number; tolFrac: number; incubationS: number };
  leakTestS: number;
  evapMlS: number;
  lidOpenMaxS: number;
  elodea: { innerOsm: number; nonOsmotic: number; tauS: number; incipientBelow: number; plasmolyzedBelow: number; leafOutMaxS: number };
  slosh: { mix: number; fill: number };
  /** Osmolaridad por mL de cada frasco de NaCl de los goteros (Osm/L) para el medio de Elodea. */
  salineOsm: Record<string, number>;
}
