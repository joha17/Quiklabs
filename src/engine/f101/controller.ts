/**
 * Interacción de F101: gestos del ratón → comandos físicos. Trabaja en cm de mesada y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: el cursor del calibrador se arrastra A LO LARGO de la regla (el contacto con
 *   la pieza convierte el exceso en fuerza); el tambor y el trinquete del micrómetro se GIRAN (la magnitud sale del
 *   ángulo recorrido alrededor del eje en pantalla, no del recorrido del puntero); las poleas y el dinamómetro se
 *   deslizan POR EL BORDE de la mesa; el tornillo tensor estira el resorte; el anillo se empuja en el plano.
 * - Piezas que se toman y se sueltan: al soltar, la pose decide el acople (entre las mordazas o las caras, platillo,
 *   cápsula, sobre la boca de la probeta desde la altura real, gancho de una polea, portapesas, borde de la mesa).
 * - Clic en una escala: lectura con la dirección REAL de la cámara (paralaje) y la línea de vista real (oclusión).
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo devuelve el
 *   mando a su última pose válida y avisa.
 */
import { clearSpotNear } from '../interaction/solidFloor';
import { clampToBench } from '../interaction/viewport';
import type { F101Host } from './host';
import type { F101Lab3D } from './F101Lab3D';
import type { F101Command, F101DispatchResult } from '../../simulation/f101-world/commands';
import type { F101ObjKind, F101World, Pose } from '../../simulation/f101-world/types';
import { GEOF101, TABLE_CENTER } from '../../simulation/f101-world/geometry';
import { HANGERS, PULLEYS } from '../../simulation/f101-world/world';
import { BALANCE_POS, RACK_POS, SENSOR_POS, rackSlot } from '../../practices/practice-f101/definition';
import { T, caliperGap, caliperJawX, distToTable, gradCylMouth, hungPose, meniscusZ, micrometerAxis, pulleyNear, rimPoint, ringPoint, tableAngleOf } from './layout';

export interface PickHitF {
  id: string;
  part?: string;
}

export interface ViewAdapterF {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  /** Saca (x, y) de lo que no se puede sobrevolar. */
  solidPush?(id: string, cur: { x: number; y: number }, x: number, y: number, resting: readonly string[], grounded: boolean, point?: boolean): { x: number; y: number };
  solidFloor?(id: string, cur: { x: number; y: number; z: number }, x: number, y: number, resting: readonly string[]): number;
  pick(sx: number, sy: number, excludeId?: string | null): PickHitF | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

export interface HeldF {
  id: string;
  kind: F101ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  /** Inclinación de la pieza respecto de las caras (°) y giro alrededor de su eje (°). */
  tiltDeg: number;
  spinDeg: number;
  /** Cilindro: de pie (diámetro) o acostado (altura). */
  lying: boolean;
}

type KnobKind = 'caliperSlide' | 'thimble' | 'ratchet' | 'pulley' | 'ring' | 'dynScrew' | 'dynBody';
interface Knob {
  kind: KnobKind;
  id: string;
  sx: number;
  sy: number;
  lastAngle: number;
  lastY: number;
  moved: boolean;
}

const PART_KINDS = new Set<F101ObjKind>(['gaugeBlock', 'metalCyl', 'steelBall', 'massStd']);
const CARRY_Z: Partial<Record<F101ObjKind, number>> = {
  gaugeBlock: 8, metalCyl: 10, steelBall: 8, massStd: 10, dish: 8, level: 10, tissue: 8, hanger: 34, slotMass: 34, dynamometer: 34,
};
/** Radio de apoyo en la mesada (cm) para buscar un lugar libre. */
const FOOT: Partial<Record<F101ObjKind, number>> = {
  gaugeBlock: 1.8, massStd: 1.6, metalCyl: 1.2, steelBall: 1, dish: 4.5, level: 3, tissue: 4, hanger: 1.5, slotMass: 1.5, dynamometer: 2,
  balance: 12, gradCyl: 3.6, forceTable: 20, massRack: 8, sensorBox: 4.5, caliper: 4, micrometer: 4, ruler: 2, returnTray: 11,
};
const CLICK_PX = 6;

export class F101Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  /** Destino de acople bajo lo que se sostiene (para el resaltado y el panel). */
  dockTarget: string | null = null;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F101Host, private lab: F101Lab3D) {}

  private get w(): F101World {
    return this.host.runtime.world;
  }

  private dispatch(c: F101Command): F101DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f101.cmd.${r.code}`, 2);
    return r;
  }

  private send(c: F101Command, sound: 'click' | 'clink' | 'metal' | 'glass' | null = 'click') {
    const r = this.run(this.dispatch(c));
    if (sound && r.ok) this.host.sound(sound);
    return r;
  }

  // ─────────────── Vista: dirección real del ojo ───────────────

  private cam() {
    const c = this.lab.camera?.position();
    return c ? { ...c, z: c.z + this.lab.eyeOffsetCm } : { x: 0, y: -80, z: 60 };
  }

  /** Ángulo (°) entre la vista y la normal de una escala horizontal (de arriba = 0), con signo según el lado. */
  flatViewDeg(x: number, y: number, z: number): number {
    const c = this.cam();
    const h = Math.hypot(c.x - x, c.y - y);
    const elev = (Math.atan2(c.z - z, h) * 180) / Math.PI;
    return (90 - elev) * (c.x >= x ? 1 : -1);
  }

  /** Ángulo (°) entre la vista y la normal de una escala frontal (cara hacia el operador, −y). */
  frontViewDeg(x: number, y: number, z: number): number {
    const c = this.cam();
    const v = { x: c.x - x, y: c.y - y, z: c.z - z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    const ang = (Math.acos(Math.max(-1, Math.min(1, -v.y / len))) * 180) / Math.PI;
    return ang * (v.x >= 0 ? 1 : -1);
  }

  /** Elevación (°) de la cámara vista desde el centro de la mesa de fuerzas. */
  tableViewElevDeg(): number {
    const c = this.cam();
    const h = Math.hypot(c.x - TABLE_CENTER.x, c.y - TABLE_CENTER.y);
    return (Math.atan2(c.z - T.topZ, h) * 180) / Math.PI;
  }

  // ─────────────── Lecturas ───────────────

  readCaliper() {
    const o = this.w.objects.caliper01.pose;
    const r = this.send({ type: 'readCaliper', viewDeg: this.flatViewDeg(o.x, o.y, o.z + 0.6) });
    if (r.ok) this.host.onLens?.('caliper01');
    return r;
  }

  readMicrometer() {
    const a = micrometerAxis(this.w);
    const r = this.send({ type: 'readMicrometer', viewDeg: this.frontViewDeg(a.x + 3, a.y, a.z) });
    if (r.ok) this.host.onLens?.('micrometer01');
    return r;
  }

  readRuler(partId?: string) {
    const ru = this.w.objects.ruler01.pose;
    const id = partId ?? ['metalCyl01', 'gaugeBlock01', 'steelBall01'].find((p) => {
      const o = this.w.objects[p];
      return o && o.support === 'bench' && Math.abs(o.pose.y - ru.y) < 3 && Math.abs(o.pose.x - ru.x) < 16;
    });
    if (!id) return this.run({ ok: false, code: 'NOTHING_ON_RULER' });
    const r = this.send({ type: 'readRuler', partId: id, viewDeg: this.flatViewDeg(ru.x, ru.y, ru.z) });
    if (r.ok) this.host.onLens?.('ruler01');
    return r;
  }

  readVolume() {
    const m = gradCylMouth(this.w);
    const zMen = meniscusZ(this.w);
    const eyeDz = this.cam().z - zMen;
    const occluded = this.lab.occluded?.(m.x, m.y, zMen, 'gradCyl01') ?? false;
    const r = this.send({ type: 'readVolume', eyeDzCm: eyeDz, occluded });
    if (Math.abs(eyeDz) > 1) this.hintOnce('f101.hint.eyeLevel', 'warn');
    if (r.ok) this.host.onLens?.('gradCyl01');
    return r;
  }

  readBalance() {
    return this.send({ type: 'readBalance' });
  }

  tare() {
    return this.send({ type: 'tare' });
  }

  readDynamometer() {
    const d = this.w.table.dyn;
    const p = rimPoint(d.angleDeg, 10, T.topZ + 1);
    const r = this.send({ type: 'readDynamometer', viewDeg: this.flatViewDeg(p.x, p.y, p.z) });
    if (r.ok) this.host.onLens?.('dynamometer01');
    return r;
  }

  recordEquilibrium() {
    const r = this.send({ type: 'recordEquilibrium', viewElevDeg: this.tableViewElevDeg() });
    if (r.ok) this.host.onLens?.('forceTable01');
    return r;
  }

  togglePin() {
    return this.send({ type: 'setPin', on: !this.w.table.pinIn }, 'metal');
  }

  toggleCapture() {
    return this.send(this.w.table.sensor.capture ? { type: 'stopCapture' } : { type: 'startCapture' });
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
      // Con algo en la mano, un clic suelta (en el lugar al que apunta).
      this.release();
      return true;
    }
    const knob = this.knobFor(hit);
    if (knob) {
      this.knob = { kind: knob, id: hit.id, sx, sy, lastAngle: this.knobAngle(knob, hit.id, sx, sy), lastY: sy, moved: false };
      this.view.setOrbitEnabled(false);
      this.downAt = { x: sx, y: sy, ...hit };
      return true;
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
      // Arrastre de una pieza (no un clic): se toma.
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
      this.held.z = Math.max(0, Math.min(60, this.held.z - notch * 0.8));
      return true;
    }
    // Rueda sobre el tambor: giro rápido (media vuelta por muesca), para abrir o acercar.
    if (this.hovered === 'micrometer01' && (this.hoveredPart === 'thimble' || this.hoveredPart === 'ratchet')) {
      this.send({ type: 'turnMicrometer', deltaDeg: notch * 180, via: this.hoveredPart === 'ratchet' ? 'ratchet' : 'thimble' }, null);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, tornillos, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    switch (id) {
      case 'caliper01':
        if (part === 'lock') return this.send({ type: 'lockCaliper', on: !w.caliper.locked });
        if (part === 'scale' || part === 'slider') return this.readCaliper();
        return this.lab.camera?.eyeLevel('caliper01');
      case 'micrometer01':
        if (part === 'lock') return this.send({ type: 'lockMicrometer', on: !w.micrometer.locked });
        if (part === 'scale') return this.readMicrometer();
        if (part === 'thimble' || part === 'ratchet') return this.send({ type: 'turnMicrometer', deltaDeg: 18, via: part }, null);
        return this.lab.camera?.eyeLevel('micrometer01');
      case 'ruler01':
        return this.readRuler();
      case 'balance01':
        if (part === 'power') return this.send({ type: 'powerBalance', on: !w.balance.powered });
        if (part === 'tare') return this.tare();
        if (part === 'level') return this.send({ type: 'levelBalance' });
        if (part === 'display') return this.readBalance();
        return undefined;
      case 'gradCyl01':
        if (part === 'base') return this.send({ type: 'tapCylinder' }, 'glass');
        return this.readVolume();
      case 'forceTable01':
        if (part === 'pin') return this.togglePin();
        if (part === 'scale') return this.recordEquilibrium();
        if (part === 'feet') return this.send({ type: 'levelTable' });
        if (part === 'top') return this.send({ type: 'tapTable' }, 'metal');
        return undefined;
      case 'sensorBox01':
        if (part === 'plug') return this.send({ type: 'connectSensor', on: !w.table.sensor.connected });
        if (part === 'range') return this.send({ type: 'setSensorRange', rangeN: w.table.sensor.rangeN === 10 ? 2 : 10 });
        if (part === 'rate') return this.send({ type: 'setSensorRate', hz: w.table.sensor.rateHz === 50 ? 5 : 50 });
        if (part === 'rec') return this.toggleCapture();
        if (part === 'cal') return this.send({ type: 'calibrateSensor' });
        return undefined;
      case 'dynamometer01':
        if (!w.table.dyn.onRim) return this.grab(id);
        if (part === 'zero') return this.send({ type: 'zeroDynamometer' });
        if (part === 'align') return this.send({ type: 'alignDynamometer', alignDeg: 0 });
        if (part === 'scale') return this.readDynamometer();
        return undefined;
      default:
        if (PULLEYS.includes(id as never)) {
          if (part === 'screw') return this.send({ type: 'seatPulley', pulleyId: id, on: !w.table.pulleys[id].seated }, 'metal');
          if (part === 'wheel') return this.send({ type: 'threadString', pulleyId: id, on: !w.table.pulleys[id].threaded });
          return undefined;
        }
        if (w.objects[id]?.movable) this.grab(id);
    }
    return undefined;
  }

  // ─────────────── Mandos ───────────────

  private knobFor(hit: PickHitF): KnobKind | null {
    const w = this.w;
    if (hit.id === 'caliper01' && hit.part === 'slider') return 'caliperSlide';
    if (hit.id === 'micrometer01' && (hit.part === 'thimble' || hit.part === 'ratchet')) return hit.part;
    if (PULLEYS.includes(hit.id as never) && hit.part === 'clamp') return 'pulley';
    if (hit.id === 'forceTable01' && hit.part === 'ring') return 'ring';
    if (hit.id === 'dynamometer01' && w.table.dyn.onRim && hit.part === 'screw') return 'dynScrew';
    if (hit.id === 'dynamometer01' && w.table.dyn.onRim && hit.part === 'body') return 'dynBody';
    return null;
  }

  /** Ángulo del puntero alrededor del eje del tambor en pantalla (°), o 0 si el mando no gira. */
  private knobAngle(kind: KnobKind, _id: string, sx: number, sy: number): number {
    if (kind !== 'thimble' && kind !== 'ratchet') return 0;
    const a = micrometerAxis(this.w);
    const c = this.lab.camera?.screenOf(a.x + (kind === 'ratchet' ? 7.5 : 5), a.y, a.z) ?? { x: sx, y: sy - 40 };
    return (Math.atan2(sy - c.y, sx - c.x) * 180) / Math.PI;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    const v = this.view!;
    switch (k.kind) {
      case 'caliperSlide': {
        const o = w.objects.caliper01.pose;
        const p = v.toBench(sx, sy, o.z + 0.6);
        this.dispatch({ type: 'setCaliperSlide', targetMm: (p.x - caliperJawX(w)) * 10 });
        if (w.caliper.forceN > w.params.caliper.forceLimitN) this.warn('f101.hint.caliperForce', 4);
        return;
      }
      case 'thimble':
      case 'ratchet': {
        const ang = this.knobAngle(k.kind, k.id, sx, sy);
        let d = ang - k.lastAngle;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        k.lastAngle = ang;
        // Horario en pantalla (visto desde el extremo del tambor) cierra el husillo.
        const r = this.dispatch({ type: 'turnMicrometer', deltaDeg: d, via: k.kind });
        if (r.ok && w.micrometer.slipped) this.host.sound('click');
        return;
      }
      case 'pulley': {
        const p = v.toBench(sx, sy, T.topZ);
        const r = this.dispatch({ type: 'setPulleyAngle', pulleyId: k.id, angleDeg: Math.round(tableAngleOf(p.x, p.y) * 2) / 2 });
        if (!r.ok) this.warn(`f101.cmd.${r.code}`, 2);
        else this.hintOnce('f101.hint.seatPulley');
        return;
      }
      case 'ring': {
        const p = v.toBench(sx, sy, T.topZ + 1.2);
        const r0 = ringPoint(w);
        this.dispatch({ type: 'nudgeRing', dxCm: p.x - r0.x, dyCm: p.y - r0.y });
        return;
      }
      case 'dynScrew': {
        const dy = k.lastY - sy;
        k.lastY = sy;
        this.dispatch({ type: 'setDynTension', mm: w.table.dyn.tensionMm + dy * 0.5 });
        return;
      }
      case 'dynBody': {
        const p = v.toBench(sx, sy, T.topZ);
        const r = this.dispatch({ type: 'setDynAngle', angleDeg: Math.round(tableAngleOf(p.x, p.y)) });
        if (!r.ok) this.warn(`f101.cmd.${r.code}`, 2);
        return;
      }
    }
  }

  private endKnob(k: Knob) {
    if (k.kind === 'caliperSlide') {
      // Soltar el pulgar: la fuerza se relaja y el cursor queda en el contacto (salvo que esté bloqueado).
      this.dispatch({ type: 'releaseCaliper' });
      this.hintOnce('f101.hint.caliperRead');
    }
    if (k.kind === 'pulley') this.host.sound('metal');
  }

  // ─────────────── Teclado (equivalencias accesibles) ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const k = key.toLowerCase();
    const h = this.held;
    if (h) {
      const step = shift ? 10 : 2;
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      if (k === 'q') return (h.tiltDeg = Math.max(-30, h.tiltDeg - step)), true;
      if (k === 'e') return (h.tiltDeg = Math.min(30, h.tiltDeg + step)), true;
      if (k === 'f' && h.kind === 'metalCyl') return (h.lying = !h.lying), true;
      if (k === 's') return (h.spinDeg = (h.spinDeg + 30) % 360), true;
      const d = { ArrowLeft: [-step / 2, 0], ArrowRight: [step / 2, 0], ArrowUp: [0, step / 2], ArrowDown: [0, -step / 2] }[key];
      if (d) {
        const moved = clampToBench(h.x + d[0], h.y + d[1]);
        h.x = moved.x;
        h.y = moved.y;
        return true;
      }
      if (k === '+' || key === 'PageUp') return (h.z = Math.min(60, h.z + 1)), true;
      if (k === '-' || key === 'PageDown') return (h.z = Math.max(0, h.z - 1)), true;
      return false;
    }
    switch (k) {
      case 'c': return this.readCaliper(), true;
      case 'm': return this.readMicrometer(), true;
      case 'v': return this.readVolume(), true;
      case 'r': return this.readBalance(), true;
      case 'z': return this.tare(), true;
      case 'g': return this.recordEquilibrium(), true;
      case 'd': return this.readDynamometer(), true;
      case 'p': return this.togglePin(), true;
      case 't': return this.send({ type: 'tapTable' }, 'metal'), true;
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
      if (sel && this.w.objects[sel]?.movable) return this.grab(sel, true);
    }
    return false;
  }

  onKeyUp(): boolean {
    return false;
  }

  // ─────────────── Tomar y soltar ───────────────

  /** Toma una pieza: si estaba acoplada (mordazas, caras, probeta, gancho, portapesas), primero se desacopla. */
  grab(id: string, keyboard = false): boolean {
    const w = this.w;
    const o = this.obj(id);
    if (!o || !o.movable || this.blocked()) return false;
    if (this.held) this.release();
    if (o.support === 'caliper01') this.dispatch({ type: 'placeInCaliper', partId: null, dimension: 'd', tiltDeg: 0, spinDeg: 0 });
    if (o.support === 'micrometer01') this.dispatch({ type: 'placeInMicrometer', partId: null, spinDeg: 0 });
    if (o.support === 'gradCyl01' && !this.run(this.dispatch({ type: 'retrievePart', partId: id })).ok) return false;
    if (o.kind === 'hanger' && PULLEYS.includes(o.support as never) && !this.run(this.dispatch({ type: 'hang', hangerId: id, pulleyId: null })).ok) return false;
    if (o.kind === 'slotMass' && HANGERS.includes(o.support as never) && !this.run(this.dispatch({ type: 'loadMass', massId: id, hangerId: null })).ok) return false;
    if (o.kind === 'dynamometer' && w.table.dyn.onRim) {
      this.run(this.dispatch({ type: 'mountDynamometer', on: false, angleDeg: w.table.dyn.angleDeg }));
    }
    const vis = hungPose(w, id);
    const from = { pose: { ...o.pose }, support: o.support };
    const start = vis ? { ...o.pose, ...vis } : o.pose;
    const r = this.dispatch({ type: 'setPose', id, pose: { ...start }, support: 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    const z0 = Math.max(start.z + 2, CARRY_Z[o.kind] ?? start.z + 3);
    this.held = {
      id, kind: o.kind, z: z0, curZ: start.z, x: start.x, y: start.y, keyboard, from, tiltDeg: 0, spinDeg: o.spinDeg ?? 0, lying: o.orient === 'lying',
    };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'slotMass' || o.kind === 'hanger' || PART_KINDS.has(o.kind) ? 'metal' : 'click');
    if (PART_KINDS.has(o.kind)) this.hintOnce('f101.hint.part');
    if (o.kind === 'hanger') this.hintOnce('f101.hint.hanger');
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
    this.layOnBench(h.id, h.from.pose.x, h.from.pose.y, 0);
  }

  /** Destino al soltar según lo que haya debajo (el dominio decide si el acople es posible). */
  place(h: HeldF, p: Pose) {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    const pan = { x: BALANCE_POS.x, y: BALANCE_POS.y - 2 };
    const id = h.id;
    if (PART_KINDS.has(h.kind)) {
      const gap = caliperGap(w);
      if (id !== 'massStd01' && near(gap, 4) && p.z < gap.z + 6) {
        const dim = h.kind === 'gaugeBlock' ? 'L' : h.kind === 'metalCyl' && h.lying ? 'h' : 'd';
        const r = this.send({ type: 'placeInCaliper', partId: id, dimension: dim, tiltDeg: h.tiltDeg, spinDeg: h.spinDeg }, 'metal');
        if (r.ok) return this.hintOnce('f101.hint.caliperSlide');
      }
      const ax = micrometerAxis(w);
      if (id !== 'massStd01' && near(ax, 3.5) && p.z < ax.z + 6) {
        const r = this.send({ type: 'placeInMicrometer', partId: id, spinDeg: h.spinDeg }, 'metal');
        if (r.ok) return this.hintOnce('f101.hint.ratchet');
      }
      const m = gradCylMouth(w);
      if (near(m, m.r + 1.5) && p.z > m.z - 1) {
        // La altura de suelta sobre el agua la da la pose real de la pieza al abrir la mano.
        const r = this.send({ type: 'dropIntoCylinder', partId: id, heightCm: p.z - meniscusZ(w) }, 'glass');
        if (r.ok) return;
      }
      if (id === 'massStd01' && near(SENSOR_POS, 6)) {
        this.send({ type: 'setPose', id, pose: { x: SENSOR_POS.x, y: SENSOR_POS.y - 4, z: GEOF101.sensorBox.h + 1, rotationRad: 0 }, support: 'sensor01' }, 'metal');
        return this.hintOnce('f101.hint.calibrate');
      }
    }
    if ((PART_KINDS.has(h.kind) || h.kind === 'dish') && near(pan, 7)) {
      const r = this.send({ type: 'setPose', id, pose: { x: pan.x, y: pan.y, z: GEOF101.balance.panZ, rotationRad: 0 }, support: 'pan' }, 'clink');
      if (r.ok) return this.hintOnce('f101.hint.waitStable');
    }
    const dish = w.objects.dish01.pose;
    if (PART_KINDS.has(h.kind) && near(dish, 4)) {
      this.send({ type: 'setPose', id, pose: { x: dish.x, y: dish.y, z: dish.z + 0.4, rotationRad: 0 }, support: 'dish01' }, 'clink');
      return;
    }
    if (h.kind === 'level' && distToTable(p.x, p.y) < T.r - 3) {
      this.send({ type: 'setPose', id, pose: { x: p.x, y: p.y, z: T.topZ, rotationRad: 0 }, support: 'forceTable01' });
      return this.hintOnce('f101.hint.levelFeet');
    }
    if (h.kind === 'tissue') return this.useTissue(p);
    if (h.kind === 'hanger') {
      const pl = pulleyNear(w, p.x, p.y, 5);
      if (pl && this.send({ type: 'hang', hangerId: id, pulleyId: pl }, 'metal').ok) return;
      if (near(RACK_POS, 12)) return void this.send({ type: 'setPose', id, pose: { x: RACK_POS.x + 9.5, y: RACK_POS.y - 3 + HANGERS.indexOf(id as never) * 3, z: 0, rotationRad: 0 }, support: 'rack' });
    }
    if (h.kind === 'slotMass') {
      const hanger = HANGERS.find((hg) => {
        const hp = hungPose(w, hg);
        return hp && near(hp, 4);
      });
      if (hanger && this.send({ type: 'loadMass', massId: id, hangerId: hanger }, 'metal').ok) return;
      if (near(RACK_POS, 10)) {
        const i = Object.keys(w.masses).filter((k) => !HANGERS.includes(k as never)).indexOf(id);
        return void this.send({ type: 'setPose', id, pose: rackSlot(Math.max(0, i)), support: 'rack' }, 'metal');
      }
    }
    if (h.kind === 'dynamometer') {
      const d = distToTable(p.x, p.y);
      if (d > T.r - 2 && d < T.r + 14) {
        const r = this.send({ type: 'mountDynamometer', on: true, angleDeg: Math.round(tableAngleOf(p.x, p.y)) }, 'metal');
        if (r.ok) return this.hintOnce('f101.hint.dynZero');
      }
    }
    const tray = w.objects.tray01.pose;
    if (near(tray, 9)) {
      this.send({ type: 'setPose', id, pose: { x: p.x, y: p.y, z: GEOF101.tray.h * 0.3, rotationRad: 0 }, support: 'tray' });
      return;
    }
    this.layOnBench(id, p.x, p.y, h.kind === 'dynamometer' ? 0.9 : 0);
  }

  /** El pañuelo limpia las caras del micrómetro, seca una pieza mojada o la mesada; luego vuelve a su lugar. */
  private useTissue(p: Pose) {
    const w = this.w;
    const ax = micrometerAxis(w);
    if (Math.hypot(p.x - ax.x, p.y - ax.y) < 6) this.send({ type: 'cleanFaces' });
    else {
      const wet = Object.values(w.parts).find((pt) => pt.wetG > 0.005 && Math.hypot(w.objects[pt.id].pose.x - p.x, w.objects[pt.id].pose.y - p.y) < 6);
      if (wet) this.send({ type: 'dryPart', partId: wet.id });
      else if (w.water.benchMl > 0.01) this.send({ type: 'wipeBench' });
    }
    this.layOnBench('tissue01', 28, 42, 0);
  }

  private occupied(x: number, y: number, r: number, exclude: string): boolean {
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support !== 'bench') continue;
      const rr = FOOT[o.kind];
      if (rr && Math.hypot(x - o.pose.x, y - o.pose.y) < rr + r + 0.3) return true;
    }
    if (distToTable(x, y) < T.r + 4 + r) return true;
    return false;
  }

  private freeSpot(x: number, y: number, r: number, exclude: string) {
    for (let k = 0; k < 16; k++) {
      const ty = Math.max(3, Math.min(60, y - k * 3));
      if (!this.occupied(x, ty, r, exclude)) return { x, y: ty };
      for (const dx of [-4, 4, -8, 8, -12, 12]) if (!this.occupied(x + dx, ty, r, exclude)) return { x: x + dx, y: ty };
    }
    return { x, y: 4 };
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench').map((o) => o.id);
  }

  private bodyFloor(id: string, x: number, y: number): number {
    const body = this.obj(id);
    if (!body) return 0;
    return this.view?.solidFloor?.(id, body.pose, x, y, this.restingIds()) ?? 0;
  }

  layOnBench(id: string, x0: number, y0: number, z: number) {
    const o = this.obj(id);
    const r = FOOT[o?.kind ?? 'tissue'] ?? 1;
    const c = clampToBench(x0, y0);
    const free = this.freeSpot(c.x, c.y, r, id);
    const spot = clearSpotNear((x, y) => this.bodyFloor(id, x, y), free.x, free.y, z);
    this.dispatch({ type: 'setPose', id, pose: { x: spot.x, y: spot.y, z, rotationRad: 0 }, support: 'bench' });
    this.host.sound('click');
  }

  /** Traslado accesible (panel): lleva una pieza a un destino como si se soltara allí con la pose correcta. */
  moveTo(id: string, where: 'pan' | 'dish' | 'caliper' | 'micrometer' | 'cylinder' | 'bench' | 'tray' | 'sensor' | 'table' | string, opts: { lying?: boolean; tiltDeg?: number; spinDeg?: number; heightCm?: number } = {}) {
    if (this.blocked()) return { ok: false, code: 'TEACHER_STOP' };
    if (this.held) this.release();
    const o = this.w.objects[id];
    if (!o || !this.grab(id, true)) return { ok: false };
    const h = this.held!;
    h.lying = opts.lying ?? h.lying;
    h.tiltDeg = opts.tiltDeg ?? 0;
    h.spinDeg = opts.spinDeg ?? h.spinDeg;
    const w = this.w;
    const at: { x: number; y: number; z: number } =
      where === 'pan' ? { x: BALANCE_POS.x, y: BALANCE_POS.y - 2, z: GEOF101.balance.panZ + 2 }
        : where === 'dish' ? { ...w.objects.dish01.pose, z: 2 }
          : where === 'caliper' ? { ...caliperGap(w), z: caliperGap(w).z + 1 }
            : where === 'micrometer' ? { ...micrometerAxis(w), z: micrometerAxis(w).z + 1 }
              : where === 'cylinder' ? { ...gradCylMouth(w), z: meniscusZ(w) + (opts.heightCm ?? 1) }
                : where === 'sensor' ? { x: SENSOR_POS.x, y: SENSOR_POS.y, z: 6 }
                  : where === 'tray' ? { ...w.objects.tray01.pose, z: 2 }
                    : where === 'table' ? { x: TABLE_CENTER.x + 6, y: TABLE_CENTER.y, z: T.topZ + 1 }
                      : PULLEYS.includes(where as never) ? { ...rimPoint(w.table.pulleys[where].angleDeg, T.pulleyOut + 1), z: 10 }
                        : HANGERS.includes(where as never) ? { ...(hungPose(w, where) ?? o.pose), z: 10 }
                          : where === 'rack' ? { x: RACK_POS.x, y: RACK_POS.y, z: 6 }
                            : { x: h.from.pose.x, y: h.from.pose.y, z: 0 };
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    this.dispatch({ type: 'setPose', id, pose: { x: at.x, y: at.y, z: at.z, rotationRad: 0 }, support: 'hand' });
    this.place(h, { x: at.x, y: at.y, z: at.z, rotationRad: 0 });
    return { ok: true };
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
    const onBench = clampToBench(h.x, h.y);
    let tx = onBench.x;
    let ty = onBench.y;
    const pushed = this.view.solidPush?.(h.id, o.pose, tx, ty, this.restingIds(), false, false);
    if (pushed) {
      tx = pushed.x;
      ty = pushed.y;
    }
    const floor = Math.max(0, this.bodyFloor(h.id, tx, ty));
    const tz = Math.max(h.z, floor);
    const k = Math.min(1, dt * 16);
    const nx = o.pose.x + (tx - o.pose.x) * k;
    const ny = o.pose.y + (ty - o.pose.y) * k;
    h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
    const rot = (h.tiltDeg * Math.PI) / 180;
    if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001) {
      this.dispatch({ type: 'setPose', id: h.id, pose: { x: nx, y: ny, z: h.curZ, rotationRad: rot }, support: 'hand' });
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
    if (PART_KINDS.has(h.kind)) {
      if (near(caliperGap(w), 4)) return 'caliper01';
      if (near(micrometerAxis(w), 3.5)) return 'micrometer01';
      if (near(gradCylMouth(w), GEOF101.gradCyl.r + 1.5)) return 'gradCyl01';
      if (near({ x: BALANCE_POS.x, y: BALANCE_POS.y - 2 }, 7)) return 'balance01';
    }
    if (h.kind === 'hanger') return pulleyNear(w, x, y, 5);
    if (h.kind === 'slotMass') return HANGERS.find((hg) => {
      const hp = hungPose(w, hg);
      return hp && near(hp, 4);
    }) ?? null;
    if (h.kind === 'dynamometer' && distToTable(x, y) > T.r - 2 && distToTable(x, y) < T.r + 14) return 'forceTable01';
    return null;
  }
}
