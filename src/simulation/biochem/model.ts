/**
 * Química de la práctica B04 «Detectives moleculares» (§3.2, §3.3). Funciones PURAS en unidades explícitas:
 * volúmenes en mL, cantidades en mmol (glúcidos en equivalentes glucosilo, proteína y lípido en mg), temperatura en K,
 * presión en Pa, actividad enzimática en U de software (1 U = 1e-3 mmol/s a saturación). Las respuestas de color salen
 * de las especies presentes (complejo yodo–amilosa, complejo de Biuret, Cu₂O) y NUNCA del nombre de la muestra. Todos
 * los coeficientes son de software (`PENDING_CALIBRATION`): sirven para probar el integrador, no son medidas.
 */

export const R_J = 8.314462618;
export const P_ATM = 101325;

/** Especies extensivas de un líquido (lo que se reparte proporcionalmente al trasvasar). */
export const SPECIES = [
  'starch', 'starchSolid', 'dextrin', 'maltose', 'glucose', 'lactose', 'reductant',
  'proteinMg', 'lipidMg', 'lipidExt', 'ethanolMl', 'h2o2',
  'catAct', 'catDen', 'catTissue', 'catTissueDen', 'amyAct', 'amyDen', 'amySolid', 'adhAct', 'nad', 'nadh', 'ethanolSub', 'methanol',
  'iodine', 'cu', 'cu2o', 'cuOH', 'acid', 'buf', 'bufPKa', 'pigment', 'turbid', 'detergent',
  // Glucosilos de azúcares ya oxidados por el Cu(II) (dejan de ser reductores, siguen en el balance).
  'oxidized',
] as const;
export type SpeciesId = (typeof SPECIES)[number];
export type Species = Record<SpeciesId, number>;
export const noSpecies = (): Species => Object.fromEntries(SPECIES.map((s) => [s, 0])) as Species;

/**
 * Equivalentes glucosilo de un líquido (invariante de la hidrólisis, §6.6-c): almidón disperso y en grumos, dextrinas,
 * maltosa (2 glucosilos) y glucosa. La lactosa es de la leche y no participa de la amilasa.
 */
export const glucosylOf = (s: Species) => s.starch + s.starchSolid + s.dextrin + 2 * s.maltose + s.glucose;

/** Cobre total (mmol de átomos): disuelto, Cu₂O (2 Cu) y Cu(OH)₂ precipitado. */
export const copperOf = (s: Species) => s.cu + 2 * s.cu2o + s.cuOH;

// ─────────────────────────── pH ───────────────────────────

/**
 * pH de una mezcla con ácido/base fuerte neto (`acid`, mmol; negativo = base) y un tampón (`buf` mmol con su pKa
 * ponderado en `bufPKa` = Σ mmol·pKa). Aproximación lineal de capacidad amortiguadora β = 0,58·C_tampón más la del
 * agua: suficiente para pasar de neutro a alcalino con gotas de NaOH, no una especiación exacta.
 */
export function pHOf(s: Species, volumeMl: number): number {
  if (volumeMl <= 1e-9) return 7;
  const pKa = s.buf > 1e-9 ? s.bufPKa / s.buf : 7;
  const beta = 0.58 * s.buf + 0.001 * volumeMl;
  return Math.min(13.5, Math.max(1, pKa - s.acid / beta));
}

// ─────────────────────────── Enzimas ───────────────────────────

export interface EnzymeKinetics {
  /** mmol/s por U a saturación (1e-3 por definición de la U de software). */
  kcatPerU: number;
  /** Km (mmol/mL = mol/L). */
  km: number;
  /** Temperatura y pH óptimos y anchos de la campana de actividad. */
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

/** Factor de actividad por temperatura y pH (0–1); no cambia la cantidad de enzima activa. */
export function activityFactor(k: EnzymeKinetics, tK: number, pH: number): number {
  const ft = Math.exp(-(((tK - k.tOptK) / k.tWidthK) ** 2));
  const fp = Math.exp(-(((pH - k.pHOpt) / k.pHWidth) ** 2));
  return ft * fp;
}

/** Constante de desnaturalización (s⁻¹) a T y pH: térmica más la de pH extremo. */
export function denatRate(k: EnzymeKinetics, tK: number, pH: number): number {
  return k.k0 * Math.exp((tK - k.tDenK) / k.tScaleK) + k.kpH * Math.max(0, Math.abs(pH - k.pHOpt) - k.pHSafe);
}

/** Integración analítica de dE/dt = −k·E en dt (§8.3: E = E₀·e^(−k·t)). Devuelve la enzima que se inactiva. */
export const denatured = (eAct: number, k: number, dt: number) => eAct * (1 - Math.exp(-k * dt));

/** Velocidad de Michaelis–Menten (mmol/s) con sustrato en mmol dentro de V mL. */
export function mmRate(k: EnzymeKinetics, eAct: number, substrateMmol: number, volumeMl: number, tK: number, pH: number): number {
  if (eAct <= 0 || substrateMmol <= 0 || volumeMl <= 1e-9) return 0;
  const c = substrateMmol / volumeMl;
  return k.kcatPerU * eAct * activityFactor(k, tK, pH) * (c / (k.km + c));
}

/** Volumen ideal de gas seco (mL) de n mmol a T (K) y P (Pa): V = nRT/P (§3.3-8; §8.1: 1 mmol a 298,15 K → 24,47 mL). */
export const gasVolumeMl = (nMmol: number, tK: number, pPa = P_ATM) => ((nMmol * 1e-3 * R_J * tK) / pPa) * 1e6;

/**
 * ADH (módulo cerrado, §3.3-4): etanol + NAD⁺ → acetaldehído + NADH. Velocidad con competencia del metanol por el
 * sitio (Km aparente mayor) y dependencia del cofactor; sin NAD⁺ no hay conversión (no se infiere inhibición).
 */
export interface AdhKinetics {
  kcatPerU: number;
  kmEtOH: number;
  kmNad: number;
  kiMeOH: number;
}
export function adhRate(k: AdhKinetics, eAct: number, s: Species, volumeMl: number): number {
  if (eAct <= 0 || volumeMl <= 1e-9 || s.nad <= 0 || s.ethanolSub <= 0) return 0;
  const e = s.ethanolSub / volumeMl;
  const n = s.nad / volumeMl;
  const m = s.methanol / volumeMl;
  return k.kcatPerU * eAct * (e / (k.kmEtOH * (1 + m / k.kiMeOH) + e)) * (n / (k.kmNad + n));
}

// ─────────────────────────── Ensayos de color ───────────────────────────

export interface AssayResponse {
  /** Lugol: equivalentes glucosilo por mmol de I₂ que forman complejo y concentración de mitad de señal. */
  iodinePerGlucosyl: number;
  lugolHalfMmolMl: number;
  /** Biuret: pH mínimo, LOD (mg/mL), proteína de mitad de señal y Cu útil (mmol/mL) por encima del cual precipita. */
  biuretMinPH: number;
  biuretLodMgMl: number;
  biuretHalfMgMl: number;
  biuretCuMaxMmolMl: number;
  biuretDelayS: number;
  /** Benedict: constante de reducción k = k0·exp((T − 373,15)/scale) (mL·mmol⁻¹·s⁻¹) y T por debajo de la cual es nula. */
  benedictK0: number;
  benedictScaleK: number;
  benedictMinK: number;
  /** Cu₂O (mmol/mL) para el primer cambio visible y para el rojo ladrillo. */
  benedictVisible: number;
  benedictRed: number;
  /** Dextrinas: fracción de su poder reductor. */
  dextrinReducing: number;
  /** Emulsión: fracción mínima de etanol para extraer, velocidad de extracción (s⁻¹), índice visible y vida (s). */
  ethanolMinFrac: number;
  extractPerS: number;
  emulsionVisibleMgMl: number;
  emulsionLifeS: number;
}

/** Índice de color del complejo yodo–amilosa (0–1) y I₂ libre: el yodo limita la señal (L01). */
/** `homog01`: homogeneidad del tubo; una suspensión bien mezclada da un color uniforme aunque el almidón no esté disuelto. */
export function lugolSignal(r: AssayResponse, s: Species, volumeMl: number, homog01 = 0): { index: number; freeIodine: number; complexed: number; localized: boolean } {
  if (volumeMl <= 1e-9) return { index: 0, freeIodine: 0, complexed: 0, localized: false };
  const sites = (s.starch + 0.3 * s.dextrin) / r.iodinePerGlucosyl;
  const complexed = Math.min(s.iodine, sites);
  const glucosylBound = complexed * r.iodinePerGlucosyl;
  const c = glucosylBound / volumeMl;
  const index = c / (r.lugolHalfMmolMl + c);
  const solid = s.starchSolid > 0.3 * (s.starch + s.starchSolid) && s.starchSolid > 1e-6;
  return { index, freeIodine: s.iodine - complexed, complexed, localized: solid && s.iodine > 0 && homog01 < 0.7 };
}

export type BiuretColor = 'none' | 'blue' | 'weak' | 'violet' | 'precipitate';

/**
 * Biuret (§3.1): complejo violeta solo en medio alcalino y con Cu(II) disponible; por debajo del LOD queda el azul del
 * reactivo; con Cu por encima de lo calibrado precipita Cu(OH)₂ (interferencia). El desarrollo tarda `delayS`.
 */
export function biuretSignal(r: AssayResponse, s: Species, volumeMl: number, ageS: number): { color: BiuretColor; index: number } {
  if (volumeMl <= 1e-9 || s.cu + s.cuOH <= 1e-9) return { color: 'none', index: 0 };
  if (s.cuOH > 1e-6) return { color: 'precipitate', index: 0 };
  const pH = pHOf(s, volumeMl);
  const mg = s.proteinMg / volumeMl;
  if (pH < r.biuretMinPH || mg < r.biuretLodMgMl) return { color: 'blue', index: 0 };
  const dev = Math.min(1, ageS / Math.max(1, r.biuretDelayS));
  const index = (mg / (r.biuretHalfMgMl + mg)) * dev;
  return { color: index > 0.45 ? 'violet' : index > 0.08 ? 'weak' : 'blue', index };
}

/** Equivalentes reductores (mmol) frente al Cu(II): azúcares reductores, parte de las dextrinas y reductores no glucídicos. */
export const reducingEq = (r: AssayResponse, s: Species) => s.glucose + s.maltose + s.lactose + r.dextrinReducing * s.dextrin + s.reductant;

/**
 * Reducción de Benedict en dt: 2 Cu(II) + reductor → Cu₂O. Necesita calor (k ≈ 0 por debajo de `benedictMinK`) y
 * medio alcalino. Devuelve los mmol de Cu₂O formados y de reductor consumido (estequiometría 1:1 por equivalente).
 */
export function benedictStep(r: AssayResponse, s: Species, volumeMl: number, tK: number, dt: number): { cu2o: number; red: number } {
  if (volumeMl <= 1e-9 || tK < r.benedictMinK || s.cu <= 1e-12) return { cu2o: 0, red: 0 };
  const red = reducingEq(r, s);
  if (red <= 1e-12 || pHOf(s, volumeMl) < 8) return { cu2o: 0, red: 0 };
  const k = r.benedictK0 * Math.exp((tK - 373.15) / r.benedictScaleK);
  const rate = (k * red * s.cu) / volumeMl;
  const n = Math.min(rate * dt, s.cu / 2, red);
  return { cu2o: n, red: n };
}

export type BenedictColor = 'blue' | 'green' | 'yellow' | 'orange' | 'brick';

export function benedictColor(r: AssayResponse, s: Species, volumeMl: number): BenedictColor {
  if (volumeMl <= 1e-9) return 'blue';
  const c = s.cu2o / volumeMl;
  if (c < r.benedictVisible) return 'blue';
  if (c < r.benedictRed * 0.25) return 'green';
  if (c < r.benedictRed * 0.5) return 'yellow';
  if (c < r.benedictRed) return 'orange';
  return 'brick';
}

/**
 * Emulsión (§3.2): el lípido pasa a la fase rica en etanol mientras el etanol supera `ethanolMinFrac` del líquido;
 * al diluir con agua, el lípido extraído forma gotas (turbidez) que se separan con el tiempo.
 */
export function extractionStep(r: AssayResponse, s: Species, volumeMl: number, mixing01: number, dt: number): number {
  if (volumeMl <= 1e-9 || s.lipidMg <= 1e-9) return 0;
  const frac = s.ethanolMl / volumeMl;
  if (frac < r.ethanolMinFrac) return 0;
  return s.lipidMg * (1 - Math.exp(-r.extractPerS * (0.3 + mixing01) * dt));
}

/** Turbidez de emulsión (mg/mL de lípido disperso) con la edad desde la dilución; la turbidez previa no cuenta. */
export function emulsionIndex(r: AssayResponse, s: Species, volumeMl: number, ageS: number): number {
  if (volumeMl <= 1e-9) return 0;
  const waterFrac = 1 - s.ethanolMl / volumeMl;
  if (waterFrac < 0.5) return 0;
  return (s.lipidExt / volumeMl) * Math.exp(-ageS / r.emulsionLifeS);
}

// ─────────────────────────── Calor ───────────────────────────

/** dT/dt = UA·(T_ext − T)/C en dt, integración exacta para T_ext constante en el paso (§3.3-5). */
export const relaxTemp = (t: number, tExt: number, uaWPerK: number, heatCapJPerK: number, dt: number) =>
  tExt + (t - tExt) * Math.exp((-uaWPerK * dt) / Math.max(1e-6, heatCapJPerK));

/** Capacidad calorífica de un líquido acuoso (J/K): 4,18 J/(g·K) con densidad 1 g/mL, más la del vidrio. */
export const heatCapacity = (volumeMl: number, glassJPerK: number) => 4.18 * Math.max(0, volumeMl) + glassJPerK;
