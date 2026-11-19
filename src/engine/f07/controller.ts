/**
 * Interacción de F07: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: el tornillo de nivelación inclina el riel (arrastre vertical o rueda); las
 *   fotopuertas se arrastran a lo largo del riel; el sensor de fuerza gira sobre su soporte.
 * - Cada carro se arrastra a lo largo del riel (frenado y sin ensayo en curso); llevado contra su lanzador, el
 *   trinquete lo retiene en la muesca de cada centímetro (trabar); el gatillo lo suelta. Arrastrado hasta el plato, se
 *   pesa. Clic en el freno, la rueda, la bandera o el paragolpes: frenar, liberar o reparar, alinear, separar.
 * - Las pesas del carro se toman y la pose al soltar decide: sobre un carro → cargar; sobre el plato → pesar; si no,
 *   al estante. Lo que se lleva en la mano no atraviesa los aparatos macizos ni sale de la mesada.
 * - Clic en el nivel o en la regla de posición: lectura con la dirección REAL de la cámara (paralaje).
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F07Host } from './host';
import type { F07Lab3D } from './F07Lab3D';
import type { Channel, F07Command, F07DispatchResult, TrackGate } from '../../simulation/f07-world/commands';
import type { BumperType, CartId, F07ObjKind, F07World, Pose } from '../../simulation/f07-world/types';
import { CART_A_START, CART_B_LAUNCH, GEOF07 } from '../../simulation/f07-world/geometry';
import { busyF7, cartMovingF7 } from '../../simulation/f07-world/world';
import { cartRoom, eyePoint, objRoom, panRoom, rackSlot, rulerRoom } from './layout';

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
  kind: F07ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'screw' | 'gate' | 'sensorTilt' | 'cart';
interface Knob {
  kind: KnobKind;
  id: string;
  sx: number;
  sy: number;
  lastY: number;
  lastX: number;
  moved: boolean;
  acc: number;
  t0: number;
}

const CLICK_PX = 6;
const PORT: Record<string, Channel> = { portF: 'force', portG: 'gates', portC: 'camera' };
const BUMPERS: BumperType[] = ['spring', 'magnet', 'velcro'];
const TR = GEOF07.track;
const LA = GEOF07.launcher;
const CARTS: CartId[] = ['cartA', 'cartB'];

export class F07Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Carro llevado al plato con la mano: dónde se dibuja mientras tanto (cm de la sala) o null. */
  ghost: { id: string; x: number; y: number; z: number } | null = null;
  /** Último carro tocado: el calibre y la regla de posición miden ese. */
  lastCart: CartId = 'cartA';
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F07Host, private lab: F07Lab3D) {}

  private get w(): F07World {
    return this.host.runtime.world;
  }

  private dispatch(c: F07Command): F07DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f07.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F07Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
    const r = this.run(this.dispatch(c));
    if (sound && r.ok) this.host.sound(sound);
    return r;
  }

  // ─────────────── Vista: dirección real del ojo ───────────────

  private cam() {
    const c = this.lab.camera?.position();
    return c ? { ...c, z: c.z + this.lab.eyeOffsetCm } : { x: 0, y: -200, z: 60 };
  }

  /**
   * Paralaje de una escala que mira al operador (−y): ángulo (°) entre la vista y la normal de la escala medido a lo
   * largo del eje en que la escala crece (`axis`), con signo.
   */
  private parallax(p: { x: number; y: number; z: number }, axis: { x: number; y: number; z: number }) {
    const c = this.cam();
    const v = { x: c.x - p.x, y: c.y - p.y, z: c.z - p.z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return (Math.asin(Math.max(-1, Math.min(1, (v.x * axis.x + v.y * axis.y + v.z * axis.z) / len))) * 180) / Math.PI;
  }

  /** El nivel y la regla de posición crecen a lo largo del riel (x). */
  levelView() {
    return this.parallax(eyePoint(this.w, 'level01'), { x: 1, y: 0, z: 0 });
  }
  positionView(c: CartId) {
    return this.parallax(rulerRoom(this.w, c), { x: 1, y: 0, z: 0 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readLevel() {
    const r = this.send({ type: 'readLevel', viewDeg: this.levelView() });
    if (r.ok) this.host.onLens?.('level01');
    return r;
  }

  readPosition(c: CartId = this.lastCart) {
    const r = this.send({ type: 'readPosition', cart: c, viewDeg: this.positionView(c) });
    if (r.ok) this.host.onLens?.('ruler01');
    return r;
  }

  readBalance() {
    const r = this.send({ type: 'readBalance' });
    if (r.ok) this.host.onLens?.('balance01');
    return r;
  }

  readGates() {
    const r = this.send({ type: 'readGates' });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  readForce() {
    const r = this.send({ type: 'readForce' });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  readMotion() {
    const r = this.send({ type: 'readMotion' });
    if (r.ok) this.host.onLens?.('camera01');
    return r;
  }

  measureFlag(c: CartId = this.lastCart) {
    const r = this.send({ type: 'measureFlag', cart: c });
    if (r.ok) this.host.onLens?.('caliper01');
    return r;
  }

  release() {
    const r = this.send({ type: 'release' }, null);
    if (r.ok) this.host.sound('metal');
    return r;
  }

  cycleRate() {
    const rates = this.w.params.rates;
    const i = rates.indexOf(this.w.logger.rateHz);
    return this.send({ type: 'setRate', hz: rates[(i + 1) % rates.length] });
  }

  cycleRange() {
    const n = this.w.params.force.ranges.length;
    return this.send({ type: 'setRange', n: (this.w.sensor.rangeIdx + 1) % n });
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
    if (hit.id === 'cartA' || hit.id === 'cartB') this.lastCart = hit.id;
    if (this.blocked()) return true;
    if (this.held) {
      this.drop();
      return true;
    }
    const knob = this.knobFor(hit);
    if (knob) {
      this.knob = { kind: knob, id: hit.id, sx, sy, lastY: sy, lastX: sx, moved: false, acc: 0, t0: this.now };
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
    if (this.hovered === 'track01' && this.hoveredPart === 'screw') {
      this.send({ type: 'setLevelScrew', deg: this.w.track.screwDeg - notch * 0.02 }, null);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, perillas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    const o = this.obj(id);
    switch (id) {
      case 'track01':
        if (part === 'screw') return this.send({ type: 'setLevelScrew', deg: w.track.screwDeg + 0.02 }, null);
        return this.send({ type: 'inspect', target: 'track01' }, null);
      case 'ends01':
        return this.send({ type: 'setEndDampers', on: !w.track.endDampers }, 'clink');
      case 'launcherA':
      case 'launcherB':
        if (part === 'trigger') return this.release();
        return this.lab.camera?.eyeLevel(id);
      case 'level01':
        return this.readLevel();
      case 'cartA':
      case 'cartB': {
        const k = w.carts[id];
        this.lastCart = id;
        if (k.on === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
        if (part === 'brake') return this.send({ type: 'setCartBrake', cart: id, on: !k.brake }, 'metal');
        if (part === 'wheel') return this.send(k.damaged ? { type: 'repairCart', cart: id } : { type: 'freeWheel', cart: id }, 'metal');
        if (part === 'flag') return this.send({ type: 'alignFlag', cart: id });
        if (part === 'bumper' && w.bumper.joined) return this.send({ type: 'separateCarts' }, 'clink');
        if (cartMovingF7(w, id)) return this.send({ type: 'stopCart', cart: id }, 'click');
        return this.lab.camera?.eyeLevel(id);
      }
      case 'gateA':
      case 'gateB':
        if (part === 'clamp') return this.send({ type: 'clampGates', on: !w.track.gatesClamped }, 'metal');
        return this.readGates();
      case 'force01':
        if (part === 'zero') return this.send({ type: 'zeroSensor' });
        if (part === 'cal') return this.send({ type: 'calibrateSensor' });
        if (part === 'range') return this.cycleRange();
        if (part === 'plug') return this.send({ type: 'connect', channel: 'force', on: !w.sensor.connected });
        return this.readForce();
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part === 'readG') return this.readGates();
        if (part === 'readF') return this.readForce();
        if (part === 'readM') return this.readMotion();
        if (part && PORT[part]) {
          const ch = PORT[part];
          const on = ch === 'force' ? w.sensor.connected : ch === 'gates' ? w.logger.gatesConnected : w.logger.cameraOn;
          return this.send({ type: 'connect', channel: ch, on: !on });
        }
        return this.host.onLens?.('logger01');
      case 'camera01':
        if (!w.logger.cameraOn) return this.send({ type: 'connect', channel: 'camera', on: true });
        return this.readMotion();
      case 'ruler01':
        return this.readPosition();
      case 'caliper01':
        return this.measureFlag();
      case 'bumpers01':
        if (part === 'flip') return this.send({ type: 'flipMagnet' }, 'clink');
        if (part === 'fix') return this.send({ type: 'fixVelcro', on: !w.bumper.velcroFixed }, 'clink');
        if (part && (BUMPERS as string[]).includes(part)) return this.send({ type: 'setBumper', bumper: part as BumperType }, 'clink');
        return this.lab.camera?.focusObject(id, false);
      case 'balance01':
        if (part === 'tare') return this.send({ type: 'tareBalance' });
        if (part === 'read') return this.readBalance();
        if (part === 'pan' && w.balance.on) return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.lab.camera?.eyeLevel('balance01');
    }
    if (o?.kind === 'cartMass') {
      if (o.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
      if (o.support === 'cartA' || o.support === 'cartB') return this.send({ type: 'loadCart', id, cart: o.support, on: false }, 'clink');
      return this.send({ type: 'loadCart', id, cart: this.lastCart, on: true }, 'clink');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    const w = this.w;
    if (hit.id === 'track01' && hit.part === 'screw') return 'screw';
    if ((hit.id === 'gateA' || hit.id === 'gateB') && hit.part === 'mount') return 'gate';
    if (hit.id === 'force01' && hit.part === 'body') return 'sensorTilt';
    if ((hit.id === 'cartA' || hit.id === 'cartB') && hit.part === 'body' && w.carts[hit.id].on === 'track' && !busyF7(w) && !cartMovingF7(w, hit.id)) return 'cart';
    return null;
  }

  /** s del riel bajo el puntero (proyección sobre el plano horizontal a la altura de los carros). */
  private sAt(sx: number, sy: number) {
    const p = this.view!.toBench(sx, sy, TR.z0 + 3);
    return (p.x - TR.x0) / 100;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'screw':
        this.dispatch({ type: 'setLevelScrew', deg: w.track.screwDeg + (k.lastY - sy) * 0.004 });
        break;
      case 'gate':
        this.run(this.dispatch({ type: 'moveGate', id: k.id as TrackGate, s: this.sAt(sx, sy) }));
        break;
      case 'sensorTilt':
        this.dispatch({ type: 'mountSensor', angleDeg: w.sensor.angleDeg + (k.lastY - sy) * 0.3 });
        break;
      case 'cart': {
        // A lo largo del riel: colocar; contra su lanzador: muescas del trinquete; hacia la balanza: con la mano.
        const c = k.id as CartId;
        const p = this.view!.toBench(sx, sy, TR.z0 + 3);
        const nearPan = Math.hypot(p.x - panRoom().x, p.y - panRoom().y) < 14;
        const s = (p.x - TR.x0) / 100;
        if (nearPan || Math.abs(p.y - TR.y) > 18) {
          this.ghost = { id: c, x: p.x, y: p.y, z: nearPan ? panRoom().z : TR.z0 + 4 };
          this.dockTarget = nearPan ? 'balance01' : null;
          break;
        }
        this.ghost = null;
        const start = c === 'cartA' ? CART_A_START : CART_B_LAUNCH;
        const into = c === 'cartA' ? start - s : s - start;
        if (into > 0.004 || w.carts[c].latched) {
          this.dockTarget = c === 'cartA' ? 'launcherA' : 'launcherB';
          const cm = Math.round(Math.max(0, Math.min(LA.maxComp, into)) * 100);
          if (cm !== Math.round(w.carts[c].compression * 100)) this.run(this.dispatch({ type: 'cock', cart: c, cm }));
        } else {
          this.dockTarget = null;
          if (Math.abs(s - w.carts[c].s) > 0.002) this.run(this.dispatch({ type: 'placeCart', cart: c, s }));
        }
        break;
      }
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    const w = this.w;
    if (k.kind === 'gate') this.hintOnce('f07.hint.clamp');
    if (k.kind === 'screw') this.hintOnce('f07.hint.readLevel');
    if (k.kind === 'cart') {
      const c = k.id as CartId;
      const g = this.ghost;
      this.ghost = null;
      this.dockTarget = null;
      if (g && Math.hypot(g.x - panRoom().x, g.y - panRoom().y) < 14) this.send({ type: 'placeOnBalance', id: c }, 'clink');
      else if (w.carts[c].latched) this.hintOnce('f07.hint.trigger');
    }
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
      case ' ': return this.release(), true;
      case 'b': return this.readBalance(), true;
      case 'v': return this.readGates(), true;
      case 'f': return this.readForce(), true;
      case 'm': return this.readMotion(), true;
      case 'n': return this.readLevel(), true;
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
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      this.send({ type: 'setLevelScrew', deg: this.w.track.screwDeg + (key === 'ArrowUp' ? 0.02 : -0.02) }, null);
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

  // ─────────────── Tomar y soltar pesas ───────────────

  private grabbable(id: string): boolean {
    const o = this.obj(id);
    if (!o) return false;
    return o.kind === 'cartMass' && (o.support === 'rack' || o.support === 'cartA' || o.support === 'cartB');
  }

  /** Devuelve una pieza al estante en el dominio (descolgar, descargar). */
  private unseat(id: string) {
    const o = this.obj(id)!;
    if (o.kind === 'cartMass' && (o.support === 'cartA' || o.support === 'cartB')) this.dispatch({ type: 'loadCart', id, cart: o.support, on: false });
  }

  grab(id: string, keyboard = false): boolean {
    const o = this.obj(id);
    if (!o || !this.grabbable(id) || this.blocked()) return false;
    if (this.held) this.drop();
    const start = objRoom(this.w, id);
    const from = { pose: { ...o.pose }, support: o.support };
    this.unseat(id);
    const pose = { x: start.x, y: start.y, z: start.z, rotationRad: 0 };
    const r = this.dispatch({ type: 'setPose', id, pose, support: 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    this.held = { id, kind: o.kind, z: start.z + 6, curZ: start.z, x: start.x, y: start.y, keyboard, from };
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
    this.toRack(h.id);
  }

  private toRack(id: string) {
    this.dispatch({ type: 'setPose', id, pose: { ...rackSlot(id), rotationRad: 0 }, support: 'rack' });
    this.host.sound('clink');
  }

  /** Lugar al que se acopla lo que se suelta en `p` (o null: vuelve al estante). */
  private targetFor(kind: F07ObjKind, p: { x: number; y: number; z: number }): string | null {
    const w = this.w;
    const d = (q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    if (d(panRoom()) < 9 && !w.balance.on) return 'balance01';
    if (kind === 'cartMass') for (const c of CARTS) if (w.carts[c].on === 'track' && d(cartRoom(w, c)) < 10) return c;
    return null;
  }

  /** Destino al soltar: sobre un carro, sobre el plato o el estante. */
  place(h: HeldF, p: Pose) {
    const target = this.targetFor(h.kind, p);
    this.toRack(h.id);
    if (target === 'balance01') return void this.send({ type: 'placeOnBalance', id: h.id }, 'clink');
    if (target === 'cartA' || target === 'cartB') return void this.send({ type: 'loadCart', id: h.id, cart: target, on: true }, 'clink');
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench').map((o) => o.id);
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const h = this.held;
    if (!this.ghost && this.knob?.kind !== 'cart') this.dockTarget = null;
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
    this.dockTarget = this.targetFor(h.kind, { x: nx, y: ny, z: h.curZ });
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** ¿Hay un ensayo en curso? (el panel desactiva los cambios de montaje). */
  busy(): boolean {
    return busyF7(this.w);
  }
}

