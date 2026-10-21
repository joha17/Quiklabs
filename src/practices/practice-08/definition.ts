/**
 * Definición de la Práctica 8 — síntesis orgánica comparativa (§4): estaciones, objetos de la mesada y contenido de
 * frascos y recipientes POR RUTA (solo se construye lo que la ruta usa, más los distractores que dan lugar a errores
 * reales: frascos parecidos, catalizador no asignado, alcohol equivocado, vaso de plástico, desecante saturado).
 * Mesada x = 0…560, y = 0…64 (cm). Los escenarios docentes (§10) cambian solo el estado inicial.
 */
import type { Mol, P08Object, P08Params, Pose, RouteId, SpeciesId, Vessel08 } from '../../simulation/organic-world/types';
import { shapeSpec08, type VesselShape08 } from '../../simulation/organic-world/geometry';
import { S8, emptyVessel08 } from '../../simulation/organic-world/world';
import { hashRandom } from '../../simulation/core/rng';
import { SPECIES } from '../../simulation/organic-chemistry/species';

export type P08Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH08 = { length: 560, depth: 64 };

export interface P08Station {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  target: [number, number, number];
  dist: number;
  elevation: number;
}

/** Estaciones (§2.1): A seguridad y predicción, B preparación, C síntesis, D recuperación, E calidad, F informe. */
export const P08_STATIONS: P08Station[] = [
  { id: 'A', target: [40, 32, 8], dist: 90, elevation: 0.42 },
  { id: 'B', target: [140, 34, 10], dist: 110, elevation: 0.42 },
  { id: 'C', target: [275, 34, 16], dist: 105, elevation: 0.38 },
  { id: 'D', target: [395, 34, 14], dist: 115, elevation: 0.4 },
  { id: 'E', target: [482, 36, 10], dist: 85, elevation: 0.42 },
  { id: 'F', target: [530, 32, 8], dist: 80, elevation: 0.4 },
];

export const BALANCE_POS = { x: 152, y: 46 };
export const PAN_POS = { x: 152, y: 44, z: 9 };
export const PLATE_POS = { x: 272, y: 42 };
export const BATH_POS = { x: 272, y: 42, z: 12 };
export const CORK_POS = { x: 250, y: 20 };
export const ICE_POS = { x: 336, y: 26 };
export const RING_POS = { x: 372, y: 46 };
export const KITASATO_POS = { x: 392, y: 46 };
export const FRAC_POS = { x: 432, y: 46 };
export const OVEN_POS = { x: 432, y: 46 };
export const ANALYZER_POS = { x: 472, y: 46 };
export const MP_POS = { x: 500, y: 46 };

const P = (x: number, y: number, rot = 0, z = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<P08Object> & Pick<P08Object, 'id' | 'kind' | 'pose'>): P08Object => ({ support: 'bench', movable: true, ...o });

/** Masas de los objetos vacíos (g) `[PROPUESTA]`. */
const MASS = { rf: 38.5, watchGlass: 21.0, vial: 11.8, paper: 0.36, coarsePaper: 0.42, erlenmeyer: 68.2, beaker: 48.4, cyl10: 29.6, cyl25: 46.1, sf: 118 };

/** Frascos de reactivos por ruta (estante del fondo de B). Los distractores también son reales. */
export function shelfFor(route: RouteId): Array<{ id: string; kind: 'bottle' | 'jar'; label: string }> {
  const b = (id: string, label = id) => ({ id, kind: 'bottle' as const, label });
  const j = (id: string, label = id) => ({ id, kind: 'jar' as const, label });
  if (route === 'ISO') return [b('btIAA'), b('btAcOH'), b('btAcOH30'), b('btH2SO4'), b('btNaHCO3'), j('jarNa2SO4'), j('jarNa2SO4used')];
  if (route === 'ASA') return [j('jarSA'), b('btAA'), b('btAcOH'), b('btH3PO4'), b('btH2SO4')];
  return [j('jarSA'), b('btMeOH'), b('btMeOH70'), b('btIAA'), b('btH2SO4'), b('btNaHCO3'), j('jarNa2SO4'), j('jarNa2SO4used')];
}

export const usesExtraction = (r: RouteId) => r !== 'ASA';

export function buildObjects08(route: RouteId, seed: number): P08Object[] {
  const out: P08Object[] = [
    // A — EPP y fichas.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(36, 42), movable: false }),
    // B — balanza, vidrio de reloj, espátula, probetas, gotero, piseta y vaso de plástico (distractor ORG03).
    O({ id: 'balance01', kind: 'balance', pose: P(BALANCE_POS.x, BALANCE_POS.y), movable: false }),
    O({ id: 'wg1', kind: 'watchGlass', pose: P(128, 20), massG: MASS.watchGlass + (hashRandom(seed, 'wg1') - 0.5) * 2 }),
    O({ id: 'spatula', kind: 'spatula', pose: P(138, 13, 0.4, 0.4) }),
    O({ id: 'cyl10', kind: 'cylinder', pose: P(106, 24), massG: MASS.cyl10 }),
    O({ id: 'cyl25', kind: 'cylinder', pose: P(116, 26), massG: MASS.cyl25 }),
    O({ id: 'dp1', kind: 'dropper', pose: P(176, 14, 0.5, 0.6) }),
    O({ id: 'washBottle', kind: 'washBottle', pose: P(190, 28) }),
    O({ id: 'plasticCup', kind: 'plasticCup', pose: P(96, 16) }),
    // Residuos segregados (§11.1).
    O({ id: 'wasteOrg', kind: 'waste', pose: P(206, 55), movable: false, label: 'org' }),
    O({ id: 'wasteAq', kind: 'waste', pose: P(218, 55), movable: false, label: 'aq' }),
    O({ id: 'wasteAcid', kind: 'waste', pose: P(230, 55), movable: false, label: 'acid' }),
    O({ id: 'wasteSolid', kind: 'waste', pose: P(242, 55), movable: false, label: 'solid' }),
    // C — placa con baño, aro de corcho con el balón, termómetro, mechero (no se usa: ORG45).
    O({ id: 'plate01', kind: 'plate', pose: P(PLATE_POS.x, PLATE_POS.y), movable: false }),
    O({ id: 'bath01', kind: 'bath', pose: P(BATH_POS.x, BATH_POS.y, 0, BATH_POS.z), support: 'plate01', movable: false }),
    O({ id: 'cork01', kind: 'corkRing', pose: P(CORK_POS.x, CORK_POS.y), movable: false }),
    O({ id: 'rf', kind: 'roundFlask', pose: P(CORK_POS.x, CORK_POS.y, 0, 1.2), support: 'cork01', massG: MASS.rf }),
    O({ id: 'th01', kind: 'thermometer', pose: P(292, 16, 0.3, 0.5) }),
    O({ id: 'burner01', kind: 'burner', pose: P(318, 18) }),
    // D — baño de hielo (todas las rutas: enfriar antes de manipular).
    O({ id: 'ice01', kind: 'iceBath', pose: P(ICE_POS.x, ICE_POS.y), movable: false }),
    // E — analizador de pureza/densidad.
    O({ id: 'analyzer01', kind: 'analyzer', pose: P(ANALYZER_POS.x, ANALYZER_POS.y), movable: false }),
  ];
  shelfFor(route).forEach((s, i) => out.push(O({ id: s.id, kind: s.kind, pose: P(84 + i * 8, 57 - (i % 2) * 3), label: s.label })));
  if (usesExtraction(route)) {
    out.push(
      O({ id: 'condenser01', kind: 'condenser', pose: P(300, 52, Math.PI / 2, 1) }),
      O({ id: 'ring01', kind: 'funnelRing', pose: P(RING_POS.x, RING_POS.y), movable: false }),
      O({ id: 'sf', kind: 'sepFunnel', pose: P(RING_POS.x, RING_POS.y, 0, 18), support: 'ring01', massG: MASS.sf }),
      O({ id: 'bkAq', kind: 'beaker', pose: P(362, 18), massG: MASS.beaker }),
      O({ id: 'erDry', kind: 'erlenmeyer', pose: P(386, 18), massG: MASS.erlenmeyer }),
      O({ id: 'frac01', kind: 'fractionModule', pose: P(FRAC_POS.x, FRAC_POS.y), movable: false }),
      O({ id: 'fracPot', kind: 'roundFlask', pose: P(FRAC_POS.x - 8, FRAC_POS.y, 0, 13.5), support: 'frac01', movable: false, massG: MASS.rf }),
      O({ id: 'fracHead', kind: 'vial', pose: P(FRAC_POS.x - 12, FRAC_POS.y - 16, 0, 0), support: 'frac01', movable: false, massG: MASS.vial }),
      O({ id: 'vialP', kind: 'vial', pose: P(414, 16), massG: MASS.vial + (hashRandom(seed, 'vial') - 0.5) * 0.6 }),
    );
  } else {
    out.push(
      O({ id: 'bkIce', kind: 'beaker', pose: P(ICE_POS.x, ICE_POS.y, 0, 1), support: 'ice01', massG: MASS.beaker }),
      O({ id: 'kitasato', kind: 'kitasato', pose: P(KITASATO_POS.x, KITASATO_POS.y), movable: false }),
      O({ id: 'buchner', kind: 'buchner', pose: P(KITASATO_POS.x, KITASATO_POS.y, 0, 15), support: 'kitasato', movable: false }),
      O({ id: 'fpFine', kind: 'filterPaper', pose: P(372, 14), massG: MASS.paper + (hashRandom(seed, 'fp') - 0.5) * 0.02 }),
      O({ id: 'fpCoarse', kind: 'filterPaper', pose: P(380, 12), massG: MASS.coarsePaper }),
      O({ id: 'pump01', kind: 'vacuumPump', pose: P(406, 54), movable: false }),
      O({ id: 'oven01', kind: 'oven', pose: P(OVEN_POS.x, OVEN_POS.y), movable: false }),
      O({ id: 'mp01', kind: 'mpApparatus', pose: P(MP_POS.x, MP_POS.y), movable: false }),
    );
  }
  return out;
}

/** Mezcla líquida por fracciones másicas con volúmenes aditivos (los sólidos disueltos no suman volumen). */
export function mixture(ml: number, fractions: Partial<Record<SpeciesId, number>>): Mol {
  let perG = 0;
  for (const [k, f] of Object.entries(fractions) as Array<[SpeciesId, number]>) {
    const s = SPECIES[k];
    if (s.phase === 'liquid' && s.densityGml) perG += f / s.densityGml;
  }
  const g = perG > 0 ? ml / perG : 0;
  const out: Mol = {};
  for (const [k, f] of Object.entries(fractions) as Array<[SpeciesId, number]>) out[k] = (g * f) / SPECIES[k].molarMass;
  return out;
}

const solidOf = (fractions: Partial<Record<SpeciesId, number>>, g: number): Mol => {
  const out: Mol = {};
  for (const [k, f] of Object.entries(fractions) as Array<[SpeciesId, number]>) out[k] = (g * f) / SPECIES[k].molarMass;
  return out;
};

/** Ficha de cada frasco (§4): nombre, pureza DECLARADA en la etiqueta (la que el estudiante puede usar). */
export function labelPurity(route: RouteId, id: string, scenarios: string[]): Partial<Record<SpeciesId, number>> {
  const has = (s: string) => scenarios.includes(s);
  switch (id) {
    case 'btIAA': return { IAA: has(S8.UNPURE_START) && route === 'ISO' ? 0.97 : 0.99 };
    case 'btAcOH': return { AcOH: route === 'ISO' && has(S8.LIMITING_SWITCH) ? 0.35 : route === 'ISO' && has(S8.WATER_LOAD) ? 0.9 : 0.995 };
    case 'btAcOH30': return { AcOH: 0.3 };
    case 'btH2SO4': return { H2SO4: 0.96 };
    case 'btH3PO4': return { H3PO4: 0.85 };
    case 'btAA': return { AA: has(S8.LIMITING_SWITCH) ? 0.25 : 0.98 };
    case 'btMeOH': return { MeOH: has(S8.WATER_LOAD) ? 0.9 : 0.998 };
    case 'btMeOH70': return { MeOH: 0.7 };
    case 'btNaHCO3': return { NaHCO3: 0.05 };
    case 'jarSA': return { SA: has(S8.UNPURE_START) ? 0.95 : 0.995 };
    case 'jarNa2SO4':
    case 'jarNa2SO4used': return { Na2SO4: 0.99 };
  }
  return {};
}

/** Contenido real (el que manda): la pureza declarada se completa con agua o, en sólidos, con una sal inerte. */
function bottleContent(route: RouteId, id: string, scenarios: string[]): { liq?: Mol; solid?: Mol } {
  const pur = labelPurity(route, id, scenarios);
  const [[sp, f]] = Object.entries(pur) as Array<[SpeciesId, number]>;
  const has = (s: string) => scenarios.includes(s);
  switch (id) {
    case 'btAA': return { liq: mixture(60, { AA: f, AcOH: 1 - f }) };
    case 'btMeOH': return { liq: mixture(route === 'MS' && has(S8.LIMITING_SWITCH) ? 0.5 : 80, { MeOH: f, H2O: 1 - f }) };
    case 'btNaHCO3': return { liq: mixture(200, { NaHCO3: f, H2O: 1 - f }) };
    case 'btH2SO4':
    case 'btH3PO4': return { liq: mixture(20, { [sp]: f, H2O: 1 - f }) };
    case 'jarSA': return { solid: solidOf({ SA: f, Na2SO4: 1 - f }, 20) };
    case 'jarNa2SO4': return { solid: solidOf({ Na2SO4: 1 }, 30) };
    case 'jarNa2SO4used': {
      // Desecante ya saturado: el agua de hidratación llena su capacidad.
      const na = 10 / SPECIES.Na2SO4.molarMass;
      return { solid: { Na2SO4: na, Na2SO4w: (10 * 0.25) / 18.015 } };
    }
  }
  return { liq: mixture(id === 'btIAA' ? 60 : 90, { [sp]: f, H2O: 1 - f }) };
}

const vessel = (id: string, shape: VesselShape08, tempC: number, contents: { liq?: Mol; solid?: Mol } = {}, capped?: boolean): Vessel08 =>
  emptyVessel08(id, shape, shapeSpec08(shape), tempC, contents, capped);

const SHAPE: Record<string, VesselShape08> = { btNaHCO3: 'bottle250', btH2SO4: 'dropperBottle', btH3PO4: 'dropperBottle' };

export function buildVessels08(route: RouteId, p: P08Params, scenarios: string[]): Vessel08[] {
  const T = p.ambientTempC;
  const has = (s: string) => scenarios.includes(s);
  const out: Vessel08[] = [
    vessel('rf', 'roundFlask', T, has(S8.WET_VESSEL) && route !== 'ISO' ? { liq: mixture(0.4, { H2O: 1 }) } : {}),
    vessel('wg1', 'watchGlass', T, has(S8.WET_VESSEL) && route === 'MS' ? { liq: mixture(0.05, { H2O: 1 }) } : {}),
    vessel('cyl10', 'cyl10', T),
    vessel('cyl25', 'cyl25', T),
    vessel('washBottle', 'washBottle', T, { liq: mixture(450, { H2O: 1 }) }),
    vessel('plasticCup', 'plasticCup', T),
    vessel('wasteOrg', 'waste', T),
    vessel('wasteAq', 'waste', T),
    vessel('wasteAcid', 'waste', T),
    vessel('wasteSolid', 'waste', T),
  ];
  for (const s of shelfFor(route)) out.push(vessel(s.id, SHAPE[s.id] ?? (s.kind === 'jar' ? 'jar' : 'bottle100'), T, bottleContent(route, s.id, scenarios), true));
  if (usesExtraction(route)) {
    out.push(vessel('sf', 'sepFunnel', T), vessel('bkAq', 'beaker100', T), vessel('erDry', 'erlenmeyer', T), vessel('fracPot', 'roundFlask', T), vessel('fracHead', 'vial', T), vessel('vialP', 'vial', T));
  } else {
    out.push(
      vessel('bkIce', 'beaker100', p.iceTempC, { liq: mixture(30, { H2O: 1 }) }),
      vessel('kitasato', 'kitasato', T),
      vessel('fpFine', 'filterPaper', T, has(S8.FILTER_WET) ? { liq: mixture(0.4, { H2O: 1 }) } : {}),
      vessel('fpCoarse', 'filterPaper', T),
    );
  }
  return out;
}
