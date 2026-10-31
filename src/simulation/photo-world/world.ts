/**
 * Mundo B08: intercambio gaseoso, BTB, extracción y cromatografía (§6). `dispatchPhoto` resuelve los gestos propios y delega
 * el resto en `dispatchDiv` (microscopio opcional, marcas, capturas), con los catálogos anteriores silenciados por
 * `params.codeMap`. `stepPhotoWorld` avanza 0,05 s. Sin planta o sin luz el término correspondiente es exactamente 0. Determinista.
 */
import { conservedDiv, createDivWorld, dispatchDiv, divOutstanding, divSummary, stepDivWorld, type DivWorldExtras } from '../div-world/world';
import type { CellWorldExtras } from '../cell-world/world';
import { emitB, errB, flagB } from '../optical-world/events';
import type { OpticalWorldSpec } from '../optical-world/world';
import type { DivCommand } from '../div-world/commands';
import { lampIndex, pGross, respiration } from '../photosynthesis/photokinetics';
import { dhFromVolume, thermalVolume, volumeFromMoles } from '../photosynthesis/gas-partition';
import { btbColor, phFromDic } from '../photosynthesis/carbonate-btb';
import { PIGMENTS, emptyLedger, extractionFraction, ledgerTotal, move, type PigmentId } from '../photosynthesis/pigment-extraction';
import { bandAt, frontDistance } from '../photosynthesis/paper-chromatography';
import type { PhotoCommand, PhotoDispatchResult, PhotoOnlyCommand } from './commands';
import { PHOTO_ONLY_TYPES } from './commands';
import { inHoodXY } from './geometry';
import type { Band, BtbTube, GasTube, PaperState, PhotoParams, PhotoReading, PhotoState, PhotoWorld, Sprig } from './types';

export const SC_B08 = {
  IDEAL: 'S01', UNEVEN_MASS: 'S02', BRIGHT: 'S03', DIM: 'S04', DARK_OK: 'S05', DARK_LEAK: 'S06', LEAK: 'S07', TEMP_DIFF: 'S08', LOW_DIC: 'S09', HIGH_DIC: 'S10', BTB_NOPLANT: 'S11', BTB_PLANTS: 'S12', HIGH_ALK: 'S13',
  FRESH: 'S14', OVERLAP: 'S15', MANY_XANT: 'S16', POOR_GRIND: 'S17', THICK_SPOT: 'S18', OPEN_CHAMBER: 'S19', DEGRADED: 'S20', NO_RADIUS: 'S21', TEACHER_PHOTOS: 'S22', STATIC_PHOTO: 'S23', UNCAL_PHOTO: 'S24',
  REPEATS: 'S25', ONLY_CHROM: 'S26', ONLY_GAS_BTB: 'S27', UNKNOWN: 'S28',
} as const;

const ok = (extra: Partial<PhotoDispatchResult> = {}): PhotoDispatchResult => ({ ok: true, ...extra });
const no = (code: string): PhotoDispatchResult => ({ ok: false, code });
const pp = (w: PhotoWorld): PhotoParams => w.params.photo!;
const has = (w: PhotoWorld, s: string) => w.scenarios.includes(s);
const pad = (n: number) => String(n).padStart(2, '0');
/** Error de técnica con su código propio (FOT-NN) y su evento. */
const E = (w: PhotoWorld, n: number, severity: 'WARN' | 'ALERT' | 'CRITICAL' = 'WARN', params?: Record<string, string | number>) => errB(w, `FOT-${pad(n)}`, `FOT_${pad(n)}`, severity, params);

export const TUBES = ['gL', 'gD'] as const;
export const BTB = ['bN', 'bL', 'bD'] as const;
const isTube = (w: PhotoWorld, id: string) => !!w.photo.tubes[id];
const isBtb = (w: PhotoWorld, id: string) => !!w.photo.btb[id];
const lampOf = (target: string) => (target.startsWith('g') ? 'lampG' : 'lampB');

const dist2d = (w: PhotoWorld, a: string, b: string) => Math.hypot(w.objects[a].pose.x - w.objects[b].pose.x, w.objects[a].pose.y - w.objects[b].pose.y);
export const lampDistance = (w: PhotoWorld, target: string) => dist2d(w, lampOf(target), target);
export const inBath = (w: PhotoWorld, id: string) => w.objects[id].support === 'aqA' || w.objects[id].support === 'aqB';
export const coverOn = (w: PhotoWorld, id: string) => w.photo.covers[id] ?? 0;
const inHood = (w: PhotoWorld, id: string) => inHoodXY(w.objects[id].pose.x, w.objects[id].pose.y);

/** Índice de luz que llega al tubo: potencia, distancia y lo que deja pasar la pantalla. */
export function lightAt(w: PhotoWorld, target: string): number {
  const lamp = w.photo.lamps[lampOf(target)];
  if (!lamp.on) return 0;
  return lampIndex(lamp.powerPct, lampDistance(w, target), pp(w).lampRefCm) * (1 - coverOn(w, target));
}

export const elapsedOf = (w: PhotoWorld) => (w.photo.runStartedAt === null ? null : Math.round((w.timeS - w.photo.runStartedAt) * 1e6) / 1e6);
export const seriesElapsed = (w: PhotoWorld) => (w.photo.seriesStartedAt === null ? null : Math.round((w.timeS - w.photo.seriesStartedAt) * 1e6) / 1e6);

function reading(w: PhotoWorld, r: Omit<PhotoReading, 'id' | 'tick'>): PhotoReading {
  const m = w.photo;
  const out: PhotoReading = { id: `rd${++m.seq}`, tick: w.tick, ...r };
  m.readings.push(out);
  return out;
}

// ─────────────────────────── Despacho ───────────────────────────

export function dispatchPhoto(w: PhotoWorld, cmd: PhotoCommand): PhotoDispatchResult {
  if (PHOTO_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    if (!w.ppe) {
      errB(w, 'E68', 'FOT_60', 'CRITICAL');
      return no('PPE');
    }
    return photoOnly(w, cmd as PhotoOnlyCommand);
  }
  const c = cmd as DivCommand;
  if (!w.ppe) return dispatchDiv(w, c);
  if (c.type === 'setPose') return setPose(w, c);
  if (c.type === 'closeBench') return closeBench(w);
  return dispatchDiv(w, c);
}

/** Lo sujeto a un tubo (rama, pantalla) lo acompaña. */
function follow(w: PhotoWorld, tube: string) {
  const p = w.objects[tube].pose;
  for (const o of Object.values(w.objects)) {
    if (o.support === `tube:${tube}`) o.pose = { x: p.x, y: p.y, z: p.z + 0.5, rotationRad: 0 };
    if (o.support === `cover:${tube}`) o.pose = { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
  }
}

function setPose(w: PhotoWorld, cmd: Extract<DivCommand, { type: 'setPose' }>): PhotoDispatchResult {
  const { id, support } = cmd;
  const o = w.objects[id];
  if (!o) return dispatchDiv(w, cmd);
  const m = w.photo;
  const prev = o.support;
  if (support && support !== prev) {
    if (m.sprigs[id]) {
      if (support.startsWith('tube:')) {
        const t = support.slice(5);
        const v: GasTube | BtbTube | undefined = m.tubes[t] ?? m.btb[t];
        if (!v) return no('BAD_TARGET');
        if (v.sprig && v.sprig !== id) return no('SLOT_BUSY');
        if (m.tubes[t]?.stopper01) return no('STOPPERED');
        v.sprig = id;
      }
      if (prev.startsWith('tube:')) {
        const t = prev.slice(5);
        const v: GasTube | BtbTube | undefined = m.tubes[t] ?? m.btb[t];
        if (m.runStartedAt !== null && m.tubes[t]) return no('RUN_ACTIVE');
        if (v) v.sprig = null;
      }
    }
    if (o.kind === 'darkCover') {
      if (prev.startsWith('cover:')) delete m.covers[prev.slice(6)];
      if (support.startsWith('cover:')) {
        const t = support.slice(6);
        if (m.covers[t] !== undefined) return no('SLOT_BUSY');
        m.covers[t] = has(w, SC_B08.DARK_LEAK) ? 0.85 : 1;
      }
    }
    if (isTube(w, id) && (support === 'aqA' || support === 'aqB') && Object.values(w.objects).some((x) => x.id !== id && x.support === support)) return no('SLOT_BUSY');
    // Levantar un montaje durante la corrida: la columna acusa el golpe hidrostático.
    if (isTube(w, id) && m.runStartedAt !== null && !m.tubes[id].opened && !m.tubes[id].finalId && support === 'hand') {
      E(w, 18, 'WARN', { obj: id });
      m.tubes[id].perturbMm += 2;
    }
    if (id === 'paper' || id === 'vial') {
      if (support === 'drain' || support === 'bioWaste' || support === 'trashBin') {
        E(w, 64, 'ALERT', { obj: id });
        if (id === 'vial') move(m.ledger, 'extract', 'lost', 1);
        return no('WRONG_WASTE');
      }
      if (support === 'organicWaste') {
        if (id === 'vial') {
          if (w.evidence.vialDiscarded === undefined) move(m.ledger, 'extract', 'waste', 1);
          flagB(w, 'vialDiscarded');
        } else {
          move(m.ledger, 'paper', 'waste', 1);
          flagB(w, 'paperDiscarded');
        }
      }
    }
  }
  const r = dispatchDiv(w, cmd);
  if (r.ok && (isTube(w, id) || isBtb(w, id))) follow(w, id);
  if (r.ok && o.kind === 'plantLamp' && o.support !== 'hand') ignitionCheck(w);
  return r;
}

const vapors = (w: PhotoWorld) => Object.values(w.photo.solvents).some((s) => s.open);
/** Fuente de calor o chispa junto a vapores: bloqueo sin incendio (§11). */
function ignitionCheck(w: PhotoWorld): boolean {
  const hot = Object.entries(w.photo.lamps).some(([id, l]) => l.on && inHood(w, id));
  if (hot && vapors(w)) {
    E(w, 62, 'CRITICAL');
    w.safety.block = { code: 'IGNITION', since: w.timeS };
    return true;
  }
  return false;
}

/** Interlocks de solventes (§11): ojos, campana y fuentes de ignición, en ese orden. */
function solventGuard(w: PhotoWorld, bottleId: string): string | null {
  const m = w.photo;
  if (!w.safety.ppe.goggles) {
    E(w, 60, 'CRITICAL', { obj: bottleId });
    return 'GOGGLES';
  }
  if (!inHood(w, bottleId)) {
    E(w, 61, 'CRITICAL', { obj: bottleId });
    return 'OUTSIDE_HOOD';
  }
  if (!m.hood.on || !m.hood.sashOk) {
    E(w, 63, 'CRITICAL');
    return 'HOOD_OFF';
  }
  if (Object.entries(m.lamps).some(([id, l]) => l.on && inHood(w, id))) {
    E(w, 62, 'CRITICAL');
    return 'IGNITION';
  }
  return null;
}

function photoOnly(w: PhotoWorld, cmd: PhotoOnlyCommand): PhotoDispatchResult {
  const m = w.photo;
  const p = pp(w);
  switch (cmd.type) {
    case 'recordHypothesis':
      if (!cmd.variable.trim()) return no('EMPTY');
      m.hypothesis = { recorded: true, variable: cmd.variable };
      flagB(w, 'hypothesisRecorded');
      return ok();
    case 'labelTube':
      if (m.tubes[cmd.tubeId]) m.tubes[cmd.tubeId].label = cmd.label;
      else return no('NO_TUBE');
      return ok();
    case 'fillTube':
      return fillTube(w, cmd.tubeId, cmd.mL, cmd.tiltDeg);
    case 'tapBubble':
      if (!m.tubes[cmd.tubeId]) return no('NO_TUBE');
      m.tubes[cmd.tubeId].bubble = false;
      return ok();
    case 'setStopper': {
      const t = m.tubes[cmd.tubeId];
      if (!t) return no('NO_TUBE');
      t.stopper01 = Math.max(0, Math.min(1, cmd.seat01));
      if (t.stopper01 > 0 && t.stopper01 < 0.9) E(w, 11, 'WARN', { obj: cmd.tubeId });
      return ok();
    }
    case 'connectCapillary': {
      const t = m.tubes[cmd.tubeId];
      if (!t) return no('NO_TUBE');
      if (t.stopper01 <= 0) return no('NO_STOPPER');
      t.capConnected = true;
      t.contact01 = Math.max(0, Math.min(1, cmd.contact01));
      if (t.contact01 < 0.9) E(w, 12, 'WARN', { obj: cmd.tubeId });
      return ok();
    }
    case 'clearCapillary':
      if (!m.tubes[cmd.tubeId]) return no('NO_TUBE');
      m.tubes[cmd.tubeId].plugCleared = true;
      return ok();
    case 'levelCapillary':
      if (!m.tubes[cmd.tubeId]) return no('NO_TUBE');
      m.tubes[cmd.tubeId].levelDeg = cmd.deg;
      return ok();
    case 'recordControls':
      m.controls = { dicKnown: cmd.dicKnown, tempC: cmd.tempC, distanceCm: cmd.distanceCm, powerIndex: cmd.powerIndex, lightUnit: cmd.lightUnit };
      flagB(w, 'controlsRecorded');
      return ok();
    case 'setLamp': {
      const l = m.lamps[cmd.lampId];
      if (!l) return no('NO_LAMP');
      l.on = cmd.on;
      l.powerPct = Math.max(0, Math.min(100, cmd.powerPct));
      if (cmd.on && ignitionCheck(w)) {
        l.on = false;
        return no('IGNITION');
      }
      if (cmd.on) flagB(w, `lampOn:${cmd.lampId}`);
      return ok();
    }
    case 'setDarkCover':
      if (m.covers[cmd.targetId] === undefined) return no('NO_COVER');
      m.covers[cmd.targetId] = Math.max(0, Math.min(1, cmd.coverage));
      return ok();
    case 'markBaseline':
      return markBaseline(w, cmd.tubeId, cmd.eyeOffsetCm);
    case 'readMeniscus':
      return readMeniscus(w, cmd.tubeId, cmd.eyeOffsetCm);
    case 'startGasRun':
      return startGasRun(w);
    case 'stirTube': {
      const t = m.tubes[cmd.tubeId];
      if (!t) return no('NO_TUBE');
      t.stirredAt = w.timeS;
      return ok();
    }
    case 'openStopper': {
      const t = m.tubes[cmd.tubeId];
      if (!t) return no('NO_TUBE');
      if (m.runStartedAt !== null && !t.finalId && !t.opened) E(w, 20, 'WARN', { obj: cmd.tubeId });
      t.opened = true;
      t.stopper01 = 0;
      return ok();
    }
    case 'fillBtb': {
      const t = m.btb[cmd.tubeId];
      if (!t) return no('NO_TUBE');
      const mL = Math.max(0, Math.min(25, cmd.mL));
      if (m.seriesStartedAt !== null) return no('RUN_ACTIVE');
      const fill = alk(w) * (mL - t.mL);
      t.mL = mL;
      t.fillUmol += fill;
      t.dicUmol += fill;
      return ok();
    }
    case 'addIndicator': {
      const t = m.btb[cmd.tubeId];
      if (!t) return no('NO_TUBE');
      if (t.mL <= 0) return no('EMPTY_TUBE');
      t.drops += Math.max(0, Math.round(cmd.drops));
      return ok();
    }
    case 'doseCO2':
      return doseCO2(w, cmd.tubeId, cmd.units, cmd.aligned);
    case 'readIndicator':
      return readIndicator(w, cmd.tubeId);
    case 'startSeries':
      return startSeries(w);
    case 'mutateProfile':
      if (m.seriesStartedAt !== null || m.runStartedAt !== null) E(w, 32, 'ALERT');
      return no('PROFILE_FROZEN');
    case 'setHood':
      m.hood = { on: cmd.on, sashOk: cmd.sashOk };
      if ((!cmd.on || !cmd.sashOk) && vapors(w)) E(w, 63, 'CRITICAL');
      return ok();
    case 'openSolvent': {
      const s = m.solvents[cmd.bottleId];
      if (!s) return no('NO_BOTTLE');
      if (cmd.bottleId === 'bW') {
        s.open = true;
        return ok();
      }
      const g = solventGuard(w, cmd.bottleId);
      if (g) return no(g);
      s.open = true;
      flagB(w, 'solventOpened');
      return ok();
    }
    case 'closeSolvent': {
      const s = m.solvents[cmd.bottleId];
      if (!s) return no('NO_BOTTLE');
      s.open = false;
      return ok();
    }
    case 'weighLeaf':
      if (w.objects.leaf.support !== 'balance') return no('NOT_ON_BALANCE');
      m.leaf.weighedG = p.leafMassG;
      flagB(w, 'leafWeighed');
      return ok({ value: m.leaf.weighedG });
    case 'transferLeaf':
      return transferLeaf(w, cmd.g, cmd.inside);
    case 'grind':
      if (m.leaf.transferredG <= 0) return no('NO_LEAF');
      m.leaf.strokes += Math.max(0, Math.round(cmd.strokes));
      return ok();
    case 'addSolvent':
      return addSolvent(w, cmd.bottleId, cmd.mL);
    case 'capSepTube':
      m.sep.closed = cmd.closed;
      return ok();
    case 'shake':
      return shake(w, cmd.intensity01, cmd.seconds);
    case 'aspirate':
      return aspirate(w, cmd.zone);
    case 'cutPaper':
      m.paper.cut = true;
      return ok();
    case 'markOrigin':
      return markOrigin(w, cmd.tool, cmd.mm);
    case 'applySpot':
      return applySpot(w, cmd.size);
    case 'pourEluent':
      return pourEluent(w, cmd.bottleId, cmd.levelMm);
    case 'hangPaper':
      return hangPaper(w, cmd.tiltDeg, cmd.clip);
    case 'closeChamber':
      m.paper.chamberClosed = cmd.closed;
      return ok();
    case 'removePaper':
      return removePaper(w);
    case 'markSolventFront':
      return markFront(w, cmd.mm);
    case 'markBand':
      return markBand(w, cmd.bandId, cmd.mm);
    case 'requestAsset':
      if (!m.assetScope.includes(cmd.assetId)) {
        E(w, 71, 'WARN', { obj: cmd.assetId });
        return no('ASSET_SCOPE_DENIED');
      }
      return ok();
    case 'attemptFlame':
      E(w, 62, 'CRITICAL');
      w.safety.block = { code: 'IGNITION', since: w.timeS };
      return no('FLAME_FORBIDDEN');
  }
}

// ─────────────────────────── Gases ───────────────────────────

function fillTube(w: PhotoWorld, tubeId: string, mL: number, tiltDeg: number): PhotoDispatchResult {
  const t = w.photo.tubes[tubeId];
  if (!t) return no('NO_TUBE');
  if (t.stopper01 > 0) return no('STOPPERED');
  const cap = 50;
  if (mL > cap) E(w, 21, 'ALERT', { obj: tubeId });
  const v = Math.max(0, Math.min(cap, mL));
  // Verter de golpe atrapa una burbuja bajo el tapón.
  if (tiltDeg > 60) t.bubble = true;
  const dic = mediumDic(w) * (v - t.mL);
  t.mL = v;
  t.dicUmol += dic;
  t.dicInitialUmol += dic;
  return ok({ value: v });
}

const mediumDic = (w: PhotoWorld) => pp(w).mediumDicMM * (has(w, SC_B08.LOW_DIC) ? 0.1 : has(w, SC_B08.HIGH_DIC) ? 2.5 : 1);
const alk = (w: PhotoWorld) => pp(w).btbAlkMM * (has(w, SC_B08.HIGH_ALK) ? 4 : 1);
const sealed = (t: GasTube) => t.stopper01 > 0 && t.capConnected;

const parallaxMm = (eyeOffsetCm: number) => eyeOffsetCm * 1;
const readValue = (hMm: number, eyeOffsetCm: number) => Math.round(hMm + parallaxMm(eyeOffsetCm));

function markBaseline(w: PhotoWorld, tubeId: string, eye: number): PhotoDispatchResult {
  const t = w.photo.tubes[tubeId];
  if (!t) return no('NO_TUBE');
  if (!sealed(t)) return no('NOT_SEALED');
  if (Math.abs(t.levelDeg) > 2) E(w, 14, 'WARN', { obj: tubeId });
  if (!t.plugCleared) {
    E(w, 22, 'WARN', { obj: tubeId });
    t.perturbMm += 3;
  }
  if (t.bubble) E(w, 13, 'WARN', { obj: tubeId });
  if (Math.abs(eye) > 1) E(w, 15, 'WARN', { obj: tubeId });
  const r = reading(w, { kind: 'baseline', target: tubeId, value: readValue(t.hMm, eye), unit: 'mm', resolution: 1, u: 0.5, elapsedS: elapsedOf(w), tempC: t.tempC });
  t.baselineId = r.id;
  flagB(w, `baseline:${tubeId}`);
  return ok({ id: r.id, value: r.value });
}

function readMeniscus(w: PhotoWorld, tubeId: string, eye: number): PhotoDispatchResult {
  const m = w.photo;
  const t = m.tubes[tubeId];
  if (!t) return no('NO_TUBE');
  if (m.runStartedAt === null) return no('RUN_NOT_STARTED');
  if (Math.abs(eye) > 1) E(w, 15, 'WARN', { obj: tubeId });
  const el = elapsedOf(w)!;
  const r = reading(w, { kind: 'meniscus', target: tubeId, value: readValue(t.hMm, eye), unit: 'mm', resolution: 1, u: 0.5, elapsedS: el, tempC: t.tempC });
  if (el >= pp(w).runDurationS - 1e-6 && !t.finalId) {
    t.finalId = r.id;
    flagB(w, `final:${tubeId}`);
  }
  flagB(w, 'pairedRunObserved');
  return ok({ id: r.id, value: r.value });
}

function startGasRun(w: PhotoWorld): PhotoDispatchResult {
  const m = w.photo;
  if (m.runStartedAt !== null) return no('RUN_ACTIVE');
  const [a, b] = [m.tubes.gL, m.tubes.gD];
  if (!a.sprig || !b.sprig) return no('NO_SPRIG');
  if (a.mL <= 0 || b.mL <= 0) return no('EMPTY_TUBE');
  if (!sealed(a) || !sealed(b)) return no('NOT_SEALED');
  const ga = m.sprigs[a.sprig].g;
  const gb = m.sprigs[b.sprig].g;
  if (Math.abs(ga - gb) > 0.05 * Math.max(ga, gb) && !has(w, SC_B08.UNEVEN_MASS)) E(w, 1);
  if (m.sprigs[a.sprig].damaged || m.sprigs[b.sprig].damaged) E(w, 2);
  if (Math.abs(a.mL - b.mL) > 0.5) E(w, 3);
  for (const id of TUBES) {
    const t = m.tubes[id];
    const dark = coverOn(w, id) > 0;
    if (t.label !== (dark ? 'dark' : 'light')) E(w, 4, 'WARN', { obj: id });
    if (dark && coverOn(w, id) < 1 && !has(w, SC_B08.DARK_LEAK)) E(w, 7, 'WARN', { obj: id });
    if (!t.baselineId) E(w, 16, 'WARN', { obj: id });
  }
  if (!m.controls?.dicKnown) E(w, 5);
  if (m.controls?.lightUnit === 'par') E(w, 10);
  const bath = TUBES.map((id) => inBath(w, id));
  if (bath[0] !== bath[1]) E(w, 6);
  const lit = TUBES.find((id) => coverOn(w, id) === 0) ?? 'gL';
  if (m.controls && Math.abs(m.controls.distanceCm - lampDistance(w, lit)) > 3) E(w, 8);
  if (!inBath(w, lit) && m.lamps.lampG.on && lampDistance(w, lit) < pp(w).lampHotCm) E(w, 19);
  m.runStartedAt = w.timeS;
  flagB(w, 'gasRunStarted');
  emitB(w, 'RUN_STARTED', 'INFO');
  return ok();
}

function stepTube(w: PhotoWorld, id: string, dt: number) {
  const m = w.photo;
  const p = pp(w);
  const t = m.tubes[id];
  const lit = lightAt(w, id);
  const bath = inBath(w, id);
  const target = bath ? p.ambientC + (has(w, SC_B08.TEMP_DIFF) && id === 'gD' ? 3 : 0) : p.ambientC + (m.lamps.lampG.on ? Math.min(12, (lit / 100) * 12) * (coverOn(w, id) ? 0.2 : 1) : 0);
  t.tempC += ((target - t.tempC) * dt) / 90;
  if (t.opened || !t.sprig) return;
  const sp: Sprig = m.sprigs[t.sprig];
  const eff = sp.g * (sp.damaged ? 0.5 : 1) * m.rateFactor;
  const dtMin = dt / 60;
  const c = t.mL > 0 ? t.dicUmol / t.mL : 0;
  const fix = Math.min(Math.max(0, t.dicUmol), pGross(lit, c, t.tempC, p.kinetics) * eff * dtMin);
  const res = respiration(t.tempC, p.kinetics) * eff * dtMin;
  t.dicUmol += res - fix;
  t.biomassUmol += fix - res;
  t.o2GasUmol += fix - res;
  // Fuga: lo que el sello deja salir (o entrar) ya no empuja la columna.
  const k = (1 - (t.stopper01 || 1)) + (1 - (t.contact01 || 1)) + (has(w, SC_B08.LEAK) ? 0.15 : 0);
  if (k > 0) {
    const out = t.o2GasUmol * Math.min(1, (k * dt) / 60);
    t.o2GasUmol -= out;
    t.o2LeakUmol += out;
  }
  const tK = p.ambientC + 273.15;
  const volMoles = volumeFromMoles(t.o2GasUmol, p.pressureKPa, t.tempC + 273.15);
  const volT = thermalVolume(p.headspaceMl, t.tempC + 273.15, tK);
  t.hMm = dhFromVolume(volMoles + volT, p.capillaryRadiusCm) + t.perturbMm;
}

// ─────────────────────────── Indicador ───────────────────────────

export const btbPh = (w: PhotoWorld, id: string) => {
  const t = w.photo.btb[id];
  return t.mL > 0 ? phFromDic(t.dicUmol / t.mL, alk(w)) : 7;
};
export const btbColorOf = (w: PhotoWorld, id: string) => {
  const [lo, hi] = pp(w).btbTransition;
  return btbColor(btbPh(w, id), lo, hi);
};

function doseCO2(w: PhotoWorld, tubeId: string, units: number, aligned: boolean): PhotoDispatchResult {
  const m = w.photo;
  const t = m.btb[tubeId];
  if (!t) return no('NO_TUBE');
  if (t.mL <= 0) return no('EMPTY_TUBE');
  if (m.seriesStartedAt !== null) return no('RUN_ACTIVE');
  if (!aligned) E(w, 33, 'WARN', { obj: tubeId });
  // Con la boquilla mal puesta, casi todo sale al ambiente: solo entra al balance lo que llega al tubo.
  const added = Math.max(0, units) * pp(w).co2PerUnitMM * t.mL * (aligned ? 1 : 0.3);
  t.dicUmol += added;
  t.addedUmol += added;
  m.co2DispensedUmol += added;
  return ok();
}

function readIndicator(w: PhotoWorld, tubeId: string): PhotoDispatchResult {
  const m = w.photo;
  const t = m.btb[tubeId];
  if (!t) return no('NO_TUBE');
  if (t.drops <= 0) return no('NO_INDICATOR');
  const el = seriesElapsed(w);
  const ph = btbPh(w, tubeId);
  const color = btbColorOf(w, tubeId);
  const r = reading(w, { kind: 'btb', target: tubeId, value: 0, unit: '', resolution: 0, u: 0, elapsedS: el, color, ph: pp(w).btbCalibrated ? Math.round(ph * 100) / 100 : null });
  if (el === null) t.baselineId = r.id;
  else if (el >= pp(w).seriesDurationS - 1e-6 && !t.finalId) {
    t.finalId = r.id;
    flagB(w, `btbFinal:${tubeId}`);
  }
  if (el !== null) flagB(w, 'seriesObserved');
  return ok({ id: r.id });
}

function startSeries(w: PhotoWorld): PhotoDispatchResult {
  const m = w.photo;
  if (m.seriesStartedAt !== null) return no('RUN_ACTIVE');
  const [n, l, d] = [m.btb.bN, m.btb.bL, m.btb.bD];
  if (!l.sprig || !d.sprig) return no('NO_SPRIG');
  if (n.mL <= 0 || l.mL <= 0 || d.mL <= 0) return no('EMPTY_TUBE');
  if (n.sprig) E(w, 29);
  if (n.drops <= 0) E(w, 26);
  if (new Set(BTB.map((id) => m.btb[id].drops)).size > 1) E(w, 27);
  const start = BTB.map((id) => m.btb[id].dicUmol);
  if (Math.max(...start) - Math.min(...start) > 0.5) E(w, 28);
  if (coverOn(w, 'bD') < 1) E(w, 30);
  if (BTB.some((id) => !m.btb[id].baselineId)) E(w, 34);
  m.seriesStartedAt = w.timeS;
  flagB(w, 'seriesStarted');
  emitB(w, 'SERIES_STARTED', 'INFO');
  return ok();
}

function stepBtb(w: PhotoWorld, id: string, dt: number) {
  const m = w.photo;
  const t = m.btb[id];
  if (!t.sprig) return;
  const p = pp(w);
  const sp = m.sprigs[t.sprig];
  const lit = lightAt(w, id);
  const eff = sp.g * (sp.damaged ? 0.5 : 1) * m.rateFactor;
  const dtMin = dt / 60;
  const c = t.mL > 0 ? t.dicUmol / t.mL : 0;
  const fix = Math.min(Math.max(0, t.dicUmol), pGross(lit, c, p.ambientC, p.kinetics) * eff * dtMin);
  const res = respiration(p.ambientC, p.kinetics) * eff * dtMin;
  t.dicUmol += res - fix;
  t.biomassUmol += fix - res;
  t.o2Umol += fix - res;
}

// ─────────────────────────── Extracción ───────────────────────────

function transferLeaf(w: PhotoWorld, g: number, inside: boolean): PhotoDispatchResult {
  const m = w.photo;
  const p = pp(w);
  if (m.leaf.weighedG === null) return no('NOT_WEIGHED');
  if (m.leaf.transferredG > 0) return no('ALREADY_DONE');
  const mass = Math.max(0, g);
  if (Math.abs(mass - m.leaf.weighedG) > 0.02) E(w, 36);
  for (const q of PIGMENTS) {
    m.ledger[q].tissue = p.pigmentUgPerG[q] * mass;
    m.ledgerInitial[q] = m.ledger[q].tissue;
  }
  // Lo que cae fuera del mortero sale del proceso, pero sigue en el balance.
  if (!inside) {
    E(w, 38);
    move(m.ledger, 'tissue', 'lost', 0.25);
  }
  m.leaf.transferredG = mass;
  w.objects.leaf.support = 'mortar';
  const mort = w.objects.mortar.pose;
  w.objects.leaf.pose = { x: mort.x, y: mort.y, z: 1, rotationRad: 0 };
  if (has(w, SC_B08.DEGRADED)) move(m.ledger, 'tissue', 'degraded', 0.35);
  flagB(w, 'leafPrepared');
  return ok();
}

function addSolvent(w: PhotoWorld, bottleId: string, mL: number): PhotoDispatchResult {
  const m = w.photo;
  const s = m.solvents[bottleId];
  if (!s) return no('NO_BOTTLE');
  if (bottleId === 'bE') return no('BAD_TARGET');
  if (bottleId !== 'bW') {
    const g = solventGuard(w, bottleId);
    if (g) return no(g);
  }
  if (!s.open) return no('BOTTLE_CLOSED');
  const v = Math.max(0, Math.min(s.ml, mL));
  s.ml -= v;
  s.usedMl += v;
  if (bottleId === 'bA') m.sep.acetoneMl += v;
  if (bottleId === 'bW') m.sep.waterMl += v;
  if (bottleId === 'bH') m.sep.hydroMl += v;
  return ok({ value: v });
}

function shake(w: PhotoWorld, intensity01: number, seconds: number): PhotoDispatchResult {
  const m = w.photo;
  const sep = m.sep;
  if (sep.acetoneMl + sep.hydroMl <= 0) return no('NO_SOLVENT');
  if (m.leaf.transferredG <= 0) return no('NO_LEAF');
  const p = pp(w);
  if (sep.acetoneMl < p.acetoneMl - 0.2 || sep.hydroMl < p.hydrocarbonMl - 0.2 || sep.waterMl < p.waterMl - 0.2) E(w, 39);
  if (!sep.closed) {
    E(w, 40, 'ALERT');
    move(m.ledger, 'tissue', 'lost', 0.15);
  }
  sep.mix01 = Math.min(1, sep.mix01 + Math.max(0, Math.min(1, intensity01)) * (Math.max(0, seconds) / 10));
  sep.settledAt = Math.round((w.timeS + p.settleS) * 1e6) / 1e6;
  return ok({ value: sep.mix01 });
}

function aspirate(w: PhotoWorld, zone: 'upper' | 'interface' | 'lower'): PhotoDispatchResult {
  const m = w.photo;
  const sep = m.sep;
  const p = pp(w);
  if (sep.aspirated) return no('ALREADY_DONE');
  if (sep.settledAt === null) return no('NOT_SHAKEN');
  const g01 = Math.min(1, m.leaf.strokes / p.grindStrokes) * (has(w, SC_B08.POOR_GRIND) ? 0.55 : 1);
  if (m.leaf.strokes < p.grindStrokes * 0.7) E(w, 37);
  if (sep.mix01 < 0.7) E(w, 41);
  if (w.timeS < sep.settledAt) {
    E(w, 42);
    sep.contaminated = true;
  }
  const solv01 = Math.min(1, (sep.acetoneMl + sep.hydroMl) / (p.acetoneMl + p.hydrocarbonMl));
  move(m.ledger, 'tissue', 'aqueous', extractionFraction(g01, sep.mix01, solv01));
  if (zone !== 'upper') {
    E(w, 43);
    sep.contaminated = true;
  }
  // Fase superior: el pigmento pasa al extracto; aspirar abajo o en la interfaz arrastra poco y sucio.
  move(m.ledger, 'aqueous', 'extract', zone === 'upper' ? 0.95 : zone === 'interface' ? 0.45 : 0.1);
  sep.aspirated = true;
  m.vialReady = true;
  flagB(w, 'pigmentExtractReady');
  return ok();
}

// ─────────────────────────── Cromatografía ───────────────────────────

function markOrigin(w: PhotoWorld, tool: 'pencil' | 'pen', mm: number): PhotoDispatchResult {
  const q = w.photo.paper;
  if (!q.cut) return no('PAPER_NOT_CUT');
  if (tool === 'pen') E(w, 46);
  q.originMm = mm;
  q.originTool = tool;
  flagB(w, 'paperReady');
  return ok();
}

function applySpot(w: PhotoWorld, size: 'small' | 'large'): PhotoDispatchResult {
  const m = w.photo;
  const q = m.paper;
  if (!q.cut) return no('PAPER_NOT_CUT');
  if (!m.vialReady) return no('NO_EXTRACT');
  if (q.hung) return no('PAPER_HUNG');
  if (size === 'large') {
    E(w, 49);
    q.large = true;
  }
  if (q.lastSpotAt !== null && w.timeS - q.lastSpotAt < pp(w).spotDryS) {
    E(w, 50);
    q.wetRespot = true;
  }
  q.lastSpotAt = w.timeS;
  q.spots += 1;
  move(m.ledger, 'extract', 'paper', size === 'large' ? 0.3 : 0.12);
  flagB(w, 'spotPrepared');
  return ok({ value: q.spots });
}

function pourEluent(w: PhotoWorld, bottleId: string, levelMm: number): PhotoDispatchResult {
  const m = w.photo;
  const s = m.solvents[bottleId];
  const q = m.paper;
  if (!s) return no('NO_BOTTLE');
  if (bottleId !== 'bW') {
    const g = solventGuard(w, bottleId);
    if (g) return no(g);
  }
  if (!s.open) return no('BOTTLE_CLOSED');
  if (bottleId !== 'bE') E(w, 45, 'WARN', { obj: bottleId });
  const v = Math.max(0, levelMm) * 0.15;
  const used = Math.min(s.ml, v);
  s.ml -= used;
  s.usedMl += used;
  q.eluent = bottleId;
  q.eluentMm = levelMm;
  submergeCheck(w);
  return ok();
}

function submergeCheck(w: PhotoWorld) {
  const m = w.photo;
  const q = m.paper;
  if (q.hung && q.originMm !== null && q.eluentMm >= q.originMm && !q.submerged) {
    q.submerged = true;
    E(w, 48, 'WARN');
    move(m.ledger, 'paper', 'waste', 1);
  }
}

function hangPaper(w: PhotoWorld, tiltDeg: number, clip: boolean): PhotoDispatchResult {
  const m = w.photo;
  const q = m.paper;
  if (!q.cut) return no('PAPER_NOT_CUT');
  if (!q.spots) return no('NO_SPOT');
  if (q.originMm === null) {
    E(w, 47);
    q.originMm = 0;
  }
  if (!clip) {
    E(w, 67, 'WARN');
    return no('CLIP_UNSECURED');
  }
  if (Math.abs(tiltDeg) > 5) E(w, 51);
  q.tiltDeg = tiltDeg;
  q.hung = true;
  const dev = w.objects.devTube.pose;
  w.objects.paper.support = 'devTube';
  w.objects.paper.pose = { x: dev.x, y: dev.y, z: 1, rotationRad: 0 };
  submergeCheck(w);
  return ok();
}

/** Centros, anchos y color de las bandas de ESTA corrida (cambian con el frente, el perfil y la siembra). */
export function bandsOf(w: PhotoWorld): Band[] {
  const m = w.photo;
  const q: PaperState = m.paper;
  if (q.originMm === null || !q.hung || q.submerged || q.eluent !== 'bE' || q.frontMm <= q.originMm + 5) return [];
  const p = pp(w);
  const front = q.frontMm;
  const width = (q.large ? 6 : 3) + (q.wetRespot ? 2 : 0) + (has(w, SC_B08.THICK_SPOT) ? 3 : 0) + (w.photo.sep.contaminated ? 1.5 : 0);
  const shift = q.evaporated ? 0.94 : 1;
  const mass = (id: PigmentId) => m.ledger[id].paper + m.ledger[id].waste * (w.evidence.paperDiscarded ? 1 : 0);
  const peak = Math.max(1e-9, ...PIGMENTS.map((id) => p.pigmentUgPerG[id] * 0.04));
  const mk = (id: string, rf: number, color: string, ug: number, composite = false, foreign = false): Band => ({ id, rf: rf * shift, centerMm: bandAt(rf * shift, q.originMm!, front), widthMm: width, color, intensity: Math.min(1, ug / peak), composite, foreign });
  const out: Band[] = [mk('b1', p.rf.caro, 'orange', mass('caro')), mk('b2', p.rf.xant, 'yellow', mass('xant'))];
  if (has(w, SC_B08.MANY_XANT)) out.push(mk('b2x', p.rf.xant - 0.06, 'paleYellow', mass('xant') * 0.5));
  if (has(w, SC_B08.OVERLAP)) out.push(mk('b3', (p.rf.chlA + p.rf.chlB) / 2, 'oliveGreen', mass('chlA') + mass('chlB'), true));
  else out.push(mk('b3', p.rf.chlA, 'blueGreen', mass('chlA')), mk('b4', p.rf.chlB, 'yellowGreen', mass('chlB')));
  if (q.originTool === 'pen') out.push(mk('ink', 0.85, 'ink', peak * 0.6, false, true));
  return out;
}

function removePaper(w: PhotoWorld): PhotoDispatchResult {
  const m = w.photo;
  const q = m.paper;
  if (!q.hung || q.removedAt !== null) return no('NOT_HUNG');
  q.removedAt = w.timeS;
  if (q.frontMm - (q.originMm ?? 0) < pp(w).minUsefulMm) E(w, 53);
  w.objects.paper.support = 'paperStand';
  const st = w.objects.stand.pose;
  w.objects.paper.pose = { x: st.x, y: st.y, z: 0.7, rotationRad: 0 };
  flagB(w, 'paperRemoved');
  return ok();
}

function markFront(w: PhotoWorld, mm: number): PhotoDispatchResult {
  const q = w.photo.paper;
  if (q.removedAt === null) return no('NOT_REMOVED');
  if (q.frontLost) return no('FRONT_LOST');
  q.frontMarkMm = mm;
  const r = reading(w, { kind: 'front', target: 'paper', value: Math.round(mm), unit: 'mm', resolution: 1, u: pp(w).rulerUMm, elapsedS: q.developS });
  flagB(w, 'frontMarked');
  return ok({ id: r.id });
}

function markBand(w: PhotoWorld, bandId: string, mm: number): PhotoDispatchResult {
  const q = w.photo.paper;
  if (q.removedAt === null) return no('NOT_REMOVED');
  const b = bandsOf(w).find((x) => x.id === bandId);
  if (!b) return no('NO_BAND');
  if (Math.abs(mm - b.centerMm) > b.widthMm / 2 + 0.6 && Math.abs(mm - b.centerMm) < b.widthMm * 2) E(w, 56);
  const r = reading(w, { kind: 'band', target: bandId, value: Math.round(mm), unit: 'mm', resolution: 1, u: pp(w).rulerUMm, elapsedS: q.developS });
  q.bandMarks[bandId] = r.id;
  flagB(w, 'bandMarked');
  return ok({ id: r.id, value: r.value });
}

function stepPaper(w: PhotoWorld, dt: number) {
  const m = w.photo;
  const q = m.paper;
  const p = pp(w);
  if (q.hung && q.removedAt === null && q.eluent) {
    q.developS += dt;
    const open = !q.chamberClosed;
    if (open && q.developS > 5) {
      E(w, 52);
      q.evaporated = true;
    }
    if (has(w, SC_B08.OPEN_CHAMBER)) q.evaporated = true;
    const k = p.frontKMmPerSqrtS * (q.evaporated ? 0.85 : 1) * (q.eluent === 'bE' ? 1 : 0.5);
    q.frontMm = frontDistance(k, q.developS, p.paperLengthMm);
    if (q.frontMm >= p.paperLengthMm && !q.offEdge) {
      q.offEdge = true;
      E(w, 54);
    }
  }
  if (q.removedAt !== null && q.frontMarkMm === null && !q.frontLost && w.timeS - q.removedAt > p.frontFadeS) {
    q.frontLost = true;
    E(w, 55);
  }
  // Extracto a la luz intensa: se degrada y queda contabilizado.
  if (m.vialReady && !w.evidence.vialDiscarded) {
    const near = Object.entries(m.lamps).some(([id, l]) => l.on && dist2d(w, id, 'vial') < 30);
    if (near) {
      E(w, 44);
      m.vialExposed = true;
      move(m.ledger, 'extract', 'degraded', 0.002 * dt);
    }
  }
}

// ─────────────────────────── Cierre ───────────────────────────

/** Lo que falta para dejar la estación segura (§11, F2). */
export function photoOutstanding(w: PhotoWorld): string[] {
  const out = divOutstanding(w);
  const m = w.photo;
  for (const [id, l] of Object.entries(m.lamps)) if (l.on) out.push(id);
  for (const [id, s] of Object.entries(m.solvents)) if (s.open) out.push(id);
  if (m.modules.pig) {
    if (m.paper.cut && w.objects.paper.support !== 'organicWaste') out.push('paper');
    if (m.vialReady && w.objects.vial.support !== 'organicWaste') out.push('vial');
  }
  return out;
}

function closeBench(w: PhotoWorld): PhotoDispatchResult {
  const m = w.photo;
  if (Object.values(m.lamps).some((l) => l.on)) E(w, 65);
  if (m.modules.pig && m.paper.cut && w.objects.paper.support !== 'organicWaste') E(w, 66);
  const base = divOutstanding(w);
  const extra = photoOutstanding(w).filter((x) => !base.includes(x));
  const had = w.evidence.benchRestored;
  const r = dispatchDiv(w, { type: 'closeBench' });
  if (extra.length) {
    if (!had) delete w.evidence.benchRestored;
    return { ...r, value: 0 };
  }
  return r;
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepPhotoWorld(w: PhotoWorld): void {
  stepDivWorld(w);
  const dt = w.params.dtS;
  const m = w.photo;
  if (m.runStartedAt !== null) {
    for (const id of TUBES) {
      stepTube(w, id, dt);
      const t = m.tubes[id];
      const other = m.tubes[id === 'gL' ? 'gD' : 'gL'];
      // Agitar un solo tubo: perturbación no compartida con su control.
      if (t.stirredAt !== null && w.timeS - t.stirredAt > 5 && (other.stirredAt === null || Math.abs(other.stirredAt - t.stirredAt) > 5)) {
        E(w, 9, 'WARN', { obj: id });
        t.perturbMm += 1;
        t.stirredAt = null;
      }
    }
  }
  if (m.seriesStartedAt !== null) for (const id of BTB) stepBtb(w, id, dt);
  stepPaper(w, dt);
  if (w.tick % 4 === 0 && w.safety.block?.code === 'IGNITION' && !Object.entries(m.lamps).some(([id, l]) => l.on && inHood(w, id)) && w.timeS - w.safety.block.since > 4) w.safety.block = null;
}

export function runPhotoFor(w: PhotoWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepPhotoWorld(w);
}

/** Balances: carbono y O₂ de cada tubo, CO₂ dispensado, solventes y pigmentos (deben ser 0). */
export function conservedPhoto(w: PhotoWorld): Record<string, number> {
  const out = conservedDiv(w);
  const m = w.photo;
  for (const id of TUBES) {
    const t = m.tubes[id];
    out[`C:${id}`] = t.dicInitialUmol - (t.dicUmol + t.biomassUmol);
    out[`O2:${id}`] = t.biomassUmol - (t.o2GasUmol + t.o2LeakUmol);
  }
  for (const id of BTB) {
    const t = m.btb[id];
    out[`C:${id}`] = t.fillUmol + t.addedUmol - (t.dicUmol + t.biomassUmol);
    out[`O2:${id}`] = t.biomassUmol - t.o2Umol;
  }
  for (const [id, s] of Object.entries(m.solvents)) out[`solvent:${id}`] = s.initialMl - (s.ml + s.usedMl);
  for (const q of PIGMENTS) out[`pigment:${q}`] = m.ledgerInitial[q] - ledgerTotal(m.ledger, q);
  return out;
}

export function photoSummary(w: PhotoWorld) {
  const m = w.photo;
  return {
    ...divSummary(w),
    h: TUBES.map((id) => Math.round(m.tubes[id].hMm * 100)),
    btb: BTB.map((id) => btbColorOf(w, id)),
    front: Math.round(m.paper.frontMm * 10),
    readings: m.readings.length,
  };
}

// ─────────────────────────── Creación ───────────────────────────

export interface PhotoWorldExtras {
  modules: PhotoState['modules'];
  sprigs: Record<string, Sprig>;
  rateFactor: number;
  solventMl: Record<string, number>;
  assetScope: string[];
  radiusCertified: boolean;
}

export const emptyPaper = (): PaperState => ({
  cut: false, originMm: null, originTool: null, spots: 0, large: false, wetRespot: false, lastSpotAt: null, eluentMm: 0, eluent: null, hung: false, tiltDeg: 0, chamberClosed: false, developS: 0, frontMm: 0, removedAt: null,
  frontMarkMm: null, frontLost: false, submerged: false, offEdge: false, evaporated: false, bandMarks: {},
});
const emptyTube = (tempC: number): GasTube => ({
  sprig: null, mL: 0, label: '', bubble: false, stopper01: 0, contact01: 0, capConnected: false, plugCleared: false, levelDeg: 6, tempC, hMm: 0, dicUmol: 0, biomassUmol: 0, o2GasUmol: 0, o2LeakUmol: 0, dicInitialUmol: 0,
  perturbMm: 0, baselineId: null, finalId: null, opened: false, stirredAt: null,
});
const emptyBtb = (): BtbTube => ({ sprig: null, mL: 0, drops: 0, dicUmol: 0, addedUmol: 0, biomassUmol: 0, o2Umol: 0, fillUmol: 0, baselineId: null, finalId: null });

export function createPhotoWorld(spec: OpticalWorldSpec, cx: CellWorldExtras, dx: DivWorldExtras, x: PhotoWorldExtras): PhotoWorld {
  const w = createDivWorld(spec, cx, dx) as PhotoWorld;
  const ambient = spec.params.photo!.ambientC;
  w.photo = {
    modules: x.modules, hypothesis: { recorded: false, variable: '' }, sprigs: x.sprigs, rateFactor: x.rateFactor,
    tubes: { gL: emptyTube(ambient), gD: emptyTube(ambient) }, covers: {}, controls: null, runStartedAt: null,
    lamps: { lampG: { on: false, powerPct: 80 }, lampB: { on: false, powerPct: 80 } },
    btb: { bN: emptyBtb(), bL: emptyBtb(), bD: emptyBtb() }, seriesStartedAt: null, co2DispensedUmol: 0,
    hood: { on: true, sashOk: true },
    solvents: Object.fromEntries(Object.entries(x.solventMl).map(([k, v]) => [k, { open: false, ml: v, initialMl: v, usedMl: 0 }])),
    leaf: { weighedG: null, transferredG: 0, strokes: 0 },
    sep: { acetoneMl: 0, waterMl: 0, hydroMl: 0, closed: false, mix01: 0, settledAt: null, aspirated: false, contaminated: false },
    ledger: emptyLedger(), ledgerInitial: { caro: 0, xant: 0, chlA: 0, chlB: 0 }, vialReady: false, vialExposed: false,
    paper: emptyPaper(), readings: [], assetScope: x.assetScope, radiusCertified: x.radiusCertified, seq: 0,
  };
  return w;
}

