/**
 * Interacción de F102: gestos del ratón → comandos físicos. Trabaja en cm de mesada y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: el carro se arrastra A LO LARGO del riel y, al abrir la mano, sale con la
 *   velocidad que llevaba la mano (empujón real, F102-E02); la base de cada compuerta se desliza por el carril y su
 *   cabeza se gira; el émbolo del lanzador se tira hacia atrás hasta una muesca; el tornillo del pie se gira; la
 *   prensa del electroimán se sube o se baja por la columna; la cabeza del sensor se inclina.
 * - Piezas que se toman y se sueltan: al soltar, la pose decide el acople (polea, portapesas, carro, polo del
 *   electroimán con su desplazamiento lateral real, eje de la torre a la altura real de la mano, otro filtro con su
 *   corrimiento real, almohadilla, bandeja, soporte).
 * - Clic en una escala: lectura con la dirección REAL de la cámara (paralaje).
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clearSpotNear } from '../interaction/solidFloor';
import { clampToBench } from '../interaction/viewport';
import type { F102Host } from './host';
import type { F102Lab3D } from './F102Lab3D';
import type { F102Command, F102DispatchResult } from '../../simulation/f102-world/commands';
import type { F102ObjKind, F102World, Pose } from '../../simulation/f102-world/types';
import { GEOF102, trackS } from '../../simulation/f102-world/geometry';
import { cartMoving, filterStack } from '../../simulation/f102-world/world';
import { RACK_POS, TRAY_POS, rackSlot } from '../../practices/practice-f102/definition';
import { PULLEY_AXIS, TR, TW, cartPos, gatePos, hungPose, magnetPoleZ, railZAt, towerBodyPose } from './layout';

export interface PickHitF {
  id: string;
  part?: string;
}

export interface ViewAdapterF {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  solidPush?(id: string, cur: { x: number; y: number }, x: number, y: number, resting: readonly string[], grounded: boolean, point?: boolean): { x: number; y: number };
  solidFloor?(id: string, cur: { x: number; y: number; z: number }, x: number, y: number, resting: readonly string[]): number;
  pick(sx: number, sy: number, excludeId?: string | null): PickHitF | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

export interface HeldF {
  id: string;
  kind: F102ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'cart' | 'gateBase' | 'gateHead' | 'plunger' | 'foot' | 'magnetSlider' | 'sensorHead' | 'inclinometer';
interface Knob {
  kind: KnobKind;
  id: string;
  sx: number;
  sy: number;
  lastY: number;
  lastX: number;
  moved: boolean;
  /** Historial (t, s) de la mano sobre el carro para estimar su velocidad al soltar. */
  trail: Array<[number, number]>;
  acc: number;
}

const GRAB_KINDS = new Set<F102ObjKind>(['hanger', 'slotMass', 'cartBar', 'sphere', 'filter', 'pad']);
const CARRY_Z: Partial<Record<F102ObjKind, number>> = { hanger: 14, slotMass: 12, cartBar: 10, sphere: 30, filter: 30, pad: 8 };
const FOOT: Partial<Record<F102ObjKind, number>> = { hanger: 1.8, slotMass: 1.8, cartBar: 4, sphere: 1.3, filter: 6, pad: 6 };
const CLICK_PX = 6;

export class F102Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F102Host, private lab: F102Lab3D) {}

  private get w(): F102World {
    return this.host.runtime.world;
  }

  private dispatch(c: F102Command): F102DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f102.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F102Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
    const r = this.run(this.dispatch(c));
    if (sound && r.ok) this.host.sound(sound);
    return r;
  }

  // ─────────────── Vista: dirección real del ojo ───────────────

  private cam() {
    const c = this.lab.camera?.position();
    return c ? { ...c, z: c.z + this.lab.eyeOffsetCm } : { x: 0, y: -80, z: 60 };
  }

  /** Ángulo (°) entre la vista y la normal de una escala frontal (cara hacia el operador, −y), con signo. */
  frontViewDeg(x: number, y: number, z: number): number {
    const c = this.cam();
    const v = { x: c.x - x, y: c.y - y, z: c.z - z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    const ang = (Math.acos(Math.max(-1, Math.min(1, -v.y / len))) * 180) / Math.PI;
    return ang * (v.x >= 0 ? 1 : -1);
  }

  /** Elevación (°) del ojo respecto de un punto de una escala vertical (0 = a la altura del puntero). */
  elevationDeg(x: number, y: number, z: number): number {
    const c = this.cam();
    return (Math.atan2(c.z - z, Math.hypot(c.x - x, c.y - y)) * 180) / Math.PI;
  }

  // ─────────────── Lecturas y botones ───────────────

  readRuler(target: 'gate1' | 'gate2' | 'flag', mark: 'index' | 'edge' = 'index') {
    const w = this.w;
    const p = target === 'flag' ? cartPos(w) : gatePos(w, target);
    const r = this.send({ type: 'readRuler', target, mark, viewDeg: this.frontViewDeg(p.x, p.y - TR.w / 2, p.z) });
    if (r.ok) this.host.onLens?.('track01');
    return r;
  }

  readTowerScale() {
    const w = this.w;
    const r = this.send({ type: 'readTowerScale', viewDeg: this.elevationDeg(TW.x, TW.y, magnetPoleZ(w)) });
    if (r.ok) this.host.onLens?.('tower01');
    return r;
  }

  readInclinometer() {
    const r = this.send({ type: 'readInclinometer' });
    if (r.ok) this.host.onLens?.('inclinometer01');
    return r;
  }

  readGateTimer() {
    const r = this.send({ type: 'readGateTimer' });
    if (r.ok) this.host.onLens?.('gateTimer01');
    return r;
  }

  readFallTimer() {
    const r = this.send({ type: 'readFallTimer' });
    if (r.ok) this.host.onLens?.('photocell01');
    return r;
  }

  toggleTape() {
    const w = this.w;
    const r = this.send({ type: w.tape.running ? 'stopTape' : 'startTape' });
    if (r.ok && !w.tape.running) this.host.onLens?.('tapeTimer01');
    return r;
  }

  toggleMotion() {
    const w = this.w;
    const r = this.send({ type: w.motion.capture ? 'stopMotion' : 'startMotion' });
    if (r.ok && !w.motion.capture) this.host.onLens?.('motionSensor01');
    return r;
  }

  /** Atajar el carro (si se mueve) o soltarlo quieto (si está retenido). */
  catchOrRelease() {
    const w = this.w;
    if (w.cart.held) return this.send({ type: 'releaseCart', pushMs: 0 }, null);
    return this.send({ type: 'holdCart', sCm: w.cart.s * 100 }, 'clink');
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
    if (this.blocked()) return true;
    if (this.held) {
      this.release();
      return true;
    }
    const knob = this.knobFor(hit);
    if (knob) {
      this.knob = { kind: knob, id: hit.id, sx, sy, lastY: sy, lastX: sx, moved: false, trail: [], acc: 0 };
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
      if (!k.moved && k.kind === 'cart' && !this.w.cart.held) this.send({ type: 'holdCart', sCm: this.w.cart.s * 100 }, 'clink');
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
    if (this.held && !this.held.keyboard) this.release();
  }

  onWheel(dy: number): boolean {
    const notch = dy > 0 ? 1 : -1;
    if (this.held) {
      this.held.z = Math.max(0, Math.min(150, this.held.z - notch * 2));
      return true;
    }
    if (this.hovered === 'track01' && this.hoveredPart === 'foot') {
      this.send({ type: 'turnFootScrew', turns: -notch }, null);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, perillas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    switch (id) {
      case 'track01':
        if (part === 'foot') return this.send({ type: 'turnFootScrew', turns: 1 }, null);
        return this.lab.camera?.eyeLevel('track01');
      case 'launcher01':
        if (part === 'latch') return this.send({ type: 'pullLatch' }, 'metal');
        return;
      case 'cart01':
        if (part === 'flag') return this.readRuler('flag');
        if (part === 'hook') return this.send({ type: 'attachString', on: !w.string.attached });
        return this.catchOrRelease();
      case 'gate1':
      case 'gate2':
        if (part === 'index' || part === 'edge') return this.readRuler(id, part);
        if (part === 'plug') return this.send({ type: 'connectGate', gateId: id, on: !w.gateTimer.connected[id] });
        return this.lab.camera?.eyeLevel('track01');
      case 'gateTimer01':
        if (part === 'arm') return this.send({ type: 'armGateTimer' });
        if (part === 'read') return this.readGateTimer();
        return this.lab.camera?.eyeLevel('gateTimer01');
      case 'pulley01':
        return this.send({ type: 'seatString', on: !w.string.onWheel });
      case 'tapeTimer01':
        if (part === 'tape') return this.send({ type: 'attachTape', on: !w.tape.attached });
        if (part === 'tension') return this.send({ type: 'tensionTape' });
        if (part === 'switch') return this.toggleTape();
        return;
      case 'inclinometer01':
        if (part === 'zero') return this.send({ type: 'zeroInclinometer' });
        return this.readInclinometer();
      case 'tower01':
        if (part === 'scale') return this.readTowerScale();
        return this.lab.camera?.eyeLevel('tower01');
      case 'magnet01':
        if (part === 'clamp') return this.send({ type: 'tightenClamp', on: !w.magnet.clampTight }, 'metal');
        if (part === 'switch') return this.send({ type: 'switchMagnet', on: !w.magnet.on });
        if (part === 'arm') return this.send({ type: 'swingMagnetArm', armIn: !w.magnet.armIn }, 'metal');
        return this.readTowerScale();
      case 'photocell01':
        if (part === 'cap') return this.send({ type: 'capPhotocell', on: !w.photocellCapped });
        if (part === 'arm') return this.send({ type: 'armFallTimer' });
        if (part === 'read') return this.readFallTimer();
        return this.lab.camera?.eyeLevel('photocell01');
      case 'motionSensor01':
        if (part === 'plug') return this.send({ type: 'connectMotion', on: !w.motion.connected });
        if (part === 'range') return this.send({ type: 'setMotionRange', range: w.motion.range === 'near' ? 'far' : 'near' });
        if (part === 'rate') return this.send({ type: 'setMotionRate', hz: w.motion.rateHz === 10 ? 50 : 10 });
        if (part === 'cal') return this.send({ type: 'calibrateMotion' });
        if (part === 'rec') return this.toggleMotion();
        return this.lab.camera?.eyeLevel('motionSensor01');
    }
    const o = this.obj(id);
    if (o && (o.kind === 'filter' || o.kind === 'sphere') && o.support === 'magnet01') return this.send({ type: 'pickUpBody', id });
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    if (hit.id === 'cart01' && (hit.part === 'body' || !hit.part)) return 'cart';
    if ((hit.id === 'gate1' || hit.id === 'gate2') && hit.part === 'base') return 'gateBase';
    if ((hit.id === 'gate1' || hit.id === 'gate2') && hit.part === 'head') return 'gateHead';
    if (hit.id === 'launcher01' && hit.part === 'plunger') return 'plunger';
    if (hit.id === 'track01' && hit.part === 'foot') return 'foot';
    if (hit.id === 'magnet01' && hit.part === 'slider') return 'magnetSlider';
    if (hit.id === 'motionSensor01' && hit.part === 'head') return 'sensorHead';
    if (hit.id === 'inclinometer01' && hit.part === 'body') return 'inclinometer';
    return null;
  }

  /** Coordenada s del riel bajo el puntero (m). */
  private sUnder(sx: number, sy: number): number {
    const p = this.view!.toBench(sx, sy, railZAt(this.w, TR.xLauncher - 70) + 2);
    return trackS(p.x);
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'cart': {
        const s = this.sUnder(sx, sy);
        this.dispatch({ type: 'holdCart', sCm: s * 100 });
        k.trail.push([this.now, w.cart.s]);
        if (k.trail.length > 30) k.trail.shift();
        break;
      }
      case 'gateBase':
        this.run(this.dispatch({ type: 'setGatePos', gateId: k.id, sCm: this.sUnder(sx, sy) * 100 }));
        break;
      case 'gateHead': {
        const g = w.gates[k.id];
        this.dispatch({ type: 'setGateYaw', gateId: k.id, yawDeg: g.yawDeg + (sx - k.lastX) * 0.25 });
        break;
      }
      case 'plunger':
        // Tirar del émbolo hacia el lanzador (+x en pantalla) por la distancia recorrida.
        k.acc = Math.max(0, Math.min(3.4, (sx - k.sx) * 0.05));
        break;
      case 'foot': {
        k.acc += (k.lastY - sy) / 14;
        const turns = Math.trunc(k.acc);
        if (turns) {
          this.dispatch({ type: 'turnFootScrew', turns });
          k.acc -= turns;
        }
        break;
      }
      case 'magnetSlider': {
        const h = w.magnet.h * 100 + (k.lastY - sy) * 0.3;
        this.run(this.dispatch({ type: 'setMagnetHeight', hCm: h }));
        break;
      }
      case 'sensorHead':
        this.dispatch({ type: 'aimMotion', aimDeg: w.motion.aimDeg + (sx - k.lastX) * 0.1 });
        break;
      case 'inclinometer':
        break;
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    const w = this.w;
    if (k.kind === 'cart') {
      // Velocidad de la mano en los últimos 0,12 s (si se detuvo antes de soltar, sale quieto).
      const recent = k.trail.filter(([t]) => this.now - t < 0.12);
      const v = recent.length >= 2 ? (recent[recent.length - 1][1] - recent[0][1]) / Math.max(0.016, recent[recent.length - 1][0] - recent[0][0]) : 0;
      this.send({ type: 'releaseCart', pushMs: Math.abs(v) < 0.005 ? 0 : v }, null);
      if (Math.abs(v) > 0.02) this.hintOnce('f102.hint.letGo');
    } else if (k.kind === 'plunger') {
      const n = Math.round(k.acc);
      if (n > 0) this.send({ type: 'cockLauncher', notchCm: n }, 'metal');
    } else if (k.kind === 'inclinometer' && this.pointer && this.view) {
      const p = this.view.toBench(this.pointer.x, this.pointer.y, RAIL_Z_GUESS);
      const onTrack = Math.abs(p.y - TR.y) < TR.w && p.x > 14 && p.x < TR.xLauncher;
      this.send({ type: 'placeInclinometer', where: onTrack ? 'track' : 'bench' });
      if (onTrack && !w.inclinometer.zeroed) this.hintOnce('f102.hint.zeroFirst');
    }
  }

  onKeyDown(key: string, shift: boolean): boolean {
    const k = key.toLowerCase();
    const h = this.held;
    if (h) {
      const step = shift ? 10 : 2;
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      const d = { ArrowLeft: [-step / 2, 0], ArrowRight: [step / 2, 0], ArrowUp: [0, step / 2], ArrowDown: [0, -step / 2] }[key];
      if (d) {
        h.x += d[0];
        h.y += d[1];
        return true;
      }
      if (k === '+' || key === 'PageUp') return (h.z = Math.min(150, h.z + step)), true;
      if (k === '-' || key === 'PageDown') return (h.z = Math.max(0, h.z - step)), true;
      return false;
    }
    switch (k) {
      case ' ': return this.catchOrRelease(), true;
      case 'g': return this.readGateTimer(), true;
      case 'a': return this.send({ type: 'armGateTimer' }), true;
      case 't': return this.toggleTape(), true;
      case 'm': return this.send({ type: 'switchMagnet', on: !this.w.magnet.on }), true;
      case 'f': return this.readFallTimer(), true;
      case 'h': return this.readTowerScale(), true;
      case 'n': return this.readInclinometer(), true;
      case 'r': return this.toggleMotion(), true;
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
      if (sel && GRAB_KINDS.has(this.w.objects[sel]?.kind as F102ObjKind)) return this.grab(sel, true);
    }
    return false;
  }

  onKeyUp(): boolean {
    return false;
  }

  // ─────────────── Tomar y soltar ───────────────

  /** Toma una pieza: si estaba acoplada (cordel, portapesas, carro, electroimán), primero se desacopla. */
  grab(id: string, keyboard = false): boolean {
    const w = this.w;
    const o = this.obj(id);
    if (!o || !GRAB_KINDS.has(o.kind) || this.blocked()) return false;
    if (this.held) this.release();
    const vis = hungPose(w, id) ?? towerBodyPose(w, id);
    if (o.kind === 'hanger' && (o.support === 'string' || o.support === 'floor') && !this.run(this.dispatch({ type: 'hangHanger', on: false })).ok) return false;
    if (o.kind === 'slotMass' && o.support === 'hanger01' && !this.run(this.dispatch({ type: 'loadMass', massId: id, on: false })).ok) return false;
    if (o.kind === 'cartBar' && o.support === 'cart01' && !this.run(this.dispatch({ type: 'loadBar', barId: id, on: false })).ok) return false;
    if ((o.kind === 'sphere' || o.kind === 'filter') && (o.support === 'magnet01' || o.support === 'pad01' || o.support === 'base')) {
      if (!this.run(this.dispatch({ type: 'pickUpBody', id })).ok) return false;
    }
    if (o.support === 'air') return false;
    const from = { pose: { ...o.pose }, support: o.support };
    const start = vis ? { ...o.pose, ...vis } : o.pose;
    const r = this.dispatch({ type: 'setPose', id, pose: { ...start }, support: 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    const z0 = Math.max(start.z + 2, CARRY_Z[o.kind] ?? start.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: start.z, x: start.x, y: start.y, keyboard, from };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'slotMass' || o.kind === 'hanger' || o.kind === 'cartBar' ? 'metal' : 'click');
    if (o.kind === 'sphere') this.hintOnce('f102.hint.sphere');
    if (o.kind === 'filter') this.hintOnce('f102.hint.filter');
    return true;
  }

  release() {
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
    this.layOnBench(h.id, h.from.pose.x, h.from.pose.y);
  }

  /** Destino al soltar según lo que haya debajo (el dominio decide si el acople es posible). */
  place(h: HeldF, p: Pose) {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    const id = h.id;
    const axis = { x: TW.x, y: TW.y };
    switch (h.kind) {
      case 'hanger':
        if (p.x < 8 && Math.abs(p.y - TR.y) < 10) {
          const r = this.send({ type: 'hangHanger', on: true }, 'metal');
          if (r.ok) return;
        }
        if (near(RACK_POS, 12)) return void this.send({ type: 'setPose', id, pose: { x: RACK_POS.x + 9.5, y: RACK_POS.y, z: 0, rotationRad: 0 }, support: 'rack' }, 'metal');
        break;
      case 'slotMass': {
        const hp = hungPose(w, 'hanger01') ?? w.objects.hanger01.pose;
        if (near(hp, 5) && w.objects.hanger01.support !== 'hand') {
          const r = this.send({ type: 'loadMass', massId: id, on: true }, 'metal');
          if (r.ok) return;
        }
        if (near(RACK_POS, 12)) {
          const i = Object.keys(w.objects).filter((k) => w.objects[k].kind === 'slotMass').indexOf(id);
          return void this.send({ type: 'setPose', id, pose: rackSlot(Math.max(0, i)), support: 'rack' }, 'metal');
        }
        break;
      }
      case 'cartBar':
        if (near(cartPos(w), 8)) {
          const r = this.send({ type: 'loadBar', barId: id, on: true }, 'metal');
          if (r.ok) return;
        }
        break;
      case 'sphere':
      case 'filter': {
        const pole = magnetPoleZ(w);
        if (w.magnet.on && w.magnet.armIn && near(axis, 3) && Math.abs(p.z - pole) < 6) {
          const r = this.send({ type: 'attachToMagnet', id, offsetMm: (p.x - axis.x) * 10 }, 'clink');
          if (r.ok) return;
        }
        if (h.kind === 'filter') {
          const other = Object.keys(w.filters).find((f) => f !== id && !filterStack(w, id).includes(f) && w.objects[f].support !== 'air' && w.objects[f].support !== 'hand' && near(w.objects[f].pose, 4));
          if (other) {
            const r = this.send({ type: 'stackFilter', filterId: id, onto: other, offsetMm: Math.hypot(p.x - w.objects[other].pose.x, p.y - w.objects[other].pose.y) * 10 }, 'click');
            if (r.ok) return;
          }
        }
        // Soltar sobre el eje de la torre: cae desde la altura real a la que estaba la mano.
        if (near(axis, 12) && p.z > 8) {
          const r = this.send({ type: 'dropByHand', id, heightCm: p.z, offsetMm: (p.x - axis.x) * 10, pushMs: 0 }, null);
          if (r.ok) return;
        }
        if (h.kind === 'sphere' && near(TRAY_POS, 10)) {
          return void this.send({ type: 'setPose', id, pose: { x: p.x, y: TRAY_POS.y, z: GEOF102.tray.h, rotationRad: 0 }, support: 'tray' }, 'clink');
        }
        break;
      }
      case 'pad':
        if (near(axis, 10)) return void this.send({ type: 'setPose', id, pose: { x: axis.x, y: axis.y, z: TW.baseH, rotationRad: 0 }, support: 'base' });
        break;
    }
    this.layOnBench(id, p.x, p.y);
  }

  private occupied(x: number, y: number, r: number, exclude: string): boolean {
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support !== 'bench') continue;
      const rr = FOOT[o.kind];
      if (rr && Math.hypot(x - o.pose.x, y - o.pose.y) < rr + r + 0.3) return true;
    }
    // El carril y la base de la torre no son lugar de apoyo.
    if (x > 8 && x < TR.xLauncher + 20 && Math.abs(y - TR.y) < TR.w / 2 + 3 + r) return true;
    if (Math.abs(x - TW.x) < TW.baseW / 2 + r && Math.abs(y - TW.y) < TW.baseD / 2 + r) return true;
    return false;
  }

  private freeSpot(x: number, y: number, r: number, exclude: string) {
    for (let k = 0; k < 16; k++) {
      const ty = Math.max(3, Math.min(60, y + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 3));
      if (!this.occupied(x, ty, r, exclude)) return { x, y: ty };
      for (const dx of [-4, 4, -8, 8, -12, 12]) if (!this.occupied(x + dx, ty, r, exclude)) return { x: x + dx, y: ty };
    }
    return { x, y: 50 };
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench').map((o) => o.id);
  }

  private bodyFloor(id: string, x: number, y: number): number {
    const body = this.obj(id);
    if (!body) return 0;
    return this.view?.solidFloor?.(id, body.pose, x, y, this.restingIds()) ?? 0;
  }

  layOnBench(id: string, x0: number, y0: number) {
    const o = this.obj(id);
    const r = FOOT[o?.kind ?? 'filter'] ?? 1;
    const c = clampToBench(x0, y0);
    const free = this.freeSpot(c.x, c.y, r, id);
    const spot = clearSpotNear((x, y) => this.bodyFloor(id, x, y), free.x, free.y, 0);
    this.dispatch({ type: 'setPose', id, pose: { x: spot.x, y: spot.y, z: 0, rotationRad: 0 }, support: 'bench' });
    this.host.sound('click');
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const k = this.knob;
    // Con la mano sobre el carro quieta, el historial sigue registrando la posición (para la velocidad al soltar).
    if (k?.kind === 'cart' && k.moved) {
      k.trail.push([this.now, this.w.cart.s]);
      if (k.trail.length > 30) k.trail.shift();
    }
    const h = this.held;
    this.dockTarget = null;
    if (!h || !this.obj(h.id) || !this.view) return;
    if (!h.keyboard && this.pointer) {
      const p = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
      h.x = p.x;
      h.y = p.y;
    }
    const o = this.obj(h.id)!;
    // Sobre el borde izquierdo (polea) y la torre la mano puede salir de la mesada.
    const offBench = h.x < 8 || (Math.abs(h.x - TW.x) < 14 && Math.abs(h.y - TW.y) < 14);
    const onBench = offBench ? { x: Math.max(-12, h.x), y: Math.max(2, Math.min(62, h.y)) } : clampToBench(h.x, h.y);
    let tx = onBench.x;
    let ty = onBench.y;
    // Lo que se lleva en la mano choca con el carril, la torre y los aparatos macizos (contrato común de la mesada).
    const pushed = offBench ? null : this.view.solidPush?.(h.id, o.pose, tx, ty, this.restingIds(), false, false);
    if (pushed) {
      tx = pushed.x;
      ty = pushed.y;
    }
    const floor = offBench ? (h.x < 0 ? -80 : 0) : Math.max(0, this.bodyFloor(h.id, tx, ty));
    const tz = Math.max(h.z, floor);
    const kk = Math.min(1, dt * 16);
    const nx = o.pose.x + (tx - o.pose.x) * kk;
    const ny = o.pose.y + (ty - o.pose.y) * kk;
    h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
    if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004) {
      this.dispatch({ type: 'setPose', id: h.id, pose: { x: nx, y: ny, z: h.curZ, rotationRad: 0 }, support: 'hand' });
    }
    this.dockTarget = this.dockAt(h, nx, ny);
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** Acople que ocurriría al soltar aquí (resaltado en modo guiado). */
  private dockAt(h: HeldF, x: number, y: number): string | null {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(x - a.x, y - a.y) < r;
    if (h.kind === 'hanger' && x < 8 && Math.abs(y - PULLEY_AXIS.y) < 10) return 'pulley01';
    if (h.kind === 'slotMass' && near(hungPose(w, 'hanger01') ?? w.objects.hanger01.pose, 5)) return 'hanger01';
    if (h.kind === 'cartBar' && near(cartPos(w), 8)) return 'cart01';
    if ((h.kind === 'sphere' || h.kind === 'filter') && near({ x: TW.x, y: TW.y }, 12)) return w.magnet.on && w.magnet.armIn ? 'magnet01' : 'tower01';
    return null;
  }

  /** ¿El carro se mueve? (el panel ofrece «atajar»). */
  cartMoving(): boolean {
    return cartMoving(this.w);
  }
}

/** Altura de referencia del plano del puntero sobre el carril (cm). */
const RAIL_Z_GUESS = TR.railZ + 2;
