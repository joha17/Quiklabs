/**
 * Fichas de sustancias de la Práctica 7 (enlaces y propiedades, §4.2 y §6.2). Cada ficha separa la identidad química
 * (familia, fórmula, masa molar, iones que forma, equilibrio ácido) de los datos de propiedades con su referencia.
 *
 * TODOS los números de esta tabla son valores CURRICULARES PROVISIONALES (`[PENDIENTE]`): sirven para programar y
 * probar el modelo, pero deben cotejarse con una fuente verificable (CRC, NIST, IUPAC, fichas técnicas) antes de
 * publicar (§7, §17.8). Las sustancias sin ficha completa quedan `pending` o `restricted` y no se simulan.
 */

export type MaterialId =
  | 'Cu' | 'Al' | 'Fe' | 'bronze' | 'graphite'
  | 'NaCl' | 'KCl' | 'NaHCO3' | 'CuSO4_5H2O' | 'NaOH'
  | 'sucrose' | 'glycerol' | 'ethanol' | 'isopropanol' | 'acetone' | 'acetic'
  | 'mineralOil' | 'paraffin' | 'naphthalene'
  | 'water' | 'heptane' | 'petEther';

export type IonId = 'Na+' | 'K+' | 'Cu2+' | 'H3O+' | 'Cl-' | 'SO4_2-' | 'HCO3-' | 'CH3COO-' | 'OH-';

export type Family = 'metal' | 'alloy' | 'ionic-solid' | 'molecular' | 'covalent-network' | 'solvent' | 'mixture';

export interface DissociationSpec {
  /** Iones por fórmula disuelta (ν). La carga total es cero por construcción. */
  ions: Array<{ ion: IonId; nu: number }>;
}

export interface WeakAcidSpec {
  /** Constante de acidez didáctica a 25 °C (§8.5) y los iones que forma (H₃O⁺ + base conjugada). */
  ka: number;
  ions: [IonId, IonId];
}

export interface SolidElectricalSpec {
  /** Resistividad efectiva del material (Ω·m) a lo largo de su dirección fácil. */
  rhoOhmM: number;
  /** Resistividad en la dirección perpendicular (grafito, §3.1): si falta, el material es isótropo. */
  rhoPerpOhmM?: number;
}

export interface MaterialSpec {
  id: MaterialId;
  formula: string;
  family: Family;
  phase: 'solid' | 'liquid';
  /** g/mol; ausente en mezclas no caracterizadas (aceite mineral, parafina, aleación). */
  molarMassGmol?: number;
  /** Densidad (g/mL) a 25 °C para pasar de masa a volumen de líquido. */
  densityGml: number;
  /** Fracción másica pura del lote virtual. */
  purity: number;
  dissociation?: DissociationSpec;
  weakAcid?: WeakAcidSpec;
  electrical?: SolidElectricalSpec;
  /** Aspecto: color base (sRGB hex) y forma del sólido para la escena (no es una medición). */
  color: number;
  look: 'strip' | 'rod' | 'plate' | 'crystals' | 'powder' | 'block' | 'flakes' | 'liquid';
  safety: 'none' | 'irritant' | 'flammable' | 'corrosive' | 'harmful';
  /** Núcleo de la práctica, ampliación o bloqueada (§4.2). */
  selection: 'core' | 'extended' | 'blocked';
  /** `enabled`: ficha completa; `restricted`: solo con permiso docente; `pending`: sin ficha validada (no se simula). */
  status: 'enabled' | 'restricted' | 'pending';
  /** Referencias de los datos (todas pendientes de verificación). */
  refs: string[];
}

const PEND = '[PENDIENTE] cotejar con CRC Handbook / NIST / ficha técnica del lote antes de publicar';

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  Cu: { id: 'Cu', formula: 'Cu', family: 'metal', phase: 'solid', molarMassGmol: 63.55, densityGml: 8.96, purity: 0.999, electrical: { rhoOhmM: 1.7e-8 }, color: 0xc06b3c, look: 'strip', safety: 'none', selection: 'core', status: 'enabled', refs: [PEND] },
  Al: { id: 'Al', formula: 'Al', family: 'metal', phase: 'solid', molarMassGmol: 26.98, densityGml: 2.7, purity: 0.995, electrical: { rhoOhmM: 2.7e-8 }, color: 0xc9cdd2, look: 'strip', safety: 'none', selection: 'extended', status: 'enabled', refs: [PEND] },
  Fe: { id: 'Fe', formula: 'Fe', family: 'metal', phase: 'solid', molarMassGmol: 55.85, densityGml: 7.87, purity: 0.99, electrical: { rhoOhmM: 1.0e-7 }, color: 0x6f7378, look: 'rod', safety: 'none', selection: 'extended', status: 'enabled', refs: [PEND] },
  bronze: { id: 'bronze', formula: 'Cu–Sn', family: 'alloy', phase: 'solid', densityGml: 8.8, purity: 1, electrical: { rhoOhmM: 1.5e-7 }, color: 0xa8763e, look: 'strip', safety: 'none', selection: 'extended', status: 'enabled', refs: [PEND, '[DISEÑO] composición del lote virtual: 90 % Cu, 10 % Sn'] },
  graphite: { id: 'graphite', formula: 'C', family: 'covalent-network', phase: 'solid', molarMassGmol: 12.011, densityGml: 2.2, purity: 0.99, electrical: { rhoOhmM: 1.0e-5, rhoPerpOhmM: 2.0e-2 }, color: 0x3a3d42, look: 'plate', safety: 'none', selection: 'core', status: 'enabled', refs: [PEND, '[MODELO] anisotropía de una placa tipo HOPG (razón ~2000)'] },
  NaCl: { id: 'NaCl', formula: 'NaCl', family: 'ionic-solid', phase: 'solid', molarMassGmol: 58.44, densityGml: 2.16, purity: 0.999, dissociation: { ions: [{ ion: 'Na+', nu: 1 }, { ion: 'Cl-', nu: 1 }] }, electrical: { rhoOhmM: 1e12 }, color: 0xf4f6f8, look: 'crystals', safety: 'none', selection: 'core', status: 'enabled', refs: [PEND] },
  KCl: { id: 'KCl', formula: 'KCl', family: 'ionic-solid', phase: 'solid', molarMassGmol: 74.55, densityGml: 1.98, purity: 0.999, dissociation: { ions: [{ ion: 'K+', nu: 1 }, { ion: 'Cl-', nu: 1 }] }, electrical: { rhoOhmM: 1e12 }, color: 0xf2f4f6, look: 'crystals', safety: 'none', selection: 'extended', status: 'enabled', refs: [PEND] },
  NaHCO3: { id: 'NaHCO3', formula: 'NaHCO₃', family: 'ionic-solid', phase: 'solid', molarMassGmol: 84.01, densityGml: 2.2, purity: 0.995, dissociation: { ions: [{ ion: 'Na+', nu: 1 }, { ion: 'HCO3-', nu: 1 }] }, electrical: { rhoOhmM: 1e12 }, color: 0xfafafa, look: 'powder', safety: 'none', selection: 'extended', status: 'enabled', refs: [PEND] },
  CuSO4_5H2O: { id: 'CuSO4_5H2O', formula: 'CuSO₄·5H₂O', family: 'ionic-solid', phase: 'solid', molarMassGmol: 249.69, densityGml: 2.28, purity: 0.99, dissociation: { ions: [{ ion: 'Cu2+', nu: 1 }, { ion: 'SO4_2-', nu: 1 }] }, electrical: { rhoOhmM: 1e11 }, color: 0x2f7fd0, look: 'crystals', safety: 'harmful', selection: 'extended', status: 'enabled', refs: [PEND] },
  NaOH: { id: 'NaOH', formula: 'NaOH', family: 'ionic-solid', phase: 'solid', molarMassGmol: 40.0, densityGml: 2.13, purity: 0.98, dissociation: { ions: [{ ion: 'Na+', nu: 1 }, { ion: 'OH-', nu: 1 }] }, electrical: { rhoOhmM: 1e10 }, color: 0xfbfbfb, look: 'flakes', safety: 'corrosive', selection: 'blocked', status: 'restricted', refs: [PEND, 'Corrosivo: solo virtual y con permiso docente (§4.2, L10)'] },
  sucrose: { id: 'sucrose', formula: 'C₁₂H₂₂O₁₁', family: 'molecular', phase: 'solid', molarMassGmol: 342.3, densityGml: 1.59, purity: 0.999, electrical: { rhoOhmM: 1e12 }, color: 0xf7f5ef, look: 'crystals', safety: 'none', selection: 'core', status: 'enabled', refs: [PEND] },
  glycerol: { id: 'glycerol', formula: 'C₃H₈O₃', family: 'molecular', phase: 'liquid', molarMassGmol: 92.09, densityGml: 1.26, purity: 0.995, color: 0xeef2f4, look: 'liquid', safety: 'none', selection: 'extended', status: 'enabled', refs: [PEND] },
  ethanol: { id: 'ethanol', formula: 'C₂H₅OH', family: 'molecular', phase: 'liquid', molarMassGmol: 46.07, densityGml: 0.789, purity: 0.96, color: 0xf4f8fa, look: 'liquid', safety: 'flammable', selection: 'core', status: 'enabled', refs: [PEND] },
  isopropanol: { id: 'isopropanol', formula: 'C₃H₇OH', family: 'molecular', phase: 'liquid', molarMassGmol: 60.1, densityGml: 0.786, purity: 0.99, color: 0xf4f8fa, look: 'liquid', safety: 'flammable', selection: 'core', status: 'enabled', refs: [PEND] },
  acetone: { id: 'acetone', formula: 'C₃H₆O', family: 'molecular', phase: 'liquid', molarMassGmol: 58.08, densityGml: 0.784, purity: 0.995, color: 0xf6f8fa, look: 'liquid', safety: 'flammable', selection: 'extended', status: 'enabled', refs: [PEND] },
  acetic: { id: 'acetic', formula: 'CH₃COOH', family: 'molecular', phase: 'liquid', molarMassGmol: 60.05, densityGml: 1.049, purity: 0.998, weakAcid: { ka: 1.8e-5, ions: ['H3O+', 'CH3COO-'] }, color: 0xf6f8fa, look: 'liquid', safety: 'corrosive', selection: 'core', status: 'enabled', refs: [PEND, '[DISEÑO] en la mesada solo hay ácido acético ya diluido (0,10 mol/L)'] },
  mineralOil: { id: 'mineralOil', formula: 'CₙH₂ₙ₊₂ (mezcla)', family: 'mixture', phase: 'liquid', densityGml: 0.85, purity: 1, color: 0xf3e9b0, look: 'liquid', safety: 'none', selection: 'core', status: 'enabled', refs: [PEND, 'Mezcla de hidrocarburos: lote virtual sin masa molar única'] },
  paraffin: { id: 'paraffin', formula: 'CₙH₂ₙ₊₂ (n ≈ 20–40)', family: 'mixture', phase: 'solid', densityGml: 0.9, purity: 1, electrical: { rhoOhmM: 1e15 }, color: 0xf1ede2, look: 'block', safety: 'none', selection: 'core', status: 'enabled', refs: [PEND] },
  naphthalene: { id: 'naphthalene', formula: 'C₁₀H₈', family: 'molecular', phase: 'solid', molarMassGmol: 128.17, densityGml: 1.14, purity: 0.99, electrical: { rhoOhmM: 1e14 }, color: 0xfafaf6, look: 'flakes', safety: 'harmful', selection: 'extended', status: 'enabled', refs: [PEND, 'Ficha virtual de peligro: nocivo; sin inhalar ni calentar'] },
  water: { id: 'water', formula: 'H₂O', family: 'solvent', phase: 'liquid', molarMassGmol: 18.015, densityGml: 0.997, purity: 1, color: 0xd6ebf7, look: 'liquid', safety: 'none', selection: 'core', status: 'enabled', refs: [PEND, 'Agua purificada de referencia con fondo iónico declarado (no κ = 0)'] },
  heptane: { id: 'heptane', formula: 'C₇H₁₆', family: 'solvent', phase: 'liquid', molarMassGmol: 100.2, densityGml: 0.684, purity: 0.99, color: 0xfaf8ee, look: 'liquid', safety: 'flammable', selection: 'core', status: 'enabled', refs: [PEND, '[DISEÑO] disolvente apolar de composición definida en lugar del éter de petróleo (§3.7)'] },
  petEther: { id: 'petEther', formula: 'mezcla variable', family: 'mixture', phase: 'liquid', densityGml: 0.65, purity: 1, color: 0xfaf8ee, look: 'liquid', safety: 'flammable', selection: 'blocked', status: 'pending', refs: ['Sin ficha de composición: bloqueado (S14)'] },
};

/** Conductividad molar límite de cada ion a 25 °C (S·m²/mol, por mol de ION). §8.2 y §8.5 — `[PENDIENTE]`. */
export const LAMBDA0: Record<IonId, number> = {
  'Na+': 0.005011,
  'K+': 0.00735,
  'Cu2+': 0.01072,
  'H3O+': 0.03496,
  'Cl-': 0.007634,
  'SO4_2-': 0.01596,
  'HCO3-': 0.00445,
  'CH3COO-': 0.00409,
  'OH-': 0.0198,
};

/** Carga de cada ion (para la fuerza iónica y la electroneutralidad). */
export const CHARGE: Record<IonId, number> = { 'Na+': 1, 'K+': 1, 'Cu2+': 2, 'H3O+': 1, 'Cl-': -1, 'SO4_2-': -2, 'HCO3-': -1, 'CH3COO-': -1, 'OH-': -1 };

export const isLiquid = (id: MaterialId) => MATERIALS[id].phase === 'liquid';
export const isSolvent = (id: MaterialId) => id === 'water' || id === 'heptane';
/** ¿La ficha está completa y se puede simular en el modo actual? */
export const usable = (id: MaterialId, allowRestricted = false) => MATERIALS[id].status === 'enabled' || (allowRestricted && MATERIALS[id].status === 'restricted');
