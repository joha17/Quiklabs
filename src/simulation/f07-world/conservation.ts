/**
 * Balances de F07 (§6, `conservation.ts` propio de la práctica):
 * - Masa: carros y pesas adicionales no cambian (solo se mudan entre estante, carros y balanza).
 * - Momento lineal: las fuerzas de contacto entre los carros son iguales y opuestas, así que Σ m v solo cambia por el
 *   impulso EXTERNO (roces, pendiente del riel, topes, rieles laterales, la mano y los lanzadores). En todo instante
 *   Σp − J_externo se conserva (la prueba lo comprueba durante el choque).
 * - Energía: cinética de los carros, elástica del paragolpes comprimido y de los lanzadores trabados y potencial de la
 *   pendiente. Roces, amortiguación del paragolpes, velcro y topes son energía DISIPADA; la mano (trabar, empujar,
 *   levantar) es trabajo EXTERNO. E_mecánica + E_disipada − W_externo ≈ 0 (error del integrador).
 */
import type { CartId, F07World } from './types';
import { CART_A_START, CART_B_LAUNCH, CONTACT_D, GEOF07 } from './geometry';

export const CARTS: CartId[] = ['cartA', 'cartB'];

export function cartLoadKg(w: F07World, cart: CartId): number {
  let m = 0;
  for (const [id, o] of Object.entries(w.objects)) if (o.kind === 'cartMass' && o.support === cart) m += w.params.cartMassKg[id] ?? 0;
  return m;
}

/** Masa del carro con sus pesas (kg). */
export const cartKgF7 = (w: F07World, cart: CartId) => (cart === 'cartA' ? w.params.m1 : w.params.m2) + cartLoadKg(w, cart);

/** Rigidez del émbolo de cada lanzador (N/m): da la rapidez de referencia v₁ (o |v₂|) al carro sin carga en la muesca de 3 cm. */
export function launcherK(w: F07World, cart: CartId): number {
  const p = w.params;
  const m = cart === 'cartA' ? p.m1 : p.m2;
  const v = cart === 'cartA' ? p.v1 : Math.max(0.3, Math.abs(p.v2));
  return (m * v * v) / (GEOF07.launcher.refComp * GEOF07.launcher.refComp);
}

/** Amortiguación (N·s/m) del paragolpes que da la restitución e para la masa reducida μ. */
export function dampingFor(k: number, mu: number, e: number): number {
  if (e >= 1) return 0;
  const l = Math.log(Math.max(1e-4, e));
  const zeta = -l / Math.sqrt(Math.PI * Math.PI + l * l);
  return 2 * zeta * Math.sqrt(k * mu);
}

export interface ContactModel {
  /** Compresión del paragolpes duro (m), del campo de los imanes (m), rigideces y amortiguación. */
  delta: number;
  deltaM: number;
  k: number;
  kM: number;
  c: number;
  /** El paragolpes se pega al llegar a la compresión máxima (velcro fijado o imanes atrayéndose). */
  sticks: boolean;
}

/** Modelo del contacto para la separación actual (null si los carros no interactúan). */
export function contactModel(w: F07World): ContactModel | null {
  const A = w.carts.cartA;
  const B = w.carts.cartB;
  const bp = w.bumper;
  if (A.on !== 'track' || B.on !== 'track' || bp.joined) return null;
  const p = w.params;
  const d = B.s - A.s;
  const delta = CONTACT_D - d;
  const magnet = bp.type === 'magnet' && bp.polarityOk;
  const range = magnet ? p.magnetRangeM : 0;
  if (delta <= -range) return null;
  const mA = cartKgF7(w, 'cartA');
  const mB = cartKgF7(w, 'cartB');
  const mu = (mA * mB) / (mA + mB);
  const sticks = (bp.type === 'velcro' && bp.velcroFixed) || (bp.type === 'magnet' && !bp.polarityOk);
  const e = bp.type === 'velcro' ? (bp.velcroFixed ? 0.1 : p.looseVelcroE) : bp.type === 'magnet' && !bp.polarityOk ? 0.1 : p.e;
  const k = p.contactK;
  const kM = magnet ? p.contactK * p.magnetFactor : 0;
  return { delta: Math.max(0, delta), deltaM: magnet ? Math.max(0, delta + range) : 0, k, kM, c: dampingFor(magnet ? kM : k, mu, e), sticks };
}

/** Fuerza de contacto sobre B (N, + hacia la derecha; sobre A es la opuesta) y energía elástica guardada (J). */
export function contactForce(w: F07World, m: ContactModel | null = contactModel(w)): { F: number; U: number; Fel: number } {
  if (!m || (m.delta <= 0 && m.deltaM <= 0)) return { F: 0, U: 0, Fel: 0 };
  const rate = w.carts.cartA.v - w.carts.cartB.v;
  const Fel = m.k * m.delta + m.kM * m.deltaM;
  const F = Math.max(0, Fel + m.c * rate);
  return { F, U: 0.5 * m.k * m.delta * m.delta + 0.5 * m.kM * m.deltaM * m.deltaM, Fel };
}

/** Compresión del émbolo de un lanzador con el carro trabado (m). */
export function launcherCompression(w: F07World, cart: CartId): number {
  const c = w.carts[cart];
  return c.on === 'track' && c.latched ? c.compression : 0;
}

const sinTilt = (w: F07World) => Math.sin((w.track.baseTiltDeg + w.track.screwDeg) * (Math.PI / 180));

export function cartsEnergyJ(w: F07World): number {
  let E = 0;
  const g = w.params.g;
  for (const id of CARTS) {
    const c = w.carts[id];
    if (c.on !== 'track') continue;
    const m = cartKgF7(w, id);
    // La pendiente: + baja hacia la derecha, la altura del carro es −s sen θ.
    E += 0.5 * m * c.v * c.v - m * g * c.s * sinTilt(w) + 0.5 * launcherK(w, id) * launcherCompression(w, id) ** 2;
  }
  return E + contactForce(w).U;
}

export const mechanicalEnergyJ = cartsEnergyJ;

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F07World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

/** Momento lineal total de los carros sobre el riel (kg·m/s). */
export function totalMomentum(w: F07World): number {
  let p = 0;
  for (const id of CARTS) if (w.carts[id].on === 'track') p += cartKgF7(w, id) * w.carts[id].v;
  return p;
}

/** Posición del centro de masa de los dos carros (m). */
export function centerOfMass(w: F07World): number {
  const mA = cartKgF7(w, 'cartA');
  const mB = cartKgF7(w, 'cartB');
  return (mA * w.carts.cartA.s + mB * w.carts.cartB.s) / (mA + mB);
}

export function massesTotalG(w: F07World): number {
  const p = w.params;
  return (p.m1 + p.m2 + Object.values(p.cartMassKg).reduce((s, x) => s + x, 0)) * 1000;
}

export function conservedTotalsF07(w: F07World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}

export { CART_A_START, CART_B_LAUNCH };
