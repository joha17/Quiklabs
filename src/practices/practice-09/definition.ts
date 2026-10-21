/**
 * Definición de la Práctica 9 — identificación de cationes (§4): estaciones, objetos de la mesada, campana 3D con la
 * zona de llama virtual, controles de emisión, reactivos de la marcha, tubos, centrífuga y la muestra incógnita cuya
 * composición se fija por escenario ANTES de la semilla (§7). Mesada x = 0…560, y = 0…64 (cm).
 */
import type { Mol, P09Object, P09Params, P09World, Pose, Vessel09 } from '../../simulation/cation-analysis-world/types';
import { GEO09, shapeSpec09, type VesselShape09 } from '../../simulation/cation-analysis-world/geometry';
import { S9, emptyVessel09 } from '../../simulation/cation-analysis-world/world';
import { hashRandom } from '../../simulation/core/rng';
import { solution, type Salt } from '../../simulation/cation-analysis-world/species';

export type P09Mode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export const BENCH09 = { length: 560, depth: 64 };

export interface P09Station {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  target: [number, number, number];
  dist: number;
  elevation: number;
}

/** Estaciones (§1): A observación y EPP, B atlas de emisión, C dos soportes en la campana, D separación, E confirmación, F auditoría. */
export const P09_STATIONS: P09Station[] = [
  { id: 'A', target: [55, 32, 8], dist: 95, elevation: 0.42 },
  { id: 'B', target: [212, 36, 18], dist: 95, elevation: 0.3 },
  { id: 'C', target: [235, 32, 36], dist: 185, elevation: 0.22 },
  { id: 'D', target: [400, 34, 10], dist: 110, elevation: 0.42 },
  { id: 'E', target: [225, 30, 20], dist: 80, elevation: 0.28 },
  { id: 'F', target: [505, 34, 8], dist: 85, elevation: 0.4 },
];

export const HOOD_POS = { x: (GEO09.hood.x0 + GEO09.hood.x1) / 2, y: 32 };
export const EMITTER_POS = { x: 215, y: 30 };
export const FLAME_POINT = { x: 215, y: 30, z: GEO09.emitter.h + 2 };
export const PAD_POS = { x: 215, y: 30, z: GEO09.emitter.padZ };
export const CLEAN_POS = { x: 192, y: 22 };
export const RACK_POS = { x: 370, y: 42 };
export const CF_POS = { x: 432, y: 42 };
export const TURB_POS = { x: 402, y: 16 };
export const BALANCE_POS = { x: 470, y: 24 };
export const PAN_POS = { x: 470, y: 22, z: GEO09.balance.panZ };

const P = (x: number, y: number, rot = 0, z = 0): Pose => ({ x, y, z, rotationRad: rot });
const O = (o: Partial<P09Object> & Pick<P09Object, 'id' | 'kind' | 'pose'>): P09Object => ({ support: 'bench', movable: true, ...o });

export const CONTROLS = ['ctlSr', 'ctlK', 'ctlNa', 'ctlLi', 'ctlCa', 'ctlBlank', 'ctlNaK'] as const;
export const TUBES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

/** Posición de un sitio de la gradilla y del rotor. */
export const rackSlot = (i: number) => ({ x: RACK_POS.x - 10.5 + i * GEO09.rack.pitch, y: RACK_POS.y, z: 2 });
export const rotorSlot = (i: number) => {
  const a = (i * Math.PI) / 2;
  return { x: CF_POS.x + Math.cos(a) * 4.5, y: CF_POS.y + Math.sin(a) * 4.5, z: 6 };
};

export const unknownCode = (seed: number) => `M-${String(10 + Math.floor(hashRandom(seed, 'code') * 89))}`;

/** Composición de la muestra incógnita según el escenario (mol/L) (§7: se registra antes de la semilla). */
export function unknownComposition(scenarios: string[]): { salts: Array<{ salt: Salt; molL: number }>; cations: P09World['unknown']['cations'] } {
  const has = (s: string) => scenarios.includes(s);
  const near = has(S9.NEAR_LIMIT);
  let sr = near ? 0.004 : 0.04;
  let fe = near ? 0.002 : 0.02;
  let k = near ? 0.012 : 0.1;
  if (has(S9.NO_SR)) sr = 0;
  if (has(S9.NO_FE)) fe = 0;
  if (has(S9.NO_K)) k = 0;
  if (has(S9.ONLY_K)) {
    sr = 0;
    fe = 0;
    k = 0.1;
  }
  const na = has(S9.NA_CONTAMINANT) ? 0.05 : 0;
  const salts: Array<{ salt: Salt; molL: number }> = [{ salt: 'HNO3', molL: 0.01 }];
  const cations: P09World['unknown']['cations'] = [];
  if (sr) { salts.push({ salt: 'Sr(NO3)2', molL: sr }); cations.push('Sr2+'); }
  if (fe) { salts.push({ salt: 'Fe(NO3)3', molL: fe }); cations.push('Fe3+'); }
  if (k) { salts.push({ salt: 'KNO3', molL: k }); cations.push('K+'); }
  if (na) { salts.push({ salt: 'NaCl', molL: na }); cations.push('Na+'); }
  return { salts, cations };
}

export function buildObjects09(seed: number, scenarios: string[]): P09Object[] {
  const out: P09Object[] = [
    // A — EPP y muestra incógnita codificada.
    O({ id: 'ppeTray', kind: 'ppeTray', pose: P(40, 44), movable: false }),
    O({ id: 'smp1', kind: 'bottle', pose: P(72, 30), label: unknownCode(seed) }),
    O({ id: 'cyl10', kind: 'cylinder', pose: P(88, 22), massG: 29.6 }),
    // Campana 3D con la zona de llama virtual (B, C, E).
    O({ id: 'hood01', kind: 'hood', pose: P(HOOD_POS.x, HOOD_POS.y), movable: false }),
    O({ id: 'emitter01', kind: 'emitter', pose: P(EMITTER_POS.x, EMITTER_POS.y), movable: false }),
    O({ id: 'loop01', kind: 'loop', pose: P(200, 16, 0, 0.5) }),
    O({ id: 'clean01', kind: 'cleanCup', pose: P(CLEAN_POS.x, CLEAN_POS.y), movable: false }),
    O({ id: 'wgFlame', kind: 'watchGlass', pose: P(246, 20), massG: 18 }),
    O({ id: 'cupFlame', kind: 'refractoryCup', pose: P(260, 20), massG: 12 }),
    O({ id: 'spec01', kind: 'spectroCam', pose: P(288, 42), movable: false }),
    // D — separación: gradilla, centrífuga, turbidímetro, balanza, reactivos, pipeta.
    O({ id: 'rack01', kind: 'rack', pose: P(RACK_POS.x, RACK_POS.y), movable: false }),
    O({ id: 'cf01', kind: 'centrifuge', pose: P(CF_POS.x, CF_POS.y), movable: false }),
    O({ id: 'turb01', kind: 'turbidimeter', pose: P(TURB_POS.x, TURB_POS.y), movable: false }),
    O({ id: 'balance01', kind: 'balance', pose: P(BALANCE_POS.x, BALANCE_POS.y), movable: false }),
    O({ id: 'dbSO4', kind: 'dropperBottle', pose: P(342, 54), label: 'dbSO4' }),
    O({ id: 'dbOH', kind: 'dropperBottle', pose: P(352, 54), label: 'dbOH' }),
    O({ id: 'dbH2O', kind: 'dropperBottle', pose: P(362, 54), label: 'dbH2O' }),
    O({ id: 'washBottle', kind: 'washBottle', pose: P(338, 24) }),
    O({ id: 'pip', kind: 'pipette', pose: P(386, 12, 0, 0.5) }),
    O({ id: 'bk1', kind: 'beaker', pose: P(356, 20), massG: 31 }),
    // F — residuos segregados.
    O({ id: 'wasteLiq', kind: 'waste', pose: P(500, 52), movable: false, label: 'liq' }),
    O({ id: 'wasteSol', kind: 'waste', pose: P(514, 52), movable: false, label: 'sol' }),
  ];
  CONTROLS.forEach((id, i) => out.push(O({ id, kind: 'dropperBottle', pose: P(170 + i * 9, 50), label: id })));
  TUBES.forEach((id, i) => {
    const s = rackSlot(i);
    out.push(O({ id, kind: 'tube', pose: P(s.x, s.y, 0, s.z), support: `rack:${i}`, massG: 6.5 + (hashRandom(seed, `tube${id}`) - 0.5) * 0.2 }));
  });
  void scenarios;
  return out;
}

const vessel = (id: string, shape: VesselShape09, tempC: number, contents: { liq?: Mol; solid?: Mol } = {}, capped?: boolean, from: string[] = []): Vessel09 =>
  emptyVessel09(id, shape, shapeSpec09(shape), tempC, contents, capped, from);

const CONTROL_SALTS: Record<(typeof CONTROLS)[number], Array<{ salt: Salt; molL: number }>> = {
  ctlSr: [{ salt: 'Sr(NO3)2', molL: 0.1 }],
  ctlK: [{ salt: 'KNO3', molL: 0.1 }],
  ctlNa: [{ salt: 'NaCl', molL: 0.1 }],
  ctlLi: [{ salt: 'LiCl', molL: 0.1 }],
  ctlCa: [{ salt: 'CaCl2', molL: 0.1 }],
  ctlBlank: [],
  ctlNaK: [{ salt: 'KNO3', molL: 0.1 }, { salt: 'NaCl', molL: 0.1 }],
};

export function buildVessels09(p: P09Params, scenarios: string[]): Vessel09[] {
  const T = p.ambientTempC;
  const has = (s: string) => scenarios.includes(s);
  const out: Vessel09[] = [
    vessel('smp1', 'bottle', T, { liq: solution(10, unknownComposition(scenarios).salts) }, true),
    vessel('cyl10', 'cylinder', T),
    vessel('clean01', 'cleanCup', T, { liq: solution(15, []) }),
    vessel('wgFlame', 'watchGlass', T, has(S9.SUPPORT_RESIDUE) ? { solid: { 'Sr2+': 2e-6, 'NO3-': 4e-6 } } : {}),
    vessel('cupFlame', 'refractoryCup', T),
    vessel('dbSO4', 'dropperBottle', T, { liq: solution(30, [{ salt: '(NH4)2SO4', molL: 0.25 }]) }, true),
    vessel('dbOH', 'dropperBottle', T, { liq: solution(30, [{ salt: 'NH4OH', molL: 0.25 }, ...(has(S9.ALKALI_CONTAMINATED) ? [{ salt: 'NaCl' as Salt, molL: 0.02 }] : [])]) }, true),
    vessel('dbH2O', 'dropperBottle', T, { liq: solution(30, []) }, true),
    vessel('washBottle', 'washBottle', T, { liq: solution(400, []) }),
    vessel('bk1', 'beaker', T),
    vessel('wasteLiq', 'waste', T),
    vessel('wasteSol', 'waste', T),
  ];
  for (const id of CONTROLS) out.push(vessel(id, 'dropperBottle', T, { liq: solution(20, CONTROL_SALTS[id]) }, true));
  for (const id of TUBES) out.push(vessel(id, 'tube', T));
  if (has(S9.MISLABELED)) {
    // S11: dos tubos preparados por otra persona con los rótulos intercambiados.
    const t1 = out.find((v) => v.id === 'T1')!;
    Object.assign(t1, { liq: solution(2, [{ salt: 'Fe(NO3)3', molL: 0.05 }]), label: 'Sr', from: ['preT1'] });
    const t2 = out.find((v) => v.id === 'T2')!;
    Object.assign(t2, { liq: solution(2, [{ salt: 'Sr(NO3)2', molL: 0.05 }]), label: 'Fe', from: ['preT2'] });
  }
  if (has(S9.UNBALANCED)) {
    // S12: un «contrapeso» preparado con agua insuficiente.
    const t8 = out.find((v) => v.id === 'T8')!;
    Object.assign(t8, { liq: solution(1, []), label: 'Contrapeso', from: ['washBottle'] });
  }
  return out;
}

/** Residuo inicial del asa (S07: asa sucia con sodio). */
export const loopResidueFor = (scenarios: string[]): Mol => (scenarios.includes(S9.DIRTY_LOOP) ? { 'Na+': 3e-7, 'Cl-': 3e-7 } : {});
