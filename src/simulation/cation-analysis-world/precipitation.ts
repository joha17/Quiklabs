/**
 * Precipitación selectiva de la Práctica 9 (§3.1, §6.2) en modo CURRICULAR: concentraciones en lugar de actividades
 * (aproximación declarada), sin complejación ni especiación del hierro.
 *
 *   Sr²⁺ + SO₄²⁻ ⇌ SrSO₄(s)          Q = [Sr²⁺][SO₄²⁻]          extensión de equilibrio: (a−ξ)(b−ξ) = Ksp·V²
 *   Fe³⁺ + 3 OH⁻ ⇌ Fe(OH)₃(s)        Q = [Fe³⁺][OH⁻]³           extensión de equilibrio: (f−ξ)(h−3ξ)³ = Ksp·V⁴
 *   H⁺ + OH⁻ → H₂O                   neutralización instantánea (primero se consume la acidez libre)
 *   dξ/dt = k·max(0, 1 − Ksp/Q)·(ξ_eq − ξ)                ley fenomenológica PROVISIONAL (§6.2), con k de params
 *
 * Los Ksp son valores de referencia curriculares `[VALIDAR]` (no se presentan como datos certificados, §7).
 */
import { molAddInto, type Mol, type SpeciesId } from './species';

export interface Reaction {
  id: string;
  nu: Partial<Record<SpeciesId, number>>;
}

export const RX = {
  srso4: { id: 'srso4', nu: { 'Sr2+': -1, 'SO4^2-': -1, 'SrSO4(s)': 1 } },
  feoh3: { id: 'feoh3', nu: { 'Fe3+': -1, 'OH-': -3, 'FeOH3(s)': 1 } },
  neutral: { id: 'neutral', nu: { 'H+': -1, 'OH-': -1, H2O: 1 } },
} satisfies Record<string, Reaction>;

/** Ksp curriculares `[VALIDAR]` (25 °C, concentraciones). */
export const KSP = { srso4: 3.4e-7, feoh3: 2.8e-39 };

/** Aplica Δξ acotado por disponibilidad (nunca deja moles negativos). Devuelve la extensión aplicada. */
export function applyExtent(m: Mol, r: Reaction, dXi: number): number {
  let x = dXi;
  if (x > 0) {
    for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) if (nu < 0) x = Math.min(x, (m[s] ?? 0) / -nu);
  } else if (x < 0) {
    for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) if (nu > 0) x = Math.max(x, -(m[s] ?? 0) / nu);
  }
  if (x === 0) return 0;
  const delta: Mol = {};
  for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) delta[s] = nu * x;
  molAddInto(m, delta);
  for (const [s, n] of Object.entries(m) as Array<[SpeciesId, number]>) if ((n ?? 0) < 0 && (n ?? 0) > -1e-18) delete m[s];
  return x;
}

/** Extensión adicional de equilibrio del SrSO₄ desde el estado actual (negativa si debe disolverse). */
export function srso4EquilibriumShift(sr: number, so4: number, solid: number, volL: number, ksp = KSP.srso4): number {
  const K = ksp * volL * volL;
  // (sr − x)(so4 − x) = K  →  x = [(sr+so4) − √((sr−so4)² + 4K)]/2 ; si x < 0 se disuelve sólido (acotado).
  const x = (sr + so4 - Math.sqrt((sr - so4) ** 2 + 4 * K)) / 2;
  return Math.max(x, -solid);
}

/** Extensión adicional de equilibrio del Fe(OH)₃ (bisección en [−sólido, min(f, h/3)]). */
export function feoh3EquilibriumShift(fe: number, oh: number, solid: number, volL: number, ksp = KSP.feoh3): number {
  const K = ksp * volL ** 4;
  const g = (x: number) => (fe - x) * Math.max(0, oh - 3 * x) ** 3 - K;
  let lo = -solid;
  let hi = Math.min(fe, oh / 3);
  if (hi <= lo) return 0;
  if (g(lo) <= 0) return lo;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Cociente de reacción en concentraciones (mol/L). */
export const qSrSO4 = (m: Mol, volL: number) => ((m['Sr2+'] ?? 0) / volL) * ((m['SO4^2-'] ?? 0) / volL);
export const qFeOH3 = (m: Mol, volL: number) => ((m['Fe3+'] ?? 0) / volL) * ((m['OH-'] ?? 0) / volL) ** 3;

/**
 * Un paso de precipitación en un líquido: neutralización inmediata y aproximación gradual al equilibrio de cada sólido.
 * `mixing` (0–1) modela el gradiente de concentración: sin agitar, la reacción avanza más despacio (E28).
 */
export function stepPrecipitation(liq: Mol, solid: Mol, volL: number, dt: number, kPrecip: number, mixing: number, ksp = KSP): { srMade: number; feMade: number } {
  if (volL < 1e-6) return { srMade: 0, feMade: 0 };
  // Neutralización: la acidez libre consume el álcali antes de que precipite el hierro (E35).
  const n = Math.min(liq['H+'] ?? 0, liq['OH-'] ?? 0);
  if (n > 0) applyExtent(liq, RX.neutral, n);
  const k = kPrecip * (0.2 + 0.8 * Math.max(0, Math.min(1, mixing))) * dt;
  const f = Math.min(1, k);
  let srMade = 0;
  let feMade = 0;
  const sr = srso4EquilibriumShift(liq['Sr2+'] ?? 0, liq['SO4^2-'] ?? 0, solid['SrSO4(s)'] ?? 0, volL, ksp.srso4);
  if (Math.abs(sr) > 1e-15) {
    const q = qSrSO4(liq, volL);
    const drive = sr > 0 ? Math.max(0, 1 - ksp.srso4 / Math.max(q, 1e-300)) : 1;
    srMade = moveSolid(liq, solid, RX.srso4, 'SrSO4(s)', sr * Math.max(f * drive, sr > 0 ? 0 : f));
  }
  const fe = feoh3EquilibriumShift(liq['Fe3+'] ?? 0, liq['OH-'] ?? 0, solid['FeOH3(s)'] ?? 0, volL, ksp.feoh3);
  if (Math.abs(fe) > 1e-15) feMade = moveSolid(liq, solid, RX.feoh3, 'FeOH3(s)', fe * f);
  return { srMade, feMade };
}

/** Aplica la extensión pasando el sólido formado (o disuelto) entre el líquido y el compartimento sólido. */
function moveSolid(liq: Mol, solid: Mol, r: Reaction, solidId: SpeciesId, dXi: number): number {
  const both: Mol = { ...liq, [solidId]: solid[solidId] ?? 0 };
  const x = applyExtent(both, r, dXi);
  const s = both[solidId] ?? 0;
  delete both[solidId];
  for (const k of Object.keys(liq)) delete liq[k as SpeciesId];
  Object.assign(liq, both);
  if (s > 1e-18) solid[solidId] = s;
  else delete solid[solidId];
  return x;
}

/** Casos de §8: extensión máxima cuantitativa ideal (reactivo limitante). */
export const maxExtent = (r: Reaction, m: Mol) =>
  Math.min(...(Object.entries(r.nu) as Array<[SpeciesId, number]>).filter(([, nu]) => nu < 0).map(([s, nu]) => (m[s] ?? 0) / -nu));
