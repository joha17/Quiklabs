/**
 * Interacción de F09: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: la masa orbitante se arrastra a lo largo de la guía y cada masa radial a lo
 *   largo de la barra (mesa quieta, guarda abierta); la perilla del motor gira con un arrastre horizontal o la rueda;
 *   el carro del dinamómetro se tensa con un arrastre vertical y su cordón se inclina con la palanca amarilla; el sensor
 *   de fuerza se inclina sobre el mástil.
 * - Clic en la traba, el nivel, la guarda, el tope, los pasadores, el freno, el embrague, las ranuras del tambor, la
 *   palanca del cordón central o los botones de los sensores: el comando correspondiente. Clic en la regla o en la
 *   escala del dinamómetro: lectura con la dirección REAL de la cámara.
 * - La masa orbitante se toma del estante y la pose al soltar decide: sobre el plato → pesar; sobre la plataforma →
 *   montarla en la guía; si no, al estante. Lo que se lleva en la mano no atraviesa los aparatos macizos ni sale de la
 *   mesada.
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F09Host } from './host';
import type { F09Lab3D } from './F09Lab3D';
import type { Channel, F09Command, F09DispatchResult, RadiusTarget } from '../../simulation/f09-world/commands';
import type { F09ObjKind, F09World, Pose, SlideId } from '../../simulation/f09-world/types';
import { GEOF09 } from '../../simulation/f09-world/geometry';
import { busyF9, spinningF9 } from '../../simulation/f09-world/world';
import { eyePoint, guideAngle, homeOf, objRoom, panRoom, rulerPoint, slideAngle } from './layout';

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
  kind: F09ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'orbit' | 'slide' | 'motor' | 'dyn' | 'aim' | 'force';
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
const PORT: Record<string, Channel> = { portE: 'encoder', portF: 'force', portG: 'gate' };
const AX = GEOF09.axis;
const RPM = 60 / (2 * Math.PI);

export class F09Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Compatibilidad con la vista común: F09 no arrastra piezas fuera de la mano. */
  ghost: { id: string; x: number; y: number; z: number } | null = null;
  /** Último blanco de la regla radial (la masa orbitante, una masa radial o el brazo del tambor). */
  lastRadius: RadiusTarget = 'orbit01';
  /** Vueltas que cronometra la fotopuerta y radio al que recoge el cordón central (cm). */
  turns = 5;
  pullTo = 6;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F09Host, private lab: F09Lab3D) {}

  private get w(): F09World {
    return this.host.runtime.world;
  }

  private dispatch(c: F09Command): F09DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f09.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F09Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
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

  /** La regla crece a lo largo de la guía, de la barra o del escalón del tambor. */
  radiusView(t: RadiusTarget) {
    const r = rulerPoint(this.w, t);
    return this.parallax(r.p, r.axis);
  }

  /** La escala del dinamómetro crece a lo largo del cordón (eje y de la sala). */
  dynView() {
    return this.parallax(eyePoint(this.w, 'dyn01'), { x: 0, y: 1, z: 0 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readRadius(t: RadiusTarget = this.lastRadius, ref: 'center' | 'edge' = 'center') {
    this.lastRadius = t;
    const r = this.send({ type: 'readRadius', target: t, ref, viewDeg: this.radiusView(t) });
    if (r.ok) this.host.onLens?.('ruler01');
    return r;
  }

  readDyn() {
    const r = this.send({ type: 'readDyn', viewDeg: this.dynView() });
    if (r.ok) this.host.onLens?.('dyn01');
    return r;
  }

  readBalance() {
    const r = this.send({ type: 'readBalance' });
    if (r.ok) this.host.onLens?.('balance01');
    return r;
  }

  readSensor(type: 'readForce' | 'readOmega' | 'readEncoder') {
    const r = this.send({ type });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  timeTurns(n = this.turns) {
    const r = this.send({ type: 'timeTurns', turns: n });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  cycleRate() {
    const rates = this.w.params.rates;
    const i = rates.indexOf(this.w.logger.rateHz);
    return this.send({ type: 'setRate', hz: rates[(i + 1) % rates.length] });
  }

  cycleBrake() {
    return this.send({ type: 'setBrake', level: (this.w.rotor.brake + 1) % 3 }, 'metal');
  }

  togglePull() {
    if (this.w.drum.pulling) return this.send({ type: 'stopPull' }, 'clink');
    const r = this.send({ type: 'startPull' }, 'metal');
    if (r.ok) this.hintOnce('f09.hint.readDyn');
    return r;
  }

  /** Perilla del motor: nueva consigna (rpm). */
  motorTo(rpm: number) {
    return this.run(this.dispatch({ type: 'setMotor', rpm: Math.max(0, Math.min(240, Math.round(rpm))) }));
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
    if (hit.id === 'slide1' || hit.id === 'slide2' || hit.id === 'orbit01') this.lastRadius = hit.id;
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
    if (this.hovered === 'motor01') {
      this.motorTo(this.w.motor.target * RPM - notch * 5);
      return true;
    }
    if (this.hovered === 'dyn01') {
      this.send({ type: 'setPull', forceN: this.w.drum.pullN - notch * 0.1 }, null);
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
        return this.lab.camera?.focusObject(id, false);
      case 'level01':
        return this.send({ type: 'levelAxis' }, 'metal');
      case 'guard01':
        return this.send({ type: 'setGuard', closed: !w.base.guardClosed }, 'clink');
      case 'hub01':
        return this.lab.camera?.focusObject(id, false);
      case 'guide01':
        if (part === 'stop') return this.send({ type: 'lockStop', on: !w.orbit.stopLocked }, 'metal');
        if (w.damaged) return this.send({ type: 'repairGuide' }, 'metal');
        return this.lab.camera?.focusObject(id, false);
      case 'ruler01':
        return this.readRadius(part === 'bar' ? (this.lastRadius === 'slide2' ? 'slide2' : 'slide1') : part === 'guide' ? 'orbit01' : this.lastRadius);
      case 'orbit01':
        if (o?.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
        if (w.orbit.off) return this.send({ type: 'reseatOrbit' }, 'clink');
        if (o?.support === 'guide') {
          if (w.orbit.slackM > 0) return this.send({ type: 'tightenCord' });
          return this.readRadius('orbit01');
        }
        return this.lab.camera?.focusObject(id, false);
      case 'slide1':
      case 'slide2':
        if (o?.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
        if (part === 'lock') return this.send({ type: 'lockMass', id, on: !w.slides[id].locked }, 'metal');
        return this.readRadius(id);
      case 'pull01':
        return this.send({ type: 'pullIn', rCm: this.pullTo }, 'metal');
      case 'drum01': {
        const i = part?.startsWith('step') ? Number(part.slice(4)) : -1;
        const r = w.params.armRadii[i];
        if (r === undefined) return this.lab.camera?.focusObject(id, false);
        if (Math.abs(r - w.drum.armR) > 1e-9) {
          const res = this.send({ type: 'setArm', rCm: r * 100 });
          if (res.ok) this.lastRadius = 'arm';
          return res;
        }
        this.lastRadius = 'arm';
        return this.send({ type: 'windCord', turns: Math.min(w.params.maxCordTurns, w.drum.turns + 1), dir: 1 }, 'clink');
      }
      case 'dyn01':
        if (part === 'zero') return this.send({ type: 'zeroDyn' });
        if (part === 'pull') return this.togglePull();
        if (part === 'aim') return this.send({ type: 'aimDyn', deg: w.drum.aimDeg > 0 ? 0 : 20 });
        return this.readDyn();
      case 'brake01':
        return this.cycleBrake();
      case 'motor01':
        if (part === 'clutch') return this.send({ type: 'setClutch', on: !w.motor.clutch }, 'metal');
        if (part === 'knob') return this.motorTo(w.motor.target * RPM + 5);
        return this.host.onLens?.('motor01');
      case 'force01':
        if (part === 'zero') return this.send({ type: 'zeroForce' });
        if (part === 'range') return this.send({ type: 'setForceRange', n: (w.force.rangeIdx + 1) % w.params.force.ranges.length });
        return this.readSensor('readForce');
      case 'gate01':
        if (part === 'plug') return this.send({ type: 'connect', channel: 'gate', on: !w.gate.connected });
        if (part === 'clip') return this.send({ type: 'routeCable', on: !w.gate.cableRouted });
        return this.timeTurns();
      case 'encoder01':
        if (part === 'cal') return this.send({ type: 'calibrateEncoder' });
        return this.readSensor('readEncoder');
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part === 'readF') return this.readSensor('readForce');
        if (part === 'readT') return this.timeTurns();
        if (part === 'readW') return this.readSensor('readOmega');
        if (part === 'readE') return this.readSensor('readEncoder');
        if (part && PORT[part]) {
          const ch = PORT[part];
          const on = ch === 'encoder' ? w.encoder.connected : ch === 'force' ? w.force.connected : w.gate.connected;
          return this.send({ type: 'connect', channel: ch, on: !on });
        }
        return this.host.onLens?.('logger01');
      case 'balance01':
        if (part === 'tare') return this.send({ type: 'tareBalance' });
        if (part === 'read') return this.readBalance();
        if (part === 'pan' && w.balance.on) return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.lab.camera?.eyeLevel('balance01');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    const w = this.w;
    const still = !spinningF9(w) && !busyF9(w);
    if (hit.id === 'orbit01' && w.objects.orbit01.support === 'guide' && !w.orbit.off && still) return 'orbit';
    if ((hit.id === 'slide1' || hit.id === 'slide2') && hit.part !== 'lock' && w.objects[hit.id].support === 'bar' && still) return 'slide';
    if (hit.id === 'motor01' && hit.part === 'knob') return 'motor';
    if (hit.id === 'dyn01' && hit.part === 'body') return 'dyn';
    if (hit.id === 'dyn01' && hit.part === 'aim') return 'aim';
    if (hit.id === 'force01' && hit.part === 'body') return 'force';
    return null;
  }

  /** Radio (cm) del puntero proyectado sobre una dirección radial de la plataforma. */
  private radialAt(sx: number, sy: number, angle: number, z: number) {
    const p = this.view!.toBench(sx, sy, z);
    return (p.x - AX.x) * Math.cos(angle) + (p.y - AX.y) * Math.sin(angle);
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'orbit': {
        const rCm = this.radialAt(sx, sy, guideAngle(w), objRoom(w, 'orbit01').z);
        if (Math.abs(rCm - w.orbit.r * 100) > 0.05) this.run(this.dispatch({ type: 'setOrbitRadius', rCm }));
        break;
      }
      case 'slide': {
        const id = k.id as SlideId;
        const rCm = this.radialAt(sx, sy, slideAngle(w, id), objRoom(w, id).z);
        if (Math.abs(rCm - w.slides[id].r * 100) > 0.05) this.run(this.dispatch({ type: 'setSlide', id, rCm }));
        break;
      }
      case 'motor':
        this.motorTo(w.motor.target * RPM + (sx - k.lastX) * 0.3);
        break;
      case 'dyn':
        this.dispatch({ type: 'setPull', forceN: w.drum.pullN + (sy - k.lastY) * 0.02 });
        break;
      case 'aim':
        this.dispatch({ type: 'aimDyn', deg: w.drum.aimDeg + (k.lastY - sy) * 0.3 });
        break;
      case 'force':
        this.dispatch({ type: 'mountForce', angleDeg: w.force.angleDeg + (k.lastY - sy) * 0.3 });
        break;
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    if (k.kind === 'orbit') this.hintOnce('f09.hint.stop');
    if (k.kind === 'slide') this.hintOnce('f09.hint.lock');
    if (k.kind === 'motor') this.hintOnce('f09.hint.ramp');
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
      case ' ': return this.togglePull(), true;
      case 'b': return this.readBalance(), true;
      case 'r': return this.readSensor('readForce'), true;
      case 't': return this.timeTurns(), true;
      case 'w': return this.readSensor('readOmega'), true;
      case 'e': return this.readSensor('readEncoder'), true;
      case 'd': return this.readDyn(), true;
      case 'f': return this.cycleBrake(), true;
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

  // ─────────────── Tomar y soltar la masa orbitante ───────────────

  private grabbable(id: string): boolean {
    const o = this.obj(id);
    return !!o && o.kind === 'orbitMass' && o.support === 'rack';
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
    this.dispatch({ type: 'setPose', id, pose: { ...homeOf(id), rotationRad: 0 }, support: 'rack' });
    this.host.sound('clink');
  }

  /** Lugar al que se acopla lo que se suelta en `p` (o null: vuelve al estante). */
  private targetFor(p: { x: number; y: number; z: number }): string | null {
    const w = this.w;
    const d = (q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    if (d(panRoom()) < 9 && !w.balance.on) return 'balance01';
    if (d(AX) < GEOF09.table.r) return 'guide01';
    return null;
  }

  /** Destino al soltar: sobre el plato, en la guía o al estante. */
  place(h: HeldF, p: Pose) {
    const target = this.targetFor(p);
    this.toRack(h.id);
    if (target === 'balance01') return void this.send({ type: 'placeOnBalance', id: h.id }, 'clink');
    if (target === 'guide01') {
      const r = this.send({ type: 'mountOrbit', on: true }, 'clink');
      if (r.ok) this.hintOnce('f09.hint.cord');
    }
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
    this.dockTarget = this.targetFor({ x: nx, y: ny, z: h.curZ });
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** ¿Hay un ensayo en curso? (el panel desactiva los cambios de montaje). */
  busy(): boolean {
    return busyF9(this.w);
  }
}
