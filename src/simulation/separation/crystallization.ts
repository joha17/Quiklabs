import type { SubstanceTable } from '../substances/types';
import type { CrystPhase, CrystalPopulation, SimParams, Vessel } from '../entities/types';
import { capacityG } from '../solutions/solubility';
import { sanitize } from '../solutions/mixture';
import { clamp } from '../core/math';

const KNO3_MASS_PER_MM3 = 0.00211; // g por mm³ de cristal (ρ = 2,11 g/cm³)

/** Velocidad de enfriamiento (°C/s) que se considera "brusca" (pureza mínima, cristales pequeños). */
const FAST_COOLING_C_PER_S = 0.4;

export interface CrystContext {
  evaporating: boolean;
  timeS: number;
  /** Factor reproducible (semilla) para el número de núcleos. */
  nucleiJitter: number;
}

/** Diagnóstico del estado de cristalización (§4.7). */
export function crystallizationPhase(v: Vessel, subs: SubstanceTable, evaporating: boolean): CrystPhase {
  const m = v.mix;
  const dissolved = m.dissolved.KNO3 ?? 0;
  const crystals = m.crystals?.massG ?? 0;
  if (m.waterG <= 0) return crystals > 0 ? 'EQUILIBRATED' : 'DILUTE';
  const cap = capacityG(subs.KNO3, v.temperatureC, m.waterG);
  const S = cap > 0 ? dissolved / cap : Infinity;
  if (crystals > 1e-5) return S > 1.03 ? 'CRYSTAL_GROWTH' : 'EQUILIBRATED';
  if (S > 1.02) return v.cryst.nucleationProgress > 0.05 ? 'NUCLEATING' : 'SUPERSATURATED';
  if (S >= 0.97) return 'SATURATED';
  if (evaporating) return 'CONCENTRATING';
  return S < 0.5 ? 'DILUTE' : 'UNSATURATED';
}

function sizeFromMass(massG: number, nuclei: number): number {
  return Math.cbrt(Math.max(massG, 1e-9) / Math.max(nuclei, 1) / KNO3_MASS_PER_MM3);
}

/**
 * §4.7 — Nucleación con demora reproducible + crecimiento cinético.
 * - Nunca cristaliza por debajo de la saturación.
 * - Nunca transfiere todo el exceso en un solo paso (cinética de primer orden).
 * - En recipientes con agua siempre queda KNO₃ en la disolución madre (capacidad > 0).
 */
export function stepCrystallization(v: Vessel, dt: number, subs: SubstanceTable, p: SimParams, ctx: CrystContext): void {
  const m = v.mix;
  const T = v.temperatureC;
  const cs = v.cryst;
  const dTdt = (cs.lastTempC - T) / dt;
  cs.coolingRate += (dTdt - cs.coolingRate) * Math.min(1, dt / 8);
  cs.lastTempC = T;

  const dissolved = m.dissolved.KNO3 ?? 0;
  const fastness = clamp(cs.coolingRate / FAST_COOLING_C_PER_S, 0, 1);

  if (m.waterG <= 0) {
    // Evaporación a sequedad: todo el soluto queda como depósito sólido (evaporita, cristales finos).
    if (dissolved > 0) {
      addToCrystals(v, dissolved, 0.25, 0.6, 1);
      m.dissolved.KNO3 = 0;
    }
    for (const k of ['IMP', 'NaCl', 'SUCROSE'] as const) {
      const d = m.dissolved[k] ?? 0;
      if (d > 0) {
        m.solid[k] = (m.solid[k] ?? 0) + d;
        m.dissolved[k] = 0;
      }
    }
    cs.phase = crystallizationPhase(v, subs, ctx.evaporating);
    sanitize(m);
    return;
  }

  const cap = capacityG(subs.KNO3, T, m.waterG);
  const S = cap > 0 ? dissolved / cap : Infinity;
  const crystalMass = m.crystals?.massG ?? 0;
  const seedSolid = m.solid.KNO3 ?? 0;
  const hasSites = crystalMass > 1e-6 || seedSolid > 1e-6;

  if (!hasSites) {
    if (S > 1.02) {
      let f = clamp((S - 1) / 0.15, 0, 4);
      if (v.agitation > 0.2) f *= p.crystal.agitationBoost;
      if (ctx.timeS < cs.scrapeBoostUntilS) f *= p.crystal.scrapeBoost;
      if (ctx.evaporating) f *= 8; // costra en el menisco de un recipiente caliente
      cs.nucleationProgress += (dt * f) / cs.baseDelayS;
      if (cs.nucleationProgress >= 1) {
        const nuclei = 40 * (1 + 10 * fastness) * (1 + 2 * clamp(S - 1, 0, 2)) * ctx.nucleiJitter;
        // Los núcleos se forman con masa tomada del soluto (conservación estricta).
        const nucleusMass = Math.min(1e-5, dissolved);
        m.dissolved.KNO3 = dissolved - nucleusMass;
        m.crystals = {
          substanceId: 'KNO3',
          massG: nucleusMass,
          meanSizeMm: 0.02,
          sizeVariance: 0.1 + 0.5 * fastness,
          purityFraction: p.crystal.maxPurity,
          nucleated: true,
        };
        cs.nucleiCount = nuclei;
      }
    } else {
      cs.nucleationProgress = Math.max(0, cs.nucleationProgress - dt / 30);
    }
  }

  // Crecimiento: solo sobre la saturación y con sitios de crecimiento.
  const hasSitesNow = (m.crystals !== null) || seedSolid > 1e-6;
  const d2 = m.dissolved.KNO3 ?? 0;
  if (hasSitesNow && d2 > cap) {
    if (!m.crystals) {
      // Cristal semilla o KNO₃ sin disolver actúa como sitio de crecimiento.
      m.crystals = {
        substanceId: 'KNO3', massG: 0, meanSizeMm: 0.3, sizeVariance: 0.15,
        purityFraction: p.crystal.maxPurity, nucleated: true,
      };
      cs.nucleiCount = 25 * ctx.nucleiJitter;
    }
    const excess = d2 - cap;
    const k = p.crystal.growthK * (1 + v.agitation) * (ctx.evaporating ? 3 : 1);
    const amount = excess * (1 - Math.exp(-k * dt));
    m.dissolved.KNO3 = d2 - amount;
    const purity = p.crystal.maxPurity - (p.crystal.maxPurity - p.crystal.minPurity) * fastness;
    addToCrystals(v, amount, 0, 0.1 + 0.5 * fastness, purity);
  }
  if (m.crystals) {
    m.crystals.meanSizeMm = clamp(sizeFromMass(m.crystals.massG, cs.nucleiCount ?? 50), 0.02, 4);
  }
  cs.phase = crystallizationPhase(v, subs, ctx.evaporating);
  sanitize(m);
}

function addToCrystals(v: Vessel, g: number, sizeMm: number, variance: number, purity: number): void {
  const m = v.mix;
  if (g <= 0) return;
  const c: CrystalPopulation = m.crystals ?? {
    substanceId: 'KNO3', massG: 0, meanSizeMm: sizeMm || 0.2, sizeVariance: variance, purityFraction: purity, nucleated: true,
  };
  const total = c.massG + g;
  c.purityFraction = (c.purityFraction * c.massG + purity * g) / total;
  c.sizeVariance = (c.sizeVariance * c.massG + variance * g) / total;
  if (sizeMm > 0) c.meanSizeMm = (c.meanSizeMm * c.massG + sizeMm * g) / total;
  c.massG = total;
  if (!m.crystals) {
    m.crystals = c;
    if (!v.cryst.nucleiCount) v.cryst.nucleiCount = Math.max(1, total / (KNO3_MASS_PER_MM3 * Math.max(sizeMm, 0.05) ** 3));
  }
}
