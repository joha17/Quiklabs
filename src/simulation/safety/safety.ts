import type { Vessel, VesselType, World } from '../entities/types';
import { mixMassG, particulateMassG, substanceMass } from '../solutions/mixture';
import { bump, emit } from '../world/ops';

export const GLASS_TYPES: ReadonlySet<VesselType> = new Set<VesselType>([
  'BEAKER', 'TEST_TUBE', 'GRADUATED_CYLINDER', 'FUNNEL', 'PORCELAIN_DISH', 'BATH', 'VIAL', 'REAGENT_JAR', 'REAGENT_BOTTLE',
]);

export const COMBUSTIBLE_TYPES: ReadonlySet<VesselType> = new Set<VesselType>(['FILTER_PAPER', 'WEIGH_PAPER', 'TOWEL']);

/**
 * §10.2 — mezcla carbón/KNO₃ seca o casi seca. Se considera peligrosa si hay carbón apreciable
 * junto a KNO₃ y el agua es menos del umbral configurado de la masa total.
 */
export function isDryCarbonNitrate(w: World, v: Vessel): boolean {
  const carbon = v.mix.solid.CARBON ?? 0;
  const kno3 = substanceMass(v.mix, 'KNO3');
  if (carbon < w.params.safety.dryCarbonMinG || kno3 < 0.01) return false;
  const total = mixMassG(v.mix);
  return v.mix.waterG / Math.max(total, 1e-9) < w.params.safety.dryWaterFraction;
}

export function vesselOnHotplate(w: World): Vessel | null {
  for (const id in w.vessels) {
    const v = w.vessels[id];
    if (v.support === 'hotplate' && v.integrity === 1) return v;
  }
  return null;
}

/** Comprueba si colocar `v` en `support` es seguro. Devuelve código de bloqueo o null. */
export function placementBlock(w: World, v: Vessel, support: string | null): string | null {
  if (support !== 'hotplate') return null;
  const hp = w.devices.hotplate;
  const hot = hp.powerPct > 0 || hp.plateTempC > 60;
  if (COMBUSTIBLE_TYPES.has(v.type) && hot) return 'COMBUSTIBLE_ON_PLATE';
  if (isDryCarbonNitrate(w, v) && hot) return 'DRY_MIXTURE_HEAT';
  if (v.cover === 'SEALED') return 'CLOSED_HEAT';
  const other = vesselOnHotplate(w);
  if (other && other.id !== v.id) return 'PLATE_OCCUPIED';
  return null;
}

/** Bloqueo crítico: detiene la acción, explica el riesgo y registra el evento (§10.2). */
export function criticalBlock(w: World, code: string, vesselId?: string): void {
  w.safety.block = { code, params: vesselId ? { vesselId } : undefined };
  bump(w, `block:${code}`);
  bump(w, 'criticalBlocks');
  emit(w, `SAFETY_${code}`, 'CRITICAL', vesselId ? { vesselId } : undefined);
}

/** Comprobaciones de seguridad continuas en cada paso. */
export function stepSafety(w: World, dt: number): void {
  const hp = w.devices.hotplate;
  const p = w.params.safety;
  const v = vesselOnHotplate(w);
  if (v) {
    // B6 — nunca calentar la mezcla seca carbón/KNO₃: se corta la potencia y se bloquea.
    if (isDryCarbonNitrate(w, v) && (hp.powerPct > 0 || hp.plateTempC > 80)) {
      if (hp.powerPct > 0) hp.powerPct = 0;
      if (w.safety.block?.code !== 'DRY_MIXTURE_HEAT') criticalBlock(w, 'DRY_MIXTURE_HEAT', v.id);
    }
    if (v.cover === 'SEALED' && hp.powerPct > 0) {
      hp.powerPct = 0;
      criticalBlock(w, 'CLOSED_HEAT', v.id);
    }
    // Recipiente vacío sobre la placa caliente.
    if (mixMassG(v.mix) < 0.005 && hp.plateTempC > 150) {
      hp.emptyHeatingS += dt;
      if (hp.emptyHeatingS > p.emptyHeatLimitS && hp.powerPct > 0) {
        hp.powerPct = 0;
        criticalBlock(w, 'EMPTY_HEATING', v.id);
      }
    } else hp.emptyHeatingS = 0;
    // D4 — sobrecalentamiento del sólido seco.
    if (v.mix.waterG <= 0 && particulateMassG(v.mix) > 0.005) {
      if (v.temperatureC > p.discolorC && !w.evidence[`discolored:${v.id}`]) {
        w.evidence[`discolored:${v.id}`] = 1;
        emit(w, 'SOLID_DISCOLORED', 'ALERT', { vesselId: v.id });
      }
      if (v.temperatureC > p.overheatIncidentC && !w.safety.halted) {
        hp.powerPct = 0;
        w.safety.halted = true;
        w.safety.incident = 'OVERHEAT_DRY_SOLID';
        bump(w, 'incidentOverheat');
        emit(w, 'INCIDENT_OVERHEAT', 'CRITICAL', { vesselId: v.id });
      }
    }
  } else {
    hp.emptyHeatingS = 0;
  }
  // El bloqueo por mezcla seca se libera cuando el recipiente sale de la placa.
  if (w.safety.block?.code === 'DRY_MIXTURE_HEAT') {
    const id = w.safety.block.params?.vesselId as string | undefined;
    const bv = id ? w.vessels[id] : null;
    if (!bv || bv.support !== 'hotplate') w.safety.block = null;
  }
  if (w.safety.block?.code === 'EMPTY_HEATING' || w.safety.block?.code === 'CLOSED_HEAT') {
    const id = w.safety.block.params?.vesselId as string | undefined;
    const bv = id ? w.vessels[id] : null;
    if (!bv || bv.support !== 'hotplate') w.safety.block = null;
  }
}

/** Comandos permitidos mientras hay un bloqueo activo. */
export function allowedDuringBlock(code: string, cmdType: string): boolean {
  const always = new Set(['setPose', 'grab', 'place', 'setHandMode', 'acknowledgeIncident', 'setAgitation', 'stopPour', 'setDripTarget', 'drop', 'insertProbe', 'insertRod']);
  if (code === 'SPILL_UNCLEANED') return cmdType === 'cleanSpill' || cmdType === 'setPose' || cmdType === 'stopPour' || cmdType === 'setHandMode' || cmdType === 'setAgitation' || cmdType === 'drop' || cmdType === 'setDripTarget';
  if (cmdType === 'setHotplatePower') return false;
  return always.has(cmdType) || cmdType === 'cleanSpill' || cmdType === 'sweepShards' || cmdType === 'cover' || cmdType === 'label';
}
