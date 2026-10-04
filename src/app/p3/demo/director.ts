/**
 * Demostración automática de la Práctica 3: conduce la escena con una «mano virtual» que usa las MISMAS mecánicas
 * que el estudiante (tomar y llevar con el controlador, altura de la herramienta, imán del asa, chispa, pinza,
 * válvulas, vidrio de cobalto…). No altera la ciencia: todo pasa por los comandos del dominio.
 *
 * El director avanza con el reloj de la escena (`lab.onFrame`), así que la pausa y la velocidad de reproducción
 * (`lab.playback`) detienen o aceleran también sus esperas. Cada gesto tiene un tiempo límite y, si la mecánica no
 * responde, un respaldo con el comando equivalente para que la demostración nunca se quede trabada.
 */
import type { FlameLab3D } from '../../../engine/flame/FlameLab3D';
import type { FlameCommand, FlameDispatchResult, ValveId } from '../../../simulation/flame-world/commands';
import type { FlameWorld } from '../../../simulation/flame-world/types';
import { mouthPos } from '../../../simulation/flame-world/world';

export class DemoAbort extends Error {}

export type DemoPart = 'A' | 'B' | 'C' | 'D' | 'E';

export interface DemoStep3 {
  part: DemoPart;
  key: string;
  run: (d: DemoDirector3) => Promise<void>;
}

export interface DemoHooks3 {
  onStep(index: number): void;
  onNote(text: string | null): void;
  onDone(): void;
  dispatch(cmd: FlameCommand): FlameDispatchResult;
  select(id: string | null): void;
  t(key: string, opts?: Record<string, unknown>): string;
}

interface Waiter {
  check: () => boolean;
  until: number;
  resolve: (ok: boolean) => void;
  reject: (e: Error) => void;
}

/** Velocidad de la mano (cm/s) y de subida/bajada de la herramienta (cm/s). */
const HAND_SPEED = 40;
const LIFT_SPEED = 14;
const SKIP_SPEED = 14;
const MAX_SPEED = 12;

/** Altura sobre el objeto a la que se dibuja la mano. */
const CURSOR_DZ: Record<string, number> = { tongs: 1.5, loop: 1.2, lighter: 1, glass: 5, cloth: 1, tube: 14 };

export class DemoDirector3 {
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

  constructor(readonly lab: FlameLab3D, readonly steps: DemoStep3[], readonly hooks: DemoHooks3) {}

  get w(): FlameWorld {
    return this.lab.runtime.world;
  }

  get c() {
    return this.lab.controller;
  }

  get mouth() {
    return mouthPos(this.w, this.lab.runtime.ctx);
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
      await this.until(() => !!this.lab.camera, 60);
      for (let i = 0; i < this.steps.length; i++) {
        this.index = i;
        this.hooks.onStep(i);
        this.hooks.onNote(null);
        try {
          await this.steps[i].run(this);
        } catch (e) {
          if (e instanceof DemoAbort) throw e;
          console.error(`[demo p3] paso ${this.steps[i].key}:`, e);
        }
        this.endHold();
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
      if (!(e instanceof DemoAbort)) console.error('[demo p3]', e);
    }
  }

  /** Se llama cada fotograma (dt ya escalado por la velocidad de reproducción; no corre en pausa). */
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
      const o = this.w.objects[h.id];
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

  /** Espera en tiempo de SIMULACIÓN acelerado (enfriar). Solo acelera si no hay nada en la mano ni emisión. */
  async simUntil(check: () => boolean, maxSimS: number, accel = 20) {
    const rt = this.lab.runtime;
    const prev = rt.timeScale;
    const start = this.w.timeS;
    rt.timeScale = accel;
    this.note(this.hooks.t('p3.demo.ui.accelerated', { x: accel }));
    try {
      await this.until(() => check() || this.w.timeS - start >= maxSimS, (maxSimS / Math.max(1, accel)) * 4 + 30);
    } finally {
      rt.timeScale = prev;
      this.note(null);
    }
  }

  /** Ejecuta un tramo repetitivo más rápido (la nota avisa que se repite). */
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

  /** Mira un punto; el panel ocupa la izquierda, así que el centro de la vista se corre un poco. */
  look(x: number, y: number, z: number, dist = 60, elevation = 0.4) {
    this.lab.camera?.lookAt(x - dist * 0.12, y, z, dist, elevation);
  }

  station(id: string) {
    this.lab.goToStation(id);
  }

  /** «Pulsa» sobre un punto u objeto (botón del panel de acciones): lo selecciona y la mano se posa encima. */
  async press(id: string | null, at?: { x: number; y: number; z: number }, pauseS = 0.6) {
    if (id) this.hooks.select(id);
    const o = id ? (id === 'hose' ? { pose: this.w.hose.mid } : this.w.objects[id]) : null;
    const p = at ?? (o ? { x: o.pose.x + 0.4, y: o.pose.y, z: o.pose.z + 3 } : null);
    if (p) this.pointAt = p;
    await this.wait(pauseS);
  }

  endPress() {
    this.pointAt = null;
  }

  dispatch(cmd: FlameCommand) {
    return this.hooks.dispatch(cmd);
  }

  /** Gira una válvula de forma continua hasta `to` en `seconds` (como arrastrar la perilla poco a poco). */
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
    if (!ok) console.warn(`[demo p3] no se pudo tomar ${id}`);
    await this.wait(0.3);
    return ok;
  }

  /** Lleva lo que se sostiene hasta (x, y) a velocidad de mano. */
  async moveTo(x: number, y: number, speed = HAND_SPEED) {
    const h = this.c.held;
    if (!h) return;
    // Primero termina de levantarlo del soporte (el controlador no lo desplaza mientras sube).
    await this.until(() => !this.c.held?.lifting, 3);
    this.goal = { x: x - h.ox, y: y - h.oy, speed };
    const id = h.id;
    await this.until(() => this.goal === null || this.c.held?.id !== id, 30);
    this.goal = null;
    await this.until(() => {
      const o = this.w.objects[id];
      return !o || this.c.held?.id !== id || Math.hypot(o.pose.x - x, o.pose.y - y) < 0.4;
    }, 2);
  }

  /** Sube o baja la herramienta sostenida hasta la altura z (como la rueda del ratón). */
  async toZ(z: number, speed = LIFT_SPEED) {
    if (!this.c.held) return;
    this.zGoal = { z, speed };
    await this.until(() => this.zGoal === null || !this.c.held, 10);
    const id = this.c.held?.id;
    await this.until(() => !id || Math.abs((this.w.objects[id]?.pose.z ?? z) - z) < 0.35 || !!this.c.held?.magnet, 2);
  }

  async release() {
    if (!this.c.held) return;
    this.endHold();
    this.c.release();
    await this.wait(0.3);
  }

  private endHold() {
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
}
