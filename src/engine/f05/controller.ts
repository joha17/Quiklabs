/**
 * Interacción de F05: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: la manivela del elevador y la del tirador se giran (rueda o arrastre
 *   vertical); las compuertas se arrastran a lo largo del tablero; el gancho del tirador sube o baja; la célula de carga
 *   se inclina sobre su soporte.
 * - El bloque se arrastra: al soltarlo sobre el tablero queda en esa posición (y a ese desvío lateral); sobre el
 *   pasador queda retenido arriba; sobre el plato se pesa. Los lastres se toman y, al soltarlos, la pose decide (sobre
 *   el bloque → perno, centrado o no; sobre el plato → pesar; si no, al estante). Lo que se lleva en la mano no
 *   atraviesa los aparatos macizos ni sale de la mesada.
 * - Clic en el índice de una compuerta o en el goniómetro: lectura con la dirección REAL de la cámara (paralaje).
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F05Host } from './host';
import type { F05Lab3D } from './F05Lab3D';
import type { Channel, F05Command, F05DispatchResult, GateId, Material } from '../../simulation/f05-world/commands';
import type { F05ObjKind, F05World, Pose } from '../../simulation/f05-world/types';
import { BLOCK_MIN_S, BLOCK_TOP_S, GEOF05 } from '../../simulation/f05-world/geometry';
import { busyF5 } from '../../simulation/f05-world/world';
import { blockRoom, eyePoint, objRoom, panRoom, planeAxes, rackSlot, thetaOf } from './layout';

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
  kind: F05ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'elevator' | 'crank' | 'gate' | 'height' | 'cellTilt' | 'block';
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
const PORT: Record<string, Channel> = { portL: 'load01', portG: 'gates', portV: 'video' };
const PL = GEOF05.plane;
const STRIP_MAT: Record<string, Material> = { stripPaper: 'paper', stripRubber: 'rubber' };

export class F05Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Bloque arrastrado con la mano: dónde se dibuja mientras tanto (cm de la sala) o null. */
  blockGhost: { x: number; y: number; z: number } | null = null;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F05Host, private lab: F05Lab3D) {}

  private get w(): F05World {
    return this.host.runtime.world;
  }

  private dispatch(c: F05Command): F05DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f05.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F05Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
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

  /** Escala del tablero en el índice de la compuerta: crece a lo largo del tablero. */
  scaleView(id: GateId) {
    return this.parallax(eyePoint(this.w, id), planeAxes(this.w).along);
  }

  /** Goniómetro de plomada: el arco crece alrededor de su centro; el paralaje que importa es el lateral (x). */
  gonioView() {
    return this.parallax(eyePoint(this.w, 'gonio01'), { x: 1, y: 0, z: 0 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readScale(id: GateId) {
    const r = this.send({ type: 'readScale', target: id, viewDeg: this.scaleView(id) });
    if (r.ok) this.host.onLens?.(id);
    return r;
  }

  readAngle(target: 'plane' | 'support' = 'plane') {
    const view = target === 'plane' ? this.gonioView() : this.parallax(eyePoint(this.w, 'elevator01'), { x: 1, y: 0, z: 0 });
    const r = this.send({ type: 'readAngle', target, viewDeg: view });
    if (r.ok) this.host.onLens?.(target === 'plane' ? 'gonio01' : 'elevator01');
    return r;
  }

  readBalance() {
    const r = this.send({ type: 'readBalance' });
    if (r.ok) this.host.onLens?.('balance01');
    return r;
  }

  readTemp() {
    const r = this.send({ type: 'readTemp' });
    if (r.ok) this.host.onLens?.('thermo01');
    return r;
  }

  release() {
    const r = this.send({ type: 'releaseBlock' }, null);
    if (r.ok) this.host.sound('metal');
    return r;
  }

  cycleRate() {
    const rates = this.w.params.rates;
    const i = rates.indexOf(this.w.logger.rateHz);
    return this.send({ type: 'setRate', hz: rates[(i + 1) % rates.length] });
  }

  /** Motor del tirador: apagado → 0,5 → 1 → 2 → 5 cm/s → apagado. */
  cycleDrive() {
    const d = this.w.params.drives;
    const cur = Math.round(this.w.puller.driveMs * 1e4) / 100;
    const i = d.indexOf(cur);
    return this.send({ type: 'setDrive', cmS: i < 0 ? d[0] : i + 1 < d.length ? d[i + 1] : 0 }, 'metal');
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
    if (this.hovered === 'elevator01' && this.hoveredPart === 'crank') {
      this.send({ type: 'turnElevator', turns: -notch }, null);
      return true;
    }
    if (this.hovered === 'puller01' && this.hoveredPart === 'crank') {
      this.send({ type: 'turnCrank', turns: -notch }, null);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, perillas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    const o = this.obj(id);
    switch (id) {
      case 'plane01':
        if (part === 'pin') return this.release();
        if (part === 'clamp') return this.send({ type: 'clampBase', on: !w.plane.clamped }, 'metal');
        return this.send({ type: 'inspect', target: 'plane01' }, null);
      case 'block01':
        if (part === 'hook') return this.send({ type: 'attachCable', on: !w.puller.attached }, 'clink');
        if (part === 'flag' && w.block.flagBent) return this.send({ type: 'reseatFlag' });
        if (w.block.on === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
        if (w.block.on === 'bench') return this.send({ type: 'placeBlock', s: 0.25 }, 'clink');
        return this.lab.camera?.eyeLevel('block01');
      case 'elevator01':
        if (part === 'crank') return this.send({ type: 'turnElevator', turns: 1 }, null);
        if (part === 'lock') return this.send({ type: 'setLock', on: !w.plane.locked }, 'metal');
        if (part === 'scale') return this.readAngle('support');
        return this.lab.camera?.focusObject(id, false);
      case 'gonio01':
        return this.readAngle('plane');
      case 'catcher01':
        return this.send({ type: 'setCatcher', on: !w.catcherOn }, 'clink');
      case 'puller01':
        if (part === 'motor') return this.cycleDrive();
        if (part === 'return') return this.send({ type: 'returnPuller' }, 'metal');
        if (part === 'handle') return this.send({ type: 'jerk' }, 'metal');
        if (part === 'crank') return this.send({ type: 'turnCrank', turns: 1 }, null);
        return this.lab.camera?.focusObject(id, false);
      case 'load01':
        if (part === 'zero') return this.send({ type: 'zeroSensor' });
        if (part === 'cal') return this.send({ type: 'calibrateSensor' });
        if (part === 'range') return this.cycleRange();
        if (part === 'plug') return this.send({ type: 'connect', channel: 'load01', on: !w.sensor.connected });
        return this.host.onLens?.('logger01');
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part && PORT[part]) {
          const ch = PORT[part];
          const on = ch === 'gates' ? w.logger.gatesConnected : ch === 'video' ? w.logger.videoOn : w.sensor.connected;
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
      case 'thermo01':
        return this.readTemp();
      case 'stripRack01':
        if (part === 'wood') return this.send({ type: 'setSurface', material: 'wood' }, 'clink');
        return this.lab.camera?.focusObject(id, false);
    }
    if (o?.kind === 'strip') return this.send({ type: 'setSurface', material: o.support === 'plane' ? 'wood' : STRIP_MAT[id] }, 'clink');
    if (o?.kind === 'ballast') {
      if (o.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
      if (o.support === 'rack') return this.send({ type: 'placeMass', id, on: 'block', offsetCm: 0 }, 'clink');
      return this.send({ type: 'placeMass', id, on: 'rack' }, 'clink');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    if (hit.id === 'elevator01' && hit.part === 'crank') return 'elevator';
    if (hit.id === 'puller01' && hit.part === 'crank') return 'crank';
    if (hit.id === 'puller01' && hit.part === 'height') return 'height';
    if ((hit.id === 'gate1' || hit.id === 'gate2') && hit.part === 'mount') return 'gate';
    if (hit.id === 'load01' && hit.part === 'body') return 'cellTilt';
    if (hit.id === 'block01' && (hit.part === 'body' || hit.part === undefined) && !this.w.puller.attached && !busyF5(this.w)) return 'block';
    return null;
  }

  /** s del tablero bajo el puntero (proyección sobre el plano vertical del eje del tablero). */
  private sAt(sx: number, sy: number) {
    const th = thetaOf(this.w) * (Math.PI / 180);
    // Se intersecta el rayo con el plano de la cara (aproximado por la altura media del tablero) y se proyecta.
    const zMid = PL.hingeZ + PL.thick + 50 * Math.sin(th);
    const p = this.view!.toBench(sx, sy, zMid);
    return (p.x - PL.hingeX) / 100 / Math.max(0.3, Math.cos(th));
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'elevator':
      case 'crank': {
        k.acc += (k.lastY - sy) / 14;
        const turns = Math.trunc(k.acc);
        if (turns) {
          this.run(this.dispatch(k.kind === 'elevator' ? { type: 'turnElevator', turns } : { type: 'turnCrank', turns }));
          k.acc -= turns;
        }
        break;
      }
      case 'gate':
        this.run(this.dispatch({ type: 'moveGate', id: k.id as GateId, s: this.sAt(sx, sy) }));
        break;
      case 'height':
        this.dispatch({ type: 'setCableHeight', cm: w.puller.heightCm + (k.lastY - sy) * 0.05 });
        break;
      case 'cellTilt':
        this.dispatch({ type: 'mountSensor', angleDeg: w.sensor.angleDeg + (k.lastY - sy) * 0.3 });
        break;
      case 'block': {
        // El bloque sigue al puntero sobre la mesada (o sobre la cara del tablero si está encima).
        const s = this.sAt(sx, sy);
        const onPlane = s > 0 && s < 1;
        const p = this.view!.toBench(sx, sy, onPlane ? PL.hingeZ + PL.thick + s * 100 * Math.sin(thetaOf(w) * (Math.PI / 180)) : 0);
        const z = onPlane ? PL.hingeZ + PL.thick + Math.max(0, s) * 100 * Math.sin(thetaOf(w) * (Math.PI / 180)) + 1 : 6;
        this.blockGhost = { x: p.x, y: p.y, z };
        const d = Math.hypot(p.x - panRoom().x, p.y - panRoom().y);
        this.dockTarget = d < 10 ? 'balance01' : onPlane && Math.abs(p.y - PL.y) < PL.w ? 'plane01' : null;
        break;
      }
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    if (k.kind === 'gate') this.hintOnce('f05.hint.readScaleFront');
    if (k.kind === 'block') this.dropBlock();
  }

  /** Suelta el bloque arrastrado: plato → pesar; tablero → en esa s (cerca del pasador queda retenido); si no, vuelve. */
  private dropBlock() {
    const g = this.blockGhost;
    this.blockGhost = null;
    this.dockTarget = null;
    if (!g) return;
    const w = this.w;
    if (Math.hypot(g.x - panRoom().x, g.y - panRoom().y) < 10) return void this.send({ type: 'placeOnBalance', id: 'block01' }, 'clink');
    const th = thetaOf(w) * (Math.PI / 180);
    const s = (g.x - PL.hingeX) / 100 / Math.max(0.3, Math.cos(th));
    if (s < 0 || s > 1.02) return;
    const lateral = Math.round((g.y - PL.y) * 10) / 10;
    if (s >= BLOCK_TOP_S - 0.03) return void this.send({ type: 'placeBlock', s: 'top', lateralCm: lateral }, 'clink');
    this.send({ type: 'placeBlock', s: Math.max(BLOCK_MIN_S, Math.round(s * 1000) / 1000), lateralCm: lateral }, 'clink');
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
      case 'm': return this.cycleDrive(), true;
      case 'r': return this.send({ type: 'returnPuller' }, 'metal'), true;
      case 'b': return this.readBalance(), true;
      case 'g': return this.readAngle('plane'), true;
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
      this.send({ type: 'turnElevator', turns: key === 'ArrowUp' ? 1 : -1 }, null);
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

  // ─────────────── Tomar y soltar lastres ───────────────

  private grabbable(id: string): boolean {
    const o = this.obj(id);
    if (!o) return false;
    if (o.kind === 'ballast') return o.support === 'rack' || o.support === 'block01' || o.support === 'bench';
    return false;
  }

  grab(id: string, keyboard = false): boolean {
    const o = this.obj(id);
    if (!o || !this.grabbable(id) || this.blocked()) return false;
    if (o.support === 'block01' && busyF5(this.w)) return false;
    if (this.held) this.drop();
    const start = objRoom(this.w, id);
    const from = { pose: { ...o.pose }, support: o.support };
    const pose = { x: start.x, y: start.y, z: start.z, rotationRad: 0 };
    if (o.support !== 'rack') this.dispatch({ type: 'placeMass', id, on: 'rack' });
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

  /** Destino al soltar un lastre: sobre el bloque (desvío medido desde el perno), sobre el plato o el estante. */
  place(h: HeldF, p: Pose) {
    const w = this.w;
    this.toRack(h.id);
    const b = blockRoom(w);
    const dBlock = Math.hypot(p.x - b.x, p.y - b.y);
    if (dBlock < 8 && w.block.on !== 'bench') return void this.send({ type: 'placeMass', id: h.id, on: 'block', offsetCm: Math.round(dBlock * 10) / 10 }, 'clink');
    if (Math.hypot(p.x - panRoom().x, p.y - panRoom().y) < 9) return void this.send({ type: 'placeOnBalance', id: h.id }, 'clink');
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench').map((o) => o.id);
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const h = this.held;
    if (!this.blockGhost) this.dockTarget = null;
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
    const b = blockRoom(w);
    const d = (q: { x: number; y: number }) => Math.hypot(nx - q.x, ny - q.y);
    this.dockTarget = d(panRoom()) < 9 ? 'balance01' : d(b) < 8 && w.block.on !== 'bench' ? 'block01' : null;
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** ¿Hay un ensayo en curso? (el panel desactiva los cambios de montaje). */
  busy(): boolean {
    return busyF5(this.w);
  }
}
