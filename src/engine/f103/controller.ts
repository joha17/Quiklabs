/**
 * Interacción de F103: gestos del ratón → comandos físicos. Trabaja en cm de la sala y nunca conoce Three.js (§14).
 *
 * - Mandos con su grado de libertad real: el mando de elevación gira el cañón (arrastre vertical), la base del lanzador
 *   gira en azimut (arrastre horizontal, solo sin anclar), la columna del soporte sube o baja, el tornillo de nivel se
 *   gira (rueda), el émbolo se tira hacia atrás hasta una muesca, la perilla de la fotopuerta corre el haz, la
 *   plataforma y la pantalla se arrastran sobre el suelo de la pista.
 * - Esferas: se toman de la bandeja o del suelo y, al soltarlas, la pose decide (boca del cañón → cargar; bandeja →
 *   guardar). Lo que se lleva en la mano no atraviesa los aparatos macizos ni sale de la mesada o de la zona de vuelo.
 * - Clic en una escala: lectura con la dirección REAL de la cámara (paralaje).
 * - Clic y arrastre se distinguen por un umbral de 6 px. Los topes los decide el dominio: un rechazo avisa.
 */
import { clampToBench } from '../interaction/viewport';
import type { F103Host } from './host';
import type { F103Lab3D } from './F103Lab3D';
import type { F103Command, F103DispatchResult } from '../../simulation/f103-world/commands';
import type { F103ObjKind, F103World, Pose } from '../../simulation/f103-world/types';
import { FLOOR_Z, GEOF103 } from '../../simulation/f103-world/geometry';
import { ballFlying, trayPose } from '../../simulation/f103-world/world';
import { LANE, eyePoint, muzzleRoom, platformIndexRoom, rulerRoom, screenRoom } from './layout';

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
  kind: F103ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

type KnobKind = 'angle' | 'yaw' | 'column' | 'screw' | 'plunger' | 'gateOffset' | 'platform' | 'screen';
interface Knob {
  kind: KnobKind;
  id: string;
  sx: number;
  sy: number;
  lastY: number;
  lastX: number;
  moved: boolean;
  acc: number;
}

const CLICK_PX = 6;
const RATES = [1000, 10000, 100000];

export class F103Controller {
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

  constructor(private host: F103Host, private lab: F103Lab3D) {}

  private get w(): F103World {
    return this.host.runtime.world;
  }

  private dispatch(c: F103Command): F103DispatchResult {
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
    if (!r.ok && r.code) this.warn(`f103.cmd.${r.code}`, 2);
    return r;
  }

  send(c: F103Command, sound: 'click' | 'clink' | 'metal' | null = 'click') {
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

  /** Transportador: cara hacia el operador (−y), a la altura de la boca. */
  protractorView() {
    return this.viewDeg(eyePoint(this.w, 'launcher01'), { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  /** Regla vertical: cara hacia −y; el ojo debe estar a la altura de la boca. */
  rulerView() {
    const r = rulerRoom(this.w);
    return this.viewDeg({ x: r.x, y: r.y, z: muzzleRoom(this.w).z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  /** Cinta del suelo: se lee desde arriba del índice. */
  tapeView(x: number) {
    return this.viewDeg({ x, y: GEOF103.floorTape.y, z: FLOOR_Z }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });
  }

  /** Escala de la pantalla: cara hacia el lanzador (−x), a la altura de la última marca. */
  screenView() {
    return this.viewDeg(eyePoint(this.w, 'screen01'), { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  // ─────────────── Lecturas y botones ───────────────

  readProtractor() {
    const r = this.send({ type: 'readProtractor', viewDeg: this.protractorView() });
    if (r.ok) this.host.onLens?.('launcher01');
    return r;
  }

  readLevel() {
    const r = this.send({ type: 'readLevel' });
    if (r.ok) this.host.onLens?.('stand01');
    return r;
  }

  readHeight(mark: 'muzzle' | 'deck' = 'muzzle') {
    const r = this.send({ type: 'readHeight', mark, viewDeg: this.rulerView() });
    if (r.ok) this.host.onLens?.('heightRuler01');
    return r;
  }

  readTape(target: 'platform' | 'screen' | 'plumb', mark: 'index' | 'base' = 'index') {
    const w = this.w;
    const x = target === 'platform' ? platformIndexRoom(w).x : target === 'screen' ? screenRoom(w).x : (w.plumbMark?.x ?? w.launcher.x) * 100;
    const r = this.send({ type: 'readTape', target, mark, viewDeg: this.tapeView(x) });
    if (r.ok) this.host.onLens?.('floorTape01');
    return r;
  }

  readScreen() {
    const r = this.send({ type: 'readScreen', viewDeg: this.screenView() });
    if (r.ok) this.host.onLens?.('screen01');
    return r;
  }

  readGate() {
    const r = this.send({ type: 'readGate' });
    if (r.ok) this.host.onLens?.('timer01');
    return r;
  }

  readImpact() {
    const r = this.send({ type: 'readImpact' });
    if (r.ok) this.host.onLens?.('platform01');
    return r;
  }

  fire() {
    const r = this.send({ type: 'fire' }, null);
    if (r.ok) this.host.sound('metal');
    return r;
  }

  cycleRate() {
    const i = RATES.indexOf(this.w.timer.rateHz);
    return this.send({ type: 'setTimerRate', hz: RATES[(i + 1) % RATES.length] });
  }

  cycleFan() {
    return this.send({ type: 'setFan', speed: (this.w.fan.speed + 1) % this.w.params.fanMs.length });
  }

  cycleFanDir() {
    const dirs = ['side', 'head', 'tail'] as const;
    return this.send({ type: 'setFan', speed: this.w.fan.speed, dir: dirs[(dirs.indexOf(this.w.fan.dir) + 1) % 3] });
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
      this.knob = { kind: knob, id: hit.id, sx, sy, lastY: sy, lastX: sx, moved: false, acc: 0 };
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
    if (this.held && !this.held.keyboard) this.release();
  }

  onWheel(dy: number): boolean {
    const notch = dy > 0 ? 1 : -1;
    if (this.held) {
      this.held.z = Math.max(FLOOR_Z, Math.min(150, this.held.z - notch * 2));
      return true;
    }
    if (this.hovered === 'stand01' && this.hoveredPart === 'screw') {
      this.send({ type: 'turnLevelScrew', turns: -notch }, null);
      return true;
    }
    if (this.hovered === 'launcher01' && this.hoveredPart === 'knob') {
      this.send({ type: 'setAngle', deg: this.w.launcher.angleDeg - notch * 0.5 }, null);
      return true;
    }
    return false;
  }

  /** Clic (sin arrastre) sobre una parte: botones, perillas, escalas. */
  click(id: string, part?: string) {
    const w = this.w;
    switch (id) {
      case 'stand01':
        if (part === 'anchor') return this.send({ type: 'anchorStand', on: !w.stand.anchored }, 'metal');
        if (part === 'screw') return this.send({ type: 'turnLevelScrew', turns: 1 }, null);
        if (part === 'level') return this.readLevel();
        return this.lab.camera?.eyeLevel('stand01');
      case 'launcher01':
        if (part === 'cord') return this.fire();
        if (part === 'cap') return this.send({ type: 'setCap', on: !w.launcher.capOn });
        if (part === 'protractor') return this.readProtractor();
        if (part === 'zero') return this.send({ type: 'zeroProtractor' });
        if (part === 'barrel' && w.launcher.loaded) return this.send({ type: 'unloadBall' });
        if (part === 'plunger') return this.send({ type: 'cock', notch: w.launcher.notch > 0 ? 0 : 1 }, 'metal');
        return this.lab.camera?.eyeLevel('launcher01');
      case 'gate01':
        if (part === 'plug') return this.send({ type: 'connect', target: 'gate', on: !w.gate.connected });
        if (part === 'offset') return this.send({ type: 'setGateOffset', mm: 0 });
        return this.send({ type: 'mountGate', on: !w.gate.mounted }, 'metal');
      case 'timer01':
        if (part === 'rate') return this.cycleRate();
        if (part === 'range') return this.send({ type: 'setClockRange', range: w.timer.range === 'short' ? 'long' : 'short' });
        if (part === 'readGate') return this.readGate();
        if (part === 'readImpact') return this.readImpact();
        return this.lab.camera?.eyeLevel('timer01');
      case 'platform01':
        if (part === 'cal') return this.send({ type: 'calibratePlatform' });
        if (part === 'plug') return this.send({ type: 'connect', target: 'platform', on: !w.platform.connected });
        if (part === 'index') return this.readTape('platform');
        return this.lab.camera?.eyeLevel('platform01');
      case 'screen01':
        if (part === 'clear') return this.send({ type: 'clearScreen' });
        if (part === 'scale') return this.readScreen();
        if (part === 'foot' && w.screen.inLane) return this.readTape('screen');
        return this.send({ type: 'moveScreen', xCm: w.screen.x * 100, inLane: !w.screen.inLane });
      case 'barrier01':
        return this.send({ type: 'closeBarrier', on: !w.barrierClosed }, 'metal');
      case 'fan01':
        if (part === 'dir') return this.cycleFanDir();
        return this.cycleFan();
      case 'plumb01':
        if (part === 'mark') return this.readTape('plumb');
        return this.send({ type: 'dropPlumb' });
      case 'floorTape01':
        if (part === 'zero') return this.send({ type: 'alignTape' }, 'metal');
        return this.lab.camera?.eyeLevel('floorTape01');
      case 'heightRuler01':
        return this.readHeight('muzzle');
    }
    const o = this.obj(id);
    if (o?.kind === 'ball') {
      if (o.support === 'floor') return this.send({ type: 'collectBall', ball: id }, 'clink');
      if (o.support === 'tray' && !w.launcher.loaded && !w.launcher.capOn) return this.send({ type: 'loadBall', ball: id }, 'clink');
    }
    this.lab.camera?.focusObject(id, false);
  }

  private knobFor(hit: PickHitF): KnobKind | null {
    if (hit.id === 'launcher01' && hit.part === 'knob') return 'angle';
    if (hit.id === 'launcher01' && hit.part === 'yaw') return 'yaw';
    if (hit.id === 'launcher01' && hit.part === 'plunger') return 'plunger';
    if (hit.id === 'stand01' && hit.part === 'column') return 'column';
    if (hit.id === 'stand01' && hit.part === 'screw') return 'screw';
    if (hit.id === 'gate01' && hit.part === 'offset') return 'gateOffset';
    if (hit.id === 'platform01' && hit.part === 'body') return 'platform';
    if (hit.id === 'screen01' && hit.part === 'body') return 'screen';
    return null;
  }

  private driveKnob(k: Knob, sx: number, sy: number) {
    const w = this.w;
    switch (k.kind) {
      case 'angle':
        this.dispatch({ type: 'setAngle', deg: w.launcher.angleDeg + (k.lastY - sy) * 0.25 });
        break;
      case 'yaw':
        this.run(this.dispatch({ type: 'setYaw', deg: w.launcher.yawDeg + (sx - k.lastX) * 0.05 }));
        break;
      case 'plunger':
        // Tirar del émbolo hacia atrás (−x en pantalla) por la distancia recorrida.
        k.acc = Math.max(0, Math.min(3.4, (k.sx - sx) * 0.04));
        break;
      case 'column':
        this.dispatch({ type: 'setStandHeight', cm: w.stand.heightCm + (k.lastY - sy) * 0.3 });
        break;
      case 'screw': {
        k.acc += (k.lastY - sy) / 14;
        const turns = Math.trunc(k.acc);
        if (turns) {
          this.dispatch({ type: 'turnLevelScrew', turns });
          k.acc -= turns;
        }
        break;
      }
      case 'gateOffset':
        this.dispatch({ type: 'setGateOffset', mm: w.gate.offsetMm + (k.lastY - sy) * 0.1 });
        break;
      case 'platform': {
        const p = this.view!.toBench(sx, sy, FLOOR_Z);
        this.run(this.dispatch({ type: 'movePlatform', xCm: p.x, yCm: p.y }));
        break;
      }
      case 'screen': {
        const p = this.view!.toBench(sx, sy, FLOOR_Z);
        this.run(this.dispatch({ type: 'moveScreen', xCm: p.x, inLane: w.screen.inLane }));
        break;
      }
    }
    k.lastX = sx;
    k.lastY = sy;
  }

  private endKnob(k: Knob) {
    if (k.kind === 'plunger') {
      const n = Math.round(k.acc);
      if (n > 0) this.send({ type: 'cock', notch: n }, 'metal');
    }
    if (k.kind === 'angle' && !this.w.stand.anchored) this.hintOnce('f103.hint.anchorFirst', 'warn');
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
      if (k === '-' || key === 'PageDown') return (h.z = Math.max(FLOOR_Z, h.z - step)), true;
      return false;
    }
    switch (k) {
      case ' ': return this.fire(), true;
      case 'g': return this.readGate(), true;
      case 'p': return this.readImpact(), true;
      case 'a': return this.readProtractor(), true;
      case 'n': return this.readLevel(), true;
      case 'h': return this.readHeight(), true;
      case 'm': return this.readScreen(), true;
      case 'b': return this.send({ type: 'closeBarrier', on: !this.w.barrierClosed }, 'metal'), true;
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
      this.send({ type: 'setAngle', deg: this.w.launcher.angleDeg + (key === 'ArrowUp' ? 1 : -1) * (shift ? 5 : 0.5) }, null);
      return true;
    }
    if (key === 'Enter') {
      const sel = this.host.getSelected();
      if (sel && this.w.objects[sel]?.kind === 'ball') return this.grab(sel, true);
    }
    return false;
  }

  onKeyUp(): boolean {
    return false;
  }

  // ─────────────── Tomar y soltar esferas ───────────────

  grab(id: string, keyboard = false): boolean {
    const w = this.w;
    const o = this.obj(id);
    if (!o || o.kind !== 'ball' || this.blocked()) return false;
    if (o.support === 'air' || o.support === 'launcher') return false;
    if (this.held) this.release();
    const start = o.support === 'tray' ? trayPose(w, id) : o.pose;
    const from = { pose: { ...start }, support: o.support };
    const r = this.dispatch({ type: 'setPose', id, pose: { ...start }, support: 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    this.held = { id, kind: o.kind, z: start.z + 6, curZ: start.z, x: start.x, y: start.y, keyboard, from };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound('click');
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
    this.toTray(h.id);
  }

  private toTray(id: string) {
    this.dispatch({ type: 'setPose', id, pose: trayPose(this.w, id), support: 'tray' });
    this.dispatch({ type: 'collectBall', ball: id });
    this.host.sound('clink');
  }

  /** Destino al soltar: boca del cañón (cargar), bandeja del soporte o el suelo de la zona. */
  place(h: HeldF, p: Pose) {
    const w = this.w;
    const m = muzzleRoom(w);
    const tray = trayPose(w, h.id);
    if (Math.hypot(p.x - m.x, p.y - m.y) < 8 && Math.abs(p.z - m.z) < 12) {
      this.dispatch({ type: 'setPose', id: h.id, pose: trayPose(w, h.id), support: 'tray' });
      const r = this.send({ type: 'loadBall', ball: h.id }, 'clink');
      if (r.ok) return;
    }
    if (Math.hypot(p.x - tray.x, p.y - tray.y) < 14) return this.toTray(h.id);
    if (p.y < -20) {
      this.dispatch({ type: 'setPose', id: h.id, pose: { x: p.x, y: p.y, z: FLOOR_Z, rotationRad: 0 }, support: 'floor' });
      this.host.sound('click');
      return;
    }
    const c = clampToBench(p.x, p.y);
    this.dispatch({ type: 'setPose', id: h.id, pose: { x: c.x, y: c.y, z: 0, rotationRad: 0 }, support: 'bench' });
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
    // Sobre la zona de vuelo la mano baja al suelo de la pista; sobre la mesada queda dentro de ella.
    const inZone = h.y < -10;
    const lim = inZone
      ? { x: Math.max(LANE.x0 - 60, Math.min(LANE.x1 - 10, h.x)), y: Math.max(-230, Math.min(-12, h.y)) }
      : clampToBench(h.x, h.y);
    let tx = lim.x;
    let ty = lim.y;
    // Lo que se lleva en la mano choca con los aparatos macizos (contrato común de la mesada).
    const pushed = this.view.solidPush?.(h.id, o.pose, tx, ty, this.restingIds(), false, true);
    if (pushed) {
      tx = pushed.x;
      ty = pushed.y;
    }
    const floor = inZone ? FLOOR_Z : 0;
    const tz = Math.max(h.z, floor);
    const kk = Math.min(1, dt * 16);
    const nx = o.pose.x + (tx - o.pose.x) * kk;
    const ny = o.pose.y + (ty - o.pose.y) * kk;
    h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
    if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004) {
      this.dispatch({ type: 'setPose', id: h.id, pose: { x: nx, y: ny, z: h.curZ, rotationRad: 0 }, support: 'hand' });
    }
    const m = muzzleRoom(this.w);
    this.dockTarget = Math.hypot(nx - m.x, ny - m.y) < 8 ? 'launcher01' : null;
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** ¿Hay una esfera en vuelo? (el panel desactiva los cambios de montaje). */
  flying(): boolean {
    return ballFlying(this.w);
  }
}
