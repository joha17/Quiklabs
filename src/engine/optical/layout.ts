/**
 * Puntos de apoyo con nombre de la mesada B01 (cm), los mismos del dominio: área de montaje, asiento de la platina
 * (sube y baja con el foco), ranuras de la caja, base del estereoscopio y bandejas. El controlador encaja allí lo que se
 * suelta cerca; el resto queda en la mesada.
 */
import type { B01ObjKind, OpticalWorld } from '../../simulation/optical-world/types';
import { microscopeView } from '../../simulation/optical-world/world';
import { CLEAN_TRAY, GEO_B01, PREP_SPOT, SAMPLE_TRAY, STAGE_SEAT, STEREO_BASE, caseSlotId, caseSlotPos, stageTopZCm } from '../../simulation/optical-world/geometry';

export interface Spot {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Radio de captura (cm). */
  r: number;
}

/** Altura actual de la cara superior de la platina (cm). */
export const stageTop = (w: OpticalWorld) => stageTopZCm(microscopeView(w).stageZmm);

/** Apoyos válidos de cada clase de objeto. */
export function spotsFor(w: OpticalWorld, kind: B01ObjKind): Spot[] {
  const out: Spot[] = [];
  if (kind === 'slide' || kind === 'fixedSlide') {
    out.push({ id: 'stage', x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTop(w), r: 5 });
    if (kind === 'slide') {
      out.push({ id: 'prep', x: PREP_SPOT.x, y: PREP_SPOT.y, z: PREP_SPOT.z, r: 7 });
      out.push({ id: 'cleanTray', x: CLEAN_TRAY.x, y: CLEAN_TRAY.y, z: CLEAN_TRAY.z, r: 7 });
    }
    if (kind === 'fixedSlide') {
      for (let i = 0; i < GEO_B01.slideCase.slots; i++) {
        const p = caseSlotPos(i);
        out.push({ id: `case:${caseSlotId(i)}`, x: p.x, y: p.y, z: p.z, r: 0.7 });
      }
    }
  }
  if (kind === 'leafSample' || kind === 'insectSample') {
    out.push({ id: 'stereoBase', x: STEREO_BASE.x, y: STEREO_BASE.y, z: STEREO_BASE.z, r: 6 });
    out.push({ id: 'sampleTray', x: SAMPLE_TRAY.x, y: SAMPLE_TRAY.y, z: SAMPLE_TRAY.z, r: 6 });
  }
  return out;
}

export function spotById(w: OpticalWorld, kind: B01ObjKind, id: string): Spot | null {
  return spotsFor(w, kind).find((s) => s.id === id) ?? null;
}

/** Altura de la cara superior de un objeto apoyado (para lo que se coloca encima). */
export const TOP_CM: Partial<Record<B01ObjKind, number>> = {
  prepBoard: GEO_B01.prepBoard.h, elodeaDish: GEO_B01.dish.h, dropperBottle: GEO_B01.dropperBottle.h, coverBox: GEO_B01.coverBox.h, slideCase: GEO_B01.slideCase.h,
  sampleTray: GEO_B01.sampleTray.h, cleanTray: GEO_B01.tray.h, glassBin: GEO_B01.bin.h, bioWaste: GEO_B01.bin.h, ppeTray: GEO_B01.ppeTray.h,
};
