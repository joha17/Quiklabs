/**
 * Interacción de F04: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: el tornillo de nivel se gira (rueda o arrastre vertical); las compuertas, el
 *   freno y el tope se arrastran a lo largo del carril; el sensor A se inclina sobre su gancho; la mano que empuja al
 *   carro P se arrastra: cuanto más largo el gesto, mayor la fuerza del empuje.
 * - Pesas ranuradas y portapesas: se toman y, al soltarlos, la pose decide (sobre el portapesas o el carro → cargar;
 *   sobre el plato → pesar; bajo la polea → colgar del cordel; estante → guardar). Lo que se lleva en la mano no
 *   atraviesa los aparatos macizos ni sale de la mesada.
 * - Clic en el índice de una compuerta: lectura de la escala con la dirección REAL de la cámara (paralaje).
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F04Host } from './host';
import type { F04Lab3D } from './F04Lab3D';
import type { F04Command, F04DispatchResult, ForceId, SensorId } from '../../simulation/f04-world/commands';
import type { F04ObjKind, F04World, Pose } from '../../simulation/f04-world/types';
import { GEOF04, trackS } from '../../simulation/f04-world/geometry';
import { SLOT_MASSES, runningF4 } from '../../simulation/f04-world/world';
import { cartRoom, dropX, eyePoint, hangerRackPose, hangerRoom, objRoom, panRoom, rackSlot } from './layout';

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
  kind: F04ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'screw' | 'gate' | 'brake' | 'stop' | 'sensorTilt' | 'hand' | 'cartPush';
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
const PORT: Record<string, SensorId | 'gates'> = { portA: 'forceA', portAcc: 'accel01', portG: 'gates', portP: 'dynP', portQ: 'dynQ' };
const T = GEOF04.track;

export class F04Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Fuerza del empuje que se está preparando con la mano (N), para la ayuda en pantalla. */
  pushPreview: number | null = null;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F04Host, private lab: F04Lab3D) {}

  private get w(): F04World {
    return this.host.runtime.world;
  }

  private dispatch(c: F04Command): F04DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f04.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F04Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
    const r = this.run(this.dispatch(c));
    if (sound && r.ok) this.host.sound(sound);
    return r;
  }

  // ─────────────── Vista: dirección real del ojo ───────────────

  private cam() {
    const c = this.lab.camera?.position();
    return c ? { ...c, z: c.z + this.lab.eyeOffsetCm } : { x: 0, y: -200, z: 60 };
  }

  /** Ángulo (°) entre la vista y la normal `n` de una escala, con signo (lado + o − del plano de la escala). */
  viewDeg(p: { x: number; y: number; z: number }, n: { x: number; y: number; z: number }, side: { x: number; y: number; z: number }): number {
    const c = this.cam();
    const v = { x: c.x - p.x, y: c.y - p.y, z: c.z - p.z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    const cos = (v.x * n.x + v.y * n.y + v.z * n.z) / len;
    const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    return ang * (v.x * side.x + v.y * side.y + v.z * side.z >= 0 ? 1 : -1);
  }

  /**
   * Escala del carril en el índice de la compuerta: la cara mira al operador (−y). El paralaje que importa es a lo
   * largo del carril (x): el signo dice de qué lado del índice está el ojo.
   */
  scaleView(id: 'gate1' | 'gate2') {
    const p = eyePoint(this.w, id);
    const c = this.cam();
    const v = { x: c.x - p.x, y: c.y - p.y, z: c.z - p.z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return (Math.asin(Math.max(-1, Math.min(1, v.x / len))) * 180) / Math.PI;
  }

  // ─────────────── Lecturas y botones ───────────────

  readScale(id: 'gate1' | 'gate2') {
    const r = this.send({ type: 'readScale', target: id, viewDeg: this.scaleView(id) });
    if (r.ok) this.host.onLens?.(id);
    return r;
  }

  readBalance() {
    const r = this.send({ type: 'readBalance' });
    if (r.ok) this.host.onLens?.('balance01');
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
      this.held.z = Math.max(0, Math.min(60, this.held.z - notch * 2));
      return true;
    }
    if (this.hovered === 'track01' && this.hoveredPart === 'screw') {
      this.send({ type: 'turnLevelScrew', turns: -notch }, null);
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
        if (part === 'screw') return this.send({ type: 'turnLevelScrew', turns: 1 }, null);
        return this.lab.camera?.focusObject(id, false);
      case 'cart01':
        if (part === 'clip') return this.send({ type: 'clipCable', on: !w.logger.cableClipped });
        if (w.balance.on === 'cart01') return this.send({ type: 'removeFromBalance' }, 'clink');
        if (!w.cart.latched) return this.send({ type: 'returnCart' }, 'clink');
        if (!w.string.attached) return this.send({ type: 'attachString', on: true });
        return this.lab.camera?.eyeLevel('cart01');
      case 'latch01':
        return this.release();
      case 'brake01':
        if (part === 'switch') return this.send({ type: 'setBrake', on: !w.brake.on }, 'metal');
        return this.lab.camera?.focusObject(id, false);
      case 'pulley01':
        if (part === 'clamp') return this.send({ type: 'clampPulley', on: !w.string.clamped }, 'metal');
        if (part === 'axle') return this.send({ type: 'threadString', path: 'axle' });
        if (w.string.path === 'none' || w.string.path === 'axle') return this.send({ type: 'threadString', path: 'groove' });
        if (w.string.hung && w.string.held) return this.send({ type: 'tensionString' });
        return this.lab.camera?.focusObject(id, false);
      case 'hanger01':
        if (o?.support === 'floor' || o?.support === 'balance') return this.send(o.support === 'floor' ? { type: 'hangHanger', on: false } : { type: 'removeFromBalance' }, 'clink');
        if (w.string.hung && w.string.held) return this.send({ type: 'tensionString' });
        if (w.string.hung && w.cart.latched) return this.send({ type: 'hangHanger', on: false }, 'clink');
        if (o?.support === 'rack') return this.send({ type: 'hangHanger', on: true }, 'clink');
        return undefined;
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part && PORT[part]) {
          const ch = PORT[part];
          const on = ch === 'gates' ? w.logger.gatesConnected : w.sensors[ch].connected;
          return this.send({ type: 'connect', channel: ch, on: !on });
        }
        return this.host.onLens?.('logger01');
      case 'gate1':
      case 'gate2':
        if (part === 'index') return this.readScale(id);
        return this.lab.camera?.eyeLevel(id);
      case 'balance01':
        if (part === 'tare') return this.send({ type: 'tareBalance' });
        if (part === 'read') return this.readBalance();
        if (part === 'pan' && w.balance.on) return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.lab.camera?.eyeLevel('balance01');
      case 'cartP':
        if (part === 'hand') return this.send({ type: 'push', forceN: 3, durationS: 0.3 }, 'click');
        if (w.balance.on === 'cartP') return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.send({ type: 'resetPair' });
      case 'cartQ':
        if (w.balance.on === 'cartQ') return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.send({ type: 'readPair' });
    }
    if (o?.kind === 'forceSensor' || o?.kind === 'accelerometer') {
      const sid = id as SensorId;
      if (part === 'zero') return this.send({ type: 'zeroSensor', id: sid });
      if (part === 'cal' && o.kind === 'forceSensor') return this.send({ type: 'calibrateSensor', id: sid as ForceId });
      if (part === 'plug') return this.send({ type: 'connect', channel: sid, on: !w.sensors[sid].connected });
      if (o.kind === 'forceSensor' && id !== 'forceA' && part === 'body') return this.send({ type: 'setAxisSign', id: sid as ForceId, sign: w.sensors[sid].axisSign === 1 ? -1 : 1 });
    }
    if (o?.kind === 'slotMass') {
      if (o.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
      if (o.support === 'rack') return this.send({ type: 'placeMass', id, on: 'hanger' }, 'clink');
      return this.send({ type: 'placeMass', id, on: 'rack' }, 'clink');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    if (hit.id === 'track01' && hit.part === 'screw') return 'screw';
    if ((hit.id === 'gate1' || hit.id === 'gate2') && hit.part === 'mount') return 'gate';
    if (hit.id === 'brake01' && hit.part === 'body') return 'brake';
    if (hit.id === 'stop01') return 'stop';
    if (hit.id === 'forceA' && hit.part === 'body') return 'sensorTilt';
    if (hit.id === 'cartP' && hit.part === 'hand') return 'hand';
    if (hit.id === 'cart01' && hit.part === 'body' && this.w.cart.latched && this.w.cart.on === 'track') return 'cartPush';
    return null;
  }

  /** s del carril bajo el puntero (proyección sobre el plano del riel). */
  private sAt(sx: number, sy: number) {
    const p = this.view!.toBench(sx, sy, T.railZ);
    return trackS(p.x);
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'screw': {
        k.acc += (k.lastY - sy) / 14;
        const turns = Math.trunc(k.acc);
        if (turns) {
          this.dispatch({ type: 'turnLevelScrew', turns });
          k.acc -= turns;
        }
        break;
      }
      case 'gate':
        this.run(this.dispatch({ type: 'moveGate', id: k.id as 'gate1' | 'gate2', s: this.sAt(sx, sy) }));
        break;
      case 'brake':
        this.run(this.dispatch({ type: 'moveBrake', s: this.sAt(sx, sy) - GEOF04.brake.len / 2 }));
        break;
      case 'stop':
        this.run(this.dispatch({ type: 'moveStop', s: this.sAt(sx, sy) }));
        break;
      case 'sensorTilt':
        this.dispatch({ type: 'mountSensor', id: 'forceA', angleDeg: w.sensors.forceA.angleDeg + (k.lastY - sy) * 0.3 });
        break;
      case 'hand':
        // Arrastrar la mano hacia la derecha prepara el empuje: el largo del gesto da la fuerza máxima.
        k.acc = Math.max(0, Math.min(10, (sx - k.sx) * 0.05));
        this.pushPreview = k.acc;
        break;
      case 'cartPush':
        // Empujar el carro con la mano hacia la polea (−x): el gesto da la rapidez inicial (F04-E09 si se usa).
        k.acc = Math.max(0, Math.min(1.5, (k.sx - sx) * 0.006));
        break;
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    if (k.kind === 'hand') {
      this.pushPreview = null;
      const f = Math.round(k.acc * 10) / 10;
      if (f >= 0.2) this.send({ type: 'push', forceN: f, durationS: 0.3 }, 'click');
    }
    if (k.kind === 'cartPush' && k.acc >= 0.05) this.send({ type: 'pushCart', ms: Math.round(k.acc * 100) / 100 }, 'metal');
    if (k.kind === 'gate') this.hintOnce('f04.hint.readScaleFront');
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
      if (k === '+' || key === 'PageUp') return (h.z = Math.min(60, h.z + step)), true;
      if (k === '-' || key === 'PageDown') return (h.z = Math.max(0, h.z - step)), true;
      return false;
    }
    switch (k) {
      case ' ': return this.release(), true;
      case 'r': return this.send({ type: 'returnCart' }, 'clink'), true;
      case 'f': return this.send({ type: 'setBrake', on: !this.w.brake.on }, 'metal'), true;
      case 'b': return this.readBalance(), true;
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
      this.send({ type: 'turnLevelScrew', turns: key === 'ArrowUp' ? 1 : -1 }, null);
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

  // ─────────────── Tomar y soltar pesas y portapesas ───────────────

  private grabbable(id: string): boolean {
    const o = this.obj(id);
    if (!o) return false;
    if (o.kind === 'slotMass') return o.support === 'rack' || o.support === 'hanger01' || o.support === 'cart01';
    if (o.kind === 'hanger') return o.support === 'rack' || o.support === 'floor';
    return false;
  }

  grab(id: string, keyboard = false): boolean {
    const o = this.obj(id);
    if (!o || !this.grabbable(id) || this.blocked()) return false;
    if (o.kind === 'slotMass' && o.support === 'hanger01' && this.w.string.hung && !this.w.string.held && !this.w.string.landed && runningF4(this.w)) return false;
    if (this.held) this.drop();
    const start = objRoom(this.w, id);
    const from = { pose: { ...o.pose }, support: o.support };
    const pose = { x: start.x, y: start.y, z: start.z, rotationRad: 0 };
    if (o.kind === 'slotMass' && o.support !== 'rack') this.dispatch({ type: 'placeMass', id, on: 'rack' });
    if (o.kind === 'hanger' && o.support === 'floor') this.dispatch({ type: 'hangHanger', on: false });
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
    const i = SLOT_MASSES.indexOf(id as (typeof SLOT_MASSES)[number]);
    const p = i >= 0 ? rackSlot(i) : hangerRackPose();
    this.dispatch({ type: 'setPose', id, pose: { ...p, rotationRad: 0 }, support: 'rack' });
    this.host.sound('clink');
  }

  /** Destino al soltar según la pose: portapesas, carro, plato de la balanza, bajo la polea o el estante. */
  place(h: HeldF, p: Pose) {
    const w = this.w;
    const near = (q: { x: number; y: number }, r: number) => Math.hypot(p.x - q.x, p.y - q.y) < r;
    this.toRack(h.id);
    if (h.kind === 'slotMass') {
      if (w.string.hung || w.objects.hanger01.support === 'rack') {
        if (near(hangerRoom(w), 7)) return void this.send({ type: 'placeMass', id: h.id, on: 'hanger' }, 'clink');
      }
      if (near(cartRoom(w), 10)) return void this.send({ type: 'placeMass', id: h.id, on: 'cart' }, 'clink');
      if (near(panRoom(), 9)) return void this.send({ type: 'placeOnBalance', id: h.id }, 'clink');
      return;
    }
    // Portapesas: bajo la polea → colgar del cordel; sobre el plato → pesar.
    if (Math.abs(p.x - dropX()) < 12 && Math.abs(p.y - T.y) < 12) return void this.send({ type: 'hangHanger', on: true }, 'clink');
    if (near(panRoom(), 9)) return void this.send({ type: 'placeOnBalance', id: h.id }, 'clink');
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench').map((o) => o.id);
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const h = this.held;
    this.dockTarget = null;
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
    const w = this.w;
    const d = (q: { x: number; y: number }) => Math.hypot(nx - q.x, ny - q.y);
    this.dockTarget =
      h.kind === 'hanger' && Math.abs(nx - dropX()) < 12 ? 'pulley01'
        : d(panRoom()) < 9 ? 'balance01'
          : h.kind === 'slotMass' && d(hangerRoom(w)) < 7 ? 'hanger01'
            : h.kind === 'slotMass' && d(cartRoom(w)) < 10 ? 'cart01' : null;
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** ¿Hay un ensayo en curso? (el panel desactiva los cambios de montaje). */
  busy(): boolean {
    return runningF4(this.w);
  }
}
