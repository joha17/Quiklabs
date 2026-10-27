/**
 * Definición de la práctica B01 «Del preparado a la observación» (§1, §4): estaciones, inventario de la mesada,
 * caja de láminas, muestras del estereoscopio y asignación de activos por escenario. Las poses van en cm.
 */
import type { OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import { SB, type OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, CLEAN_TRAY, COVER_BOX, GLASS_BIN, MIC_POS, PREP_SPOT, SAMPLE_TRAY, STAGE_SEAT, STEREO_POS, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { emptyMount } from '../../simulation/specimens/mount-world';
import type { B01Params } from '../../simulation/optical-world/types';

export type B01Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B01_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [62, 40, 8], dist: 95, elevation: 0.42 },
  { id: 'B', target: [150, 26, 4], dist: 70, elevation: 0.75 },
  { id: 'C', target: [280, 30, 18], dist: 80, elevation: 0.3 },
  { id: 'D', target: [312, 28, 12], dist: 90, elevation: 0.45 },
  { id: 'E', target: [436, 30, 16], dist: 80, elevation: 0.35 },
  { id: 'F', target: [505, 30, 6], dist: 85, elevation: 0.45 },
];

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

/** Láminas de la caja: id → activo, ranura, rótulo. */
export function fixedSlideCatalog(scenarios: string[]) {
  const unknown = scenarios.includes(SB.UNKNOWN_SLIDES);
  const similar = scenarios.includes(SB.SIMILAR_SLIDES);
  const list: Array<{ id: string; assetId: string; slot: number; label: string }> = [
    { id: 'fx1', assetId: 'onion', slot: 2, label: unknown ? 'Muestra A' : 'Epidermis de cebolla (teñida)' },
    { id: 'fx2', assetId: 'cornStem', slot: 4, label: unknown ? 'Muestra B' : 'Tallo de maíz, c. t.' },
    { id: 'fx3', assetId: 'rootTip', slot: 7, label: unknown ? 'Muestra C' : 'Raíz de Ranunculus, c. t.' },
  ];
  if (similar) list.push({ id: 'fx4', assetId: 'onionPlain', slot: 3, label: 'Epidermis de cebolla (sin teñir)' });
  return list;
}

export function buildB01Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const has = (s: string) => scenarios.includes(s);
  const fixed = fixedSlideCatalog(scenarios);
  const objects: OpticalObject[] = [
    // A — seguridad e inventario.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    // B — mesa de preparación.
    O({ id: 'prepBoard', kind: 'prepBoard', pose: P(PREP_SPOT.x, PREP_SPOT.y), movable: false }),
    O({ id: 'el', kind: 'elodeaDish', pose: P(112, 36), movable: false, label: 'Elodea' }),
    O({ id: 'dw', kind: 'dropperBottle', pose: P(166, 42), label: 'Agua destilada' }),
    O({ id: 'iod', kind: 'dropperBottle', pose: P(176, 42), label: 'Lugol' }),
    O({ id: 'sl1', kind: 'slide', pose: P(120, 14, 0.05) }),
    O({ id: 'sl2', kind: 'slide', pose: P(120, 8, 0.05) }),
    O({ id: 'cvBox', kind: 'coverBox', pose: P(COVER_BOX.x, COVER_BOX.y), movable: false }),
    O({ id: 'cv1', kind: 'coverslip', pose: P(COVER_BOX.x - 0.8, COVER_BOX.y, COVER_BOX.z), support: 'coverBox' }),
    O({ id: 'cv2', kind: 'coverslip', pose: P(COVER_BOX.x + 0.8, COVER_BOX.y, COVER_BOX.z), support: 'coverBox' }),
    O({ id: 'fc', kind: 'forceps', pose: P(180, 18, 0.4) }),
    O({ id: 'sc', kind: 'scalpel', pose: P(188, 22, 0.4) }),
    O({ id: 'pp', kind: 'paper', pose: P(102, 16) }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(196, 32) }),
    O({ id: 'tw', kind: 'towel', pose: P(204, 46) }),
    // C/D — microscopio y caja de láminas fijas.
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    // E — estereoscopio y muestras.
    O({ id: 'ste', kind: 'stereo', pose: P(STEREO_POS.x, STEREO_POS.y), movable: false }),
    O({ id: 'stTray', kind: 'sampleTray', pose: P(SAMPLE_TRAY.x, SAMPLE_TRAY.y), movable: false }),
    O({ id: 'leaf1', kind: 'leafSample', pose: P(SAMPLE_TRAY.x - 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray' }),
    O({ id: 'ins1', kind: 'insectSample', pose: P(SAMPLE_TRAY.x + 3, SAMPLE_TRAY.y, SAMPLE_TRAY.z), support: 'sampleTray' }),
    // F — bandeja de limpieza.
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x, CLEAN_TRAY.y), movable: false }),
  ];
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  const slides: OpticalWorld['slides'] = {
    sl1: { kind: 'blank', dirty01: has(SB.DIRTY_SLIDE) ? 0.6 : 0, faceDown: false },
    sl2: { kind: 'blank', dirty01: 0, faceDown: false },
  };
  for (const f of fixed) {
    const sp = caseSlotPos(f.slot);
    objects.push(O({ id: f.id, kind: 'fixedSlide', pose: P(sp.x, sp.y, sp.z), support: `case:${caseSlotId(f.slot)}`, label: f.label }));
    slots[caseSlotId(f.slot)] = f.id;
    home[f.id] = caseSlotId(f.slot);
    slides[f.id] = { kind: 'fixed', dirty01: 0, faceDown: false, assetId: f.assetId, label: f.label };
  }
  const mounts: OpticalWorld['mounts'] = {};
  // S04 / S18: el portaobjetos ya está en el área de montaje con la hoja (sin agua o a medio montar).
  if (has(SB.NO_WATER) || has(SB.RESUME_PREP)) {
    const o = objects.find((x) => x.id === 'sl1')!;
    o.support = 'prep';
    o.pose = P(PREP_SPOT.x, PREP_SPOT.y, PREP_SPOT.z);
    const m = emptyMount('sl1');
    m.specimenId = 'elodea@sl1';
    m.specimenAsset = 'elodea';
    m.fragmentCm = params.leafCm;
    if (has(SB.RESUME_PREP)) {
      m.waterMl = 0.05;
      m.wetsSpecimen = true;
    }
    mounts.sl1 = m;
  }
  const stage = has(SB.STAGE_OFF) ? { stageXmm: 12, stageYmm: -8 } : {};
  // S21: un portaobjetos limpio quedó en la platina, torcido y bajo la pinza cerrada: hay que abrirla y retirarlo.
  const loose = has(SB.LOOSE_SLIDE) ? { slideOnStage: 'sl2', slideOffsetMm: [6, 3] as [number, number], clampedSlideId: 'sl2' } : {};
  if (has(SB.LOOSE_SLIDE)) {
    const o = objects.find((x) => x.id === 'sl2')!;
    o.support = 'stage';
    o.pose = P(STAGE_SEAT.x + 0.6, STAGE_SEAT.y + 0.3, 0);
  }
  return {
    seed, mode, params, scenarios,
    objects,
    slides,
    covers: { cv1: { state: 'box', tiltDeg: 0, onSlide: null }, cv2: { state: 'box', tiltDeg: 0, onSlide: null } },
    dispensers: {
      dw: { ml: has(SB.LIMITED_DROPPER) ? 0.12 : params.dropperInitialMl, reagent: 'water' },
      iod: { ml: 5, reagent: 'lugol' },
    },
    dish: { leaves: 6, leafCm: has(SB.BIG_LEAF) ? params.bigLeafCm : params.leafCm, cutRequired: has(SB.BIG_LEAF) },
    stereoSamples: { leaf1: { assetId: 'leaf', damage01: 0 }, ins1: { assetId: has(SB.REFLECTIVE) ? 'insectShiny' : 'insect', damage01: 0 } },
    slideCase: { slots, home },
    assignment: { courseId: 'standard', freshAsset: 'elodea', fixedSlideIds: ['fx1'], stereoSampleIds: ['leaf1', 'ins1'] },
    microscope: {
      ...stage,
      ...loose,
      light01: has(SB.LOW_LIGHT) ? 0.05 : 0.4,
      condenser01: has(SB.CONDENSER) ? 0.2 : 0.9,
      clipOpen: !has(SB.CLIP_CLOSED) && !has(SB.LOOSE_SLIDE),
      // S20: el revólver quedó a medio camino entre 4X y 10X.
      turretDeg: has(SB.START_40X) ? 240 : has(SB.TURRET_BETWEEN) ? 60 : 0,
    },
    stereo: {
      ...(has(SB.STEREO_DEFOCUS) ? { focusTurns: 6 } : {}),
      // S22: zoom al máximo y la perilla de enfoque contra su tope superior.
      ...(has(SB.STEREO_HIGH) ? { zoomX: params.stereo.zoomRange[1], focusTurns: params.stereo.focusRangeMm / params.stereo.focusPitchMmPerTurn } : {}),
      ...(has(SB.STEREO_PAIR) ? { channelMode: 'stereo-pair' as const, ipdMm: 70, leftDiopter: 2, rightDiopter: -1 } : {}),
    },
    mounts,
  };
}
