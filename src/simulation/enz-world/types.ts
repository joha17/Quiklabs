/**
 * Mundo de la práctica B05 «Cinética en acción» (§6.3). REUTILIZA el mundo celular de B02 (microscopio, montaje húmedo
 * de papa con Lugol, observaciones) y le agrega el estado enzimático: recipientes con su composición (frascos, beakers de
 * los lotes P1–P3, probetas, pipetas, goteros, tubos, cubetas, residuos), placas con agitador, balanza, polvos, hígado,
 * baños María, colector de gas, cronómetros, tiras de pH, fotómetro UV y lecturas. JSON puro y serializable (sin
 * Infinity: las capacidades «sin límite» valen 1e9).
 */
import type { CellWorld } from '../cell-world/types';

/**
 * Especies extensivas de un líquido (se reparten proporcionalmente al trasvasar). Cantidades en mmol salvo que se
 * indique; el almidón y sus productos en equivalentes glucosilo; las enzimas en U de software (1 U = 1e-3 mmol/s a
 * saturación); el tejido en mg.
 */
export const SPECIES_B05 = [
  'h2o2', 'o2',
  'starch', 'starchSolid', 'dextrin', 'sugar', 'redUsed',
  'iodine', 'cu', 'cu2o', 'acid', 'buf', 'pigment',
  'catAct', 'catDen', 'catTissue', 'catTissueDen', 'tissueMg',
  'amyAct', 'amyDen', 'amySolid',
  'adhAct', 'adhDen', 'nad', 'nadh', 'ethanol', 'acetaldehyde', 'methanol', 'formaldehyde',
] as const;
export type SpeciesB05 = (typeof SPECIES_B05)[number];
export type Species = Record<SpeciesB05, number>;

/** Líquido con su composición: frasco, beaker, probeta, pipeta, gotero, tubo, cubeta, residuo o derrame. */
export interface EnzVessel {
  volumeMl: number;
  capacityMl: number;
  tK: number;
  s: Species;
  /** Frascos y lotes de los que proviene el contenido (cadena `sourceLotId → aliquotId`). */
  tags: string[];
  /** Homogeneidad del sólido en suspensión (0–1): baja al sedimentar, sube al agitar. */
  homog01: number;
  /** Mezcla del ácido/base agregado (0–1): baja con cada gota, sube al agitar (T09). */
  mixed01: number;
}

export interface EnzTube {
  label: string | null;
  /** Recipientes de origen de cada entrega (con `@<s>` si vino de una incubación, con su tiempo desde el contacto). */
  sources: string[];
  /** Gotas de cada reactivo (Lugol, Benedict, HCl, NaOH, agua) y si recibió H₂O₂ / NAD⁺. */
  drops: { lugol: number; benedict: number; acid: number; base: number; water: number };
  h2o2Adds: number;
  /** Inicio de la catálisis (H₂O₂ con catalasa) y contacto amilasa–almidón (s). */
  reactionAt: number | null;
  contactAt: number | null;
  /** Equivalentes glucosilo del tubo al contacto amilasa–almidón (referencia del cálculo NB07). */
  glyAtContact: number | null;
  /** Catalasa total y tejido al iniciar la reacción (comparación con la línea base, C01). */
  catAtStart: number | null;
  tissueAtStartMg: number | null;
  /** Alícuota de una incubación: tubo de origen, tiempo real desde el contacto y lectura del cronómetro 2. */
  aliquotOf: string | null;
  sampledAfterS: number | null;
  sampledClockS: number | null;
  aliquotMl: number;
  stoppered: boolean;
  /** Baño donde está y su inmersión (0–1). */
  bath: { id: string; depth01: number } | null;
  /** Segundos por encima de la temperatura de Benedict y de ebullición; T máxima; s con enzima sobre 323 K. */
  hotDoseS: number;
  boilS: number;
  maxTK: number;
  harmS: number;
  /** Fuerzas de agitación durante la reacción (C09). */
  shakes: number[];
  /** Espuma (mL): aspecto secundario, NO medida de O₂ (C08, BIO5-10). */
  foamMl: number;
  readAt: number | null;
  discarded: boolean;
  /** Película del contenido anterior (vaciado sin enjuagar, M10). */
  film: boolean;
  /** Temperatura media durante la reacción (suma y muestras) para comparar condiciones (T10). */
  tSum: number;
  tN: number;
}

export interface PrepBatch {
  id: 'P1' | 'P2' | 'P3';
  vesselId: string;
  /** Agua realmente vertida (mL), sólido agregado (g) y masa de hígado (g). */
  waterMl: number;
  solidG: number;
  liverG: number;
  /** Tiempo con barra girando acoplada, con calefacción encendida; T máxima del líquido y última medida (K). */
  stirredS: number;
  heatedS: number;
  maxTK: number;
  measuredTK: number | null;
  slipS: number;
  splashMl: number;
  labeled: boolean;
  firstAliquotAt: number | null;
  /** Tamaño de los fragmentos de hígado agregados (cm, P2). */
  sizeCm: number | null;
  /** Espátula con restos de otro polvo al cargar (PREP09). */
  contaminated: boolean;
}

export interface Hotplate {
  heatOn: boolean;
  setK: number;
  rpm: number;
}

export interface WaterBath {
  on: boolean;
  /** Consigna del dial (K); el agua tiende a consigna + error del sensor (SC08). */
  setK: number;
  tK: number;
  offsetK: number;
  tauS: number;
  /** Desde cuándo está dentro de la estabilidad (s) y momentos de apagado. */
  stableSince: number | null;
}

export interface Collector {
  tubeId: string | null;
  seal01: number;
  stopcockOpen: boolean;
  /** O₂ en la columna (mmol) y lo que desbordó por arriba del tope. */
  gasMmol: number;
  connectedAt: number | null;
  /** Cero y escala del instrumento (SC06). */
  offsetMl: number;
  scale: number;
}

export interface Stopwatch {
  running: boolean;
  startedAt: number;
  accumS: number;
}

export type EnzInstrument = 'balance' | 'scale' | 'thermo' | 'collector' | 'eye' | 'foam' | 'ph' | 'clock' | 'uv';

export interface EnzReading {
  id: string;
  tick: number;
  t: number;
  instrument: EnzInstrument;
  targetId: string;
  value: number;
  unit: string;
  /** Lectura cualitativa (color de Lugol/Benedict, fondo de escala, tira interferida). */
  quality?: string;
  biased?: boolean;
  /** Lectura del cronómetro de la estación en el mismo instante (s): las tasas se calculan con TU reloj. */
  clockS?: number | null;
}

export interface EnzState {
  vessels: Record<string, EnzVessel>;
  tubes: Record<string, EnzTube>;
  batches: Record<'P1' | 'P2' | 'P3', PrepBatch | null>;
  plates: Record<string, Hotplate>;
  /** Pastilla → recipiente donde está (null: en su soporte). */
  bars: Record<string, string | null>;
  baths: Record<string, WaterBath>;
  balance: { tareG: number; tared: boolean };
  /** Polvo en cada frasco (g), en la espátula y en el bote (g por frasco de origen). */
  powders: Record<string, number>;
  spatula: Record<string, number>;
  boat: Record<string, number>;
  /** Hígado: piezas de cada fuente (g, U activas e inactivas) y trozo sobre la tabla. */
  liver: Record<string, { massG: number; catU: number; catDenU: number }>;
  board: { sourceId: string; massG: number; catU: number; catDenU: number; pieces: number; sizeCm: number } | null;
  /** Hígado pesado en el bote (g) con su catalasa. */
  boatTissue: { sourceId: string; massG: number; catU: number; catDenU: number } | null;
  collector: Collector;
  clocks: Record<string, Stopwatch>;
  pours: Record<string, { targetId: string; tiltDeg: number }>;
  pipettes: Record<string, { from: string | null; residueFrom: string | null; bubble: boolean }>;
  /** Punta de cada gotero contaminada con el contenido de un tubo (M07). */
  dropperTip: Record<string, string | null>;
  /** Tira de pH en la mano: recipiente donde ya se mojó. */
  strip: string | null;
  uv: { blankA: number | null; blankCuvette: string | null };
  burnerLit: boolean;
  /** O₂ fuera de los líquidos (mmol): en el colector, venteado, atrapado bajo tapón; agua evaporada (mL). */
  o2: { vented: number; trapped: Record<string, number> };
  evaporatedMl: number;
  readings: Record<string, EnzReading>;
  readingOrder: string[];
  readingSeq: number;
  /** Totales al empezar (conservación, §6.5). */
  initial: Record<string, number>;
  incidents: string[];
  adhEnabled: boolean;
  /** Muestras ciegas (SC22): rótulos visibles de las fuentes de hígado. */
  blind: boolean;
  /** Peróxido agregado sin cronómetro (C05) y amilasa con el reloj ya corriendo (A04): tubo y momento. */
  pending: { c05: { tubeId: string; at: number } | null };
  checks: string[];
}

export interface EnzWorld extends CellWorld {
  enz: EnzState;
}

export interface EnzymeK {
  kcatPerU: number;
  /** Km (mmol/mL = mol/L). */
  km: number;
  tOptK: number;
  tWidthK: number;
  pHOpt: number;
  pHWidth: number;
  /** Desnaturalización: k = k0·exp((T − tDenK)/tScaleK) + kpH·max(0, |pH − pHOpt| − pHSafe) (s⁻¹). */
  k0: number;
  tDenK: number;
  tScaleK: number;
  kpH: number;
  pHSafe: number;
}

/** Parámetros de B05 (§7): valores de software `pending` salvo los aritméticos y los pedidos por la solicitud. */
export interface EnzParams {
  ambientK: number;
  pressureKPa: number;
  catalase: EnzymeK;
  amylase: EnzymeK;
  /** Dextrina → azúcares: fracción de la velocidad del almidón y Km propio; los gránulos se hidrolizan más lento. */
  dextrinFactor: number;
  dextrinKm: number;
  solidHydrolysis: number;
  /** ADH (modelo competitivo §3.2): kcat por U, Km del etanol, del NAD⁺ y del metanol, Ki del metanol. */
  adh: { kcatPerU: number; kmEtOH: number; kmNad: number; kmMeOH: number; kiMeOH: number; methanolRel: number };
  /** Peróxido: descomposición espontánea (s⁻¹) y O₂ disuelto a saturación (mmol/mL) con sobresaturación tolerada. */
  h2o2SpontK: number;
  o2SatMmolMl: number;
  supersat: number;
  /** Colector graduado (§4): 0–50 mL, división 0,5 mL, eficiencia didáctica 0,95, alivio por sobrepresión (mmol). */
  collector: { capacityMl: number; resolutionMl: number; efficiency01: number; sealOk: number; reliefMmol: number };
  /** Actividad por masa (U/g) del hígado asignado, del lote B y del precalentado (fracción activa); amilasa (U/g). */
  activity: { liverUPerG: number; lotBFactor: number; liverActive01: number; preheatedActive01: number; amylaseUPerG: number; adhUPerMl: number };
  /** Preparaciones (§5, §7): cantidades pedidas, tolerancias y física de la placa. */
  prep: {
    starchG: number; starchWaterMl: number; starchTargetK: number; tolG: number; tolMl: number; tolK: number;
    catalaseWaterMl: number; liverG: number; amylaseG: number; amylaseWaterMl: number; amylaseTolG: number; amylaseTolMl: number;
    disperseK: number; settleK: number; extractK: number; dissolveK: number; accessMax: number;
    slipRpmWater: number; slipRpmViscous: number; rpmFull: number; minStirS: number; homogReady: number; liverMaxCm: number;
    plateTauSPerMl: number; splashMlS: number;
  };
  bath: { tauS: number; tubeTauS: number; stabilityK: number; holdS: number };
  /** Ensayos de color: Lugol (I₂ por glucosilo, mitad de señal, dosis válida en gotas) y Benedict (calor y Cu₂O). */
  lugol: { glucosylPerI2: number; halfMmolMl: number; dropsMin: number; dropsMax: number; dropI2Mmol: number };
  benedict: { minK: number; k0: number; scaleK: number; visibleMmolMl: number; redMmolMl: number; minS: number; maxS: number; squeezeMl: number; cuMmolMl: number; baseMmolMl: number };
  /** Gotas de HCl y NaOH 1 mol/L (mL) y las asignadas al tratamiento de pH. */
  dropMl: number;
  acidDropsAssigned: number;
  baseDropsAssigned: number;
  /** pH del peróxido y del agua, tampón de los lotes (mmol/mL). */
  bufferMmolMl: number;
  stripResolution: number;
  pipettes: Record<string, { capMl: number; filmMl: number }>;
  bubbleLoss: number;
  pourMaxMlS: number;
  pourMinTiltDeg: number;
  readRes: { balance: number; thermo: number; cylinder: number; beaker: number };
  parallaxMlPerDeg: number;
  eyeTolDeg: number;
  /** Catalasa: volumen de H₂O₂ por tubo, molaridad, ventana de observación y tiempos de muestreo de la amilasa. */
  catalaseH2O2Ml: number;
  h2o2M: number;
  catalaseObservationS: number;
  amylaseIncubationS: number;
  amylaseSamplingS: number[];
  samplingTolS: number;
  /** Temperatura dañina para la enzima (K) y tiempo tolerado fuera de un tratamiento térmico (s). */
  harmK: number;
  harmMaxS: number;
  hotTouchK: number;
  /** UV (§8.4): ε340, paso de cada cubeta, fondo de la matriz. */
  uv: { epsilon: number; path: Record<string, number>; matrixA: number };
  /** Volumen prescrito del competidor (mL) en la cubeta competitiva. */
  competitorMl: number;
  ignitionDistanceCm: number;
}
