/**
 * Mundo de la Práctica 1 — instrumentación y densidades: paso fijo determinista (§6).
 *
 * - Agua: la magnitud conservada es la masa; el volumen sale de V = m/ρ(T) con ρ(T) del §3.4. Cada traslado lleva
 *   masa y temperatura; los derrames van a la bandeja, a la mesada o al platillo (nunca desaparecen); las películas de
 *   las paredes se evaporan de a poco y quedan registradas (§6.1).
 * - Pipeta TD de 25 mL con pera: aspirar (con la punta dentro o fuera del agua), sobrepasar la marca, ajustar el
 *   menisco con el ojo real (paralaje) y la pipeta vertical o no, limpiar la gota exterior, drenar en el receptor con
 *   su tiempo de escurrido y su residuo calibrado, soplar o no. Lo que llega al Erlenmeyer es una «alícuota» con su
 *   serie (ambiente o fría) y su técnica.
 * - Balanza granataria: encendido con calentamiento (deriva de cero en el escenario S02), nivel, tara por sesión,
 *   estabilidad y carga real del platillo (recipientes, películas, agua derramada).
 * - Probeta: nivel = (agua + clavos sumergidos + aire atrapado)/sección; lectura a la mitad de la división, con paralaje
 *   por la altura real del ojo, inclinación y oscilación tras una entrada brusca; rebalse a la bandeja.
 * - Calibrador: distancia entre superficies según orientación (oblicua), fuerza y cero; termómetro de primer orden
 *   con profundidad y contacto con la pared.
 */
import type { P01Command, P01DispatchResult, PpeItem } from './commands';
import type { NailPiece, P01Object, P01Params, P01World, Pose, Reading01, WaterBody, WaterSample } from './types';
import { hashRandom } from '../core/rng';
import { bump01, emit01, err01, flag01, gauss01, latch01, rearm01 } from './events';
import { CYL_AREA, GEO01, PIP_STEM_AREA } from './geometry';
import { rhoWaterClamped } from '../density-models/water';
import { cylinderVolumeCm3 } from '../density-models/solids';
import { quantize } from '../metrology/uncertainty';
import { balanceIndication, newAnalyticalBalance, stepAnalyticalBalance } from '../instruments/analytical-balance';

export { emit01, latch01, rearm01, bump01, flag01, err01 } from './events';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sc = (w: P01World, s: string) => w.scenarios.includes(s);

/** Escenarios docentes (§10). */
export const S = {
  BALANCE_OFFLEVEL: 'P01-S01_balance_offlevel',
  BALANCE_ZERO: 'P01-S02_balance_zero',
  PIPETTE_FILM: 'P01-S03_pipette_film',
  PIPETTE_AIR: 'P01-S04_pipette_air',
  THERMO_BIAS: 'P01-S05_thermometer_bias',
  THERMO_SLOW: 'P01-S06_thermometer_slow',
  BATH_WEAK: 'P01-S07_cold_bath_weak',
  CALIPER_ZERO: 'P01-S08_caliper_zero',
  NONIDEAL_CYLINDER: 'P01-S09_nonideal_cylinder',
  NAILS_AIR: 'P01-S10_nails_air',
  NAILS_MIXED: 'P01-S11_nails_mixed',
  SPILL_SENSITIVE: 'P01-S12_spill_sensitive',
} as const;

export interface DensityWorldSpec {
  objects: P01Object[];
  fluids: WaterBody[];
  nails: NailPiece[];
  scenarios: string[];
  mode: string;
}

/** Agua retenida como película al vaciar un recipiente de vidrio (g). */
const HOLD_G: Record<string, number> = { erlenmeyer150: 0.25, erlenmeyer150b: 0.25, cylinder50: 0.2, waste01: 0, spillTray01: 0, benchSpill: 0 };
/** Caudal de vertido por recipiente (mL/s a 30° sobre el umbral). */
const POUR_K: Record<string, number> = { waterRoom01: 9, waterCold01: 9, cylinder50: 4, erlenmeyer150: 7, erlenmeyer150b: 7, waste01: 12 };
/** Sobrepasar la marca más de esto (mL) lleva el agua a la pera. */
const FILLER_LIMIT_ML = (GEO01.pipette25.topZ - GEO01.pipette25.markZ) * PIP_STEM_AREA;
/** Paralaje de la pipeta: mL por cm de ojo fuera del menisco (vástago estrecho). */
const PIP_PARALLAX_ML_PER_CM = 0.004;
/** Calentamiento de la balanza antes de que aparezca la deriva del escenario S02 (s). */
const BALANCE_WARMUP_S = 8;
/** Largo de la punta sensora del termómetro (cm): con menos inmersión, la sonda ve en parte el aire. */
const THERMO_TIP_CM = 0.5;

// ─────────────────────────── Creación ───────────────────────────

export function createDensityWorld(spec: DensityWorldSpec, seed: number, params: P01Params): P01World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, P01Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const fluids: Record<string, WaterBody> = {};
  for (const f of spec.fluids) fluids[f.id] = { ...f };
  const tol = params.pipetteToleranceHalfWidthMl;
  const w: P01World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects, fluids, pours: {},
    pipette: {
      nominalMl: params.pipetteNominalMl, trueDeliverMl: params.pipetteNominalMl + (hashRandom(seed, 'pip') - 0.5) * 2 * tol * 0.8,
      residualMl: params.pipetteTipResidualMl, filmExtraMl: has(S.PIPETTE_FILM) ? 0.12 : 0, fillerAttached: false, fillerContaminated: false,
      waterG: 0, tempC: params.roomTempC, airMl: 0, externalDropG: 0, bubbleSeeded: false, sourceId: null, suction01: 0, release01: 0,
      adjusted: false, adjustBiasMl: 0, drainS: 0, afterFilmMl: 0, delivering: false, blown: false, residueG: 0, residueTempC: params.roomTempC,
      residueFrom: null, rinsedWith: null,
    },
    nails: spec.nails.map((n) => ({ ...n })),
    cylinder: { trappedAirMl: 0, unsettledUntil: 0 },
    solid: {
      diameterCm: params.solidCylinderDiameterCm, heightCm: params.solidCylinderHeightCm, rhoGPerCm3: params.cylinderMaterialDensityGPerMl,
      ovality: has(S.NONIDEAL_CYLINDER) ? 0.005 : 0,
    },
    thermometer: {
      displayedC: params.roomTempC, biasC: has(S.THERMO_BIAS) ? 0.8 : 0, tauS: has(S.THERMO_SLOW) ? params.thermometerResponseTauS * 3 : params.thermometerResponseTauS,
      resolutionC: params.thermometerResolutionC, where: 'air', depthCm: 0, touchingWall: false,
    },
    caliper: { zeroBiasCm: has(S.CALIPER_ZERO) ? 0.008 : 0, target: 'none', angleDeg: 0, force01: 0.4, orientationDeg: 0, apertureCm: 5, zeroChecked: false },
    balance: {
      ...newAnalyticalBalance({ levelErrorDeg: has(S.BALANCE_OFFLEVEL) ? 2.5 : 0, doorsOpen: false }),
      powered: false, panIds: [], zeroBiasG: has(S.BALANCE_ZERO) ? 0.05 : 0, panWetG: 0, tareSession: 0, zeroedEmpty: false, removedUnreadAt: null,
    },
    bath: { tempC: has(S.BATH_WEAK) ? 13 : params.coldBathTargetC },
    ledger: { discardedG: 0, evaporatedG: 0 },
    wetObjects: {},
    balanceOnAt: null,
    samples: [], readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, incident: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { waterMassG: 0, metalMassG: 0, regularSolidMassG: 0 },
  };
  w.initialTotals = { waterMassG: waterTotal(w), metalMassG: nailsTotal(w), regularSolidMassG: solidMassG(w) };
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

/** Volumen (mL) del agua de un recipiente a su temperatura. */
export const fluidMl = (f: WaterBody) => f.waterG / rhoWaterClamped(f.tempC);

/** Agua de la pipeta (mL) a su temperatura. */
export const pipetteMl = (w: P01World) => w.pipette.waterG / rhoWaterClamped(w.pipette.tempC);

/** Volumen que contiene la pipeta a la marca (lo que entrega + residuo TD + película extra). */
export const pipetteMarkMl = (w: P01World) => w.pipette.trueDeliverMl + w.pipette.residualMl + w.pipette.filmExtraMl;

/** Posición del menisco respecto de la marca (mL; + = por encima). */
export const pipetteAboveMarkMl = (w: P01World) => (w.pipette.waterG > 0 ? pipetteMl(w) + w.pipette.airMl - pipetteMarkMl(w) : -pipetteMarkMl(w));

/** Masa total de agua del sistema (g), en todos sus lugares (§6.1). */
export function waterTotal(w: P01World): number {
  let g = 0;
  for (const f of Object.values(w.fluids)) g += f.waterG + f.wetG;
  const p = w.pipette;
  g += p.waterG + p.externalDropG + p.residueG;
  g += w.balance.panWetG + w.ledger.discardedG + w.ledger.evaporatedG;
  for (const v of Object.values(w.wetObjects)) g += v;
  return g;
}

export const nailsTotal = (w: P01World) => w.nails.reduce((s, n) => s + n.massG, 0);

/** Masa del cilindro metálico (g): sección elíptica si la pieza no es perfectamente circular (S09). */
export function solidMassG(w: P01World): number {
  const s = w.solid;
  return cylinderVolumeCm3(s.diameterCm, s.heightCm) * (1 - s.ovality ** 2) * s.rhoGPerCm3;
}

/** Totales que deben conservarse exactamente (balance de la §6.1). */
export function conservedTotals(w: P01World): Record<string, number> {
  return { water: waterTotal(w), metal: nailsTotal(w), solid: solidMassG(w) };
}

const nailsAt = (w: P01World, where: string) => w.nails.filter((n) => n.where === where);
const nailsMassAt = (w: P01World, where: string) => nailsAt(w, where).reduce((s, n) => s + n.massG, 0);
const nailsVolAt = (w: P01World, where: string) => nailsAt(w, where).reduce((s, n) => s + n.massG / n.rhoGPerMl, 0);

/** Fracción sumergida de los clavos en la probeta: el agua llena los huecos del montón (≈ 55 %). */
export function nailsSubmergedFraction(w: P01World): number {
  const vn = nailsVolAt(w, 'cylinder50');
  if (vn <= 0) return 1;
  const vw = fluidMl(w.fluids.cylinder50);
  return clamp(vw / (vn * (0.55 / 0.45)), 0, 1);
}

/** Volumen aparente bajo el menisco de la probeta (mL): agua + clavos sumergidos + aire atrapado. */
export function cylinderApparentMl(w: P01World): number {
  const vn = nailsVolAt(w, 'cylinder50');
  return fluidMl(w.fluids.cylinder50) + vn * nailsSubmergedFraction(w) + w.cylinder.trappedAirMl;
}

/** Altura del menisco de la probeta sobre su base (cm). */
export const cylinderLevelCm = (w: P01World) => GEO01.cylinder50.floor + cylinderApparentMl(w) / CYL_AREA;

/** Masa (g) de un objeto puesto sobre el platillo. */
export function objectMassG(w: P01World, id: string): number {
  const wet = w.wetObjects[id] ?? 0;
  const f = w.fluids[id];
  if (f) return f.glassG + f.waterG + f.wetG + nailsMassAt(w, id) + (w.wetObjects[`nails:${id}`] ?? 0);
  switch (id) {
    case 'watchGlass01': {
      const solidOn = w.objects.solidCylinder01?.support === 'watchGlass01' ? solidMassG(w) + (w.wetObjects.solidCylinder01 ?? 0) : 0;
      return w.params.watchGlassMassG + wet + solidOn;
    }
    case 'weighBoat01':
      return w.params.weighBoatMassG + wet + nailsMassAt(w, 'weighBoat01') + (w.wetObjects['nails:weighBoat01'] ?? 0);
    case 'nailsBatch01':
      return 14.6 + nailsMassAt(w, 'nailsBatch01');
    case 'solidCylinder01':
      return solidMassG(w) + wet;
    default:
      return 30;
  }
}

/** Carga real del platillo (g), con el agua derramada sobre él. */
export const panLoadG = (w: P01World) => w.balance.panIds.reduce((s, id) => s + objectMassG(w, id), 0) + w.balance.panWetG;

/** Deriva del cero tras el calentamiento (escenario S02). */
const zeroDrift = (w: P01World) => (w.balanceOnAt !== null && w.timeS - w.balanceOnAt > BALANCE_WARMUP_S ? w.balance.zeroBiasG : 0);

/** Lo que muestra la pantalla (g), con la resolución del instrumento. */
export const balanceDisplayG = (w: P01World) => (w.balance.powered ? quantize(w.balance.shownG, w.params.balance.resolutionG) : NaN);

/** Temperatura que ve la sonda del termómetro (°C). */
function thermoTarget(w: P01World): number {
  const t = w.thermometer;
  const room = w.params.roomTempC;
  const f = w.fluids[t.where];
  if (!f || f.waterG < 0.5) return room;
  const depthOk = levelCmOf(w, f.id);
  const immersed = Math.min(t.depthCm, depthOk);
  // Profundidad insuficiente: la sonda sigue en parte en el aire; tocando la pared, ve el vidrio (≈ ambiente).
  const shallow = immersed < THERMO_TIP_CM ? clamp(1 - immersed / THERMO_TIP_CM, 0, 1) * 0.6 : 0;
  let T = f.tempC * (1 - shallow) + room * shallow;
  if (t.touchingWall) T = T * 0.75 + room * 0.25;
  return T;
}

/** Altura del agua en un recipiente (cm sobre su fondo interior). */
export function levelCmOf(w: P01World, id: string): number {
  const f = w.fluids[id];
  if (!f) return 0;
  if (id === 'cylinder50') return cylinderApparentMl(w) / CYL_AREA;
  if (id === 'erlenmeyer150' || id === 'erlenmeyer150b') {
    const E = GEO01.erlenmeyer150;
    return Math.min(E.neckZ, fluidMl(f) / (Math.PI * E.baseR * E.baseR * 0.8));
  }
  return fluidMl(f) / Math.max(0.1, f.areaCm2);
}

const latestSample = (w: P01World): WaterSample | null => w.samples[w.samples.length - 1] ?? null;
const openSample = (w: P01World): WaterSample | null => {
  const s = latestSample(w);
  return s && s.endedS === null ? s : null;
};

// ─────────────────────────── Comandos ───────────────────────────

const BEFORE_PPE = new Set<P01Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_INCIDENT = new Set<P01Command['type']>(['acknowledge', 'teacherStop', 'cleanObject', 'cleanSpill', 'inspect', 'setPose', 'readThermometer', 'setAspirate', 'setPipetteRelease']);
const BALANCE_OPS = new Set<P01Command['type']>(['tare', 'readBalance']);

export function dispatchP01(w: P01World, cmd: P01Command): P01DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.incident && !DURING_INCIDENT.has(cmd.type)) return { ok: false, code: 'INCIDENT' };
  if (w.safety.block?.code === 'PAN_WET' && BALANCE_OPS.has(cmd.type)) return { ok: false, code: 'PAN_WET' };
  switch (cmd.type) {
    case 'equipPpe':
      w.safety.ppe[cmd.item] = cmd.on;
      return { ok: true };
    case 'startWork':
      return startWork(w);
    case 'inspect':
      return inspect(w, cmd.target);
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    case 'powerBalance':
      return powerBalance(w, cmd.on);
    case 'levelBalance':
      w.balance.levelErrorDeg = 0;
      w.balance.disturbedAt = w.timeS;
      flag01(w, 'balanceLeveled');
      emit01(w, 'BALANCE_LEVELED', 'INFO');
      return { ok: true };
    case 'tare':
      return tare(w);
    case 'readBalance':
      return readBalance(w);
    case 'attachFiller':
      w.pipette.fillerAttached = cmd.on;
      if (w.objects.pipetteFiller) w.objects.pipetteFiller.support = cmd.on ? 'pipette25' : w.objects.pipetteFiller.support === 'pipette25' ? 'bench' : w.objects.pipetteFiller.support;
      if (cmd.on) flag01(w, 'fillerAttached');
      return { ok: true };
    case 'setAspirate':
      return setAspirate(w, cmd.suction01);
    case 'setPipetteRelease':
      w.pipette.release01 = clamp(cmd.release01, 0, 1);
      if (w.pipette.release01 > 0) w.pipette.suction01 = 0;
      return { ok: true };
    case 'adjustMeniscus':
      return adjustMeniscus(w, cmd.eyeDzCm);
    case 'wipeTip':
      return wipeTip(w, cmd.method);
    case 'blowOut':
      return blowOut(w);
    case 'rinsePipette':
      return rinsePipette(w);
    case 'setPour':
      return setPour(w, cmd.sourceId, cmd.targetId, cmd.tiltDeg);
    case 'stopPour': {
      const pr = w.pours[cmd.sourceId];
      if (!pr) return { ok: true };
      delete w.pours[cmd.sourceId];
      emit01(w, 'POUR_DONE', 'INFO', { g: Math.round(pr.transferredG * 100) / 100, from: cmd.sourceId, to: pr.targetId ?? 'bench' });
      return { ok: true, value: pr.transferredG };
    }
    case 'squeeze':
      return squeeze(w, cmd.targetId, cmd.drops);
    case 'readVolume':
      return readVolume(w, cmd.instrumentId, cmd.eyeDzCm);
    case 'setThermometerInsertion': {
      const t = w.thermometer;
      if (t.where === 'air') return { ok: false, code: 'NOT_INSERTED' };
      t.depthCm = clamp(cmd.depthCm, 0, 12);
      t.touchingWall = cmd.touchingWall;
      return { ok: true };
    }
    case 'readThermometer':
      return readThermometer(w);
    case 'transferNails':
      return transferNails(w, cmd.from, cmd.to, cmd.count, cmd.gentle, cmd.tool);
    case 'tapCylinder': {
      const c = w.cylinder;
      if (c.trappedAirMl > 0.005) emit01(w, 'AIR_RELEASED', 'INFO');
      c.trappedAirMl *= 0.2;
      c.unsettledUntil = Math.max(c.unsettledUntil, w.timeS + 0.8);
      flag01(w, 'cylinderTapped');
      return { ok: true };
    }
    case 'setCaliper':
      return setCaliper(w, cmd.target, cmd.angleDeg, cmd.force01, cmd.orientationDeg);
    case 'readCaliper':
      return readCaliper(w);
    case 'cleanObject':
      return cleanObject(w, cmd.objectId, cmd.action);
    case 'cleanSpill':
      return cleanSpill(w, cmd.where);
    case 'emptyInto':
      return emptyInto(w, cmd.sourceId, cmd.targetId);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

// ─────────────────────────── Seguridad y reconocimiento ───────────────────────────

const PPE_ERR: Record<PpeItem, [string, string]> = {
  goggles: ['ppe_goggles', 'PPE_GOGGLES_MISSING'],
  coat: ['ppe_coat', 'PPE_COAT_MISSING'],
  shoes: ['ppe_shoes', 'PPE_SHOES_MISSING'],
  hair: ['hair_untied', 'HAIR_UNTIED'],
};

function startWork(w: P01World): P01DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bump01(w, `err:${PPE_ERR[k][0]}`);
      emit01(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flag01(w, 'ppe');
  emit01(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

/** Lo que muestra inspeccionar cada instrumento (§5.A): escalas, aforo, cero, nivel, daño. */
function inspect(w: P01World, target: string): P01DispatchResult {
  flag01(w, `inspected:${target}`);
  const p = w.params;
  switch (target) {
    case 'balance01':
      emit01(w, 'INSPECT_BALANCE', 'INFO', { res: p.balance.resolutionG, cap: p.balance.capacityG });
      if (w.balance.levelErrorDeg > 0.5) emit01(w, 'BALANCE_UNLEVEL', 'WARN');
      break;
    case 'cylinder50':
      emit01(w, 'INSPECT_CYLINDER', 'INFO', { cap: p.graduatedCylinderCapacityMl, div: p.graduatedCylinderDivisionMl });
      break;
    case 'pipette25':
      emit01(w, 'INSPECT_PIPETTE', 'INFO', { ml: p.pipetteNominalMl, tol: p.pipetteToleranceHalfWidthMl });
      if (w.pipette.filmExtraMl > 0) emit01(w, 'PIPETTE_FILM_FOUND', 'WARN');
      break;
    case 'thermometer01':
      emit01(w, 'INSPECT_THERMO', 'INFO', { res: p.thermometerResolutionC });
      if (w.thermometer.biasC !== 0) emit01(w, 'THERMO_BIAS_FOUND', 'WARN', { c: w.thermometer.biasC });
      break;
    case 'caliper01':
      emit01(w, 'INSPECT_CALIPER', 'INFO', { res: p.caliperResolutionCm });
      break;
    case 'erlenmeyer150':
      emit01(w, 'INSPECT_ERLEN', 'INFO');
      break;
    default:
      if (w.objects[target]?.damaged) emit01(w, 'DAMAGED_GLASS_FOUND', 'WARN', { obj: target });
      else emit01(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

/** Objetos sueltos alrededor de la balanza (§9.1, E005): con tres o más, no se acopla nada allí. */
function clutterNearBalance(w: P01World, exclude: string): number {
  const b = w.objects.balance01?.pose;
  if (!b) return 0;
  return Object.values(w.objects).filter((o) => o.id !== exclude && o.movable && o.support === 'bench' && Math.hypot(o.pose.x - b.x, o.pose.y - b.y) < 15).length;
}

function setPose(w: P01World, id: string, pose: Pose, support?: string): P01DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prev = o.support;
  if (support && support !== prev) {
    if (o.damaged && (support === 'pan' || support === 'pipette25')) {
      err01(w, 'damaged_glass', 'DAMAGED_GLASS', 'ALERT', { obj: id });
      return { ok: false, code: 'DAMAGED_GLASS' };
    }
    if (support === 'pan' && clutterNearBalance(w, id) >= 3) {
      err01(w, 'workbench_clutter', 'WORKBENCH_CLUTTER', 'WARN');
      return { ok: false, code: 'CLUTTER' };
    }
    // Platillo de la balanza.
    if (prev === 'pan') {
      const b = w.balance;
      b.panIds = b.panIds.filter((x) => x !== id);
      b.disturbedAt = w.timeS;
      b.stable = false;
      b.quietS = 0;
      if (!w.evidence[`__panRead:${id}`]) b.removedUnreadAt = w.timeS;
    }
    if (support === 'pan') {
      const b = w.balance;
      if (!b.panIds.includes(id)) b.panIds.push(id);
      b.disturbedAt = w.timeS;
      b.stable = false;
      b.quietS = 0;
      w.evidence[`__panRead:${id}`] = 0;
      b.removedUnreadAt = null;
    }
    // Pipeta: dónde está la punta.
    if (id === 'pipette25') {
      const pip = w.pipette;
      if (w.fluids[support]?.id && w.objects[support]?.damaged) {
        err01(w, 'damaged_glass', 'DAMAGED_GLASS', 'ALERT', { obj: support });
        return { ok: false, code: 'DAMAGED_GLASS' };
      }
      if (prev !== support) {
        pip.suction01 = 0;
        // Al salir del agua queda una gota adherida por FUERA de la punta (agua del depósito, no de la pipeta).
        const res = w.fluids[prev];
        if (isReservoir(prev) && res && pip.waterG > 0.5 && pip.externalDropG < 0.03) {
          const g = Math.min(0.03 - pip.externalDropG, res.waterG);
          res.waterG -= g;
          pip.externalDropG += g;
        }
        if (pip.delivering && prev === openSample(w)?.flaskId) finishDelivery(w);
      }
    }
    if (id === 'thermometer01') {
      const t = w.thermometer;
      t.where = w.fluids[support] ? support : 'air';
      t.depthCm = w.fluids[support] ? 3 : 0;
      t.touchingWall = false;
    }
    if (id === 'pipetteFiller') w.pipette.fillerAttached = support === 'pipette25';
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  return { ok: true };
}

const isReservoir = (id: string) => id === 'waterRoom01' || id === 'waterCold01';

// ─────────────────────────── Balanza ───────────────────────────

function powerBalance(w: P01World, on: boolean): P01DispatchResult {
  const b = w.balance;
  if (on === b.powered) return { ok: true };
  b.powered = on;
  if (on) {
    // Al encender pone en cero lo que haya en el platillo.
    w.balanceOnAt = w.timeS;
    b.tareG = balanceIndication({ ...b, tareG: 0 }, panLoadG(w), w.params.balance, w.timeS);
    b.shownG = 0;
    b.refG = 0;
    b.taredAt = w.timeS;
    b.tareSession += 1;
    b.zeroedEmpty = false;
    b.disturbedAt = w.timeS;
    w.evidence.__tareLoad = panLoadG(w);
    flag01(w, 'balanceOn');
    emit01(w, 'BALANCE_ON', 'INFO');
  }
  return { ok: true };
}

function tare(w: P01World): P01DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const load = panLoadG(w);
  b.tareG = balanceIndication({ ...b, tareG: 0 }, load + zeroDrift(w), w.params.balance, w.timeS) + b.noiseG;
  b.shownG = 0;
  b.refG = 0;
  b.taredAt = w.timeS;
  b.disturbedAt = w.timeS;
  b.tareSession += 1;
  w.evidence.__tareLoad = load;
  const container = b.panIds.filter((x) => x !== 'thermometer01');
  if (!b.panIds.length) {
    if (w.balanceOnAt !== null && w.timeS - w.balanceOnAt > BALANCE_WARMUP_S) b.zeroedEmpty = true;
    flag01(w, 'taredEmpty');
  }
  if (container.length > 1) err01(w, 'tara_with_extra_load', 'TARE_EXTRA_LOAD', 'WARN', { n: container.length });
  if (container.some((x) => (w.fluids[x]?.waterG ?? 0) > 0.5)) flag01(w, 'taredWithWater');
  w.evidence.__tarePan = container.length === 1 ? hashId(container[0]) : 0;
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value: 0, unit: 'g', resolution: w.params.balance.resolutionG, uncertainty: w.params.balance.uncertaintyG,
    sourceObjectIds: [...b.panIds], qualityFlags: ['TARE', ...(b.stable ? [] : ['UNSTABLE'])], trueValue: 0, tareSession: b.tareSession, target: container[0],
  });
  flag01(w, 'tared');
  // La tara perturba la indicación: el indicador de estabilidad se reinicia (no queda «estable» de antes).
  b.stable = false;
  b.quietS = 0;
  return { ok: true, id: r.id, value: 0 };
}

/** Identificador numérico estable de un objeto (para guardarlo en la evidencia, que solo admite números). */
function hashId(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000003;
  return h;
}

function readBalance(w: P01World): P01DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const p = w.params;
  const load = panLoadG(w);
  const flags: string[] = [];
  const shown = quantize(b.shownG, p.balance.resolutionG);
  const ids = [...b.panIds];
  if (!b.stable) {
    flags.push('UNSTABLE');
    err01(w, 'mass_unstable', 'MASS_UNSTABLE');
  }
  if (b.levelErrorDeg > 0.5) {
    flags.push('UNLEVELED');
    if (ids.length) err01(w, 'balance_unleveled', 'BALANCE_UNLEVELED_READ');
  }
  if (zeroDrift(w) !== 0 && !b.zeroedEmpty && ids.length) {
    flags.push('NOT_ZEROED');
    err01(w, 'balance_zero_bias_ignored', 'ZERO_BIAS_IGNORED');
  }
  const wet = ids.filter((id) => (w.wetObjects[id] ?? 0) > 0.01 || ((w.fluids[id]?.wetG ?? 0) > 0.05 && (w.fluids[id]?.waterG ?? 0) < 0.5));
  if (wet.length) {
    flags.push('WET');
    err01(w, 'wet_weigh_vessel', 'WET_VESSEL_WEIGHED', 'WARN', { obj: wet[0] });
  }
  if (b.panWetG > 0.005) flags.push('PAN_WET');
  if (!ids.length && b.removedUnreadAt !== null && w.timeS - b.removedUnreadAt < 6) {
    flags.push('EMPTY_PAN');
    err01(w, 'load_removed_early', 'LOAD_REMOVED_EARLY');
  }
  // Erlenmeyer con agua sin tarar con él: la «masa del agua» incluye el recipiente (E011).
  const flask = ids.find((id) => id === 'erlenmeyer150' || id === 'erlenmeyer150b');
  let sampleIndex: number | undefined;
  if (flask && w.fluids[flask].waterG > 0.5) {
    if (w.evidence.__tarePan !== hashId(flask)) {
      flags.push('NO_TARE');
      err01(w, 'tara_missing', 'TARE_MISSING');
    }
    const s = [...w.samples].reverse().find((x) => x.flaskId === flask);
    sampleIndex = s?.index;
  }
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value: shown, unit: 'g', resolution: p.balance.resolutionG, uncertainty: p.balance.uncertaintyG,
    // `trueValue`: carga física neta respecto de la última tara (sin ruido, nivel ni deriva).
    sourceObjectIds: ids, qualityFlags: flags, trueValue: load - (w.evidence.__tareLoad ?? 0), tareSession: b.tareSession,
    target: ids[0], sampleIndex,
    load: {
      nails: ids.reduce((n, id) => n + nailsAt(w, id).length, 0),
      solid: ids.includes('solidCylinder01') || (ids.includes('watchGlass01') && w.objects.solidCylinder01?.support === 'watchGlass01'),
      waterG: ids.reduce((g, id) => g + (w.fluids[id]?.waterG ?? 0), 0),
    },
  });
  if (ids.includes('weighBoat01') && (r.load?.nails ?? 0) > 0 && !flags.includes('UNSTABLE')) w.evidence.__boatNailsWeighed = 1;
  if (b.stable) for (const id of ids) w.evidence[`__panRead:${id}`] = 1;
  if (!flags.includes('UNSTABLE')) emit01(w, 'MASS_READ', 'INFO', { g: shown });
  return { ok: !flags.includes('UNSTABLE'), id: r.id, value: shown };
}

// ─────────────────────────── Lecturas ───────────────────────────

function addReading(w: P01World, r: Omit<Reading01, 'id' | 't' | 'tick'>): Reading01 {
  const n = w.readingOrder.length + 1;
  const prefix = r.kind === 'mass' ? 'm' : r.kind === 'volume' ? 'v' : r.kind === 'temp' ? 't' : 'h';
  const reading: Reading01 = { ...r, id: `${prefix}${n}`, t: w.timeS, tick: w.tick };
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

function readVolume(w: P01World, inst: 'cylinder50' | 'pipette25' | 'erlenmeyer150', eyeDzCm: number): P01DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  const atEye = Math.abs(eyeDzCm) < 1;
  if (inst === 'erlenmeyer150') {
    // Las marcas de un Erlenmeyer son aproximadas (±5 %): no sirve para aforar.
    const v = fluidMl(w.fluids.erlenmeyer150);
    flags.push('NON_VOLUMETRIC');
    err01(w, 'erlenmeyer_as_volumetric', 'ERLEN_NOT_VOLUMETRIC');
    const r = addReading(w, { kind: 'volume', instrumentId: inst, value: quantize(v, 5), unit: 'mL', resolution: 5, uncertainty: 7.5, sourceObjectIds: [inst], qualityFlags: flags, trueValue: v, eyeDzCm, target: inst });
    return { ok: true, id: r.id, value: r.value };
  }
  if (inst === 'pipette25') {
    const pip = w.pipette;
    if (pip.waterG < 1) return { ok: false, code: 'EMPTY' };
    const bias = clamp(eyeDzCm * PIP_PARALLAX_ML_PER_CM, -0.05, 0.05);
    const seen = pipetteAboveMarkMl(w) - bias;
    if (!atEye) flags.push('PARALLAX');
    const atMark = Math.abs(seen) <= 0.02;
    if (!atMark) flags.push('NOT_AT_MARK');
    const r = addReading(w, {
      kind: 'volume', instrumentId: inst, value: atMark ? p.pipetteNominalMl : quantize(p.pipetteNominalMl + seen, 0.01), unit: 'mL', resolution: 0.01,
      uncertainty: p.pipetteToleranceHalfWidthMl, sourceObjectIds: [inst], qualityFlags: flags, trueValue: pip.trueDeliverMl + pipetteAboveMarkMl(w), eyeDzCm, target: inst,
    });
    emit01(w, atEye ? 'VOLUME_READ' : 'PARALLAX', atEye ? 'INFO' : 'WARN', { ml: r.value, inst });
    return { ok: atEye, id: r.id, value: r.value, code: atEye ? undefined : 'PARALLAX' };
  }
  // Probeta.
  const o = w.objects.cylinder50;
  const div = p.graduatedCylinderDivisionMl;
  const trueMl = cylinderApparentMl(w);
  let seen = trueMl;
  const nNails = nailsAt(w, 'cylinder50').length;
  if (o.support === 'hand' || Math.abs(o.pose.rotationRad) > 0.03) {
    flags.push('TILTED');
    err01(w, 'cylinder_not_vertical', 'CYLINDER_TILTED');
    seen += 0.6 + Math.abs(o.pose.rotationRad) * 4;
  }
  if (w.timeS < w.cylinder.unsettledUntil) {
    flags.push('MOVING');
    err01(w, 'meniscus_unstable', 'LEVEL_MOVING');
    seen += 0.6 * Math.sin(w.timeS * 9);
  }
  if (!atEye) {
    flags.push('PARALLAX');
    err01(w, 'cylinder_parallax', 'PARALLAX', 'WARN', { inst });
    seen += clamp(eyeDzCm * 0.12, -p.maxParallaxDivisions * div, p.maxParallaxDivisions * div);
  }
  if (nNails > 0) {
    if (!w.evidence.__vInitialBeforeNails) {
      flags.push('LATE_INITIAL');
      err01(w, 'initial_read_too_late', 'INITIAL_READ_LATE');
    }
    if (nailsSubmergedFraction(w) < 0.98) {
      flags.push('PARTIAL');
      err01(w, 'nails_partially_submerged', 'NAILS_PARTIAL');
    }
    if (w.evidence.__boatNailsWeighed && nailsAt(w, 'weighBoat01').length + nailsAt(w, 'bench').length > 0) {
      flags.push('MISSING_NAIL');
      err01(w, 'nails_mass_mismatch', 'NAIL_LEFT_OUT');
    }
    if (w.cylinder.trappedAirMl > 0.05) flags.push('AIR');
  } else if (fluidMl(w.fluids.cylinder50) > 5 && !flags.includes('TILTED') && !flags.includes('MOVING')) {
    w.evidence.__vInitialBeforeNails = 1;
  }
  if (w.evidence.__cylOverflow) flags.push('OVERFLOW');
  const value = quantize(Math.max(0, seen), div / 2);
  const r = addReading(w, {
    kind: 'volume', instrumentId: inst, value, unit: 'mL', resolution: div / 2, uncertainty: p.graduatedCylinderReadHalfWidthMl, sourceObjectIds: [inst],
    qualityFlags: flags, trueValue: trueMl, eyeDzCm, target: inst, nailsInCylinder: nNails,
  });
  if (atEye) emit01(w, 'VOLUME_READ', 'INFO', { ml: value, inst });
  return { ok: atEye && !flags.includes('TILTED'), id: r.id, value, code: atEye ? undefined : 'PARALLAX' };
}

function readThermometer(w: P01World): P01DispatchResult {
  const t = w.thermometer;
  const target = thermoTarget(w);
  const flags: string[] = [];
  const value = quantize(t.displayedC + t.biasC, t.resolutionC);
  if (Math.abs(target - t.displayedC) > 0.15) {
    flags.push('UNSTABLE');
    err01(w, 'thermometer_unstable', 'THERMO_UNSTABLE');
  }
  if (t.where === 'air') flags.push('AIR');
  else {
    if (Math.min(t.depthCm, levelCmOf(w, t.where)) < THERMO_TIP_CM) {
      flags.push('SHALLOW');
      err01(w, 'thermometer_shallow', 'THERMO_SHALLOW');
    }
    if (t.touchingWall) {
      flags.push('WALL');
      err01(w, 'thermometer_wall_contact', 'THERMO_WALL');
    }
  }
  let sampleIndex: number | undefined;
  const f = w.fluids[t.where];
  if (t.where === 'erlenmeyer150' && f) {
    const s = [...w.samples].reverse().find((x) => x.flaskId === 'erlenmeyer150');
    sampleIndex = s?.index;
    if (s && s.series === 'cold' && f.tempC - s.tempAtDeliveryC > 1.5) err01(w, 'cold_sample_warmed', 'COLD_SAMPLE_WARMED');
  }
  const r = addReading(w, {
    kind: 'temp', instrumentId: 'thermometer01', value, unit: '°C', resolution: t.resolutionC, uncertainty: w.params.thermometerStandardUncertaintyC,
    sourceObjectIds: [t.where], qualityFlags: flags, trueValue: f ? f.tempC : w.params.roomTempC, target: t.where, sampleIndex,
  });
  if (!flags.includes('UNSTABLE')) emit01(w, 'TEMP_READ', 'INFO', { c: value });
  return { ok: !flags.includes('UNSTABLE'), id: r.id, value };
}

// ─────────────────────────── Pipeta ───────────────────────────

function setAspirate(w: P01World, suction01: number): P01DispatchResult {
  const pip = w.pipette;
  const s = clamp(suction01, 0, 1);
  if (s > 0 && !pip.fillerAttached) {
    // Nunca se aspira con la boca (§11): se rechaza y se explica.
    emit01(w, 'MOUTH_PIPETTING', 'CRITICAL');
    bump01(w, 'err:mouth_pipetting');
    return { ok: false, code: 'NO_FILLER' };
  }
  if (s > 0 && pip.fillerContaminated) return { ok: false, code: 'FILLER_CONTAMINATED' };
  pip.suction01 = s;
  if (s > 0) pip.release01 = 0;
  return { ok: true };
}

function adjustMeniscus(w: P01World, eyeDzCm: number): P01DispatchResult {
  const pip = w.pipette;
  if (pip.waterG < 1) return { ok: false, code: 'EMPTY' };
  const above = pipetteAboveMarkMl(w);
  if (above < 0) return { ok: false, code: 'BELOW_MARK' };
  const tilt = Math.abs(w.objects.pipette25.pose.rotationRad);
  // El menisco se baja hasta donde el ojo lo ve en la marca: con el ojo fuera de nivel o la pipeta inclinada queda corrido.
  const bias = clamp(eyeDzCm * PIP_PARALLAX_ML_PER_CM, -0.05, 0.05) + (tilt > 0.05 ? Math.min(0.12, tilt * 0.6) : 0);
  const drainMl = Math.max(0, above - bias);
  releaseFromPipette(w, drainMl, where(w));
  pip.adjusted = true;
  pip.adjustBiasMl = bias;
  if (Math.abs(eyeDzCm) >= 1 && Math.abs(bias) > 0.01) err01(w, 'pipette_parallax', 'PARALLAX', 'WARN', { inst: 'pipette25' });
  if (tilt > 0.05) err01(w, 'pipette_not_vertical', 'PIPETTE_TILTED');
  if (Math.abs(eyeDzCm) < 1 && tilt <= 0.05) flag01(w, 'pipetteAdjusted');
  emit01(w, 'MENISCUS_ADJUSTED', 'INFO');
  return { ok: true };
}

/** Dónde cae lo que sale de la punta: el recipiente donde está, o un derrame. */
function where(w: P01World): string | null {
  const s = w.objects.pipette25.support;
  return w.fluids[s] ? s : null;
}

function wipeTip(w: P01World, method: 'outside' | 'orifice'): P01DispatchResult {
  const pip = w.pipette;
  w.ledger.discardedG += pip.externalDropG;
  pip.externalDropG = 0;
  if (method === 'orifice' && pip.waterG > 0.5) {
    // El papel en la punta absorbe agua de adentro por capilaridad.
    const g = Math.min(pip.waterG, 0.06 * rhoWaterClamped(pip.tempC));
    pip.waterG -= g;
    w.ledger.discardedG += g;
    err01(w, 'pipette_tip_wicked', 'TIP_WICKED');
  } else flag01(w, 'tipWiped');
  return { ok: true };
}

function blowOut(w: P01World): P01DispatchResult {
  const pip = w.pipette;
  if (pip.waterG <= 0) return { ok: false, code: 'EMPTY' };
  const into = where(w);
  releaseFromPipette(w, pipetteMl(w) + 1, into, true);
  if (into === openSample(w)?.flaskId || into === 'erlenmeyer150') {
    pip.blown = true;
    err01(w, 'pipette_blowout', 'PIPETTE_BLOWN');
  }
  return { ok: true };
}

function rinsePipette(w: P01World): P01DispatchResult {
  const pip = w.pipette;
  const src = w.objects.pipette25.support;
  if (!isReservoir(src)) return { ok: false, code: 'NOT_IN_RESERVOIR' };
  if (!pip.fillerAttached) return setAspirate(w, 1);
  const f = w.fluids[src];
  const g = Math.min(f.waterG, 3);
  // Enjuagar: 3 mL del mismo depósito recorren la pipeta y van al desecho; los restos anteriores salen con ellos.
  f.waterG -= g;
  moveWater(w, 'waste01', g, f.tempC);
  moveWater(w, 'waste01', pip.residueG, pip.residueTempC);
  pip.residueG = 0;
  pip.residueFrom = src;
  pip.rinsedWith = src;
  flag01(w, 'pipetteRinsed');
  return { ok: true };
}

/** Saca agua de la pipeta hacia un recipiente o un derrame (mL de agua a la temperatura de la pipeta). */
function releaseFromPipette(w: P01World, ml: number, into: string | null, all = false): number {
  const pip = w.pipette;
  const rho = rhoWaterClamped(pip.tempC);
  const g = all ? pip.waterG : Math.min(pip.waterG, ml * rho);
  if (g <= 0) return 0;
  pip.waterG -= g;
  if (into) moveWater(w, into, g, pip.tempC);
  else spill(w, g, pip.tempC, w.objects.pipette25.pose, 'pipette25');
  if (pip.waterG < 1e-9) {
    pip.waterG = 0;
    pip.airMl = 0;
    pip.adjusted = false;
  }
  return g;
}

/** Inicia una alícuota cuando el agua de la pipeta empieza a caer en el Erlenmeyer (§5.B). */
function beginDelivery(w: P01World, flaskId: string) {
  const pip = w.pipette;
  const f = w.fluids[flaskId];
  const series: 'room' | 'cold' = pip.sourceId === 'waterCold01' ? 'cold' : 'room';
  const s: WaterSample = { index: w.samples.length + 1, series, sourceId: pip.sourceId ?? 'waterRoom01', flaskId, startedS: w.timeS, endedS: null, deliveredG: 0, tempAtDeliveryC: pip.tempC, flags: [] };
  w.samples.push(s);
  pip.delivering = true;
  pip.drainS = 0;
  pip.afterFilmMl = 0.05;
  const above = pipetteAboveMarkMl(w);
  if (above > 0.02) {
    s.flags.push('OVERFILL');
    err01(w, 'pipette_overfill', 'PIPETTE_OVERFILL');
  } else if (above < -0.02) {
    s.flags.push('UNDERFILL');
    err01(w, 'pipette_underfill', 'PIPETTE_UNDERFILL');
  }
  if (pip.airMl > 0.01) {
    s.flags.push('BUBBLE');
    err01(w, 'pipette_bubble', 'PIPETTE_BUBBLE');
  }
  if (!pip.adjusted) s.flags.push('NOT_ADJUSTED');
  if (pip.externalDropG > 0) {
    s.flags.push('DROP_OUTSIDE');
    moveWater(w, flaskId, pip.externalDropG, pip.tempC);
    s.deliveredG += pip.externalDropG;
    pip.externalDropG = 0;
  }
  if (f.waterG > 0.5) s.flags.push('FLASK_NOT_EMPTY');
  if (f.wetG > 0.05) {
    s.flags.push('WET_FLASK');
    err01(w, 'receiving_flask_wet', 'FLASK_WET');
  }
  if (w.evidence['latch:e:cross_sample_residue'] && pip.residueFrom !== pip.sourceId && pip.rinsedWith !== pip.sourceId) s.flags.push('CROSS_RESIDUE');
  emit01(w, 'DELIVERY_STARTED', 'INFO', { series });
}

/** Cierra la alícuota al sacar la pipeta del receptor: si no escurrió el tiempo calibrado, retuvo agua (E028). */
function finishDelivery(w: P01World) {
  const pip = w.pipette;
  const s = openSample(w);
  pip.delivering = false;
  pip.release01 = 0;
  if (!s) return;
  s.endedS = w.timeS;
  s.tempAtDeliveryC = w.fluids[s.flaskId].tempC;
  const left = pipetteMl(w) - pip.residualMl - pip.filmExtraMl;
  if ((left > 0.01 || pip.drainS < w.params.pipetteDrainTimeS * 0.8) && !pip.blown) {
    s.flags.push('DRAIN_EARLY');
    err01(w, 'pipette_drain_early', 'DRAIN_EARLY');
  }
  // Lo que quedó en la pipeta es residuo (de esta serie) que viajará a la siguiente si no se enjuaga.
  pip.residueG += pip.waterG;
  pip.residueTempC = pip.tempC;
  pip.residueFrom = pip.sourceId;
  pip.rinsedWith = null;
  pip.waterG = 0;
  pip.airMl = 0;
  pip.adjusted = false;
  pip.blown = false;
  flag01(w, `delivered:${s.series}`);
  emit01(w, 'DELIVERY_DONE', 'INFO', { series: s.series });
}

function stepPipette(w: P01World, dt: number) {
  const pip = w.pipette;
  const p = w.params;
  const tip = w.objects.pipette25.support;
  // Aspirar.
  if (pip.suction01 > 0 && pip.fillerAttached && !pip.fillerContaminated) {
    const ml = pip.suction01 * p.pipetteMaxFlowMlS * dt;
    const f = w.fluids[tip];
    const submerged = !!f && levelCmOf(w, tip) > 1.5 && fluidMl(f) > ml;
    if (submerged) {
      if (pip.waterG < 0.01) {
        // Primera toma: los restos de la serie anterior se mezclan con la nueva agua.
        pip.sourceId = tip;
        pip.adjusted = false;
        // Restos de otra serie sin enjuagar: la nueva muestra los arrastra (E031).
        if (pip.residueG > 0.001 && pip.residueFrom && pip.residueFrom !== tip && pip.rinsedWith !== tip) err01(w, 'cross_sample_residue', 'CROSS_RESIDUE');
        if (pip.residueG > 0) {
          pip.waterG += pip.residueG;
          pip.tempC = pip.residueTempC;
          pip.residueG = 0;
        }
        if (tip === 'waterCold01' && f.tempC > p.roomTempC - 5) err01(w, 'bath_not_ready', 'BATH_NOT_READY');
        if (sc(w, S.PIPETTE_AIR) && !pip.bubbleSeeded) {
          pip.airMl += 0.15;
          pip.bubbleSeeded = true;
        }
      }
      const g = Math.min(f.waterG, ml * rhoWaterClamped(f.tempC));
      f.waterG -= g;
      const total = pip.waterG + g;
      pip.tempC = total > 0 ? (pip.waterG * pip.tempC + g * f.tempC) / total : f.tempC;
      pip.waterG = total;
      // Aspirar muy fuerte también arrastra una burbuja.
      if (pip.suction01 > 0.95) pip.airMl = Math.min(0.3, pip.airMl + 0.02 * dt);
    } else {
      // Con líquido en la pipeta, el aire empuja la columna hacia la pera; vacía, queda solo una burbuja (el resto pasa).
      pip.airMl = pip.waterG > 0.01 ? pip.airMl + ml : Math.min(0.6, pip.airMl + ml);
      err01(w, 'pipette_air_aspiration', 'AIR_ASPIRATED');
    }
    if (pipetteAboveMarkMl(w) > FILLER_LIMIT_ML) {
      // El agua llegó a la pera: se contamina y no se usa hasta limpiarla.
      pip.fillerContaminated = true;
      pip.suction01 = 0;
      err01(w, 'filler_contaminated', 'FILLER_CONTAMINATED', 'CRITICAL');
      if (!w.safety.incident) w.safety.incident = { code: 'FILLER', since: w.timeS, needs: ['CLEAN_FILLER'], done: [] };
      // Lo que pasó a la pera queda allí (se desecha al limpiarla).
      const overG = Math.max(0, Math.min(pip.waterG, (pipetteAboveMarkMl(w) - FILLER_LIMIT_ML) * rhoWaterClamped(pip.tempC)));
      pip.waterG -= overG;
      w.ledger.discardedG += overG;
    }
  }
  // Descargar.
  if (pip.release01 > 0 && pip.waterG > 0) {
    const into = where(w);
    const flask = into === 'erlenmeyer150' || into === 'erlenmeyer150b' ? into : null;
    if (flask && !pip.delivering) beginDelivery(w, flask);
    const content = pipetteMl(w);
    const keep = pip.residualMl + pip.filmExtraMl + (pip.delivering ? pip.afterFilmMl : 0);
    const free = Math.max(0, content - keep);
    const ml = Math.min(pip.release01 * p.pipetteMaxFlowMlS * dt, free);
    if (ml > 0) {
      const g = releaseFromPipette(w, ml, into);
      const s = openSample(w);
      if (s && flask) s.deliveredG += g;
      if (!into) err01(w, 'pour_off_target', 'POUR_OFF_TARGET');
    }
    if (pip.delivering && flask) {
      pip.drainS += dt;
      // Terminado el chorro, la película de las paredes escurre (tiempo de escurrido calibrado).
      if (free <= 1e-6 && pip.release01 > 0.5) {
        const tau = Math.max(0.5, (p.pipetteDrainTimeS - p.pipetteNominalMl / p.pipetteMaxFlowMlS) / 3);
        const d = pip.afterFilmMl * Math.min(1, dt / tau);
        pip.afterFilmMl -= d;
        const g = releaseFromPipette(w, d, flask);
        const s = openSample(w);
        if (s) s.deliveredG += g;
      }
    }
    // El aire sale con el agua.
    if (pip.waterG <= 0) pip.airMl = 0;
  }
}

// ─────────────────────────── Agua ───────────────────────────

/** Agrega `g` de agua a `T` a un recipiente (mezcla de temperaturas por masa). */
function moveWater(w: P01World, toId: string, g: number, tC: number) {
  if (g <= 0) return;
  const to = w.fluids[toId];
  if (!to) {
    w.ledger.discardedG += g;
    return;
  }
  const total = to.waterG + g;
  to.tempC = total > 0 ? (to.waterG * to.tempC + g * tC) / total : tC;
  to.waterG = total;
  if (toId === 'cylinder50') checkCylinderOverflow(w);
}

/** Derrame: a la bandeja si cae sobre ella, al platillo si cae sobre la balanza, si no a la mesada (§11). */
function spill(w: P01World, g: number, tC: number, at: Pose, from: string) {
  const tray = w.objects.spillTray01?.pose;
  const bal = w.objects.balance01?.pose;
  const T = GEO01.spillTray;
  if (bal && Math.hypot(at.x - bal.x, at.y - bal.y) < GEO01.balance.panR + 1) {
    w.balance.panWetG += g;
    err01(w, 'wet_balance_pan', 'PAN_WET', 'ALERT');
    if (!w.safety.block) w.safety.block = { code: 'PAN_WET', since: w.timeS };
    return;
  }
  if (tray && Math.abs(at.x - tray.x) < T.w / 2 && Math.abs(at.y - tray.y) < T.d / 2) moveWater(w, 'spillTray01', g, tC);
  else {
    moveWater(w, 'benchSpill', g, tC);
    if (fluidMl(w.fluids.benchSpill) > w.params.spillAlertThresholdMl) latch01(w, 'benchSpill', 'BENCH_SPILL', 'WARN', { from });
  }
}

function checkCylinderOverflow(w: P01World) {
  const c = w.fluids.cylinder50;
  const over = cylinderApparentMl(w) - c.brimMl;
  if (over <= 0) return;
  const g = Math.min(c.waterG, over * rhoWaterClamped(c.tempC));
  c.waterG -= g;
  moveWater(w, 'spillTray01', g, c.tempC);
  w.evidence.__cylOverflow = 1;
  err01(w, 'cylinder_overflow', 'CYLINDER_OVERFLOW', 'ALERT');
}

function setPour(w: P01World, sourceId: string, targetId: string | null, tiltDeg: number): P01DispatchResult {
  const src = w.fluids[sourceId];
  if (!src || !POUR_K[sourceId]) return { ok: false, code: 'NOT_POURABLE' };
  if (targetId && !w.fluids[targetId]) return { ok: false, code: 'BAD_TARGET' };
  if (targetId && w.objects[targetId]?.damaged) {
    err01(w, 'damaged_glass', 'DAMAGED_GLASS', 'ALERT', { obj: targetId });
    return { ok: false, code: 'DAMAGED_GLASS' };
  }
  const pr = w.pours[sourceId];
  if (pr) {
    pr.targetId = targetId;
    pr.tiltDeg = tiltDeg;
  } else w.pours[sourceId] = { sourceId, targetId, tiltDeg, startedS: w.timeS, transferredG: 0 };
  return { ok: true };
}

function pourRateMlS(f: WaterBody, tiltDeg: number, k: number): number {
  const fill = clamp(fluidMl(f) / Math.max(1, f.capacityMl), 0, 1.2);
  const tilt0 = 100 - 88 * Math.min(1, fill);
  if (tiltDeg <= tilt0 || f.waterG <= 0) return 0;
  return k * ((tiltDeg - tilt0) / 30) ** 1.5;
}

/** Traslada agua entre recipientes; al vaciar un vidrio queda la película de sus paredes. */
function transferWater(w: P01World, fromId: string, toId: string | null, ml: number): number {
  const from = w.fluids[fromId];
  const hold = HOLD_G[fromId] ?? 0;
  const g = Math.min(ml * rhoWaterClamped(from.tempC), Math.max(0, from.waterG - hold));
  if (g <= 0) return 0;
  from.waterG -= g;
  if (from.waterG <= hold + 1e-9 && hold > 0) {
    from.wetG += from.waterG;
    from.waterG = 0;
  }
  if (toId) {
    // La probeta recibe por la boca; si viene de muy alto (S12) parte salpica a la bandeja.
    if (sc(w, S.SPILL_SENSITIVE) && toId === 'cylinder50') {
      const lost = g * 0.04;
      moveWater(w, toId, g - lost, from.tempC);
      spill(w, lost, from.tempC, w.objects.cylinder50.pose, fromId);
      err01(w, 'pour_off_target', 'POUR_OFF_TARGET');
    } else moveWater(w, toId, g, from.tempC);
  } else spill(w, g, from.tempC, w.objects[fromId]?.pose ?? { x: 0, y: 0, z: 0, rotationRad: 0 }, fromId);
  return g;
}

function stepPours(w: P01World, dt: number) {
  for (const pr of Object.values(w.pours)) {
    const src = w.fluids[pr.sourceId];
    const rate = pourRateMlS(src, pr.tiltDeg, POUR_K[pr.sourceId] ?? 6);
    if (rate <= 0) continue;
    pr.transferredG += transferWater(w, pr.sourceId, pr.targetId, rate * dt);
  }
}

function squeeze(w: P01World, targetId: string | null, drops: number): P01DispatchResult {
  const src = w.fluids.washBottle;
  const g = Math.min(src.waterG, Math.max(0, Math.round(drops)) * 0.05);
  if (g <= 0) return { ok: false, code: 'EMPTY' };
  src.waterG -= g;
  if (targetId && w.fluids[targetId]) moveWater(w, targetId, g, src.tempC);
  else spill(w, g, src.tempC, w.objects.washBottle.pose, 'washBottle');
  return { ok: true, value: g };
}

function emptyInto(w: P01World, sourceId: string, targetId: string): P01DispatchResult {
  const src = w.fluids[sourceId];
  if (!src || !w.fluids[targetId]) return { ok: false, code: 'BAD_TARGET' };
  const moved = transferWater(w, sourceId, targetId, fluidMl(src) + 1);
  if (sourceId === 'cylinder50') {
    w.cylinder.trappedAirMl = 0;
    w.evidence.__vInitialBeforeNails = 0;
    w.evidence.__cylOverflow = 0;
  }
  emit01(w, 'EMPTIED', 'INFO', { from: sourceId, to: targetId });
  return { ok: true, value: moved };
}

// ─────────────────────────── Clavos ───────────────────────────

function transferNails(w: P01World, from: string, to: string, count: number, gentle: boolean, tool: 'tongs' | 'hand'): P01DispatchResult {
  const pieces = nailsAt(w, from).slice(0, Math.max(0, Math.round(count)));
  if (!pieces.length) return { ok: false, code: 'NO_NAILS' };
  if (tool === 'hand') {
    latch01(w, 'sharpHand', 'NAILS_SHARP', 'WARN');
    bump01(w, 'warn:sharpHand');
  }
  // Los clavos mojados llevan su película de agua.
  const wetFrom = `nails:${from}`;
  const wetMove = (w.wetObjects[wetFrom] ?? 0) * (pieces.length / Math.max(1, nailsAt(w, from).length));
  if (from === 'cylinder50') {
    const c = w.fluids.cylinder50;
    const film = Math.min(c.waterG, 0.03 * pieces.length);
    c.waterG -= film;
    w.wetObjects[`nails:${to}`] = (w.wetObjects[`nails:${to}`] ?? 0) + film;
  } else if (wetMove > 0) {
    w.wetObjects[wetFrom] -= wetMove;
    if (to === 'cylinder50') moveWater(w, 'cylinder50', wetMove, w.params.roomTempC);
    else w.wetObjects[`nails:${to}`] = (w.wetObjects[`nails:${to}`] ?? 0) + wetMove;
  }
  for (const n of pieces) n.where = to;
  if (to === 'cylinder50') {
    const c = w.cylinder;
    const water = w.fluids.cylinder50;
    if (!gentle && water.waterG > 1) {
      // De golpe: el agua salpica a la bandeja y quedan burbujas entre los clavos (E043, E044).
      const g = Math.min(water.waterG, 0.25 * pieces.length * rhoWaterClamped(water.tempC));
      water.waterG -= g;
      moveWater(w, 'spillTray01', g, water.tempC);
      c.trappedAirMl += 0.1 * pieces.length;
      c.unsettledUntil = w.timeS + 4;
      err01(w, 'nails_splash', 'NAILS_SPLASH');
      err01(w, 'trapped_air', 'TRAPPED_AIR');
    } else {
      c.unsettledUntil = Math.max(c.unsettledUntil, w.timeS + 1.2);
      if (sc(w, S.NAILS_AIR) && water.waterG > 1) {
        c.trappedAirMl += 0.07 * pieces.length;
        latch01(w, 'airS10', 'TRAPPED_AIR', 'WARN');
        bump01(w, 'err:trapped_air');
      }
    }
    checkCylinderOverflow(w);
    flag01(w, 'nailsInCylinder');
    emit01(w, 'NAILS_IN', 'INFO', { n: pieces.length });
  }
  return { ok: true, value: pieces.length };
}

// ─────────────────────────── Calibrador ───────────────────────────

function setCaliper(w: P01World, target: 'none' | 'empty' | 'diameter' | 'height', angleDeg: number, force01: number, orientationDeg: number): P01DispatchResult {
  const c = w.caliper;
  const s = w.solid;
  c.target = target;
  c.angleDeg = clamp(angleDeg, -25, 25);
  c.force01 = clamp(force01, 0, 1);
  c.orientationDeg = orientationDeg;
  const cos = Math.cos((c.angleDeg * Math.PI) / 180);
  const squeezeCm = c.force01 > w.params.caliperContactForceThreshold ? (0.004 * (c.force01 - w.params.caliperContactForceThreshold)) / 0.3 : 0;
  if (target === 'none') c.apertureCm = 5;
  else if (target === 'empty') c.apertureCm = c.zeroBiasCm;
  else if (target === 'diameter') {
    const d = s.diameterCm * (1 + s.ovality * Math.cos((2 * orientationDeg * Math.PI) / 180));
    c.apertureCm = d / cos - squeezeCm + c.zeroBiasCm;
  } else c.apertureCm = s.heightCm / cos - squeezeCm + c.zeroBiasCm;
  return { ok: true };
}

function readCaliper(w: P01World): P01DispatchResult {
  const c = w.caliper;
  const p = w.params;
  if (c.target === 'none') return { ok: false, code: 'NOT_IN_CONTACT' };
  const flags: string[] = [];
  const value = quantize(c.apertureCm, p.caliperResolutionCm);
  if (c.target === 'empty') {
    c.zeroChecked = true;
    flag01(w, 'caliperZeroChecked');
    if (Math.abs(value) > 1e-9) emit01(w, 'CALIPER_ZERO_OFFSET', 'WARN', { cm: value });
  } else {
    if (Math.abs(c.angleDeg) > 1) {
      flags.push('OBLIQUE');
      if (c.target === 'diameter') err01(w, 'caliper_oblique', 'CALIPER_OBLIQUE');
      else err01(w, 'caliper_height_misaligned', 'CALIPER_HEIGHT_MISALIGNED');
    }
    if (c.force01 > p.caliperContactForceThreshold) {
      flags.push('FORCE');
      err01(w, 'caliper_excess_force', 'CALIPER_FORCE');
    }
    if (c.zeroBiasCm !== 0 && !c.zeroChecked) {
      flags.push('NOT_ZEROED');
      err01(w, 'caliper_zero_bias', 'CALIPER_ZERO_BIAS');
    }
  }
  const s = w.solid;
  const truth = c.target === 'diameter' ? s.diameterCm * (1 + s.ovality * Math.cos((2 * c.orientationDeg * Math.PI) / 180)) : c.target === 'height' ? s.heightCm : 0;
  const r = addReading(w, {
    kind: 'length', instrumentId: 'caliper01', value, unit: 'cm', resolution: p.caliperResolutionCm, uncertainty: p.caliperStandardUncertaintyCm,
    sourceObjectIds: c.target === 'empty' ? [] : ['solidCylinder01'], qualityFlags: flags, trueValue: truth, target: c.target,
    orientationDeg: c.target === 'diameter' ? c.orientationDeg : undefined,
  });
  emit01(w, 'LENGTH_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Limpieza y recuperación ───────────────────────────

function cleanObject(w: P01World, id: string, action: 'wash' | 'dry' | 'clean'): P01DispatchResult {
  if (id === 'pipetteFiller' && action === 'clean') {
    w.pipette.fillerContaminated = false;
    const inc = w.safety.incident;
    if (inc?.needs.includes('CLEAN_FILLER') && !inc.done.includes('CLEAN_FILLER')) inc.done.push('CLEAN_FILLER');
    emit01(w, 'FILLER_CLEANED', 'INFO');
    return { ok: true };
  }
  const f = w.fluids[id];
  if (action === 'wash') {
    const wash = w.fluids.washBottle;
    const g = Math.min(wash.waterG, 0.4);
    wash.waterG -= g;
    if (f) f.wetG += g;
    else w.wetObjects[id] = (w.wetObjects[id] ?? 0) + g;
    return { ok: true };
  }
  // Secar: la película va al papel (desecho registrado).
  if (f) {
    w.ledger.discardedG += f.wetG;
    f.wetG = 0;
  }
  w.ledger.discardedG += w.wetObjects[id] ?? 0;
  w.wetObjects[id] = 0;
  if (id === 'weighBoat01' || id === 'nailsBatch01') {
    w.ledger.discardedG += w.wetObjects[`nails:${id}`] ?? 0;
    w.wetObjects[`nails:${id}`] = 0;
  }
  flag01(w, `dried:${id}`);
  return { ok: true };
}

function cleanSpill(w: P01World, at: 'bench' | 'pan' | 'tray'): P01DispatchResult {
  if (at === 'pan') {
    w.ledger.discardedG += w.balance.panWetG;
    w.balance.panWetG = 0;
    w.balance.disturbedAt = w.timeS;
    if (w.safety.block?.code === 'PAN_WET') w.safety.block = null;
    emit01(w, 'PAN_CLEANED', 'INFO');
    return { ok: true };
  }
  const id = at === 'bench' ? 'benchSpill' : 'spillTray01';
  const f = w.fluids[id];
  w.ledger.discardedG += f.waterG + f.wetG;
  f.waterG = 0;
  f.wetG = 0;
  rearm01(w, 'benchSpill');
  emit01(w, 'SPILL_CLEANED', 'INFO');
  return { ok: true };
}

function acknowledge(w: P01World): P01DispatchResult {
  const inc = w.safety.incident;
  if (inc) {
    const pending = inc.needs.filter((k) => !inc.done.includes(k));
    if (pending.length) return { ok: false, code: `PENDING_${pending[0]}` };
    w.safety.incident = null;
    emit01(w, 'INCIDENT_RESOLVED', 'INFO');
    return { ok: true };
  }
  const b = w.safety.block;
  if (b) {
    if (b.code === 'PAN_WET' && w.balance.panWetG > 0.005) return { ok: false, code: 'PAN_STILL_WET' };
    w.safety.block = null;
    emit01(w, 'STATION_RESET', 'INFO', { code: b.code });
  }
  return { ok: true };
}

// ─────────────────────────── Paso de simulación ───────────────────────────

function stepThermal(w: P01World, dt: number) {
  const p = w.params;
  const room = p.roomTempC;
  for (const f of Object.values(w.fluids)) {
    if (f.waterG <= 0) {
      f.tempC = room;
      continue;
    }
    const inBath = w.objects[f.id]?.support === 'iceBath01';
    const T = inBath ? w.bath.tempC : room;
    const k = inBath ? p.bathThermalExchangeRateSInv : p.roomThermalExchangeRateSInv;
    f.tempC += (T - f.tempC) * Math.min(1, k * dt);
    // Las películas de las paredes se evaporan de a poco (registro: evaporado).
    if (f.wetG > 0) {
      const e = Math.min(f.wetG, 0.0015 * dt);
      f.wetG -= e;
      w.ledger.evaporatedG += e;
    }
  }
  const pip = w.pipette;
  if (pip.waterG > 0) pip.tempC += (room - pip.tempC) * Math.min(1, p.roomThermalExchangeRateSInv * 2 * dt);
  for (const k of Object.keys(w.wetObjects)) {
    const v = w.wetObjects[k];
    if (v > 0) {
      const e = Math.min(v, 0.0008 * dt);
      w.wetObjects[k] = v - e;
      w.ledger.evaporatedG += e;
    }
  }
  const t = w.thermometer;
  t.displayedC += (thermoTarget(w) - t.displayedC) * Math.min(1, dt / t.tauS);
}

export function stepP01World(w: P01World): void {
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepPours(w, dt);
  stepPipette(w, dt);
  stepThermal(w, dt);
  const b = w.balance;
  if (b.powered) stepAnalyticalBalance(b, panLoadG(w) + zeroDrift(w), p.balance, dt, w.timeS, gauss01(w));
}

export function runP01For(w: P01World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepP01World(w);
}

export function p01Summary(w: P01World) {
  return {
    water: Math.round(waterTotal(w) * 1e6) / 1e6,
    pip: Math.round(w.pipette.waterG * 1e4) / 1e4,
    cyl: Math.round(cylinderApparentMl(w) * 1e4) / 1e4,
    samples: w.samples.length,
    readings: w.readingOrder.length,
    bal: Math.round(w.balance.shownG * 1e4) / 1e4,
  };
}
