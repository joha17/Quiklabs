/**
 * Demostración automática de F04: una «mano virtual» que ejecuta los MISMOS comandos del dominio que el panel de
 * acciones y el controlador (anclar y nivelar el soporte, girar el mando del ángulo de a 2°, cargar la muesca, tirar
 * del cordón, arrastrar la plataforma y la pantalla, leer con la vista de frente o desde arriba). No altera la ciencia,
 * no marca etapas a mano, no genera nota ni se guarda como intento. Avanza con el reloj de la escena (`lab.onFrame`):
 * la pausa y la velocidad también detienen o aceleran sus esperas.
 */
import type { F04Lab3D } from '../../../engine/f04/F04Lab3D';
import type { F04Command, F04DispatchResult } from '../../../simulation/f04-world/commands';
import type { F04World } from '../../../simulation/f04-world/types';

export class DemoAbort extends Error {}

export type DemoPartF04 = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface DemoStepF04 {
  part: DemoPartF04;
  key: string;
  run: (d: DemoDirectorF04) => Promise<void>;
}

export interface DemoHooksF04 {
  onStep(index: number): void;
  onNote(text: string | null): void;
  onDone(): void;
  dispatch(cmd: F04Command): F04DispatchResult;
  select(id: string | null): void;
  t(key: string, opts?: Record<string, unknown>): string;
}

interface Waiter {
  check: () => boolean;
  until: number;
  resolve: (ok: boolean) => void;
  reject: (e: Error) => void;
}

const SKIP_SPEED = 14;
const MAX_SPEED = 12;

export class DemoDirectorF04 {
  index = -1;
  private t = 0;
  private waiters: Waiter[] = [];
  private aborted = false;
  private pointAt: { x: number; y: number; z: number } | null = null;
  private userSpeed = 1;
  private boost = 1;
  private skipping = false;

  constructor(readonly lab: F04Lab3D, readonly steps: DemoStepF04[], readonly hooks: DemoHooksF04) {}

  get w(): F04World {
    return this.lab.runtime.world;
  }

  get c() {
    return this.lab.controller;
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
          console.error(`[demo f04] paso ${this.steps[i].key}:`, e);
        }
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
      if (!(e instanceof DemoAbort)) console.error('[demo f04]', e);
    }
  }

  tick = (dt: number) => {
    if (this.aborted) return;
    this.t += dt;
    if (this.pointAt) this.lab.demoCursor = { ...this.pointAt, down: true };
    else if (this.lab.demoCursor) this.lab.demoCursor = { ...this.lab.demoCursor, down: false };
    for (const wt of [...this.waiters]) {
      const ok = wt.check();
      if (ok || this.t >= wt.until) {
        this.waiters.splice(this.waiters.indexOf(wt), 1);
        wt.resolve(ok);
      }
    }
  };

  // ───────────── Esperas ─────────────

  until(check: () => boolean, timeoutS = 20): Promise<boolean> {
    if (this.aborted) return Promise.reject(new DemoAbort());
    if (check()) return Promise.resolve(true);
    return new Promise((resolve, reject) => this.waiters.push({ check, until: this.t + timeoutS, resolve, reject }));
  }

  async wait(s: number) {
    await this.until(() => false, s);
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

  // ───────────── Cámara, mano y comandos ─────────────

  station(id: string) {
    this.lab.goToStation(id);
  }

  /** Vista de frente (desde el operador) a un punto: la lectura sale sin paralaje. */
  async front(x: number, y: number, z: number, dist = 30, elevation = 0.12) {
    this.lab.camera?.lookAt(x, y, z, dist, elevation);
    await this.wait(1.1);
  }

  /** La mano señala un objeto (o un punto) y lo selecciona. */
  async press(id: string | null, at?: { x: number; y: number; z: number }, pauseS = 0.5) {
    if (id) this.hooks.select(id);
    const o = id ? this.w.objects[id] : null;
    const p = at ?? (o ? { x: o.pose.x, y: o.pose.y, z: o.pose.z + 4 } : null);
    if (p) this.pointAt = p;
    await this.wait(pauseS);
  }

  endPress() {
    this.pointAt = null;
  }

  dispatch(cmd: F04Command): F04DispatchResult {
    const r = this.hooks.dispatch(cmd);
    if (!r.ok) console.warn(`[demo f04] ${cmd.type}: ${r.code ?? 'rechazado'}`);
    return r;
  }

  /** Repite un comando en pasos pequeños para que el movimiento se vea (como mantener pulsado un botón). */
  async steps01(from: number, to: number, step: number, fn: (v: number) => void, pauseS = 0.04) {
    const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
    for (let i = 1; i <= n; i++) {
      fn(from + ((to - from) * i) / n);
      await this.wait(pauseS);
    }
  }
}
