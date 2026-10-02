/** Identificadores de componentes que lleva el balance de masa. */
export type SolidId = 'Zn' | 'GRAPHITE' | 'S8' | 'NaCl' | 'SUCROSE' | 'KNO3' | 'CARBON' | 'IMP';
export type OilId = 'OIL_VEG' | 'OIL_MIN';
export type SubstanceId = SolidId | OilId;
/** Componente para el balance: incluye agua (líquida + hielo). */
export type ComponentId = SubstanceId | 'H2O';

export type Classification = 'ELEMENT' | 'COMPOUND' | 'HOMOGENEOUS_MIXTURE' | 'HETEROGENEOUS_MIXTURE';
export type PhysicalState = 'SOLID' | 'LIQUID' | 'GAS';
export type WaterBehavior = 'SOLUBLE' | 'INSOLUBLE' | 'IMMISCIBLE';
export type OdorLevel = 'NONE' | 'FAINT' | 'NEAR_NONE';
export type ParticleKind = 'CHUNK' | 'POWDER' | 'CRYSTAL' | 'LIQUID';

export interface SubstanceDef {
  id: SubstanceId;
  /** Clave i18n del nombre. */
  nameKey: string;
  formula: string;
  classification: Classification;
  stateAt25: PhysicalState;
  /** Color de render (RGB hex) — solo para la capa de representación. */
  colorHex: number;
  /** Clave i18n de color esperado (para evaluación de la libreta). */
  expectedColorKeys: string[];
  odor: OdorLevel;
  waterBehavior: WaterBehavior;
  /** g de soluto / 100 g H₂O frente a T (°C). Solo si SOLUBLE. */
  solubilityTable?: ReadonlyArray<readonly [number, number]>;
  densityGPerMl: number;
  specificHeatJPerGK: number;
  /** Volumen aparente al disolverse (mL/g) para calcular el volumen de la disolución. */
  apparentVolumeMlPerG: number;
  particle: {
    kind: ParticleKind;
    sizeUm: number;
    /** Constante de sedimentación (1/s) en reposo. */
    settleRate: number;
    /** Fracción que flota por mal mojado (azufre). */
    floatFraction: number;
  };
  /** Constante base de disolución (1/s) a 25 °C con agitación plena. */
  dissolveRate: number;
  /** Viscosidad relativa al agua (líquidos inmiscibles). */
  relativeViscosity?: number;
}

export type SubstanceTable = Readonly<Record<SubstanceId, SubstanceDef>>;
