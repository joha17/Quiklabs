/**
 * Balances de F08 (§6, `conservation.ts` propio de la práctica):
 * - Masa: sólidos, masas corredizas y pesas de caída no cambian (solo se mudan entre bandeja, eje, gancho y balanza).
 * - Energía: cinética de rotación ½ I ω² (I del eje, del sólido y de las masas corredizas, con el teorema de Steiner),
 *   cinética de la masa colgante ½ m v² y su potencial m g z. Roce de los rodamientos, desbalance, freno, dedo, roce de
 *   la cuerda inclinada en la polea, aterrizaje de la masa, deslizamiento de una masa corrediza y golpes contra la guarda
 *   son energía DISIPADA; la mano (enrollar, girar, empujar, colgar) es trabajo EXTERNO. E + E_disipada − W_externo ≈ 0.
 * - Momento angular: sin torques externos (cuerda floja, sin roce) I ω se conserva cuando una masa corrediza se aleja.
 */
import type { DropId, F08World, SlideId, SolidId, SolidSpec } from './types';
import { GEOF08 } from './geometry';

export const SOLIDS: SolidId[] = ['disc01', 'ring01', 'bar01'];
export const SLIDES: SlideId[] = ['slide1', 'slide2'];
export const DROPS: DropId[] = ['drop20', 'drop50', 'drop100'];
/** Medio ancho radial de una masa corrediza (m). */
export const SLIDE_HALF = 0.02;

export function solidSpec(w: F08World, id: SolidId): SolidSpec {
  const p = w.params;
  if (id === 'disc01') return { M: p.disc.M, R: p.disc.R, Icm: 0.5 * p.disc.M * p.disc.R ** 2, reach: p.disc.R };
  if (id === 'ring01') return { M: p.ring.M, R: p.ring.R, Icm: p.ring.M * p.ring.R ** 2, reach: p.ring.R };
  return { M: p.bar.M, R: p.bar.L, Icm: (p.bar.M * p.bar.L ** 2) / 12, reach: p.bar.L / 2 };
}

/** ¿Las masas corredizas giran con el rotor? (solo con la barra acoplada). */
export const slidesOnRotor = (w: F08World) => w.rotor.solid === 'bar01' && SLIDES.every((s) => w.objects[s]?.support === 'bar01');

/** Distancia del centro del sólido al eje (m): agujero elegido más la holgura de montaje. */
export const axisOffset = (w: F08World) => Math.hypot(w.rotor.hole, w.rotor.ecc);

/** Momento de inercia total del rotor respecto del eje (kg·m²). */
export function rotorI(w: F08World): number {
  const p = w.params;
  let I = p.I0;
  const id = w.rotor.solid;
  if (id) {
    const s = solidSpec(w, id);
    I += s.Icm + s.M * axisOffset(w) ** 2;
    if (slidesOnRotor(w)) for (const k of SLIDES) I += p.slideKg * w.slides[k].r ** 2;
  }
  return I;
}

/** Desbalance |Σ m r⃗| del rotor (kg·m): masas corredizas desiguales y sólido fuera del eje. */
export function imbalance(w: F08World): number {
  const p = w.params;
  const id = w.rotor.solid;
  if (!id) return 0;
  const d = solidSpec(w, id).M * axisOffset(w);
  const sl = slidesOnRotor(w) ? p.slideKg * (w.slides.slide1.r - w.slides.slide2.r) : 0;
  return Math.abs(d) + Math.abs(sl);
}

/** Alcance máximo del rotor (m), para la guarda. */
export function rotorReach(w: F08World): number {
  const id = w.rotor.solid;
  if (!id) return GEOF08.table.r / 100;
  const s = solidSpec(w, id);
  let r = s.reach + axisOffset(w);
  if (slidesOnRotor(w)) r = Math.max(r, ...SLIDES.map((k) => w.slides[k].r + SLIDE_HALF));
  return r;
}

export const dropKgF8 = (w: F08World, id: DropId | null) => (id ? w.params.dropKg[id] ?? 0 : 0);

/** Radio efectivo de enrollamiento (m): con vueltas superpuestas la cuerda monta sobre sí misma. */
export const effectiveR = (w: F08World) => w.string.drumR + (w.string.turns > w.params.layerTurns ? w.params.stringDr : 0);

/** Altura de la base de la masa colgante (cm de la sala). */
export const massZ = (w: F08World) => w.string.z0 - w.string.y * 100;

export function mechanicalEnergyJ(w: F08World): number {
  const s = w.string;
  let E = 0.5 * rotorI(w) * w.rotor.omega ** 2;
  if (s.mass) {
    const m = dropKgF8(w, s.mass);
    E += 0.5 * m * s.v * s.v + m * w.params.g * (massZ(w) / 100);
  }
  return E;
}

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F08World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

/** Momento angular del rotor (kg·m²/s). */
export const angularMomentum = (w: F08World) => rotorI(w) * w.rotor.omega;

export function massesTotalG(w: F08World): number {
  const p = w.params;
  return (p.disc.M + p.ring.M + p.bar.M + 2 * p.slideKg + Object.values(p.dropKg).reduce((s, x) => s + x, 0)) * 1000;
}

export function conservedTotalsF08(w: F08World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}
