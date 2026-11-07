/**
 * Balances de F102 (§6, `conservation.ts` propio de la práctica): masa total del inventario y energía mecánica del
 * carril y de la torre. Cada gesto de la mano (sostener el carro, cargar el resorte, colgar una masa, soltar un cuerpo)
 * es trabajo EXTERNO; el rozamiento, el arrastre del aire, la cinta y los choques son energía DISIPADA. Con eso, en
 * todo instante: E_mecánica + E_disipada − W_externo = 0 (salvo el error del integrador, que la prueba acota).
 */
import type { F102World } from './types';
import { GEOF102, PULLEY_S } from './geometry';

const DEG = Math.PI / 180;

/** Masa colgante real (kg): portapesas y pesas sobre él, si cuelga del cordel. */
export function hangMassKg(w: F102World): number {
  if (w.objects.hanger01?.support !== 'string') return 0;
  let g = w.masses.hanger01.trueG;
  for (const o of Object.values(w.objects)) if (o.kind === 'slotMass' && o.support === 'hanger01') g += w.masses[o.id].trueG;
  return g / 1000;
}

/** Masa colgante rotulada (g). */
export function hangNominalG(w: F102World): number {
  if (w.objects.hanger01?.support !== 'string') return 0;
  let g = w.masses.hanger01.nominalG;
  for (const o of Object.values(w.objects)) if (o.kind === 'slotMass' && o.support === 'hanger01') g += w.masses[o.id].nominalG;
  return g;
}

/** ¿La masa cuelga del cordel unido al carro? */
export const hanging = (w: F102World) => w.string.attached && w.objects.hanger01?.support === 'string';

/** Profundidad que tendría la masa con el cordel tenso (m bajo el eje de la polea). */
export const tautDepth = (w: F102World, s = w.cart.s) => w.string.lengthM - (PULLEY_S - (s + GEOF102.cart.halfLenM));

export function trackEnergyJ(w: F102World): number {
  const p = w.params;
  const c = w.cart;
  const sin = Math.sin(w.track.angleDeg * DEG);
  let E = 0.5 * c.massKg * c.v * c.v - c.massKg * p.g * c.s * sin;
  const rear = c.s - GEOF102.cart.halfLenM;
  if (w.launcher.latched) E += 0.5 * p.launcherKNPerM * (w.launcher.notchCm / 100) ** 2;
  else if (rear < 0) E += 0.5 * p.launcherKNPerM * rear * rear;
  if (hanging(w)) {
    const m = hangMassKg(w);
    E += 0.5 * m * w.string.vd * w.string.vd - m * p.g * w.string.depth;
    if (w.string.taut) E += 0.5 * p.pulleyEqKg * c.v * c.v;
  }
  return E;
}

export function fallEnergyJ(w: F102World): number {
  const b = w.fall;
  if (!b || b.landed) return 0;
  return 0.5 * b.massKg * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) + b.massKg * w.params.g * b.z;
}

export const mechanicalEnergyJ = (w: F102World) => trackEnergyJ(w) + fallEnergyJ(w);

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F102World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

export const massesTotalG = (w: F102World) => Object.values(w.masses).reduce((s, m) => s + m.trueG, 0) + Object.values(w.filters).reduce((s, f) => s + f.massKg * 1000, 0);

export function conservedTotalsF102(w: F102World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}
