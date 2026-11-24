/**
 * Interacción de F12: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Lo que se lleva en la mano: el vaso volumétrico (se suelta bajo el desviador o en la mesada) y el tapón de goma
 *   (dentro de la boca abierta del Venturi queda en la garganta). Lo que se lleva no atraviesa los aparatos macizos ni
 *   sale de la mesada.
 * - Mandos con su grado de libertad real: la perilla de velocidad de la bomba gira con un arrastre, la manija de la
 *   válvula rotativa se gira de a una posición (un giro rápido de varias posiciones es una maniobra brusca) y el calibre
 *   se inclina con un arrastre sobre la pieza.
 * - Clic en juntas (apretar o abrir; en su anillo, colocar la empaquetadura), abrazaderas, purga, tapas de las tomas,
 *   llave de la bomba, desviador, botones del registrador y del cronómetro: el comando correspondiente. Clic en una
 *   escala (visor del depósito, regla de cotas, vaso): lectura con la dirección REAL de la cámara.
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F12Host } from './host';
import type { F12Lab3D } from './F12Lab3D';
import type { F12Command, F12DispatchResult } from '../../simulation/f12-world/commands';
import type { F12ObjKind, F12World, JointId, PortId, Pose, SensorId } from '../../simulation/f12-world/types';
import { GEOF12 } from '../../simulation/f12-world/geometry';
import { busyF12 } from '../../simulation/f12-world/world';
import { eyePoint, homeOf, objRoom } from './layout';

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
  kind: F12ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'speed' | 'valve' | 'tilt';
interface Knob {
  kind: KnobKind;
  id: string;
  sx: number;
  sy: number;
  lastY: number;
  lastX: number;
  acc: number;
  moved: boolean;
}

const CLICK_PX = 6;
const G = GEOF12;
const JOINT_OF: Record<string, JointId> = { jointJ1: 'J1', jointJ2: 'J2', jointJ3: 'J3' };
const PORT_OF: Record<string, PortId> = { tap1: 1, tap2: 2, tap3: 3 };

export class F12Controller {
  view: ViewAdapterF | null = null;
  held: HeldF | null = null;
  hovered: string | null = null;
  hoveredPart: string | null = null;
  dockTarget: string | null = null;
  /** Compatibilidad con la vista común: F12 no deja fantasmas. */
  ghost: { id: string; x: number; y: number; z: number } | null = null;
  /** Toma cuya cota se lee con la regla (la última tocada). */
  lastPort: PortId = 3;
  /** Calibre: sección, mordazas (interiores o exteriores) e inclinación sobre la pieza (°). */
  caliper: { section: 'D1' | 'D2'; face: 'inner' | 'outer'; tiltDeg: number } = { section: 'D1', face: 'inner', tiltDeg: 0 };
  private knob: Knob | null = null;
  private pointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; id: string; part?: string } | null = null;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: F12Host, private lab: F12Lab3D) {}

  private get w(): F12World {
    return this.host.runtime.world;
  }

  private dispatch(c: F12Command): F12DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f12.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F12Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
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

  /** Las escalas verticales crecen hacia arriba (visor del depósito, regla de cotas, vaso). */
  viewOf(target: 'sump01' | 'ruler01' | 'beaker01', port: PortId = this.lastPort) {
    return this.parallax(eyePoint(this.w, target, port), { x: 0, y: 0, z: 1 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readPressures() {
    const r = this.send({ type: 'readPressures' });
    if (r.ok) this.host.onLens?.('logger01');
    return r;
  }

  readFlow() {
    const r = this.send({ type: 'readFlow' });
    if (r.ok) this.host.onLens?.('meter01');
    return r;
  }

  readSump() {
    const r = this.send({ type: 'readSump', viewDeg: this.viewOf('sump01') });
    if (r.ok) this.host.onLens?.('sump01');
    return r;
  }

  readHeight(port: PortId = this.lastPort) {
    this.lastPort = port;
    const r = this.send({ type: 'readTapHeight', port, viewDeg: this.viewOf('ruler01', port) });
    if (r.ok) this.host.onLens?.('ruler01');
    return r;
  }

  readBeaker() {
    const r = this.send({ type: 'readBeaker', viewDeg: this.viewOf('beaker01') });
    if (r.ok) this.host.onLens?.('beaker01');
    return r;
  }

  readTimer() {
    const r = this.send({ type: 'readTimer' });
    if (r.ok) this.host.onLens?.('timer01');
    return r;
  }

  measure() {
    const c = this.caliper;
    const r = this.send({ type: 'measureDiameter', section: c.section, face: c.face, tiltDeg: c.tiltDeg });
    if (r.ok) this.host.onLens?.('caliper01');
    return r;
  }

  cycleRate() {
    const rates = this.w.params.rates;
    const i = rates.indexOf(this.w.logger.rateHz);
    return this.send({ type: 'setRate', hz: rates[(i + 1) % rates.length] });
  }

  /** Enchufa el tubo del sensor en la siguiente toma libre (o lo desenchufa al final de la vuelta). */
  cycleSensor(i: SensorId) {
    const w = this.w;
    const order: Array<PortId | null> = [1, 2, 3, null];
    const cur = w.sensors[i].port;
    let k = (order.indexOf(cur) + 1) % order.length;
    for (let n = 0; n < 4; n++, k = (k + 1) % order.length) {
      const p = order[k];
      if (p === null || !([1, 2, 3] as const).some((j) => j !== i && w.sensors[j].port === p)) break;
    }
    return this.send({ type: 'connectSensor', sensor: i, port: order[k] });
  }

  speedTo(v: number) {
    return this.run(this.dispatch({ type: 'setSpeed', value: Math.max(0, Math.min(1, Math.round(v * 100) / 100)) }));
  }

  /** La manija de la válvula gira de a una posición. */
  valveStep(d: 1 | -1) {
    const n = this.w.params.K.valve.length - 1;
    return this.send({ type: 'setValve', pos: Math.max(0, Math.min(n, this.w.valve.pos + d)) }, 'metal');
  }

  /** Coloca la empaquetadura en la primera junta abierta que no la tenga. */
  fitNextGasket() {
    const w = this.w;
    const j = (['J1', 'J2', 'J3'] as const).find((x) => !w.circuit.joints[x].connected && (!w.circuit.joints[x].gasket || w.circuit.joints[x].worn));
    if (!j) return this.send({ type: 'inspect', target: 'gaskets01' }, null);
    return this.send({ type: 'fitGasket', joint: j }, 'clink');
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
    if (PORT_OF[hit.id]) this.lastPort = PORT_OF[hit.id];
    if (this.blocked()) return true;
    if (this.held) {
      this.drop();
      return true;
    }
    const knob = this.knobFor(hit);
    if (knob) {
      this.knob = { kind: knob, id: hit.id, sx, sy, lastY: sy, lastX: sx, acc: 0, moved: false };
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
      this.held.z = Math.max(0, Math.min(100, this.held.z - notch * 2));
      return true;
    }
    if (this.hovered === 'pump01') {
      this.speedTo(this.w.pump.set - notch * 0.05);
      return true;
    }
    if (this.hovered === 'valve01') {
      this.valveStep(notch > 0 ? -1 : 1);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: llaves, botones, tapas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    if (JOINT_OF[id]) {
      const j = JOINT_OF[id];
      if (part === 'gasket' && !w.circuit.joints[j].connected) return this.send({ type: 'fitGasket', joint: j }, 'clink');
      return this.send({ type: 'connectJoint', joint: j, on: !w.circuit.joints[j].connected }, 'metal');
    }
    if (PORT_OF[id]) {
      const p = PORT_OF[id];
      if (part === 'probe') return this.send({ type: 'setProbe', port: p, kind: w.ports[p].probe === 'pitot' ? 'static' : 'pitot' }, 'clink');
      return this.send({ type: 'capPort', port: p, on: !w.ports[p].capped }, 'clink');
    }
    switch (id) {
      case 'sump01':
        return this.readSump();
      case 'pump01':
        if (part === 'knob') return this.lab.camera?.focusObject(id, true);
        return this.send({ type: 'setPump', on: !w.pump.on }, 'click');
      case 'meter01':
        return this.readFlow();
      case 'clamp01':
        return this.send({ type: 'clampVenturi', on: !w.circuit.clamped }, 'metal');
      case 'spool01':
      case 'spare01':
        return this.send({ type: 'swapSpool', kind: w.circuit.spool === 'smooth' ? 'rough' : 'smooth' }, 'clink');
      case 'purge01':
        return this.send({ type: 'setPurge', open: !w.circuit.purgeOpen }, 'metal');
      case 'valve01':
        if (part === 'close') return this.valveStep(-1);
        return this.valveStep(1);
      case 'outlet01':
        return this.send({ type: 'setDiverter', to: w.collect.diverter === 'sump' ? 'beaker' : 'sump' }, 'click');
      case 'beaker01':
        if (part === 'empty' && w.collect.beakerAt === 'bench') return this.send({ type: 'emptyBeaker' }, 'clink');
        return this.readBeaker();
      case 'timer01':
        if (part === 'start') return this.send({ type: 'timer', action: w.timer.running ? 'stop' : 'start' }, 'click');
        if (part === 'reset') return this.send({ type: 'timer', action: 'reset' }, 'click');
        return this.readTimer();
      case 'panel01':
        if (part === 's1' || part === 's2' || part === 's3') return this.cycleSensor(Number(part[1]) as SensorId);
        if (part === 'cal') return this.send({ type: 'calibrateSensors' });
        return this.lab.camera?.focusObject(id, false);
      case 'logger01':
        if (part === 'rate') return this.cycleRate();
        if (part === 'range') return this.send({ type: 'setRange', idx: (w.logger.rangeIdx + 1) % w.params.sensor.ranges.length });
        if (part === 'mode') return this.send({ type: 'setPressureMode', mode: w.logger.mode === 'gauge' ? 'abs' : 'gauge' });
        if (part === 'zero') return this.send({ type: 'zeroSensors' });
        if (part === 'series') return this.send({ type: 'newSeries' });
        return this.readPressures();
      case 'ruler01':
        return this.readHeight();
      case 'gaskets01':
        return this.fitNextGasket();
      case 'caliper01':
        if (part === 'face') {
          this.caliper.face = this.caliper.face === 'inner' ? 'outer' : 'inner';
          return this.host.sound('click');
        }
        return this.measure();
      case 'sample01':
        this.caliper.section = this.caliper.section === 'D1' ? 'D2' : 'D1';
        return this.host.sound('click');
      case 'pitot01':
        return this.send({ type: 'setProbe', port: this.lastPort, kind: w.ports[this.lastPort].probe === 'pitot' ? 'static' : 'pitot' }, 'clink');
      case 'stopper01':
        return this.send({ type: w.stopper === 'pipe' ? 'removeStopper' : 'insertStopper' }, 'clink');
      case 'towel01':
        return this.send({ type: 'mopSpill' }, 'click');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    if (hit.id === 'pump01' && hit.part === 'knob') return 'speed';
    if (hit.id === 'valve01' && hit.part === 'handle') return 'valve';
    if (hit.id === 'caliper01' && hit.part === 'jaw') return 'tilt';
    return null;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'speed':
        // La perilla gira con el arrastre (hacia arriba o a la derecha sube la consigna).
        this.speedTo(w.pump.set + ((sx - k.lastX) - (sy - k.lastY)) * 0.004);
        break;
      case 'valve':
        // La manija avanza de a una posición cada 40 px: un arrastre largo y rápido es una maniobra brusca.
        k.acc += sx - k.lastX;
        while (Math.abs(k.acc) >= 40) {
          this.valveStep(k.acc > 0 ? 1 : -1);
          k.acc -= Math.sign(k.acc) * 40;
        }
        break;
      case 'tilt':
        this.caliper.tiltDeg = Math.max(0, Math.min(30, Math.round((this.caliper.tiltDeg + Math.abs(sx - k.lastX) * 0.25 - (sy - k.lastY) * 0.25) * 10) / 10));
        break;
    }
    k.lastX = sx;
    k.lastY = sy;
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
      if (k === '+' || key === 'PageUp') return (h.z = Math.min(100, h.z + step)), true;
      if (k === '-' || key === 'PageDown') return (h.z = Math.max(0, h.z - step)), true;
      return false;
    }
    switch (k) {
      case 'p': return this.readPressures(), true;
      case 'f': return this.readFlow(), true;
      case 'n': return this.readSump(), true;
      case 'h': return this.readHeight(), true;
      case 'b': return this.readBeaker(), true;
      case 't': return this.readTimer(), true;
      case 'pageup': return this.speedTo(this.w.pump.set + (shift ? 0.01 : 0.05)), true;
      case 'pagedown': return this.speedTo(this.w.pump.set - (shift ? 0.01 : 0.05)), true;
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
    if (id === 'beaker01') return true;
    if (id === 'stopper01') return this.w.stopper === 'bench';
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
    if (id === 'beaker01') return near(G.beakerOutlet.x, G.beakerOutlet.y, 9, 9) ? 'outlet01' : null;
    if (id === 'stopper01') return near(G.venturi.x0, G.pipeY, 8, 8) ? 'venturi01' : null;
    return null;
  }

  /** Destino al soltar. */
  place(h: HeldF, p: Pose) {
    const target = this.targetFor(h.id, p);
    this.release(h);
    if (h.id === 'beaker01') return void this.send({ type: 'moveBeaker', to: target === 'outlet01' ? 'outlet' : 'bench' }, 'clink');
    if (h.id === 'stopper01' && target === 'venturi01') return void this.send({ type: 'insertStopper' }, 'clink');
    this.host.sound('clink');
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench').map((o) => o.id);
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
    const kk = Math.min(1, dt * 16);
    const nx = o.pose.x + (tx - o.pose.x) * kk;
    const ny = o.pose.y + (ty - o.pose.y) * kk;
    h.curZ += (h.z - h.curZ) * Math.min(1, dt * 10);
    if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004) {
      this.dispatch({ type: 'setPose', id: h.id, pose: { x: nx, y: ny, z: h.curZ, rotationRad: 0 }, support: 'hand' });
    }
    this.dockTarget = this.targetFor(h.id, { x: nx, y: ny, z: h.curZ });
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
    if (h.id === 'stopper01' && this.dockTarget === 'venturi01' && this.w.circuit.joints.J1.connected) this.hintOnce('f12.hint.jointClosed', 'warn');
  }

  /** ¿Hay un flujo o movimiento en curso? (el panel lo muestra). */
  busy(): boolean {
    return busyF12(this.w);
  }
}
