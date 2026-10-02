/**
 * Definición de la Práctica 2: modos, estaciones, inventario inicial y disposición en la mesada.
 * Las posiciones están en cm sobre la mesada: x a lo largo, y en profundidad (0 = borde frontal), z altura.
 */
import type { Mixture, Prop, SimParams } from '../../simulation/entities/types';
import type { SubstanceId } from '../../simulation/substances/types';
import type { VesselSpec } from '../../simulation/entities/vessel';
import type { WorldSpec } from '../../simulation/world/world';
import { emptyMixture } from '../../simulation/solutions/mixture';
import { carbonMassG, kno3MassG } from './substances';
import { FUNNEL_STEM_CM } from './instruments';

export type PracticeMode = 'PRACTICE' | 'GUIDED' | 'EVALUATION' | 'DEBUG';

export interface StationDef {
  id: 'A' | 'B' | 'C' | 'D' | 'E';
  x0: number;
  x1: number;
}

export const STATIONS: StationDef[] = [
  { id: 'A', x0: 0, x1: 110 },
  { id: 'B', x0: 110, x1: 220 },
  { id: 'C', x0: 220, x1: 330 },
  { id: 'D', x0: 330, x1: 440 },
  { id: 'E', x0: 440, x1: 560 },
];

export const BENCH = { length: 560, depth: 64 };

/** Etiqueta del tubo → sustancia real esperada. */
export const LABEL_TO_SUBSTANCE: Record<string, SubstanceId> = {
  Zn: 'Zn',
  C: 'GRAPHITE',
  S: 'S8',
  NaCl: 'NaCl',
  sacarosa: 'SUCROSE',
  'aceite vegetal': 'OIL_VEG',
  'aceite mineral': 'OIL_MIN',
};

/** Etiquetas posibles de los tubos (Parte A). La de aceite depende del perfil elegido. */
export function tubeLabels(oil: 'OIL_VEG' | 'OIL_MIN'): string[] {
  return ['Zn', 'C', 'S', 'NaCl', 'sacarosa', oil === 'OIL_VEG' ? 'aceite vegetal' : 'aceite mineral'];
}

const pose = (x: number, y: number) => ({ x, y, z: 0, rotationRad: 0 });

function solidMix(rec: Mixture['solid']): Mixture {
  const m = emptyMixture();
  m.solid = { ...rec };
  return m;
}

/** Mezcla carbón:KNO₃ 1:5 en masa; el KNO₃ técnico incluye impurezas solubles inertes. */
export function mixtureOf(totalG: number, purity: number): Mixture {
  const c = totalG * (carbonMassG / (carbonMassG + kno3MassG));
  const reagent = totalG - c;
  return solidMix({ CARBON: c, KNO3: reagent * purity, IMP: reagent * (1 - purity) });
}

export function buildWorldSpec(mode: PracticeMode, params: SimParams): WorldSpec {
  const oilMix = emptyMixture();
  oilMix.oil = { [params.oilProfile]: 46 };
  const water = (g: number) => {
    const m = emptyMixture();
    m.waterG = g;
    return m;
  };
  const ice = (g: number) => {
    const m = emptyMixture();
    m.iceG = g;
    return m;
  };
  const useBalance = mode !== 'GUIDED';

  const vessels: VesselSpec[] = [
    // ── Estación A: tubos ──
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `t${i + 1}`, type: 'TEST_TUBE' as const, pose: pose(10 + i * 4.2, 52), support: `tray:${i}`,
    })),
    { id: 'jar_zn', type: 'REAGENT_JAR', pose: pose(58, 54), support: 'bench', mix: solidMix({ Zn: 40 }) },
    { id: 'jar_graphite', type: 'REAGENT_JAR', pose: pose(67, 54), support: 'bench', mix: solidMix({ GRAPHITE: 25 }) },
    { id: 'jar_s', type: 'REAGENT_JAR', pose: pose(76, 54), support: 'bench', mix: solidMix({ S8: 25 }) },
    { id: 'jar_nacl', type: 'REAGENT_JAR', pose: pose(85, 54), support: 'bench', mix: solidMix({ NaCl: 40 }) },
    { id: 'jar_sucrose', type: 'REAGENT_JAR', pose: pose(94, 54), support: 'bench', mix: solidMix({ SUCROSE: 40 }) },
    { id: 'bottle_oil', type: 'REAGENT_BOTTLE', pose: pose(103, 54), support: 'bench', mix: oilMix },
    { id: 'spatula', type: 'SPATULA', pose: pose(62, 14), support: 'bench' },
    { id: 'dropper', type: 'DROPPER', pose: pose(72, 14), support: 'bench' },
    { id: 'towel', type: 'TOWEL', pose: pose(92, 12), support: 'bench' },
    // ── Estación B: preparación ──
    { id: 'cyl', type: 'GRADUATED_CYLINDER', pose: pose(120, 26), support: 'bench' },
    { id: 'piseta', type: 'WASH_BOTTLE', pose: pose(130, 50), support: 'bench', mix: water(400) },
    useBalance
      ? { id: 'jar_mix', type: 'REAGENT_JAR', pose: pose(144, 54), support: 'bench', mix: mixtureOf(60, params.reagentPurity) }
      : { id: 'vial', type: 'VIAL', pose: pose(144, 50), support: 'bench', mix: mixtureOf(2.5, params.reagentPurity) },
    ...(useBalance ? [{ id: 'weigh_paper', type: 'WEIGH_PAPER' as const, pose: pose(150, 14), support: 'bench' }] : []),
    { id: 'beaker1', type: 'BEAKER', pose: pose(176, 22), support: 'bench' },
    // ── Estación C: filtración ──
    // El origen del embudo es el vértice del cono: en la mesada apoya sobre la punta de la espiga.
    { id: 'funnel', type: 'FUNNEL', pose: { ...pose(236, 20), z: FUNNEL_STEM_CM }, support: 'bench' },
    { id: 'paper1', type: 'FILTER_PAPER', pose: pose(312, 14), support: 'bench' },
    { id: 'paper2', type: 'FILTER_PAPER', pose: pose(318, 22), support: 'bench' },
    { id: 'paper3', type: 'FILTER_PAPER', pose: pose(312, 30), support: 'bench' },
    { id: 'beaker2', type: 'BEAKER', pose: pose(292, 18), support: 'bench' },
    // ── Estación D: evaporación ──
    { id: 'dish', type: 'PORCELAIN_DISH', pose: pose(352, 22), support: 'bench' },
    // ── Estación E: cristalización y residuos ──
    { id: 'bath', type: 'BATH', pose: pose(468, 34), support: 'bench' },
    { id: 'ice_bucket', type: 'ICE_BUCKET', pose: pose(500, 50), support: 'bench', mix: ice(900), temperatureC: 0 },
    { id: 'ice_scoop', type: 'SCOOP', pose: pose(500, 18), support: 'bench' },
    { id: 'jug', type: 'JUG', pose: pose(520, 50), support: 'bench', mix: water(800) },
    { id: 'jar_kno3', type: 'REAGENT_JAR', pose: pose(486, 12), support: 'bench', mix: solidMix({ KNO3: 30 }) },
    { id: 'waste_solid', type: 'WASTE', pose: pose(540, 50), support: 'bench' },
    { id: 'waste_liquid', type: 'WASTE', pose: pose(548, 22), support: 'bench' },
  ];

  const props: Prop[] = [
    { id: 'tray', kind: 'tray', pose: pose(20.5, 52), support: 'bench' },
    { id: 'rack', kind: 'rack', pose: pose(30, 26), support: 'bench' },
    ...(useBalance ? [{ id: 'balance', kind: 'balance', pose: pose(158, 40), support: 'bench' }] : []),
    { id: 'hotplate', kind: 'hotplate', pose: pose(204, 36), support: 'bench' },
    { id: 'rod', kind: 'rod', pose: pose(186, 10), support: 'bench' },
    { id: 'probe', kind: 'probe', pose: pose(196, 10), support: 'bench' },
    { id: 'stand', kind: 'stand', pose: pose(266, 42), support: 'bench' },
    { id: 'watch_glass', kind: 'watch_glass', pose: pose(378, 18), support: 'bench' },
    { id: 'tongs', kind: 'tongs', pose: pose(400, 12), support: 'bench' },
  ];

  return { vessels, props };
}

/** Recipientes que pertenecen a cada estación (para navegación accesible). */
export function stationOf(x: number): StationDef['id'] {
  for (const s of STATIONS) if (x < s.x1) return s.id;
  return 'E';
}
