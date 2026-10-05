/**
 * Demostración automática de la Práctica 4: una «mano virtual» que usa las MISMAS mecánicas que el estudiante
 * (tomar y llevar con el controlador, acople y vertido mantenido, imán del gotero, varilla, pinzas, válvulas,
 * encendedor, pantalla…). No altera la ciencia: todo pasa por los comandos del dominio.
 * Avanza con el reloj de la escena (`lab.onFrame`): la pausa y la velocidad también detienen o aceleran sus esperas.
 * Cada gesto tiene un tiempo límite y, si la mecánica no responde, un respaldo con el comando equivalente.
 */
import type { ReactionLab3D } from '../../../engine/reaction/ReactionLab3D';
import type { P4Command, P4DispatchResult } from '../../../simulation/reaction-world/commands';
import type { P4World } from '../../../simulation/reaction-world/types';
import type { ValveId } from '../../../simulation/flame-world/commands';
import { mouthPos } from '../../../simulation/flame-world/world';
import { liquidMl, vesselOrigin } from '../../../simulation/reaction-world/world';

export class DemoAbort extends Error {}

export type DemoPart = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface DemoStep4 {
  part: DemoPart;
  key: string;
  run: (d: DemoDirector4) => Promise<void>;
}

export interface DemoHooks4 {
  onStep(index: number): void;
  onNote(text: string | null): void;
  onDone(): void;
  dispatch(cmd: P4Command): P4DispatchResult;
  select(id: string | null): void;
  t(key: string, opts?: Record<string, unknown>): string;
}

interface Waiter {
  check: () => boolean;
  until: number;
  resolve: (ok: boolean) => void;
  reject: (e: Error) => void;
}

const HAND_SPEED = 45;
const LIFT_SPEED = 14;
const SKIP_SPEED = 14;
const MAX_SPEED = 12;

const CURSOR_DZ: Record<string, number> = {
  bottle: 12, dropperBottle: 9, dropper: 11, cylinder: 13, beaker: 8, tube: 15, capsule: 4, rod: 4, probe: 4, tubeTongs: 2, crucibleTongs: 2, washBottle: 19,
  lighter: 1, nail: 1.5, sandpaper: 1, shield: 24, towel: 1, phPaper: 1.5, mgRibbon: 1, burner: 16,
};

export class DemoDirector4 {
  index = -1;
  private t = 0;
  private waiters: Waiter[] = [];
  private aborted = false;
  private goal: { x: number; y: number; speed: number } | null = null;
  private zGoal: { z: number; speed: number } | null = null;
  private pointAt: { x: number; y: number; z: number } | null = null;
  private userSpeed = 1;
  private boost = 1;
  private skipping = false;

  constructor(readonly lab: ReactionLab3D, readonly steps: DemoStep4[], readonly hooks: DemoHooks4) {}

  get w(): P4World {
    return this.lab.runtime.world;
  }

  get c() {
    return this.lab.controller;
  }

  get mouth() {
    return mouthPos(this.w.gas, this.lab.runtime.ctx.gasCtx);
  }

  pose(id: string) {
    return (this.w.objects[id] ?? this.w.gas.objects[id])?.pose;
  }

  // ───────────── Reproducción ─────────────

  setSpeed(s: number) {
    this.userSpeed = s;
    this.applySpeed();
  }

  skip() {
    this.skipping = true;
    this.applySpeed();
  }

  private applySpeed() {
    this.lab.playback.speed = this.skipping ? SKIP_SPEED : Math.min(MAX_SPEED, this.userSpeed * this.boost);
  }

  stop() {
    this.aborted = true;
    this.lab.onFrame = null;
    this.lab.demoCursor = null;
    this.lab.playback.speed = 1;
    this.lab.playback.paused = false;
    for (const wt of this.waiters) wt.reject(new DemoAbort());
    this.waiters = [];
  }

  async run() {
    try {
      await this.until(() => !!this.lab.camera && !!this.c.view, 60);
      for (let i = 0; i < this.steps.length; i++) {
        this.index = i;
        this.hooks.onStep(i);
        this.hooks.onNote(null);
        try {
          await this.steps[i].run(this);
        } catch (e) {
          if (e instanceof DemoAbort) throw e;
          console.error(`[demo p4] paso ${this.steps[i].key}:`, e);
        }
        this.endHold();
        if (this.c.held) this.c.release();
        this.pointAt = null;
        this.boost = 1;
        this.skipping = false;
        this.applySpeed();
        await this.wait(0.6);
      }
      this.lab.demoCursor = null;
      this.hooks.onNote(null);
      this.hooks.onDone();
    } catch (e) {
      if (!(e instanceof DemoAbort)) console.error('[demo p4]', e);
    }
  }

  tick = (dt: number) => {
    if (this.aborted) return;
    this.t += dt;
    const h = this.c.held;
    if (h && this.goal) {
      const g = this.goal;
      const dx = g.x - h.x;
      const dy = g.y - h.y;
      const d = Math.hypot(dx, dy);
      const step = g.speed * dt;
      if (d <= step) {
        h.x = g.x;
        h.y = g.y;
        this.goal = null;
      } else {
        h.x += (dx / d) * step;
        h.y += (dy / d) * step;
      }
    }
    if (h && this.zGoal) {
      const cur = h.magnet ? h.magnet.z : h.z;
      const dz = this.zGoal.z - cur;
      const step = this.zGoal.speed * dt;
      if (Math.abs(dz) <= step) {
        this.c.nudgeHeight(dz);
        this.zGoal = null;
      } else this.c.nudgeHeight(Math.sign(dz) * step);
    }
    this.updateCursor();
    for (const wt of [...this.waiters]) {
      const ok = wt.check();
      if (ok || this.t >= wt.until) {
        this.waiters.splice(this.waiters.indexOf(wt), 1);
        wt.resolve(ok);
      }
    }
  };

  private updateCursor() {
    const h = this.c.held;
    if (h) {
      const o = this.w.objects[h.id] ?? this.w.gas.objects[h.id];
      if (o) this.lab.demoCursor = { x: o.pose.x + 0.4, y: o.pose.y, z: o.pose.z + (CURSOR_DZ[o.kind] ?? 2), down: true };
    } else if (this.pointAt) this.lab.demoCursor = { ...this.pointAt, down: true };
    else if (this.lab.demoCursor) this.lab.demoCursor = { ...this.lab.demoCursor, down: false };
  }

  // ───────────── Esperas ─────────────

  until(check: () => boolean, timeoutS = 20): Promise<boolean> {
    if (this.aborted) return Promise.reject(new DemoAbort());
    if (check()) return Promise.resolve(true);
    return new Promise((resolve, reject) => this.waiters.push({ check, until: this.t + timeoutS, resolve, reject }));
  }

  async wait(s: number) {
    await this.until(() => false, s);
  }

  /** Espera en tiempo de SIMULACIÓN acelerado (reacción Fe/Cu, enfriamiento). */
  async simUntil(check: () => boolean, maxSimS: number, accel = 20) {
    const rt = this.lab.runtime;
    const prev = rt.timeScale;
    const start = this.w.timeS;
    rt.timeScale = accel;
    this.note(this.hooks.t('p4.demo.ui.accelerated', { x: accel }));
    try {
      await this.until(() => check() || this.w.timeS - start >= maxSimS, (maxSimS / Math.max(1, accel)) * 4 + 30);
    } finally {
      rt.timeScale = prev;
      this.note(null);
    }
  }

  async fast<T>(factor: number, fn: () => Promise<T>): Promise<T> {
    this.boost = factor;
    this.applySpeed();
    try {
      return await fn();
    } finally {
      this.boost = 1;
      this.applySpeed();
    }
  }

  note(text: string | null) {
    this.hooks.onNote(text);
  }

  // ───────────── Cámara y selección ─────────────

  look(x: number, y: number, z: number, dist = 60, elevation = 0.4) {
    this.lab.camera?.lookAt(x - dist * 0.12, y, z, dist, elevation);
  }

  station(id: string) {
    this.lab.goToStation(id);
  }

  async press(id: string | null, at?: { x: number; y: number; z: number }, pauseS = 0.6) {
    if (id) this.hooks.select(id);
    const o = id ? (id === 'hose' ? { pose: this.w.gas.hose.mid } : this.w.objects[id] ?? this.w.gas.objects[id]) : null;
    const p = at ?? (o ? { x: o.pose.x + 0.4, y: o.pose.y, z: o.pose.z + 3 } : null);
    if (p) this.pointAt = p;
    await this.wait(pauseS);
  }

  endPress() {
    this.pointAt = null;
  }

  dispatch(cmd: P4Command) {
    return this.hooks.dispatch(cmd);
  }

  async turnValve(valve: ValveId, to: number, seconds = 1.2) {
    const from = this.c.valveValue(valve);
    const n = Math.max(1, Math.round(seconds / 0.08));
    for (let i = 1; i <= n; i++) {
      this.c.setValve(valve, from + ((to - from) * i) / n);
      await this.wait(seconds / n);
    }
  }

  // ───────────── Gestos ─────────────

  async grab(id: string): Promise<boolean> {
    if (this.c.held?.id === id) return true;
    if (this.c.held) await this.release();
    this.pointAt = null;
    this.hooks.select(id);
    const ok = this.c.beginDrag(id, true);
    if (!ok) console.warn(`[demo p4] no se pudo tomar ${id}`);
    await this.wait(0.3);
    return ok;
  }

  async moveTo(x: number, y: number, speed = HAND_SPEED) {
    const h = this.c.held;
    if (!h) return;
    await this.until(() => !this.c.held?.lifting, 3);
    this.goal = { x: x - h.ox, y: y - h.oy, speed };
    const id = h.id;
    await this.until(() => this.goal === null || this.c.held?.id !== id, 30);
    this.goal = null;
    await this.until(() => {
      const p = this.pose(id);
      return !p || this.c.held?.id !== id || Math.hypot(p.x - x, p.y - y) < 0.6 || !!this.c.pourDock || !!this.c.held?.magnet;
    }, 2);
  }

  async toZ(z: number, speed = LIFT_SPEED) {
    if (!this.c.held) return;
    this.zGoal = { z, speed };
    await this.until(() => this.zGoal === null || !this.c.held, 10);
    const id = this.c.held?.id;
    await this.until(() => !id || Math.abs((this.pose(id)?.z ?? z) - z) < 0.35 || !!this.c.held?.magnet, 2);
  }

  async release() {
    if (!this.c.held) return;
    this.endHold();
    this.c.release();
    await this.wait(0.3);
  }

  endHold() {
    this.goal = null;
    this.zGoal = null;
    if (this.c.held) this.c.primaryUp();
  }

  async carry(id: string, x: number, y: number) {
    if (!(await this.grab(id))) return;
    await this.moveTo(x, y);
    await this.wait(0.2);
    await this.release();
  }

  /**
   * Vierte `ml` de `src` en `target` con el gesto real: acercar hasta el acople, mantener «verter» y soltarlo cuando
   * el receptor recibió lo pedido. Respaldo: el comando de vertido equivalente.
   */
  async pourInto(src: string, target: string, ml: number, opts: { drain?: boolean } = {}) {
    if (!(await this.grab(src))) return;
    const to = this.pose(target)!;
    const start = vesselOrigin(this.w.vessels[target]);
    const startTotal = Object.values(start).reduce((s, x) => s + x, 0);
    const got = () => Object.values(vesselOrigin(this.w.vessels[target])).reduce((s, x) => s + x, 0) - startTotal;
    // Se llega por delante del receptor (si no, el acople puede elegir un recipiente vecino).
    const fr = (k: string) => (k === 'TUBE' ? 0.8 : k === 'CYL10' ? 0.8 : k === 'CYL25' ? 0.97 : k === 'BEAKER100' ? 2.55 : k === 'CAPSULE' ? 3.5 : k === 'WASTE' ? 4.3 : 2.7);
    const tv = this.w.vessels[target];
    await this.moveTo(to.x, to.y - (fr(tv.kind) + fr(this.w.vessels[src].kind) + 0.9));
    const docked = await this.until(() => this.c.pourDock?.targetId === target, 4);
    if (!docked) {
      const hh = this.c.held;
      console.warn(`[demo p4] sin acople ${src} → ${target}; respaldo`, JSON.stringify({ held: hh?.id, x: hh?.x, y: hh?.y, ox: hh?.ox, oy: hh?.oy, lifting: hh?.lifting, pose: this.pose(src), to, dock: this.c.pourDock, ml: liquidMl(this.w.vessels[src]) }));
      this.dispatch({ type: 'setPour', sourceId: src, targetId: target, rateMlS: 1.2, tiltDeg: 60 });
      await this.until(() => got() >= ml - 0.02 || liquidMl(this.w.vessels[src]) < 0.05, 30);
      this.dispatch({ type: 'stopPour', sourceId: src });
      await this.release();
      return;
    }
    // Vertido controlado: chorro hasta acercarse, luego pulsos cortos (al soltar, el recipiente se endereza y el
    // chorro se corta) hasta la marca, como al enrasar a mano.
    const precise = ml < liquidMl(this.w.vessels[src]) - 0.3;
    const coarse = precise ? ml - (this.w.vessels[src].kind === 'BOTTLE' ? 1.6 : 0.6) : ml;
    this.c.primaryDown();
    await this.until(() => got() >= coarse || liquidMl(this.w.vessels[src]) < 0.08, 40);
    this.c.primaryUp();
    await this.until(() => Math.abs(this.w.objects[src].pose.rotationRad) < 0.05, 4);
    if (opts.drain) {
      // Vaciar del todo: se mantiene inclinado hasta el máximo (sale también lo que estaba en el fondo).
      this.c.primaryDown();
      await this.until(() => Math.abs(this.w.objects[src].pose.rotationRad) > 2.1, 6);
      await this.wait(0.8);
      this.c.primaryUp();
    }
    for (let i = 0; precise && i < 40 && got() < ml - 0.06; i++) {
      this.c.primaryDown();
      const before = got();
      await this.until(() => got() > before + 0.02 || got() >= ml - 0.06, 3);
      this.c.primaryUp();
      await this.until(() => Math.abs(this.w.objects[src].pose.rotationRad) < 0.6, 2);
      await this.wait(0.15);
    }
    await this.until(() => Math.abs(this.w.objects[src].pose.rotationRad) < 0.05, 4);
    await this.release();
  }

  /** Devuelve un objeto a su lugar inicial en la mesada. */
  async putBack(id: string, home: { x: number; y: number }) {
    await this.carry(id, home.x, home.y);
  }

  /** Aspira con el gotero de un frasco gotero y suelta `n` gotas en el receptor. */
  async dropsInto(bottle: string, dropper: string, target: string, n: number) {
    if (!(await this.grab(dropper))) return;
    const b = this.pose(bottle)!;
    await this.toZ(b.z + 9);
    await this.moveTo(b.x, b.y);
    await this.until(() => this.c.held?.magnet?.mode === 'ASPIRATE', 2);
    this.c.primaryDown();
    this.c.primaryUp();
    await this.wait(0.4);
    const t = this.pose(target)!;
    await this.toZ(t.z + 16);
    await this.moveTo(t.x, t.y);
    await this.until(() => this.c.held?.magnet?.mode === 'DROP', 2);
    for (let i = 0; i < n; i++) {
      if (liquidMl(this.w.vessels[dropper]) < 0.06) {
        await this.toZ(b.z + 9);
        await this.moveTo(b.x, b.y);
        await this.until(() => this.c.held?.magnet?.mode === 'ASPIRATE', 2);
        this.c.primaryDown();
        this.c.primaryUp();
        await this.wait(0.3);
        await this.toZ(t.z + 16);
        await this.moveTo(t.x, t.y);
        await this.until(() => this.c.held?.magnet?.mode === 'DROP', 2);
      }
      this.c.primaryDown();
      this.c.primaryUp();
      await this.wait(0.35);
    }
    // El sobrante vuelve a su frasco y el gotero a su tapa.
    await this.toZ(b.z + 9);
    await this.moveTo(b.x, b.y);
    await this.until(() => this.c.held?.magnet?.mode === 'ASPIRATE', 2);
    this.dispatch({ type: 'emptyDropper', dropperId: dropper, targetId: bottle });
    await this.release();
  }

  /** Varilla dentro del recipiente y movimientos circulares. */
  async stirWithRod(vessel: string, seconds: number) {
    if (!(await this.grab('rod'))) return;
    const v = this.pose(vessel)!;
    await this.moveTo(v.x, v.y);
    await this.until(() => this.c.held?.magnet?.mode === 'IN', 2);
    const t0 = this.t;
    while (this.t - t0 < seconds) {
      const a = (this.t - t0) * 7;
      const h = this.c.held;
      if (h) {
        h.x = v.x + Math.cos(a) * 0.8 - h.ox;
        h.y = v.y + Math.sin(a) * 0.8 - h.oy;
      }
      this.dispatch({ type: 'setAgitation', id: vessel, tool: 'ROD', intensity: 0.55 });
      await this.wait(0.2);
    }
  }
}
