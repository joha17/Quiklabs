/**
 * Definición de la práctica B05 «Cinética en acción: catalasa, amilasa y regulación enzimática» (§1, §4): siete
 * estaciones, inventario de la mesada (el microscopio y la preparación de papa con Lugol de B02 más la balanza, los
 * polvos, el hígado, las placas con agitador, la cristalería, las gradillas con dieciséis tubos, el colector de gas, los
 * goteros de ensayo, los baños María y el módulo ADH) y el estado enzimático inicial según los escenarios. Poses en cm.
 */
import type { B01Params, OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CLEAN_TRAY, COVER_BOX, GLASS_BIN, MIC_POS, PREP_SPOT } from '../../simulation/optical-world/geometry';
import { BOARD_POS, SOURCE_ROW_Y, SOURCE_X, TRASH_BIN, slidePos } from '../../simulation/cell-world/geometry';
import {
  ADH_BOTTLES, BALANCE_POS, BAR_HOME, BATH_POS, BEAKER_HOME, BOTTLE_IDS_B05, BOTTLE_POS_B05, BURNER_POS_B05, CLOCK_POS, COLLECTOR_POS, CUVETTE_HOME,
  CYLINDER_HOME, DROPPER_POS_B05, GEO_B05, JAR_POS, LIVER_BOARD, LIVER_KNIFE, LIVER_POS, PIPETTE_HOME, PLATE_POS, RACK_POS, RINSE_POS, SPATULA_HOME,
  STRIPS_POS, THERMO_POS_B05, TONGS_HOME, TUBE_IDS_B05, UV_POS, WASTE_POS, bathSlot, rackOfTube, tubeHome,
} from '../../simulation/enz-world/geometry';
import { SC_B05, ADH_SCENARIOS } from '../../simulation/enz-world/scenarios';
import { emptyVesselB05 } from '../../simulation/enz-world/world';
import { noSpecies } from '../../simulation/enz-world/chemistry';
import type { EnzState, EnzTube, EnzVessel, Species } from '../../simulation/enz-world/types';
import { hashRange } from '../../simulation/core/rng';
import { STOCKS_B05 } from './params';

export type B05Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B05_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [36, 30, 6], dist: 80, elevation: 0.5 },
  { id: 'B', target: [350, 34, 8], dist: 74, elevation: 0.5 },
  { id: 'C', target: [510, 28, 8], dist: 62, elevation: 0.48 },
  { id: 'D', target: [418, 30, 10], dist: 66, elevation: 0.42 },
  { id: 'E', target: [464, 30, 8], dist: 66, elevation: 0.46 },
  { id: 'F', target: [210, 30, 12], dist: 90, elevation: 0.42 },
  { id: 'G', target: [542, 38, 8], dist: 56, elevation: 0.48 },
];

export const BOTTLES_B05: Array<{ id: string; label: string; capacityMl: number; volumeMl: number }> = [
  { id: 'bW', label: 'Agua destilada', capacityMl: 500, volumeMl: 400 },
  { id: 'hp', label: 'H₂O₂ 0,100 mol/L', capacityMl: 250, volumeMl: 150 },
  { id: 'hpOld', label: 'H₂O₂ (frasco abierto, fecha vencida)', capacityMl: 250, volumeMl: 100 },
  { id: 'st1', label: 'Almidón soluble ~1 % (docente)', capacityMl: 100, volumeMl: 60 },
  { id: 'naoh', label: 'NaOH 1 mol/L (frasco madre)', capacityMl: 100, volumeMl: 50 },
];
export const ADH_BOTTLES_B05: Array<{ id: string; label: string; capacityMl: number; volumeMl: number }> = [
  { id: 'nad', label: 'NAD⁺ 10 mmol/L (virtual)', capacityMl: 20, volumeMl: 10 },
  { id: 'eth', label: 'Etanol 30 mmol/L (virtual)', capacityMl: 50, volumeMl: 30 },
  { id: 'eth2', label: 'Etanol 60 mmol/L (virtual)', capacityMl: 50, volumeMl: 30 },
  { id: 'meth', label: 'Metanol 0,5 mol/L (restringido, virtual)', capacityMl: 20, volumeMl: 10 },
  { id: 'adh', label: 'ADH de levadura (virtual)', capacityMl: 10, volumeMl: 5 },
];
export const DROPPERS_B05: Array<{ id: string; label: string; capacityMl: number; volumeMl: number }> = [
  { id: 'dL', label: 'Lugol', capacityMl: 15, volumeMl: 10 },
  { id: 'dB', label: 'Benedict', capacityMl: 30, volumeMl: 20 },
  { id: 'dH', label: 'HCl 1 mol/L', capacityMl: 15, volumeMl: 10 },
  { id: 'dN', label: 'NaOH 1 mol/L', capacityMl: 15, volumeMl: 10 },
  { id: 'dw2', label: 'Agua destilada', capacityMl: 30, volumeMl: 25 },
];
export const LIVERS_B05: Array<{ id: string; label: string; blindLabel: string; massG: number }> = [
  { id: 'liv', label: 'Hígado asignado', blindLabel: 'Muestra X', massG: 10 },
  { id: 'livB', label: 'Hígado (lote B)', blindLabel: 'Muestra Y', massG: 10 },
  { id: 'livH', label: 'Hígado (lote reutilizado)', blindLabel: 'Muestra Z', massG: 10 },
];
export const SLIDES_B05 = ['sl1', 'sl2', 'sl3'];
export const COVERS_B05 = ['cv1', 'cv2', 'cv3', 'cv4'];
/** Goteros del montaje de papa (mundo celular de B02). */
export const CELL_DROPPERS_B05 = [
  { id: 'dw', reagent: 'water' as const, label: 'Agua destilada', x: 196 },
  { id: 'iod', reagent: 'lugol' as const, label: 'Lugol', x: 204 },
];

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });
const has = (scenarios: string[], s: string) => scenarios.includes(s);

/** Fuentes de hígado sobre la mesada: la asignada siempre; el lote B (SC03) y el reutilizado/precalentado (SC09) solo en su escenario. */
export const liversOf = (scenarios: string[]) => LIVERS_B05.filter((l) => l.id === 'liv' || (l.id === 'livB' && has(scenarios, SC_B05.OTHER_LOT)) || (l.id === 'livH' && has(scenarios, SC_B05.PREHEATED)));
export const adhEnabledFor = (scenarios: string[]) => !has(scenarios, SC_B05.NO_UV_CURVE) && ADH_SCENARIOS.some((s) => scenarios.includes(s));

export function buildB05Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const blind = has(scenarios, SC_B05.BLIND);
  const objects: OpticalObject[] = [
    // A — seguridad y residuos (los de B02 para láminas y cubreobjetos; tres contenedores químicos codificados).
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    O({ id: 'wAq', kind: 'enzWaste', pose: P(WASTE_POS.wAq.x, WASTE_POS.wAq.y), movable: false, label: 'Residuos acuosos (peróxido, almidón)' }),
    O({ id: 'wCu', kind: 'enzWaste', pose: P(WASTE_POS.wCu.x, WASTE_POS.wCu.y), movable: false, label: 'Residuos de cobre y yodo' }),
    O({ id: 'wBio', kind: 'enzWaste', pose: P(WASTE_POS.wBio.x, WASTE_POS.wBio.y), movable: false, label: 'Residuos biológicos (tejido)' }),
    // F — montaje de papa con Lugol y microscopio compartido (B01/B02).
    O({ id: 'prepBoard', kind: 'prepBoard', pose: P(PREP_SPOT.x, PREP_SPOT.y), movable: false }),
    O({ id: 'board', kind: 'cuttingBoard', pose: P(BOARD_POS.x, BOARD_POS.y), movable: false, label: 'Tabla de corte' }),
    O({ id: 'pot', kind: 'tissueSource', pose: P(SOURCE_X.pot, SOURCE_ROW_Y), movable: false, label: 'Papa cruda' }),
    ...CELL_DROPPERS_B05.map((d) => O({ id: d.id, kind: 'dropperBottle', pose: P(d.x, 36), label: d.label })),
    ...SLIDES_B05.map((id, i) => O({ id, kind: 'slide', pose: P(slidePos(i).x, slidePos(i).y, 0.05) })),
    O({ id: 'cvBox', kind: 'coverBox', pose: P(COVER_BOX.x, COVER_BOX.y), movable: false }),
    ...COVERS_B05.map((id, i) => O({ id, kind: 'coverslip', pose: P(COVER_BOX.x - 1.4 + (i % 4) * 0.9, COVER_BOX.y - 0.5, COVER_BOX.z), support: 'coverBox' })),
    O({ id: 'fc', kind: 'forceps', pose: P(172, 18, 0.4) }),
    O({ id: 'sc', kind: 'scalpel', pose: P(180, 18, 0.4) }),
    O({ id: 'sp', kind: 'spatula', pose: P(188, 18, 0.4) }),
    O({ id: 'pp', kind: 'paper', pose: P(170, 28) }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(182, 28) }),
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    O({ id: 'cleanTray', kind: 'cleanTray', pose: P(CLEAN_TRAY.x, CLEAN_TRAY.y), movable: false }),
    // B — preparaciones: balanza, bote, polvos, espátula, hígado, tabla, cuchillo, placas, pastillas, beakers, probetas, agua.
    O({ id: 'bal', kind: 'enzBalance', pose: P(BALANCE_POS.x, BALANCE_POS.y), movable: false, label: 'Balanza 0,01 g' }),
    O({ id: 'wb', kind: 'enzBoat', pose: P(BALANCE_POS.x + 10, BALANCE_POS.y + 10), label: 'Bote de pesaje' }),
    O({ id: 'jS', kind: 'enzJar', pose: P(JAR_POS.jS.x, JAR_POS.jS.y), label: 'Almidón en polvo' }),
    O({ id: 'jA', kind: 'enzJar', pose: P(JAR_POS.jA.x, JAR_POS.jA.y), label: has(scenarios, SC_B05.AMYLASE_UNKNOWN) ? 'Amilasa comercial (dilución desconocida)' : 'Amilasa comercial' }),
    O({ id: 'sp2', kind: 'enzSpatula', pose: P(SPATULA_HOME.x, SPATULA_HOME.y, 0.4), label: 'Espátula de pesaje' }),
    ...liversOf(scenarios).map((l) => O({ id: l.id, kind: 'enzLiver', pose: P(LIVER_POS[l.id].x, LIVER_POS[l.id].y), movable: false, label: blind ? l.blindLabel : l.label })),
    O({ id: 'bdL', kind: 'enzBoard', pose: P(LIVER_BOARD.x, LIVER_BOARD.y), movable: false, label: 'Tabla para hígado' }),
    O({ id: 'ls', kind: 'enzKnife', pose: P(LIVER_KNIFE.x, LIVER_KNIFE.y, 0.4), label: 'Bisturí para hígado' }),
    ...(['hp1', 'hp2'] as const).map((id, i) => O({ id, kind: 'enzPlate', pose: P(PLATE_POS[id].x, PLATE_POS[id].y), movable: false, label: `Placa con agitador ${i + 1}` })),
    ...(['sb1', 'sb2'] as const).map((id, i) => O({ id, kind: 'enzStirBar', pose: P(BAR_HOME[id].x, BAR_HOME[id].y, 0.3), label: `Pastilla magnética ${i + 1}` })),
    ...Object.entries(GEO_B05.beaker).map(([id, g]) => O({ id, kind: 'enzBeaker', pose: P(BEAKER_HOME[id].x, BEAKER_HOME[id].y), label: `Beaker ${g.capMl} mL` })),
    ...Object.entries(GEO_B05.cylinder).map(([id, g]) => O({ id, kind: 'enzCylinder', pose: P(CYLINDER_HOME[id].x, CYLINDER_HOME[id].y), label: `Probeta ${g.capMl} mL` })),
    ...BOTTLES_B05.map((b) => O({ id: b.id, kind: 'enzBottle', pose: P(BOTTLE_POS_B05[b.id].x, BOTTLE_POS_B05[b.id].y), label: b.label })),
    // D — catalasa: gradilla 1, pipetas, colector, cronómetro 1 y vaso de enjuague.
    O({ id: 'rk1', kind: 'enzRack', pose: P(RACK_POS.rk1.x, RACK_POS.rk1.y), movable: false, label: 'Gradilla 1 (catalasa)' }),
    O({ id: 'rk2', kind: 'enzRack', pose: P(RACK_POS.rk2.x, RACK_POS.rk2.y), movable: false, label: 'Gradilla 2 (amilasa)' }),
    ...TUBE_IDS_B05.map((id, i) => {
      const h = tubeHome(id);
      return O({ id, kind: 'enzTube', pose: P(h.x, h.y, h.z), support: rackOfTube(id), label: `Tubo ${i + 1}` });
    }),
    ...(['p1', 'p5', 'p10'] as const).map((id) => O({ id, kind: 'enzPipette', pose: P(PIPETTE_HOME[id].x, PIPETTE_HOME[id].y, 0.6), label: `Pipeta ${id.slice(1)} mL` })),
    O({ id: 'gc', kind: 'enzCollector', pose: P(COLLECTOR_POS.x, COLLECTOR_POS.y), movable: false, label: 'Captador de gas 0–50 mL' }),
    O({ id: 'sw1', kind: 'enzClock', pose: P(CLOCK_POS.sw1.x, CLOCK_POS.sw1.y), movable: false, label: 'Cronómetro 1 (catalasa)' }),
    O({ id: 'sw2', kind: 'enzClock', pose: P(CLOCK_POS.sw2.x, CLOCK_POS.sw2.y), movable: false, label: 'Cronómetro 2 (amilasa)' }),
    O({ id: 'rb', kind: 'enzRinse', pose: P(RINSE_POS.x, RINSE_POS.y), movable: false, label: 'Vaso de enjuague' }),
    // E — amilasa: goteros de ensayo y tiras de pH.
    ...DROPPERS_B05.map((d) => O({ id: d.id, kind: 'enzDropper', pose: P(DROPPER_POS_B05[d.id].x, DROPPER_POS_B05[d.id].y), label: d.label })),
    O({ id: 'ps', kind: 'enzStrips', pose: P(STRIPS_POS.x, STRIPS_POS.y), movable: false, label: has(scenarios, SC_B05.STRIPS_COARSE) ? 'Tiras de pH (escala de 2 unidades)' : 'Tiras de pH' }),
    // C — baños, pinza y termómetro (SC28: la pinza quedó dentro del baño 2).
    ...(['wb1', 'wb2'] as const).map((id, i) => O({ id, kind: 'enzBath', pose: P(BATH_POS[id].x, BATH_POS[id].y), movable: false, label: i === 0 ? 'Baño María 1 (incubación)' : 'Baño María 2 (Benedict)' })),
    has(scenarios, SC_B05.TONGS_MISPLACED)
      ? O({ id: 'tg', kind: 'enzTongs', pose: P(bathSlot('wb2', 0).x, bathSlot('wb2', 0).y, 2), support: 'wb2', label: 'Pinza de tubos' })
      : O({ id: 'tg', kind: 'enzTongs', pose: P(TONGS_HOME.x, TONGS_HOME.y, 0.4), label: 'Pinza de tubos' }),
    O({ id: 'th', kind: 'enzThermo', pose: P(THERMO_POS_B05.x, THERMO_POS_B05.y, 0.4), label: 'Termómetro' }),
    // G — ADH (bloqueado salvo asignación): fotómetro UV, cubetas, frascos virtuales y mechero.
    O({ id: 'uv', kind: 'enzPhotometer', pose: P(UV_POS.x, UV_POS.y), movable: false, label: 'Fotómetro UV (340 nm)' }),
    O({ id: 'cq', kind: 'enzCuvette', pose: P(CUVETTE_HOME.cq.x, CUVETTE_HOME.cq.y), label: 'Cubeta de cuarzo 1 cm' }),
    O({ id: 'cs', kind: 'enzCuvette', pose: P(CUVETTE_HOME.cs.x, CUVETTE_HOME.cs.y), label: 'Cubeta de cuarzo 0,5 cm' }),
    O({ id: 'cp', kind: 'enzCuvette', pose: P(CUVETTE_HOME.cp.x, CUVETTE_HOME.cp.y), label: 'Cubeta de plástico (visible)' }),
    ...ADH_BOTTLES_B05.map((b) => O({ id: b.id, kind: 'enzBottle', pose: P(BOTTLE_POS_B05[b.id].x, BOTTLE_POS_B05[b.id].y), label: b.label })),
    O({ id: 'bn', kind: 'enzBurner', pose: P(BURNER_POS_B05.x, BURNER_POS_B05.y), movable: false, label: 'Mechero' }),
  ];
  return {
    seed, mode, params, scenarios: [],
    objects,
    slides: Object.fromEntries(SLIDES_B05.map((id) => [id, { kind: 'blank' as const, dirty01: 0, faceDown: false }])),
    covers: Object.fromEntries(COVERS_B05.map((id) => [id, { state: 'box' as const, tiltDeg: 0, onSlide: null }])),
    dispensers: Object.fromEntries(CELL_DROPPERS_B05.map((d) => [d.id, { ml: d.reagent === 'water' ? params.dropperInitialMl : 5, reagent: d.reagent }])),
    dish: { leaves: 0, leafCm: params.leafCm, cutRequired: false },
    stereoSamples: {},
    slideCase: { slots: {}, home: {} },
    assignment: { courseId: 'standard', freshAsset: 'elodea', fixedSlideIds: [], stereoSampleIds: [] },
    microscope: {},
    stereo: {},
    mounts: {},
  };
}

const sp = (fill: Partial<Species>): Species => ({ ...noSpecies(), ...fill });
const vessel = (capacityMl: number, volumeMl = 0, perMl: Partial<Species> = {}, tag?: string, tK = 298.15): EnzVessel => ({
  ...emptyVesselB05(capacityMl, tK),
  volumeMl,
  s: sp(Object.fromEntries(Object.entries(perMl).map(([k, v]) => [k, (v ?? 0) * volumeMl]))),
  tags: tag ? [tag] : [],
});

export const emptyTubeB05 = (label: string | null = null): EnzTube => ({
  label, sources: [], drops: { lugol: 0, benedict: 0, acid: 0, base: 0, water: 0 }, h2o2Adds: 0, reactionAt: null, contactAt: null, glyAtContact: null, catAtStart: null,
  tissueAtStartMg: null, aliquotOf: null, sampledAfterS: null, sampledClockS: null, aliquotMl: 0, stoppered: false, bath: null, hotDoseS: 0, boilS: 0,
  maxTK: 298.15, harmS: 0, shakes: [], foamMl: 0, readAt: null, discarded: false, film: false, tSum: 0, tN: 0,
});

/** Estado enzimático inicial (frascos llenos, lotes sin preparar, tubos limpios) según los escenarios docentes. */
export function buildEnzState(seed: number, params: B01Params, scenarios: string[]): EnzState {
  const p = params.enz!;
  const a = p.activity;
  const bufMl = p.bufferMmolMl;
  const vessels: Record<string, EnzVessel> = {};
  const h2o2 = has(scenarios, SC_B05.OLD_PEROXIDE) ? STOCKS_B05.h2o2Old : p.h2o2M;
  const stock: Record<string, Partial<Species>> = {
    bW: {},
    // Peróxido estabilizado con ácido (SC10): el frasco aporta ácido además del tampón.
    hp: { h2o2, buf: bufMl, acid: has(scenarios, SC_B05.PH_EXTREME) ? 0.006 : 0 },
    hpOld: { h2o2: STOCKS_B05.h2o2Old, buf: bufMl },
    st1: { starch: STOCKS_B05.starchSoluble, pigment: has(scenarios, SC_B05.PIGMENTED_STARCH) ? STOCKS_B05.pigmentStarch : 0 },
    naoh: { acid: -STOCKS_B05.naoh },
    nad: { nad: has(scenarios, SC_B05.ADH_NAD_LIMIT) ? STOCKS_B05.nad / 10 : STOCKS_B05.nad, buf: 0.05 },
    eth: { ethanol: STOCKS_B05.ethanol, buf: 0.05 },
    eth2: { ethanol: STOCKS_B05.ethanol2, buf: 0.05 },
    meth: { methanol: STOCKS_B05.methanol },
    adh: { adhAct: a.adhUPerMl, buf: 0.05 },
    dL: { iodine: STOCKS_B05.lugolI2 },
    dB: { cu: p.benedict.cuMmolMl, acid: -p.benedict.baseMmolMl },
    dH: { acid: STOCKS_B05.hcl },
    dN: { acid: -STOCKS_B05.naoh },
    dw2: {},
  };
  for (const b of [...BOTTLES_B05, ...ADH_BOTTLES_B05, ...DROPPERS_B05]) vessels[b.id] = vessel(b.capacityMl, b.volumeMl, stock[b.id], b.id);
  for (const [id, g] of Object.entries(GEO_B05.beaker)) vessels[id] = vessel(g.capMl);
  for (const [id, g] of Object.entries(GEO_B05.cylinder)) vessels[id] = vessel(g.capMl);
  for (const [id, c] of Object.entries(p.pipettes)) vessels[id] = vessel(c.capMl);
  for (const id of ['wAq', 'wCu', 'wBio']) vessels[id] = vessel(2000);
  for (const id of ['cq', 'cs', 'cp']) vessels[id] = vessel(4);
  vessels.rb = vessel(250, 150, {}, 'bW');
  // Capacidad finita: el estado viaja como JSON (Infinity llegaría como null y la repetición no coincidiría).
  vessels.spill = vessel(1e9);
  const tubes: Record<string, EnzTube> = {};
  for (const id of TUBE_IDS_B05) {
    vessels[id] = vessel(GEO_B05.tube.capMl);
    tubes[id] = emptyTubeB05();
  }
  // Gradilla con rótulos ambiguos (SC14): dos tubos llegan marcados con un rótulo que no distingue blanco de ensayo.
  if (has(scenarios, SC_B05.AMBIGUOUS_LABELS)) {
    tubes.t1.label = 'C?';
    tubes.t2.label = 'C?';
  }
  // Hígado: actividad por gramo del lote (SC02 menor, SC16 de liberación rápida) y fracción activa de cada fuente.
  let uPerG = a.liverUPerG;
  if (has(scenarios, SC_B05.LOW_ACTIVITY)) uPerG *= 0.4;
  if (has(scenarios, SC_B05.FAST_CATALASE)) uPerG *= 2.5;
  const liver: EnzState['liver'] = {};
  for (const l of liversOf(scenarios)) {
    const total = l.massG * uPerG * (l.id === 'livB' ? a.lotBFactor : 1);
    const active01 = l.id === 'livH' ? a.preheatedActive01 : a.liverActive01;
    liver[l.id] = { massG: l.massG, catU: total * active01, catDenU: total * (1 - active01) };
  }
  const adhEnabled = adhEnabledFor(scenarios);
  void seed;
  return {
    vessels, tubes,
    batches: { P1: null, P2: null, P3: null },
    plates: { hp1: { heatOn: false, setK: 298.15, rpm: 0 }, hp2: { heatOn: false, setK: 298.15, rpm: 0 } },
    bars: { sb1: null, sb2: null },
    baths: Object.fromEntries((['wb1', 'wb2'] as const).map((id) => [id, {
      on: false, setK: id === 'wb1' ? 308.15 : 363.15, tK: p.ambientK,
      // Error del sensor del baño de incubación (SC08) e inercia térmica mayor (SC07).
      offsetK: id === 'wb1' && has(scenarios, SC_B05.BATH_OFFSET) ? 1.5 : 0,
      tauS: p.bath.tauS * (has(scenarios, SC_B05.BATH_INERTIA) ? 4 : 1),
      stableSince: null,
    }])),
    balance: { tareG: 0, tared: false },
    powders: { jS: 100, jA: 5 },
    spatula: {},
    boat: {},
    liver,
    board: null,
    boatTissue: null,
    collector: {
      tubeId: null, seal01: 1, stopcockOpen: true, gasMmol: 0, connectedAt: null,
      // Captador descalibrado (SC06): cero corrido y escala distinta de 1.
      offsetMl: has(scenarios, SC_B05.COLLECTOR_BIAS) ? 1.5 : 0,
      scale: has(scenarios, SC_B05.COLLECTOR_BIAS) ? 0.96 : 1,
    },
    clocks: { sw1: { running: false, startedAt: 0, accumS: 0 }, sw2: { running: false, startedAt: 0, accumS: 0 } },
    pours: {},
    pipettes: Object.fromEntries(Object.keys(p.pipettes).map((id) => [id, { from: null, residueFrom: null, bubble: id === 'p5' && has(scenarios, SC_B05.PIPETTE_BUBBLE) }])),
    dropperTip: {},
    strip: null,
    uv: { blankA: null, blankCuvette: null },
    burnerLit: false,
    o2: { vented: 0, trapped: {} },
    evaporatedMl: 0,
    readings: {}, readingOrder: [], readingSeq: 0,
    initial: {},
    incidents: [],
    adhEnabled,
    blind: has(scenarios, SC_B05.BLIND),
    pending: { c05: null },
    checks: [],
  };
}

/** Escenarios que cambian parámetros físicos del intento (actividad de la amilasa, tampón). */
export function scenarioParams(params: B01Params, scenarios: string[], seed: number) {
  const p = params.enz!;
  if (has(scenarios, SC_B05.AMYLASE_LOW)) p.activity.amylaseUPerG *= 0.3;
  if (has(scenarios, SC_B05.AMYLASE_HIGH)) p.activity.amylaseUPerG *= 3;
  // Dilución desconocida (SC21): actividad por gramo sorteada con la semilla; se descubre con los controles.
  if (has(scenarios, SC_B05.AMYLASE_UNKNOWN)) p.activity.amylaseUPerG = hashRange(seed, 'amylase', 30, 150);
  if (has(scenarios, SC_B05.WEAK_BUFFER)) p.bufferMmolMl = 0.0003;
  return params;
}

export { BOTTLE_IDS_B05, ADH_BOTTLES };
export type { OpticalWorld };
