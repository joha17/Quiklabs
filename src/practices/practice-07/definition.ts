/**
 * Definición de la Práctica 7 — enlaces y propiedades (§4): estaciones, objetos de la mesada, frascos y su
 * contenido, muestras sólidas para el detector e incógnitas asignadas por semilla. Mesada x = 0…560, y = 0…64 (cm).
 */
import type { MaterialId, P07Object, P07Params, P07World, Pose, SpecimenState, Vessel } from '../../simulation/bonding-world/types';
import { shapeSpec, type VesselShape } from '../../simulation/bonding-world/geometry';
import { S, emptyVessel, solutionComp, standardKclMolL } from '../../simulation/bonding-world/world';
import { hashRandom } from '../../simulation/core/rng';
import { MATERIALS } from '../../simulation/solution-properties/materials';

export type P07Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH07 = { length: 560, depth: 64 };

export interface P07Station {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  target: [number, number, number];
  dist: number;
  elevation: number;
}

/** Estaciones (§4.3): A hipótesis y EPP, B disolventes, C conducción de sólidos, D disoluciones, E incógnitas, F libreta. */
export const P07_STATIONS: P07Station[] = [
  { id: 'A', target: [45, 30, 10], dist: 95, elevation: 0.42 },
  { id: 'B', target: [140, 32, 10], dist: 110, elevation: 0.4 },
  { id: 'C', target: [250, 30, 6], dist: 80, elevation: 0.5 },
  { id: 'D', target: [355, 32, 9], dist: 95, elevation: 0.42 },
  { id: 'E', target: [455, 32, 8], dist: 85, elevation: 0.42 },
  { id: 'F', target: [525, 32, 8], dist: 85, elevation: 0.4 },
];

export const BALANCE_POS = { x: 302, y: 46 };
export const PAN_POS = { x: 302, y: 44, z: 8.4 };
export const RACK_B = { x: 140, y: 38 };
export const RACK_E = { x: 475, y: 44 };
export const DETECTOR_POS = { x: 252, y: 50 };
export const METER_POS = { x: 360, y: 52 };

const P = (x: number, y: number, rot = 0, z = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<P07Object> & Pick<P07Object, 'id' | 'kind' | 'pose'>): P07Object => ({ support: 'bench', movable: true, ...o });

/** Masas de los objetos vacíos (g) `[PROPUESTA]`. */
const MASS = { tube: 8.5, beaker: 31.2, flask: 52.4, watchGlass: 21.0, cylinder: 29.6 };

/** Reactivos líquidos (frasco de 100 mL) y sólidos (frasco de vidrio), en el estante del fondo de B. */
export const LIQUID_BOTTLES: Array<{ id: string; mat: MaterialId; ml: number }> = [
  { id: 'btHeptane', mat: 'heptane', ml: 90 },
  { id: 'btEthanol', mat: 'ethanol', ml: 80 },
  { id: 'btIsopropanol', mat: 'isopropanol', ml: 80 },
  { id: 'btGlycerol', mat: 'glycerol', ml: 60 },
  { id: 'btMineralOil', mat: 'mineralOil', ml: 70 },
  { id: 'btAcetone', mat: 'acetone', ml: 70 },
];
export const SOLID_JARS: Array<{ id: string; mat: MaterialId; g: number }> = [
  { id: 'jarNaCl', mat: 'NaCl', g: 30 },
  { id: 'jarSucrose', mat: 'sucrose', g: 30 },
  { id: 'jarKCl', mat: 'KCl', g: 20 },
  { id: 'jarCuSO4', mat: 'CuSO4_5H2O', g: 20 },
  { id: 'jarNaHCO3', mat: 'NaHCO3', g: 20 },
  { id: 'jarParaffin', mat: 'paraffin', g: 15 },
  { id: 'jarNaphthalene', mat: 'naphthalene', g: 10 },
  { id: 'jarNaOH', mat: 'NaOH', g: 20 },
  { id: 'jarDamaged', mat: 'KCl', g: 15 },
];

export const TUBES_B = ['tube1', 'tube2', 'tube3', 'tube4', 'tube5', 'tube6', 'tube7', 'tube8'];
export const TUBES_E = ['tube9', 'tube10', 'tube11', 'tube12'];
export const BEAKERS = ['bk1', 'bk2', 'bk3', 'bk4', 'bk5', 'bk6', 'bk7'];
export const SPECIMENS_C = ['spCu', 'spGraphite', 'spNaCl', 'spAl', 'spParaffin', 'spSucrose', 'spFe', 'spBronze'];

/** Incógnitas (§5.E): una sustancia iónica soluble y una molecular, en orden por semilla; con escenarios fijos. */
export function pickUnknowns(seed: number, scenarios: string[]): Record<'X' | 'Y', MaterialId> {
  if (scenarios.includes(S.UNKNOWNS_BLINDED)) return { X: 'NaCl', Y: 'sucrose' };
  const ionic: MaterialId[] = ['NaCl', 'KCl'];
  const molecular: MaterialId[] = ['sucrose', 'glycerol', 'paraffin', 'mineralOil'];
  const a = ionic[Math.floor(hashRandom(seed, 'unkA') * ionic.length) % ionic.length];
  let b = molecular[Math.floor(hashRandom(seed, 'unkB') * molecular.length) % molecular.length];
  if (scenarios.includes(S.WEAK_ACID)) b = 'acetic';
  return hashRandom(seed, 'unkSwap') < 0.5 ? { X: a, Y: b } : { X: b, Y: a };
}

export const unknownCode = (seed: number, k: 'X' | 'Y') => `${k}-${String(10 + Math.floor(hashRandom(seed, `code${k}`) * 89))}`;

export function buildObjects07(seed: number, scenarios: string[]): P07Object[] {
  const out: P07Object[] = [
    // A — EPP, fichas e hipótesis (tablero de referencia).
    O({ id: 'ppeBoard', kind: 'ppeBoard', pose: P(40, 52), movable: false }),
    // B — disolventes, gradilla de tubos, probeta, goteros, espátula, agitador.
    O({ id: 'btWater', kind: 'bottle', pose: P(98, 30), label: 'water' }),
    O({ id: 'cyl10', kind: 'cylinder10', pose: P(110, 24), massG: MASS.cylinder }),
    O({ id: 'rackB', kind: 'rack', pose: P(RACK_B.x, RACK_B.y), movable: false }),
    O({ id: 'dp1', kind: 'dropper', pose: P(160, 16, 0.5, 0.6) }),
    O({ id: 'dp2', kind: 'dropper', pose: P(168, 16, 0.5, 0.6) }),
    O({ id: 'spatula', kind: 'spatula', pose: P(178, 14, 0.4, 0.4) }),
    O({ id: 'sr1', kind: 'stirRod', pose: P(150, 14, 0.2, 0.4) }),
    O({ id: 'washBottle', kind: 'washBottle', pose: P(190, 26) }),
    O({ id: 'wasteAq', kind: 'waste', pose: P(205, 54), movable: false, label: 'aq' }),
    O({ id: 'wasteOrg', kind: 'waste', pose: P(217, 54), movable: false, label: 'org' }),
    O({ id: 'wasteSolid', kind: 'waste', pose: P(229, 54), movable: false, label: 'solid' }),
    // C — detector de sólidos con sus puntas y las muestras sobre baldosas.
    O({ id: 'det01', kind: 'detector', pose: P(DETECTOR_POS.x, DETECTOR_POS.y), movable: false }),
    O({ id: 'tipA', kind: 'tip', pose: P(DETECTOR_POS.x - 9, DETECTOR_POS.y - 3, 0, 0.5), support: 'bench' }),
    O({ id: 'tipB', kind: 'tip', pose: P(DETECTOR_POS.x + 9, DETECTOR_POS.y - 3, 0, 0.5), support: 'bench' }),
    // Balanza compartida (entre C y D) y vidrios de reloj.
    O({ id: 'balance01', kind: 'balance', pose: P(BALANCE_POS.x, BALANCE_POS.y), movable: false }),
    O({ id: 'wg1', kind: 'watchGlass', pose: P(288, 20), massG: MASS.watchGlass + (hashRandom(seed, 'wg1') - 0.5) * 2 }),
    O({ id: 'wg2', kind: 'watchGlass', pose: P(300, 16), massG: MASS.watchGlass + (hashRandom(seed, 'wg2') - 0.5) * 2 }),
    O({ id: 'wg3', kind: 'watchGlass', pose: P(312, 20), massG: MASS.watchGlass + (hashRandom(seed, 'wg3') - 0.5) * 2 }),
    // D — conductímetro, patrones, vasos, matraces y ácido acético diluido.
    O({ id: 'cond01', kind: 'meter', pose: P(METER_POS.x, METER_POS.y), movable: false }),
    O({ id: 'probe01', kind: 'probe', pose: P(METER_POS.x + 12, METER_POS.y - 4, 0, 0), support: 'cond01' }),
    O({ id: 'std1413', kind: 'vial', pose: P(330, 34), label: 'std1413' }),
    O({ id: 'std12880', kind: 'vial', pose: P(338, 38), label: 'std12880' }),
    O({ id: 'stdUnknown', kind: 'vial', pose: P(346, 34), label: 'stdUnknown' }),
    O({ id: 'btAcetic', kind: 'bottle', pose: P(384, 50), label: 'acetic' }),
    O({ id: 'fl1', kind: 'flask', pose: P(398, 36), massG: MASS.flask }),
    O({ id: 'fl2', kind: 'flask', pose: P(410, 36), massG: MASS.flask }),
    // E — incógnitas.
    O({ id: 'rackE', kind: 'rack', pose: P(RACK_E.x, RACK_E.y), movable: false }),
  ];
  // Estante de reactivos al fondo de B.
  const shelf = [...LIQUID_BOTTLES.map((b) => ({ id: b.id, kind: 'bottle' as const })), ...SOLID_JARS.map((j) => ({ id: j.id, kind: 'jar' as const }))];
  if (scenarios.includes(S.SOLUBILITY_LIMIT)) shelf.push({ id: 'jarExcess', kind: 'jar' });
  if (scenarios.includes(S.COMMERCIAL_SOLVENT)) shelf.push({ id: 'btPetEther', kind: 'bottle' });
  shelf.forEach((s, i) => out.push(O({ id: s.id, kind: s.kind, pose: P(88 + i * 7.2, 58 - (i % 2) * 3), label: s.id })));
  TUBES_B.forEach((id, i) => out.push(O({ id, kind: 'tube', pose: P(RACK_B.x - 9.8 + i * 2.8, RACK_B.y, 0, 2), support: `rackB:${i}`, massG: MASS.tube })));
  TUBES_E.forEach((id, i) => out.push(O({ id, kind: 'tube', pose: P(RACK_E.x - 9.8 + i * 2.8, RACK_E.y, 0, 2), support: `rackE:${i}`, massG: MASS.tube })));
  BEAKERS.forEach((id, i) => out.push(O({ id, kind: 'beaker', pose: i < 5 ? P(340 + i * 9, 18) : P(440 + (i - 5) * 9, 18), massG: MASS.beaker })));
  // Baldosas y muestras sólidas de C.
  SPECIMENS_C.forEach((id, i) => {
    const x = 226 + (i % 4) * 12;
    const y = i < 4 ? 30 : 17;
    out.push(O({ id: `tile_${id}`, kind: 'tile', pose: P(x, y), movable: false }));
    out.push(O({ id, kind: 'specimen', pose: P(x, y, 0, 0.6), support: `tile_${id}`, movable: true }));
  });
  // Incógnitas: frasco (o botella) con código, y su pieza sólida si corresponde.
  const unk = pickUnknowns(seed, scenarios);
  (['X', 'Y'] as const).forEach((k, i) => {
    const mat = unk[k];
    const solid = MATERIALS[mat].phase === 'solid';
    out.push(O({ id: `unk${k}`, kind: solid ? 'jar' : 'bottle', pose: P(440 + i * 14, 40), label: unknownCode(seed, k) }));
    if (solid) {
      out.push(O({ id: `tile_sp${k}`, kind: 'tile', pose: P(440 + i * 14, 28), movable: false }));
      out.push(O({ id: `sp${k}`, kind: 'specimen', pose: P(440 + i * 14, 28, 0, 0.6), support: `tile_sp${k}` }));
    }
  });
  return out;
}

const vessel = (id: string, shape: VesselShape, tempC: number, contents: Parameters<typeof emptyVessel>[4] = {}, capped?: boolean): Vessel =>
  emptyVessel(id, shape, shapeSpec(shape), tempC, contents, capped);

export function buildVessels07(p: P07Params, seed: number, scenarios: string[]): Vessel[] {
  const T = p.initialTemperatureC;
  // S15: el agua de referencia y las soluciones están a otra temperatura que la sonda.
  const Tsol = scenarios.includes(S.PROBE_TEMPERATURE) ? T - 4 : T;
  const water = (ml: number) => ({ water: ml * MATERIALS.water.densityGml });
  const out: Vessel[] = [
    vessel('btWater', 'bottle250', Tsol, { polar: water(240) }, true),
    vessel('cyl10', 'cylinder10', T),
    vessel('washBottle', 'washBottle', Tsol, { polar: water(480) }),
    vessel('wasteAq', 'waste', T),
    vessel('wasteOrg', 'waste', T),
    vessel('wasteSolid', 'waste', T),
    vessel('btAcetic', 'bottle100', Tsol, { polar: solutionComp('acetic', p.aceticStockM, 90) }, true),
    vessel('std1413', 'vial', Tsol, { polar: { water: 45 * MATERIALS.water.densityGml, KCl: (standardKclMolL(1413) * 0.045 * 74.55) / MATERIALS.KCl.purity } }, true),
    vessel('std12880', 'vial', Tsol, { polar: { water: 45 * MATERIALS.water.densityGml, KCl: (standardKclMolL(12880) * 0.045 * 74.55) / MATERIALS.KCl.purity } }, true),
    vessel('stdUnknown', 'vial', Tsol, { polar: { water: 45 * MATERIALS.water.densityGml, KCl: (0.004 * 0.045 * 74.55) / MATERIALS.KCl.purity } }, true),
    vessel('fl1', 'flask100', T),
    vessel('fl2', 'flask100', T),
    vessel('wg1', 'watchGlass', T),
    vessel('wg2', 'watchGlass', T),
    vessel('wg3', 'watchGlass', T),
  ];
  for (const b of LIQUID_BOTTLES) out.push(vessel(b.id, 'bottle100', T, MATERIALS[b.mat].phase === 'liquid' && b.mat !== 'heptane' && b.mat !== 'mineralOil' ? { polar: { [b.mat]: b.ml * MATERIALS[b.mat].densityGml } } : { apolar: { [b.mat]: b.ml * MATERIALS[b.mat].densityGml } }, true));
  for (const j of SOLID_JARS) {
    // S12: la sacarosa trae una traza salina conocida por el mundo (no por el rótulo).
    const solid = j.id === 'jarSucrose' && scenarios.includes(S.SUGAR_WITH_SALT) ? { sucrose: j.g * 0.995, NaCl: j.g * 0.005 } : { [j.mat]: j.g };
    out.push(vessel(j.id, 'jar', T, { solid }, true));
  }
  if (scenarios.includes(S.SOLUBILITY_LIMIT)) out.push(vessel('jarExcess', 'jar', T, { solid: { NaHCO3: 2.0 } }, true));
  if (scenarios.includes(S.COMMERCIAL_SOLVENT)) out.push(vessel('btPetEther', 'bottle100', T, { apolar: { petEther: 60 * 0.65 } }, true));
  for (const id of [...TUBES_B, ...TUBES_E]) out.push(vessel(id, 'tube', T));
  for (const id of BEAKERS) out.push(vessel(id, 'beaker50', T));
  // S13: un tubo preparado con agua y heptano en dos fases.
  if (scenarios.includes(S.MULTIPHASE)) {
    const t = out.find((v) => v.id === 'tube8')!;
    t.polar = water(3);
    t.apolar = { heptane: 3 * MATERIALS.heptane.densityGml };
  }
  const unk = pickUnknowns(seed, scenarios);
  for (const k of ['X', 'Y'] as const) {
    const mat = unk[k];
    if (MATERIALS[mat].phase === 'solid') out.push(vessel(`unk${k}`, 'jar', T, { solid: { [mat]: 8 } }, true));
    else if (mat === 'acetic') out.push(vessel(`unk${k}`, 'bottle100', T, { polar: solutionComp('acetic', p.aceticStockM, 40) }, true));
    else if (mat === 'mineralOil') out.push(vessel(`unk${k}`, 'bottle100', T, { apolar: { mineralOil: 40 * MATERIALS.mineralOil.densityGml } }, true));
    else out.push(vessel(`unk${k}`, 'bottle100', T, { polar: { [mat]: 40 * MATERIALS[mat].densityGml } }, true));
  }
  return out;
}

export function buildSpecimens07(seed: number, scenarios: string[]): SpecimenState[] {
  const sp = (id: string, material: MaterialId, l: number, wd: number, t: number, extra: Partial<SpecimenState> = {}): SpecimenState => ({
    id, material, lengthCm: l, widthCm: wd, thickCm: t, orientation: 'flat', surfaceWaterG: 0, surfaceSaltG: 0, oxide: false, ...extra,
  });
  const out: SpecimenState[] = [
    sp('spCu', 'Cu', 6, 1, 0.1),
    sp('spGraphite', 'graphite', 3, 3, 0.3),
    sp('spNaCl', 'NaCl', 1.6, 1.4, 1.0, scenarios.includes(S.HUMID_CRYSTAL) ? { surfaceWaterG: 0.02, surfaceSaltG: 0.004 } : {}),
    sp('spAl', 'Al', 6, 1, 0.1, { oxide: scenarios.includes(S.OXIDIZED_ALUMINUM) }),
    sp('spParaffin', 'paraffin', 3, 2, 1),
    sp('spSucrose', 'sucrose', 1.5, 1.2, 1.0),
    sp('spFe', 'Fe', 6, 0.4, 0.4),
    sp('spBronze', 'bronze', 6, 1, 0.15),
  ];
  const unk = pickUnknowns(seed, scenarios);
  for (const k of ['X', 'Y'] as const) {
    if (MATERIALS[unk[k]].phase === 'solid') out.push(sp(`sp${k}`, unk[k], 1.6, 1.4, 1.0, { unknownCode: unknownCode(seed, k) }));
  }
  return out;
}

export function buildUnknowns07(seed: number, scenarios: string[]): P07World['unknowns'] {
  const unk = pickUnknowns(seed, scenarios);
  const out: P07World['unknowns'] = {};
  for (const k of ['X', 'Y'] as const) {
    out[k] = { code: unknownCode(seed, k), material: unk[k], jarId: `unk${k}`, specimenId: MATERIALS[unk[k]].phase === 'solid' ? `sp${k}` : undefined };
  }
  return out;
}
