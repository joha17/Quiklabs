import type { SubstanceId, SubstanceTable } from '../substances/types';
import type { SimParams, Vessel } from '../entities/types';
import { capacityG } from './solubility';
import { sanitize } from './mixture';
import { clamp } from '../core/math';

/**
 * §4.5 — Disolución cinética de sólidos solubles (y redisolución de cristales).
 * velocidad = k · f(agitación) · f(T) · f(tamaño) · (masa sólida + cola) · déficit
 * Nunca transfiere más de lo disponible ni supera la saturación.
 */
export function stepDissolution(v: Vessel, dt: number, subs: SubstanceTable, p: SimParams, kineticsJitter: number): void {
  const m = v.mix;
  if (m.waterG <= 0) return;
  const T = v.temperatureC;
  const agit = p.restDissolveFactor + (1 - p.restDissolveFactor) * clamp(v.agitation, 0, 1);
  const fT = Math.exp((T - 25) / p.dissolveTempScaleC);
  for (const k of Object.keys(m.solid) as SubstanceId[]) {
    const def = subs[k];
    if (def.waterBehavior !== 'SOLUBLE') continue;
    const solidG = m.solid[k] ?? 0;
    if (solidG <= 0) continue;
    const cap = capacityG(def, T, m.waterG);
    const dissolved = m.dissolved[k] ?? 0;
    const deficit = cap - dissolved;
    if (deficit <= 0) continue;
    const deficitFrac = clamp(deficit / Math.max(cap, 1e-9), 0, 1);
    const sizeF = 300 / Math.max(50, def.particle.sizeUm);
    const rate = def.dissolveRate * kineticsJitter * agit * fT * Math.sqrt(sizeF) * (solidG + 0.02) * deficitFrac;
    const amount = Math.min(rate * dt, solidG, deficit);
    m.solid[k] = solidG - amount;
    m.dissolved[k] = dissolved + amount;
  }
  // Redisolución de cristales de KNO₃ cuando la disolución está insaturada.
  if (m.crystals && m.crystals.massG > 0) {
    const cap = capacityG(subs.KNO3, T, m.waterG);
    const dissolved = m.dissolved.KNO3 ?? 0;
    const deficit = cap - dissolved;
    if (deficit > 0) {
      const deficitFrac = clamp(deficit / Math.max(cap, 1e-9), 0, 1);
      const rate = subs.KNO3.dissolveRate * agit * fT * (m.crystals.massG + 0.02) * deficitFrac;
      const amount = Math.min(rate * dt, m.crystals.massG, deficit);
      m.crystals.massG -= amount;
      m.dissolved.KNO3 = dissolved + amount;
    }
  }
  sanitize(m);
}

/**
 * Dinámica de suspensión/sedimentación y emulsión del aceite.
 * La agitación pone partículas en suspensión; en reposo sedimentan con su constante propia.
 * La emulsión del aceite se rompe en reposo (nunca se convierte en disolución, §4.2).
 */
export function stepSuspension(v: Vessel, dt: number, subs: SubstanceTable): void {
  const m = v.mix;
  const a = clamp(v.agitation, 0, 1);
  const hasLiquid = m.waterG > 0.01;
  for (const k of Object.keys(m.solid) as SubstanceId[]) {
    const def = subs[k];
    const s = m.suspended[k] ?? 0;
    if (!hasLiquid) {
      m.suspended[k] = 0;
      continue;
    }
    // Los trozos densos (Zn) apenas se levantan; los polvos finos forman nube.
    const lift = def.particle.kind === 'CHUNK' ? 0.15 : def.particle.kind === 'CRYSTAL' ? 0.6 : 1.0;
    const up = a * 3 * lift * (1 - s);
    const down = def.particle.settleRate * s * (1 - a * 0.9);
    m.suspended[k] = clamp(s + (up - down) * dt, 0, lift);
  }
  if (m.emulsion > 0 || a > 0) {
    const oil = Object.values(m.oil).reduce((x, y) => x + (y ?? 0), 0);
    if (oil > 0 && hasLiquid) {
      const up = a * 2.5 * (1 - m.emulsion);
      const down = 0.06 * m.emulsion * (1 - a);
      m.emulsion = clamp(m.emulsion + (up - down) * dt, 0, 1);
    } else m.emulsion = 0;
  }
}
