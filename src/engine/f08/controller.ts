/**
 * Interacción de F08: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: la plataforma se gira con la mano (arrastre horizontal, solo con la guarda
 *   abierta y el rotor quieto); cada masa corrediza se arrastra a lo largo de la barra; el tope y la fotopuerta suben y
 *   bajan por la columna (arrastre vertical); el sensor de tensión gira sobre su soporte.
 * - Clic en el freno, la traba de la base, la guarda, la polea, los fijadores o los botones de los sensores: el comando
 *   correspondiente. Clic en el transportador o en la regla radial: lectura con la dirección REAL de la cámara.
 * - Las pesas de caída se toman del estante y la pose al soltar decide: sobre el plato → pesar; bajo la polea → colgar
 *   del gancho; si no, al estante. Lo que se lleva en la mano no atraviesa los aparatos macizos ni sale de la mesada.
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F08Host } from './host';
import type { F08Lab3D } from './F08Lab3D';
import type { CaliperTarget, Channel, F08Command, F08DispatchResult } from '../../simulation/f08-world/commands';
import type { DropId, F08ObjKind, F08World, Pose, SlideId, SolidId } from '../../simulation/f08-world/types';
import { busyF8, spinningF8 } from '../../simulation/f08-world/world';
import { dropLine, eyePoint, homeOf, objRoom, panRoom, slideRoom, solidAngle } from './layout';

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
  kind: F08ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'hub' | 'slide' | 'catch' | 'gate' | 'tension';
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
const PORT: Record<string, Channel> = { portE: 'encoder', portT: 'tension', portW: 'tach', portG: 'gate' };
const SOLIDS: SolidId[] = ['disc01', 'ring01', 'bar01'];

export class F08Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Compatibilidad con la vista común: F08 no arrastra piezas fuera de la mano. */
  ghost: { id: string; x: number; y: number; z: number } | null = null;
  /** Última masa corrediza tocada (la regla radial mide esa) y último sólido tocado (el calibre mide ese). */
  lastSlide: SlideId = 'slide1';
  lastSolid: SolidId = 'disc01';
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F08Host, private lab: F08Lab3D) {}

  private get w(): F08World {
    return this.host.runtime.world;
  }

  private dispatch(c: F08Command): F08DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f08.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F08Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
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

  /** El transportador crece a lo largo de x frente al índice. */
  scaleView() {
    return this.parallax(eyePoint(this.w, 'base01'), { x: 1, y: 0, z: 0 });
  }

  /** La regla radial crece a lo largo de la barra (hacia afuera de la masa elegida). */
  radiusView(id: SlideId) {
    const a = solidAngle(this.w, 'bar01') + (id === 'slide2' ? Math.PI : 0);
    return this.parallax(slideRoom(this.w, id), { x: Math.cos(a), y: Math.sin(a), z: 0 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readScale() {
    const r = this.send({ type: 'readScale', viewDeg: this.scaleView() });
    if (r.ok) this.host.onLens?.('base01');
    return r;
  }

  readRadius(id: SlideId = this.lastSlide) {
    this.lastSlide = id;
    const r = this.send({ type: 'readRadius', id, viewDeg: this.radiusView(id) });
    if (r.ok) this.host.onLens?.('ruler01');
    return r;
  }

  readBalance() {
    const r = this.send({ type: 'readBalance' });
    if (r.ok) this.host.onLens?.('balance01');
    return r;
  }

  readSensor(type: 'readEncoder' | 'readTension' | 'readTach' | 'readGate') {
    const r = this.send({ type });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  measure(target: CaliperTarget) {
    const r = this.send({ type: 'measure', target });
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
    if (hit.id === 'slide1' || hit.id === 'slide2') this.lastSlide = hit.id;
    if ((SOLIDS as string[]).includes(hit.id)) this.lastSolid = hit.id as SolidId;
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
    if (this.hovered === 'gate01') {
      this.send({ type: 'moveGate', zCm: this.w.column.gateZ - notch * 0.5 }, null);
      return true;
    }
    if (this.hovered === 'catch01') {
      this.send({ type: 'setCatch', on: this.w.column.catchOn, zCm: this.w.column.catchZ - notch * 0.5 }, null);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, perillas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    const o = this.obj(id);
    switch (id) {
      case 'base01':
        if (part === 'clamp') return this.send({ type: 'clampBase', on: !w.base.clamped }, 'metal');
        if (part === 'protractor') return this.readScale();
        return this.send({ type: 'inspect', target: 'base01' }, null);
      case 'guard01':
        return this.send({ type: 'setGuard', closed: !w.base.guardClosed }, 'clink');
      case 'hub01':
        if (part === 'brake') return this.send({ type: 'setBrake', on: !w.rotor.brake }, 'metal');
        if (part === 'drum') return this.measure('drum');
        return this.lab.camera?.focusObject(id, false);
      case 'slide1':
      case 'slide2':
        if (part === 'lock') return this.send({ type: 'lockMass', id, on: !w.slides[id].locked }, 'metal');
        if (o?.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.readRadius(id);
      case 'ruler01':
        return this.readRadius();
      case 'pulley01':
        return this.send({ type: 'alignPulley' });
      case 'catch01':
        return this.send({ type: 'setCatch', on: !w.column.catchOn, zCm: w.column.catchZ }, 'clink');
      case 'gate01':
        if (part === 'plug') return this.send({ type: 'connect', channel: 'gate', on: !w.logger.gateConnected });
        return this.readSensor('readGate');
      case 'encoder01':
        if (part === 'zero') return this.send({ type: 'zeroEncoder' });
        if (part === 'cal') return this.send({ type: 'calibrateEncoder' });
        if (part === 'dir') return this.send({ type: 'setEncoderDir', dir: -w.encoder.dir });
        if (part === 'plug') return this.send({ type: 'connect', channel: 'encoder', on: !w.encoder.connected });
        return this.readSensor('readEncoder');
      case 'tension01':
        if (part === 'zero') return this.send({ type: 'zeroTension' });
        if (part === 'plug') return this.send({ type: 'connect', channel: 'tension', on: !w.tension.connected });
        return this.readSensor('readTension');
      case 'tach01':
        if (part === 'range') return this.send({ type: 'setTachRange', n: (w.tach.rangeIdx + 1) % w.params.tach.ranges.length });
        if (part === 'plug') return this.send({ type: 'connect', channel: 'tach', on: !w.tach.connected });
        return this.readSensor('readTach');
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part === 'readE') return this.readSensor('readEncoder');
        if (part === 'readT') return this.readSensor('readTension');
        if (part === 'readW') return this.readSensor('readTach');
        if (part === 'readG') return this.readSensor('readGate');
        if (part && PORT[part]) {
          const ch = PORT[part];
          const on = ch === 'encoder' ? w.encoder.connected : ch === 'tension' ? w.tension.connected : ch === 'tach' ? w.tach.connected : w.logger.gateConnected;
          return this.send({ type: 'connect', channel: ch, on: !on });
        }
        return this.host.onLens?.('logger01');
      case 'caliper01': {
        const s = this.lastSolid;
        return this.measure(s === 'bar01' ? 'drum' : s);
      }
      case 'balance01':
        if (part === 'tare') return this.send({ type: 'tareBalance' });
        if (part === 'read') return this.readBalance();
        if (part === 'pan' && w.balance.on) return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.lab.camera?.eyeLevel('balance01');
      case 'column01':
        return this.lab.camera?.eyeLevel('column01');
    }
    if (o?.kind === 'solid') {
      if (o.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
      if (o.support === 'hub' && part === 'center') return this.send({ type: 'centerSolid' });
      return this.lab.camera?.focusObject(id, false);
    }
    if (o?.kind === 'dropMass') {
      if (o.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
      if (o.support === 'hook') return this.lab.camera?.focusObject('column01', false);
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    const w = this.w;
    if (hit.id === 'hub01' && hit.part !== 'brake' && hit.part !== 'drum' && !spinningF8(w) && !busyF8(w)) return 'hub';
    if ((hit.id === 'slide1' || hit.id === 'slide2') && hit.part !== 'lock' && w.objects[hit.id].support === 'bar01') return 'slide';
    if (hit.id === 'catch01') return 'catch';
    if (hit.id === 'gate01' && hit.part !== 'plug') return 'gate';
    if (hit.id === 'tension01' && hit.part === 'body') return 'tension';
    return null;
  }

  /** Altura (cm de la sala) bajo el puntero sobre el plano vertical de la columna. */
  private zAt(sx: number, sy: number, fallbackDz: number) {
    const p = this.view?.toWall?.(sx, sy, dropLine(this.w).y);
    return p ? p.z : fallbackDz;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'hub':
        this.run(this.dispatch({ type: 'turnByHand', deg: (sx - k.lastX) * 0.5 }));
        break;
      case 'slide': {
        // Proyección del puntero sobre la barra: radio desde el centro hacia el lado de esa masa.
        const id = k.id as SlideId;
        const c = objRoom(w, 'bar01');
        const p = this.view!.toBench(sx, sy, c.z);
        const a = solidAngle(w, 'bar01') + (id === 'slide2' ? Math.PI : 0);
        const rCm = (p.x - c.x) * Math.cos(a) + (p.y - c.y) * Math.sin(a);
        if (Math.abs(rCm - w.slides[id].r * 100) > 0.05) this.run(this.dispatch({ type: 'slideMass', id, rCm }));
        break;
      }
      case 'catch': {
        const z = this.zAt(sx, sy, w.column.catchZ + (k.lastY - sy) * 0.2);
        this.dispatch({ type: 'setCatch', on: w.column.catchOn, zCm: z });
        break;
      }
      case 'gate': {
        const z = this.zAt(sx, sy, w.column.gateZ + (k.lastY - sy) * 0.2);
        this.run(this.dispatch({ type: 'moveGate', zCm: z }));
        break;
      }
      case 'tension':
        this.dispatch({ type: 'mountTension', angleDeg: w.tension.angleDeg + (k.lastY - sy) * 0.3 });
        break;
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    if (k.kind === 'slide') this.hintOnce('f08.hint.lock');
    if (k.kind === 'gate') this.hintOnce('f08.hint.gate');
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
      case 'e': return this.readSensor('readEncoder'), true;
      case 't': return this.readSensor('readTension'), true;
      case 'w': return this.readSensor('readTach'), true;
      case 'g': return this.readSensor('readGate'), true;
      case 'f': return this.send({ type: 'setBrake', on: !this.w.rotor.brake }, 'metal'), true;
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

  // ─────────────── Tomar y soltar pesas ───────────────

  private grabbable(id: string): boolean {
    const o = this.obj(id);
    return !!o && o.kind === 'dropMass' && o.support === 'massRack';
  }

  grab(id: string, keyboard = false): boolean {
    const o = this.obj(id);
    if (!o || !this.grabbable(id) || this.blocked()) return false;
    if (this.held) this.drop();
    const start = objRoom(this.w, id);
    const from = { pose: { ...o.pose }, support: o.support };
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
    this.dispatch({ type: 'setPose', id, pose: { ...homeOf(id), rotationRad: 0 }, support: 'massRack' });
    this.host.sound('clink');
  }

  /** Lugar al que se acopla lo que se suelta en `p` (o null: vuelve al estante). */
  private targetFor(p: { x: number; y: number; z: number }): string | null {
    const w = this.w;
    const d = (q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    if (d(panRoom()) < 9 && !w.balance.on) return 'balance01';
    if (d(dropLine(w)) < 10 && !w.string.mass) return 'pulley01';
    return null;
  }

  /** Destino al soltar: sobre el plato, en el gancho o al estante. */
  place(h: HeldF, p: Pose) {
    const target = this.targetFor(p);
    this.toRack(h.id);
    if (target === 'balance01') return void this.send({ type: 'placeOnBalance', id: h.id }, 'clink');
    if (target === 'pulley01') {
      const r = this.send({ type: 'hangMass', id: h.id as DropId, on: true }, 'clink');
      if (r.ok) this.hintOnce('f08.hint.catch');
    }
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench' || o.support === 'massRack').map((o) => o.id);
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
    this.dockTarget = this.targetFor({ x: nx, y: ny, z: h.curZ });
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** ¿Hay un ensayo en curso? (el panel desactiva los cambios de montaje). */
  busy(): boolean {
    return busyF8(this.w);
  }
}
