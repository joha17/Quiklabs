/**
 * Tipos del motor químico (Práctica 4, §7): especies con fase, carga y composición; reacciones balanceadas con
 * constante de equilibrio y entalpía calculada por la ley de Hess; celdas de mezcla con moles por especie.
 * Datos puros y serializables: sin Three, React ni DOM.
 */

export type Phase = 'AQUEOUS' | 'SOLID' | 'LIQUID' | 'GAS' | 'SURFACE';

export interface SpeciesDef {
  /** Clave del motor («Ca^2+», «CaCO3(s)», «H2O»). */
  id: string;
  /** Fórmula ASCII analizable («Ca^2+», «CaCO3»). */
  formula: string;
  phase: Phase;
  /** Derivados de la fórmula (formula.ts). */
  charge: number;
  elements: Record<string, number>;
  molarMass: number;
  /** Entalpía estándar de formación (kJ/mol, 25 °C): ΔH de reacción por la ley de Hess. */
  dHf: number;
  /** Absorbancia molar decimal por canal R, G, B (L·mol⁻¹·cm⁻¹) de las especies disueltas con color. */
  absorbRgb?: [number, number, number];
  /** Color del sólido en suspensión, sedimento o depósito (sRGB 0–1). */
  solidRgb?: [number, number, number];
  densityGcm3?: number;
  /** Velocidad de sedimentación de partículas sin flocular (mm/s) y carácter gelatinoso (flóculos hidratados). */
  settleMmS?: number;
  gelatinous?: boolean;
  /** Electrolito fuerte soluble: en una ecuación iónica se escribe disociado (§15.1). */
  strongElectrolyte?: boolean;
}

export type ReactionKind =
  | 'NEUTRALIZATION' | 'ACID_BASE' | 'HYDROLYSIS' | 'PRECIPITATION' | 'GAS_RELEASE' | 'REDOX' | 'COMBUSTION' | 'HYDRATION';

export interface ReactionDef {
  id: string;
  kind: ReactionKind;
  /** Coeficientes: negativos = reactivos, positivos = productos (claves de especie). */
  nu: Record<string, number>;
  /**
   * log₁₀ K en base de concentración (sólidos, líquidos puros y agua con actividad 1). En las precipitaciones la
   * reacción se escribe como formación del sólido: K = 1/Ksp.
   */
  logK?: number;
  /** Constante de nucleación/crecimiento a sobresaturación alta (1/s) y de disolución (1/s). */
  kPrecip?: number;
  kDissolve?: number;
}

/** Celda de mezcla (§7.4): volumen de líquido y moles por especie (incluye sólidos en suspensión o depositados). */
export interface Cell {
  volL: number;
  mol: Record<string, number>;
  /** Volumen (mL) de cada reactivo original que forma este líquido: se reparte con cada transferencia. */
  origin?: Record<string, number>;
}

export interface ChemContext {
  species: Record<string, SpeciesDef>;
  reactions: Record<string, ReactionDef>;
  /** Equilibrios ácido–base e hidrólisis (rápidos, se resuelven completos en cada paso). */
  fast: ReactionDef[];
  /** Precipitaciones/disoluciones (Q frente a Ksp, con nucleación y crecimiento graduales). */
  precip: ReactionDef[];
}

/** Resultado de aplicar avances: calor liberado (J, positivo = exotérmico) y avance por reacción (mol). */
export interface ReactionOutcome {
  heatJ: number;
  extents: Record<string, number>;
}
