/**
 * Geometría de vertido de los recipientes de la Práctica 4: los mismos perfiles de revolución que usa el dominio
 * (instruments.ts) con las funciones de vertido de la Práctica 2 (volumen bajo un plano horizontal, pico, caudal).
 */
import type { VesselKind } from '../../simulation/reaction-world/types';
import { brimVolume } from '../../practices/practice-02/instruments';
import { PROFILE_OF } from '../../practices/practice-04/instruments';
import type { VesselShape } from '../physics/geometry';

const POUR: Partial<Record<VesselKind, [number, number]>> = {
  BOTTLE: [0.7, 2.2], CYL10: [2.5, 3], CYL25: [2.5, 3.5], BEAKER100: [3, 7], TUBE: [2.5, 3], CAPSULE: [3, 5], WASH_BOTTLE: [1, 2], DROPPER_BOTTLE: [0.6, 1],
};

export const SHAPES4: Partial<Record<VesselKind, VesselShape>> = {};
for (const [k, prof] of Object.entries(PROFILE_OF)) {
  const kind = k as VesselKind;
  if (!prof || kind === 'WASTE') continue;
  const [pourK, pourMax] = POUR[kind] ?? [2, 3];
  SHAPES4[kind] = { profile: prof, r: prof.mouthR, h: prof.rimY, baseOffset: prof.bottomY, fullVolumeMl: brimVolume(prof), pourK, pourMax };
}

/** Radio de huella (cm) por tipo de objeto, para separar objetos al apoyarlos. */
export function footR(kind: VesselKind | undefined): number {
  if (!kind) return 1.5;
  return PROFILE_OF[kind]?.outerR ?? 1.2;
}

/** Qué recipientes reciben un vertido de cada tipo (acople automático, como en la Práctica 2). */
export const POUR_TARGETS: Partial<Record<VesselKind, VesselKind[]>> = {
  BOTTLE: ['CYL10', 'CYL25', 'BEAKER100', 'TUBE'],
  CYL10: ['BEAKER100', 'TUBE', 'CAPSULE', 'CYL25', 'WASTE', 'SINK'],
  CYL25: ['BEAKER100', 'TUBE', 'CAPSULE', 'CYL10', 'WASTE', 'SINK'],
  BEAKER100: ['TUBE', 'CYL10', 'CYL25', 'CAPSULE', 'WASTE', 'SINK'],
  TUBE: ['TUBE', 'BEAKER100', 'CYL10', 'WASTE', 'SINK'],
  CAPSULE: ['WASTE', 'SINK', 'BEAKER100'],
};
