/**
 * Cinética CURRICULAR de la Práctica 8 (§6.2, §6.3), con una sola convención de unidades: concentraciones en mol/L,
 * k en L/(mol·s), r en mol/(L·s), dξ/dt = r·V_mezcla en mol/s.
 *
 *   Fischer (ISO, MS):  r = k_f(T)·c_ácido·c_alcohol − k_r(T)·c_éster·c_agua,   K_eq = k_f/k_r (no depende del catalizador)
 *   Acetilación (ASA):  r = k_ac(T, cat)·c_SA·c_AA       Hidrólisis del anhídrido:  r = k_h(T)·c_AA·c_H2O
 *   Arrhenius:          k(T) = k_ref·exp[−Ea/R·(1/T − 1/T_ref)]
 *
 * Todos los k_ref, Ea y K_eq son valores DIDÁCTICOS `[PENDIENTE]` elegidos para que la experiencia dure lo previsto;
 * deben reemplazarse por datos de literatura o calibración (§7, `scientificModel: 'curricular-calibrated'`).
 */
export const R_GAS = 8.314;
export const T_REF_K = 298.15;

export interface ArrheniusSpec {
  kRef: number;
  eaJmol: number;
}

export const arrhenius = (k: ArrheniusSpec, tK: number) => k.kRef * Math.exp((-k.eaJmol / R_GAS) * (1 / tK - 1 / T_REF_K));

export const KINETICS = {
  scientificModel: 'curricular-calibrated' as const,
  /** Fischer del acetato de isoamilo: K_eq ≈ 4 (didáctico, del orden de las esterificaciones de Fischer). */
  ISO: { forward: { kRef: 8.0e-6, eaJmol: 60000 }, keq: 4.0, uncatalyzedFactor: 0.02 },
  /** Fischer del salicilato de metilo: K_eq ≈ 3 (didáctico). */
  MS: { forward: { kRef: 1.0e-5, eaJmol: 60000 }, keq: 3.0, uncatalyzedFactor: 0.02 },
  /** Acetilación del ácido salicílico, con ácido fosfórico como catalizador. */
  ASA: { forward: { kRef: 2.5e-5, eaJmol: 55000 }, uncatalyzedFactor: 0.12 },
  /** Hidrólisis del anhídrido acético (compite por el anhídrido). */
  hydrolysis: { kRef: 2.2e-4, eaJmol: 45000 },
  /** Neutralización con bicarbonato en el lavado: rápida mientras se agita. */
  neutralization: { kPerS: 0.6 },
};

/** Factor de catalizador: con ≥ 1 % molar del catalizador asignado, 1; sin él, el factor no catalizado. */
export function catalystFactor(catalystMol: number, limitingMol: number, uncatalyzed: number): number {
  if (limitingMol <= 0) return uncatalyzed;
  const ratio = catalystMol / limitingMol;
  return uncatalyzed + (1 - uncatalyzed) * Math.min(1, ratio / 0.01);
}

/** Velocidad de Fischer (mol/(L·s)): positiva hacia el éster. */
export function fischerRate(route: 'ISO' | 'MS', tK: number, cAcid: number, cAlcohol: number, cEster: number, cWater: number, catFactor: number): number {
  const p = KINETICS[route];
  const kf = arrhenius(p.forward, tK) * catFactor;
  const kr = kf / p.keq;
  return kf * cAcid * cAlcohol - kr * cEster * cWater;
}

export function acetylationRate(tK: number, cSA: number, cAA: number, catFactor: number): number {
  return arrhenius(KINETICS.ASA.forward, tK) * catFactor * cSA * cAA;
}

export function hydrolysisRate(tK: number, cAA: number, cWater: number): number {
  return arrhenius(KINETICS.hydrolysis, tK) * cAA * cWater;
}

/** Fracción de conversión del limitante en el equilibrio de Fischer (para pruebas y para el docente). */
export function fischerEquilibriumConversion(keq: number, nAcid: number, nAlcohol: number, nEster0 = 0, nWater0 = 0): number {
  // Resolver K = (E0+x)(W0+x)/((A−x)(B−x)) por bisección en [0, min(A,B)].
  const lim = Math.min(nAcid, nAlcohol);
  let lo = 0;
  let hi = lim;
  for (let i = 0; i < 80; i++) {
    const x = (lo + hi) / 2;
    const q = ((nEster0 + x) * (nWater0 + x)) / Math.max(1e-30, (nAcid - x) * (nAlcohol - x));
    if (q > keq) hi = x;
    else lo = x;
  }
  return lim > 0 ? (lo + hi) / 2 / lim : 0;
}
