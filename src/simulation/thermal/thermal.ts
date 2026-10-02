import type { SubstanceTable } from '../substances/types';
import type { SimParams, Vessel, World } from '../entities/types';
import { contentHeatCapacity, mixMassG, particulateMassG, sanitize, takeAllFraction, vesselHeatCapacity } from '../solutions/mixture';
import { particleMolality } from '../solutions/solubility';
import { clamp } from '../core/math';

/** Presión de vapor del agua (mmHg), ecuación de Antoine (1–100 °C). */
export function waterVaporPressureMmHg(tC: number): number {
  const t = clamp(tC, -10, 150);
  return 10 ** (8.07131 - 1730.63 / (233.426 + t));
}

/** Punto de ebullición de la disolución (elevación ebulloscópica ideal, acotada). */
export function boilingPointC(v: Vessel, p: SimParams): number {
  const dT = Math.min(p.ebullioscopicK * particleMolality(v.mix), p.maxBoilingElevationC);
  return 100 + dT;
}

export interface ThermalResult {
  evaporatedG: number;
  boiling: boolean;
}

/**
 * §4.6 — Q_neto = Q_placa − Q_convección − Q_evaporación ; ΔT = Q_neto / C_total.
 * La placa no fija la temperatura de la mezcla; la temperatura sube con inercia.
 * Cerca de la ebullición el exceso de energía evapora agua. Nunca agua negativa.
 */
export function stepVesselThermal(
  w: World,
  v: Vessel,
  dt: number,
  subs: SubstanceTable,
  env: { onPlate: boolean; inBath: Vessel | null },
): ThermalResult {
  const p = w.params;
  const m = v.mix;
  const T = v.temperatureC;
  const C = vesselHeatCapacity(v, subs, p.cpWater);
  let Q = 0; // W

  if (env.onPlate) Q += v.thermal.hPlate * (w.devices.hotplate.plateTempC - T);

  if (env.inBath) {
    const bath = env.inBath;
    const contact = bath.mix.waterG > 50 ? 1 : 0.3;
    const qb = v.thermal.hBath * contact * (bath.temperatureC - T);
    Q += qb;
    // El baño recibe el calor opuesto (se aplica en el paso del baño).
    bathHeatIn.set(bath.id, (bathHeatIn.get(bath.id) ?? 0) - qb);
  } else {
    Q -= v.thermal.hAir * (T - p.ambientC);
  }

  // Evaporación superficial (Antoine × área × fracción descubierta).
  let evaporatedG = 0;
  let boiling = false;
  if (m.waterG > 0 && v.thermal.openAreaCm2 > 0) {
    const coverF = v.cover === 'PARTIAL' ? p.coverEvapFactor : v.cover === 'SEALED' ? 0.02 : 1;
    const drive = Math.max(0, waterVaporPressureMmHg(T) - p.relativeHumidity * waterVaporPressureMmHg(p.ambientC));
    let rate = p.evapK * v.thermal.openAreaCm2 * drive * coverF; // g/s
    // Película fina en recipientes de poca profundidad: evaporación más eficiente con poca agua.
    rate = Math.min(rate, m.waterG / dt);
    evaporatedG += rate * dt;
    Q -= rate * p.latentJPerG;
  }

  let newT = T + (Q * dt) / Math.max(C, 1e-6);
  const Tb = boilingPointC(v, p);
  if (m.waterG > 0 && newT > Tb) {
    // Energía sobrante → evaporación (no sube la temperatura).
    const excessJ = (newT - Tb) * C;
    const boilG = Math.min(excessJ / p.latentJPerG, m.waterG - evaporatedG);
    evaporatedG += Math.max(0, boilG);
    newT = Tb;
    boiling = true;
  }
  evaporatedG = clamp(evaporatedG, 0, m.waterG);
  if (evaporatedG > 0) {
    m.waterG -= evaporatedG;
    w.ledger.evaporated.H2O = (w.ledger.evaporated.H2O ?? 0) + evaporatedG;
  }

  // Hielo dentro de un recipiente (no baño): funde absorbiendo calor.
  if (m.iceG > 0 && newT > 0) {
    const availJ = (newT - 0) * C;
    const melt = Math.min(m.iceG, availJ / p.fusionJPerG);
    m.iceG -= melt;
    m.waterG += melt;
    newT -= (melt * p.fusionJPerG) / Math.max(C, 1e-6);
  }

  v.temperatureC = newT;
  if (newT > v.maxTempC) v.maxTempC = newT;
  sanitize(m);
  return { evaporatedG, boiling };
}

/** Calor transferido a cada baño en el paso actual (W). Se reinicia en cada paso. */
export const bathHeatIn = new Map<string, number>();

/** Baño de agua y hielo: el hielo se funde y mantiene el baño cerca de 0–1 °C. */
export function stepBath(w: World, bath: Vessel, dt: number, subs: SubstanceTable): void {
  const p = w.params;
  const m = bath.mix;
  const Cc = contentHeatCapacity(m, subs, p.cpWater);
  const C = bath.thermal.containerMassG * bath.thermal.containerCpJPerGK + Cc;
  let Q = (bathHeatIn.get(bath.id) ?? 0) - bath.thermal.hAir * (bath.temperatureC - p.ambientC);
  bathHeatIn.delete(bath.id);
  if (m.iceG > 0) {
    // Con hielo presente: el calor neto funde hielo y el baño tiende a ~0,5 °C con buena mezcla.
    const target = m.waterG > 20 ? 0.5 : 2;
    const relax = (bath.temperatureC - target) * C; // energía para llevarlo al objetivo
    const meltJ = Math.max(0, Q * dt + relax * Math.min(1, dt / 8));
    const melt = Math.min(m.iceG, meltJ / p.fusionJPerG);
    m.iceG -= melt;
    m.waterG += melt;
    Q = Q - (melt * p.fusionJPerG) / dt;
  }
  bath.temperatureC += (Q * dt) / Math.max(C, 1e-6);
  if (m.iceG > 0) bath.temperatureC = Math.max(bath.temperatureC, 0);
  sanitize(m);
}

/** Placa calefactora: inercia de primer orden hacia la temperatura objetivo según potencia. */
export function stepHotplate(w: World, dt: number): void {
  const hp = w.devices.hotplate;
  const p = w.params;
  const target = p.ambientC + (hp.powerPct / 100) * (p.hotplateMaxC - p.ambientC);
  hp.plateTempC += ((target - hp.plateTempC) * dt) / p.hotplateTauS;
}

/** Masa del contenido (para descripciones y detección de vacío). */
export function isNearlyEmpty(v: Vessel): boolean {
  return mixMassG(v.mix) < 0.005;
}

/**
 * Salpicaduras por ebullición violenta o depósito pastoso sobre la placa (D2, B4).
 * Devuelve la fracción del contenido que salpica POR SEGUNDO (se contabiliza como derramada).
 */
export function splashRatePerS(v: Vessel, p: SimParams, boiling: boolean, agitation: number): number {
  const m = v.mix;
  const solids = particulateMassG(m);
  const coverF = v.cover === 'PARTIAL' ? p.coverSplashFactor : 1;
  let f = 0;
  if (boiling && m.waterG > 0) {
    // Ebullición sin agitar: ebullición localizada y burbujas grandes.
    f += (agitation < 0.25 ? 0.0003 : 0.00001) * coverF;
    // Depósito pastoso (poca agua frente al sólido): crepitación.
    if (solids > 0 && m.waterG < solids * 0.6) f += 0.006 * coverF;
  }
  return f;
}

export function removeFraction(v: Vessel, f: number) {
  return takeAllFraction(v.mix, f);
}
