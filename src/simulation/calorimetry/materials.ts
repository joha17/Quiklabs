/**
 * §15 — banco de materiales (valores cerca de la temperatura ambiente, configurables) y alimentos (§20.10).
 * Los intervalos representan la variación entre muestras reales (aleaciones, oxidación, fabricación).
 */

export type MetalId = 'Al' | 'Fe' | 'steel' | 'Ni' | 'Cu' | 'Zn' | 'brass' | 'Sn' | 'Pb';

export interface MetalProps {
  id: MetalId;
  /** Calor específico nominal (J·g⁻¹·°C⁻¹) e intervalo admisible. */
  cp: number;
  cpRange: [number, number];
  /** Incertidumbre típica del valor de referencia (para la identificación). */
  uCp: number;
  /** Densidad (g/cm³): evidencia secundaria. */
  density: number;
  /** Aspecto: color base (hex) y si es claramente amarillento, gris oscuro, etc. */
  color: number;
  /** Masa típica de cada pieza (g): clavos, perdigones o trozos. */
  pieceMassG: [number, number];
  /** Pendiente del calor específico con la temperatura (J·g⁻¹·°C⁻²), modo avanzado. */
  dCpdT: number;
}

export const METALS: Record<MetalId, MetalProps> = {
  Al: { id: 'Al', cp: 0.897, cpRange: [0.88, 0.91], uCp: 0.01, density: 2.70, color: 0xc9ccd1, pieceMassG: [1.0, 1.3], dCpdT: 0.00046 },
  Fe: { id: 'Fe', cp: 0.449, cpRange: [0.44, 0.46], uCp: 0.005, density: 7.87, color: 0x8b8e93, pieceMassG: [2.4, 2.9], dCpdT: 0.0005 },
  steel: { id: 'steel', cp: 0.48, cpRange: [0.46, 0.50], uCp: 0.015, density: 7.85, color: 0x9a9da2, pieceMassG: [2.4, 2.9], dCpdT: 0.0005 },
  Ni: { id: 'Ni', cp: 0.444, cpRange: [0.44, 0.45], uCp: 0.005, density: 8.91, color: 0xb9b4a6, pieceMassG: [2.6, 3.1], dCpdT: 0.0004 },
  Cu: { id: 'Cu', cp: 0.385, cpRange: [0.38, 0.39], uCp: 0.004, density: 8.96, color: 0xc7704a, pieceMassG: [2.6, 3.1], dCpdT: 0.0001 },
  Zn: { id: 'Zn', cp: 0.388, cpRange: [0.38, 0.39], uCp: 0.004, density: 7.14, color: 0xa7adb3, pieceMassG: [2.1, 2.6], dCpdT: 0.0001 },
  brass: { id: 'brass', cp: 0.38, cpRange: [0.37, 0.39], uCp: 0.01, density: 8.5, color: 0xc9a84e, pieceMassG: [2.5, 3.0], dCpdT: 0.0001 },
  Sn: { id: 'Sn', cp: 0.227, cpRange: [0.22, 0.23], uCp: 0.003, density: 7.29, color: 0xd2d4d6, pieceMassG: [2.2, 2.7], dCpdT: 0.0001 },
  Pb: { id: 'Pb', cp: 0.128, cpRange: [0.127, 0.13], uCp: 0.002, density: 11.34, color: 0x6c7076, pieceMassG: [3.2, 3.9], dCpdT: 0.00002 },
};

/** Especies que el docente puede asignar como incógnito (hay valores próximos: Cu, Zn y latón). */
export const UNKNOWN_BANK: MetalId[] = ['Al', 'Cu', 'Zn', 'brass', 'Ni', 'Sn', 'Pb'];

// ─────────────────────────── Alimentos (§20.10) ───────────────────────────

export type FoodId = 'peanut' | 'cookie' | 'cereal' | 'chips' | 'benzoic';

export interface FoodSample {
  id: FoodId;
  /** Fracción de humedad. */
  moistureFraction: number;
  /** Energía bruta de la muestra tal cual (J/g). */
  grossEnergyJPerG: number;
  ashFraction: number;
  /** 0 (fácil) – 1 (difícil de encender). */
  ignitionDifficulty: number;
  /** Fracción que se quema en condiciones correctas. */
  burnCompleteness: number;
  /** Energía metabolizable declarada en etiquetas (kJ/g), solo para comparar (§20.11). */
  labelEnergyKJPerG: number | null;
}

export const FOODS: Record<FoodId, FoodSample> = {
  peanut: { id: 'peanut', moistureFraction: 0.06, grossEnergyJPerG: 26400, ashFraction: 0.024, ignitionDifficulty: 0.2, burnCompleteness: 0.995, labelEnergyKJPerG: 23.7 },
  cookie: { id: 'cookie', moistureFraction: 0.04, grossEnergyJPerG: 20600, ashFraction: 0.015, ignitionDifficulty: 0.25, burnCompleteness: 0.99, labelEnergyKJPerG: 19.8 },
  cereal: { id: 'cereal', moistureFraction: 0.05, grossEnergyJPerG: 17400, ashFraction: 0.03, ignitionDifficulty: 0.35, burnCompleteness: 0.985, labelEnergyKJPerG: 15.9 },
  chips: { id: 'chips', moistureFraction: 0.02, grossEnergyJPerG: 23300, ashFraction: 0.03, ignitionDifficulty: 0.2, burnCompleteness: 0.99, labelEnergyKJPerG: 22.4 },
  // Patrón de calibración (ácido benzoico): 26,454 kJ/g.
  benzoic: { id: 'benzoic', moistureFraction: 0, grossEnergyJPerG: 26454, ashFraction: 0, ignitionDifficulty: 0.1, burnCompleteness: 1, labelEnergyKJPerG: null },
};

// ─────────────────────────── Perfiles de bomba calorimétrica (§20.2) ───────────────────────────

export interface BombProfile {
  id: 'GENERIC_A' | 'GENERIC_B';
  /** Presión de llenado del procedimiento y límites del perfil (atm). */
  fillAtm: number;
  minAtm: number;
  maxAtm: number;
  /** Energía máxima admisible por ensayo (J). */
  maxEnergyJ: number;
  maxSampleG: number;
  /** Constante energética vigente (J/°C) con la cubeta llena con `bucketWaterG`. */
  energyEquivalentJPerC: number;
  bucketWaterG: number;
  /** Energía del alambre (J por cm quemado). */
  wireJPerCm: number;
  /** Camisa: isoperibólica (deriva hacia la camisa) o adiabática. */
  jacket: 'ISOPERIBOL' | 'ADIABATIC';
}

export const BOMB_PROFILES: Record<BombProfile['id'], BombProfile> = {
  GENERIC_A: { id: 'GENERIC_A', fillAtm: 30, minAtm: 25, maxAtm: 35, maxEnergyJ: 33000, maxSampleG: 1.0, energyEquivalentJPerC: 10150, bucketWaterG: 2000, wireJPerCm: 9.6, jacket: 'ISOPERIBOL' },
  GENERIC_B: { id: 'GENERIC_B', fillAtm: 30, minAtm: 28, maxAtm: 32, maxEnergyJ: 40000, maxSampleG: 1.2, energyEquivalentJPerC: 10480, bucketWaterG: 2000, wireJPerCm: 9.6, jacket: 'ADIABATIC' },
};
