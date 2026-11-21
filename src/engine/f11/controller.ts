/**
 * Interacción de F11: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Lo que se lleva en la mano: el bloque, la botella y el bloque de aluminio (del estante), la sonda, el colector y la
 *   probeta. La pose al soltar decide: un objeto sobre el agua del tanque se suelta en esa x (junto al tanque pero
 *   fuera de él cae a la mesada), en el plato de la balanza se pesa y el bloque de aluminio bajo el gancho del soporte
 *   se cuelga del dinamómetro; la sonda en la guía o en su porta-sonda; el colector bajo el pico del vaso de rebose o en
 *   la balanza; la probeta en la balanza o en la canilla del depósito (se llena o se devuelve). Lo que se lleva no
 *   atraviesa los aparatos macizos ni sale de la mesada.
 * - Mandos con su grado de libertad real: el carro de la guía corre a lo largo del tanque, la varilla de la sonda sube
 *   y baja en la guía, el brazo del soporte sube y baja, y el dinamómetro se inclina con un arrastre.
 * - Clic en llaves, interruptores, traba de la guía, botones del registrador, tara, cero, hilo o lastre: el comando
 *   correspondiente. Clic en una escala (nivel, regla, calado, dinamómetro, guía de inmersión, probeta): lectura con la
 *   dirección REAL de la cámara.
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F11Host } from './host';
import type { F11Lab3D } from './F11Lab3D';
import type { F11Command, F11DispatchResult } from '../../simulation/f11-world/commands';
import type { F11ObjKind, F11World, FloatId, Pose } from '../../simulation/f11-world/types';
import { GEOF11 } from '../../simulation/f11-world/geometry';
import { busyF11, tankLevel } from '../../simulation/f11-world/world';
import { armZ, eyePoint, homeOf, objRoom } from './layout';

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
  kind: F11ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'guide' | 'probe' | 'stand' | 'aim';
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
const G = GEOF11;
const T = G.tank;
const FLOAT_IDS = new Set(['float1', 'bottle1', 'alu1']);
const isFloat = (id: string): id is FloatId => FLOAT_IDS.has(id);

export class F11Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Compatibilidad con la vista común: F11 no deja fantasmas. */
  ghost: { id: string; x: number; y: number; z: number } | null = null;
  /** Último objeto cuyo calado se lee. */
  lastFloat: FloatId = 'float1';
  /** Paso de la sonda y del brazo con el teclado o la rueda (cm). */
  zStep = 1;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F11Host, private lab: F11Lab3D) {}

  private get w(): F11World {
    return this.host.runtime.world;
  }

  private dispatch(c: F11Command): F11DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f11.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F11Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
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

  /** Las escalas verticales crecen hacia arriba (nivel, regla, calado, guía de inmersión, probeta). */
  viewOf(target: 'scale01' | 'ruler01' | 'draft' | 'stand01' | 'cyl01', id: FloatId = this.lastFloat) {
    return this.parallax(eyePoint(this.w, target, id), { x: 0, y: 0, z: 1 });
  }

  /** La escala del dinamómetro crece hacia abajo. */
  dynView() {
    return this.parallax(eyePoint(this.w, 'dyn01'), { x: 0, y: 0, z: -1 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readLevel() {
    const r = this.send({ type: 'readLevel', viewDeg: this.viewOf('scale01') });
    if (r.ok) this.host.onLens?.('scale01');
    return r;
  }

  readRuler() {
    const r = this.send({ type: 'readRuler', viewDeg: this.viewOf('ruler01') });
    if (r.ok) this.host.onLens?.('ruler01');
    return r;
  }

  readProbe() {
    const r = this.send({ type: 'readProbe' });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  readDraft(id: FloatId = this.lastFloat) {
    this.lastFloat = id;
    const r = this.send({ type: 'readDraft', id, viewDeg: this.viewOf('draft', id) });
    if (r.ok) this.host.onLens?.('draft');
    return r;
  }

  readDyn() {
    const r = this.send({ type: 'readDyn', viewDeg: this.dynView() });
    if (r.ok) this.host.onLens?.('dyn01');
    return r;
  }

  readStand() {
    const r = this.send({ type: 'readStand', viewDeg: this.viewOf('stand01') });
    if (r.ok) this.host.onLens?.('stand01');
    return r;
  }

  readBalance() {
    const r = this.send({ type: 'readBalance' });
    if (r.ok) this.host.onLens?.('balance01');
    return r;
  }

  readCylinder() {
    const r = this.send({ type: 'readCylinder', viewDeg: this.viewOf('cyl01') });
    if (r.ok) this.host.onLens?.('cyl01');
    return r;
  }

  cycleRate() {
    const rates = this.w.params.rates;
    const i = rates.indexOf(this.w.logger.rateHz);
    return this.send({ type: 'setRate', hz: rates[(i + 1) % rates.length] });
  }

  cycleBallast() {
    const b = this.w.params.ballasts;
    const i = b.indexOf(this.w.floats.bottle1.ballastG);
    return this.send({ type: 'setBallast', grams: b[(i + 1) % b.length] }, 'clink');
  }

  probeTo(z: number) {
    return this.run(this.dispatch({ type: 'setProbeZ', zCm: Math.max(0, Math.min(44, z)) }));
  }

  standTo(cm: number) {
    return this.run(this.dispatch({ type: 'setStand', cm: Math.max(0, Math.min(this.w.params.stand.maxCm, cm)) }));
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
    if (isFloat(hit.id) && hit.id !== 'alu1') this.lastFloat = hit.id;
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
    if ((this.hovered === 'probe01' || this.hovered === 'ruler01') && this.w.probe.mount === 'guide') {
      this.probeTo(this.w.probe.z - notch * this.zStep);
      return true;
    }
    if (this.hovered === 'stand01') {
      this.standTo(this.w.stand.target - notch * this.zStep);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: llaves, botones, trabas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    switch (id) {
      case 'tank01':
        return this.lab.camera?.focusObject(id, false);
      case 'tapA':
        return this.send({ type: 'setTap', on: !w.valves.tap }, 'metal');
      case 'pumpB':
      case 'resB':
        if (part === 'spigot') return this.send({ type: 'fillCylinder' }, 'clink');
        return this.send({ type: 'setPump', on: !w.valves.pump }, 'click');
      case 'drain01':
        return this.send({ type: 'setDrain', on: !w.valves.drain }, 'metal');
      case 'agitator01':
        return this.send({ type: 'setAgitator', on: !w.valves.agitator }, 'click');
      case 'scale01':
        return this.readLevel();
      case 'guide01':
        if (part === 'lock') return this.send({ type: 'lockGuide', on: !w.probe.locked }, 'metal');
        return this.lab.camera?.focusObject(id, false);
      case 'ruler01':
        return this.readRuler();
      case 'probe01':
        if (w.probe.mount === 'guide') {
          if (part === 'purge') return this.send({ type: 'purgeProbe' }, 'clink');
          return this.readProbe();
        }
        return this.lab.camera?.focusObject(id, false);
      case 'holder01':
        if (part === 'cal') return this.send({ type: 'calibrateProbe' });
        return this.lab.camera?.focusObject(id, false);
      case 'logger01':
        if (part === 'port') return this.send({ type: 'connectProbe', on: !w.probe.connected });
        if (part === 'rate') return this.cycleRate();
        if (part === 'range') return this.send({ type: 'setRange', idx: (w.probe.rangeIdx + 1) % w.params.probe.ranges.length });
        if (part === 'zero') return this.send({ type: 'zeroProbe' });
        if (part === 'series') return this.send({ type: 'newSeries' });
        return this.readProbe();
      case 'float1':
      case 'bottle1':
      case 'alu1': {
        const f = w.floats[id];
        if (f.where === 'tank') {
          if (part === 'thread' && f.tethered) return this.send({ type: 'untieThread', id }, 'click');
          if (part === 'thread' || part === 'grab') return this.send({ type: 'recoverObject', id }, 'clink');
          return this.readDraft(id);
        }
        if (f.where === 'bench') return this.send({ type: 'recoverObject', id }, 'clink');
        if (f.where === 'balance') return this.readBalance();
        if (f.where === 'dyn') return this.readDyn();
        if (id === 'bottle1' && part === 'cap') return this.cycleBallast();
        return this.lab.camera?.focusObject(id, false);
      }
      case 'ballast01':
        return this.cycleBallast();
      case 'balance01':
        if (part === 'tare') return this.send({ type: 'tareBalance' });
        if (part === 'pan' && w.balance.on) return this.send({ type: 'clearBalance' }, 'clink');
        return this.readBalance();
      case 'cyl01':
        if (part === 'pour' && w.cyl.vol > 0) return this.send({ type: 'emptyCylinder' }, 'clink');
        return this.readCylinder();
      case 'can01':
        if (part === 'fill') return this.send({ type: 'primeCan' }, 'clink');
        return this.lab.camera?.focusObject(id, false);
      case 'catch01':
        if (w.can.catchAt === 'balance') return this.readBalance();
        if (w.can.catchVol > 0 && w.can.catchAt !== 'spout') return this.send({ type: 'emptyCatch' }, 'clink');
        return this.lab.camera?.focusObject(id, false);
      case 'dyn01':
        if (part === 'zero') return this.send({ type: 'zeroDyn' });
        if (part === 'aim') return this.send({ type: 'aimDyn', deg: Math.abs(w.dyn.aimDeg) > 0.5 ? 0 : 12 });
        if (part === 'hook' && w.dyn.holding) return this.send({ type: 'unhangBlock' }, 'clink');
        return this.readDyn();
      case 'stand01':
        if (part === 'zero') return this.send({ type: 'zeroStand' });
        return this.readStand();
      case 'towel01':
        return this.send({ type: 'mopSpill' }, 'click');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    const w = this.w;
    if (hit.id === 'guide01' && hit.part !== 'lock') return 'guide';
    if ((hit.id === 'probe01' || hit.id === 'ruler01') && w.probe.mount === 'guide' && hit.part === 'rod') return 'probe';
    if (hit.id === 'stand01' && hit.part === 'arm') return 'stand';
    if (hit.id === 'dyn01' && hit.part === 'aim') return 'aim';
    return null;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    const wall = (y: number) => this.view?.toWall?.(sx, sy, y) ?? null;
    switch (k.kind) {
      case 'guide': {
        const p = wall(T.y0 + T.W / 2) ?? { x: this.view!.toBench(sx, sy, T.floorZ + T.H).x, z: 0 };
        const x = Math.round((p.x - T.x0) * 10) / 10;
        if (Math.abs(x - w.probe.gx) > 0.05) this.run(this.dispatch({ type: 'setGuide', xCm: x }));
        break;
      }
      case 'probe': {
        // La varilla sube y baja con el puntero: el dominio decide si la membrana golpea el fondo.
        const p = wall(G.guide.y);
        if (!p) break;
        const z = Math.round((p.z - T.floorZ) * 10) / 10;
        if (Math.abs(z - w.probe.z) > 0.05) this.probeTo(z);
        break;
      }
      case 'stand': {
        const p = wall(G.stand.y);
        const dz = p ? p.z - armZ(w) : (k.lastY - sy) * 0.1;
        if (Math.abs(dz) > 0.05) this.standTo(Math.round((w.stand.target + dz) * 10) / 10);
        break;
      }
      case 'aim':
        this.dispatch({ type: 'aimDyn', deg: w.dyn.aimDeg + (sx - k.lastX) * 0.3 });
        break;
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    if (k.kind === 'probe' && !this.w.probe.locked) this.hintOnce('f11.hint.lock', 'warn');
    if (k.kind === 'stand' && this.w.dyn.holding && this.w.stand.ref === null) this.hintOnce('f11.hint.standZero');
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
    const fine = shift ? 0.1 : this.zStep;
    switch (k) {
      case 'p': return this.readProbe(), true;
      case 'l': return this.readLevel(), true;
      case 'r': return this.readRuler(), true;
      case 'c': return this.readDraft(), true;
      case 'd': return this.readDyn(), true;
      case 'i': return this.readStand(), true;
      case 'b': return this.readBalance(), true;
      case 'v': return this.readCylinder(), true;
      case 'pageup':
        if (this.host.getSelected() === 'stand01') return this.standTo(this.w.stand.target + fine), true;
        return this.probeTo(this.w.probe.z + fine), true;
      case 'pagedown':
        if (this.host.getSelected() === 'stand01') return this.standTo(this.w.stand.target - fine), true;
        return this.probeTo(this.w.probe.z - fine), true;
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

  // ─────────────── Tomar y soltar ───────────────

  grabbable(id: string): boolean {
    const w = this.w;
    if (isFloat(id)) return w.floats[id].where === 'rack';
    if (id === 'probe01') return true;
    if (id === 'catch01') return w.can.catchAt !== 'balance' || w.balance.on === 'catch';
    if (id === 'cyl01') return true;
    return false;
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
    this.held = { id, kind: o.kind, z: start.z + 8, curZ: start.z, x: start.x, y: start.y, keyboard, from };
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

  /** Devuelve la pieza a su lugar lógico (el dominio guarda dónde está cada cosa). */
  private release(h: HeldF) {
    const support = h.from.support === 'hand' ? 'bench' : h.from.support;
    this.dispatch({ type: 'setPose', id: h.id, pose: { ...homeOf(h.id), rotationRad: 0 }, support });
  }

  /** Lugar al que se acopla lo que se suelta en `p` (o null: vuelve a su lugar). */
  targetFor(id: string, p: { x: number; y: number; z: number }): string | null {
    const near = (x: number, y: number, dx: number, dy: number) => Math.abs(p.x - x) < dx && Math.abs(p.y - y) < dy;
    const overTank = p.x > T.x0 && p.x < T.x0 + T.L && p.y > T.y0 && p.y < T.y0 + T.W;
    const besideTank = !overTank && p.x > T.x0 - 14 && p.x < T.x0 + T.L + 14 && p.y > T.y0 - 14 && p.y < T.y0 + T.W + 10;
    const onBalance = near(G.balance.x, G.balance.y, 12, 12);
    if (isFloat(id)) {
      if (id === 'alu1' && near(G.can.x, G.can.y, 12, 12)) return 'dyn01';
      if (overTank) return 'tank01';
      if (besideTank) return 'outside';
      if (onBalance) return 'balance01';
      return null;
    }
    if (id === 'probe01') {
      if (overTank) return 'guide01';
      return null;
    }
    if (id === 'catch01') {
      if (near(G.catchSpout.x, G.catchSpout.y, 8, 10)) return 'spout';
      if (onBalance) return 'balance01';
      return null;
    }
    if (id === 'cyl01') {
      if (onBalance) return 'balance01';
      if (near(G.reservoir.x, G.reservoir.y - G.reservoir.d / 2, 16, 12)) return 'resB';
    }
    return null;
  }

  /** Destino al soltar. */
  place(h: HeldF, p: Pose) {
    const target = this.targetFor(h.id, p);
    this.release(h);
    const id = h.id;
    if (isFloat(id)) {
      if (target === 'dyn01') return void this.send({ type: 'hangBlock' }, 'clink');
      if (target === 'balance01') return void this.send({ type: 'placeOnBalance', item: id }, 'clink');
      if (target === 'tank01' || target === 'outside') {
        const x = target === 'outside' ? (p.x < T.x0 ? -4 : p.x > T.x0 + T.L ? T.L + 4 : -4) : Math.round((p.x - T.x0) * 10) / 10;
        const r = this.send({ type: 'releaseObject', id, xCm: x }, 'clink');
        if (r.ok && this.w.floats[id].tethered && this.w.floats[id].where === 'tank') this.hintOnce('f11.hint.thread', 'warn');
        return;
      }
      return void this.host.sound('clink');
    }
    if (id === 'probe01') {
      if (target === 'guide01') {
        const r = this.send({ type: 'mountProbe', where: 'guide' }, 'clink');
        if (r.ok && !this.w.probe.locked) this.hintOnce('f11.hint.lock', 'warn');
        return;
      }
      if (this.w.probe.mount === 'guide') return void this.send({ type: 'mountProbe', where: 'holder' }, 'clink');
      return void this.host.sound('clink');
    }
    if (id === 'catch01') {
      if (target === 'spout') return void this.send({ type: 'placeCatch', at: 'spout' }, 'clink');
      if (target === 'balance01') return void this.send({ type: 'placeOnBalance', item: 'catch' }, 'clink');
      return void this.send({ type: 'placeCatch', at: 'rack' }, 'clink');
    }
    if (id === 'cyl01') {
      if (target === 'balance01') return void this.send({ type: 'placeOnBalance', item: 'cyl' }, 'clink');
      if (this.w.cyl.where === 'balance') this.send({ type: 'clearBalance' }, null);
      if (target === 'resB') return void this.send({ type: this.w.cyl.vol > 0 ? 'emptyCylinder' : 'fillCylinder' }, 'clink');
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
    // Sobre el tanque se lleva por encima del borde.
    const overTank = tx > T.x0 - 2 && tx < T.x0 + T.L + 2 && ty > T.y0 - 2 && ty < T.y0 + T.W + 2;
    const tz = Math.max(h.z, overTank ? T.floorZ + T.H + 3 : 0);
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

  /** ¿Hay un flujo o movimiento en curso? (el panel lo muestra). */
  busy(): boolean {
    return busyF11(this.w);
  }

  /** Nivel actual del tanque (cm), para la interfaz. */
  level(): number {
    return tankLevel(this.w);
  }
}
