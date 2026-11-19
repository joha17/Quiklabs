/**
 * Balances de F09 (§6, `conservation.ts` propio de la práctica):
 * - Masa: masa orbitante y masas radiales no cambian (solo se mudan entre guía, barra, estante y balanza).
 * - Energía: cinética de rotación ½ I ω² con I = I₀ + m_o r_o² + Σ m r² (masas puntuales en su centro). Roce del eje,
 *   del freno, por desbalance y por inclinación, golpes y la salida de la masa son energía DISIPADA; el motor, el
 *   dinamómetro, el cordón central y las manos hacen trabajo EXTERNO. E + E_disipada − W_externo ≈ 0.
 * - Momento angular: sin torque externo (motor desacoplado, freno suelto, cordón del tambor libre) I ω se conserva
 *   cuando el cordón central acerca las masas; la energía cinética aumenta en el trabajo del cordón.
 */
import type { F09World, SlideId } from './types';

export const SLIDES: SlideId[] = ['slide1', 'slide2'];
export const MASSES = ['orbit01', 'slide1', 'slide2'] as const;

/** ¿La masa orbitante está en la guía (gira con la mesa)? */
export const orbitOnGuide = (w: F09World) => w.objects.orbit01?.support === 'guide' && !w.orbit.off;
/** ¿Esta masa radial está en la barra? */
export const slideOnBar = (w: F09World, id: SlideId) => w.objects[id]?.support === 'bar';

/** Momento de inercia total de la mesa respecto del eje (kg·m²). */
export function rotorI(w: F09World): number {
  const p = w.params;
  let I = p.I0;
  if (orbitOnGuide(w)) I += p.orbitKg * w.orbit.r ** 2;
  for (const k of SLIDES) if (slideOnBar(w, k)) I += p.slideKg * w.slides[k].r ** 2;
  return I;
}

/** Desbalance |Σ m r⃗| (kg·m): la masa orbitante va a lo largo de +x local y las masas radiales a ±y local. */
export function imbalance(w: F09World): number {
  const p = w.params;
  const ux = orbitOnGuide(w) ? p.orbitKg * w.orbit.r : 0;
  const s1 = slideOnBar(w, 'slide1') ? p.slideKg * w.slides.slide1.r : 0;
  const s2 = slideOnBar(w, 'slide2') ? p.slideKg * w.slides.slide2.r : 0;
  return Math.hypot(ux, s1 - s2);
}

/** Asimetría de las masas gemelas (m). */
export const slideAsymmetry = (w: F09World) => Math.abs(w.slides.slide1.r - w.slides.slide2.r);

export function mechanicalEnergyJ(w: F09World): number {
  return 0.5 * rotorI(w) * w.rotor.omega ** 2;
}

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F09World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

/** Momento angular de la mesa (kg·m²/s). */
export const angularMomentum = (w: F09World) => rotorI(w) * w.rotor.omega;

/** Tensión centrípeta verdadera del cordón de la masa orbitante (N): T = m ω² r. */
export const centripetalN = (w: F09World) => (orbitOnGuide(w) ? w.params.orbitKg * w.rotor.omega ** 2 * w.orbit.r : 0);

export const massesTotalG = (w: F09World) => (w.params.orbitKg + 2 * w.params.slideKg) * 1000;

export function conservedTotalsF09(w: F09World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}
