import type { Amounts, Mixture, Prop, SimParams, Vessel, World } from '../entities/types';
import { makeVessel, VESSEL_DEFAULTS, WALL_STICK_FRACTION, type VesselSpec } from '../entities/vessel';
import {
  addAmounts, addMix, dominantSubstance, emptyMixture, liquidVolumeMl, mixAmounts, mixMassG, particulateMassG,
  takeAllFraction, takeLiquidFraction, takeSolids, pourInto, sumRecord,
} from '../solutions/mixture';
import { stepDissolution, stepSuspension } from '../solutions/dissolution';
import { bathHeatIn, splashRatePerS, stepBath, stepHotplate, stepVesselThermal } from '../thermal/thermal';
import { stepCrystallization } from '../separation/crystallization';
import { stepFiltration } from '../separation/filtration';
import {
  GLASS_TYPES, allowedDuringBlock, criticalBlock, isDryCarbonNitrate, placementBlock, stepSafety, vesselOnHotplate,
} from '../safety/safety';
import { clamp } from '../core/math';
import { hashRange, rand, randRange } from '../core/rng';
import type { Command, FoldAction } from './commands';
import { addRaw, bump, deliver, emit, spill, type SimContext } from './ops';
import { tubeRefusesLoad } from '../entities/tube';
import type { SubstanceTable } from '../substances/types';

export type { SimContext };

export interface WorldSpec {
  vessels: VesselSpec[];
  props: Prop[];
}

export interface DispatchResult {
  ok: boolean;
  code?: string;
  id?: string;
}

const REAGENT_TYPES = new Set(['REAGENT_JAR', 'REAGENT_BOTTLE', 'VIAL', 'WASH_BOTTLE', 'JUG', 'ICE_BUCKET']);

export function worldTotals(w: World): Amounts {
  const t: Amounts = {};
  for (const id in w.vessels) addAmounts(t, mixAmounts(w.vessels[id].mix));
  addAmounts(t, w.ledger.spilled);
  addAmounts(t, w.ledger.adhered);
  addAmounts(t, w.ledger.evaporated);
  return t;
}

export function createWorld(spec: WorldSpec, seed: number, params: SimParams): World {
  const w: World = {
    version: 1,
    timeS: 0,
    tick: 0,
    seed,
    rng: seed >>> 0,
    params: structuredClone(params),
    vessels: {},
    props: {},
    devices: {
      hotplate: { powerPct: 0, plateTempC: params.ambientC, lastPowerPct: 0, lastPowerChangeS: -100, emptyHeatingS: 0 },
      balance: { tareOffsetG: 0 },
      probe: { vesselId: null, touchingBottom: false },
      rod: { vesselId: null, integrity: 1 },
      stand: { ringHeightCm: 14, assembled: true },
      hand: { mode: 'HAND' },
    },
    pours: {},
    ledger: { spilled: {}, adhered: {}, evaporated: {} },
    initialTotals: {},
    reagentInitial: {},
    spareCount: 0,
    bench: { spillMl: 0, spillOpen: false, shards: [] },
    safety: { block: null, halted: false, burns: 0, incident: null },
    evidence: {},
    events: [],
  };
  for (const vs of spec.vessels) {
    const [a, b] = VESSEL_DEFAULTS[vs.type].tareG;
    const tare = Math.round(hashRange(seed, `tare:${vs.id}`, a, b) * 100) / 100;
    const v = makeVessel(vs, params.ambientC, tare);
    v.cryst.baseDelayS = hashRange(seed, `nuc:${vs.id}`, params.crystal.baseDelayMinS, params.crystal.baseDelayMaxS);
    w.vessels[v.id] = v;
    if (REAGENT_TYPES.has(v.type)) w.reagentInitial[v.id] = mixAmounts(v.mix);
  }
  for (const p of spec.props) w.props[p.id] = { ...p, pose: { ...p.pose } };
  w.initialTotals = worldTotals(w);
  return w;
}

// ───────────────────────────── Comandos ─────────────────────────────

function odorOf(v: Vessel, subs: SubstanceTable): 'NONE' | 'FAINT' | 'NEAR_NONE' {
  let best: 'NONE' | 'FAINT' | 'NEAR_NONE' = 'NONE';
  for (const k of Object.keys(v.mix.oil) as (keyof typeof v.mix.oil)[]) {
    if ((v.mix.oil[k] ?? 0) > 0.005) {
      const o = subs[k].odor;
      if (o === 'FAINT') best = 'FAINT';
      else if (o === 'NEAR_NONE' && best === 'NONE') best = 'NEAR_NONE';
    }
  }
  return best;
}

export function grossBalanceG(w: World): number {
  let g = 0;
  for (const id in w.vessels) {
    const v = w.vessels[id];
    if (v.support === 'balance' || (v.support && w.vessels[v.support]?.support === 'balance')) {
      // Corriente de convección: un objeto caliente pesa aparentemente menos (≈2 mg/°C).
      g += v.tareMassG + mixMassG(v.mix) - 0.002 * Math.max(0, v.temperatureC - w.params.ambientC);
    }
  }
  return g;
}

/** Lectura de la balanza (resolución 0,01 g). null = sobrecarga. */
export function balanceReading(w: World): number | null {
  const gross = grossBalanceG(w);
  if (gross > 210) return null;
  return Math.round((gross - w.devices.balance.tareOffsetG) * 100) / 100;
}

function breakVessel(w: World, v: Vessel, ctx: SimContext, into: Vessel | null): void {
  if (v.integrity === 0) return;
  v.integrity = 0;
  // Si estaba tapada con el vidrio de reloj, este queda libre sobre la mesada.
  v.cover = 'NONE';
  const all = takeAllFraction(v.mix, 1);
  if (into && into.integrity === 1) pourInto(into, all, v.temperatureC, ctx.subs, w.params.cpWater);
  else spill(w, all, ctx, 'breakage');
  if (v.funnel?.paperId) {
    const paper = w.vessels[v.funnel.paperId];
    if (paper) {
      spill(w, takeAllFraction(paper.mix, 1), ctx, 'breakage');
      paper.support = 'bench';
    }
    v.funnel.paperId = null;
  }
  if (w.devices.probe.vesselId === v.id) w.devices.probe.vesselId = null;
  if (w.devices.rod.vesselId === v.id) w.devices.rod.vesselId = null;
  delete w.pours[v.id];
  if (!w.bench.shards.includes(v.id)) w.bench.shards.push(v.id);
  bump(w, 'breakages');
  emit(w, 'GLASS_BROKEN', 'ALERT', { vesselId: v.id });
}

function filmToAdhered(w: World, v: Vessel | undefined, ml: number, ctx: SimContext): void {
  if (!v) return;
  const vol = liquidVolumeMl(v.mix, ctx.subs);
  if (vol <= 0) return;
  const part = takeLiquidFraction(v.mix, Math.min(1, ml / vol), ctx.subs, false);
  addAmounts(w.ledger.adhered, mixAmounts(part));
}

function hasSample(m: Mixture): boolean {
  return particulateMassG(m) > 0.001 || sumRecord(m.oil) > 0.001 || sumRecord(m.dissolved) > 0.001;
}

function foldNext(fold: string, action: FoldAction): string {
  if (action === 'CRUMPLE') return 'CRUMPLED';
  if (action === 'MISALIGNED') return fold === 'FLAT' || fold === 'HALF' ? 'MISALIGNED' : fold;
  switch (fold) {
    case 'FLAT':
      return action === 'HALF' ? 'HALF' : fold;
    case 'HALF':
      return action === 'QUARTER' ? 'QUARTER' : fold;
    case 'QUARTER':
      return action === 'OPEN_3_1' ? 'CONE_OK' : action === 'OPEN_2_2' ? 'CONE_BAD' : fold;
    case 'MISALIGNED':
      return action === 'OPEN_3_1' || action === 'OPEN_2_2' ? 'CONE_BAD' : 'MISALIGNED';
    default:
      return fold;
  }
}

/**
 * Aplica un comando al mundo (in situ). Devuelve si fue aceptado.
 * Las reglas de seguridad se comprueban aquí: el dominio nunca ejecuta una acción peligrosa.
 */
export function dispatchMut(w: World, cmd: Command, ctx: SimContext): DispatchResult {
  const p = w.params;
  const softAllowed = new Set(['setPose', 'setHandMode', 'stopPour', 'setAgitation', 'acknowledgeIncident', 'setDripTarget', 'drop', 'place', 'grab']);
  if (w.safety.halted && !softAllowed.has(cmd.type) && !(cmd.type === 'setHotplatePower' && cmd.pct === 0)) {
    emit(w, 'ACTION_REJECTED_HALTED', 'WARN');
    return { ok: false, code: 'HALTED' };
  }
  if (w.safety.block && !allowedDuringBlock(w.safety.block.code, cmd.type)) {
    const lowering = cmd.type === 'setHotplatePower' && cmd.pct <= w.devices.hotplate.powerPct;
    if (!lowering) {
      emit(w, 'ACTION_BLOCKED', 'WARN', { params: { code: w.safety.block.code } });
      return { ok: false, code: w.safety.block.code };
    }
  }

  switch (cmd.type) {
    case 'setPose': {
      const v = w.vessels[cmd.id];
      if (v) v.pose = { ...cmd.pose };
      else if (w.props[cmd.id]) w.props[cmd.id].pose = { ...cmd.pose };
      return { ok: true };
    }
    case 'grab': {
      const v = w.vessels[cmd.id];
      const tongs = w.devices.hand.mode === 'TONGS';
      if (v) {
        if (v.integrity === 0) {
          bump(w, 'touchBrokenGlass');
          emit(w, 'SAFETY_BROKEN_GLASS', 'CRITICAL', { vesselId: v.id });
          return { ok: false, code: 'BROKEN_GLASS' };
        }
        if (!tongs && v.temperatureC > p.safety.hotTouchC) {
          w.safety.burns++;
          bump(w, 'burns');
          emit(w, 'SAFETY_BURN', 'ALERT', { vesselId: v.id, params: { t: Math.round(v.temperatureC) } });
          return { ok: false, code: 'BURN' };
        }
        if (!tongs && v.temperatureC > 45 && GLASS_TYPES.has(v.type)) {
          bump(w, 'hotGlassNoTongs');
          emit(w, 'WARN_HOT_GLASS_NO_TONGS', 'WARN', { vesselId: v.id });
        }
        if (v.tipped) {
          v.tipped = false;
          emit(w, 'VESSEL_RIGHTED', 'INFO', { vesselId: v.id });
        }
        if (v.support === 'funnel') {
          for (const fid in w.vessels) if (w.vessels[fid].funnel?.paperId === v.id) w.vessels[fid].funnel!.paperId = null;
        }
        v.support = null;
        return { ok: true };
      }
      const pr = w.props[cmd.id];
      if (pr) {
        if (pr.kind === 'hotplate' && !tongs && w.devices.hotplate.plateTempC > 50) {
          w.safety.burns++;
          bump(w, 'burns');
          emit(w, 'SAFETY_BURN_PLATE', 'ALERT', { params: { t: Math.round(w.devices.hotplate.plateTempC) } });
          return { ok: false, code: 'BURN' };
        }
        if (pr.kind === 'rod' && w.devices.rod.integrity === 0) {
          bump(w, 'touchBrokenGlass');
          emit(w, 'SAFETY_BROKEN_GLASS', 'CRITICAL');
          return { ok: false, code: 'BROKEN_GLASS' };
        }
        pr.support = null;
        return { ok: true };
      }
      return { ok: false, code: 'UNKNOWN' };
    }
    case 'touchHotplate': {
      if (w.devices.hotplate.plateTempC > 50) {
        w.safety.burns++;
        bump(w, 'burns');
        emit(w, 'SAFETY_BURN_PLATE', 'ALERT');
        return { ok: false, code: 'BURN' };
      }
      return { ok: true };
    }
    case 'place': {
      const v = w.vessels[cmd.id];
      if (!v) {
        const pr = w.props[cmd.id];
        if (pr) pr.support = cmd.support;
        return { ok: !!pr };
      }
      const block = placementBlock(w, v, cmd.support);
      if (block) {
        if (block === 'PLATE_OCCUPIED') {
          emit(w, 'PLATE_OCCUPIED', 'WARN', { vesselId: v.id });
        } else criticalBlock(w, block, v.id);
        if (block === 'DRY_MIXTURE_HEAT' || block === 'COMBUSTIBLE_ON_PLATE') w.safety.block = null; // la acción no ocurrió
        v.support = 'bench';
        return { ok: false, code: block };
      }
      if (cmd.support === 'funnel') {
        if (v.type !== 'FILTER_PAPER' || !v.filter || !v.filter.fold.startsWith('CONE')) {
          emit(w, 'PAPER_NOT_FOLDED', 'WARN', { vesselId: v.id });
          v.support = 'bench';
          return { ok: false, code: 'PAPER_NOT_FOLDED' };
        }
        const funnel = Object.values(w.vessels).find((f) => f.type === 'FUNNEL' && f.integrity === 1);
        if (!funnel || funnel.funnel!.paperId) {
          v.support = 'bench';
          return { ok: false, code: 'FUNNEL_OCCUPIED' };
        }
        funnel.funnel!.paperId = v.id;
        if (v.filter.fold === 'CONE_BAD') emit(w, 'PAPER_BAD_FOLD', 'WARN', { vesselId: v.id });
        emit(w, 'PAPER_SEATED', 'INFO', { vesselId: v.id });
      }
      if (cmd.support === 'bath') {
        const bath = w.vessels.bath;
        if (bath) {
          bump(w, 'bathPlacements');
          if (bath.mix.iceG > 0) bump(w, 'iceBathUsed');
          const delta = v.temperatureC - bath.temperatureC;
          if (GLASS_TYPES.has(v.type) && delta > p.safety.thermalShockDeltaC) {
            const chance = clamp((delta - p.safety.thermalShockDeltaC) / 30, 0.25, 0.85);
            bump(w, 'thermalShockRisk');
            if (rand(w) < chance) {
              v.support = 'bath';
              emit(w, 'THERMAL_SHOCK_BREAK', 'ALERT', { vesselId: v.id, params: { delta: Math.round(delta) } });
              breakVessel(w, v, ctx, bath);
              return { ok: true, code: 'BROKEN' };
            }
            emit(w, 'THERMAL_SHOCK_RISK', 'WARN', { vesselId: v.id, params: { delta: Math.round(delta) } });
          }
        }
      }
      if (cmd.support === 'hotplate') bump(w, `onPlate:${v.id}`);
      v.support = cmd.support;
      return { ok: true };
    }
    case 'drop': {
      const v = w.vessels[cmd.id];
      if (!v) return { ok: true };
      if (GLASS_TYPES.has(v.type) && (cmd.fell || cmd.impactCmS > 150)) {
        const chance = cmd.fell ? 0.9 : clamp((cmd.impactCmS - 150) / 200, 0.2, 0.8);
        if (rand(w) < chance) {
          breakVessel(w, v, ctx, null);
          return { ok: true, code: 'BROKEN' };
        }
        emit(w, 'GLASS_KNOCK', 'WARN', { vesselId: v.id });
      }
      if (cmd.fell) {
        // Lo que cae fuera de la mesada derrama su contenido líquido.
        const lv = liquidVolumeMl(v.mix, ctx.subs);
        if (lv > 0) spill(w, takeLiquidFraction(v.mix, 1, ctx.subs), ctx, 'fall');
      }
      return { ok: true };
    }
    case 'tip': {
      const v = w.vessels[cmd.id];
      if (!v || v.integrity === 0) return { ok: false };
      v.tipped = true;
      v.support = 'bench';
      const lv = liquidVolumeMl(v.mix, ctx.subs);
      if (lv > 0 || particulateMassG(v.mix) > 0) {
        const part = lv > 0 ? takeLiquidFraction(v.mix, 1, ctx.subs) : takeSolids(v.mix, particulateMassG(v.mix) * 0.6);
        spill(w, part, ctx, 'tipped');
      }
      bump(w, 'tipped');
      emit(w, 'VESSEL_TIPPED', 'ALERT', { vesselId: v.id });
      return { ok: true };
    }
    case 'setPour': {
      const src = w.vessels[cmd.sourceId];
      if (!src || src.integrity === 0) return { ok: false };
      const prev = w.pours[cmd.sourceId];
      if (prev && prev.targetId === cmd.targetId) {
        prev.liquidRateMlS = cmd.liquidRateMlS;
        prev.solidRateGS = cmd.solidRateGS;
        prev.tiltDeg = cmd.tiltDeg;
        prev.guided = cmd.guided;
      } else {
        if (prev) endPour(w, prev);
        w.pours[cmd.sourceId] = {
          sourceId: cmd.sourceId, targetId: cmd.targetId, liquidRateMlS: cmd.liquidRateMlS, solidRateGS: cmd.solidRateGS,
          tiltDeg: cmd.tiltDeg, guided: cmd.guided, startedS: w.timeS, transferredMl: 0, transferredSolidG: 0, spilledMl: 0,
        };
      }
      return { ok: true };
    }
    case 'stopPour': {
      const pr = w.pours[cmd.sourceId];
      if (pr) endPour(w, pr);
      return { ok: true };
    }
    case 'setAgitation': {
      const v = w.vessels[cmd.vesselId];
      if (!v) return { ok: false };
      v.agitation = clamp(cmd.intensity, 0, 1);
      v.agitationTool = v.agitation > 0 ? cmd.tool : 'NONE';
      return { ok: true };
    }
    case 'scoop': {
      const tool = w.vessels[cmd.toolId];
      const src = w.vessels[cmd.sourceId];
      if (!tool || !src) return { ok: false };
      if (tool.type === 'SCOOP') {
        if (src.type !== 'ICE_BUCKET' || src.mix.iceG <= 0) return { ok: false, code: 'NO_ICE' };
        if (tool.mix.iceG > 0) return { ok: false, code: 'SCOOP_FULL' };
        const g = Math.min(src.mix.iceG, Math.round(randRange(w, 50, 70)));
        src.mix.iceG -= g;
        tool.mix.iceG += g;
        tool.temperatureC = 0;
        emit(w, 'ICE_SCOOPED', 'INFO', { params: { g } });
        return { ok: true };
      }
      if (liquidVolumeMl(src.mix, ctx.subs) > 0.05 && particulateMassG(src.mix) < 0.01) {
        emit(w, 'SPATULA_LIQUID', 'WARN', { vesselId: src.id });
        return { ok: false, code: 'SPATULA_LIQUID' };
      }
      if (mixMassG(tool.mix) > 0.6) {
        emit(w, 'SPATULA_FULL', 'WARN');
        return { ok: false, code: 'SPATULA_FULL' };
      }
      const g = clamp(p.spatulaNominalG * randRange(w, 0.75, 1.3), p.spatulaMinG, p.spatulaMaxG);
      const part = takeSolids(src.mix, g);
      if (mixMassG(part) <= 0) return { ok: false, code: 'SOURCE_EMPTY' };
      if (tool.lastLoaded && tool.lastLoaded !== dominantSubstance(part) && mixMassG(tool.mix) > 0) {
        bump(w, 'dirtySpatulaUse');
        tool.mixedLoad = true;
      }
      addRaw(tool, part);
      tool.lastLoaded = dominantSubstance(part);
      bump(w, `scoop:${src.id}`);
      emit(w, 'SCOOP', 'INFO', { vesselId: src.id, params: { g: Math.round(mixMassG(part) * 1000) / 1000 } });
      return { ok: true };
    }
    case 'tapTool': {
      const tool = w.vessels[cmd.toolId];
      if (!tool) return { ok: false };
      const load = mixMassG(tool.mix);
      const residue = tool.type === 'SPATULA' ? p.spatulaResidueG : 0;
      if (load <= residue * 1.05) return { ok: false, code: 'TOOL_EMPTY' };
      const target = cmd.targetId ? w.vessels[cmd.targetId] ?? null : null;
      if (target && tool.type === 'SPATULA') {
        const refusal = tubeRefusesLoad(w, target, tool.mix, ctx.labelToSubstance);
        if (refusal) return { ok: false, code: refusal };
      }
      const part = takeAllFraction(tool.mix, (load - residue) / load);
      if (target) {
        if (target.type === 'TEST_TUBE' && target.mix.waterG > 0.1 && !hasSample(target.mix)) target.waterBeforeSample = true;
        // Contaminación cruzada: restos de otra sustancia en la espátula. Una muestra que ya es mezcla (carbón + KNO₃)
        // tiene varios componentes, pero no está contaminada.
        const kinds = Object.keys(mixAmounts(part)).filter((k) => k !== 'H2O' && (mixAmounts(part)[k as keyof Amounts] ?? 0) > 0.0015);
        if (tool.mixedLoad && kinds.length > 1) {
          bump(w, 'crossContamination');
          emit(w, 'CROSS_CONTAMINATION', 'WARN', { vesselId: target.id });
        }
      }
      tool.mixedLoad = false;
      deliver(w, part, tool.temperatureC, target, ctx, 'tool-miss');
      emit(w, 'TOOL_DEPOSIT', 'INFO', { vesselId: target?.id, params: { g: Math.round(mixMassG(part) * 1000) / 1000 } });
      return { ok: true };
    }
    case 'cleanTool': {
      const tool = w.vessels[cmd.toolId];
      const towel = w.vessels.towel;
      if (!tool) return { ok: false };
      const part = takeAllFraction(tool.mix, 1);
      if (towel) addRaw(towel, part);
      else spill(w, part, ctx, 'clean');
      tool.lastLoaded = null;
      tool.mixedLoad = false;
      bump(w, `clean:${tool.id}`);
      emit(w, 'TOOL_CLEANED', 'INFO', { vesselId: tool.id });
      return { ok: true };
    }
    case 'aspirate': {
      const tool = w.vessels[cmd.toolId];
      const src = w.vessels[cmd.sourceId];
      if (!tool || !src) return { ok: false };
      const srcVol = liquidVolumeMl(src.mix, ctx.subs);
      const room = tool.capacityMl - liquidVolumeMl(tool.mix, ctx.subs);
      const ml = Math.min(cmd.ml, room, srcVol);
      if (ml <= 0) return { ok: false, code: 'NOTHING' };
      addRaw(tool, takeLiquidFraction(src.mix, ml / srcVol, ctx.subs));
      tool.temperatureC = src.temperatureC;
      emit(w, 'ASPIRATE', 'INFO', { vesselId: src.id, params: { ml: Math.round(ml * 100) / 100 } });
      return { ok: true };
    }
    case 'dispenseDrops': {
      const tool = w.vessels[cmd.toolId];
      if (!tool) return { ok: false };
      const vol = liquidVolumeMl(tool.mix, ctx.subs);
      if (vol <= 0) return { ok: false, code: 'TOOL_EMPTY' };
      const ml = Math.min(vol, cmd.drops * p.dropMl * randRange(w, 0.92, 1.08));
      const target = cmd.targetId ? w.vessels[cmd.targetId] ?? null : null;
      if (target?.type === 'TEST_TUBE' && target.mix.waterG > 0.1 && !hasSample(target.mix)) target.waterBeforeSample = true;
      deliver(w, takeLiquidFraction(tool.mix, ml / vol, ctx.subs), tool.temperatureC, target, ctx, 'drop-miss');
      bump(w, 'dropsDispensed', cmd.drops);
      return { ok: true };
    }
    case 'addIce': {
      const bucket = w.vessels.ice_bucket;
      if (!bucket || bucket.mix.iceG <= 0) return { ok: false, code: 'NO_ICE' };
      const g = Math.min(cmd.g, bucket.mix.iceG);
      bucket.mix.iceG -= g;
      const part = emptyMixture();
      part.iceG = g;
      const target = cmd.targetId ? w.vessels[cmd.targetId] ?? null : null;
      deliver(w, part, 0, target, ctx, 'ice-miss');
      bump(w, 'iceAddedG', g);
      emit(w, 'ICE_ADDED', 'INFO', { vesselId: target?.id, params: { g } });
      return { ok: true };
    }
    case 'label': {
      const v = w.vessels[cmd.vesselId];
      if (!v) return { ok: false };
      v.label = cmd.label;
      emit(w, 'LABELED', 'INFO', { vesselId: v.id, params: { label: cmd.label ?? '' } });
      return { ok: true };
    }
    case 'fan': {
      const v = w.vessels[cmd.vesselId];
      if (!v) return { ok: false };
      v.fanned = true;
      bump(w, 'fanned');
      emit(w, 'FAN_RESULT', 'INFO', { vesselId: v.id, params: { odor: odorOf(v, ctx.subs) } });
      return { ok: true };
    }
    case 'sniffDirect': {
      bump(w, 'directSniff');
      emit(w, 'SAFETY_DIRECT_SNIFF', 'ALERT', { vesselId: cmd.vesselId });
      return { ok: false, code: 'DIRECT_SNIFF' };
    }
    case 'setHotplatePower': {
      const hp = w.devices.hotplate;
      const pct = clamp(Math.round(cmd.pct), 0, 100);
      const v = vesselOnHotplate(w);
      if (pct > 0 && v) {
        if (isDryCarbonNitrate(w, v)) {
          criticalBlock(w, 'DRY_MIXTURE_HEAT', v.id);
          return { ok: false, code: 'DRY_MIXTURE_HEAT' };
        }
      }
      // B4: subida brusca con un líquido apreciable sobre la placa (calentamiento de la mezcla).
      if (pct - hp.powerPct > 40 && v && liquidVolumeMl(v.mix, ctx.subs) > 3) {
        bump(w, 'abruptPowerJumps');
        emit(w, 'ABRUPT_POWER', 'WARN', { params: { from: hp.powerPct, to: pct } });
        if (v && v.temperatureC > 70 && liquidVolumeMl(v.mix, ctx.subs) > 0.5) {
          spill(w, takeAllFraction(v.mix, 0.04), ctx, 'bumping');
          bump(w, 'bumpingEvents');
          emit(w, 'BUMPING', 'ALERT', { vesselId: v.id });
        }
      }
      hp.lastPowerPct = hp.powerPct;
      hp.lastPowerChangeS = w.timeS;
      hp.powerPct = pct;
      return { ok: true };
    }
    case 'tareBalance': {
      w.devices.balance.tareOffsetG = grossBalanceG(w);
      bump(w, 'tareCount');
      w.evidence.lastTareGross = Math.round(grossBalanceG(w) * 100) / 100;
      emit(w, 'BALANCE_TARED', 'INFO');
      return { ok: true };
    }
    case 'insertProbe': {
      const prev = w.devices.probe.vesselId;
      if (prev && prev !== cmd.vesselId) filmToAdhered(w, w.vessels[prev], 0.02, ctx);
      w.devices.probe.vesselId = cmd.vesselId;
      w.devices.probe.touchingBottom = cmd.touchingBottom;
      if (cmd.vesselId) bump(w, `probeIn:${cmd.vesselId}`);
      return { ok: true };
    }
    case 'insertRod': {
      if (w.devices.rod.integrity === 0) return { ok: false, code: 'ROD_BROKEN' };
      const prev = w.devices.rod.vesselId;
      if (prev && prev !== cmd.vesselId) filmToAdhered(w, w.vessels[prev], 0.03, ctx);
      w.devices.rod.vesselId = cmd.vesselId;
      return { ok: true };
    }
    case 'scrape': {
      const v = w.vessels[cmd.vesselId];
      if (!v) return { ok: false };
      if (w.devices.rod.vesselId !== v.id) return { ok: false, code: 'ROD_NOT_IN_VESSEL' };
      v.cryst.scrapeBoostUntilS = w.timeS + 12;
      bump(w, 'scrapes');
      emit(w, 'SCRAPE', 'INFO', { vesselId: v.id });
      return { ok: true };
    }
    case 'foldPaper': {
      const v = w.vessels[cmd.paperId];
      if (!v?.filter) return { ok: false };
      const next = foldNext(v.filter.fold, cmd.action);
      v.filter.fold = (next === 'MISALIGNED' ? 'HALF' : next) as typeof v.filter.fold;
      if (next === 'MISALIGNED') w.evidence[`misfold:${v.id}`] = 1;
      if (v.filter.fold === 'CONE_OK' && w.evidence[`misfold:${v.id}`]) v.filter.fold = 'CONE_BAD';
      v.filter.foldedCorrectly = v.filter.fold === 'CONE_OK';
      emit(w, 'PAPER_FOLD', 'INFO', { vesselId: v.id, params: { fold: v.filter.fold } });
      return { ok: true };
    }
    case 'tearPaper': {
      const v = w.vessels[cmd.paperId];
      if (!v?.filter) return { ok: false };
      if (!v.filter.torn) {
        v.filter.torn = true;
        bump(w, 'paperTorn');
        emit(w, 'PAPER_TORN', 'ALERT', { vesselId: v.id });
      }
      return { ok: true };
    }
    case 'setDripTarget': {
      const f = w.vessels[cmd.funnelId];
      if (!f?.funnel) return { ok: false };
      f.funnel.dripTargetId = cmd.targetId;
      f.funnel.stemTouchingWall = cmd.touchingWall;
      return { ok: true };
    }
    case 'setRingHeight':
      w.devices.stand.ringHeightCm = clamp(cmd.cm, 6, 30);
      return { ok: true };
    case 'setStandAssembled':
      w.devices.stand.assembled = cmd.assembled;
      return { ok: true };
    case 'cover': {
      const v = w.vessels[cmd.vesselId];
      if (!v) return { ok: false };
      if (cmd.mode === 'SEALED') {
        bump(w, 'sealAttempts');
        emit(w, 'COVER_SEALED_BLOCKED', 'WARN', { vesselId: v.id });
        return { ok: false, code: 'SEALED' };
      }
      v.cover = cmd.mode;
      emit(w, 'COVER_SET', 'INFO', { vesselId: v.id, params: { mode: cmd.mode } });
      return { ok: true };
    }
    case 'setHandMode':
      w.devices.hand.mode = cmd.mode;
      return { ok: true };
    case 'cleanSpill': {
      if (w.bench.spillMl <= 0) return { ok: false, code: 'NO_SPILL' };
      w.bench.spillMl = 0;
      w.bench.spillOpen = false;
      if (w.safety.block?.code === 'SPILL_UNCLEANED') w.safety.block = null;
      bump(w, 'spillsCleaned');
      emit(w, 'SPILL_CLEANED', 'INFO');
      return { ok: true };
    }
    case 'sweepShards': {
      const i = w.bench.shards.indexOf(cmd.id);
      if (i >= 0) w.bench.shards.splice(i, 1);
      const v = w.vessels[cmd.id];
      if (v) v.support = 'glass_waste';
      if (cmd.id === 'rod') {
        const pr = w.props.rod;
        if (pr) pr.support = 'glass_waste';
      }
      emit(w, 'SHARDS_SWEPT', 'INFO', { vesselId: cmd.id });
      return { ok: true };
    }
    case 'requestSpare': {
      if (cmd.kind === 'ROD') {
        // Varilla nueva: solo si la anterior se rompió y sus restos ya se barrieron.
        if (w.devices.rod.integrity === 1) return { ok: false, code: 'NOT_BROKEN' };
        if (w.bench.shards.includes('rod')) return { ok: false, code: 'SWEEP_FIRST' };
        w.devices.rod = { vesselId: null, integrity: 1 };
        const rod = w.props.rod;
        if (rod) {
          rod.support = 'bench';
          rod.pose = { x: 186, y: 6, z: 0, rotationRad: 0 };
        }
        w.spareCount++;
        bump(w, 'sparesRequested');
        emit(w, 'SPARE_ISSUED', 'INFO', { vesselId: 'rod', params: { kind: cmd.kind } });
        return { ok: true, id: 'rod' };
      }
      w.spareCount++;
      const id = `${cmd.kind.toLowerCase()}_spare_${w.spareCount}`;
      const SPARE_POSE: Record<string, [number, number]> = {
        FILTER_PAPER: [318, 50], TEST_TUBE: [104, 52], BEAKER: [236, 52],
        GRADUATED_CYLINDER: [126, 8], PORCELAIN_DISH: [346, 8], FUNNEL: [252, 8],
      };
      const [sx, sy] = SPARE_POSE[cmd.kind];
      // El origen del embudo es el vértice del cono: apoya sobre su espiga de 4 cm.
      const pose = { x: sx, y: sy, z: cmd.kind === 'FUNNEL' ? 4 : 0, rotationRad: 0 };
      const [a, b] = VESSEL_DEFAULTS[cmd.kind].tareG;
      const v = makeVessel({ id, type: cmd.kind, pose, support: 'bench' }, p.ambientC, Math.round(randRange(w, a, b) * 100) / 100);
      v.spare = true;
      w.vessels[id] = v;
      bump(w, 'sparesRequested');
      emit(w, 'SPARE_ISSUED', 'INFO', { vesselId: id, params: { kind: cmd.kind } });
      return { ok: true, id };
    }
    case 'acknowledgeIncident': {
      if (!w.safety.halted) return { ok: false };
      if (w.devices.hotplate.powerPct > 0) return { ok: false, code: 'PLATE_ON' };
      w.safety.halted = false;
      emit(w, 'INCIDENT_ACK', 'INFO', { params: { incident: w.safety.incident ?? '' } });
      return { ok: true };
    }
  }
  return { ok: false };
}

function endPour(w: World, pr: World['pours'][string]): void {
  emit(w, 'POUR_END', 'INFO', {
    vesselId: pr.sourceId,
    params: {
      target: pr.targetId ?? '',
      ml: Math.round(pr.transferredMl * 100) / 100,
      g: Math.round(pr.transferredSolidG * 1000) / 1000,
      spilledMl: Math.round(pr.spilledMl * 100) / 100,
      guided: pr.guided,
    },
  });
  delete w.pours[pr.sourceId];
}

// ───────────────────────────── Paso fijo ─────────────────────────────

function applyPours(w: World, dt: number, ctx: SimContext): void {
  for (const sid of Object.keys(w.pours)) {
    const pr = w.pours[sid];
    const src = w.vessels[sid];
    if (!src || src.integrity === 0) {
      delete w.pours[sid];
      continue;
    }
    const tgt = pr.targetId ? w.vessels[pr.targetId] ?? null : null;
    const lv = liquidVolumeMl(src.mix, ctx.subs);
    if (pr.liquidRateMlS > 0 && lv > 0) {
      const ml = Math.min(pr.liquidRateMlS * dt, lv);
      const part = takeLiquidFraction(src.mix, ml / lv, ctx.subs);
      if (tgt?.type === 'FUNNEL') {
        bump(w, 'funnelPourMl', ml);
        if (pr.guided) bump(w, 'funnelPourGuidedMl', ml);
        // Lo que llega de la mezcla (no de la piseta): el agua de humedecer el papel no inicia el lavado.
        if (src.type !== 'WASH_BOTTLE') bump(w, 'mixtureFunnelPourMl', ml);
        w.evidence.maxFunnelPourRate = Math.max(w.evidence.maxFunnelPourRate ?? 0, pr.liquidRateMlS);
        const paper = tgt.funnel?.paperId ? w.vessels[tgt.funnel.paperId] : null;
        if (paper?.filter && !paper.filter.torn && pr.liquidRateMlS > w.params.filter.tearRateThresholdMlS && !pr.guided) {
          if (rand(w) < 0.25 * dt) {
            paper.filter.torn = true;
            bump(w, 'paperTorn');
            emit(w, 'PAPER_TORN', 'ALERT', { vesselId: paper.id, params: { cause: 'fast-pour' } });
          }
        }
        if (pr.liquidRateMlS > w.params.filter.tearRateThresholdMlS) bump(w, 'fastFunnelPourS', dt);
      }
      if (!tgt) pr.spilledMl += ml;
      pr.transferredMl += ml;
      bump(w, `pour:${sid}->${pr.targetId ?? 'bench'}`, ml);
      // Lavado del residuo (después de empezar a filtrar la mezcla): al embudo o al vaso que contuvo el carbón.
      if (src.type === 'WASH_BOTTLE' && (w.evidence.mixtureFunnelPourMl ?? 0) > 0.5 && tgt && (tgt.type === 'FUNNEL' || (tgt.type === 'BEAKER' && tgt.maxParticulateG > 0.2))) {
        bump(w, 'washMl', ml);
        bump(w, `washMl:${tgt.id}`, ml);
      }
      deliver(w, part, src.temperatureC, tgt, ctx, 'pour-miss');
    }
    if (pr.solidRateGS > 0) {
      const solids = particulateMassG(src.mix);
      const pourable = pourableSolidsG(src);
      if (pourable > 0) {
        const g = Math.min(pr.solidRateGS * dt, pourable);
        const part = takeSolids(src.mix, g);
        const lv2 = liquidVolumeMl(src.mix, ctx.subs);
        if (lv2 > 0 && lv2 < 1.5) {
          const liq = takeLiquidFraction(src.mix, Math.min(1, g / solids), ctx.subs);
          addMix(part, liq);
        }
        pr.transferredSolidG += g;
        deliver(w, part, src.temperatureC, tgt, ctx, 'solid-miss');
      }
    }
    // Piseta: agua aplicada a un papel (humedecer) o a un vaso (lavado).
    if (src.type === 'WASH_BOTTLE' && tgt) bump(w, `wash:${tgt.id}`, pr.liquidRateMlS * dt);
  }
}

const DT_EVAPORATING_G_PER_S = 0.0015;

/** Sólido que puede salir al verter (descuenta lo adherido a la pared). */
export function pourableSolidsG(v: Vessel): number {
  const stick = (WALL_STICK_FRACTION[v.type] ?? 0) * v.maxParticulateG;
  return Math.max(0, particulateMassG(v.mix) - stick);
}

function insolubleParticulateG(v: Vessel, subs: SubstanceTable): number {
  let g = 0;
  for (const k of Object.keys(v.mix.solid) as (keyof typeof v.mix.solid)[]) {
    if (subs[k].waterBehavior !== 'SOLUBLE') g += v.mix.solid[k] ?? 0;
  }
  return g;
}

export function stepMut(w: World, ctx: SimContext): void {
  const p = w.params;
  const dt = p.dtS;
  bathHeatIn.clear();
  if (!w.safety.halted) {
    stepHotplate(w, dt);
    applyPours(w, dt, ctx);
  } else {
    stepHotplate(w, dt);
  }

  const nucleiJitter = hashRange(w.seed, 'nuclei', 0.8, 1.25);
  const dissolveJitter = hashRange(w.seed, 'dissolve', 0.9, 1.1);
  const bath = w.vessels.bath;

  for (const id of Object.keys(w.vessels)) {
    const v = w.vessels[id];
    if (v.integrity === 0 || v.support === 'glass_waste' || v.type === 'BATH') continue;
    const onPlate = v.support === 'hotplate';
    const inBath = v.support === 'bath' && bath && bath.integrity === 1 ? bath : null;
    const th = stepVesselThermal(w, v, dt, ctx.subs, { onPlate, inBath });
    const lv = liquidVolumeMl(v.mix, ctx.subs);
    const insol = v.type === 'WEIGH_PAPER' || v.type === 'VIAL' ? particulateMassG(v.mix) : insolubleParticulateG(v, ctx.subs);
    if (insol > v.maxParticulateG) v.maxParticulateG = insol;

    if (onPlate && lv > 0.5 && v.temperatureC > 40) {
      if (v.agitation > 0.2) bump(w, `heatStirredS:${v.id}`, dt);
      else bump(w, `heatUnstirredS:${v.id}`, dt);
      w.evidence[`maxT:${v.id}`] = Math.max(w.evidence[`maxT:${v.id}`] ?? 0, v.temperatureC);
    }
    if (th.boiling) bump(w, `boilS:${v.id}`, dt);
    if (onPlate && th.evaporatedG / dt > DT_EVAPORATING_G_PER_S) bump(w, v.cover === 'PARTIAL' ? `coveredEvapS:${v.id}` : `openEvapS:${v.id}`, dt);

    // Salpicaduras (ebullición, depósito pastoso).
    const sr = splashRatePerS(v, p, th.boiling, v.agitation) * dt;
    if (sr > 0) {
      const part = takeAllFraction(v.mix, sr);
      bump(w, `splashG:${v.id}`, mixMassG(part));
      spill(w, part, ctx, 'splash');
    }
    // Agitación brusca: salpica y puede romper la varilla.
    if (v.agitation > 0.95 && lv > 0) {
      const f = v.agitationTool === 'SHAKE' ? 0.004 : v.agitationTool === 'SWIRL' ? 0.003 : 0.001;
      const fill = lv / v.capacityMl;
      if (v.agitationTool === 'ROD' || fill > 0.45) {
        spill(w, takeAllFraction(v.mix, f * dt), ctx, 'rough-agitation');
        bump(w, 'roughAgitationS', dt);
      }
      if (v.agitationTool === 'ROD' && w.devices.rod.vesselId === v.id && rand(w) < 0.01 * dt) {
        w.devices.rod.integrity = 0;
        w.devices.rod.vesselId = null;
        if (!w.bench.shards.includes('rod')) w.bench.shards.push('rod');
        bump(w, 'breakages');
        emit(w, 'ROD_BROKEN', 'ALERT', { vesselId: v.id });
      }
    }
    if (v.agitation > 0.15) {
      v.agitatedTotalS += dt;
      v.lastAgitatedS = w.timeS;
    }
    stepSuspension(v, dt, ctx.subs);
    stepDissolution(v, dt, ctx.subs, p, dissolveJitter);
    const hasKno3 = (v.mix.dissolved.KNO3 ?? 0) > 0 || (v.mix.crystals?.massG ?? 0) > 0;
    if (hasKno3) {
      stepCrystallization(v, dt, ctx.subs, p, {
        evaporating: th.evaporatedG / dt > DT_EVAPORATING_G_PER_S, timeS: w.timeS, nucleiJitter,
      });
    }
  }

  for (const id of Object.keys(w.vessels)) {
    const v = w.vessels[id];
    if (v.type === 'BATH' && v.integrity === 1) stepBath(w, v, dt, ctx.subs);
  }

  // D6 — entrada de agua del baño si su nivel supera el borde del vaso.
  if (bath && bath.integrity === 1) {
    const inside = Object.values(w.vessels).filter((v) => v.support === 'bath' && v.integrity === 1);
    const displaced = inside.reduce((s, v) => s + Math.min(40, v.capacityMl * 0.8), 0);
    const levelCm = (liquidVolumeMl(bath.mix, ctx.subs) + bath.mix.iceG * 1.09 + displaced) / 78.5;
    w.evidence.bathLevelCm = Math.round(levelCm * 100) / 100;
    if (levelCm > p.bathOverflowLevelCm) {
      for (const v of inside) {
        const bl = liquidVolumeMl(bath.mix, ctx.subs);
        if (bl <= 0) break;
        // Entra agua hasta que el recipiente se llena (niveles igualados).
        const room = v.capacityMl * 0.9 - liquidVolumeMl(v.mix, ctx.subs);
        if (room <= 0) continue;
        const ml = Math.min(bl, room, 0.6 * dt);
        const part = takeLiquidFraction(bath.mix, ml / bl, ctx.subs);
        pourInto(v, part, bath.temperatureC, ctx.subs, p.cpWater);
        bump(w, `bathIngressMl:${v.id}`, ml);
        if (!w.evidence[`once:ingress:${v.id}`]) {
          w.evidence[`once:ingress:${v.id}`] = 1;
          emit(w, 'BATH_WATER_INGRESS', 'ALERT', { vesselId: v.id });
        }
      }
    }
  }

  for (const id of Object.keys(w.vessels)) {
    const v = w.vessels[id];
    if (v.type === 'FUNNEL') stepFiltration(w, v, dt, ctx);
  }

  stepSafety(w, dt);
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
}

/** Versión pura: no modifica `w`. */
export function step(w: World, ctx: SimContext): { state: World; events: World['events'] } {
  const s = structuredClone(w);
  const n = s.events.length;
  stepMut(s, ctx);
  return { state: s, events: s.events.slice(n) };
}

/** Versión pura del despacho: `dispatch(command) → nuevo estado + eventos` (§3.3). */
export function dispatch(w: World, cmd: Command, ctx: SimContext): { state: World; events: World['events']; result: DispatchResult } {
  const s = structuredClone(w);
  const n = s.events.length;
  const result = dispatchMut(s, cmd, ctx);
  return { state: s, events: s.events.slice(n), result };
}

/** Ejecuta `seconds` de simulación (pruebas y avance sin render). */
export function runFor(w: World, seconds: number, ctx: SimContext): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepMut(w, ctx);
}

export function vesselLiquidMl(w: World, id: string, ctx: SimContext): number {
  const v = w.vessels[id];
  return v ? liquidVolumeMl(v.mix, ctx.subs) : 0;
}

export function reagentConsumed(w: World, id: string): Amounts {
  const init = w.reagentInitial[id] ?? {};
  const now = w.vessels[id] ? mixAmounts(w.vessels[id].mix) : {};
  const out: Amounts = {};
  for (const k of Object.keys(init) as (keyof Amounts)[]) out[k] = (init[k] ?? 0) - (now[k] ?? 0);
  return out;
}

export function particulate(w: World, id: string): number {
  return w.vessels[id] ? particulateMassG(w.vessels[id].mix) : 0;
}
