/**
 * Mundo de la práctica B04 «Detectives moleculares» (§6.3). REUTILIZA el mundo celular de B02 (microscopio, caja de
 * láminas fijas, montajes, observaciones) y le agrega el estado bioquímico: recipientes con su composición molecular
 * (frascos de lotes, beakers de preparación, probetas, pipetas, tubos, residuos), las placas calefactoras con agitador
 * magnético y sus barras, la balanza, el baño María, los lotes P1–P3, el tratamiento de Feulgen de la lámina sin teñir y
 * las lecturas instrumentales. JSON puro y serializable (sin Infinity: las capacidades «sin límite» valen 1e9).
 */
import type { CellWorld } from '../cell-world/types';
import type { AdhKinetics, AssayResponse, EnzymeKinetics, Species } from '../biochem/model';

/** Líquido con su composición molecular (frasco, beaker, probeta, pipeta, tubo, cubeta, residuo o derrame). */
export interface BioVessel {
  volumeMl: number;
  capacityMl: number;
  tK: number;
  s: Species;
  /** Lotes de los que proviene el contenido (cadena `sourceLotId → aliquotId`). */
  tags: string[];
  /** Homogeneidad (0–1): baja al agregar líquido sin mezclar; sube al agitar. */
  homog01: number;
}

/** Reactivo agregado a un tubo (para secuencias y trazabilidad, persiste aunque se vacíe). */
export type ReagentId = 'iodine' | 'naoh' | 'cu' | 'benedict' | 'ethanol' | 'water' | 'h2o2' | 'amylase' | 'nad' | 'adh' | 'methanol';

export interface BioTube {
  label: string | null;
  /** Lotes y recipientes de origen de cada entrega (con `*` si vino de una mezcla incubada). */
  sources: string[];
  capped: boolean;
  /** Primer momento en que recibió cada reactivo (s). */
  reagents: Partial<Record<ReagentId, number>>;
  readAt: number | null;
  discarded: boolean;
  /** Baño donde está y su inmersión (0–1); null fuera de un baño. */
  bath: { id: string; immersion01: number } | null;
  maxTK: number;
  /** Segundos por encima de la temperatura mínima de Benedict y por encima de 363 K. */
  hotDoseS: number;
  boilS: number;
  /** Cronómetro iniciado y contacto enzima–sustrato (s). */
  timerAt: number | null;
  contactAt: number | null;
  /** Colector de gas (catalasa) conectado y su sello. */
  collector: { sealed: boolean; at: number } | null;
  o2CollectedMmol: number;
  o2LostMmol: number;
  /** Espuma (mL equivalentes) y su desacople respecto del O₂ (C06). */
  foamMl: number;
  /** Etanol y agua posterior (emulsión). */
  dilutedAt: number | null;
  /** Primera lectura visual antes de cualquier reactivo (observación inicial). */
  initialRead: string | null;
  /** Último agitado del tubo (s) y si se agitó tras el último reactivo. */
  mixedAt: number | null;
  /** Condición física al iniciar la catálisis o la hidrólisis (fuente, calor, pH), congelada en ese momento. */
  condition: string | null;
  /** Lecturas de gas de este tubo (s desde el inicio de la reacción). */
  gasReadsS: number[];
  /** Enzima en el tubo al iniciar la reacción (U) por mL de líquido, para comparar lotes (D06). */
  enzymePerMl: number | null;
  /** H₂O₂ entregado (mL) y pH medido con tira. */
  h2o2Ml: number;
  phReadAt: number | null;
  /** Volumen evaporado en el baño (mL). */
  evaporatedMl: number;
}

/** Lote preparado en la placa (§5, P1–P3) con su trazabilidad física. */
export interface PrepBatch {
  id: 'P1' | 'P2' | 'P3';
  vesselId: string;
  /** Agua realmente vertida (mL), sólido agregado (g) y masa de hígado (g). */
  waterMl: number;
  solidG: number;
  liverG: number;
  /** Tiempo con barra girando acoplada (s), con calefacción encendida (s) y temperatura máxima/medida del líquido. */
  stirredS: number;
  heatedS: number;
  maxTK: number;
  measuredTK: number | null;
  homog01: number;
  /** Fracción accesible: almidón disperso, catalasa extraída o amilasa disuelta respecto del total agregado. */
  accessible01: number;
  /** Salpicaduras (mL) y deslizamiento de la barra (PREP05). */
  splashMl: number;
  slipS: number;
  labeled: boolean;
  /** Primer trasvase del lote (s). */
  firstAliquotAt: number | null;
}

export interface Hotplate {
  on: boolean;
  setK: number;
  rpm: number;
  plateK: number;
  vesselId: string | null;
}

export interface WaterBath {
  on: boolean;
  setK: number;
  tK: number;
  /** Primer momento en que el baño estuvo a ±2 K de la consigna (s). */
  readyAt: number | null;
}

export interface BioReading {
  id: string;
  tick: number;
  t: number;
  instrument: BioInstrument;
  targetId: string;
  value: number;
  unit: string;
  /** Lectura cualitativa (color, fase, precipitado). */
  quality?: string;
  biased?: boolean;
}

export type BioInstrument = 'balance' | 'thermo' | 'eye' | 'gas' | 'ph' | 'photometer' | 'scale';

export interface BioPipette {
  /** Recipiente del que viene lo cargado y restos de reactivos o muestras en el interior (lotes/reactivos). */
  from: string | null;
  residue: string[];
  /** Se leyó la escala (cero) antes de la primera entrega. */
  zeroChecked: boolean;
}

/** Tratamiento de Feulgen de una lámina sin teñir (s en cada frasco). */
export interface FeulgenSlide {
  fixS: number;
  hydroS: number;
  washAfterHydroS: number;
  schiffS: number;
  /** Frasco actual y desde cuándo. */
  jar: string | null;
  order: string[];
}

export interface BioState {
  vessels: Record<string, BioVessel>;
  tubes: Record<string, BioTube>;
  preps: Record<'P1' | 'P2' | 'P3', PrepBatch | null>;
  plates: Record<string, Hotplate>;
  bars: Record<string, string | null>;
  /** Baños María: `ba1` (estación C, Benedict y pretratamientos) y `ba2` (estación E, incubación de la amilasa). */
  baths: Record<string, WaterBath>;
  balance: { tareG: number; tared: boolean };
  /** Polvos en sus frascos (g) y lo que lleva la espátula. */
  powders: Record<string, number>;
  spatula: { load: Record<string, number>; wet: boolean };
  /** Bote de pesaje: polvo por frasco de origen (g) y agua que arrastró una espátula húmeda (g). */
  boat: { load: Record<string, number>; waterG: number };
  /** Hígado asignado: masa, pesado, tamaño de los trozos y beaker donde está. */
  liver: { massG: number; totalU: number; weighedAt: number | null; pieces: number; sizeCm: number | null; inVessel: string | null };
  pours: Record<string, { targetId: string; tiltDeg: number }>;
  pipettes: Record<string, BioPipette>;
  readings: Record<string, BioReading>;
  readingOrder: string[];
  readingSeq: number;
  feulgen: Record<string, FeulgenSlide>;
  photometer: { blanked: boolean };
  burnerLit: boolean;
  /** Balances fuera de los recipientes: O₂ perdido, agua formada (mmol), agua evaporada (mL). */
  o2LostMmol: number;
  waterFormedMmol: number;
  evaporatedMl: number;
  /** Totales al empezar (conservación, §6.6). */
  initial: Record<string, number>;
  /** Incidencias de recurso (no imputables, §9.2). */
  incidents: string[];
  /** Módulo ADH habilitado y calibrado en la asignación (§5 Etapa I). */
  adhEnabled: boolean;
  /** Lotes visibles: id → rótulo del frasco y clase. */
  lots: Record<string, { bottle: string; kind: 'control-neg' | 'control-pos' | 'sample' | 'unknown' | 'prep' }>;
  /** Dosis de H₂O₂ por tubo verificada (C09) y comprobaciones únicas. */
  checks: string[];
}

export interface BioWorld extends CellWorld {
  bio: BioState;
}

/** Parámetros de la práctica B04 (§7.1): todos de software, `PENDING_CALIBRATION` salvo los aritméticos. */
export interface BioParams {
  ambientK: number;
  pressurePa: number;
  assay: AssayResponse;
  catalase: EnzymeKinetics;
  amylase: EnzymeKinetics;
  adh: AdhKinetics;
  /** Reparto de la hidrólisis: fracción del almidón que pasa a dextrina y de la dextrina que pasa a maltosa por paso. */
  amyDextrinToMaltose: number;
  /** Preparaciones (§7.1): cantidades pedidas y tolerancias. */
  prep: {
    starchG: number; starchWaterMl: number; starchTargetK: number; tolG: number; tolMl: number; tolK: number;
    catalaseWaterMl: number; liverG: number; amylaseG: number; amylaseWaterMl: number; amylaseTolG: number; amylaseTolMl: number;
    /** Dispersión del almidón (s⁻¹ a 1 de agitación), sedimentación sin agitar (s⁻¹), extracción de catalasa, disolución de amilasa. */
    disperseK: number; settleK: number; extractK: number; dissolveK: number;
    /** rpm efectivas y de desacople de la barra (agua y suspensión viscosa), minutos mínimos de mezcla (s). */
    rpmFull: number; slipRpmWater: number; slipRpmViscous: number; minStirS: number; homogReady: number;
    /** Tamaño de fragmento de hígado adecuado (cm). */
    liverMaxCm: number;
    /** Potencia y acoples térmicos de la placa (W, W/K). */
    plateW: number; plateUA: number; plateC: number; liquidUA: number;
  };
  /** Actividades por masa (U/g) de hígado, papa y amilasa comercial. */
  activity: { liverUPerG: number; potatoUPerMl: number; amylaseUPerG: number; adhU: number };
  bath: { powerW: number; heatCapJPerK: number; lossUA: number; tubeUA: number; airUA: number };
  tubeGlassJPerK: number;
  pipetteCapMl: number;
  pipetteFilmMl: number;
  pipetteOffsetMl: number;
  volumetricMl: number;
  dropMl: number;
  pourMaxMlS: number;
  pourMinTiltDeg: number;
  readRes: { balance: number; thermo: number; cylinder: number; ph: number };
  parallaxMlPerDeg: number;
  eyeTolDeg: number;
  /** Tiempos de lectura y cinética (s). */
  benedictMinS: number;
  benedictMaxS: number;
  hotTouchK: number;
  readHotK: number;
  incubationS: number;
  amylaseTempMaxK: number;
  emulsionReadMaxS: number;
  mixReadyS: number;
  catalaseH2O2Ml: number;
  tubeHeadroomMl: number;
  feulgen: { fixMinS: number; hydroMinS: number; hydroMaxS: number; washMinS: number; schiffMinS: number };
  photometerOffset: number;
  epsilonNadh: number;
}
