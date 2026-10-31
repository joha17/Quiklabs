/**
 * Definición de la práctica B08 «Energía luminosa y pigmentos» (§1, §4): seis estaciones en orden A → D → E → B → C → F e
 * inventario de la mesada. Es una simulación: los solventes solo se dosifican de forma digital dentro de la campana (PFO-07).
 */
import type { B01Params, OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, GLASS_BIN, MIC_POS, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { TRASH_BIN } from '../../simulation/cell-world/geometry';
import { BALANCE, BOTTLES_HOME, BTB_DROPPER, BTB_RACK, BTB_TUBES, CO2_DISPENSER, COVER_SHELF, DEV_TUBE, DRAIN, GAS_RACK, GAS_TUBES, HOOD, LAMP2_HOME, LAMP_HOME, LEAF_HOME, MORTAR, ORGANIC_WASTE, PAPER_STAND, SEP_TUBE, SPRIGS_BTB, SPRIG_TRAY, TANK, VIAL } from '../../simulation/photo-world/geometry';
import { SC_B08 } from '../../simulation/photo-world/world';
import type { Sprig } from '../../simulation/photo-world/types';

export type B08Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B08_STATIONS: Array<{ id: 'A' | 'D' | 'E' | 'B' | 'C' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [68, 34, 6], dist: 88, elevation: 0.42 },
  { id: 'D', target: [186, 32, 8], dist: 96, elevation: 0.42 },
  { id: 'E', target: [395, 34, 8], dist: 74, elevation: 0.45 },
  { id: 'B', target: [468, 32, 8], dist: 72, elevation: 0.5 },
  { id: 'C', target: [512, 24, 10], dist: 92, elevation: 0.55 },
  { id: 'F', target: [530, 32, 6], dist: 80, elevation: 0.45 },
];

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

export function sprigsB08(scenarios: string[]): Record<string, Sprig> {
  const uneven = scenarios.includes(SC_B08.UNEVEN_MASS);
  return {
    el1: { g: 1, damaged: false }, el2: { g: uneven ? 1.3 : 1, damaged: false }, el3: { g: 1.6, damaged: false }, el4: { g: 1, damaged: true },
    elB1: { g: 4, damaged: false }, elB2: { g: 4, damaged: false },
  };
}

export function buildB08Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const has = (s: string) => scenarios.includes(s);
  const optional = has(SC_B08.TEACHER_PHOTOS) || has(SC_B08.STATIC_PHOTO) || has(SC_B08.UNCAL_PHOTO);
  const sprigAt = (i: number) => P(SPRIG_TRAY.x - 6 + i * 4, SPRIG_TRAY.y, SPRIG_TRAY.z);
  const objects: OpticalObject[] = [
    // A — pregunta, seguridad y residuos.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(30, 46), movable: false }),
    O({ id: 'board', kind: 'hypothesisBoard', pose: P(52, 20), movable: false, label: 'Pregunta e hipótesis' }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    // D — intercambio gaseoso.
    O({ id: 'sprigTray', kind: 'sprigTray', pose: P(SPRIG_TRAY.x, SPRIG_TRAY.y), movable: false, label: 'Ramas de Elodea' }),
    ...['el1', 'el2', 'el3', 'el4'].map((id, i) => O({ id, kind: 'elodeaSprig', pose: sprigAt(i), support: 'sprigTray', label: `Rama ${i + 1}` })),
    O({ id: 'gasRack', kind: 'gasRack', pose: P(GAS_RACK.x, GAS_RACK.y), movable: false, label: 'Gradilla de gases' }),
    O({ id: 'gL', kind: 'gasTube', pose: P(GAS_TUBES.gL.x, GAS_TUBES.gL.y, GAS_RACK.z - 5), support: 'gasRack', label: 'Tubo 1' }),
    O({ id: 'gD', kind: 'gasTube', pose: P(GAS_TUBES.gD.x, GAS_TUBES.gD.y, GAS_RACK.z - 5), support: 'gasRack', label: 'Tubo 2' }),
    O({ id: 'tank', kind: 'thermalTank', pose: P(TANK.x, TANK.y), movable: false, label: 'Baño amortiguador' }),
    O({ id: 'coverG', kind: 'darkCover', pose: P(COVER_SHELF.x, COVER_SHELF.y), label: 'Pantalla opaca' }),
    O({ id: 'lampG', kind: 'plantLamp', pose: P(LAMP_HOME.x, LAMP_HOME.y), label: 'Lámpara de gases' }),
    // Óptica compartida (módulo opcional S22–S24).
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(322, 12) }),
    // E — CO₂ e indicador.
    O({ id: 'btbRack', kind: 'btbRack', pose: P(BTB_RACK.x, BTB_RACK.y), movable: false, label: 'Gradilla BTB' }),
    O({ id: 'bN', kind: 'btbTube', pose: P(BTB_TUBES.bN.x, BTB_TUBES.bN.y, BTB_RACK.z - 4), support: 'btbRack', label: 'Control sin planta' }),
    O({ id: 'bL', kind: 'btbTube', pose: P(BTB_TUBES.bL.x, BTB_TUBES.bL.y, BTB_RACK.z - 4), support: 'btbRack', label: 'Planta y luz' }),
    O({ id: 'bD', kind: 'btbTube', pose: P(BTB_TUBES.bD.x, BTB_TUBES.bD.y, BTB_RACK.z - 4), support: 'btbRack', label: 'Planta y oscuridad' }),
    O({ id: 'elB1', kind: 'elodeaSprig', pose: P(SPRIGS_BTB.x, SPRIGS_BTB.y, 0.4), label: 'Rama A' }),
    O({ id: 'elB2', kind: 'elodeaSprig', pose: P(SPRIGS_BTB.x + 5, SPRIGS_BTB.y, 0.4), label: 'Rama B' }),
    O({ id: 'coverB', kind: 'darkCover', pose: P(SPRIGS_BTB.x, SPRIGS_BTB.y - 14), label: 'Pantalla opaca' }),
    O({ id: 'btbDrop', kind: 'btbDropper', pose: P(BTB_DROPPER.x, BTB_DROPPER.y), label: 'Gotero de BTB' }),
    O({ id: 'co2', kind: 'co2Dispenser', pose: P(CO2_DISPENSER.x, CO2_DISPENSER.y), movable: false, label: 'Dispensador de CO₂' }),
    O({ id: 'lampB', kind: 'plantLamp', pose: P(LAMP2_HOME.x, LAMP2_HOME.y), label: 'Lámpara de indicador' }),
    // B — extracción en campana.
    O({ id: 'hood', kind: 'fumeHood', pose: P(HOOD.x, HOOD.y), movable: false, label: 'Campana' }),
    ...Object.entries({ bA: 'Acetona', bW: 'Agua', bH: 'Fase hidrocarbonada', bE: 'Eluyente' }).map(([id, label]) => O({ id, kind: 'solventBottle', pose: P(BOTTLES_HOME[id].x, BOTTLES_HOME[id].y), label })),
    O({ id: 'balance', kind: 'leafBalance', pose: P(BALANCE.x, BALANCE.y), movable: false, label: 'Balanza' }),
    O({ id: 'leaf', kind: 'spinachLeaf', pose: P(LEAF_HOME.x, LEAF_HOME.y, LEAF_HOME.z), label: 'Hoja de espinaca' }),
    O({ id: 'mortar', kind: 'mortar', pose: P(MORTAR.x, MORTAR.y), movable: false, label: 'Mortero' }),
    O({ id: 'sep', kind: 'sepTube', pose: P(SEP_TUBE.x, SEP_TUBE.y), movable: false, label: 'Tubo de extracción' }),
    O({ id: 'vial', kind: 'extractVial', pose: P(VIAL.x, VIAL.y), label: 'Vial de extracto' }),
    // C — cromatografía.
    O({ id: 'stand', kind: 'paperStand', pose: P(PAPER_STAND.x, PAPER_STAND.y), movable: false, label: 'Tablero y regla' }),
    O({ id: 'paper', kind: 'chromPaper', pose: P(PAPER_STAND.x, PAPER_STAND.y, PAPER_STAND.z), support: 'paperStand', label: 'Papel cromatográfico' }),
    O({ id: 'devTube', kind: 'devTube', pose: P(DEV_TUBE.x, DEV_TUBE.y), movable: false, label: 'Tubo de desarrollo' }),
    // F — cierre.
    O({ id: 'organicWaste', kind: 'organicWaste', pose: P(ORGANIC_WASTE.x, ORGANIC_WASTE.y), movable: false, label: 'Residuo orgánico' }),
    O({ id: 'drain', kind: 'drainSink', pose: P(DRAIN.x, DRAIN.y), movable: false, label: 'Desagüe' }),
  ];
  const slides: OpticalWorld['slides'] = {};
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  if (optional) {
    const sp = caseSlotPos(0);
    objects.push(O({ id: 'fxE', kind: 'fixedSlide', pose: P(sp.x, sp.y, sp.z), support: `case:${caseSlotId(0)}`, label: 'Elodea: cloroplastos' }));
    slots[caseSlotId(0)] = 'fxE';
    home.fxE = caseSlotId(0);
    slides.fxE = { kind: 'fixed', dirty01: 0, faceDown: false, assetId: 'elodeaDense', label: 'Elodea: cloroplastos' };
  }
  return {
    seed, mode, params, scenarios, objects, slides, covers: {}, dispensers: {},
    dish: { leaves: 0, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: {},
    slideCase: { slots, home },
    assignment: { courseId: has(SC_B08.TEACHER_PHOTOS) ? 'curso-demo' : 'standard', freshAsset: 'elodeaDense', fixedSlideIds: optional ? ['fxE'] : [], stereoSampleIds: [] },
    microscope: {},
    stereo: {},
    mounts: {},
  };
}
