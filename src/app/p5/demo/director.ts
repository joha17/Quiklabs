/**
 * Demostración automática de la Práctica 5: una «mano virtual» que usa las MISMAS mecánicas que el estudiante
 * (tomar y llevar con el controlador, imán de la espátula, pesas de la balanza, pinza para tubo, válvulas,
 * encendedor…). No altera la ciencia: todo pasa por los comandos del dominio.
 * Avanza con el reloj de la escena (`lab.onFrame`): la pausa y la velocidad también detienen o aceleran sus esperas.
 */
import type { StoichLab3D } from '../../../engine/stoich/StoichLab3D';
import type { P5Command, P5DispatchResult } from '../../../simulation/stoich-world/commands';
import type { P5World } from '../../../simulation/stoich-world/types';
import type { ValveId } from '../../../simulation/flame-world/commands';
import { mouthPos } from '../../../simulation/flame-world/world';

export class DemoAbort extends Error {}

export type DemoPart5 = 'A' | 'B' | 'C' | 'D' | 'E';

export interface DemoStep5 {
  part: DemoPart5;
  key: string;
  run: (d: DemoDirector5) => Promise<void>;
}

export interface DemoHooks5 {
  onStep(index: number): void;
  onNote(text: string | null): void;
  onDone(): void;
  dispatch(cmd: P5Command): P5DispatchResult;
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
  tube: 14, spatula: 1.5, bottle: 13, tubeTongs: 2, lighter: 1, burner: 16, shield: 30, irThermometer: 3.5, brush: 1.5, stopper: 2.5,
};

export class DemoDirector5 {
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

  constructor(readonly lab: StoichLab3D, readonly steps: DemoStep5[], readonly hooks: DemoHooks5) {}

  get w(): P5World {
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
          console.error(`[demo p5] paso ${this.steps[i].key}:`, e);
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
      if (!(e instanceof DemoAbort)) console.error('[demo p5]', e);
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
      const cur = h.z;
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

  /** Espera en tiempo de SIMULACIÓN acelerado (calentamiento, enfriamiento). */
  async simUntil(check: () => boolean, maxSimS: number, accel = 30, tick?: () => void) {
    const rt = this.lab.runtime;
    const prev = rt.timeScale;
    const start = this.w.timeS;
    rt.timeScale = accel;
    this.note(this.hooks.t('p5.demo.ui.accelerated', { x: accel }));
    let last = this.w.timeS;
    try {
      await this.until(() => {
        // Gestos periódicos del estudiante mientras espera (mover la llama, mirar el tubo).
        if (tick && this.w.timeS - last >= 15) {
          last = this.w.timeS;
          tick();
        }
        return check() || this.w.timeS - start >= maxSimS;
      }, (maxSimS / Math.max(1, accel)) * 4 + 30);
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
    this.lab.camera?.lookAt(x, y, z, dist, elevation);
  }

  station(id: string) {
    this.lab.goToStation(id);
  }

  async press(id: string | null, at?: { x: number; y: number; z: number }, pauseS = 0.6) {
    if (id) this.hooks.select(id);
    const o = id ? this.w.objects[id] ?? this.w.gas.objects[id] : null;
    const p = at ?? (o ? { x: o.pose.x + 0.4, y: o.pose.y, z: o.pose.z + 3 } : null);
    if (p) this.pointAt = p;
    await this.wait(pauseS);
  }

  endPress() {
    this.pointAt = null;
  }

  dispatch(cmd: P5Command) {
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
    if (!ok) console.warn(`[demo p5] no se pudo tomar ${id}`);
    await this.wait(0.3);
    return ok;
  }

  async moveTo(x: number, y: number, speed = HAND_SPEED) {
    const h = this.c.held;
    if (!h) return;
    this.goal = { x, y, speed };
    const id = h.id;
    await this.until(() => this.goal === null || this.c.held?.id !== id, 30);
    this.goal = null;
    await this.until(() => {
      const p = this.pose(id);
      return !p || this.c.held?.id !== id || Math.hypot(p.x - x, p.y - y) < 0.6 || !!this.c.held?.magnet;
    }, 2);
  }

  async toZ(z: number, speed = LIFT_SPEED) {
    if (!this.c.held) return;
    this.zGoal = { z, speed };
    await this.until(() => this.zGoal === null || !this.c.held, 10);
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

  async tapP() {
    this.c.primaryDown();
    await this.wait(0.25);
    this.c.primaryUp();
  }
}
