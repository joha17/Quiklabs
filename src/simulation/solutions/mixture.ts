import type { ComponentId, OilId, SubstanceId, SubstanceTable } from '../substances/types';
import type { Amounts, CrystalPopulation, Mixture, Vessel } from '../entities/types';
import { EPS_G, clamp } from '../core/math';

export function emptyMixture(): Mixture {
  return { waterG: 0, iceG: 0, solid: {}, dissolved: {}, oil: {}, suspended: {}, emulsion: 0, crystals: null };
}

export function cloneMix(m: Mixture): Mixture {
  return {
    waterG: m.waterG,
    iceG: m.iceG,
    solid: { ...m.solid },
    dissolved: { ...m.dissolved },
    oil: { ...m.oil },
    suspended: { ...m.suspended },
    emulsion: m.emulsion,
    crystals: m.crystals ? { ...m.crystals } : null,
  };
}

const keys = <K extends string>(r: Partial<Record<K, number>>): K[] => Object.keys(r) as K[];

export function sumRecord(r: Partial<Record<string, number>>): number {
  let s = 0;
  for (const k in r) s += r[k] ?? 0;
  return s;
}

/** Volumen de la fase líquida (mL): agua + volumen aparente de solutos + aceite. El hielo no cuenta. */
export function liquidVolumeMl(m: Mixture, subs: SubstanceTable): number {
  let v = m.waterG; // ρ(agua) ≈ 1,00 g/mL (§4.3)
  for (const k of keys(m.dissolved)) v += (m.dissolved[k] ?? 0) * subs[k].apparentVolumeMlPerG;
  for (const k of keys(m.oil)) v += (m.oil[k] ?? 0) / subs[k].densityGPerMl;
  return v;
}

/** Volumen de la fase acuosa solamente (sin aceite). */
export function aqueousVolumeMl(m: Mixture, subs: SubstanceTable): number {
  let v = m.waterG;
  for (const k of keys(m.dissolved)) v += (m.dissolved[k] ?? 0) * subs[k].apparentVolumeMlPerG;
  return v;
}

export function oilVolumeMl(m: Mixture, subs: SubstanceTable): number {
  let v = 0;
  for (const k of keys(m.oil)) v += (m.oil[k] ?? 0) / subs[k].densityGPerMl;
  return v;
}

/** Volumen ocupado por sólidos (mL) — para el nivel visual y la capacidad. */
export function solidVolumeMl(m: Mixture, subs: SubstanceTable): number {
  let v = 0;
  for (const k of keys(m.solid)) v += ((m.solid[k] ?? 0) / subs[k].densityGPerMl) * 1.6; // empaquetamiento ~60 %
  if (m.crystals) v += (m.crystals.massG / 2.11) * 1.6;
  v += m.iceG / 0.917;
  return v;
}

export function particulateMassG(m: Mixture): number {
  return sumRecord(m.solid) + (m.crystals?.massG ?? 0);
}

export function mixMassG(m: Mixture): number {
  return m.waterG + m.iceG + sumRecord(m.solid) + sumRecord(m.dissolved) + sumRecord(m.oil) + (m.crystals?.massG ?? 0);
}

/** Cantidades por componente del balance de masa. */
export function mixAmounts(m: Mixture): Amounts {
  const a: Amounts = {};
  const add = (k: ComponentId, v: number) => {
    if (v > 0) a[k] = (a[k] ?? 0) + v;
  };
  add('H2O', m.waterG + m.iceG);
  for (const k of keys(m.solid)) add(k, m.solid[k] ?? 0);
  for (const k of keys(m.dissolved)) add(k, m.dissolved[k] ?? 0);
  for (const k of keys(m.oil)) add(k, m.oil[k] ?? 0);
  if (m.crystals) add('KNO3', m.crystals.massG);
  return a;
}

export function addAmounts(target: Amounts, src: Amounts, sign = 1): Amounts {
  for (const k of Object.keys(src) as ComponentId[]) target[k] = (target[k] ?? 0) + sign * (src[k] ?? 0);
  return target;
}

export function isEmptyMix(m: Mixture): boolean {
  return mixMassG(m) < 1e-5;
}

/** Umbral para eliminar entradas vacías: muy por debajo de la tolerancia del balance (1 mg). */
const ZERO_G = 1e-12;

/** Elimina restos numéricos minúsculos y valores negativos (§17.1-8) sin perder masa apreciable. */
export function sanitize(m: Mixture): void {
  const fix = (r: Partial<Record<string, number>>) => {
    for (const k in r) {
      const v = r[k] ?? 0;
      if (!(v > ZERO_G)) delete r[k];
    }
  };
  if (!(m.waterG > ZERO_G)) m.waterG = 0;
  if (!(m.iceG > ZERO_G)) m.iceG = 0;
  fix(m.solid);
  fix(m.dissolved);
  fix(m.oil);
  for (const k of keys(m.suspended)) {
    if (!m.solid[k]) delete m.suspended[k];
    else m.suspended[k] = clamp(m.suspended[k] ?? 0, 0, 1);
  }
  if (m.crystals && !(m.crystals.massG > ZERO_G)) m.crystals = null;
  if (oilMass(m) <= EPS_G) m.emulsion = 0;
}

export function oilMass(m: Mixture): number {
  return sumRecord(m.oil);
}

export function mobileFraction(m: Mixture, s: SubstanceId, subs: SubstanceTable): number {
  return Math.max(m.suspended[s] ?? 0, subs[s].particle.floatFraction);
}

/**
 * Extrae una fracción `f` de la fase líquida (con los sólidos en suspensión que arrastra).
 * Los cristales y el sedimento permanecen. Devuelve la porción extraída.
 */
export function takeLiquidFraction(m: Mixture, f: number, subs: SubstanceTable, carrySolids = true): Mixture {
  const part = emptyMixture();
  f = clamp(f, 0, 1);
  if (f <= 0) return part;
  part.waterG = m.waterG * f;
  m.waterG -= part.waterG;
  // El hielo flota y sale con el líquido de forma proporcional.
  part.iceG = m.iceG * f;
  m.iceG -= part.iceG;
  for (const k of keys(m.dissolved)) {
    const v = (m.dissolved[k] ?? 0) * f;
    part.dissolved[k] = v;
    m.dissolved[k] = (m.dissolved[k] ?? 0) - v;
  }
  for (const k of keys(m.oil)) {
    const v = (m.oil[k] ?? 0) * f;
    part.oil[k] = v;
    m.oil[k] = (m.oil[k] ?? 0) - v;
  }
  part.emulsion = m.emulsion;
  for (const k of keys(m.solid)) {
    if (!carrySolids) break;
    const total = m.solid[k] ?? 0;
    const mob = mobileFraction(m, k, subs);
    const moved = total * mob * f;
    if (moved > 0) {
      part.solid[k] = moved;
      part.suspended[k] = 1;
      const remaining = total - moved;
      // La fracción en suspensión del recipiente se reduce en la misma proporción.
      const susp = m.suspended[k] ?? 0;
      const suspMass = Math.max(0, total * susp - moved);
      m.solid[k] = remaining;
      m.suspended[k] = remaining > 0 ? clamp(suspMass / remaining, 0, 1) : 0;
    }
  }
  sanitize(m);
  sanitize(part);
  return part;
}

/** Extrae `g` gramos de sólido particulado (sedimento + cristales), proporcional a la composición. */
export function takeSolids(m: Mixture, g: number): Mixture {
  const part = emptyMixture();
  const total = particulateMassG(m);
  if (total <= 0 || g <= 0) return part;
  const f = clamp(g / total, 0, 1);
  for (const k of keys(m.solid)) {
    const v = (m.solid[k] ?? 0) * f;
    part.solid[k] = v;
    part.suspended[k] = m.suspended[k] ?? 0;
    m.solid[k] = (m.solid[k] ?? 0) - v;
  }
  if (m.crystals) {
    const v = m.crystals.massG * f;
    part.crystals = { ...m.crystals, massG: v };
    m.crystals.massG -= v;
  }
  sanitize(m);
  sanitize(part);
  return part;
}

/** Extrae una fracción `f` de TODO el contenido. */
export function takeAllFraction(m: Mixture, f: number): Mixture {
  f = clamp(f, 0, 1);
  const part = emptyMixture();
  part.waterG = m.waterG * f;
  m.waterG -= part.waterG;
  part.iceG = m.iceG * f;
  m.iceG -= part.iceG;
  for (const r of ['solid', 'dissolved', 'oil'] as const) {
    const src = m[r] as Partial<Record<string, number>>;
    const dst = part[r] as Partial<Record<string, number>>;
    for (const k in src) {
      const v = (src[k] ?? 0) * f;
      dst[k] = v;
      src[k] = (src[k] ?? 0) - v;
    }
  }
  part.suspended = { ...m.suspended };
  part.emulsion = m.emulsion;
  if (m.crystals) {
    const v = m.crystals.massG * f;
    part.crystals = { ...m.crystals, massG: v };
    m.crystals.massG -= v;
  }
  sanitize(m);
  sanitize(part);
  return part;
}

function mergeCrystals(a: CrystalPopulation | null, b: CrystalPopulation | null): CrystalPopulation | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return a;
  const m = a.massG + b.massG;
  if (m <= 0) return a;
  return {
    substanceId: 'KNO3',
    massG: m,
    meanSizeMm: (a.meanSizeMm * a.massG + b.meanSizeMm * b.massG) / m,
    sizeVariance: (a.sizeVariance * a.massG + b.sizeVariance * b.massG) / m,
    purityFraction: (a.purityFraction * a.massG + b.purityFraction * b.massG) / m,
    nucleated: a.nucleated || b.nucleated,
  };
}

/** Añade `part` a `m` (in situ). */
export function addMix(m: Mixture, part: Mixture): void {
  m.waterG += part.waterG;
  m.iceG += part.iceG;
  for (const k of keys(part.dissolved)) m.dissolved[k] = (m.dissolved[k] ?? 0) + (part.dissolved[k] ?? 0);
  for (const k of keys(part.oil)) m.oil[k as OilId] = (m.oil[k as OilId] ?? 0) + (part.oil[k as OilId] ?? 0);
  for (const k of keys(part.solid)) {
    const a = m.solid[k] ?? 0;
    const b = part.solid[k] ?? 0;
    const sa = m.suspended[k] ?? 0;
    const sb = part.suspended[k] ?? 0;
    m.solid[k] = a + b;
    m.suspended[k] = a + b > 0 ? (a * sa + b * sb) / (a + b) : 0;
  }
  const oa = oilMass(m) - oilMass(part);
  const ob = oilMass(part);
  if (oa + ob > 0) m.emulsion = (m.emulsion * oa + part.emulsion * ob) / (oa + ob);
  m.crystals = mergeCrystals(m.crystals, part.crystals);
  sanitize(m);
}

/** Capacidad calorífica del contenido (J/K). */
export function contentHeatCapacity(m: Mixture, subs: SubstanceTable, cpWater: number): number {
  let c = m.waterG * cpWater + m.iceG * 2.1;
  for (const k of keys(m.solid)) c += (m.solid[k] ?? 0) * subs[k].specificHeatJPerGK;
  for (const k of keys(m.dissolved)) c += (m.dissolved[k] ?? 0) * subs[k].specificHeatJPerGK;
  for (const k of keys(m.oil)) c += (m.oil[k] ?? 0) * subs[k].specificHeatJPerGK;
  if (m.crystals) c += m.crystals.massG * subs.KNO3.specificHeatJPerGK;
  return c;
}

export function vesselHeatCapacity(v: Vessel, subs: SubstanceTable, cpWater: number): number {
  return v.thermal.containerMassG * v.thermal.containerCpJPerGK + contentHeatCapacity(v.mix, subs, cpWater);
}

/**
 * Añade una porción a un recipiente mezclando temperaturas por capacidad calorífica.
 * El recipiente receptor conserva la temperatura de su vidrio en el promedio.
 */
export function pourInto(target: Vessel, part: Mixture, partTempC: number, subs: SubstanceTable, cpWater: number): void {
  const c1 = vesselHeatCapacity(target, subs, cpWater);
  const c2 = contentHeatCapacity(part, subs, cpWater);
  if (c1 + c2 > 0) target.temperatureC = (target.temperatureC * c1 + partTempC * c2) / (c1 + c2);
  addMix(target.mix, part);
}

/** Sustancia mayoritaria (excluye agua). */
export function dominantSubstance(m: Mixture): SubstanceId | null {
  let best: SubstanceId | null = null;
  let bestV = 0;
  const consider = (k: SubstanceId, v: number) => {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  };
  for (const k of keys(m.solid)) consider(k, (m.solid[k] ?? 0) + (m.dissolved[k] ?? 0));
  for (const k of keys(m.dissolved)) consider(k, (m.solid[k] ?? 0) + (m.dissolved[k] ?? 0));
  for (const k of keys(m.oil)) consider(k, m.oil[k] ?? 0);
  if (m.crystals) consider('KNO3', (m.crystals.massG ?? 0) + (m.dissolved.KNO3 ?? 0) + (m.solid.KNO3 ?? 0));
  return best;
}

/** Masa total de una sustancia en el recipiente (todas las fases). */
export function substanceMass(m: Mixture, s: SubstanceId): number {
  let v = (m.solid[s] ?? 0) + (m.dissolved[s] ?? 0) + ((m.oil as Partial<Record<string, number>>)[s] ?? 0);
  if (s === 'KNO3' && m.crystals) v += m.crystals.massG;
  return v;
}
