/**
 * Mundo de la Práctica 4 (reacciones químicas): creación, comandos y paso fijo determinista.
 * Orden de cada paso: seguridad del etanol → mechero (modelo de la Práctica 3) → vertidos, goteos y piseta →
 * recipientes (mezcla espacial, equilibrios, precipitación, energía, partículas, gas) → metales (redox de superficie)
 * → cintas de Mg (combustión) → sonda → derrames → evidencia.
 * Misma semilla + mismos comandos ⇒ mismo resultado; nada depende de los fotogramas.
 */
import { clamp } from '../core/math';
import { hashRange, rand } from '../core/rng';
import type { Cell, ChemContext, ReactionOutcome } from '../chemistry/types';
import {
  addMol, applyExtent, cloneCell, elementTotals, emptyCell, equilibrate, mergeInto, n, normalizeWater, pH, precipitationStep,
  transferFraction, transmittance, WATER, WATER_MOL_PER_L,
} from '../chemistry/mixture';
import { createFlameWorld, dispatchFlame, hasOpenFlame, isLit, localContact, localTemperature, mouthPos, stepFlame, type FlameContext } from '../flame-world/world';
import type { FlameCommand } from '../flame-world/commands';
import type { Practice3Params, ObjKind as GasObjKind } from '../flame-world/types';
import type { P4Command, P4DispatchResult } from './commands';
import type {
  Addition, MetalPiece, MgRibbon, P4Object, P4ObjKind, P4Params, P4Vessel, P4World, ParticleState, Pose, Severity,
  SimEvent, VesselKind, VesselRxState,
} from './types';

// ─────────────────────────── Contexto inyectado por la práctica ───────────────────────────

export interface ReagentSpec {
  molar: Record<string, number>;
  solvent: 'WATER' | 'ETHANOL';
}

export interface ReactionGeometry {
  /** Altura del nivel (cm sobre la base) para un volumen dado, recipiente vertical. */
  level(kind: VesselKind, ml: number): number;
  /** Radio interior de la boca y altura del borde (cm). */
  mouth(kind: VesselKind): { r: number; rimZ: number };
  /** Radio exterior (huella) para colisiones simples. */
  footR(kind: VesselKind): number;
  capacityMl: Record<VesselKind, number>;
  thermal: Record<VesselKind, { massG: number; cp: number; hAir: number; coupling: number }>;
  pathCm: Record<VesselKind, number>;
  nail: { length: number; d: number; segments: number };
  alStrip: { length: number; w: number; t: number; segments: number };
  ribbon: { length: number; w: number; t: number; density: number };
  dropperInBottleZ: number;
  tubeRackZ: number;
  capsuleRimR: number;
}

export interface ReactionContext {
  chem: ChemContext;
  gasCtx: FlameContext;
  reagents: Record<string, ReagentSpec>;
  geo: ReactionGeometry;
}

export interface ReactionWorldSpec {
  objects: Array<{ id: string; kind: P4ObjKind; pose: Pose; support: string; movable: boolean }>;
  vessels: Array<{ id: string; kind: VesselKind; reagent?: string; volumeMl?: number }>;
  gasObjects: Array<{ id: string; kind: GasObjKind; pose: Pose; support: string; movable: boolean }>;
  gasParams: Practice3Params;
  scenarios: string[];
}

// ─────────────────────────── Utilidades ───────────────────────────

const MAX_EVENTS = 3000;
const TINY = 1e-15;

export function emit4(w: P4World, code: string, severity: Severity, params?: SimEvent['params'], id?: string): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: Math.round(w.timeS * 100) / 100, code, severity, ...(id ? { vesselId: id } : {}), ...(params ? { params } : {}) };
  w.events.push(e);
  if (w.events.length > MAX_EVENTS) w.events.splice(0, w.events.length - MAX_EVENTS);
  return e;
}

function emitLatched(w: P4World, key: string, code: string, severity: Severity, params?: SimEvent['params'], id?: string) {
  const k = `latch:${key}`;
  if (w.evidence[k]) return;
  w.evidence[k] = 1;
  emit4(w, code, severity, params, id);
}
function rearm(w: P4World, key: string) {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
}
function bump(w: P4World, key: string, by = 1) {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
}
function flag(w: P4World, key: string) {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
}

/** Reenvía al registro de la práctica los eventos nuevos del mechero (sub-mundo de la Práctica 3). */
function forwardGasEvents(w: P4World) {
  const last = w.evidence.__gasSeq ?? 0;
  const evs = w.gas.events;
  let i = evs.length - 1;
  while (i >= 0 && (evs[i].seq ?? 0) > last) i--;
  for (let k = i + 1; k < evs.length; k++) {
    const e = evs[k];
    emit4(w, e.code, e.severity, { ...(e.params ?? {}), gas: true }, e.vesselId);
  }
  if (evs.length) w.evidence.__gasSeq = evs[evs.length - 1].seq ?? last;
}

export const liquidMl = (v: P4Vessel): number => (v.bulk.volL + v.plume.volL) * 1000;

export function vesselMol(v: P4Vessel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of [v.bulk, v.plume]) for (const [id, m] of Object.entries(c.mol)) out[id] = (out[id] ?? 0) + m;
  return out;
}

/**
 * El recipiente tal como se observó en su ensayo: el actual si todavía tiene contenido; si ya se desechó, la
 * instantánea tomada al empezar a desecharlo (§22: desechar los residuos no borra la evidencia).
 */
export function observedVessel(w: P4World, id: string | null): P4Vessel | null {
  const v = id ? w.vessels[id] : null;
  if (!v) return null;
  if (!v.observed || liquidMl(v) > 0.3) return v;
  return { ...v, bulk: v.observed.bulk, plume: v.observed.plume, particles: v.observed.particles, temperatureC: v.observed.temperatureC };
}

export function speciesMol(v: P4Vessel, id: string): number {
  return n(v.bulk, id) + n(v.plume, id);
}

/** Volumen aparente de los sólidos (mL) — eleva el nivel y forma el sedimento. */
export function solidsVolumeMl(v: P4Vessel, ctx: ReactionContext): number {
  let ml = 0;
  for (const c of [v.bulk, v.plume]) {
    for (const [id, m] of Object.entries(c.mol)) {
      const sp = ctx.chem.species[id];
      if (sp?.phase !== 'SOLID') continue;
      // Los precipitados hidratados ocupan mucho más que el sólido compacto.
      const bulkFactor = sp.gelatinous ? 40 : 12;
      ml += ((m * sp.molarMass) / (sp.densityGcm3 ?? 2.5)) * bulkFactor;
    }
  }
  return ml;
}

/** Celda combinada (seno + penacho) para lecturas de pH y color. */
export function mergedCell(v: P4Vessel): Cell {
  const c = cloneCell(v.bulk);
  for (const [id, m] of Object.entries(v.plume.mol)) addMol(c, id, m);
  c.volL += v.plume.volL;
  return c;
}

export function vesselPH(v: P4Vessel): number {
  return pH(mergedCell(v), v.temperatureC);
}

export function surfaceZ(w: P4World, ctx: ReactionContext, id: string): number {
  const v = w.vessels[id];
  const o = w.objects[id];
  if (!v || !o) return 0;
  return o.pose.z + ctx.geo.level(v.kind, liquidMl(v) + solidsVolumeMl(v, ctx) + displacedMl(w, id));
}

/** Volumen desplazado por piezas sumergidas (clavo, tira de Al). */
function displacedMl(w: P4World, vesselId: string): number {
  let ml = 0;
  for (const m of Object.values(w.metals)) {
    if (m.immersedIn !== vesselId) continue;
    const vol = m.metal === 'Fe' ? Math.PI * (m.diameterCm / 2) ** 2 * m.lengthCm : m.widthCm * m.thicknessCm * m.lengthCm;
    ml += vol * 0.4;
  }
  return ml;
}

export function mouthOf(w: P4World, ctx: ReactionContext, id: string): { x: number; y: number; z: number; r: number } | null {
  const v = w.vessels[id];
  const o = w.objects[id];
  if (!v || !o) return null;
  const m = ctx.geo.mouth(v.kind);
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + m.rimZ, r: m.r };
}

function emptyParticles(): Record<string, ParticleState> {
  return {};
}

function newVessel(id: string, kind: VesselKind, ctx: ReactionContext, ambientC: number): P4Vessel {
  return {
    id, kind, capacityMl: ctx.geo.capacityMl[kind], bulk: emptyCell(), plume: emptyCell(), temperatureC: ambientC, particles: emptyParticles(),
    agitation: 0, agitationTool: 'NONE', reagent: null, label: null, additions: [], released: {}, extents: {}, heatJ: 0,
    tempLog: { min: ambientC, max: ambientC, first: null }, broken: false, disposedTo: null, rx: 'EMPTY', localRate: 0, bulkRate: 0, dirty: false,
    inspected: false, phChecked: null, residueTempC: ambientC, contaminated: false, wet: false, lastBubbleS: -99,
  };
}

/** Disolución de reactivo recién preparada (disociada, equilibrada y filtrada). */
export function reagentCell(ctx: ReactionContext, reagentId: string, ml: number, tempC: number): Cell {
  const r = ctx.reagents[reagentId];
  const c = emptyCell();
  c.volL = ml / 1000;
  if (!r || r.solvent === 'WATER') addMol(c, WATER, c.volL * WATER_MOL_PER_L);
  else addMol(c, 'EtOH', c.volL * 17.1);
  for (const [id, M] of Object.entries(r?.molar ?? {})) addMol(c, id, M * c.volL);
  equilibrate(c, ctx.chem, tempC);
  for (const id of Object.keys(c.mol)) if (ctx.chem.species[id]?.phase === 'SOLID') delete c.mol[id];
  c.origin = { [reagentId]: ml };
  return c;
}

/** Reactivo dominante (por volumen de origen) de un líquido. */
export function dominantOrigin(c: Cell): string | null {
  let best: string | null = null;
  let bv = 0;
  for (const [r, ml] of Object.entries(c.origin ?? {})) if (ml > bv) {
    bv = ml;
    best = r;
  }
  return best;
}

/** Volumen (mL) de cada reactivo original presente en un recipiente. */
export function vesselOrigin(v: P4Vessel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of [v.bulk, v.plume]) for (const [r, ml] of Object.entries(c.origin ?? {})) out[r] = (out[r] ?? 0) + ml;
  return out;
}

// ─────────────────────────── Creación ───────────────────────────

export function createReactionWorld(spec: ReactionWorldSpec, seed: number, params: P4Params, ctx: ReactionContext): P4World {
  const amb = params.ambientC;
  const objects: Record<string, P4Object> = {};
  for (const o of spec.objects) objects[o.id] = { id: o.id, kind: o.kind, pose: { ...o.pose }, support: o.support, movable: o.movable, temperatureC: amb };
  const vessels: Record<string, P4Vessel> = {};
  for (const v of spec.vessels) {
    const ves = newVessel(v.id, v.kind, ctx, amb);
    ves.reagent = v.reagent ?? null;
    if (v.reagent && v.volumeMl && v.kind !== 'DROPPER') {
      ves.bulk = reagentCell(ctx, v.reagent, v.volumeMl, amb);
    }
    vessels[v.id] = ves;
  }
  const gas = createFlameWorld(
    {
      objects: spec.gasObjects, solutions: [], loops: [], atomizers: [],
      unknown: { number: 0, cation: '', intensityFactor: 1, background: {} },
      hose: { cracked: spec.scenarios.includes('CRACKED_HOSE') }, room: { ventilation: 0.3, draft: 0 }, fuel: 'PROPANE',
    },
    seed,
    spec.gasParams,
  );
  const metals: Record<string, MetalPiece> = {};
  const g = ctx.geo;
  if (objects.nail) {
    const ox = spec.scenarios.includes('RUSTY_NAIL') ? 0.9 : hashRange(seed, 'nail:oxide', 0.35, 0.6);
    const vol = Math.PI * (g.nail.d / 2) ** 2 * g.nail.length + Math.PI * 0.375 ** 2 * 0.15;
    const mol = (vol * 7.87) / 55.845;
    metals.nail = {
      id: 'nail', metal: 'Fe', lengthCm: g.nail.length, diameterCm: g.nail.d, widthCm: 0, thicknessCm: 0, metalMol: mol, initialMetalMol: mol,
      segments: Array.from({ length: g.nail.segments }, (_, i) => ({ oxide: clamp(ox * hashRange(seed, `nail:seg${i}`, 0.75, 1.25), 0, 1), cuMol: 0 })),
      roughness: 1, sandStrokes: 0, passivation: 0, immersedIn: null, immersedSince: null, totalImmersedS: 0, removedAt: null, wet: false, rinsed: false,
      detachedCuMol: 0, state: 'CLEAN_OR_OXIDIZED', inspectedBefore: false, inspectedAfter: false, initialOxide: ox,
    };
  }
  if (objects.al_strip) {
    const vol = g.alStrip.length * g.alStrip.w * g.alStrip.t;
    const mol = (vol * 2.7) / 26.982;
    metals.al_strip = {
      id: 'al_strip', metal: 'Al', lengthCm: g.alStrip.length, diameterCm: 0, widthCm: g.alStrip.w, thicknessCm: g.alStrip.t, metalMol: mol, initialMetalMol: mol,
      segments: Array.from({ length: g.alStrip.segments }, () => ({ oxide: 0, cuMol: 0 })),
      roughness: 1, sandStrokes: 0, passivation: 0.995, immersedIn: null, immersedSince: null, totalImmersedS: 0, removedAt: null, wet: false, rinsed: false,
      detachedCuMol: 0, state: 'CLEAN_OR_OXIDIZED', inspectedBefore: false, inspectedAfter: false, initialOxide: 0,
    };
  }
  const ribbons: Record<string, MgRibbon> = {};
  for (const o of Object.values(objects)) if (o.kind === 'mgRibbon') ribbons[o.id] = newRibbon(o.id, seed, ctx);
  const tongs: P4World['tongs'] = {};
  for (const o of Object.values(objects)) if (o.kind === 'tubeTongs' || o.kind === 'crucibleTongs') tongs[o.id] = { holding: null, grip: 0 };
  const w: P4World = {
    kind: 'practice-04', seed, rng: seed >>> 0 || 1, tick: 0, timeS: 0, params, ppe: false, gas, objects, vessels, metals, ribbons, tongs,
    probe: { vesselId: null, touchingBottom: false, readingC: amb, tipInLiquid: false },
    rod: { vesselId: null, broken: false, spares: 1 },
    spills: [], ledger: { drained: {}, smoke: {}, air: {}, towels: {}, dust: {} }, disposals: [], pours: {}, squeezes: {},
    stopwatch: { running: false, startedAt: null, accumS: 0, starts: [] },
    shield: { alignment: 0, placed: false }, mgView: { inView: false, shielded: false },
    safety: { block: null, incident: null, burns: 0, stoppedByTeacher: false, mgWarningAccepted: false, gloves: false },
    scenarios: [...spec.scenarios], evidence: {}, events: [],
  };
  applyScenarios(w, ctx);
  return w;
}

function newRibbon(id: string, seed: number, ctx: ReactionContext): MgRibbon {
  const r = ctx.geo.ribbon;
  const wCm = r.w * hashRange(seed, `${id}:w`, 0.9, 1.1);
  const tCm = r.t * hashRange(seed, `${id}:t`, 0.85, 1.15);
  const mass = r.length * wCm * tCm * r.density;
  return {
    id, lengthCm: r.length, widthCm: wCm, thicknessCm: tCm, massInitialG: mass, mgMol: mass / 24.305, mgoMol: 0, mg3n2Mol: 0, temperatureC: 23,
    phase: 'COLD_METAL', burnFrac: 0, ignitedAt: null, endedAt: null, established: false, abrupt: false, toCapsuleMol: 0, toBenchMol: 0, smokeMol: 0,
    directViewS: 0, smokeFrac: hashRange(seed, `${id}:smoke`, 0.05, 0.12),
  };
}

/** Escenarios docentes (§17): se aplican al crear el intento y el estudiante debe detectarlos. */
function applyScenarios(w: P4World, ctx: ReactionContext) {
  const amb = w.params.ambientC;
  for (const s of w.scenarios) {
    if (s === 'WET_BEAKER' && w.vessels.beaker) {
      // Beaker mal escurrido: 1,5 mL de agua (dilución y menor cambio térmico, §8.7).
      w.vessels.beaker.bulk = reagentCell(ctx, 'water', 1.5, amb);
      w.vessels.beaker.wet = true;
    }
    if (s === 'CONTAMINATED_DROPPER' && w.vessels.dropper_na2co3) {
      // Gotero del Na₂CO₃ con restos de HCl (§9.5): consume CO₃²⁻ y libera CO₂.
      w.vessels.dropper_na2co3.bulk = reagentCell(ctx, 'hcl', 0.25, amb);
      w.vessels.dropper_na2co3.contaminated = true;
    }
    if (s === 'DIRTY_TUBE' && w.vessels.tube2) {
      w.vessels.tube2.bulk = reagentCell(ctx, 'na2co3', 0.12, amb);
      w.vessels.tube2.wet = true;
    }
  }
}

// ─────────────────────────── Transferencias (§7.3, §16.2) ───────────────────────────

/** Fracción de cada sólido que viaja con el líquido (suspendido; el sedimento solo al volcar). */
function solidCarry(v: P4Vessel, ctx: ReactionContext, tiltDeg: number): (id: string) => number {
  return (id: string) => {
    const sp = ctx.chem.species[id];
    if (sp?.phase !== 'SOLID') return 1;
    const p = v.particles[id];
    const susp = p ? p.suspended : 0;
    return clamp(susp + (tiltDeg > 100 ? (1 - susp) * 0.8 : 0), 0, 1);
  };
}

/**
 * Saca `ml` de líquido de `v` (seno y penacho en proporción) y devuelve la celda transferida.
 * Respeta la retención en las paredes (holdup): un recipiente «vacío» queda mojado.
 */
function takeLiquid(w: P4World, ctx: ReactionContext, v: P4Vessel, ml: number, tiltDeg: number, keepHoldup = true): Cell {
  const out = emptyCell();
  const have = liquidMl(v);
  const hold = keepHoldup ? w.params.holdupMl[v.kind] ?? 0 : 0;
  const take = Math.min(ml, Math.max(0, have - hold));
  if (take <= 1e-9 || have <= 1e-9) return out;
  const f = take / have;
  const carry = solidCarry(v, ctx, tiltDeg);
  transferFraction(v.bulk, out, f, carry);
  const p = emptyCell();
  transferFraction(v.plume, p, f, carry);
  mergeInto(out, p);
  v.dirty = true;
  return out;
}

/** Entrada de líquido a un recipiente: cae en el penacho, que arrastra líquido del seno (§7.4). */
function receive(w: P4World, ctx: ReactionContext, target: P4Vessel, cell: Cell, from: string, how: Addition['how']) {
  if (cell.volL <= 0 && !Object.keys(cell.mol).length) return;
  const addedMl = cell.volL * 1000;
  const reagent = dominantOrigin(cell) ?? w.vessels[from]?.reagent ?? null;
  const mol = { ...cell.mol };
  // Arrastre: el chorro mezcla localmente con una parte del seno.
  const ent = Math.min(target.bulk.volL, cell.volL * w.params.entrainment);
  if (ent > 0 && target.bulk.volL > 0) transferFraction(target.bulk, target.plume, ent / target.bulk.volL);
  // Mezcla térmica sencilla: el líquido que entra llega a la temperatura de su origen.
  const src = w.vessels[from];
  const tIn = src ? src.temperatureC : w.params.ambientC;
  const cTarget = heatCapacity(target, ctx);
  const cIn = addedMl * 4.18;
  target.temperatureC = (target.temperatureC * cTarget + tIn * cIn) / Math.max(1e-6, cTarget + cIn);
  // Sólidos que llegan: mantienen su estado de suspensión.
  for (const [id] of Object.entries(cell.mol)) {
    if (ctx.chem.species[id]?.phase === 'SOLID' && !target.particles[id]) target.particles[id] = particleFor(w, id, target.id, 0.8, 1);
  }
  mergeInto(target.plume, cell);
  target.dirty = true;
  target.disposedTo = null;
  const last = target.additions[target.additions.length - 1];
  // Las gotas o el vertido continuo del mismo origen se agrupan en una sola adición (para la libreta).
  if (last && last.fromId === from && last.how === how && w.timeS - last.t < 3) {
    last.volumeMl += addedMl;
    for (const [id, m] of Object.entries(mol)) last.mol[id] = (last.mol[id] ?? 0) + m;
    last.t = w.timeS;
  } else {
    target.additions.push({ t: w.timeS, fromId: from, reagent, volumeMl: addedMl, mol, how });
    if (target.additions.length > 60) target.additions.splice(0, target.additions.length - 60);
  }
  if (target.kind === 'WASTE' || target.kind === 'SINK') onDisposal(w, ctx, target, from, addedMl, mol);
  // Desborde (§16.2): lo que no cabe se derrama.
  const over = liquidMl(target) - target.capacityMl;
  if (over > 0.01 && target.kind !== 'SINK') {
    const spilled = takeLiquid(w, ctx, target, over, 0, false);
    addSpill(w, target.id, spilled);
    emitLatched(w, `overflow:${target.id}`, 'OVERFLOW', 'WARN', { ml: Math.round(over * 10) / 10 }, target.id);
  } else rearm(w, `overflow:${target.id}`);
}

function particleFor(w: P4World, solidId: string, vesselId: string, suspended: number, localized: number): ParticleState {
  return {
    suspended, floc: 0, localized,
    meanRadiusUm: hashRange(w.seed, `size:${vesselId}:${solidId}`, 0.6, 1.4) * (solidId.startsWith('Fe(OH)3') || solidId.startsWith('Cu(OH)2') ? 2 : 1),
    sizeVariance: hashRange(w.seed, `var:${vesselId}:${solidId}`, 0.2, 0.45),
  };
}

function addSpill(w: P4World, from: string, cell: Cell, at?: { x: number; y: number }) {
  if (cell.volL <= 1e-9 && !Object.keys(cell.mol).length) return;
  const o = w.objects[from];
  const x = at?.x ?? o?.pose.x ?? 0;
  const y = at?.y ?? Math.max(4, (o?.pose.y ?? 10) - 4);
  const near = w.spills.find((s) => !s.cleaned && Math.hypot(s.x - x, s.y - y) < 6);
  if (near) mergeInto(near.cell, cell);
  else {
    const id = `spill${(w.evidence.__spillSeq ?? 0) + 1}`;
    w.evidence.__spillSeq = (w.evidence.__spillSeq ?? 0) + 1;
    w.spills.push({ id, x, y, cell, t: w.timeS, cleaned: false, from });
  }
}

export function heatCapacity(v: P4Vessel, ctx: ReactionContext): number {
  const th = ctx.geo.thermal[v.kind];
  return liquidMl(v) * 4.18 + th.coupling * th.massG * th.cp;
}

// ─────────────────────────── Residuos (§18.4) ───────────────────────────

/** Categoría correcta de un contenido. */
export function wasteCategory(mol: Record<string, number>, ctx: ReactionContext, phValue: number): string {
  const has = (ids: string[]) => ids.some((id) => (mol[id] ?? 0) > 1e-9);
  if (has(['Cu^2+', 'Cu(s)', 'Cu(OH)2(s)', 'CuCO3(s)', 'Fe(s)', 'Al(s)'])) return 'waste_metals';
  if (has(['Fe^3+', 'FeOH^2+', 'Fe^2+', 'Fe(OH)3(s)', 'Fe(OH)2(s)'])) return 'waste_iron';
  const solids = Object.keys(mol).filter((id) => ctx.chem.species[id]?.phase === 'SOLID' && (mol[id] ?? 0) > 1e-9);
  if (solids.length) return 'waste_solids';
  if (has(['H+', 'OH-', 'Na+', 'Cl-', 'CO3^2-', 'HCO3-', 'Ca^2+', 'HIn', 'Mg^2+'])) {
    return Number.isFinite(phValue) && phValue >= 6 && phValue <= 8 ? 'acidbase_or_drain' : 'waste_acidbase';
  }
  return 'any';
}

function onDisposal(w: P4World, ctx: ReactionContext, container: P4Vessel, from: string, volMl: number, mol: Record<string, number>) {
  const src = w.vessels[from];
  const c = emptyCell();
  c.volL = volMl / 1000;
  for (const [id, m] of Object.entries(mol)) addMol(c, id, m);
  const phv = pH(c, src?.temperatureC ?? 25);
  // La categoría depende de TODO lo que se está desechando del recipiente (también el sedimento que queda en él).
  const whole: Record<string, number> = { ...mol };
  if (src) for (const [id, m] of Object.entries(vesselMol(src))) whole[id] = (whole[id] ?? 0) + m;
  const expected = wasteCategory(whole, ctx, phv);
  let correct: boolean;
  if (expected === 'any') correct = container.id !== 'waste_glass';
  else if (expected === 'acidbase_or_drain') correct = container.id === 'waste_acidbase' || (container.id === 'sink' && w.params.waste.allowNeutralDrain && src?.phChecked !== null);
  else correct = container.id === expected;
  const last = w.disposals[w.disposals.length - 1];
  const sameAsLast = !!last && last.sourceId === from && last.containerId === container.id && w.timeS - last.t < 3;
  if (sameAsLast) {
    // Un vertido continuo es UNA disposición (se agrupa como las adiciones).
    last.volumeMl += volMl;
    for (const [id, m] of Object.entries(mol)) last.mol[id] = (last.mol[id] ?? 0) + m;
    last.t = w.timeS;
    last.correct = last.correct && correct;
  } else w.disposals.push({ t: w.timeS, sourceId: from, containerId: container.id, volumeMl: volMl, expected, correct, mol: { ...mol } });
  if (src) src.disposedTo = container.id;
  if (container.kind === 'SINK') {
    // Lo que va al desagüe sale de la mesada (queda en el balance como «desagüe»).
    for (const [id, m] of Object.entries(container.plume.mol)) w.ledger.drained[id] = (w.ledger.drained[id] ?? 0) + m;
    for (const [id, m] of Object.entries(container.bulk.mol)) w.ledger.drained[id] = (w.ledger.drained[id] ?? 0) + m;
    container.plume = emptyCell();
    container.bulk = emptyCell();
  }
  if (sameAsLast) return;
  if (!correct) {
    emit4(w, 'WASTE_MISCLASSIFIED', 'WARN', { container: container.id, expected }, from);
    bump(w, 'err:waste');
  } else emit4(w, 'WASTE_OK', 'INFO', { container: container.id }, from);
}

/** ¿Acepta el contenedor este contenido? Los metales nunca van al desagüe (§18.3, bloqueo). */
export function disposalRefusal(w: P4World, ctx: ReactionContext, sourceId: string, containerId: string): string | null {
  const src = w.vessels[sourceId];
  const cont = w.vessels[containerId];
  if (!src || !cont) return null;
  if (cont.kind === 'SINK') {
    const cat = wasteCategory(vesselMol(src), ctx, vesselPH(src));
    if (cat === 'waste_metals' || cat === 'waste_iron') return 'DRAIN_METALS';
    if (cat === 'waste_solids') return 'DRAIN_SOLIDS';
  }
  return null;
}

// ─────────────────────────── Comandos ───────────────────────────

const GAS_IDS = new Set(['burner', 'gas_tap', 'lighter', 'extinguisher', 'blanket', 'estop', 'extractor', 'co_detector', 'hose']);
export const isGasObject = (id: string) => GAS_IDS.has(id);

export function dispatchReaction(w: P4World, cmd: P4Command, ctx: ReactionContext): P4DispatchResult {
  switch (cmd.type) {
    case 'confirmPpe':
      w.ppe = true;
      dispatchFlame(w.gas, { type: 'confirmPpe' }, ctx.gasCtx);
      return { ok: true };
    case 'setGloves':
      w.safety.gloves = cmd.on;
      emit4(w, cmd.on ? 'GLOVES_ON' : 'GLOVES_OFF', 'INFO');
      return { ok: true };
    case 'gas':
      return gasCommand(w, ctx, cmd.cmd);
    case 'setPose':
      if (isGasObject(cmd.id)) return gasCommand(w, ctx, { type: 'setPose', id: cmd.id, pose: cmd.pose, support: cmd.support });
      return setPose(w, ctx, cmd.id, cmd.pose, cmd.support);
    case 'pickUp':
      if (isGasObject(cmd.id)) return gasCommand(w, ctx, { type: 'pickUp', id: cmd.id, tool: cmd.tool });
      return pickUp(w, ctx, cmd.id, cmd.tool);
    case 'setPour':
      return setPour(w, ctx, cmd.sourceId, cmd.targetId, cmd.rateMlS, cmd.tiltDeg);
    case 'stopPour': {
      const p = w.pours[cmd.sourceId];
      if (p) {
        delete w.pours[cmd.sourceId];
        if (p.transferredMl > 0.01) emit4(w, 'POUR_DONE', 'INFO', { ml: Math.round(p.transferredMl * 100) / 100, to: p.targetId ?? '' }, cmd.sourceId);
      }
      return { ok: true };
    }
    case 'aspirate':
      return aspirate(w, ctx, cmd.dropperId, cmd.sourceId);
    case 'drop':
      return dropFrom(w, ctx, cmd.dropperId, cmd.targetId, false);
    case 'emptyDropper':
      return dropFrom(w, ctx, cmd.dropperId, cmd.targetId, true);
    case 'squeeze': {
      const wb = w.vessels[cmd.washId];
      if (!wb) return { ok: false, code: 'NO_OBJECT' };
      if (cmd.targetId) {
        const r = waterOnHot(w, ctx, cmd.targetId);
        if (r) return r;
      }
      w.squeezes[cmd.washId] = { targetId: cmd.targetId, rateMlS: clamp(cmd.rateMlS, 0, 2) };
      return { ok: true };
    }
    case 'stopSqueeze':
      delete w.squeezes[cmd.washId];
      return { ok: true };
    case 'setAgitation': {
      const v = w.vessels[cmd.id];
      if (!v) return { ok: false };
      if (cmd.tool === 'ROD' && w.rod.vesselId !== cmd.id) return { ok: false, code: 'ROD_NOT_IN' };
      v.agitation = Math.max(v.agitation, clamp(cmd.intensity, 0, 1));
      v.agitationTool = cmd.tool;
      if (liquidMl(v) > 0.05) flag(w, `stirred:${cmd.id}`);
      w.evidence[`stirLast:${cmd.id}`] = w.timeS;
      return { ok: true };
    }
    case 'clamp':
      return clampCmd(w, ctx, cmd.tongsId, cmd.targetId, cmd.grip);
    case 'unclamp':
      return unclamp(w, ctx, cmd.tongsId);
    case 'sand':
      return sand(w, cmd.id);
    case 'inspect':
      return inspect(w, ctx, cmd.target);
    case 'label': {
      const v = w.vessels[cmd.id];
      if (!v || v.kind !== 'TUBE') return { ok: false };
      v.label = cmd.label;
      emit4(w, 'LABELED', 'INFO', { label: cmd.label ?? '' }, cmd.id);
      return { ok: true };
    }
    case 'washVessel':
      return washVessel(w, ctx, cmd.id);
    case 'dryVessel': {
      const v = w.vessels[cmd.id];
      if (!v) return { ok: false };
      const mol = vesselMol(v);
      const onlyWater = Object.keys(mol).every((id) => id === WATER || mol[id] < 1e-9);
      if (!onlyWater || liquidMl(v) > (w.params.holdupMl[v.kind] ?? 0.1) * 3) return { ok: false, code: 'NOT_JUST_WATER' };
      w.ledger.towels[WATER] = (w.ledger.towels[WATER] ?? 0) + (mol[WATER] ?? 0);
      v.bulk = emptyCell();
      v.plume = emptyCell();
      v.wet = false;
      emit4(w, 'VESSEL_DRIED', 'INFO', undefined, cmd.id);
      return { ok: true };
    }
    case 'checkPh': {
      const v = w.vessels[cmd.id];
      if (!v || liquidMl(v) < 0.05) return { ok: false, code: 'NO_LIQUID' };
      const p = vesselPH(v);
      v.phChecked = Math.round(p);
      emit4(w, 'PH_CHECKED', 'INFO', { ph: v.phChecked }, cmd.id);
      flag(w, `phChecked:${cmd.id}`);
      return { ok: true };
    }
    case 'cleanSpill': {
      const s = w.spills.find((x) => x.id === cmd.spillId);
      if (!s || s.cleaned) return { ok: false };
      s.cleaned = true;
      for (const [id, m] of Object.entries(s.cell.mol)) w.ledger.towels[id] = (w.ledger.towels[id] ?? 0) + m;
      const corrosive = (s.cell.mol['H+'] ?? 0) + (s.cell.mol['OH-'] ?? 0) > 1e-6 || (s.cell.mol['Fe^3+'] ?? 0) > 1e-7;
      if (corrosive && !w.safety.gloves) emit4(w, 'SPILL_NO_GLOVES', 'WARN');
      emit4(w, 'SPILL_CLEANED', 'INFO', { ml: Math.round(s.cell.volL * 10000) / 10 });
      if (w.safety.incident?.code === 'SPILL' && !w.spills.some((x) => !x.cleaned && x.cell.volL * 1000 > 1.5)) w.safety.incident.done.push('CLEAN_SPILL');
      return { ok: true };
    }
    case 'newRibbon': {
      const used = Object.keys(w.ribbons).length;
      if (used >= 4) return { ok: false, code: 'NO_MORE_RIBBON' };
      const dish = w.objects.mg_dish?.pose ?? { x: 384, y: 26, z: 0, rotationRad: 0 };
      if (Object.values(w.objects).some((o) => o.kind === 'mgRibbon' && o.support === 'dish')) return { ok: false, code: 'RIBBON_ON_DISH' };
      const id = `mg${used + 1}`;
      w.objects[id] = { id, kind: 'mgRibbon', pose: { x: dish.x, y: dish.y, z: 0.35, rotationRad: 0 }, support: 'dish', movable: true, temperatureC: w.params.ambientC };
      w.ribbons[id] = newRibbon(id, w.seed, ctx);
      emit4(w, 'NEW_RIBBON', 'INFO', { id });
      return { ok: true, id };
    }
    case 'acceptMgWarning':
      w.safety.mgWarningAccepted = true;
      flag(w, 'mgWarningAccepted');
      return { ok: true };
    case 'setShield':
      w.shield.alignment = clamp(cmd.alignment, 0, 1);
      w.shield.placed = cmd.placed;
      return { ok: true };
    case 'setMgView':
      w.mgView = { inView: cmd.inView, shielded: cmd.shielded };
      return { ok: true };
    case 'stopwatch': {
      const s = w.stopwatch;
      if (cmd.action === 'START' && !s.running) {
        s.running = true;
        s.startedAt = w.timeS;
        s.starts.push(w.timeS);
      } else if (cmd.action === 'STOP' && s.running) {
        s.accumS += w.timeS - (s.startedAt ?? w.timeS);
        s.running = false;
        s.startedAt = null;
      } else if (cmd.action === 'RESET') {
        s.running = false;
        s.startedAt = null;
        s.accumS = 0;
      }
      return { ok: true };
    }
    case 'impact':
      return impact(w, ctx, cmd.id, cmd.speedCmS);
    case 'requestSpare':
      return requestSpare(w, ctx, cmd.kind);
    case 'firstAid':
    case 'eyewash': {
      const inc = w.safety.incident;
      const need = cmd.type === 'firstAid' ? 'FIRST_AID' : 'EYEWASH';
      if (inc?.needs.includes(need) && !inc.done.includes(need)) inc.done.push(need);
      emit4(w, cmd.type === 'firstAid' ? 'FIRST_AID' : 'EYEWASH_USED', 'INFO');
      return { ok: true };
    }
    case 'acknowledge':
      return acknowledge(w, ctx);
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      dispatchFlame(w.gas, { type: 'teacherStop', on: cmd.on }, ctx.gasCtx);
      forwardGasEvents(w);
      for (const k of Object.keys(w.pours)) delete w.pours[k];
      for (const k of Object.keys(w.squeezes)) delete w.squeezes[k];
      return { ok: true };
  }
}

function gasCommand(w: P4World, ctx: ReactionContext, cmd: FlameCommand): P4DispatchResult {
  if (cmd.type === 'spark' && cmd.on) {
    // §18.3: no se enciende el mechero con fenolftaleína/etanol cerca.
    const near = ethanolNearBurner(w, ctx);
    if (near) {
      setGasBlock(w, 'ETHANOL_NEAR_FLAME');
      emit4(w, 'ETHANOL_NEAR_FLAME', 'CRITICAL', { obj: near });
      bump(w, 'err:ethanolFlame');
    }
  }
  if (cmd.type === 'acknowledge') return acknowledge(w, ctx);
  const r = dispatchFlame(w.gas, cmd, ctx.gasCtx);
  forwardGasEvents(w);
  return r;
}

function setGasBlock(w: P4World, code: string, reasons?: string[]) {
  if (w.gas.safety.block?.code === code) return;
  w.gas.safety.block = { code, since: w.gas.timeS };
  w.safety.block = { code, since: w.timeS, reasons };
}

function acknowledge(w: P4World, ctx: ReactionContext): P4DispatchResult {
  const inc = w.safety.incident;
  if (inc) {
    const pending = inc.needs.filter((k) => !inc.done.includes(k));
    if (pending.length) return { ok: false, code: `PENDING_${pending[0]}` };
    w.safety.incident = null;
    emit4(w, 'INCIDENT_RESOLVED', 'INFO');
    return { ok: true };
  }
  const blk = w.safety.block;
  if (blk) {
    if (blk.code === 'ETHANOL_NEAR_FLAME' && ethanolNearBurner(w, ctx)) return { ok: false, code: 'MOVE_ETHANOL' };
    if (blk.code === 'MG_SETUP' && mgSetupMissing(w, ctx).length) return { ok: false, code: 'MG_SETUP' };
    if (blk.code === 'MG_HAND' && Object.values(w.objects).some((o) => o.kind === 'mgRibbon' && o.support === 'hand')) return { ok: false, code: 'MG_HAND' };
    if (blk.code === 'HOT_WATER_MG' && capsuleTooHot(w)) return { ok: false, code: 'WAIT_COOL' };
    if (blk.code === 'DRAIN_METALS') {
      // Solo se libera; el vertido se detuvo antes.
    }
    w.safety.block = null;
    if (w.gas.safety.block && ['ETHANOL_NEAR_FLAME', 'MG_SETUP', 'MG_HAND'].includes(w.gas.safety.block.code)) w.gas.safety.block = null;
    emit4(w, 'STATION_RESET', 'INFO', { code: blk.code });
    return { ok: true };
  }
  const r = dispatchFlame(w.gas, { type: 'acknowledge' }, ctx.gasCtx);
  forwardGasEvents(w);
  return r;
}

function pickUp(w: P4World, _ctx: ReactionContext, id: string, tool: 'HAND' | 'TONGS'): P4DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (w.safety.incident) return { ok: false, code: 'INCIDENT' };
  if (tool === 'HAND') {
    let t = o.temperatureC;
    const v = w.vessels[id];
    if (v) t = Math.max(v.temperatureC, v.kind === 'CAPSULE' ? Math.min(v.residueTempC, t + 400) : t);
    const r = w.ribbons[id];
    if (r) t = r.temperatureC;
    if (t > 60) {
      // Quemadura simulada (§13.6, §18.3): sin dramatizar; primeros auxilios virtuales.
      w.safety.burns++;
      emit4(w, 'BURN_HOT_OBJECT', 'CRITICAL', { obj: o.kind, t: Math.round(t) }, id);
      bump(w, 'err:burn');
      w.safety.incident = { code: 'BURN', since: w.timeS, needs: ['FIRST_AID'], done: [] };
      return { ok: false, code: 'BURN' };
    }
    if (t > 40) emit4(w, 'HOT_TO_TOUCH', 'WARN', { t: Math.round(t) }, id);
    if (v && v.kind !== 'WASTE' && v.kind !== 'SINK' && hasCorrosive(v) && !w.safety.gloves && (v.kind === 'TUBE' || v.kind === 'BEAKER100') && liquidMl(v) > 0) {
      // Sin dramatizar: solo un recordatorio de guantes cuando el protocolo lo indique.
      emitLatched(w, 'glovesHint', 'GLOVES_RECOMMENDED', 'INFO');
    }
  }
  if (o.kind === 'mgRibbon' && tool === 'HAND') flag(w, 'mgTouchedByHand');
  return { ok: true };
}

function hasCorrosive(v: P4Vessel): boolean {
  const m = vesselMol(v);
  return (m['H+'] ?? 0) > 1e-6 || (m['OH-'] ?? 0) > 1e-6 || (m['Fe^3+'] ?? 0) > 1e-7;
}

function setPose(w: P4World, ctx: ReactionContext, id: string, pose: Pose, support?: string): P4DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prevSupport = o.support;
  o.pose = { ...pose };
  if (support !== undefined) o.support = support;
  const v = w.vessels[id];
  // Recipientes con líquido volcados: el contenido se derrama (§5.1).
  if (v && pose.quat && v.kind !== 'BOTTLE' && v.kind !== 'DROPPER_BOTTLE' && v.kind !== 'WASTE') {
    const up = Math.abs(pose.quat[0]) < 0.35 && Math.abs(pose.quat[2]) < 0.35;
    if (!up && liquidMl(v) > 0.02) {
      const spilled = takeLiquid(w, ctx, v, liquidMl(v), 180, false);
      addSpill(w, id, spilled);
      emit4(w, 'VESSEL_TIPPED', 'ALERT', { ml: Math.round(spilled.volL * 10000) / 10 }, id);
      bump(w, 'err:spill');
    }
  }
  // Varilla y sonda dentro de un recipiente.
  if (o.kind === 'rod') {
    const inV = o.support.startsWith('in:') ? o.support.slice(3) : null;
    if (inV !== w.rod.vesselId) {
      w.rod.vesselId = inV;
      if (inV) emit4(w, 'ROD_IN', 'INFO', undefined, inV);
    }
  }
  if (o.kind === 'probe') {
    const inV = o.support.startsWith('in:') ? o.support.slice(3) : null;
    if (inV !== w.probe.vesselId) {
      w.probe.vesselId = inV;
      if (inV) flag(w, `probeIn:${inV}`);
    }
  }
  // Clavo o tira de Al: entra o sale de un tubo (§12.1-5).
  const metal = w.metals[id];
  if (metal) {
    const inV = o.support.startsWith('in:') ? o.support.slice(3) : null;
    if (inV !== metal.immersedIn) {
      if (inV) {
        metal.immersedIn = inV;
        metal.immersedSince = w.timeS;
        metal.removedAt = null;
        metal.rinsed = false;
        emit4(w, 'METAL_IMMERSED', 'INFO', { metal: metal.metal }, inV);
        const target = w.vessels[inV];
        if (target && !metalTargetOk(target)) emit4(w, 'METAL_WRONG_SOLUTION', 'WARN', undefined, inV);
      } else if (metal.immersedIn) {
        metal.totalImmersedS += w.timeS - (metal.immersedSince ?? w.timeS);
        const was = metal.immersedIn;
        metal.immersedIn = null;
        metal.immersedSince = null;
        metal.removedAt = w.timeS;
        metal.wet = true;
        const early = metal.totalImmersedS < w.params.redoxObserveS * 0.9;
        emit4(w, early ? 'METAL_REMOVED_EARLY' : 'METAL_REMOVED', early ? 'WARN' : 'INFO', { min: Math.round(metal.totalImmersedS / 6) / 10 }, was);
      }
    }
    if (o.support.startsWith('disposed:')) emit4(w, 'METAL_DISPOSED', 'INFO', { to: o.support.slice(9) }, id);
  }
  // Objetos de vidrio sobre la mesada: el gotero fuera de su frasco deja el frasco abierto.
  if (o.kind === 'dropper' && prevSupport.startsWith('cap:') && !o.support.startsWith('cap:')) w.evidence[`open:${prevSupport.slice(4)}`] = 1;
  if (o.kind === 'dropper' && o.support.startsWith('cap:')) {
    const bottle = o.support.slice(4);
    w.evidence[`open:${bottle}`] = 0;
    const own = w.vessels[id]?.reagent;
    const b = w.vessels[bottle];
    if (b && own && b.reagent !== own) {
      emit4(w, 'DROPPER_WRONG_BOTTLE', 'WARN', undefined, bottle);
      bump(w, 'err:crossDropper');
    }
  }
  // Pinza para tubo con un tubo: el tubo sigue a la pinza (lo mueve el controlador).
  if (o.kind === 'capsule' && (support === 'bench') && Math.max(o.temperatureC, w.vessels.capsule?.residueTempC ?? 0) > 60) {
    emit4(w, 'HOT_ON_BENCH', 'WARN', { t: Math.round(o.temperatureC) }, id);
    bump(w, 'err:hotOnBench');
  }
  // Disposición de vidrio roto.
  if (v?.broken && o.support.startsWith('disposed:')) {
    const to = o.support.slice(9);
    w.disposals.push({ t: w.timeS, sourceId: id, containerId: to, volumeMl: 0, expected: 'waste_glass', correct: to === 'waste_glass', mol: {} });
    if (to !== 'waste_glass') {
      emit4(w, 'WASTE_MISCLASSIFIED', 'WARN', { container: to, expected: 'waste_glass' }, id);
      bump(w, 'err:waste');
    } else emit4(w, 'WASTE_OK', 'INFO', { container: to }, id);
  }
  return { ok: true };
}

function metalTargetOk(v: P4Vessel): boolean {
  const m = vesselMol(v);
  return (m['Cu^2+'] ?? 0) > 1e-6;
}

function setPour(w: P4World, ctx: ReactionContext, sourceId: string, targetId: string | null, rate: number, tiltDeg: number): P4DispatchResult {
  const v = w.vessels[sourceId];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  if (targetId) {
    const refusal = disposalRefusal(w, ctx, sourceId, targetId);
    if (refusal) {
      delete w.pours[sourceId];
      setBlock(w, refusal);
      emit4(w, refusal, 'CRITICAL', undefined, sourceId);
      bump(w, 'err:drain');
      return { ok: false, code: refusal };
    }
    const hot = waterOnHot(w, ctx, targetId, sourceId);
    if (hot) {
      delete w.pours[sourceId];
      return hot;
    }
  }
  const prev = w.pours[sourceId];
  const tk = targetId ? w.vessels[targetId]?.kind : null;
  if ((tk === 'WASTE' || tk === 'SINK') && liquidMl(v) > 0.3 && prev?.targetId !== targetId) {
    v.observed = JSON.parse(JSON.stringify({ t: w.timeS, bulk: v.bulk, plume: v.plume, particles: v.particles, temperatureC: v.temperatureC }));
  }
  w.pours[sourceId] = {
    targetId, rateMlS: Math.max(0, rate), tiltDeg, startedS: prev && prev.targetId === targetId ? prev.startedS : w.timeS,
    transferredMl: prev && prev.targetId === targetId ? prev.transferredMl : 0, spilledMl: prev?.spilledMl ?? 0,
  };
  return { ok: true };
}

function setBlock(w: P4World, code: string, reasons?: string[]) {
  if (w.safety.block?.code === code) return;
  w.safety.block = { code, since: w.timeS, reasons };
}

function capsuleTooHot(w: P4World): boolean {
  const c = w.vessels.capsule;
  const o = w.objects.capsule;
  if (!c || !o) return false;
  const burning = Object.values(w.ribbons).some((r) => r.phase === 'BRIGHT_COMBUSTION' || r.phase === 'IGNITION_THRESHOLD');
  return Math.max(c.residueTempC, o.temperatureC) > 150 || (burning && speciesMol(c, 'MgO(s)') > 0);
}

/** §18.3 — no añadir agua al Mg mientras arde o está muy caliente. */
function waterOnHot(w: P4World, ctx: ReactionContext, targetId: string, sourceId?: string): P4DispatchResult | null {
  if (targetId !== 'capsule') return null;
  const c = w.vessels.capsule;
  if (!c) return null;
  const hasResidue = n(c.bulk, 'MgO(s)') + n(c.plume, 'MgO(s)') + n(c.bulk, 'Mg(s)') > 1e-7;
  const src = sourceId ? w.vessels[sourceId] : null;
  const watery = !src || (vesselMol(src)[WATER] ?? 0) > 1e-4;
  if (hasResidue && watery && capsuleTooHot(w)) {
    setBlock(w, 'HOT_WATER_MG');
    emit4(w, 'WATER_ON_HOT_MG', 'CRITICAL', { t: Math.round(Math.max(c.residueTempC, w.objects.capsule?.temperatureC ?? 0)) }, 'capsule');
    bump(w, 'err:waterHotMg');
    void ctx;
    return { ok: false, code: 'HOT_WATER_MG' };
  }
  return null;
}

function aspirate(w: P4World, ctx: ReactionContext, dropperId: string, sourceId: string): P4DispatchResult {
  const d = w.vessels[dropperId];
  const src = w.vessels[sourceId];
  if (!d || !src || d.kind !== 'DROPPER') return { ok: false, code: 'NO_OBJECT' };
  if (liquidMl(src) < 0.05) return { ok: false, code: 'SOURCE_EMPTY' };
  // Al apretar la perilla dentro del frasco, lo que retenía el gotero vuelve al frasco (gotero cruzado, §17).
  const residue = liquidMl(d);
  if (residue > 1e-4) {
    const foreign = d.reagent !== src.reagent || d.contaminated;
    const cell = takeLiquid(w, ctx, d, residue, 0, false);
    receive(w, ctx, src, cell, dropperId, 'SQUEEZE');
    if (foreign && (src.kind === 'BOTTLE' || src.kind === 'DROPPER_BOTTLE')) {
      src.contaminated = true;
      emit4(w, 'BOTTLE_CONTAMINATED', 'ALERT', { dropper: dropperId }, sourceId);
      bump(w, 'err:crossDropper');
    }
  }
  if (d.reagent && src.reagent && d.reagent !== src.reagent && (src.kind === 'BOTTLE' || src.kind === 'DROPPER_BOTTLE')) {
    emitLatched(w, `cross:${dropperId}:${sourceId}`, 'CROSS_DROPPER', 'WARN', { dropper: dropperId }, sourceId);
    bump(w, 'err:crossDropper');
    d.contaminated = true;
  }
  const want = ctx.geo.capacityMl.DROPPER * hashRange(w.seed, `asp:${dropperId}:${(w.evidence[`asp:${dropperId}`] ?? 0)}`, 0.72, 0.84);
  bump(w, `asp:${dropperId}`);
  const cell = takeLiquid(w, ctx, src, want, 0, false);
  d.bulk = cell;
  d.plume = emptyCell();
  d.temperatureC = src.temperatureC;
  d.dirty = true;
  if (src.kind !== 'BOTTLE' && src.kind !== 'DROPPER_BOTTLE' && d.reagent && src.reagent !== d.reagent) d.contaminated = true;
  emit4(w, 'ASPIRATED', 'INFO', { ml: Math.round(cell.volL * 10000) / 10 }, dropperId);
  return { ok: true };
}

function dropFrom(w: P4World, ctx: ReactionContext, dropperId: string, targetId: string | null, all: boolean): P4DispatchResult {
  const d = w.vessels[dropperId];
  if (!d) return { ok: false, code: 'NO_OBJECT' };
  if (liquidMl(d) < 0.003) return { ok: false, code: 'DROPPER_EMPTY' };
  if (targetId) {
    const hot = waterOnHot(w, ctx, targetId, dropperId);
    if (hot) return hot;
  }
  const base = d.reagent === 'pheno' ? w.params.phenolDropMl : w.params.dropMl;
  // §16.1/§20: volumen de gota variable (semilla) — 20 gotas ≈ 1,0 mL, no exactamente.
  const k = hashRange(w.seed, `drop:${dropperId}`, 0.92, 1.08) * (0.97 + 0.06 * rand(w));
  const ml = all ? liquidMl(d) : Math.min(liquidMl(d), base * k);
  const cell = takeLiquid(w, ctx, d, ml, 0, false);
  if (!targetId) {
    addSpill(w, dropperId, cell);
    emit4(w, 'DROP_SPILLED', 'WARN', undefined, dropperId);
    return { ok: true };
  }
  const t = w.vessels[targetId];
  if (!t) return { ok: false, code: 'NO_TARGET' };
  receive(w, ctx, t, cell, dropperId, 'DROP');
  bump(w, `drops:${dropperId}:${targetId}`);
  if (t.kind === 'BOTTLE' || t.kind === 'DROPPER_BOTTLE') {
    if (t.reagent !== d.reagent) {
      t.contaminated = true;
      emit4(w, 'BOTTLE_CONTAMINATED', 'ALERT', { dropper: dropperId }, targetId);
      bump(w, 'err:crossDropper');
    }
  }
  return { ok: true };
}

function clampCmd(w: P4World, ctx: ReactionContext, tongsId: string, targetId: string, grip: number): P4DispatchResult {
  const tg = w.tongs[tongsId];
  const tgo = w.objects[tongsId];
  const target = w.objects[targetId];
  if (!tg || !tgo || !target) return { ok: false, code: 'NO_OBJECT' };
  if (tg.holding) return { ok: false, code: 'TONGS_BUSY' };
  const crucible = tgo.kind === 'crucibleTongs';
  if (target.kind === 'mgRibbon' && !crucible) {
    // §2: no se permite quemar Mg sostenido con la pinza para tubo.
    emit4(w, 'WRONG_TONGS_MG', 'ALERT', undefined, targetId);
    bump(w, 'err:wrongTongs');
    return { ok: false, code: 'WRONG_TONGS' };
  }
  const allowed: P4ObjKind[] = crucible ? ['mgRibbon', 'capsule', 'nail', 'alStrip'] : ['tube', 'nail', 'alStrip'];
  if (!allowed.includes(target.kind)) return { ok: false, code: 'NOT_GRIPPABLE' };
  if (grip < 0.15) return { ok: false, code: 'GRIP_MISSED' };
  const r = w.ribbons[targetId];
  if (r && (r.phase === 'BRIGHT_COMBUSTION')) return { ok: false, code: 'BURNING' };
  tg.holding = targetId;
  tg.grip = clamp(grip, 0, 1);
  target.support = `tongs:${tongsId}`;
  if (w.metals[targetId]) setPose(w, ctx, targetId, target.pose, `tongs:${tongsId}`);
  flag(w, `tongs:${tongsId}:${target.kind}`);
  if (grip < 0.4) emit4(w, 'GRIP_POOR', 'WARN', undefined, targetId);
  return { ok: true };
}

function unclamp(w: P4World, ctx: ReactionContext, tongsId: string): P4DispatchResult {
  const tg = w.tongs[tongsId];
  if (!tg?.holding) return { ok: false, code: 'NOT_HOLDING' };
  const id = tg.holding;
  const o = w.objects[id];
  tg.holding = null;
  tg.grip = 0;
  const r = w.ribbons[id];
  if (r && o) {
    dropRibbon(w, ctx, r, o);
    return { ok: true };
  }
  if (o && o.support.startsWith('tongs:')) o.support = 'falling';
  return { ok: true };
}

/** La cinta (o su ceniza) cae: a la cápsula si está debajo; si no, a la mesada (residuo perdido, §13.6). */
function dropRibbon(w: P4World, ctx: ReactionContext, r: MgRibbon, o: P4Object) {
  const cap = w.vessels.capsule;
  const co = w.objects.capsule;
  const over = !!co && !!cap && Math.hypot(o.pose.x - co.pose.x, o.pose.y - co.pose.y) < ctx.geo.capsuleRimR && o.pose.z > co.pose.z - 0.5;
  const burnedSome = r.burnFrac > 0.02;
  if (!burnedSome) {
    o.support = 'falling';
    return;
  }
  const moved: Record<string, number> = { 'MgO(s)': r.mgoMol, 'Mg(s)': r.mgMol, 'Mg3N2(s)': r.mg3n2Mol };
  if (over && cap) {
    for (const [id, m] of Object.entries(moved)) if (m > 0) addMol(cap.bulk, id, m);
    r.toCapsuleMol += r.mgoMol;
    if (r.phase === 'BRIGHT_COMBUSTION' || r.temperatureC > 200) cap.residueTempC = Math.max(cap.residueTempC, Math.min(900, r.temperatureC));
    for (const id of Object.keys(moved)) if (moved[id] > 0 && !cap.particles[id]) cap.particles[id] = particleFor(w, id, 'capsule', 0, 0);
    cap.dirty = true;
    o.support = 'in:capsule';
    o.pose = { ...co.pose, z: co.pose.z + 0.4 };
    emit4(w, 'RESIDUE_TO_CAPSULE', 'INFO', { mg: Math.round(r.mgoMol * 40.304 * 1e5) / 100 }, 'capsule');
    flag(w, 'residueInCapsule');
  } else {
    const c = emptyCell();
    for (const [id, m] of Object.entries(moved)) if (m > 0) addMol(c, id, m);
    addSpill(w, r.id, c, { x: o.pose.x, y: o.pose.y });
    r.toBenchMol += r.mgoMol;
    o.support = 'disposed:bench';
    emit4(w, 'RESIDUE_LOST', 'WARN', undefined, r.id);
    bump(w, 'err:residueLost');
  }
  r.mgoMol = 0;
  r.mgMol = 0;
  r.mg3n2Mol = 0;
}

function sand(w: P4World, id: string): P4DispatchResult {
  const m = w.metals[id];
  if (!m) return { ok: false, code: 'NO_OBJECT' };
  if (m.immersedIn) return { ok: false, code: 'IMMERSED' };
  m.sandStrokes++;
  for (const s of m.segments) s.oxide = clamp(s.oxide * (0.5 + 0.12 * rand(w)), 0, 1);
  m.roughness = Math.min(1.5, m.roughness + 0.05);
  if (m.metal === 'Al') m.passivation = Math.max(0.05, m.passivation * 0.45);
  w.ledger.dust.oxide = (w.ledger.dust.oxide ?? 0) + 1;
  if (m.sandStrokes === 1) emit4(w, 'METAL_SANDED', 'INFO', { metal: m.metal }, id);
  flag(w, `sanded:${id}`);
  return { ok: true };
}

function inspect(w: P4World, ctx: ReactionContext, target: string): P4DispatchResult {
  if (isGasObject(target)) {
    const r = dispatchFlame(w.gas, { type: 'inspect', target: target === 'co_detector' ? 'co_detector' : target }, ctx.gasCtx);
    forwardGasEvents(w);
    return r;
  }
  const v = w.vessels[target];
  if (v) {
    v.inspected = true;
    flag(w, `inspected:${target}`);
    const ml = liquidMl(v);
    if (v.kind !== 'BOTTLE' && v.kind !== 'DROPPER_BOTTLE' && v.kind !== 'WASTE' && v.kind !== 'WASH_BOTTLE') {
      if (ml > 0.01 && v.additions.length === 0) emit4(w, v.wet && !hasForeign(v) ? 'VESSEL_WET' : 'VESSEL_DIRTY', 'WARN', { ml: Math.round(ml * 100) / 100 }, target);
      else if (ml <= 0.01) emit4(w, 'VESSEL_CLEAN_DRY', 'INFO', undefined, target);
    }
    if (v.contaminated) emit4(w, 'VESSEL_LOOKS_CONTAMINATED', 'WARN', undefined, target);
    return { ok: true };
  }
  const m = w.metals[target];
  if (m) {
    if (!m.immersedIn && m.totalImmersedS === 0) m.inspectedBefore = true;
    else m.inspectedAfter = true;
    emit4(w, 'METAL_INSPECTED', 'INFO', { oxide: Math.round(avgOxide(m) * 100), cu: Math.round(metalCuMg(m) * 10) / 10 }, target);
    return { ok: true };
  }
  if (w.ribbons[target]) {
    flag(w, `inspected:${target}`);
    return { ok: true };
  }
  flag(w, `inspected:${target}`);
  return { ok: true };
}

function hasForeign(v: P4Vessel): boolean {
  const m = vesselMol(v);
  return Object.keys(m).some((id) => id !== WATER && m[id] > 1e-9);
}

export const avgOxide = (m: MetalPiece) => m.segments.reduce((s, x) => s + x.oxide, 0) / m.segments.length;
export const metalCuMg = (m: MetalPiece) => m.segments.reduce((s, x) => s + x.cuMol, 0) * 63546;

function washVessel(w: P4World, ctx: ReactionContext, id: string): P4DispatchResult {
  const v = w.vessels[id];
  if (!v) return { ok: false };
  const hold = (w.params.holdupMl[v.kind] ?? 0.1) * 1.5;
  if (liquidMl(v) > hold + 0.05) return { ok: false, code: 'EMPTY_FIRST' };
  const wash = w.vessels.wash;
  if (!wash || liquidMl(wash) < 6) return { ok: false, code: 'NO_WATER' };
  // Tres enjuagues con la piseta: el residuo va (diluido) al contenedor que le corresponde.
  const residue = vesselMol(v);
  const cat = wasteCategory(residue, ctx, vesselPH(v));
  const dest = cat === 'acidbase_or_drain' ? 'waste_acidbase' : cat === 'any' ? 'sink' : cat;
  const rinse = takeLiquid(w, ctx, wash, 5, 0, false);
  const dirty = emptyCell();
  mergeInto(dirty, v.bulk);
  mergeInto(dirty, v.plume);
  for (const pid of Object.keys(v.particles)) delete v.particles[pid];
  // Queda una película de agua limpia (recipiente húmedo).
  const film = emptyCell();
  if (rinse.volL > 0) transferFraction(rinse, film, 0.04 / (rinse.volL * 1000));
  mergeInto(dirty, rinse);
  const target = w.vessels[dest];
  if (target) {
    const tmp = { ...dirty.mol };
    mergeInto(target.plume, dirty);
    target.dirty = true;
    if (target.kind === 'SINK') {
      for (const [k, m] of Object.entries(tmp)) w.ledger.drained[k] = (w.ledger.drained[k] ?? 0) + m;
      target.plume = emptyCell();
      target.bulk = emptyCell();
    }
  }
  v.bulk = film;
  v.plume = emptyCell();
  v.additions = [];
  v.extents = {};
  v.contaminated = false;
  v.wet = true;
  v.label = v.kind === 'TUBE' ? null : v.label;
  v.phChecked = null;
  v.dirty = true;
  emit4(w, 'VESSEL_WASHED', 'INFO', { to: dest }, id);
  flag(w, `washed:${id}`);
  return { ok: true };
}

function impact(w: P4World, ctx: ReactionContext, id: string, speed: number): P4DispatchResult {
  const o = w.objects[id];
  const v = w.vessels[id];
  const glass = !!o && ['tube', 'beaker', 'cylinder', 'bottle', 'dropperBottle', 'dropper', 'rod'].includes(o.kind);
  if (!o || !glass || speed < 260) return { ok: true };
  if (o.kind === 'rod') {
    w.rod.broken = true;
    w.rod.vesselId = null;
  }
  if (v) {
    if (v.broken) return { ok: true };
    v.broken = true;
    if (liquidMl(v) > 0) addSpill(w, id, takeLiquid(w, ctx, v, liquidMl(v), 180, false));
  }
  emit4(w, 'GLASS_BROKEN', 'ALERT', { obj: o.kind }, id);
  bump(w, 'err:broken');
  return { ok: true };
}

function requestSpare(w: P4World, ctx: ReactionContext, kind: 'tube' | 'rod' | 'cyl10'): P4DispatchResult {
  if (kind === 'rod') {
    if (!w.rod.broken || w.rod.spares <= 0) return { ok: false, code: 'NOT_NEEDED' };
    w.rod.spares--;
    w.rod.broken = false;
    const r = w.objects.rod;
    if (r) r.support = 'bench';
    emit4(w, 'SPARE', 'INFO', { kind });
    return { ok: true, id: 'rod' };
  }
  let i = 1;
  const base = kind === 'tube' ? 'tube' : 'cyl10_';
  while (w.objects[`${base}${kind === 'tube' ? 6 + i : i}`]) i++;
  const id = `${base}${kind === 'tube' ? 6 + i : i}`;
  if (i > 4) return { ok: false, code: 'NO_MORE' };
  const vk: VesselKind = kind === 'tube' ? 'TUBE' : 'CYL10';
  w.vessels[id] = newVessel(id, vk, ctx, w.params.ambientC);
  const anchor = kind === 'tube' ? w.objects.rack?.pose ?? { x: 204, y: 46, z: 0, rotationRad: 0 } : w.objects.cyl10?.pose ?? { x: 72, y: 22, z: 0, rotationRad: 0 };
  w.objects[id] = { id, kind: kind === 'tube' ? 'tube' : 'cylinder', pose: { x: anchor.x + 18 + i * 3, y: Math.max(8, anchor.y - 30), z: kind === 'tube' ? 0.8 : 0, rotationRad: 0 }, support: 'bench', movable: true, temperatureC: w.params.ambientC };
  emit4(w, 'SPARE', 'INFO', { kind, id });
  return { ok: true, id };
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepReaction(w: P4World, ctx: ReactionContext): void {
  const dt = w.params.dtS;
  w.tick++;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.gas.ppe = w.ppe;
  updateEthanolSafety(w, ctx);
  stepFlame(w.gas, ctx.gasCtx);
  forwardGasEvents(w);
  updatePours(w, ctx, dt);
  for (const v of Object.values(w.vessels)) updateVessel(w, ctx, v, dt);
  for (const m of Object.values(w.metals)) updateMetal(w, ctx, m, dt);
  for (const r of Object.values(w.ribbons)) updateRibbon(w, ctx, r, dt);
  updateCapsuleHeat(w, ctx, dt);
  updateProbe(w, ctx, dt);
  updateSpills(w, dt);
  updateEvidence(w, ctx, dt);
}

export function runReactionFor(w: P4World, seconds: number, ctx: ReactionContext): void {
  const steps = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < steps; i++) stepReaction(w, ctx);
}

/** Objeto con etanol a menos de la distancia segura de la boca del mechero (o null). */
export function ethanolNearBurner(w: P4World, ctx: ReactionContext): string | null {
  const m = mouthPos(w.gas, ctx.gasCtx);
  const lim = w.params.ethanolSafeCm;
  for (const v of Object.values(w.vessels)) {
    const o = w.objects[v.id];
    if (!o || o.support.startsWith('disposed:')) continue;
    const etoh = n(v.bulk, 'EtOH') + n(v.plume, 'EtOH');
    // Frasco o gotero de fenolftaleína, o residuos con más que trazas de etanol.
    const risky = v.reagent === 'pheno' ? etoh > 1e-5 || v.kind === 'DROPPER_BOTTLE' : etoh > 2e-3;
    if (!risky) continue;
    if (Math.hypot(o.pose.x - m.x, o.pose.y - m.y) < lim) return v.id;
  }
  return null;
}

function updateEthanolSafety(w: P4World, ctx: ReactionContext) {
  const lit = isLit(w.gas);
  const near = ethanolNearBurner(w, ctx);
  if (lit && near) {
    // §18.3: bloqueo crítico por inflamabilidad mientras la llama siga encendida con el etanol cerca.
    if (!w.evidence['latch:ethanolLit']) {
      setGasBlock(w, 'ETHANOL_NEAR_FLAME');
      bump(w, 'err:ethanolFlame');
    }
    emitLatched(w, 'ethanolLit', 'ETHANOL_NEAR_FLAME', 'CRITICAL', { obj: near });
  } else if (!near) rearm(w, 'ethanolLit');
}

function updatePours(w: P4World, ctx: ReactionContext, dt: number) {
  for (const [sid, p] of Object.entries(w.pours)) {
    const src = w.vessels[sid];
    if (!src) {
      delete w.pours[sid];
      continue;
    }
    const ml = p.rateMlS * dt;
    if (ml <= 0) continue;
    const cell = takeLiquid(w, ctx, src, ml, p.tiltDeg, true);
    const got = cell.volL * 1000;
    if (got <= 1e-6) continue;
    const t = p.targetId ? w.vessels[p.targetId] : null;
    if (t && !t.broken) {
      receive(w, ctx, t, cell, sid, 'POUR');
      p.transferredMl += got;
      flag(w, `poured:${sid}:${p.targetId}`);
    } else {
      addSpill(w, sid, cell);
      p.spilledMl += got;
      if (p.spilledMl > 0.2) {
        emitLatched(w, `spill:${sid}`, 'POUR_SPILLED', 'WARN', undefined, sid);
        bump(w, 'err:spill', got);
      }
    }
  }
  for (const [wid, s] of Object.entries(w.squeezes)) {
    const wb = w.vessels[wid];
    if (!wb) continue;
    const cell = takeLiquid(w, ctx, wb, s.rateMlS * dt, 0, false);
    if (cell.volL <= 0) continue;
    const t = s.targetId ? w.vessels[s.targetId] : null;
    if (t) {
      receive(w, ctx, t, cell, wid, 'SQUEEZE');
      flag(w, `water:${s.targetId}`);
    } else addSpill(w, wid, cell);
  }
}

/** Mezcla, química, energía, partículas y gas de un recipiente (§7.3). */
function updateVessel(w: P4World, ctx: ReactionContext, v: P4Vessel, dt: number) {
  const p = w.params;
  // Agitación: decae si no se renueva (la escena la mide a ~5 Hz).
  v.agitation = Math.max(0, v.agitation - dt * 1.6);
  if (v.agitation < 0.02) v.agitationTool = 'NONE';
  if (v.kind === 'SINK') return;
  const liquid = liquidMl(v);
  const hasContent = liquid > 1e-6 || Object.keys(v.bulk.mol).length + Object.keys(v.plume.mol).length > 0;
  if (!hasContent) {
    v.rx = v.disposedTo ? 'DISPOSED' : 'EMPTY';
    relaxTemp(w, ctx, v, dt);
    return;
  }
  // ── Mezcla penacho → seno (§7.4): difusión lenta + agitación ──
  const mixing = clamp(v.agitation * (v.agitationTool === 'ROD' && w.rod.vesselId !== v.id ? 0.3 : 1), 0, 1);
  if (v.plume.volL > 0 || Object.keys(v.plume.mol).length) {
    const k = p.mixBase * (v.kind === 'TUBE' || v.kind === 'CYL10' || v.kind === 'CYL25' ? 1.6 : 1) + p.mixStir * mixing;
    const f = 1 - Math.exp(-k * dt);
    if (v.plume.volL < 2e-7 || f > 0.995) mergeInto(v.bulk, v.plume);
    else transferFraction(v.plume, v.bulk, f);
    v.dirty = true;
  }
  // ── Química ──
  let local = 0;
  let bulkRate = 0;
  if (v.dirty || (w.tick + hashIndex(v.id)) % 200 === 0) {
    const out: ReactionOutcome = { heatJ: 0, extents: {} };
    for (const c of [v.plume, v.bulk]) {
      if (c.volL <= 1e-9 && !Object.keys(c.mol).length) continue;
      const o1: ReactionOutcome = { heatJ: 0, extents: {} };
      equilibrate(c, ctx.chem, v.temperatureC, o1);
      precipitationStep(c, ctx.chem, v.temperatureC, dt, mixing, o1);
      equilibrate(c, ctx.chem, v.temperatureC, o1);
      out.heatJ += o1.heatJ;
      const moved = sumExtents(o1);
      if (c === v.plume) local += moved / dt;
      else bulkRate += moved / dt;
      for (const [k, x] of Object.entries(o1.extents)) {
        out.extents[k] = (out.extents[k] ?? 0) + x;
        v.extents[k] = (v.extents[k] ?? 0) + x;
        if (ctx.chem.reactions[k]?.kind === 'PRECIPITATION' && x > 0) onPrecipitate(w, v, k, x, c === v.plume);
      }
    }
    v.heatJ += out.heatJ;
    addHeat(v, ctx, out.heatJ);
    // Se sigue resolviendo mientras haya cambios; un recipiente quieto deja de gastar cálculo.
    v.dirty = sumExtents(out) > 1e-11 || v.plume.volL > 0;
    if (out.extents.neutralization && out.extents.neutralization > 1e-7) flag(w, `neutralized:${v.id}`);
  }
  v.localRate = local;
  v.bulkRate = bulkRate;
  // ── CO₂: burbujas si se supera la solubilidad (§9.5) ──
  const co2 = n(v.bulk, 'CO2(aq)') + n(v.plume, 'CO2(aq)');
  if (co2 > 0 && liquid > 0) {
    const sat = 0.034 * (liquid / 1000);
    if (co2 > sat) {
      const out = (co2 - sat) * Math.min(1, 1.5 * dt);
      const f = out / co2;
      for (const c of [v.bulk, v.plume]) {
        const m = n(c, 'CO2(aq)') * f;
        if (m > 0) {
          applyExtent(c, ctx.chem.reactions.co2Release, m, ctx.chem);
          addMol(c, 'CO2(g)', -m);
        }
      }
      v.released['CO2(g)'] = (v.released['CO2(g)'] ?? 0) + out;
      v.lastBubbleS = w.timeS;
      emitLatched(w, `fizz:${v.id}`, 'GAS_BUBBLES', 'INFO', undefined, v.id);
      v.dirty = true;
    }
  }
  updateParticles(w, ctx, v, dt, mixing);
  relaxTemp(w, ctx, v, dt);
  // Salpicadura por agitación brusca de un tubo (§16.3).
  if (v.kind === 'TUBE' && v.agitationTool === 'SHAKE' && v.agitation > 0.9 && liquid > 1) {
    w.evidence[`hardShake:${v.id}`] = (w.evidence[`hardShake:${v.id}`] ?? 0) + dt;
    if ((w.evidence[`hardShake:${v.id}`] ?? 0) > 1.2) {
      addSpill(w, v.id, takeLiquid(w, ctx, v, 0.05 * liquid, 0, false));
      emit4(w, 'SPLASH', 'WARN', undefined, v.id);
      bump(w, 'err:splash');
      w.evidence[`hardShake:${v.id}`] = 0;
    }
  } else w.evidence[`hardShake:${v.id}`] = 0;
  v.rx = rxState(w, ctx, v);
  const T = v.temperatureC;
  if (liquid > 0.2 && v.kind !== 'BOTTLE' && v.kind !== 'DROPPER_BOTTLE' && v.kind !== 'WASTE' && v.kind !== 'WASH_BOTTLE') {
    if (v.tempLog.first === null) v.tempLog = { first: T, min: T, max: T };
    v.tempLog.min = Math.min(v.tempLog.min, T);
    v.tempLog.max = Math.max(v.tempLog.max, T);
  }
  // Frascos contaminados (gotero cruzado): reacción dentro del frasco (§17).
  if ((v.kind === 'BOTTLE' || v.kind === 'DROPPER_BOTTLE') && v.reagent && !v.contaminated) {
    const own = new Set(Object.keys(ctx.reagents[v.reagent]?.molar ?? {}));
    const m = vesselMol(v);
    if (Object.keys(m).some((id) => !own.has(id) && id !== WATER && id !== 'EtOH' && !['HCO3-', 'CO2(aq)', 'OH-', 'H+', 'FeOH^2+'].includes(id) && m[id] > 1e-8)) v.contaminated = true;
  }
}

function hashIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h;
}

function sumExtents(o: ReactionOutcome): number {
  let s = 0;
  for (const x of Object.values(o.extents)) s += Math.abs(x);
  return s;
}

function onPrecipitate(w: P4World, v: P4Vessel, rxId: string, x: number, inPlume: boolean) {
  const sid = PRECIP_SOLID[rxId];
  if (!sid) return;
  let p = v.particles[sid];
  if (!p) {
    p = particleFor(w, sid, v.id, 1, inPlume ? 1 : 0.2);
    v.particles[sid] = p;
    emit4(w, 'PRECIPITATE_FORMED', 'INFO', { solid: sid }, v.id);
    flag(w, `ppt:${v.id}:${sid}`);
  } else {
    // El sólido nuevo nace en suspensión (y localizado si se formó en el penacho).
    const tot = Math.max(1e-15, (v.extents[rxId] ?? x));
    const k = clamp(x / tot, 0, 1);
    p.suspended = p.suspended + (1 - p.suspended) * k;
    if (inPlume) p.localized = Math.max(p.localized, k);
  }
}

const PRECIP_SOLID: Record<string, string> = {
  caco3: 'CaCO3(s)', feoh3: 'Fe(OH)3(s)', feoh3b: 'Fe(OH)3(s)', cuoh2: 'Cu(OH)2(s)', caoh2: 'Ca(OH)2(s)', cuco3: 'CuCO3(s)', feoh2: 'Fe(OH)2(s)',
  mgoh2: 'Mg(OH)2(s)', mgco3: 'MgCO3(s)', aloh3: 'Al(OH)3(s)',
};

/** Partículas: floculación, sedimentación (más lenta en flóculos hidratados) y resuspensión al agitar (§11.2). */
function updateParticles(w: P4World, ctx: ReactionContext, v: P4Vessel, dt: number, mixing: number) {
  if (!Object.keys(v.particles).length) return;
  const heightCm = Math.max(0.5, ctx.geo.level(v.kind, liquidMl(v)) - ctx.geo.level(v.kind, 0));
  for (const [sid, p] of Object.entries(v.particles)) {
    const mol = n(v.bulk, sid) + n(v.plume, sid);
    if (mol <= TINY) {
      delete v.particles[sid];
      continue;
    }
    const sp = ctx.chem.species[sid];
    const gel = !!sp?.gelatinous;
    // Floculación: crece en reposo, los flóculos hidratados más rápido; la agitación fuerte los rompe.
    p.floc = clamp(p.floc + dt * ((gel ? 0.035 : 0.02) * (1 - mixing) - 0.05 * mixing * mixing), 0, 1);
    p.meanRadiusUm = Math.max(0.3, p.meanRadiusUm * (1 + dt * 0.01 * (1 - mixing)));
    const vSettle = (sp?.settleMmS ?? 0.05) * (1 + 2 * p.floc) * (0.7 + 0.3 * p.meanRadiusUm);
    const k = (vSettle / 10) / heightCm;
    if (mixing > 0.15) p.suspended = clamp(p.suspended + (1 - p.suspended) * (mixing * 2.2) * dt, 0, 1);
    else p.suspended = clamp(p.suspended - p.suspended * k * dt, 0, 1);
    p.localized = Math.max(0, p.localized - p.localized * (w.params.mixBase * 2 + mixing * 3) * dt);
  }
}

function addHeat(v: P4Vessel, ctx: ReactionContext, J: number) {
  if (!J) return;
  v.temperatureC += J / Math.max(1e-3, heatCapacity(v, ctx));
}

function relaxTemp(w: P4World, ctx: ReactionContext, v: P4Vessel, dt: number) {
  const C = Math.max(0.5, heatCapacity(v, ctx));
  const h = ctx.geo.thermal[v.kind].hAir;
  v.temperatureC += ((w.params.ambientC - v.temperatureC) * h * dt) / C;
  if (v.kind === 'CAPSULE') {
    v.residueTempC += ((v.temperatureC - v.residueTempC) * dt) / 30;
    if (liquidMl(v) > 0.5) v.residueTempC += ((v.temperatureC - v.residueTempC) * dt) / 2;
  }
  const o = w.objects[v.id];
  if (o && v.kind !== 'CAPSULE') o.temperatureC = v.temperatureC;
}

/** §23.2 — estado de la reacción en el recipiente (derivado de la evidencia física). */
function rxState(w: P4World, ctx: ReactionContext, v: P4Vessel): VesselRxState {
  if (v.broken) return 'SPILLED';
  if (v.kind === 'TUBE' && v.label && mislabeled(v)) return 'MISLABELED';
  if (v.contaminated) return 'CONTAMINATED';
  if (v.temperatureC > 70) return 'OVERHEATED';
  const sources = new Set(v.additions.map((a) => a.reagent ?? a.fromId));
  if (v.wet && v.additions.length) sources.add('water');
  if (sources.size <= 1 && !w.metals.nail?.immersedIn && !Object.keys(v.particles).length) return 'UNMIXED';
  if (v.plume.volL > 2e-5) return v.localRate > 1e-8 ? 'LOCAL_REACTION' : 'CONTACTING';
  if (v.agitation > 0.15) return 'MIXING';
  if (v.bulkRate > 1e-7) return 'REACTION_PROGRESS';
  if (v.dirty) return 'EQUILIBRATING';
  if (Object.values(v.particles).some((p) => p.suspended > 0.06)) return 'SETTLING';
  void ctx;
  return 'OBSERVABLE_FINAL';
}

const LABEL_REAGENTS: Record<string, string[]> = {
  B1: ['na2co3', 'cacl2'], B2: ['fecl3', 'naoh15', 'naohX'], C1: ['cuso4'], B2x: ['fecl3', 'naoh15', 'naohX'],
};

export function mislabeled(v: P4Vessel): boolean {
  const exp = v.label ? LABEL_REAGENTS[v.label] : undefined;
  if (!exp) return false;
  const used = new Set(v.additions.map((a) => a.reagent).filter((r): r is string => !!r && r !== 'water'));
  if (!used.size) return false;
  return [...used].some((r) => !exp.includes(r));
}

// ─────────────────────────── Metales (§12, §16.4) ───────────────────────────

function updateMetal(w: P4World, ctx: ReactionContext, m: MetalPiece, dt: number) {
  const o = w.objects[m.id];
  if (!o) return;
  // Un metal que está en la pinza pero cuyo extremo sigue dentro del tubo no se considera retirado.
  if (!m.immersedIn) {
    if (m.wet && m.removedAt !== null && w.timeS - m.removedAt > 90) m.wet = false;
    m.state = m.totalImmersedS === 0 ? 'CLEAN_OR_OXIDIZED' : m.wet ? 'REMOVED_WET' : 'RINSED_OR_STORED';
    return;
  }
  const v = w.vessels[m.immersedIn];
  if (!v) return;
  const g = m.metal === 'Fe' ? ctx.geo.nail : ctx.geo.alStrip;
  const N = m.segments.length;
  const segLen = g.length / N;
  // Altura del líquido sobre la punta (el clavo apoya en el fondo del tubo).
  const level = ctx.geo.level(v.kind, liquidMl(v) + solidsVolumeMl(v, ctx) + displacedMl(w, v.id)) - ctx.geo.level(v.kind, 0) + 0.15;
  const cu2 = n(v.bulk, 'Cu^2+');
  const volL = v.bulk.volL;
  const conc = volL > 1e-9 ? cu2 / volL : 0;
  const T = v.temperatureC;
  const tf = Math.exp(0.045 * (T - 25));
  const mix = 1 + 0.6 * clamp(v.agitation / 0.5, 0, 1);
  const kBase = m.metal === 'Fe' ? w.params.kRedoxFe : w.params.kRedoxAl;
  const kSeed = hashRange(w.seed, `redox:${m.id}`, 0.85, 1.15);
  const perim = m.metal === 'Fe' ? Math.PI * m.diameterCm : 2 * (m.widthCm + m.thicknessCm);
  const rates: number[] = new Array(N).fill(0);
  let totalRate = 0;
  let maxCoat = 0;
  for (let i = 0; i < N; i++) {
    const s = m.segments[i];
    const z = (i + 0.5) * segLen;
    if (z > level) continue;
    // El óxido superficial se disuelve lentamente en el medio levemente ácido del CuSO₄.
    s.oxide = Math.max(0, s.oxide - (s.oxide / w.params.oxideDissolveTauS) * dt);
    const area = perim * segLen * m.roughness + (i === 0 ? Math.PI * (m.diameterCm / 2) ** 2 : 0);
    const coatMgCm2 = (s.cuMol * 63546) / Math.max(1e-3, area);
    const coat = 1 / (1 + coatMgCm2 / w.params.cuCoatRefMgCm2);
    maxCoat = Math.max(maxCoat, coatMgCm2);
    const access = m.metal === 'Fe' ? 1 - 0.9 * s.oxide : 1 - m.passivation;
    rates[i] = kBase * kSeed * area * conc * access * coat * tf * mix;
    totalRate += rates[i];
  }
  if (m.metal === 'Al') m.passivation = Math.max(0.05, m.passivation - (m.passivation / 4000) * dt);
  // Avance con la ecuación balanceada: Fe + Cu²⁺ → Fe²⁺ + Cu (o 2 Al + 3 Cu²⁺ → 2 Al³⁺ + 3 Cu).
  const dCu = Math.min(totalRate * dt, cu2, m.metal === 'Fe' ? m.metalMol : (m.metalMol * 3) / 2);
  if (dCu > 1e-16 && totalRate > 0) {
    const r = m.metal === 'Fe' ? ctx.chem.reactions.feCu : ctx.chem.reactions.alCu;
    const xi = m.metal === 'Fe' ? dCu : dCu / 3;
    // El metal y el cobre depositado pertenecen a la pieza: se aplica el avance a una celda auxiliar con el seno.
    const metalId = m.metal === 'Fe' ? 'Fe(s)' : 'Al(s)';
    const aux: Cell = { volL: v.bulk.volL, mol: { ...v.bulk.mol } };
    const cuBefore = n(aux, 'Cu(s)');
    addMol(aux, metalId, m.metalMol);
    const heat = applyExtent(aux, r, xi, ctx.chem);
    m.metalMol = n(aux, metalId);
    delete aux.mol[metalId];
    const deposited = n(aux, 'Cu(s)') - cuBefore;
    addMol(aux, 'Cu(s)', -deposited);
    // El cobre nace donde reacciona cada segmento (puntos que crecen hasta recubrir).
    for (let i = 0; i < N; i++) if (rates[i] > 0) m.segments[i].cuMol += (deposited * rates[i]) / totalRate;
    v.bulk.mol = aux.mol;
    v.extents[r.id] = (v.extents[r.id] ?? 0) + xi;
    addHeat(v, ctx, heat);
    v.heatJ += heat;
    v.dirty = true;
  }
  // Agitación brusca: parte del cobre se desprende y cae al fondo (no desaparece, §28.4-6).
  if (v.agitation > 0.6) {
    let loose = 0;
    for (const s of m.segments) {
      const d = s.cuMol * 0.08 * (v.agitation - 0.5) * dt;
      s.cuMol -= d;
      loose += d;
    }
    if (loose > 0) {
      addMol(v.bulk, 'Cu(s)', loose);
      m.detachedCuMol += loose;
      if (!v.particles['Cu(s)']) v.particles['Cu(s)'] = particleFor(w, 'Cu(s)', v.id, 0.5, 0);
      emitLatched(w, `cuLoose:${m.id}`, 'COPPER_DETACHED', 'INFO', undefined, v.id);
    }
  }
  // §23.3
  const cuMg = metalCuMg(m);
  const elapsed = w.timeS - (m.immersedSince ?? w.timeS);
  const coatLimited = maxCoat > w.params.cuCoatRefMgCm2;
  m.state = elapsed < 5 ? 'IMMERSED' : cuMg < 0.5 ? 'NUCLEATION' : coatLimited ? 'COATING_LIMITED' : cuMg > 8 ? 'PARTIALLY_COATED' : 'COPPER_GROWTH';
  if (cuMg > 0.5) emitLatched(w, `cuVisible:${m.id}`, 'COPPER_VISIBLE', 'INFO', undefined, v.id);
}

// ─────────────────────────── Magnesio (§13) ───────────────────────────

/** Requisitos de seguridad que faltan para quemar Mg (§18.3). */
export function mgSetupMissing(w: P4World, ctx: ReactionContext): string[] {
  const out: string[] = [];
  if (!w.safety.mgWarningAccepted) out.push('warning');
  if (!w.shield.placed) out.push('shield');
  const cap = w.objects.capsule;
  const m = mouthPos(w.gas, ctx.gasCtx);
  if (!cap || Math.hypot(cap.pose.x - m.x, cap.pose.y - m.y) > 22 || cap.support.startsWith('tongs:')) out.push('capsule');
  if (!w.ppe) out.push('ppe');
  return out;
}

function updateRibbon(w: P4World, ctx: ReactionContext, r: MgRibbon, dt: number) {
  const o = w.objects[r.id];
  if (!o) return;
  const amb = w.params.ambientC;
  const lit = hasOpenFlame(w.gas);
  const inTongs = o.support.startsWith('tongs:');
  const tl = lit ? localTemperature(w.gas, ctx.gasCtx, o.pose) : amb;
  const contact = lit ? localContact(w.gas, ctx.gasCtx, o.pose) : 0;
  // Seguridad antes de calentar (§18.3): sin pinza para crisol, pantalla, cápsula o advertencia, se bloquea.
  if (r.phase === 'COLD_METAL' || r.phase === 'HEATING') {
    if (tl > 250 && o.support === 'hand') {
      if (w.safety.block?.code !== 'MG_HAND') {
        setGasBlock(w, 'MG_HAND');
        emit4(w, 'MG_IN_HAND', 'CRITICAL', undefined, r.id);
        bump(w, 'err:mgHand');
      }
      return;
    }
    if (tl > 250 && inTongs) {
      const missing = mgSetupMissing(w, ctx);
      if (missing.length) {
        if (w.safety.block?.code !== 'MG_SETUP') {
          w.safety.block = { code: 'MG_SETUP', since: w.timeS, reasons: missing };
          emit4(w, 'MG_SETUP_INCOMPLETE', 'CRITICAL', { missing: missing.join(',') }, r.id);
          bump(w, 'err:mgSetup');
        }
        return;
      }
    }
    if (w.safety.block?.code === 'MG_SETUP' || w.safety.block?.code === 'MG_HAND') return;
  }
  switch (r.phase) {
    case 'COLD_METAL':
    case 'HEATING': {
      // Cinta delgada: se calienta en fracciones de segundo en la zona caliente.
      const target = amb + (tl - amb) * 0.95;
      r.temperatureC += ((target - r.temperatureC) * dt) / (target > r.temperatureC ? 0.6 : 5);
      r.phase = r.temperatureC > 120 ? 'HEATING' : 'COLD_METAL';
      if (r.temperatureC >= w.params.mgIgnitionC && w.params.oxygenAvailability > 0) {
        r.phase = 'IGNITION_THRESHOLD';
        r.ignitedAt = w.timeS;
        // Toda la cinta dentro de la llama de golpe (la pinza también en la llama): ignición brusca (§13.6).
        const tongsId = o.support.slice(7);
        const jaw = w.objects[tongsId]?.pose;
        r.abrupt = !!jaw && localContact(w.gas, ctx.gasCtx, { x: jaw.x, y: jaw.y, z: jaw.z }) > 0.15;
        if (r.abrupt) {
          emit4(w, 'MG_ABRUPT_IGNITION', 'WARN', undefined, r.id);
          bump(w, 'err:mgAbrupt');
        }
        emit4(w, 'MG_IGNITED', 'ALERT', undefined, r.id);
        flag(w, 'mgIgnited');
      }
      break;
    }
    case 'IGNITION_THRESHOLD':
    case 'BRIGHT_COMBUSTION': {
      r.phase = 'BRIGHT_COMBUSTION';
      r.temperatureC = 2500;
      const age = w.timeS - (r.ignitedAt ?? w.timeS);
      if (age > 0.25) r.established = true;
      // Retirada brusca antes de que la combustión se establezca: se apaga (queda Mg metálico, §13.6).
      if (!r.established && contact < 0.05) {
        r.phase = 'GLOWING_RESIDUE';
        r.temperatureC = 900;
        r.endedAt = w.timeS;
        emit4(w, 'MG_WENT_OUT', 'WARN', { frac: Math.round(r.burnFrac * 100) }, r.id);
        bump(w, 'err:mgPartial');
        break;
      }
      const o2 = w.params.oxygenAvailability;
      const dFrac = Math.min(1 - r.burnFrac, (w.params.mgBurnCmS * o2 * dt) / r.lengthCm);
      const molMgTotal = r.massInitialG / 24.305;
      const dMg = Math.min(r.mgMol, molMgTotal * dFrac);
      r.burnFrac += dFrac;
      if (dMg > 0) burnMagnesium(w, ctx, r, o, dMg);
      if (r.burnFrac >= 0.999 || r.mgMol <= 1e-12) {
        r.phase = 'GLOWING_RESIDUE';
        r.temperatureC = 1200;
        r.endedAt = w.timeS;
        emit4(w, 'MG_BURN_DONE', 'INFO', { s: Math.round((w.timeS - (r.ignitedAt ?? w.timeS)) * 10) / 10 }, r.id);
        flag(w, 'mgBurnDone');
      }
      // Exposición visual directa (§13.1): la vista cuenta si la cinta está en pantalla sin la pantalla delante.
      if (w.mgView.inView && !w.mgView.shielded) {
        r.directViewS += dt;
        if (r.directViewS > 0.4) {
          emitLatched(w, `look:${r.id}`, 'LOOK_DIRECT', 'ALERT', undefined, r.id);
          bump(w, 'lookDirectS', dt);
        }
      }
      break;
    }
    case 'GLOWING_RESIDUE':
    case 'COOLING_RESIDUE': {
      r.temperatureC += ((amb - r.temperatureC) * dt) / 12;
      r.phase = r.temperatureC > 450 ? 'GLOWING_RESIDUE' : 'COOLING_RESIDUE';
      break;
    }
  }
  o.temperatureC = r.temperatureC;
}

/** Combustión de dMg mol: 2 Mg + O₂ → 2 MgO (y opcionalmente 3 Mg + N₂ → Mg₃N₂); el oxígeno sale del aire. */
function burnMagnesium(w: P4World, ctx: ReactionContext, r: MgRibbon, o: P4Object, dMg: number) {
  const nitride = w.params.mgNitrideFrac;
  const toN = dMg * nitride;
  const toO = dMg - toN;
  const cell = emptyCell();
  addMol(cell, 'Mg(s)', dMg);
  addMol(cell, 'O2(g)', toO / 2);
  addMol(cell, 'N2(g)', toN / 3);
  let heat = applyExtent(cell, ctx.chem.reactions.mgO2, toO / 2, ctx.chem);
  if (toN > 0) heat += applyExtent(cell, ctx.chem.reactions.mgN2, toN / 3, ctx.chem);
  void heat;
  r.mgMol -= dMg;
  w.ledger.air['O2(g)'] = (w.ledger.air['O2(g)'] ?? 0) - toO / 2;
  w.ledger.air['N2(g)'] = (w.ledger.air['N2(g)'] ?? 0) - toN / 3;
  const mgo = n(cell, 'MgO(s)');
  const n3 = n(cell, 'Mg3N2(s)');
  // Reparto del producto: humo blanco que escapa, partículas que caen y ceniza que queda en la cinta.
  const smoke = mgo * (r.smokeFrac + (r.abrupt ? 0.15 : 0));
  const fall = mgo * 0.25;
  const stay = mgo - smoke - fall;
  w.ledger.smoke['MgO(s)'] = (w.ledger.smoke['MgO(s)'] ?? 0) + smoke;
  r.smokeMol += smoke;
  r.mgoMol += stay;
  r.mg3n2Mol += n3;
  const cap = w.vessels.capsule;
  const co = w.objects.capsule;
  const over = !!co && !!cap && Math.hypot(o.pose.x - co.pose.x, o.pose.y - co.pose.y) < ctx.geo.capsuleRimR + 0.5 && o.pose.z > co.pose.z;
  if (over && cap) {
    addMol(cap.bulk, 'MgO(s)', fall);
    if (!cap.particles['MgO(s)']) cap.particles['MgO(s)'] = particleFor(w, 'MgO(s)', 'capsule', 0, 0);
    cap.residueTempC = Math.max(cap.residueTempC, 700);
    r.toCapsuleMol += fall;
    cap.dirty = true;
  } else {
    const c = emptyCell();
    addMol(c, 'MgO(s)', fall);
    addSpill(w, r.id, c, { x: o.pose.x, y: o.pose.y });
    r.toBenchMol += fall;
    // Avisa cuando una parte apreciable del producto ya cayó fuera de la cápsula.
    if (r.toBenchMol > 0.45 * (r.massInitialG / 24.305) * 0.25) emitLatched(w, `noCapsule:${r.id}`, 'MG_NO_CAPSULE_BELOW', 'WARN', undefined, r.id);
  }
}

/** Cápsula: se calienta en la llama (como en la Práctica 3) y la hidratación del MgO avanza con el agua (§14.4). */
function updateCapsuleHeat(w: P4World, ctx: ReactionContext, dt: number) {
  const v = w.vessels.capsule;
  const o = w.objects.capsule;
  if (!v || !o) return;
  const amb = w.params.ambientC;
  if (hasOpenFlame(w.gas)) {
    const tl = localTemperature(w.gas, ctx.gasCtx, o.pose);
    const contact = localContact(w.gas, ctx.gasCtx, o.pose);
    if (tl > o.temperatureC) {
      const eff = amb + (tl - amb) * 0.45 * (0.4 + 0.6 * Math.min(1, contact * 2));
      o.temperatureC += ((eff - o.temperatureC) * dt) / 18;
    }
  }
  // Mientras arde una cinta encima, la cápsula recibe calor.
  for (const r of Object.values(w.ribbons)) {
    const ro = w.objects[r.id];
    if (r.phase !== 'BRIGHT_COMBUSTION' || !ro) continue;
    const d = Math.hypot(ro.pose.x - o.pose.x, ro.pose.y - o.pose.y, ro.pose.z - o.pose.z);
    if (d < 12) o.temperatureC += (dt * 25) / Math.max(1, d);
  }
  o.temperatureC += ((amb - o.temperatureC) * dt) / (o.support === 'tile' ? 140 : 110);
  // El líquido de la cápsula sigue a la porcelana (y al revés) con acoplamiento.
  if (liquidMl(v) > 0.1) {
    const avg = (o.temperatureC * 0.5 + v.temperatureC * 0.5);
    o.temperatureC += ((avg - o.temperatureC) * dt) / 4;
    v.temperatureC += ((avg - v.temperatureC) * dt) / 4;
  } else v.temperatureC = o.temperatureC;
  v.residueTempC = Math.max(v.residueTempC, o.temperatureC);
  // ── MgO + H₂O → Mg(OH)₂ (gradual; partículas finas más rápido; la agitación ayuda) ──
  const water = n(v.bulk, WATER) + n(v.plume, WATER);
  const mgo = n(v.bulk, 'MgO(s)') + n(v.plume, 'MgO(s)');
  if (mgo > 1e-12 && water > 1e-4 && liquidMl(v) > 0.3) {
    const mix = 1 + 2.5 * clamp(v.agitation, 0, 1);
    const tf = Math.exp(0.035 * (v.temperatureC - 25));
    const rate = w.params.kHydration * mix * tf * hashRange(w.seed, 'mgo:surface', 0.8, 1.2);
    for (const c of [v.bulk, v.plume]) {
      const m = n(c, 'MgO(s)');
      if (m <= 0 || n(c, WATER) <= 0) continue;
      const xi = Math.min(m, m * rate * dt + 1e-12);
      const heat = applyExtent(c, ctx.chem.reactions.mgoHydration, xi, ctx.chem);
      addHeat(v, ctx, heat);
      v.extents.mgoHydration = (v.extents.mgoHydration ?? 0) + xi;
    }
    if (!v.particles['Mg(OH)2(s)']) v.particles['Mg(OH)2(s)'] = particleFor(w, 'Mg(OH)2(s)', 'capsule', 0.4, 0);
    v.dirty = true;
  }
  if (v.residueTempC < 60 && w.evidence.residueInCapsule && !w.evidence.residueCooled) flag(w, 'residueCooled');
}

// ─────────────────────────── Sonda, derrames y evidencia ───────────────────────────

function updateProbe(w: P4World, ctx: ReactionContext, dt: number) {
  const o = w.objects.probe;
  if (!o) return;
  const vid = w.probe.vesselId;
  let target = w.params.ambientC;
  w.probe.tipInLiquid = false;
  w.probe.touchingBottom = false;
  if (vid && w.vessels[vid]) {
    const v = w.vessels[vid];
    const vo = w.objects[vid];
    const surf = surfaceZ(w, ctx, vid);
    const bottom = (vo?.pose.z ?? 0) + ctx.geo.level(v.kind, 0);
    if (o.pose.z < surf - 0.05) {
      w.probe.tipInLiquid = true;
      target = v.temperatureC;
      if (o.pose.z < bottom + 0.12) {
        // Tocar el fondo: la lectura mezcla la del vidrio (más cerca del ambiente) — §16.5.
        w.probe.touchingBottom = true;
        target = v.temperatureC * 0.8 + w.params.ambientC * 0.2;
        emitLatched(w, 'probeBottom', 'PROBE_ON_BOTTOM', 'WARN', undefined, vid);
      } else rearm(w, 'probeBottom');
      flag(w, `probeRead:${vid}`);
      const k = `probeT:${vid}`;
      if (!w.evidence[`${k}:first`]) w.evidence[`${k}:first`] = Math.round(v.temperatureC * 100) / 100 + 1000;
    }
  }
  w.probe.readingC += ((target - w.probe.readingC) * dt) / 3;
  o.temperatureC = w.probe.readingC;
}

function updateSpills(w: P4World, dt: number) {
  for (const s of w.spills) {
    if (s.cleaned) continue;
    const big = s.cell.volL * 1000 > 1.5;
    const corrosive = (s.cell.mol['H+'] ?? 0) + (s.cell.mol['OH-'] ?? 0) > 2e-5 || (s.cell.mol['Fe^3+'] ?? 0) + (s.cell.mol['Cu^2+'] ?? 0) > 5e-5;
    if (big && corrosive && w.timeS - s.t > 20 && !w.safety.incident) {
      // §18.3: no continuar después de un derrame importante sin limpiar.
      w.safety.incident = { code: 'SPILL', since: w.timeS, needs: ['CLEAN_SPILL'], done: [] };
      emit4(w, 'SPILL_NOT_CLEANED', 'CRITICAL', { ml: Math.round(s.cell.volL * 10000) / 10 });
      bump(w, 'err:spillUncleaned');
    }
  }
  void dt;
}

function updateEvidence(w: P4World, ctx: ReactionContext, dt: number) {
  // Remolinos rosados transitorios (§8.1-8): penacho básico con indicador en un seno todavía ácido.
  const b = w.vessels.beaker;
  if (b && n(b.bulk, 'HIn') + n(b.plume, 'HIn') > 0 && b.plume.volL > 1e-6) {
    const pp = pH(b.plume, b.temperatureC);
    const pb = pH(b.bulk, b.temperatureC);
    if (pp > 8.6 && pb < 7) {
      bump(w, 'pinkSwirlS', dt);
      emitLatched(w, 'swirl', 'PINK_SWIRL', 'INFO', undefined, 'beaker');
    }
  }
  if (isLit(w.gas)) bump(w, 'litS', dt);
  // Material caliente fuera de su soporte.
  const cap = w.objects.capsule;
  if (cap && cap.support === 'bench' && Math.max(cap.temperatureC, w.vessels.capsule?.residueTempC ?? 0) > 60) bump(w, 'hotOnBenchS', dt);
  void ctx;
}

// ─────────────────────────── Consultas ───────────────────────────

/** Apariencia de un recipiente (para la escena, la libreta y la accesibilidad), §6 y §11. */
export interface VesselAppearance {
  liquidMl: number;
  /** Transmitancia del seno y del penacho (0–1 por canal). */
  bulkRgb: [number, number, number];
  plumeRgb: [number, number, number];
  plumeFrac: number;
  /** Turbidez (0–1) y color de lo suspendido; sedimento (mL aparente) y su color. */
  turbidity: number;
  suspendedRgb: [number, number, number];
  sedimentMl: number;
  sedimentRgb: [number, number, number];
  localizedCloud: number;
  pH: number;
  pinkBulk: number;
  bubbling: boolean;
}

export function vesselAppearance(w: P4World, ctx: ReactionContext, id: string, vessel?: P4Vessel | null): VesselAppearance | null {
  const v = vessel ?? w.vessels[id];
  if (!v) return null;
  const path = ctx.geo.pathCm[v.kind];
  const ml = liquidMl(v);
  const bulkRgb = transmittance(v.bulk, ctx.chem, v.temperatureC, path);
  const plumeRgb = v.plume.volL > 1e-8 ? transmittance(v.plume, ctx.chem, v.temperatureC, path) : bulkRgb;
  let suspG = 0;
  let sedMl = 0;
  const sRgb: [number, number, number] = [0, 0, 0];
  const dRgb: [number, number, number] = [0, 0, 0];
  let sW = 0;
  let dW = 0;
  let localized = 0;
  for (const [sid, p] of Object.entries(v.particles)) {
    const sp = ctx.chem.species[sid];
    if (!sp) continue;
    const mol = n(v.bulk, sid) + n(v.plume, sid);
    const g = mol * sp.molarMass;
    const rgb = sp.solidRgb ?? [0.9, 0.9, 0.9];
    const sus = g * p.suspended;
    suspG += sus;
    for (let i = 0; i < 3; i++) sRgb[i] += rgb[i] * sus;
    sW += sus;
    const sed = g * (1 - p.suspended);
    sedMl += (sed / (sp.densityGcm3 ?? 2.5)) * (sp.gelatinous ? 40 : 12);
    for (let i = 0; i < 3; i++) dRgb[i] += rgb[i] * sed;
    dW += sed;
    localized = Math.max(localized, p.localized * p.suspended);
  }
  // Turbidez por concentración másica de sólido suspendido (los finos dispersan más).
  const concGL = ml > 0.01 ? suspG / (ml / 1000) : 0;
  const turbidity = clamp(1 - Math.exp(-concGL * path * 0.9), 0, 0.97);
  const pHv = vesselPH(v);
  const ind = n(v.bulk, 'HIn') + n(v.plume, 'HIn');
  return {
    liquidMl: ml,
    bulkRgb,
    plumeRgb,
    plumeFrac: ml > 0 ? clamp((v.plume.volL * 1000) / ml, 0, 1) : 0,
    turbidity,
    suspendedRgb: sW > 0 ? (sRgb.map((x) => x / sW) as [number, number, number]) : [1, 1, 1],
    sedimentMl: sedMl,
    sedimentRgb: dW > 0 ? (dRgb.map((x) => x / dW) as [number, number, number]) : [1, 1, 1],
    localizedCloud: localized,
    pH: pHv,
    pinkBulk: ind > 0 ? clamp(1 - bulkRgb[1] / Math.max(0.05, bulkRgb[0]), 0, 1) : 0,
    bubbling: w.timeS - v.lastBubbleS < 1.5,
  };
}

/** Totales de átomos y carga de TODO el sistema (recipientes, piezas, derrames, residuos, aire, humo). §28.1 */
export function globalTotals(w: P4World, ctx: ReactionContext): Record<string, number> {
  const all: Record<string, number> = {};
  const add = (mol: Record<string, number>) => {
    for (const [id, m] of Object.entries(mol)) all[id] = (all[id] ?? 0) + m;
  };
  for (const v of Object.values(w.vessels)) {
    add(v.bulk.mol);
    add(v.plume.mol);
    add(v.released);
  }
  for (const m of Object.values(w.metals)) {
    add({ [m.metal === 'Fe' ? 'Fe(s)' : 'Al(s)']: m.metalMol, 'Cu(s)': m.segments.reduce((s, x) => s + x.cuMol, 0) });
  }
  for (const r of Object.values(w.ribbons)) add({ 'Mg(s)': r.mgMol, 'MgO(s)': r.mgoMol, 'Mg3N2(s)': r.mg3n2Mol });
  // Un derrame limpiado ya está contado en las toallas.
  for (const s of w.spills) if (!s.cleaned) add(s.cell.mol);
  add(w.ledger.drained);
  add(w.ledger.smoke);
  add(w.ledger.air);
  add(w.ledger.towels);
  return elementTotals(all, ctx.chem);
}

/** Motivos que impiden entregar (§22.2, §32): mechero encendido o gas abierto, residuos sin clasificar, material caliente. */
export function submissionBlockers(w: P4World, ctx: ReactionContext): string[] {
  const out: string[] = [];
  const b = w.gas.burner;
  if (isLit(w.gas)) out.push('FLAME_LIT');
  if (b.tableGasValve > 0.02 && b.supplyOn) out.push('TABLE_OPEN');
  if (b.needleGasValve > 0.02) out.push('NEEDLE_OPEN');
  if (w.safety.incident) out.push('INCIDENT');
  if (Object.values(w.ribbons).some((r) => r.phase === 'BRIGHT_COMBUSTION')) out.push('MG_BURNING');
  const cap = w.objects.capsule;
  const capT = Math.max(cap?.temperatureC ?? 0, w.vessels.capsule?.residueTempC ?? 0);
  if (cap && capT > 60 && cap.support !== 'tile') out.push('HOT_CAPSULE');
  // Residuos sin clasificar: recipientes de trabajo con contenido usado (no los frascos de reactivo).
  const used = Object.values(w.vessels).filter((v) => ['TUBE', 'BEAKER100', 'CYL10', 'CYL25', 'CAPSULE'].includes(v.kind) && !v.broken && v.additions.length > 0 && liquidMl(v) + solidsVolumeMl(v, ctx) > (w.params.holdupMl[v.kind] ?? 0.1) * 2);
  if (used.length) out.push('WASTE_PENDING');
  if (w.metals.nail && w.metals.nail.totalImmersedS > 0 && !w.objects.nail?.support.startsWith('disposed:') && !w.metals.nail.immersedIn) out.push('NAIL_PENDING');
  if (w.metals.nail?.immersedIn && w.vessels[w.metals.nail.immersedIn]?.disposedTo === null) out.push('NAIL_PENDING');
  if (Object.values(w.vessels).some((v) => v.broken) && Object.values(w.objects).some((o) => w.vessels[o.id]?.broken && !o.support.startsWith('disposed:'))) out.push('BROKEN_GLASS');
  if (w.spills.some((s) => !s.cleaned && s.cell.volL * 1000 > 0.3)) out.push('SPILL');
  return out;
}

export function p4Summary(w: P4World): Record<string, number | string> {
  const b = w.vessels.beaker;
  return {
    t: Math.round(w.timeS),
    flame: w.gas.burner.flameState,
    beakerPH: b ? Math.round(vesselPH(b) * 100) / 100 : 0,
    beakerT: b ? Math.round(b.temperatureC * 100) / 100 : 0,
    nailCuMg: w.metals.nail ? Math.round(metalCuMg(w.metals.nail) * 100) / 100 : 0,
    mg: Object.values(w.ribbons).map((r) => r.phase[0]).join(''),
  };
}

export { normalizeWater };
