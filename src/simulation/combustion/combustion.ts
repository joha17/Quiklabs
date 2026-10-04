/**
 * Dominio de combustión (Práctica 3, §6.4–6.7): aireación, régimen y geometría de la llama, productos con
 * conservación elemental, campo de temperatura ligado a la geometría y espectro base de la llama.
 * Modelo cualitativo con soporte cuantitativo: conserva causalidad y tendencias, no resuelve cinética ni CFD.
 */
import { clamp } from '../core/math';
import { addComponents, addScaled, emptySpectrum, planckSpectrum, type SpectralComponent, type Spectrum } from '../spectroscopy/spectrum';

export type FuelId = 'PROPANE' | 'BUTANE';

export interface FuelProfile {
  id: FuelId;
  formula: string;
  /** Átomos de C y H por molécula. */
  c: number;
  h: number;
  /** Poder calorífico inferior (kJ/mol, H₂O gaseosa). */
  lhvKjMol: number;
}

export const FUELS: Record<FuelId, FuelProfile> = {
  PROPANE: { id: 'PROPANE', formula: 'C₃H₈', c: 3, h: 8, lhvKjMol: 2043 },
  BUTANE: { id: 'BUTANE', formula: 'C₄H₁₀', c: 4, h: 10, lhvKjMol: 2657 },
};

/** Entalpías usadas para descontar la energía no liberada (kJ/mol). */
const CO_TO_CO2_KJ = 283.0;
const C_TO_CO2_KJ = 393.5;
/** Volumen molar del gas (mL/mol, 25 °C). */
export const MOLAR_VOLUME_ML = 24450;

export type FlameRegime = 'YELLOW' | 'TRANSITIONAL' | 'BLUE' | 'LIFTED' | 'FLASHBACK';

export interface CombustionParams {
  /** Caudal máximo de gas con todas las válvulas abiertas (mL/s). */
  nominalMaxFlowMlS: number;
  /** Eficiencia de admisión del collar de aire (calibra `airMix`). */
  intakeEfficiency: number;
  /** Umbrales de régimen de `airMix` (§6.4, configurables). */
  yellowMax: number;
  transitionalMax: number;
  blueMax: number;
  /** Flujo normalizado por debajo del cual la llama no se sostiene. */
  minFlow: number;
  /** Flashback: aire excesivo con flujo bajo. */
  flashbackAirMix: number;
  flashbackMaxFlow: number;
  /** Llama levantada: aire excesivo con flujo medio/alto, o flujo muy alto. */
  liftAirMix: number;
  liftMinFlow: number;
  liftHighFlow: number;
  /** Fracción del carbono no oxidado a CO₂ que se separa como hollín en llama luminosa. */
  sootShare: number;
}

/** Forma de la llama (lo que necesitan el campo térmico, el render y el espectro). */
export interface FlameShape {
  heightCm: number;
  innerConeHeightCm: number;
  /** Radio máximo (cm). */
  radiusCm: number;
  /** 0 = amarilla luminosa, 1 = azul de dos conos (continuo). */
  blueness: number;
  /** Luminosidad por hollín incandescente (0–1). */
  luminosity: number;
  maxTempC: number;
  /** Separación de la base respecto de la boca (llama levantada). */
  liftGapCm: number;
  /** Llama dentro del cañón (retroceso). */
  flashback: boolean;
}

export interface FlameState extends FlameShape {
  isLit: boolean;
  /** Flujo normalizado 0–1 que llega a la boca. */
  fuelFlow: number;
  airMix: number;
  stability: number;
  regime: FlameRegime;
  sootRateMgS: number;
  coRateMgS: number;
  /** Fracción del carbono que termina como CO₂. */
  completeFraction: number;
  heatW: number;
  temperatureFieldId: string;
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** §6.4 — índice normalizado de aireación (no es una medida estequiométrica absoluta). */
export function computeAirMix(airCollar: number, gasFlow: number, draftFactor: number, p: CombustionParams): number {
  return clamp((draftFactor * airCollar * p.intakeEfficiency) / Math.max(gasFlow, 0.05), 0, 1.4);
}

/** Azulado continuo (0 amarilla → 1 azul). */
export function bluenessOf(airMix: number, p: CombustionParams): number {
  return smooth(p.yellowMax * 0.8, p.transitionalMax * 1.1, airMix);
}

export function regimeOf(airMix: number, gasFlow: number, p: CombustionParams): FlameRegime {
  if (airMix > p.flashbackAirMix && gasFlow < p.flashbackMaxFlow) return 'FLASHBACK';
  if ((airMix > p.liftAirMix && gasFlow >= p.liftMinFlow) || (gasFlow > p.liftHighFlow && airMix > 0.55)) return 'LIFTED';
  if (airMix < p.yellowMax) return 'YELLOW';
  if (airMix < p.transitionalMax) return 'TRANSITIONAL';
  return 'BLUE';
}

/** Fracción del carbono oxidada a CO₂: incluso con el collar cerrado, la llama de difusión quema con aire ambiente. */
export function completeFraction(airMix: number, p: CombustionParams): number {
  return 0.55 + 0.43 * bluenessOf(airMix, p);
}

export interface Products {
  fuelMolS: number;
  o2MolS: number;
  co2MolS: number;
  coMolS: number;
  sootMolS: number;
  h2oMolS: number;
  heatW: number;
}

/**
 * §6.6 — Reparto de productos según el aire disponible, con conservación elemental exacta:
 * C: c·n = CO₂ + CO + C(s) · H: h·n = 2·H₂O · O: 2·O₂ = 2·CO₂ + CO + H₂O.
 */
export function combustionProducts(fuel: FuelProfile, fuelMolS: number, airMix: number, p: CombustionParams): Products {
  const cf = completeFraction(airMix, p);
  const lum = 1 - bluenessOf(airMix, p);
  const carbon = fuel.c * fuelMolS;
  const co2 = carbon * cf;
  const soot = carbon * (1 - cf) * p.sootShare * lum;
  const co = carbon - co2 - soot;
  const h2o = (fuel.h / 2) * fuelMolS;
  const o2 = co2 + co / 2 + h2o / 2;
  const heatKjS = fuel.lhvKjMol * fuelMolS - co * CO_TO_CO2_KJ - soot * C_TO_CO2_KJ;
  return { fuelMolS, o2MolS: o2, co2MolS: co2, coMolS: co, sootMolS: soot, h2oMolS: h2o, heatW: heatKjS * 1000 };
}

/** §6.5 — altura (responde sobre todo al gas y en segundo lugar al aire) y forma de los conos. */
export function flameShape(gasFlow: number, airMix: number, stability: number, regime: FlameRegime, p: CombustionParams): FlameShape {
  const b = bluenessOf(airMix, p);
  const stabilityFactor = (1 - 0.25 * b) * (0.85 + 0.15 * stability);
  const flashback = regime === 'FLASHBACK';
  const heightCm = flashback ? 0 : clamp(2 + 15 * Math.sqrt(gasFlow) * stabilityFactor, 0, 18);
  const innerConeHeightCm = heightCm * (0.12 + 0.2 * b);
  const radiusCm = 0.75 + 0.06 * heightCm * (1 - 0.35 * b);
  return {
    heightCm,
    innerConeHeightCm,
    radiusCm,
    blueness: b,
    luminosity: 1 - smooth(p.yellowMax * 0.8, p.transitionalMax, airMix),
    maxTempC: 950 + 250 * b,
    liftGapCm: regime === 'LIFTED' ? 1.2 + 1.5 * clamp(airMix - 1, 0, 0.4) / 0.4 : 0,
    flashback,
  };
}

/** Radio exterior de la llama a la altura z sobre la base (cm). */
export function outerRadiusAt(f: FlameShape, z: number): number {
  const H = f.heightCm;
  if (H <= 0 || z < 0 || z > H) return 0;
  const zr = 0.3 * H;
  if (z < zr) return f.radiusCm * (0.62 + 0.38 * Math.sqrt(z / zr));
  return f.radiusCm * Math.max(0, 1 - ((z - zr) / (H - zr)) ** 1.6);
}

/** Radio del cono interno (cm). */
export function innerRadiusAt(f: FlameShape, z: number, mouthR = 0.55): number {
  const h = f.innerConeHeightCm;
  if (h <= 0 || z < 0 || z > h) return 0;
  return mouthR * (1 - z / h);
}

/** Altura del punto más caliente: algo por encima de la punta del cono interno en llama azul (§6.7). */
export function hottestZ(f: FlameShape): number {
  return f.innerConeHeightCm * 1.15 * f.blueness + 0.55 * f.heightCm * (1 - f.blueness);
}

/**
 * §6.7 — Temperatura local (°C) en un punto relativo a la boca del mechero: r = distancia horizontal al eje,
 * z = altura sobre la boca. Zona interna fría, frente del cono interno, máximo cerca de su punta,
 * cono externo oxidante caliente y enfriamiento en la periferia y la punta.
 */
export function flameTemperatureAt(f: FlameShape | null, r: number, zMouth: number, ambientC: number): number {
  if (!f) return ambientC;
  if (f.flashback) {
    // Retroceso: arde dentro del cañón; solo la boca se calienta.
    return ambientC + 260 * Math.exp(-Math.hypot(r, zMouth) / 1.2);
  }
  const H = f.heightCm;
  if (H <= 0) return ambientC;
  const z = zMouth - f.liftGapCm;
  const zStar = Math.max(0.3, hottestZ(f));
  const Tmax = f.maxTempC;
  const bodyT = (zz: number) => {
    if (zz <= zStar) return Tmax * (0.8 + 0.2 * (zz / zStar));
    const u = (zz - zStar) / Math.max(0.1, H - zStar);
    return Tmax * (1 - 0.38 * u * u);
  };
  if (z < 0) {
    // Por debajo de la base (boca o hueco de la llama levantada): gas frío que sale.
    return ambientC + (bodyT(0) - ambientC) * 0.25 * Math.exp(z / 0.8) * Math.exp(-r / 1.2);
  }
  if (z <= H) {
    const R = Math.max(0.05, outerRadiusAt(f, z));
    if (r <= R) {
      const ri = innerRadiusAt(f, z);
      if (r < ri) {
        // Zona interna oscura: mezcla sin reaccionar (500–900 °C hacia la punta del cono).
        const inner = 350 + 550 * (z / Math.max(0.1, f.innerConeHeightCm));
        return inner * f.blueness + bodyT(z) * (1 - f.blueness) * 0.85;
      }
      return bodyT(z) * (1 - 0.15 * (r / R) ** 2);
    }
    const edge = bodyT(z) * 0.85;
    return ambientC + (edge - ambientC) * Math.exp(-(r - R) / 0.8);
  }
  // Penacho caliente sobre la punta.
  const tip = bodyT(H) * 0.85;
  const dz = z - H;
  const w = 0.8 + 0.12 * dz;
  return ambientC + (tip - ambientC) * Math.exp(-dz / 5) * Math.exp(-(r * r) / (2 * w * w));
}

/** ¿El punto está dentro de la llama visible? (devuelve 0–1: fracción de contacto). */
export function flameContact(f: FlameShape | null, r: number, zMouth: number): number {
  if (!f || f.flashback || f.heightCm <= 0) return 0;
  const z = zMouth - f.liftGapCm;
  if (z < 0 || z > f.heightCm) return 0;
  const R = outerRadiusAt(f, z);
  if (R <= 0) return 0;
  return clamp(1.25 - r / R, 0, 1);
}

/** Excitación de la emisión de una muestra según la temperatura local (0 en zonas frías, 1 en la región óptima). */
export function excitation(tempC: number): number {
  return smooth(620, 1150, tempC);
}

/**
 * Espectro base de la llama: quimioluminiscencia de CH* y C₂ (azul) + continuo del hollín incandescente (amarilla).
 * Escalado por el flujo (más gas = más luz).
 */
export function baseFlameSpectrum(f: FlameShape, fuelFlow: number, blueComponents: readonly SpectralComponent[]): Spectrum {
  const s = emptySpectrum();
  if (f.flashback || f.heightCm <= 0) return s;
  const scale = 0.4 + 0.8 * Math.sqrt(fuelFlow);
  addComponents(s, blueComponents, 0.02 * scale * (0.35 + 0.65 * f.blueness));
  if (f.luminosity > 0.001) addScaled(s, planckSpectrum(2300), 0.012 * scale * f.luminosity);
  return s;
}
