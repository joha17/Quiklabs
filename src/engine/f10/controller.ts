/**
 * Interacción de F10: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Lo que se lleva en la mano: la viga (del soporte de guardado, la cuña o el pórtico) y el portapesas (del estante).
 *   La pose al soltar decide: viga sobre los apoyos, en la cuña o bajo el gancho del pórtico; portapesas sobre la viga
 *   (en la coordenada s bajo el puntero) o en el gancho del dinamómetro; si no, de vuelta a su lugar. Lo que se lleva no
 *   atraviesa los aparatos macizos ni sale de la mesada.
 * - Mandos con su grado de libertad real: cada apoyo se corre a lo largo del riel, la carga a lo largo de la viga, la
 *   viga sobre la cuña, la manivela de la prensa con un arrastre vertical (o la rueda), el dinamómetro y el comparador
 *   se inclinan con un arrastre.
 * - Clic en trabas, filos, ganchos, mordazas, freno, palanca, protector, puertos o botones: el comando correspondiente.
 *   Clic en una escala (cinta, dinamómetro): lectura con la dirección REAL de la cámara.
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F10Host } from './host';
import type { F10Lab3D } from './F10Lab3D';
import type { Channel, F10Command, F10DispatchResult, TapeTarget } from '../../simulation/f10-world/commands';
import type { F10ObjKind, F10World, Pose, SupportId } from '../../simulation/f10-world/types';
import { GEOF10 } from '../../simulation/f10-world/geometry';
import { busyF10, pressGrippedF10, tippingF10 } from '../../simulation/f10-world/world';
import { eyePoint, homeOf, objRoom, tapePoint } from './layout';

export interface PickHitF {
  id: string;
  part?: string;
}

export interface ViewAdapterF {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  /** Punto del plano vertical y = `y` bajo el puntero (x, z en cm de la sala). */
  toWall?(sx: number, sy: number, y: number): { x: number; z: number };
  solidPush?(id: string, cur: { x: number; y: number }, x: number, y: number, resting: readonly string[], grounded: boolean, point?: boolean): { x: number; y: number };
  solidFloor?(id: string, cur: { x: number; y: number; z: number }, x: number, y: number, resting: readonly string[]): number;
  pick(sx: number, sy: number, excludeId?: string | null): PickHitF | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

export interface HeldF {
  id: string;
  kind: F10ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'support' | 'load' | 'wedge' | 'crank' | 'aim' | 'gauge';
interface Knob {
  kind: KnobKind;
  id: string;
  sx: number;
  sy: number;
  lastY: number;
  lastX: number;
  moved: boolean;
}

const CLICK_PX = 6;
const PORT: Record<string, Channel> = { portCells: 'cells', portPress: 'press', portGauge: 'gauge' };
const G = GEOF10;
/** Recorrido de la manivela por píxel de arrastre (mm). */
const CRANK_MM_PX = 0.002;

export class F10Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Compatibilidad con la vista común: F10 no deja fantasmas. */
  ghost: { id: string; x: number; y: number; z: number } | null = null;
  /** Último blanco de la cinta (un apoyo, la carga, el centro de masa en la cuña o el largo calibrado). */
  lastTape: TapeTarget = 'supA';
  /** Probeta que se mide con el calibre. */
  lastSpecimen = 'spec1';
  /** Paso de la manivela con el teclado o la rueda (mm). */
  crankStep = 0.02;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F10Host, private lab: F10Lab3D) {}

  private get w(): F10World {
    return this.host.runtime.world;
  }

  private dispatch(c: F10Command): F10DispatchResult {
    return this.host.runtime.dispatch(c);
  }

  private blocked(): boolean {
    return this.w.safety.stoppedByTeacher;
  }

  obj(id: string) {
    return this.w.objects[id] ?? null;
  }

  private hintOnce(key: string, level: 'info' | 'warn' = 'info', params?: Record<string, unknown>) {
    if (this.hinted.has(key) || !this.host.guidedHints()) return;
    this.hinted.add(key);
    this.host.notify(level, key, params);
  }

  private warn(key: string, gapS = 3, params?: Record<string, unknown>) {
    if (this.now - (this.lastWarn.get(key) ?? -99) < gapS) return;
    this.lastWarn.set(key, this.now);
    this.host.notify('warn', key, params);
  }

  run<R extends { ok: boolean; code?: string }>(r: R): R {
    if (!r.ok && r.code) this.warn(`f10.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F10Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
    const r = this.run(this.dispatch(c));
    if (sound && r.ok) this.host.sound(sound);
    return r;
  }

  // ─────────────── Vista: dirección real del ojo ───────────────

  private cam() {
    const c = this.lab.camera?.position();
    return c ? { ...c, z: c.z + this.lab.eyeOffsetCm } : { x: 0, y: -200, z: 60 };
  }

  /** Paralaje (°, con signo) entre la vista y la normal de la escala, medido a lo largo del eje en que la escala crece. */
  private parallax(p: { x: number; y: number; z: number }, axis: { x: number; y: number; z: number }) {
    const c = this.cam();
    const v = { x: c.x - p.x, y: c.y - p.y, z: c.z - p.z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return (Math.asin(Math.max(-1, Math.min(1, (v.x * axis.x + v.y * axis.y + v.z * axis.z) / len))) * 180) / Math.PI;
  }

  tapeView(t: TapeTarget) {
    const r = tapePoint(this.w, t);
    return this.parallax(r.p, r.axis);
  }

  /** La escala del dinamómetro crece hacia abajo (eje z de la sala). */
  dynView() {
    return this.parallax(eyePoint(this.w, 'dyn01'), { x: 0, y: 0, z: -1 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readTape(t: TapeTarget = this.lastTape) {
    this.lastTape = t;
    const r = this.send({ type: 'readTape', target: t, viewDeg: this.tapeView(t) });
    if (r.ok) this.host.onLens?.('tape01');
    return r;
  }

  readDyn() {
    const r = this.send({ type: 'readDyn', viewDeg: this.dynView() });
    if (r.ok) this.host.onLens?.('dyn01');
    return r;
  }

  readCell(id: SupportId) {
    const r = this.send({ type: 'readCell', id });
    if (r.ok) this.host.onLens?.(id === 'A' ? 'supportA' : 'supportB');
    return r;
  }

  readCaliper(id = this.lastSpecimen) {
    this.lastSpecimen = id;
    const r = this.send({ type: 'readCaliper', id });
    if (r.ok) this.host.onLens?.('caliper01');
    return r;
  }

  readPress(type: 'readLoadCell' | 'readGauge' | 'readCurve') {
    const r = this.send({ type });
    if (r.ok) this.host.onLens?.(type === 'readGauge' ? 'gauge01' : 'logger01');
    return r;
  }

  cycleRate() {
    const rates = this.w.params.rates;
    const i = rates.indexOf(this.w.logger.rateHz);
    return this.send({ type: 'setRate', hz: rates[(i + 1) % rates.length] });
  }

  toggleLog() {
    return this.w.run && !this.w.run.done ? this.send({ type: 'stopLog' }) : this.send({ type: 'startLog' });
  }

  /** Manivela: nueva posición del travesaño (mm). */
  crankTo(mm: number) {
    const r = this.run(this.dispatch({ type: 'setCrank', mm: Math.max(0, Math.min(this.w.params.crankMaxMm, mm)) }));
    if (r.ok && pressGrippedF10(this.w)) this.hintOnce('f10.hint.fit');
    return r;
  }

  cycleGaugeMount() {
    const g = this.w.gauge;
    const next = g.mounted === null ? 'axial' : g.mounted === 'axial' ? 'transverse' : null;
    return this.send({ type: 'mountGauge', axis: next }, 'clink');
  }

  // ─────────────── Puntero ───────────────

  onPointerDown(sx: number, sy: number, button: number): boolean {
    if (button !== 0 || !this.view) return false;
    this.pointer = { x: sx, y: sy };
    const hit = this.view.pick(sx, sy, this.held?.id ?? null);
    if (!hit) {
      if (!this.held) this.host.select(null);
      return false;
    }
    this.host.select(hit.id);
    if (hit.id === 'supportA') this.lastTape = 'supA';
    if (hit.id === 'supportB') this.lastTape = 'supB';
    if (hit.id === 'load1' && this.w.loads.load1.where === 'beam') this.lastTape = 'load1';
    if (hit.id === 'beam01' && this.w.beam.where === 'wedge') this.lastTape = 'cg';
    if (hit.id === 'spec1' || hit.id === 'spec2') this.lastSpecimen = hit.id;
    if (this.blocked()) return true;
    if (this.held) {
      this.drop();
      return true;
    }
    const knob = this.knobFor(hit);
    if (knob) {
      this.knob = { kind: knob, id: hit.id, sx, sy, lastY: sy, lastX: sx, moved: false };
      this.view.setOrbitEnabled(false);
    }
    this.downAt = { x: sx, y: sy, ...hit };
    return true;
  }

  onPointerMove(sx: number, sy: number) {
    this.pointer = { x: sx, y: sy };
    const k = this.knob;
    if (k) {
      if (!k.moved && Math.hypot(sx - k.sx, sy - k.sy) < CLICK_PX) return;
      k.moved = true;
      this.driveKnob(k, sx, sy);
      return;
    }
    const d = this.downAt;
    if (d && !this.held && Math.hypot(sx - d.x, sy - d.y) >= CLICK_PX) {
      this.downAt = null;
      this.grab(d.id);
      return;
    }
    if (!this.held && this.view) {
      const h = this.view.pick(sx, sy, null);
      this.hovered = h?.id ?? null;
      this.hoveredPart = h?.part ?? null;
    }
  }

  onPointerUp() {
    const k = this.knob;
    if (k) {
      this.knob = null;
      this.view?.setOrbitEnabled(true);
      if (!k.moved) this.click(k.id, this.downAt?.part);
      else this.endKnob(k);
      this.downAt = null;
      return;
    }
    const d = this.downAt;
    this.downAt = null;
    if (d) {
      this.click(d.id, d.part);
      return;
    }
    if (this.held && !this.held.keyboard) this.drop();
  }

  onWheel(dy: number): boolean {
    const notch = dy > 0 ? 1 : -1;
    if (this.held) {
      this.held.z = Math.max(0, Math.min(140, this.held.z - notch * 2));
      return true;
    }
    if (this.hovered === 'crank01') {
      this.crankTo(this.w.press.target - notch * this.crankStep);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, trabas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    const o = this.obj(id);
    switch (id) {
      case 'rail01':
        return this.lab.camera?.focusObject(id, false);
      case 'supportA':
      case 'supportB': {
        const sid: SupportId = id === 'supportA' ? 'A' : 'B';
        if (part === 'clamp') return this.send({ type: 'clampSupport', id: sid, on: !w.supports[sid].clamped }, 'metal');
        if (part === 'knife') return this.send({ type: 'tightenKnife', id: sid }, 'metal');
        if (part === 'cell') return this.readCell(sid);
        return this.readTape(sid === 'A' ? 'supA' : 'supB');
      }
      case 'beam01': {
        const b = w.beam;
        if (b.tipped && !tippingF10(w)) return this.send({ type: 'resetBeam' }, 'clink');
        if (w.damaged) return this.send({ type: 'repairBeam' }, 'metal');
        if (b.where === 'supports') {
          if (!b.seated) return this.send({ type: 'seatBeam' }, 'clink');
          return this.send({ type: 'steadyBeam', on: !b.hand }, null);
        }
        if (b.where === 'gantry') return this.send({ type: 'placeBeam', where: 'rack' }, 'clink');
        if (b.where === 'wedge') return this.readTape('cg');
        return this.lab.camera?.focusObject(id, false);
      }
      case 'load1': {
        const L = w.loads.load1;
        if (part === 'hook') return this.send({ type: 'closeHook', id: 'load1', on: !L.hookClosed }, 'clink');
        if (L.where === 'beam') return this.send({ type: 'unhangLoad', id: 'load1' }, 'clink');
        if (L.where === 'gantry') return this.send({ type: 'unhangDyn' }, 'clink');
        if (L.where === 'bench') return this.send({ type: 'recoverLoad', id: 'load1' }, 'clink');
        return this.lab.camera?.focusObject(id, false);
      }
      case 'gantry01':
        if (w.dyn.holding) return this.send({ type: 'unhangDyn' }, 'clink');
        return this.lab.camera?.focusObject(id, false);
      case 'dyn01':
        if (part === 'zero') return this.send({ type: 'zeroDyn' });
        if (part === 'aim') return this.send({ type: 'aimDyn', deg: Math.abs(w.dyn.aimDeg) > 0.5 ? 0 : 15 });
        if (part === 'hook' && w.dyn.holding) return this.send({ type: 'unhangDyn' }, 'clink');
        return this.readDyn();
      case 'wedge01':
        if (w.beam.where === 'wedge') return this.readTape('cg');
        return this.lab.camera?.focusObject(id, false);
      case 'level01':
        return this.send({ type: 'levelBench' }, 'metal');
      case 'tape01':
        return this.readTape();
      case 'caliper01':
        return this.readCaliper();
      case 'rack01':
        return this.lab.camera?.focusObject(id, false);
      case 'spec1':
      case 'spec2':
        if (w.press.specimen === id) {
          if (part === 'body' && pressGrippedF10(w)) return this.readTape('L0');
          return this.send({ type: 'removeSpecimen' }, 'clink');
        }
        if (o?.support !== 'press' && w.press.specimen) return this.readCaliper(id);
        return this.send({ type: 'installSpecimen', id }, 'clink');
      case 'press01':
        return this.lab.camera?.focusObject(id, false);
      case 'gripTop':
      case 'gripBottom': {
        const top = id === 'gripTop';
        if (part === 'align') return this.send({ type: 'alignGrips' }, 'metal');
        return this.send({ type: 'clampGrip', grip: top ? 'top' : 'bottom', on: !(top ? w.press.gripTop : w.press.gripBottom) }, 'metal');
      }
      case 'crank01':
        if (part === 'lock') return this.send({ type: 'lockCrank', on: !w.press.crankLocked }, 'metal');
        if (part === 'release') return this.send({ type: 'releaseCrank' }, 'metal');
        return this.crankTo(w.press.target + this.crankStep);
      case 'shield01':
        return this.send({ type: 'setShield', closed: !w.press.shieldClosed }, 'clink');
      case 'loadCell01':
        if (part === 'zero') return this.send({ type: 'zeroLoadCell' });
        if (part === 'range') return this.send({ type: 'setCellRange', n: (w.loadCell.rangeIdx + 1) % w.params.loadCell.ranges.length });
        return this.readPress('readLoadCell');
      case 'gauge01':
        if (part === 'zero') return this.send({ type: 'zeroGauge' });
        if (part === 'cal') return this.send({ type: 'calibrateGauge' });
        if (part === 'mount') return this.cycleGaugeMount();
        if (part === 'clip') return this.send({ type: 'routeCable', on: !w.gauge.cableRouted }, 'clink');
        if (!w.gauge.mounted) return this.cycleGaugeMount();
        return this.readPress('readGauge');
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part === 'rec') return this.toggleLog();
        if (part === 'curve') return this.readPress('readCurve');
        if (part && PORT[part]) {
          const ch = PORT[part];
          const on = ch === 'cells' ? w.cells.connected : ch === 'press' ? w.loadCell.connected : w.gauge.connected;
          return this.send({ type: 'connect', channel: ch, on: !on });
        }
        return this.host.onLens?.('logger01');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    const w = this.w;
    if ((hit.id === 'supportA' || hit.id === 'supportB') && (hit.part === 'body' || !hit.part)) {
      const sid: SupportId = hit.id === 'supportA' ? 'A' : 'B';
      return w.supports[sid].clamped ? null : 'support';
    }
    if (hit.id === 'load1' && hit.part !== 'hook' && w.loads.load1.where === 'beam' && !tippingF10(w)) return 'load';
    if (hit.id === 'beam01' && w.beam.where === 'wedge') return 'wedge';
    if (hit.id === 'crank01' && hit.part === 'wheel') return 'crank';
    if (hit.id === 'dyn01' && hit.part === 'aim') return 'aim';
    if (hit.id === 'gauge01' && hit.part === 'body' && w.gauge.mounted) return 'gauge';
    return null;
  }

  /** Coordenada s de la viga (cm) bajo el puntero, a la altura `z`. */
  private beamSAt(sx: number, sy: number, z: number, x0 = G.beam.x0) {
    if (this.view?.toWall) return this.view.toWall(sx, sy, G.beam.y).x - x0;
    return this.view!.toBench(sx, sy, z).x - x0;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'support': {
        const sid: SupportId = k.id === 'supportA' ? 'A' : 'B';
        const s = Math.round(this.beamSAt(sx, sy, G.support.z) * 10) / 10;
        if (Math.abs(s - w.supports[sid].s) > 0.05) this.run(this.dispatch({ type: 'setSupport', id: sid, sCm: s }));
        break;
      }
      case 'load': {
        const s = Math.round(this.beamSAt(sx, sy, G.support.z) * 10) / 10;
        if (Math.abs(s - w.loads.load1.s) > 0.05) this.run(this.dispatch({ type: 'moveLoad', id: 'load1', sCm: s }));
        break;
      }
      case 'wedge': {
        // Arrastrar la viga sobre la cuña: el filo queda en otra coordenada s (la viga se corre en sentido contrario).
        const dx = this.beamSAt(sx, sy, G.wedge.z, 0) - this.beamSAt(k.lastX, k.lastY, G.wedge.z, 0);
        if (Math.abs(dx) > 0.02) this.run(this.dispatch({ type: 'slideOnWedge', sCm: w.beam.wedgeS - dx }));
        break;
      }
      case 'crank':
        this.crankTo(w.press.target + (k.lastY - sy) * CRANK_MM_PX);
        break;
      case 'aim':
        this.dispatch({ type: 'aimDyn', deg: w.dyn.aimDeg + (sx - k.lastX) * 0.3 });
        break;
      case 'gauge':
        this.dispatch({ type: 'tiltGauge', deg: w.gauge.angleDeg + (sx - k.lastX) * 0.2 });
        break;
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    if (k.kind === 'support') this.hintOnce('f10.hint.clamp');
    if (k.kind === 'load' && !this.w.loads.load1.hookClosed) this.hintOnce('f10.hint.hook', 'warn');
  }

  onKeyDown(key: string, shift: boolean): boolean {
    const k = key.toLowerCase();
    const h = this.held;
    if (h) {
      const step = shift ? 10 : 2;
      if (key === 'Enter') return this.drop(), true;
      if (key === 'Escape') return this.cancel(), true;
      const d = { ArrowLeft: [-step / 2, 0], ArrowRight: [step / 2, 0], ArrowUp: [0, step / 2], ArrowDown: [0, -step / 2] }[key];
      if (d) {
        h.x += d[0];
        h.y += d[1];
        return true;
      }
      if (k === '+' || key === 'PageUp') return (h.z = Math.min(140, h.z + step)), true;
      if (k === '-' || key === 'PageDown') return (h.z = Math.max(0, h.z - step)), true;
      return false;
    }
    switch (k) {
      case 'd': return this.readDyn(), true;
      case 't': return this.readTape(), true;
      case 'a': return this.readCell('A'), true;
      case 'b': return this.readCell('B'), true;
      case 'f': return this.readPress('readLoadCell'), true;
      case 'g': return this.readPress('readGauge'), true;
      case 'r': return this.toggleLog(), true;
      case 'c': return this.readPress('readCurve'), true;
      case 'pageup': return this.crankTo(this.w.press.target + this.crankStep), true;
      case 'pagedown': return this.crankTo(this.w.press.target - this.crankStep), true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const ids = Object.values(this.w.objects).sort((a, b) => a.pose.x - b.pose.x || a.pose.y - b.pose.y).map((o) => o.id);
      const cur = this.host.getSelected();
      const i = cur ? ids.indexOf(cur) : -1;
      const next = ids[(i + (key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
      this.host.select(next);
      this.lab.camera?.focusObject(next, false);
      return true;
    }
    if (key === 'Enter') {
      const sel = this.host.getSelected();
      if (sel && this.grabbable(sel)) return this.grab(sel, true);
    }
    return false;
  }

  onKeyUp(): boolean {
    return false;
  }

  // ─────────────── Tomar y soltar la viga o el portapesas ───────────────

  grabbable(id: string): boolean {
    const w = this.w;
    if (id === 'load1') return w.loads.load1.where === 'rack';
    if (id === 'beam01') {
      const b = w.beam;
      if (b.tipped || b.pivot || w.loads.load1.where === 'beam') return false;
      return b.where === 'rack' || b.where === 'wedge' || b.where === 'gantry' || (b.where === 'supports' && !b.hand);
    }
    return false;
  }

  grab(id: string, keyboard = false): boolean {
    const o = this.obj(id);
    if (!o || !this.grabbable(id) || this.blocked()) return false;
    if (this.held) this.drop();
    const start = id === 'beam01' ? objRoom(this.w, id) : objRoom(this.w, id);
    const from = { pose: { ...o.pose }, support: o.support };
    const z0 = id === 'load1' ? start.z + G.hanger.hook + G.hanger.stack : start.z;
    const pose = { x: start.x, y: start.y, z: z0, rotationRad: 0 };
    const r = this.dispatch({ type: 'setPose', id, pose, support: 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    this.held = { id, kind: o.kind, z: z0 + 6, curZ: z0, x: start.x, y: start.y, keyboard, from };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound('click');
    return true;
  }

  drop() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const o = this.obj(h.id);
    if (!o) return;
    this.place(h, o.pose);
  }

  cancel() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    this.release(h);
  }

  /** Devuelve la pieza a su lugar lógico (el dominio guarda dónde está la viga o la carga). */
  private release(h: HeldF) {
    const support = h.from.support === 'hand' ? 'rack' : h.from.support;
    this.dispatch({ type: 'setPose', id: h.id, pose: { ...homeOf(h.id), rotationRad: 0 }, support });
  }

  /** Lugar al que se acopla lo que se suelta en `p` (o null: vuelve a su lugar). */
  targetFor(id: string, p: { x: number; y: number; z: number }): string | null {
    const w = this.w;
    const near = (x: number, y: number, dx: number, dy: number) => Math.abs(p.x - x) < dx && Math.abs(p.y - y) < dy;
    if (id === 'beam01') {
      if (near(G.gantry.x, G.gantry.y, 20, 14) && !w.dyn.holding) return 'gantry01';
      if (near(G.wedge.x, G.wedge.y, 30, 10)) return 'wedge01';
      if (near(G.beam.x0 + G.beam.len / 2, G.rail.y, 40, 12) && p.z > G.support.z - 10) return 'rail01';
      if (near(G.beam.x0 + G.beam.len / 2, G.store.y, 60, 10)) return 'rack01';
      return null;
    }
    if (id === 'load1') {
      if (near(G.gantry.x, G.gantry.y, 10, 12) && !w.dyn.holding) return 'dyn01';
      if (w.beam.where === 'supports' && p.x > G.beam.x0 && p.x < G.beam.x0 + G.beam.len && Math.abs(p.y - G.beam.y) < 10) return 'beam01';
    }
    return null;
  }

  /** Destino al soltar. */
  place(h: HeldF, p: Pose) {
    const target = this.targetFor(h.id, p);
    this.release(h);
    if (h.id === 'beam01') {
      const where = target === 'gantry01' ? 'gantry' : target === 'wedge01' ? 'wedge' : target === 'rail01' ? 'supports' : target === 'rack01' ? 'rack' : null;
      if (!where) return void this.host.sound('clink');
      const r = this.send({ type: 'placeBeam', where }, 'clink');
      if (r.ok && where === 'supports' && !this.w.beam.seated) this.hintOnce('f10.hint.seat');
      return;
    }
    if (target === 'dyn01') return void this.send({ type: 'hangOnDyn', id: 'load1' }, 'clink');
    if (target === 'beam01') {
      const r = this.send({ type: 'hangLoad', id: 'load1', sCm: Math.round((p.x - G.beam.x0) * 10) / 10 }, 'clink');
      if (r.ok && !this.w.loads.load1.hookClosed) this.hintOnce('f10.hint.hook', 'warn');
      return;
    }
    this.host.sound('clink');
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench' || o.support === 'rack').map((o) => o.id);
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const h = this.held;
    if (!h) this.dockTarget = null;
    if (!h || !this.obj(h.id) || !this.view) return;
    if (!h.keyboard && this.pointer) {
      const p = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
      h.x = p.x;
      h.y = p.y;
    }
    const o = this.obj(h.id)!;
    // Lo que se lleva en la mano queda sobre la mesada y choca con los aparatos macizos (contrato común).
    const lim = clampToBench(h.x, h.y);
    let tx = lim.x;
    let ty = lim.y;
    const pushed = this.view.solidPush?.(h.id, o.pose, tx, ty, this.restingIds(), false, true);
    if (pushed) {
      tx = pushed.x;
      ty = pushed.y;
    }
    const tz = Math.max(h.z, 0);
    const kk = Math.min(1, dt * 16);
    const nx = o.pose.x + (tx - o.pose.x) * kk;
    const ny = o.pose.y + (ty - o.pose.y) * kk;
    h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
    if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004) {
      this.dispatch({ type: 'setPose', id: h.id, pose: { x: nx, y: ny, z: h.curZ, rotationRad: 0 }, support: 'hand' });
    }
    this.dockTarget = this.targetFor(h.id, { x: nx, y: ny, z: h.curZ });
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** ¿Hay un ensayo en curso? (el panel desactiva los cambios de montaje). */
  busy(): boolean {
    return busyF10(this.w);
  }
}
