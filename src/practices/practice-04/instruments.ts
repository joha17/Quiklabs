/**
 * Dimensiones del instrumental de la Práctica 4 (cm). Las usan el dominio (volumen ↔ altura, bocas, inmersión
 * del clavo, cápsula bajo la cinta) y la escena 3D (modelos procedurales), para que ambos coincidan.
 * Los perfiles de revolución usan la misma representación que la Práctica 2 (instruments.ts).
 */
import { type InstrumentProfile, PROFILES } from '../practice-02/instruments';
import type { VesselKind } from '../../simulation/reaction-world/types';

function cylinder(outerR: number, h: number, wall: number, bottom: number, material: InstrumentProfile['material'] = 'glass'): InstrumentProfile {
  const ri = outerR - wall;
  return {
    outer: [[0, 0], [outerR - 0.1, 0], [outerR, 0.1], [outerR, h]],
    inner: [[0, bottom], [ri - 0.08, bottom], [ri, bottom + 0.08], [ri, h]],
    mouthR: ri, rimY: h, bottomY: bottom, outerR, wall, material,
  };
}

/** Frasco con hombro y cuello (el cuerpo se integra como cilindro; el cuello solo para la boca de vertido). */
function bottle(outerR: number, bodyH: number, neckR: number, h: number, wall: number): InstrumentProfile {
  const ri = outerR - wall;
  const ni = neckR - wall;
  return {
    outer: [[0, 0], [outerR - 0.15, 0], [outerR, 0.15], [outerR, bodyH], [neckR + 0.1, bodyH + (h - bodyH) * 0.55], [neckR, bodyH + (h - bodyH) * 0.65], [neckR, h]],
    inner: [[0, 0.3], [ri - 0.1, 0.3], [ri, 0.4], [ri, bodyH], [ni + 0.1, bodyH + (h - bodyH) * 0.55], [ni, bodyH + (h - bodyH) * 0.65], [ni, h]],
    mouthR: ni, rimY: h, bottomY: 0.3, outerR, wall, material: 'glass',
  };
}

/** Frasco de reactivo (≈ 150 mL). */
export const BOTTLE_PROFILE = bottle(2.7, 8.4, 1.1, 11.2, 0.18);
/** Frasco gotero (≈ 55 mL), boca estrecha con tapa-gotero. */
export const DROPPER_BOTTLE_PROFILE = bottle(1.95, 6.0, 0.85, 7.6, 0.15);
/** Probeta 10,0 mL (la de la Práctica 2) y 25,0 mL: Ø ext 1,94 cm, alto 14,8 cm, fondo grueso 1,3 cm. */
export const CYL10_PROFILE = PROFILES.GRADUATED_CYLINDER;
export const CYL25_PROFILE: InstrumentProfile = (() => {
  const p = cylinder(0.97, 14.8, 0.12, 1.3);
  p.outer = [[0, 0.7], [0.97, 0.7], [0.97, 14.8]];
  return p;
})();
/** Beaker 100,0 mL: Ø ext 5,1 cm, alto 7,0 cm. */
export const BEAKER100_PROFILE = cylinder(2.55, 7.0, 0.15, 0.25);
export const TUBE_PROFILE = PROFILES.TEST_TUBE;
export const CAPSULE_PROFILE = PROFILES.PORCELAIN_DISH;
export const WASH_PROFILE = PROFILES.WASH_BOTTLE;
export const WASTE_PROFILE = cylinder(4.3, 12, 0.3, 0.3, 'plastic');
/** Gotero: tubo de vidrio con perilla; el origen es la punta. Capacidad útil ≈ 1,5 mL. */
export const DROPPER = { length: 9, r: 0.32, bulbR: 0.75, bulbH: 3, capacityMl: 1.5 } as const;

export const PROFILE_OF: Partial<Record<VesselKind, InstrumentProfile>> = {
  BOTTLE: BOTTLE_PROFILE,
  DROPPER_BOTTLE: DROPPER_BOTTLE_PROFILE,
  CYL10: CYL10_PROFILE,
  CYL25: CYL25_PROFILE,
  BEAKER100: BEAKER100_PROFILE,
  TUBE: TUBE_PROFILE,
  CAPSULE: CAPSULE_PROFILE,
  WASH_BOTTLE: WASH_PROFILE,
  WASTE: WASTE_PROFILE,
};

/** Capacidad nominal (mL) por tipo. */
export const CAPACITY_ML: Record<VesselKind, number> = {
  BOTTLE: 140, DROPPER_BOTTLE: 50, DROPPER: DROPPER.capacityMl, CYL10: 13.5, CYL25: 30, BEAKER100: 120, TUBE: 20, CAPSULE: 40,
  WASH_BOTTLE: 480, WASTE: 600, SINK: 1e6,
};

/** Masa y calor específico del recipiente (g, J·g⁻¹·K⁻¹) y conductancia al aire (W/K) — §7.5. */
export const THERMAL: Record<VesselKind, { massG: number; cp: number; hAir: number; coupling: number }> = {
  BOTTLE: { massG: 120, cp: 0.84, hAir: 0.08, coupling: 0.6 },
  DROPPER_BOTTLE: { massG: 45, cp: 0.84, hAir: 0.04, coupling: 0.6 },
  DROPPER: { massG: 4, cp: 0.84, hAir: 0.004, coupling: 0.5 },
  CYL10: { massG: 22, cp: 0.84, hAir: 0.012, coupling: 0.5 },
  CYL25: { massG: 38, cp: 0.84, hAir: 0.018, coupling: 0.5 },
  BEAKER100: { massG: 50, cp: 0.84, hAir: 0.03, coupling: 0.5 },
  TUBE: { massG: 9, cp: 0.84, hAir: 0.008, coupling: 0.6 },
  CAPSULE: { massG: 32, cp: 0.85, hAir: 0.05, coupling: 0.7 },
  WASH_BOTTLE: { massG: 40, cp: 1.5, hAir: 0.06, coupling: 0.3 },
  WASTE: { massG: 150, cp: 1.5, hAir: 0.1, coupling: 0.3 },
  SINK: { massG: 1, cp: 1, hAir: 1, coupling: 0 },
};

/** Camino óptico típico para el color (cm): diámetro interior. */
export const PATH_CM: Record<VesselKind, number> = {
  BOTTLE: 5, DROPPER_BOTTLE: 3.6, DROPPER: 0.5, CYL10: 1.36, CYL25: 1.7, BEAKER100: 4.8, TUBE: 1.4, CAPSULE: 1.2, WASH_BOTTLE: 6, WASTE: 8, SINK: 1,
};

export const RACK4 = { slots: 6, pitch: 3.6, hx: 13, hy: 3.5, h: 7 } as const;
/** El tubo en la gradilla apoya sobre la base de la gradilla. */
export const TUBE_RACK_Z = 0.6;
export const TILE4 = { half: 9, h: 1.1 } as const;
export const ROD = { length: 18, r: 0.25 } as const;
export const PROBE = { length: 16, r: 0.22, handleLen: 6 } as const;
/** Clavo de hierro: 5,0 cm, Ø 0,30 cm, cabeza Ø 0,75 cm. Origen = punta. */
export const NAIL = { length: 5.0, d: 0.3, headD: 0.75, headH: 0.15, segments: 20 } as const;
export const AL_STRIP = { length: 5.0, w: 0.8, t: 0.05, segments: 20 } as const;
/** Cinta de Mg (≈ 3 cm × 3 mm × 0,2 mm). Origen = extremo libre (el que entra a la llama). */
export const MG_RIBBON = { length: 3.0, w: 0.32, t: 0.02, density: 1.738 } as const;
/** Pinzas: el origen es la punta (mandíbulas). */
export const TONGS = { crucibleLen: 23, tubeLen: 18 } as const;
export const SHIELD = { halfW: 11, halfH: 12, standH: 4 } as const;
export const WASH_NOZZLE = { dx: 5.5, z: 17.6 } as const;
export const TOWEL = { half: 5 } as const;
