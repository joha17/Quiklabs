/**
 * Interacción de F06: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: la perilla de la columna del riel sube o baja la parte alta (arrastre
 *   vertical o rueda); las compuertas se arrastran a lo largo del riel; la mordaza del péndulo cambia el largo; el
 *   sensor de fuerza se inclina sobre su soporte.
 * - El carro se arrastra hacia el lanzador: el trinquete lo retiene en la muesca de cada centímetro (comprimir); el
 *   gatillo lo suelta. Arrastrado hasta el plato, se pesa. La esfera del péndulo se aparta con la mano y al soltar el
 *   botón se suelta.
 * - Pesas, porta-pesas y pesas del carro se toman y la pose al soltar decide: bajo el resorte → colgar; sobre el
 *   carro → cargar; sobre el plato → pesar; si no, al estante. Los resortes se llevan al gancho del soporte, al
 *   lanzador o al estante. Lo que se lleva en la mano no atraviesa los aparatos macizos ni sale de la mesada.
 * - Clic en la regla, el medidor o la escala del péndulo: lectura con la dirección REAL de la cámara (paralaje).
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F06Host } from './host';
import type { F06Lab3D } from './F06Lab3D';
import type { Channel, F06Command, F06DispatchResult, HeightRef, SpringPlace, TrackGate } from '../../simulation/f06-world/commands';
import type { F06ObjKind, F06World, Pose } from '../../simulation/f06-world/types';
import { CART_START_S, GEOF06 } from '../../simulation/f06-world/geometry';
import { bobMovingF6, busyF6, cartMovingF6 } from '../../simulation/f06-world/world';
import { cartRoom, eyePoint, hangerRoom, objRoom, panRoom, pivotRoom, rackSlot, springBottom, standHook, trackAt } from './layout';

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
  kind: F06ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'riser' | 'gate' | 'length' | 'sensorTilt' | 'cart' | 'bob' | 'spring';
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
const PORT: Record<string, Channel> = { portF: 'force', portP: 'position', portG: 'gates', portA: 'angle' };
const TR = GEOF06.track;
const PD = GEOF06.pend;
/** Fuerza del patín y constante del amortiguador al activarlos con un clic (los mismos de la ruta). */
export const PAD_N = 0.15;
export const DAMPER_C = 0.3;

export class F06Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Carro llevado al plato o resorte llevado con la mano: dónde se dibuja mientras tanto (cm de la sala) o null. */
  ghost: { id: string; x: number; y: number; z: number } | null = null;
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F06Host, private lab: F06Lab3D) {}

  private get w(): F06World {
    return this.host.runtime.world;
  }

  private dispatch(c: F06Command): F06DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f06.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F06Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
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

  /** La regla crece hacia abajo; el medidor de altura y la escala del péndulo, hacia arriba y hacia abajo. */
  rulerView() {
    return this.parallax(eyePoint(this.w, 'ruler01'), { x: 0, y: 0, z: -1 });
  }
  gaugeView() {
    return this.parallax(eyePoint(this.w, 'gauge01'), { x: 0, y: 0, z: 1 });
  }
  pendScaleView() {
    return this.parallax(eyePoint(this.w, 'pendScale'), { x: 0, y: 0, z: -1 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readRuler() {
    const r = this.send({ type: 'readRuler', viewDeg: this.rulerView() });
    if (r.ok) this.host.onLens?.('ruler01');
    return r;
  }

  readHeight(ref: HeightRef = 'launcher') {
    const r = this.send({ type: 'readHeight', ref, viewDeg: this.gaugeView() });
    if (r.ok) this.host.onLens?.('gauge01');
    return r;
  }

  readPendScale() {
    const r = this.send({ type: 'readPendScale', viewDeg: this.pendScaleView() });
    if (r.ok) this.host.onLens?.('pendScale');
    return r;
  }

  readBalance() {
    const r = this.send({ type: 'readBalance' });
    if (r.ok) this.host.onLens?.('balance01');
    return r;
  }

  readLaunch() {
    const r = this.send({ type: 'readLaunch' });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  readGates() {
    return this.send({ type: 'readGates' });
  }

  readPendulum() {
    const r = this.send({ type: 'readPendulum' });
    if (r.ok) this.host.onLens?.('angle01');
    return r;
  }

  release() {
    const r = this.send({ type: 'releaseCart', pushMs: 0 }, null);
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

  /** Esfera: la suelta si está sostenida; si oscila, la detiene. */
  bobClick() {
    const p = this.w.pend;
    if (p.held) return this.send({ type: 'releaseBob', lateralMs: 0 }, 'click');
    if (bobMovingF6(this.w)) return this.send({ type: 'stopBob' }, 'click');
    return this.lab.camera?.focusObject('pend01', false);
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
      this.held.z = Math.max(0, Math.min(140, this.held.z - notch * 2));
      return true;
    }
    if (this.hovered === 'track01' && this.hoveredPart === 'riser') {
      this.send({ type: 'setHeight', m: this.w.track.h - notch * 0.01 }, null);
      return true;
    }
    if (this.hovered === 'pend01' && this.hoveredPart === 'length') {
      this.send({ type: 'setLength', m: this.w.pend.L + notch * 0.01 }, null);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, perillas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    const o = this.obj(id);
    switch (id) {
      case 'stand01':
        return this.send({ type: 'inspect', target: 'stand01' }, null);
      case 'ruler01':
        if (part === 'align') return this.send({ type: 'alignRuler' });
        return this.readRuler();
      case 'hanger01':
        if (w.objects.hanger01.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.send({ type: 'hangHanger', on: !w.stand.hangerOn }, 'clink');
      case 'launcher01':
        if (part === 'trigger') return this.release();
        if (part === 'clip') return this.send({ type: 'secureSpring', on: !w.track.springSecured }, 'metal');
        return this.lab.camera?.eyeLevel('launcher01');
      case 'cart01':
        if (w.cart.on === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
        if (part === 'wheel' && w.cart.damaged) return this.send({ type: 'repairCart' }, 'metal');
        if (w.cart.held || (!busyF6(w) && !cartMovingF6(w) && w.cart.s > CART_START_S + 0.05)) return this.send({ type: 'returnCart' }, 'clink');
        return this.lab.camera?.eyeLevel('cart01');
      case 'track01':
        if (part === 'clamp') return this.send({ type: 'clampTrack', on: !w.track.clamped }, 'metal');
        if (part === 'riser') return this.send({ type: 'setHeight', m: w.track.h + 0.01 }, null);
        return this.send({ type: 'inspect', target: 'track01' }, null);
      case 'brake01':
        return this.send({ type: 'setBrake', on: !w.track.brakeOn }, 'metal');
      case 'pad01':
        return this.send({ type: 'setFriction', n: w.track.frictionN > 0 ? 0 : PAD_N }, 'clink');
      case 'damper01':
        return this.send({ type: 'setDamper', c: w.track.damperC > 0 ? 0 : DAMPER_C }, 'clink');
      case 'gauge01':
        if (part === 'bench') return this.readHeight('bench');
        return this.readHeight('launcher');
      case 'force01':
        if (part === 'zero') return this.send({ type: 'zeroSensor' });
        if (part === 'cal') return this.send({ type: 'calibrateSensor' });
        if (part === 'range') return this.cycleRange();
        if (part === 'plug') return this.send({ type: 'connect', channel: 'force', on: !w.sensor.connected });
        return this.host.onLens?.('logger01');
      case 'pos01':
        return this.send({ type: 'connect', channel: 'position', on: !w.logger.posConnected });
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part === 'sync') return this.send({ type: 'syncChannels', on: !w.logger.synced });
        if (part === 'readL') return this.readLaunch();
        if (part === 'readG') return this.readGates();
        if (part && PORT[part]) {
          const ch = PORT[part];
          const on = ch === 'force' ? w.sensor.connected : ch === 'position' ? w.logger.posConnected : ch === 'gates' ? w.logger.gatesConnected : w.logger.angleConnected;
          return this.send({ type: 'connect', channel: ch, on: !on });
        }
        return this.host.onLens?.('logger01');
      case 'gate1':
      case 'gate2':
        return this.readGates();
      case 'gate3':
      case 'angle01':
        if (part === 'plug') return this.send({ type: 'connect', channel: 'angle', on: !w.logger.angleConnected });
        return this.readPendulum();
      case 'pend01':
        if (part === 'scale') return this.readPendScale();
        if (part === 'length') return this.send({ type: 'setLength', m: w.pend.L - 0.01 }, null);
        if (part === 'bob') return this.bobClick();
        return this.lab.camera?.eyeLevel('pendScale');
      case 'balance01':
        if (part === 'tare') return this.send({ type: 'tareBalance' });
        if (part === 'read') return this.readBalance();
        if (part === 'pan' && w.balance.on) return this.send({ type: 'removeFromBalance' }, 'clink');
        return this.lab.camera?.eyeLevel('balance01');
    }
    if (o?.kind === 'slotMass') {
      if (o.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
      return this.send({ type: 'hangMass', id, on: o.support !== 'hanger' }, 'clink');
    }
    if (o?.kind === 'cartMass') {
      if (o.support === 'balance') return this.send({ type: 'removeFromBalance' }, 'clink');
      return this.send({ type: 'loadCart', id, on: o.support !== 'cart' }, 'clink');
    }
    if (o?.kind === 'spring') {
      const at = w.springs[id].at;
      return this.send({ type: 'inspect', target: id }, at === 'rack' ? 'click' : null);
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    const w = this.w;
    if (hit.id === 'track01' && hit.part === 'riser') return 'riser';
    if ((hit.id === 'gate1' || hit.id === 'gate2') && hit.part === 'mount') return 'gate';
    if (hit.id === 'pend01' && hit.part === 'length') return 'length';
    if (hit.id === 'pend01' && hit.part === 'bob' && !bobMovingF6(w)) return 'bob';
    if (hit.id === 'force01' && hit.part === 'body') return 'sensorTilt';
    if (hit.id === 'cart01' && w.cart.on === 'track' && hit.part !== 'wheel' && !busyF6(w) && !cartMovingF6(w) && !w.cart.held) return 'cart';
    if (this.obj(hit.id)?.kind === 'spring') return 'spring';
    return null;
  }

  /** s del riel bajo el puntero (proyección sobre el plano vertical del eje del riel). */
  private sAt(sx: number, sy: number) {
    const p = this.view!.toBench(sx, sy, TR.z0 + 2);
    return (p.x - TR.x0) / 100;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'riser':
        this.dispatch({ type: 'setHeight', m: w.track.h + (k.lastY - sy) * 0.002 });
        break;
      case 'length':
        this.dispatch({ type: 'setLength', m: w.pend.L - (k.lastY - sy) * 0.003 });
        break;
      case 'gate':
        this.run(this.dispatch({ type: 'moveGate', id: k.id as TrackGate, s: this.sAt(sx, sy) }));
        break;
      case 'sensorTilt':
        this.dispatch({ type: 'mountSensor', angleDeg: w.sensor.angleDeg + (k.lastY - sy) * 0.3 });
        break;
      case 'cart': {
        // Hacia el lanzador: muescas del trinquete; hacia la balanza: el carro se lleva con la mano.
        const p = this.view!.toBench(sx, sy, TR.z0 + 3);
        const nearPan = Math.hypot(p.x - panRoom().x, p.y - panRoom().y) < 14;
        const s = (p.x - TR.x0) / 100;
        if (nearPan || Math.abs(p.y - TR.y) > 18) {
          this.ghost = { id: 'cart01', x: p.x, y: p.y, z: nearPan ? panRoom().z : TR.z0 + 4 };
          this.dockTarget = nearPan ? 'balance01' : null;
        } else {
          this.ghost = null;
          this.dockTarget = 'launcher01';
          const x = Math.max(0, Math.min(GEOF06.launcher.maxComp, CART_START_S - s));
          const cm = Math.round(x * 100);
          if (cm !== Math.round(w.cart.compression * 100)) this.run(this.dispatch({ type: 'compress', x: cm / 100 }));
        }
        break;
      }
      case 'bob': {
        // La esfera sigue al puntero en el plano de oscilación; el ángulo lo limita el alcance del montaje.
        const q = this.view!.toWall?.(sx, sy, PD.y) ?? { x: this.view!.toBench(sx, sy, PD.pivotZ - w.pend.L * 100).x, z: PD.pivotZ - w.pend.L * 100 };
        const pv = pivotRoom();
        const deg = (Math.atan2(q.x - pv.x, Math.max(1, pv.z - q.z)) * 180) / Math.PI;
        this.dispatch({ type: 'holdBob', deg });
        break;
      }
      case 'spring': {
        const z = 40;
        const p = this.view!.toBench(sx, sy, z);
        this.ghost = { id: k.id, x: p.x, y: p.y, z };
        this.dockTarget = this.springTarget(p) ?? null;
        break;
      }
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private springTarget(p: { x: number; y: number }): SpringPlace | null {
    const h = standHook();
    if (Math.hypot(p.x - h.x, p.y - h.y) < 14) return 'stand';
    const l = trackAt(this.w, 0.12);
    if (Math.hypot(p.x - l.x, p.y - l.y) < 16) return 'launcher';
    const r = rackSlot('spring02');
    if (Math.hypot(p.x - r.x, p.y - r.y) < 20) return 'rack';
    return null;
  }

  private endKnob(k: Knob) {
    const w = this.w;
    if (k.kind === 'gate') this.hintOnce('f06.hint.gateFlat');
    if (k.kind === 'riser') this.hintOnce('f06.hint.readGauge');
    if (k.kind === 'bob') {
      if (w.pend.held && Math.abs(w.pend.thetaDeg) >= 0.5) this.send({ type: 'releaseBob', lateralMs: 0 }, 'click');
    }
    if (k.kind === 'cart') {
      const g = this.ghost;
      this.ghost = null;
      this.dockTarget = null;
      if (g && Math.hypot(g.x - panRoom().x, g.y - panRoom().y) < 14) this.send({ type: 'placeOnBalance', id: 'cart01' }, 'clink');
      else if (w.cart.latched) this.hintOnce('f06.hint.trigger');
    }
    if (k.kind === 'spring') {
      const g = this.ghost;
      this.ghost = null;
      this.dockTarget = null;
      const at = g ? this.springTarget(g) : null;
      if (at) this.send({ type: 'mountSpring', id: k.id, at }, 'metal');
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
      case 'r': return this.send({ type: 'returnCart' }, 'clink'), true;
      case 'b': return this.readBalance(), true;
      case 'l': return this.readLaunch(), true;
      case 'v': return this.readGates(), true;
      case 'p': return this.bobClick(), true;
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
      this.send({ type: 'setHeight', m: this.w.track.h + (key === 'ArrowUp' ? 0.01 : -0.01) }, null);
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
    if (o.kind === 'slotMass') return o.support === 'rack' || o.support === 'hanger';
    if (o.kind === 'cartMass') return o.support === 'rack' || o.support === 'cart';
    if (o.kind === 'hanger') return o.support === 'rack';
    return false;
  }

  /** Devuelve una pieza al estante en el dominio (descolgar, descargar). */
  private unseat(id: string) {
    const o = this.obj(id)!;
    if (o.kind === 'slotMass' && o.support === 'hanger') this.dispatch({ type: 'hangMass', id, on: false });
    if (o.kind === 'cartMass' && o.support === 'cart') this.dispatch({ type: 'loadCart', id, on: false });
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
  private targetFor(kind: F06ObjKind, p: { x: number; y: number; z: number }): string | null {
    const w = this.w;
    const d = (q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    if (d(panRoom()) < 9 && !w.balance.on) return 'balance01';
    if (kind === 'slotMass' && w.stand.hangerOn && d(hangerRoom(w)) < 9) return 'hanger01';
    if (kind === 'hanger' && d(springBottom(w)) < 10) return 'stand01';
    if (kind === 'cartMass' && w.cart.on === 'track' && d(cartRoom(w)) < 10) return 'cart01';
    return null;
  }

  /** Destino al soltar: bajo el resorte, sobre el carro, sobre el plato o el estante. */
  place(h: HeldF, p: Pose) {
    const target = this.targetFor(h.kind, p);
    this.toRack(h.id);
    if (target === 'balance01') return void this.send({ type: 'placeOnBalance', id: h.id }, 'clink');
    if (target === 'hanger01') return void this.send({ type: 'hangMass', id: h.id, on: true }, 'clink');
    if (target === 'stand01') return void this.send({ type: 'hangHanger', on: true }, 'clink');
    if (target === 'cart01') return void this.send({ type: 'loadCart', id: h.id, on: true }, 'clink');
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
    return busyF6(this.w);
  }
}

