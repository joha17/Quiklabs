/**
 * Demostración automática de F05: una «mano virtual» que ejecuta los MISMOS comandos del dominio que el panel de
 * acciones y el controlador (pesar en la balanza tarada, dibujar los diagramas, nivelar el carril vuelta a vuelta,
 * colgar el portapesas y tensar el cordel, correr las compuertas, soltar el pestillo, elegir la ventana de la gráfica,
 * empujar la pareja y leer de frente). No altera la ciencia,
 * no marca etapas a mano, no genera nota ni se guarda como intento. Avanza con el reloj de la escena (`lab.onFrame`):
 * la pausa y la velocidad también detienen o aceleran sus esperas.
 */
import type { F05Lab3D } from '../../../engine/f05/F05Lab3D';
import type { F05Command, F05DispatchResult } from '../../../simulation/f05-world/commands';
import type { F05World } from '../../../simulation/f05-world/types';
import { objRoom } from '../../../engine/f05/layout';

export class DemoAbort extends Error {}

export type DemoPartF05 = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface DemoStepF05 {
  part: DemoPartF05;
  key: string;
  run: (d: DemoDirectorF05) => Promise<void>;
}

export interface DemoHooksF05 {
  onStep(index: number): void;
  onNote(text: string | null): void;
  onDone(): void;
  dispatch(cmd: F05Command): F05DispatchResult;
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

export class DemoDirectorF05 {
  index = -1;
  private t = 0;
  private waiters: Waiter[] = [];
  private aborted = false;
  private pointAt: { x: number; y: number; z: number } | null = null;
  private userSpeed = 1;
  private boost = 1;
  private skipping = false;

  constructor(readonly lab: F05Lab3D, readonly steps: DemoStepF05[], readonly hooks: DemoHooksF05) {}

  get w(): F05World {
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
          console.error(`[demo f05] paso ${this.steps[i].key}:`, e);
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
      if (!(e instanceof DemoAbort)) console.error('[demo f05]', e);
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
    const p = at ?? (o && id ? { ...objRoom(this.w, id), z: objRoom(this.w, id).z + 4 } : null);
    if (p) this.pointAt = p;
    await this.wait(pauseS);
  }

  endPress() {
    this.pointAt = null;
  }

  dispatch(cmd: F05Command): F05DispatchResult {
    const r = this.hooks.dispatch(cmd);
    if (!r.ok) console.warn(`[demo f05] ${cmd.type}: ${r.code ?? 'rechazado'}`);
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
