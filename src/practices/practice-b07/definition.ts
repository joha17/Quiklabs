/**
 * Definición de la práctica B07 «Microbiología en evidencia: medios, colonias y tinción de Gram» (§1, §4): seis
 * estaciones e inventario de la mesada. Todo es virtual y sellado: no hay cultivo, incubación ni llama; el autoclave y el
 * mechero son maquetas no operables. Poses en cm.
 */
import type { B01Params, OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, CLEAN_TRAY, GLASS_BIN, MIC_POS, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { TRASH_BIN } from '../../simulation/cell-world/geometry';
import { AUTOCLAVE_POS, BROTH_POS, BURNER_POS, CARDS_B07, LOOP_POS, MEDIA_POS, OIL_B07, PLATE_TRAY, RESTRICTED_POS, SMEAR_PAD, STAIN_POS, STAIN_RACK, STREAK_BOARD, VIEWER, slidePosB07, trayPos } from '../../simulation/micro-world/geometry';
import { SC_B07 } from '../../simulation/micro-world/world';
import type { PlateState } from '../../simulation/micro-world/types';
import type { PlateProfile } from '../../simulation/micro-world/model';

export type B07Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B07_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [80, 32, 8], dist: 92, elevation: 0.42 },
  { id: 'B', target: [188, 32, 4], dist: 72, elevation: 0.72 },
  { id: 'C', target: [214, 30, 6], dist: 48, elevation: 0.85 },
  { id: 'D', target: [418, 28, 6], dist: 72, elevation: 0.6 },
  { id: 'E', target: [290, 32, 16], dist: 88, elevation: 0.32 },
  { id: 'F', target: [505, 30, 6], dist: 85, elevation: 0.45 },
];

export const SLIDES_B07 = ['sl1', 'sl2', 'sl3'];
export const BROKEN_SLIDE_B07 = 'sl4';
export const PLATES_ASSIGNED = ['plA', 'plB'];

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

export function platesB07(scenarios: string[]): Record<string, PlateState> {
  const has = (s: string) => scenarios.includes(s);
  const profile: PlateProfile = has(SC_B07.CONFLUENT) ? 'confluent' : has(SC_B07.ISOLATED) ? 'isolated' : has(SC_B07.PIGMENTED) ? 'pigmented' : has(SC_B07.MIXED) ? 'mixed' : has(SC_B07.INCOMPATIBLE) ? 'incompatible' : 'typical';
  const swap = has(SC_B07.SWAPPED);
  return {
    plA: { medium: 'mNA', profile, assigned: true, control: false, restricted: false, label: swap ? 'Placa B' : 'Placa A' },
    plB: { medium: 'mEMB', profile: 'emb', assigned: true, control: false, restricted: false, label: swap ? 'Placa A' : 'Placa B' },
    plC: { medium: 'mNA', profile: 'blank', assigned: false, control: true, restricted: false, label: 'Control del lote' },
    plX: { medium: 'mNA', profile: 'typical', assigned: false, control: false, restricted: false, label: 'Placa de otro grupo' },
    plR: { medium: 'mNA', profile: 'typical', assigned: false, control: false, restricted: true, label: 'Placa restringida' },
  };
}

/** Láminas de control y de recurso de la caja (Gram ya hecho; no se editan). */
export function controlSlidesB07(scenarios: string[]): Array<{ id: string; assetId: string; slot: number; label: string }> {
  const has = (s: string) => scenarios.includes(s);
  const t2 = has(SC_B07.TEACHER);
  const out = [
    { id: 'fxP', assetId: t2 ? 'gramPosVT2' : 'gramPosV', slot: 0, label: 'Control Gram positivo' },
    { id: 'fxN', assetId: t2 ? 'gramNegPT2' : 'gramNegP', slot: 2, label: 'Control Gram negativo' },
  ];
  if (has(SC_B07.MIXED)) out.push({ id: 'fxM', assetId: 'gramMixed', slot: 4, label: 'Preparación mixta validada' });
  if (has(SC_B07.OVER_RESOURCE)) out.push({ id: 'fxO', assetId: 'gramPosP', slot: 6, label: 'Recurso: exceso de decoloración' });
  if (has(SC_B07.UNDER_RESOURCE)) out.push({ id: 'fxU', assetId: 'gramNegV', slot: 8, label: 'Recurso: defecto de decoloración' });
  if (has(SC_B07.THICK)) out.push({ id: 'fxT', assetId: 'gramThick', slot: 10, label: 'Recurso: preparación muy espesa' });
  return out;
}

export function buildB07Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const has = (s: string) => scenarios.includes(s);
  const plates = platesB07(scenarios);
  const look = has(SC_B07.LOOKALIKE);
  const objects: OpticalObject[] = [
    // A — seguridad, medios y residuos.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(30, 46), movable: false }),
    O({ id: 'cards', kind: 'sampleCards', pose: P(CARDS_B07.x, CARDS_B07.y), movable: false, label: 'Fichas de medios' }),
    O({ id: 'mNA', kind: 'mediaJar', pose: P(MEDIA_POS.mNA.x, MEDIA_POS.mNA.y), movable: false, label: look ? 'Frasco 1' : 'Agar nutritivo' }),
    O({ id: 'mEMB', kind: 'mediaJar', pose: P(MEDIA_POS.mEMB.x, MEDIA_POS.mEMB.y), movable: false, label: look ? 'Frasco 2' : 'Agar EMB' }),
    O({ id: 'mNB', kind: 'mediaJar', pose: P(MEDIA_POS.mNB.x, MEDIA_POS.mNB.y), movable: false, label: look ? 'Frasco 3' : 'Caldo nutritivo' }),
    O({ id: 'brA', kind: 'brothTube', pose: P(BROTH_POS.x, BROTH_POS.y), movable: false, label: 'Caldo sellado' }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    // B — placas selladas, trazado digital y asa.
    O({ id: 'plateTray', kind: 'plateTray', pose: P(PLATE_TRAY.x, PLATE_TRAY.y), movable: false }),
    ...['plA', 'plB', 'plC', 'plX'].map((id, i) => O({ id, kind: 'petriPlate', pose: P(trayPos(i).x, trayPos(i).y, trayPos(i).z), support: 'plateTray', label: plates[id].label })),
    O({ id: 'plR', kind: 'petriPlate', pose: P(RESTRICTED_POS.x, RESTRICTED_POS.y), support: 'restrictedRack', movable: false, label: plates.plR.label }),
    O({ id: 'board', kind: 'streakBoard', pose: P(STREAK_BOARD.x, STREAK_BOARD.y), movable: false }),
    O({ id: 'loop', kind: 'transferLoop', pose: P(LOOP_POS.x, LOOP_POS.y, 0.4), label: 'Asa virtual' }),
    // C — visor macroscópico con retícula.
    O({ id: 'viewer', kind: 'plateViewer', pose: P(VIEWER.x, VIEWER.y), movable: false }),
    // D — frotis y tinción.
    O({ id: 'pad', kind: 'smearPad', pose: P(SMEAR_PAD.x, SMEAR_PAD.y), movable: false }),
    O({ id: 'rackB', kind: 'stainRack', pose: P(STAIN_RACK.x, STAIN_RACK.y), movable: false }),
    O({ id: 'stP', kind: 'stainBottle', pose: P(STAIN_POS.stP.x, STAIN_POS.stP.y), label: 'Primario' }),
    O({ id: 'stM', kind: 'stainBottle', pose: P(STAIN_POS.stM.x, STAIN_POS.stM.y), label: 'Mordiente' }),
    O({ id: 'stD', kind: 'stainBottle', pose: P(STAIN_POS.stD.x, STAIN_POS.stD.y), label: 'Decolorante' }),
    O({ id: 'stC', kind: 'stainBottle', pose: P(STAIN_POS.stC.x, STAIN_POS.stC.y), label: 'Contraste' }),
    O({ id: 'stW', kind: 'stainBottle', pose: P(STAIN_POS.stW.x, STAIN_POS.stW.y), label: 'Lavado' }),
    ...[...SLIDES_B07, BROKEN_SLIDE_B07].map((id, i) => O({ id, kind: 'slide', pose: P(slidePosB07(i * 3).x, slidePosB07(i * 3).y, 0.05), label: id === BROKEN_SLIDE_B07 ? 'Portaobjetos (roto)' : undefined })),
    // E — microscopio compartido, caja de controles y aceite (solo con el módulo 100X).
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    ...(has(SC_B07.IMMERSION) ? [O({ id: 'oil', kind: 'oilBottle', pose: P(OIL_B07.x, OIL_B07.y), movable: false, label: 'Aceite de inmersión' })] : []),
    O({ id: 'lp', kind: 'lensPaper', pose: P(322, 12) }),
    // F — cierre y maquetas no operables.
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x, CLEAN_TRAY.y), movable: false }),
    O({ id: 'autoclave', kind: 'autoclaveMock', pose: P(AUTOCLAVE_POS.x, AUTOCLAVE_POS.y), movable: false }),
    O({ id: 'burner', kind: 'burnerMock', pose: P(BURNER_POS.x, BURNER_POS.y), movable: false }),
  ];
  const slides: OpticalWorld['slides'] = Object.fromEntries([...SLIDES_B07, BROKEN_SLIDE_B07].map((id) => [id, { kind: 'fixed' as const, dirty01: 0, faceDown: false, assetId: 'smearBlank' }]));
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  const controls = controlSlidesB07(scenarios);
  for (const f of controls) {
    const sp = caseSlotPos(f.slot);
    objects.push(O({ id: f.id, kind: 'fixedSlide', pose: P(sp.x, sp.y, sp.z), support: `case:${caseSlotId(f.slot)}`, label: f.label }));
    slots[caseSlotId(f.slot)] = f.id;
    home[f.id] = caseSlotId(f.slot);
    slides[f.id] = { kind: 'fixed', dirty01: 0, faceDown: false, assetId: f.assetId, label: f.label };
  }
  return {
    seed, mode, params, scenarios,
    objects,
    slides,
    covers: {},
    dispensers: {},
    dish: { leaves: 0, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: {},
    slideCase: { slots, home },
    assignment: { courseId: has(SC_B07.TEACHER) ? 'curso-demo' : 'standard', freshAsset: 'smearBlank', fixedSlideIds: [...controls.map((f) => f.id), ...SLIDES_B07], stereoSampleIds: [] },
    microscope: { ...(has(SC_B07.BRIGHT) ? { light01: 0.98 } : {}), ...(has(SC_B07.OFFCENTER) ? { stageXmm: 5, stageYmm: -3 } : {}) },
    stereo: {},
    mounts: {},
  };
}
