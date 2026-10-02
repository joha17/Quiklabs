import type { Mixture, Pose, ThermalProps, Vessel, VesselType, SubstanceAmount } from './types';
import type { SubstanceTable } from '../substances/types';
import { emptyMixture, liquidVolumeMl, mixAmounts } from '../solutions/mixture';

/** Propiedades térmicas y de capacidad por tipo de recipiente (configurables en un solo lugar). */
export const VESSEL_DEFAULTS: Record<VesselType, { capacityMl: number; thermal: ThermalProps; tareG: [number, number] }> = {
  // Vaso de 50 mL nominal (graduado hasta 50; volumen útil ≤ 45 mL); capacidad hasta el borde ≈ 80 mL.
  BEAKER: { capacityMl: 80, tareG: [30.5, 33.5], thermal: { containerMassG: 30, containerCpJPerGK: 0.84, hPlate: 0.15, hAir: 0.04, hBath: 0.5, openAreaCm2: 14 } },
  TEST_TUBE: { capacityMl: 20, tareG: [9.0, 10.2], thermal: { containerMassG: 9.5, containerCpJPerGK: 0.84, hPlate: 0.05, hAir: 0.012, hBath: 0.2, openAreaCm2: 1.8 } },
  GRADUATED_CYLINDER: { capacityMl: 12, tareG: [24, 27], thermal: { containerMassG: 25, containerCpJPerGK: 0.84, hPlate: 0.05, hAir: 0.02, hBath: 0.2, openAreaCm2: 1.5 } },
  PORCELAIN_DISH: { capacityMl: 40, tareG: [36, 40], thermal: { containerMassG: 45, containerCpJPerGK: 0.85, hPlate: 0.22, hAir: 0.04, hBath: 0.4, openAreaCm2: 22 } },
  FUNNEL: { capacityMl: 26, tareG: [22, 25], thermal: { containerMassG: 25, containerCpJPerGK: 0.84, hPlate: 0.05, hAir: 0.06, hBath: 0.2, openAreaCm2: 12 } },
  FILTER_PAPER: { capacityMl: 8, tareG: [0.75, 0.85], thermal: { containerMassG: 0.8, containerCpJPerGK: 1.3, hPlate: 0.05, hAir: 0.04, hBath: 0.1, openAreaCm2: 4 } },
  BATH: { capacityMl: 600, tareG: [180, 190], thermal: { containerMassG: 185, containerCpJPerGK: 0.84, hPlate: 0.3, hAir: 0.12, hBath: 0, openAreaCm2: 0 } },
  REAGENT_JAR: { capacityMl: 50, tareG: [60, 70], thermal: { containerMassG: 60, containerCpJPerGK: 0.84, hPlate: 0.05, hAir: 0.05, hBath: 0.2, openAreaCm2: 0 } },
  REAGENT_BOTTLE: { capacityMl: 100, tareG: [60, 70], thermal: { containerMassG: 60, containerCpJPerGK: 0.84, hPlate: 0.05, hAir: 0.05, hBath: 0.2, openAreaCm2: 0 } },
  VIAL: { capacityMl: 10, tareG: [7.5, 8.5], thermal: { containerMassG: 8, containerCpJPerGK: 0.84, hPlate: 0.05, hAir: 0.02, hBath: 0.2, openAreaCm2: 0 } },
  WEIGH_PAPER: { capacityMl: 6, tareG: [0.28, 0.32], thermal: { containerMassG: 0.3, containerCpJPerGK: 1.3, hPlate: 0.05, hAir: 0.02, hBath: 0.1, openAreaCm2: 0 } },
  WASH_BOTTLE: { capacityMl: 500, tareG: [40, 45], thermal: { containerMassG: 40, containerCpJPerGK: 1.9, hPlate: 0.05, hAir: 0.05, hBath: 0.2, openAreaCm2: 0 } },
  JUG: { capacityMl: 1000, tareG: [120, 130], thermal: { containerMassG: 120, containerCpJPerGK: 1.9, hPlate: 0.05, hAir: 0.1, hBath: 0.2, openAreaCm2: 0 } },
  ICE_BUCKET: { capacityMl: 1500, tareG: [300, 320], thermal: { containerMassG: 300, containerCpJPerGK: 1.5, hPlate: 0, hAir: 0.003, hBath: 0, openAreaCm2: 0 } },
  SPATULA: { capacityMl: 2, tareG: [14, 16], thermal: { containerMassG: 15, containerCpJPerGK: 0.5, hPlate: 0.05, hAir: 0.05, hBath: 0.2, openAreaCm2: 0 } },
  SCOOP: { capacityMl: 150, tareG: [40, 45], thermal: { containerMassG: 40, containerCpJPerGK: 1.5, hPlate: 0.05, hAir: 0.01, hBath: 0.2, openAreaCm2: 0 } },
  DROPPER: { capacityMl: 1.0, tareG: [3, 4], thermal: { containerMassG: 3, containerCpJPerGK: 0.84, hPlate: 0.05, hAir: 0.02, hBath: 0.2, openAreaCm2: 0 } },
  WASTE: { capacityMl: 2000, tareG: [200, 220], thermal: { containerMassG: 200, containerCpJPerGK: 1.5, hPlate: 0, hAir: 0.05, hBath: 0, openAreaCm2: 0 } },
  TOWEL: { capacityMl: 30, tareG: [2, 2.5], thermal: { containerMassG: 2, containerCpJPerGK: 1.3, hPlate: 0.05, hAir: 0.05, hBath: 0, openAreaCm2: 0 } },
};

export interface VesselSpec {
  id: string;
  type: VesselType;
  pose: Pose;
  support: string | null;
  mix?: Mixture;
  temperatureC?: number;
  capacityMl?: number;
  label?: string | null;
}

export function makeVessel(spec: VesselSpec, ambientC: number, tareMassG: number): Vessel {
  const d = VESSEL_DEFAULTS[spec.type];
  const v: Vessel = {
    id: spec.id,
    type: spec.type,
    capacityMl: spec.capacityMl ?? d.capacityMl,
    temperatureC: spec.temperatureC ?? ambientC,
    mix: spec.mix ?? emptyMixture(),
    integrity: 1,
    pose: { ...spec.pose },
    label: spec.label ?? null,
    tareMassG,
    cover: 'NONE',
    support: spec.support,
    thermal: { ...d.thermal },
    agitation: 0,
    agitationTool: 'NONE',
    lastAgitatedS: -1e9,
    agitatedTotalS: 0,
    tipped: false,
    cryst: {
      phase: 'DILUTE', nucleationProgress: 0, baseDelayS: 60, scrapeBoostUntilS: -1, coolingRate: 0,
      lastTempC: spec.temperatureC ?? ambientC, seeded: false,
    },
    maxTempC: spec.temperatureC ?? ambientC,
    fanned: false,
    waterBeforeSample: false,
    maxParticulateG: 0,
  };
  if (spec.type === 'FILTER_PAPER') {
    v.filter = {
      fold: 'FLAT', foldedCorrectly: false, wetted: false, torn: false, overflowed: false,
      retainedLiquidMl: 0, flowRateMlPerS: 0, wettingWaterMl: 0,
    };
  }
  if (spec.type === 'FUNNEL') {
    v.funnel = { paperId: null, dripTargetId: null, stemTouchingWall: false, dripRateMlPerS: 0 };
  }
  return v;
}

/**
 * Fracción del sólido máximo contenido que queda adherida a la pared y no sale al verter
 * (pérdida realista por transferencia; se recupera parcialmente lavando con la piseta).
 */
export const WALL_STICK_FRACTION: Partial<Record<VesselType, number>> = {
  BEAKER: 0.03,
  WEIGH_PAPER: 0.008,
  VIAL: 0.005,
  GRADUATED_CYLINDER: 0.02,
  TEST_TUBE: 0.03,
  PORCELAIN_DISH: 0.02,
};

/** Adaptador a la interfaz mínima de §13 (`VesselState`). */
export function toVesselState(v: Vessel, subs: SubstanceTable) {
  const contents: SubstanceAmount[] = [];
  const m = v.mix;
  if (m.waterG > 0) contents.push({ substanceId: 'H2O', massG: m.waterG, phase: 'LIQUID' });
  if (m.iceG > 0) contents.push({ substanceId: 'H2O', massG: m.iceG, phase: 'SOLID' });
  for (const [k, g] of Object.entries(m.solid)) {
    const susp = m.suspended[k as keyof typeof m.suspended] ?? 0;
    if (susp > 0.01) contents.push({ substanceId: k, massG: (g ?? 0) * susp, phase: 'SUSPENDED_SOLID', particleSizeUm: subs[k as keyof SubstanceTable].particle.sizeUm });
    if (susp < 0.99) contents.push({ substanceId: k, massG: (g ?? 0) * (1 - susp), phase: 'SOLID', particleSizeUm: subs[k as keyof SubstanceTable].particle.sizeUm });
  }
  for (const [k, g] of Object.entries(m.dissolved)) contents.push({ substanceId: k, massG: g ?? 0, phase: 'AQUEOUS', dissolved: true });
  for (const [k, g] of Object.entries(m.oil)) contents.push({ substanceId: k, massG: g ?? 0, phase: 'LIQUID' });
  if (m.crystals) contents.push({ substanceId: 'KNO3', massG: m.crystals.massG, phase: 'SOLID', particleSizeUm: m.crystals.meanSizeMm * 1000 });
  return {
    id: v.id,
    type: v.type,
    capacityMl: v.capacityMl,
    temperatureC: v.temperatureC,
    contents,
    liquidVolumeMl: liquidVolumeMl(m, subs),
    amounts: mixAmounts(m),
    integrity: v.integrity,
    pose: v.pose,
  };
}
