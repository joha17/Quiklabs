/**
 * Definición de la práctica B04 «Detectives moleculares: identificación de biomoléculas y regulación de enzimas»
 * (§1, §4): seis estaciones, inventario de la mesada (el microscopio y la caja de láminas de B01/B02 más la balanza, los
 * polvos, el hígado, las placas con agitador, los beakers, las probetas, los frascos de lotes y reactivos, las pipetas,
 * los goteros, las cuatro gradillas, los dos baños, el fotómetro y los frascos de Feulgen) y el estado bioquímico
 * inicial según los escenarios. La composición de cada lote es INTERNA: la interfaz de evaluación no la muestra.
 */
import type { B01Params, OpticalObject, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import type { OpticalWorldSpec } from '../../simulation/optical-world/world';
import { BIO_WASTE, CASE_POS, GLASS_BIN, MIC_POS, caseSlotId, caseSlotPos } from '../../simulation/optical-world/geometry';
import { TRASH_BIN } from '../../simulation/cell-world/geometry';
import {
  BALANCE_POS, BAR_POS, BATH_POS, BEAKER_POS, BOARD_B04, BOTTLE_POS_B04, BURNER_POS, CHEM_WASTE_B04, CUVETTES, CYL_POS, DROPPER_POS_B04, JAR_POS,
  PHOTOMETER_POS, PIPETTE_POS_B04, PLATE_POS, RACK_POS, RACK_TUBES, RINSE_POS_B04, STAIN_JAR_POS, STRIPS_POS, THERMO_POS_B04, TONGS_POS, cuvettePos,
  tubeSlotPos,
} from '../../simulation/bio-world/geometry';
import { BATH_IDS, LOT_CODE, PLATE_IDS, SC_B04, emptyBioVessel } from '../../simulation/bio-world/world';
import type { BioState, BioTube, BioVessel } from '../../simulation/bio-world/types';
import { noSpecies, type Species } from '../../simulation/biochem/model';
import { hashRange } from '../../simulation/core/rng';
import { LOTS } from './params';

export type B04Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const B04_STATIONS: Array<{ id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; target: [number, number, number]; dist: number; elevation: number }> = [
  { id: 'A', target: [168, 30, 6], dist: 96, elevation: 0.55 },
  { id: 'B', target: [396, 26, 6], dist: 64, elevation: 0.55 },
  { id: 'C', target: [466, 32, 8], dist: 62, elevation: 0.5 },
  { id: 'D', target: [300, 32, 16], dist: 82, elevation: 0.32 },
  { id: 'E', target: [528, 28, 6], dist: 64, elevation: 0.55 },
  { id: 'F', target: [62, 40, 8], dist: 95, elevation: 0.42 },
];

/** Frascos de lotes y reactivos: id, rótulo visible, capacidad y volumen inicial (mL). */
export const BOTTLES_B04: Array<{ id: string; label: string; capacityMl: number; volumeMl: number; adh?: boolean }> = [
  { id: 'bW', label: 'Agua destilada', capacityMl: 1000, volumeMl: 600 },
  { id: 'sEgg', label: 'Clara de huevo diluida', capacityMl: 100, volumeMl: 60 },
  { id: 'sMilk', label: 'Leche', capacityMl: 100, volumeMl: 60 },
  { id: 'sGel', label: 'Gelatina', capacityMl: 100, volumeMl: 60 },
  { id: 'sPot', label: 'Extracto de papa cruda', capacityMl: 100, volumeMl: 60 },
  { id: 'sOil', label: 'Aceite vegetal', capacityMl: 100, volumeMl: 40 },
  { id: 'sGlu', label: 'Patrón de glucosa', capacityMl: 100, volumeMl: 60 },
  { id: 'sStd', label: 'Patrón proteico', capacityMl: 100, volumeMl: 60 },
  { id: 'sUnk1', label: 'Incógnita X1', capacityMl: 100, volumeMl: 60 },
  { id: 'sUnk2', label: 'Incógnita X2', capacityMl: 100, volumeMl: 60 },
  { id: 'bEt', label: 'Etanol 95 %', capacityMl: 250, volumeMl: 150 },
  { id: 'bBe', label: 'Reactivo de Benedict', capacityMl: 250, volumeMl: 120 },
  { id: 'bB4', label: 'Tampón pH 4', capacityMl: 100, volumeMl: 60 },
  { id: 'bB7', label: 'Tampón pH 7', capacityMl: 100, volumeMl: 60 },
  { id: 'bB10', label: 'Tampón pH 10', capacityMl: 100, volumeMl: 60 },
  { id: 'bH', label: 'H₂O₂ 3 %', capacityMl: 250, volumeMl: 120 },
  { id: 'bHo', label: 'H₂O₂ 3 % (vencido)', capacityMl: 250, volumeMl: 80 },
  { id: 'bHCl', label: 'HCl 0,1 M', capacityMl: 100, volumeMl: 60 },
  { id: 'bOH', label: 'NaOH 0,1 M', capacityMl: 100, volumeMl: 60 },
  { id: 'bMe', label: 'Metanol 90 % (precintado)', capacityMl: 100, volumeMl: 50 },
  { id: 'aEt', label: 'ADH: etanol 0,5 M', capacityMl: 25, volumeMl: 15, adh: true },
  { id: 'aNad', label: 'ADH: NAD⁺', capacityMl: 25, volumeMl: 15, adh: true },
  { id: 'aAdh', label: 'ADH: enzima', capacityMl: 25, volumeMl: 10, adh: true },
  { id: 'aMe', label: 'ADH: metanol 0,5 M (cerrado)', capacityMl: 25, volumeMl: 15, adh: true },
];

/** Láminas de la caja: Feulgen asignadas, control sin hidrólisis, frotis sin tratar (ruta completa) y una ajena (F05). */
export function feulgenSlideCatalog(scenarios: string[]) {
  const has = (s: string) => scenarios.includes(s);
  const buccal = has(SC_B04.FEULGEN_UNDER) ? 'feulgenWeak' : has(SC_B04.FEULGEN_OVER) ? 'feulgenDamaged' : 'feulgenBuccal';
  return [
    { id: 'fxB', assetId: buccal, slot: 1, label: 'Frotis bucal · Feulgen' },
    { id: 'fxO', assetId: 'feulgenOnion', slot: 3, label: 'Epidermis de cebolla · Feulgen' },
    { id: 'fxN', assetId: 'feulgenNeg', slot: 5, label: 'Control sin hidrólisis' },
    { id: 'fxU', assetId: 'feulgenRaw', slot: 7, label: 'Frotis bucal sin teñir (fijar y teñir)' },
    { id: 'fxM', assetId: 'rootTip', slot: 9, label: 'Raíz de Ranunculus, c. t.' },
  ];
}

const P = (x: number, y: number, z = 0, rot = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<OpticalObject> & Pick<OpticalObject, 'id' | 'kind' | 'pose'>): OpticalObject => ({ support: 'bench', movable: true, ...o });

/** Rótulo visible de cada frasco (SC21: los patrones de glucosa y proteína vienen con el rótulo cambiado). */
function bottleLabel(id: string, label: string, scenarios: string[]) {
  if (scenarios.includes(SC_B04.MISLABELED)) {
    if (id === 'sGlu') return `Patrón proteico · ${LOT_CODE.sGlu}`;
    if (id === 'sStd') return `Patrón de glucosa · ${LOT_CODE.sStd}`;
  }
  return LOT_CODE[id] ? `${label} · ${LOT_CODE[id]}` : label;
}

export function buildB04Spec(seed: number, mode: string, params: B01Params, scenarios: string[]): OpticalWorldSpec {
  const adh = adhEnabled(scenarios);
  const fixed = feulgenSlideCatalog(scenarios);
  const objects: OpticalObject[] = [
    // F — seguridad, residuos y mechero (solo para mostrar la regla de la llama).
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'glassBin', kind: 'glassBin', pose: P(GLASS_BIN.x, GLASS_BIN.y), movable: false }),
    O({ id: 'bioWaste', kind: 'bioWaste', pose: P(BIO_WASTE.x, BIO_WASTE.y), movable: false }),
    O({ id: 'trashBin', kind: 'trashBin', pose: P(TRASH_BIN.x, TRASH_BIN.y), movable: false }),
    O({ id: 'bu', kind: 'burner', pose: P(BURNER_POS.x, BURNER_POS.y), movable: false, label: 'Mechero (apagado)' }),
    // A — balanza, polvos, hígado, placas, beakers, barras, probetas, termómetro y frascos de lotes.
    O({ id: 'bal', kind: 'balance', pose: P(BALANCE_POS.x, BALANCE_POS.y), movable: false, label: 'Balanza granataria' }),
    O({ id: 'bt', kind: 'weighBoat', pose: P(BALANCE_POS.x + 12, BALANCE_POS.y - 4), label: 'Bote de pesaje' }),
    O({ id: 'jSt', kind: 'powderJar', pose: P(JAR_POS.jSt.x, JAR_POS.jSt.y), movable: false, label: 'Almidón en polvo' }),
    O({ id: 'jAm', kind: 'powderJar', pose: P(JAR_POS.jAm.x, JAR_POS.jAm.y), movable: false, label: 'Amilasa (producto comercial)' }),
    O({ id: 'spa', kind: 'spatula', pose: P(124, 12, 0.3), label: 'Espátula' }),
    O({ id: 'cb', kind: 'cuttingBoard', pose: P(BOARD_B04.x, BOARD_B04.y), movable: false, label: 'Tabla de disección' }),
    O({ id: 'liv', kind: 'liverSample', pose: P(BOARD_B04.x, BOARD_B04.y, BOARD_B04.z), support: 'cb', label: 'Hígado (masa asignada)' }),
    O({ id: 'sc', kind: 'scalpel', pose: P(BOARD_B04.x + 9, BOARD_B04.y + 4, 0.4), label: 'Bisturí' }),
    ...PLATE_IDS.map((id, i) => O({ id, kind: 'hotplate', pose: P(PLATE_POS[id].x, PLATE_POS[id].y), movable: false, label: `Placa con agitador ${i + 1}` })),
    O({ id: 'bk1', kind: 'bioBeaker', pose: P(BEAKER_POS.bk1.x, BEAKER_POS.bk1.y), label: 'Beaker 250 mL' }),
    O({ id: 'bk2', kind: 'bioBeaker', pose: P(BEAKER_POS.bk2.x, BEAKER_POS.bk2.y), label: 'Beaker 50 mL' }),
    O({ id: 'bk3', kind: 'bioBeaker', pose: P(BEAKER_POS.bk3.x, BEAKER_POS.bk3.y), label: 'Beaker 25 mL' }),
    ...Object.keys(BAR_POS).map((id, i) => O({ id, kind: 'stirBar', pose: P(BAR_POS[id].x, BAR_POS[id].y, 0.3), label: `Barra magnética ${i + 1}` })),
    O({ id: 'g100', kind: 'bioCylinder', pose: P(CYL_POS.g100.x, CYL_POS.g100.y), label: 'Probeta 100 mL' }),
    O({ id: 'g10', kind: 'bioCylinder', pose: P(CYL_POS.g10.x, CYL_POS.g10.y), label: 'Probeta 10 mL' }),
    O({ id: 'th', kind: 'bioThermo', pose: P(THERMO_POS_B04.x, THERMO_POS_B04.y, 0.4), label: 'Termómetro' }),
    ...BOTTLES_B04.filter((b) => !b.adh || adh).map((b) => O({ id: b.id, kind: 'bioBottle', pose: P(BOTTLE_POS_B04[b.id].x, BOTTLE_POS_B04[b.id].y), label: bottleLabel(b.id, b.label, scenarios), movable: b.id !== 'bMe' })),
    // D — microscopio compartido, caja de láminas y frascos del tratamiento de Feulgen.
    O({ id: 'mic', kind: 'microscope', pose: P(MIC_POS.x, MIC_POS.y), movable: false }),
    O({ id: 'case', kind: 'slideCase', pose: P(CASE_POS.x, CASE_POS.y), movable: false }),
    O({ id: 'lp', kind: 'lensPaper', pose: P(300, 14) }),
    ...Object.entries(STAIN_JAR_POS).map(([id, p]) => O({ id, kind: 'stainJar', pose: P(p.x, p.y), movable: false, label: JAR_LABEL[id] })),
    // B — gradillas A y B, goteros, pipetas y vaso de enjuague.
    ...(['rkA', 'rkB', 'rkC', 'rkD'] as const).map((id) => O({ id, kind: 'bioRack', pose: P(RACK_POS[id].x, RACK_POS[id].y), movable: false, label: `Gradilla ${id.slice(2)}` })),
    ...Object.entries(RACK_TUBES).flatMap(([rack, ids]) => ids.map((id, i) => {
      const p = tubeSlotPos(rack, i);
      return O({ id, kind: 'bioTube', pose: P(p.x, p.y, p.z), support: rack, label: `Tubo ${id}` });
    })),
    O({ id: 'dI', kind: 'bioDropper', pose: P(DROPPER_POS_B04.dI.x, DROPPER_POS_B04.dI.y), label: 'Lugol' }),
    O({ id: 'dNa', kind: 'bioDropper', pose: P(DROPPER_POS_B04.dNa.x, DROPPER_POS_B04.dNa.y), label: 'NaOH 10 % (Biuret)' }),
    O({ id: 'dCu', kind: 'bioDropper', pose: P(DROPPER_POS_B04.dCu.x, DROPPER_POS_B04.dCu.y), label: 'CuSO₄ 1 % (Biuret)' }),
    O({ id: 'pi', kind: 'bioPipette', pose: P(PIPETTE_POS_B04.pi.x, PIPETTE_POS_B04.pi.y, 0.6), label: 'Pipeta graduada 5 mL' }),
    O({ id: 'pv', kind: 'bioPipette', pose: P(PIPETTE_POS_B04.pv.x, PIPETTE_POS_B04.pv.y, 0.6), label: 'Pipeta aforada 2 mL' }),
    O({ id: 'rb', kind: 'rinseBeaker', pose: P(RINSE_POS_B04.x, RINSE_POS_B04.y), movable: false, label: 'Vaso de enjuague' }),
    O({ id: 'cw', kind: 'chemWaste', pose: P(CHEM_WASTE_B04.x, CHEM_WASTE_B04.y), movable: false, label: 'Residuos químicos (Cu · I · etanol)' }),
    // C — baño de Benedict y pretratamientos, pinza de tubos.
    ...BATH_IDS.map((id) => O({ id, kind: 'waterBath', pose: P(BATH_POS[id].x, BATH_POS[id].y), movable: false, label: id === 'ba1' ? 'Baño María C' : 'Baño María E' })),
    O({ id: 'tg', kind: 'tongs', pose: P(TONGS_POS.x, TONGS_POS.y, 0.4), label: 'Pinza de tubos' }),
    O({ id: 'pst', kind: 'phStrips', pose: P(STRIPS_POS.x, STRIPS_POS.y), movable: false, label: 'Papel indicador de pH' }),
    // E — fotómetro y cubetas del módulo ADH.
    ...(adh ? [
      O({ id: 'ph', kind: 'photometer', pose: P(PHOTOMETER_POS.x, PHOTOMETER_POS.y), movable: false, label: 'Fotómetro 340 nm' }),
      ...CUVETTES.map((id, i) => O({ id, kind: 'cuvette', pose: P(cuvettePos(i).x, cuvettePos(i).y, cuvettePos(i).z), movable: false, label: `Cubeta ${i + 1}` })),
    ] : []),
  ];
  const slots: Record<string, string | null> = {};
  const home: Record<string, string> = {};
  for (let i = 0; i < params.caseSlots; i++) slots[caseSlotId(i)] = null;
  const slides: OpticalWorld['slides'] = {};
  for (const f of fixed) {
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
    assignment: { courseId: 'standard', freshAsset: 'elodea', fixedSlideIds: ['fxB', 'fxO', 'fxN', 'fxU'], stereoSampleIds: [] },
    microscope: {},
    stereo: {},
    mounts: {},
  };
}

export const JAR_LABEL: Record<string, string> = { jFix: 'Fijador', jHcl: 'HCl 1 N a 60 °C', jWash: 'Agua de lavado', jSch: 'Reactivo de Schiff' };

/** ADH solo si el docente lo habilitó y validó (escenario de módulo o casos SC23/SC24). */
export const adhEnabled = (scenarios: string[]) => scenarios.includes(SC_B04.ADH) || scenarios.includes(SC_B04.NAD_LIMIT) || scenarios.includes(SC_B04.COMPETITOR);

const sp = (fill: Partial<Species>, ml: number): Species => {
  const s = noSpecies();
  for (const [k, v] of Object.entries(fill)) s[k as keyof Species] = (v as number) * ml;
  return s;
};

/** Composición interna de cada lote (por mL) según los escenarios y la semilla (incógnitas y leche variable). */
export function lotComposition(id: string, seed: number, scenarios: string[]): Partial<Species> & { bufPH?: number } {
  const has = (s: string) => scenarios.includes(s);
  // Las incógnitas se reparten con la semilla: un jugo con reductores y pigmento, y un pudín con almidón, proteína y grasa.
  const swap = hashRange(seed, 'unknowns', 0, 1) > 0.5;
  const juice: Partial<Species> = has(SC_B04.REDUCTANT) ? { reductant: 0.04, pigment: has(SC_B04.PIGMENT) ? 0.9 : 0.2 } : { glucose: 0.04, pigment: has(SC_B04.PIGMENT) ? 0.9 : 0.2 };
  const pudding: Partial<Species> = { starch: 0.03, proteinMg: 6, lipidMg: 10, turbid: 0.6, buf: 0.03 };
  const k = has(SC_B04.MILK_VAR) ? hashRange(seed, 'milk', 0.6, 1.3) : 1;
  switch (id) {
    case 'sEgg': return { ...LOTS.egg };
    case 'sMilk': return { proteinMg: LOTS.milk.proteinMg * k, lactose: LOTS.milk.lactose * k, lipidMg: LOTS.milk.lipidMg * k, turbid: LOTS.milk.turbid, buf: LOTS.milk.buf };
    case 'sGel': return { ...LOTS.gelatin };
    case 'sPot': return { ...LOTS.potato, starch: LOTS.potato.starch * (has(SC_B04.DILUTE_STARCH) ? 0.08 : 1), starchSolid: LOTS.potato.starchSolid * (has(SC_B04.DILUTE_STARCH) ? 0.08 : 1) };
    case 'sOil': return { ...LOTS.oil };
    case 'sGlu': return { ...LOTS.glucose };
    case 'sStd': return { ...LOTS.proteinStd };
    case 'sUnk1': return swap ? pudding : juice;
    case 'sUnk2': return swap ? juice : pudding;
    case 'bEt': return { ethanolMl: 0.95 };
    case 'bBe': return { cu: LOTS.benedictCu * (has(SC_B04.OLD_BENEDICT) ? 0.4 : 1), acid: -0.15, buf: 0.2, bufPKa: 0.2 * 10.3 };
    case 'bB4': return { buf: LOTS.buffer, bufPKa: LOTS.buffer * 4 };
    case 'bB7': return { buf: LOTS.buffer, bufPKa: LOTS.buffer * 7 };
    case 'bB10': return { buf: LOTS.buffer, bufPKa: LOTS.buffer * 10 };
    case 'bH': return { h2o2: LOTS.peroxide.h2o2 * (has(SC_B04.OLD_PEROXIDE) ? 0.5 : 1) };
    case 'bHo': return { h2o2: LOTS.peroxide.h2o2 * 0.3 };
    case 'bHCl': return { acid: LOTS.hcl };
    case 'bOH': return { acid: -LOTS.hcl };
    case 'bMe': return {};
    case 'aEt': return { ethanolSub: LOTS.adh.ethanol };
    case 'aNad': return { nad: LOTS.adh.nad * (has(SC_B04.NAD_LIMIT) ? 0.05 : 1) };
    case 'aAdh': return { adhAct: LOTS.adh.enzyme, buf: 0.05, bufPKa: 0.05 * 8.8 };
    case 'aMe': return { methanol: LOTS.adh.methanol };
    default: return {};
  }
}

const tube = (): BioTube => ({
  label: null, sources: [], capped: false, reagents: {}, readAt: null, discarded: false, bath: null, maxTK: 298.15, hotDoseS: 0, boilS: 0, timerAt: null,
  contactAt: null, collector: null, o2CollectedMmol: 0, o2LostMmol: 0, foamMl: 0, dilutedAt: null, initialRead: null, mixedAt: null, condition: null,
  gasReadsS: [], enzymePerMl: null, h2o2Ml: 0, phReadAt: null, evaporatedMl: 0,
});

/** Estado bioquímico inicial (frascos llenos, beakers y tubos limpios, placas y baños apagados) según los escenarios. */
export function buildBioState(seed: number, params: B01Params, scenarios: string[]): BioState {
  const has = (s: string) => scenarios.includes(s);
  const bp = params.bio!;
  const T = bp.ambientK;
  const adh = adhEnabled(scenarios);
  const vessel = (cap: number, ml = 0, fill: Partial<Species> = {}, tag?: string): BioVessel => ({ ...emptyBioVessel(cap, T), volumeMl: ml, s: sp(fill, ml), tags: tag ? [tag] : [] });
  const vessels: Record<string, BioVessel> = {};
  for (const b of BOTTLES_B04) if (!b.adh || adh) vessels[b.id] = vessel(b.capacityMl, b.volumeMl, lotComposition(b.id, seed, scenarios), b.id);
  vessels.g100 = vessel(110);
  vessels.g10 = vessel(11);
  vessels.bk1 = vessel(250);
  vessels.bk2 = vessel(50);
  vessels.bk3 = vessel(25);
  vessels.pi = vessel(bp.pipetteCapMl + bp.pipetteFilmMl);
  vessels.pv = vessel(bp.volumetricMl + bp.pipetteFilmMl);
  const lugol = LOTS.lugolIodine * (has(SC_B04.DILUTE_LUGOL) ? 0.25 : 1);
  vessels.dI = vessel(15, 10, { iodine: lugol }, 'dI');
  vessels.dNa = vessel(15, 10, { acid: -LOTS.naoh }, 'dNa');
  vessels.dCu = vessel(15, 10, { cu: LOTS.cuso4 * (has(SC_B04.CU_EXCESS) ? 5 : 1) }, 'dCu');
  vessels.rb = vessel(250, 150, {}, 'bW');
  // Residuos y derrame con capacidad finita: el estado viaja como JSON (Infinity llegaría como null).
  vessels.cw = vessel(1e9);
  vessels.bw = vessel(1e9);
  vessels.tr = vessel(1e9);
  vessels.spill = vessel(1e9);
  const tubes: Record<string, BioTube> = {};
  for (const id of Object.values(RACK_TUBES).flat()) {
    vessels[id] = vessel(12);
    tubes[id] = tube();
  }
  // Residuos de detergente en dos tubos de la gradilla B (SC03): turbidez inespecífica.
  if (has(SC_B04.DETERGENT)) for (const id of ['B1', 'B2']) vessels[id].s.detergent = 0.6;
  if (adh) for (const id of CUVETTES) {
    vessels[id] = vessel(3.5);
    tubes[id] = tube();
  }
  const liverG = bp.prep.liverG;
  const lots: BioState['lots'] = {
    bW: { bottle: 'bW', kind: 'control-neg' }, sStd: { bottle: 'sStd', kind: 'control-pos' }, sGlu: { bottle: 'sGlu', kind: 'control-pos' }, sOil: { bottle: 'sOil', kind: 'control-pos' },
    sEgg: { bottle: 'sEgg', kind: 'sample' }, sMilk: { bottle: 'sMilk', kind: 'sample' }, sGel: { bottle: 'sGel', kind: 'sample' }, sPot: { bottle: 'sPot', kind: 'sample' },
    sUnk1: { bottle: 'sUnk1', kind: 'unknown' }, sUnk2: { bottle: 'sUnk2', kind: 'unknown' },
  };
  return {
    vessels, tubes,
    preps: { P1: null, P2: null, P3: null },
    plates: Object.fromEntries(PLATE_IDS.map((id) => [id, { on: false, setK: T, rpm: 0, plateK: T, vesselId: null }])),
    bars: { sb1: null, sb2: null, sb3: null },
    baths: Object.fromEntries(BATH_IDS.map((id) => [id, { on: false, setK: T, tK: T, readyAt: null }])),
    balance: { tareG: 0, tared: false },
    powders: { jSt: 60, jAm: 2 },
    spatula: { load: {}, wet: false },
    boat: { load: {}, waterG: 0 },
    liver: { massG: liverG, totalU: liverG * bp.activity.liverUPerG * (has(SC_B04.LOW_CATALASE) ? 0.3 : 1), weighedAt: null, pieces: 1, sizeCm: null, inVessel: null },
    pours: {},
    pipettes: { pi: { from: null, residue: [], zeroChecked: false }, pv: { from: null, residue: [], zeroChecked: false } },
    readings: {}, readingOrder: [], readingSeq: 0,
    feulgen: { fxU: { fixS: 0, hydroS: 0, washAfterHydroS: 0, schiffS: 0, jar: null, order: [] } },
    photometer: { blanked: false },
    burnerLit: false,
    o2LostMmol: 0, waterFormedMmol: 0, evaporatedMl: 0,
    initial: {},
    incidents: [],
    adhEnabled: adh,
    lots,
    checks: [],
  };
}

/** Escenarios que cambian parámetros físicos del intento (actividades, pH óptimo, fotómetro). */
export function scenarioParams(params: B01Params, scenarios: string[]) {
  const has = (s: string) => scenarios.includes(s);
  const bp = params.bio!;
  if (has(SC_B04.LOW_AMYLASE)) bp.activity.amylaseUPerG *= 0.3;
  if (has(SC_B04.AMYLASE_PH)) {
    bp.amylase.pHOpt = 5.5;
    bp.amylase.kpH = 0.004;
  }
  if (has(SC_B04.PHOTOMETER_NO_BLANK)) bp.photometerOffset = 0.15;
  if (has(SC_B04.COMPETITOR)) bp.adh.kiMeOH = 0.008;
  return params;
}
