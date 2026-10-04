/**
 * Demostración automática: conduce la escena con una «mano virtual» que usa las MISMAS mecánicas que el estudiante
 * (tomar y arrastrar con el controlador, acoples, imán de herramientas, verter, apretar la piseta, rotular…).
 * No altera la ciencia: todo pasa por los comandos del dominio, igual que con el puntero.
 *
 * El director avanza con el reloj de la escena (`lab.onFrame`), así que la pausa y la velocidad de reproducción
 * (`lab.playback`) detienen o aceleran también sus esperas. Cada gesto tiene un tiempo límite y, si la mecánica no
 * responde, un respaldo con el comando del dominio para que la demostración nunca se quede trabada.
 */
import type { Lab3D } from '../../engine/Lab3D';
import type { Command } from '../../simulation/world/commands';
import type { DispatchResult } from '../../simulation/world/world';
import type { Vessel, World } from '../../simulation/entities/types';
import { liquidVolumeMl } from '../../simulation/solutions/mixture';
import { PROP_DIM, VESSEL_DIM } from '../../engine/physics/dimensions';
import { SHAPES } from '../../engine/physics/geometry';
import { mouthOf, zoneById } from '../../engine/physics/supports';

export class DemoAbort extends Error {}

export interface DemoStep {
  part: 'A' | 'B';
  key: string;
  run: (d: DemoDirector) => Promise<void>;
}

export interface DemoHooks {
  onStep(index: number): void;
  onNote(text: string | null): void;
  onDone(): void;
  dispatch(cmd: Command): DispatchResult;
  select(id: string | null): void;
  t(key: string, opts?: Record<string, unknown>): string;
}

interface Waiter {
  check: () => boolean;
  until: number;
  resolve: (ok: boolean) => void;
  reject: (e: Error) => void;
}

/** Velocidad de la mano al arrastrar (cm/s de escena, antes de la velocidad de reproducción). */
const HAND_SPEED = 45;
/** Velocidad de reproducción al «saltar» un paso, y tope de la velocidad combinada (usuario × tramo repetitivo). */
const SKIP_SPEED = 14;
const MAX_SPEED = 12;

export class DemoDirector {
  index = -1;
  private t = 0;
  private waiters: Waiter[] = [];
  private aborted = false;
  private goal: { x: number; y: number; speed: number } | null = null;
  private orbit: { cx: number; cy: number; r: number; omega: number; a: number } | null = null;
  /** Punto donde «pulsa» la mano cuando no sostiene nada (botones sobre un objeto). */
  private pointAt: { x: number; y: number; z: number } | null = null;
  private userSpeed = 1;
  private boost = 1;
  private skipping = false;

  constructor(readonly lab: Lab3D, readonly steps: DemoStep[], readonly hooks: DemoHooks) {}

  get w(): World {
    return this.lab.runtime.world;
  }

  get c() {
    return this.lab.controller;
  }

  get total() {
    return this.steps.length;
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
          console.error(`[demo] paso ${this.steps[i].key}:`, e);
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
      if (!(e instanceof DemoAbort)) console.error('[demo]', e);
    }
  }

  /** Se llama cada fotograma (dt ya escalado por la velocidad de reproducción; no corre en pausa). */
  tick = (dt: number) => {
    if (this.aborted) return;
    this.t += dt;
    const h = this.c.held;
    if (h && this.orbit) {
      const o = this.orbit;
      o.a += o.omega * dt;
      h.tx = o.cx + o.r * Math.cos(o.a);
      h.ty = o.cy + o.r * Math.sin(o.a);
    } else if (h && this.goal) {
      const g = this.goal;
      const dx = g.x - h.tx;
      const dy = g.y - h.ty;
      const d = Math.hypot(dx, dy);
      const step = g.speed * dt;
      if (d <= step) {
        h.tx = g.x;
        h.ty = g.y;
        this.goal = null;
      } else {
        h.tx += (dx / d) * step;
        h.ty += (dy / d) * step;
      }
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
      const w = this.w;
      const v = w.vessels[h.id];
      const p = v ? v.pose : w.props[h.id]?.pose;
      if (!p) return;
      const top = v ? Math.min(VESSEL_DIM[v.type].h, 12) * 0.6 : (PROP_DIM[w.props[h.id].kind]?.h ?? 1);
      this.lab.demoCursor = { x: p.x + 0.5, y: p.y, z: p.z + top, down: true };
    } else if (this.pointAt) this.lab.demoCursor = { ...this.pointAt, down: true };
    else if (this.lab.demoCursor) this.lab.demoCursor = { ...this.lab.demoCursor, down: false };
  }

  // ───────────── Esperas ─────────────

  /** Espera a que se cumpla la condición (o el tiempo límite, en segundos de escena). Devuelve si se cumplió. */
  until(check: () => boolean, timeoutS = 20): Promise<boolean> {
    if (this.aborted) return Promise.reject(new DemoAbort());
    if (check()) return Promise.resolve(true);
    return new Promise((resolve, reject) => this.waiters.push({ check, until: this.t + timeoutS, resolve, reject }));
  }

  async wait(s: number) {
    await this.until(() => false, s);
  }

  /**
   * Espera en tiempo de SIMULACIÓN acelerado (calentar, gotear, evaporar, enfriar). `accel` multiplica la escala de
   * tiempo del dominio mientras dura la espera; se muestra una nota.
   */
  async simUntil(check: () => boolean, maxSimS: number, accel = 30) {
    const rt = this.lab.runtime;
    const prev = rt.timeScale;
    const start = this.w.timeS;
    rt.timeScale = accel;
    this.note(this.hooks.t('demo.ui.accelerated', { x: accel }));
    try {
      await this.until(() => check() || this.w.timeS - start >= maxSimS, maxSimS / Math.max(1, accel) * 4 + 30);
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

  look(x: number, y: number, dist = 48, z = 6) {
    // El panel de la demostración ocupa la izquierda: el centro de la vista se corre un poco para que lo que se
    // está haciendo quede a la derecha del panel.
    this.lab.camera?.lookAt(x - dist * 0.12, y, z, dist);
  }

  lookAtObj(id: string, dist = 40) {
    const p = this.pos(id);
    if (p) this.look(p.x, p.y, dist, p.z + 5);
  }

  pos(id: string): { x: number; y: number; z: number } | null {
    return this.w.vessels[id]?.pose ?? this.w.props[id]?.pose ?? null;
  }

  lv(id: string): number {
    const v = this.w.vessels[id];
    return v ? liquidVolumeMl(v.mix, this.lab.runtime.ctx.subs) : 0;
  }

  /** «Pulsa» sobre un objeto (botón del panel de acciones): lo selecciona y la mano se posa encima. */
  async press(id: string, pauseS = 0.5) {
    this.hooks.select(id);
    const p = this.pos(id);
    const v = this.w.vessels[id];
    if (p) this.pointAt = { x: p.x + 0.5, y: p.y, z: p.z + (v ? Math.min(VESSEL_DIM[v.type].h, 10) : 4) };
    await this.wait(pauseS);
  }

  endPress() {
    this.pointAt = null;
  }

  dispatch(cmd: Command) {
    return this.hooks.dispatch(cmd);
  }

  // ───────────── Gestos ─────────────

  /** Toma un objeto (como clic sostenido). */
  async grab(id: string): Promise<boolean> {
    if (this.c.held?.id === id) return true;
    if (this.c.held) await this.release();
    this.pointAt = null;
    this.hooks.select(id);
    await this.until(() => !this.c.busy(id), 3);
    await this.settled();
    const ok = this.c.beginDrag(id, true);
    if (!ok) console.warn(`[demo] no se pudo tomar ${id}`);
    await this.wait(0.2);
    return ok;
  }

  /** Lleva lo que se sostiene hasta (x, y) a velocidad de mano. Termina antes si se soltó solo (sonda). */
  async moveTo(x: number, y: number, speed = HAND_SPEED) {
    const h = this.c.held;
    if (!h) return;
    this.orbit = null;
    this.goal = { x, y, speed };
    const id = h.id;
    await this.until(() => this.goal === null || this.c.held?.id !== id, 30);
    this.goal = null;
    await this.until(() => {
      const p = this.pos(id);
      return !p || this.c.held?.id !== id || Math.hypot(p.x - x, p.y - y) < 0.5;
    }, 1.5);
  }

  /** Lleva la punta de la herramienta sostenida a (x, y). */
  async moveTipTo(x: number, y: number, speed = HAND_SPEED) {
    const h = this.c.held;
    if (!h) return;
    const o = this.c.originForTip(h.id, x, y);
    await this.moveTo(o.x, o.y, speed);
  }

  /** Suelta lo que se sostiene (encaja en la zona cercana, si la hay). */
  async release() {
    const h = this.c.held;
    if (!h) return;
    this.endHold();
    this.c.release();
    await this.wait(0.15);
    await this.until(() => !this.c.busy(h.id), 3);
    await this.settled();
  }

  /**
   * Espera a que lo soltado termine de caer y asentarse. La física corre en tiempo real (no se acelera): si la mano
   * acelerada pasara mientras algo aún cae, lo golpearía como un impacto fuerte.
   */
  private async settled() {
    await this.until(() => this.lab.physicsActive.size === 0, 60);
  }

  private endHold() {
    this.goal = null;
    this.orbit = null;
    if (this.c.held) this.c.secondaryUp();
    if (this.c.squeezing) this.c.stopSqueeze();
  }

  /** Toma, lleva y suelta en (x, y). */
  async carry(id: string, x: number, y: number) {
    if (!(await this.grab(id))) return;
    await this.moveTo(x, y);
    await this.wait(0.15);
    await this.release();
  }

  /** Lleva un recipiente a una zona de encaje (gradilla, placa, balanza, aro, embudo, baño). */
  async placeIn(id: string, zoneId: string) {
    const z = zoneById(this.w, zoneId);
    if (z) await this.carry(id, z.x, z.y);
    const v = this.w.vessels[id];
    if (v && v.support !== zoneId && z) {
      console.warn(`[demo] respaldo: ${id} → ${zoneId}`);
      this.c.cancelHold();
      this.dispatch({ type: 'place', id, support: zoneId });
      this.dispatch({ type: 'setPose', id, pose: { x: z.x, y: z.y, z: z.z, rotationRad: 0 } });
    }
  }

  /**
   * Acerca el recipiente sostenido a `dst` por un lado hasta que se acople para verter. `dir` = dirección desde el
   * receptor hacia donde se coloca el recipiente (unitaria en el plano de la mesada).
   */
  async dockFor(src: string, dst: string, dir: { x: number; y: number }): Promise<boolean> {
    if (!(await this.grab(src))) return false;
    const s = this.w.vessels[src];
    const t = this.w.vessels[dst];
    const dist = VESSEL_DIM[s.type].footR + VESSEL_DIM[t.type].footR + 1.2;
    await this.moveTo(t.pose.x + dir.x * dist, t.pose.y + dir.y * dist);
    const ok = await this.until(() => this.c.pourDock?.sourceId === src && this.c.pourDock.targetId === dst && this.c.pourDock.settled, 4);
    if (!ok) console.warn(`[demo] no se acopló ${src} → ${dst}`);
    return ok;
  }

  /**
   * Vierte (mantener «Verter») hasta que `stop()` se cumpla. Con `pauseWhen`/`resumeWhen` deja de inclinar mientras
   * el receptor está lleno (decantar al embudo sin pasar el borde del papel). Al final se endereza.
   */
  async pour(src: string, stop: () => boolean, opts: { timeoutS?: number; pauseWhen?: () => boolean; resumeWhen?: () => boolean } = {}) {
    const end = this.t + (opts.timeoutS ?? 120);
    while (!stop() && this.t < end) {
      if (this.c.pourDock?.sourceId !== src) break;
      this.c.secondaryDown();
      await this.until(() => stop() || !!opts.pauseWhen?.(), Math.max(0.1, end - this.t));
      this.c.secondaryUp();
      if (stop() || !opts.pauseWhen) break;
      await this.until(() => stop() || (opts.resumeWhen?.() ?? true), Math.max(0.1, end - this.t));
    }
    this.c.secondaryUp();
    await this.until(() => Math.abs(this.w.vessels[src]?.pose.rotationRad ?? 0) < 0.03, 4);
  }

  /**
   * Vierte una cantidad medida en el receptor con la técnica cuidadosa: inclina poco a poco hasta que empieza a salir,
   * mantiene un chorro suave y lo hace más fino al acercarse a la marca; al llegar, endereza.
   */
  async pourMeasured(src: string, measure: () => number, target: number) {
    const dock = this.c.pourDock;
    if (!dock || dock.sourceId !== src) return;
    const side = dock.side;
    const step = 0.08;
    const end = this.t + 90;
    const tiltDeg = () => Math.abs((this.c.held?.tilt ?? 0) * 180) / Math.PI;
    let prev = measure();
    while (measure() < target - 0.03 && this.c.pourDock?.sourceId === src && this.t < end) {
      await this.wait(step);
      const m = measure();
      const rate = (m - prev) / step;
      prev = m;
      const remaining = target - m;
      const want = remaining > 0.8 ? 0.6 : Math.max(0.1, remaining * 0.6);
      // Cerca del ángulo en que empieza a salir, el caudal cambia mucho con poco ángulo: se inclina de a medio grado.
      if (rate < want * 0.6) this.c.nudgeTilt(side, rate > 0.02 ? 0.3 : tiltDeg() < 35 ? 3 : 0.6);
      else if (rate > want * 1.3) this.c.nudgeTilt(-side, rate > want * 2.5 ? 3 : 1);
    }
    this.c.nudgeTilt(-side, 200);
    await this.until(() => Math.abs(this.w.vessels[src]?.pose.rotationRad ?? 0) < 0.03, 4);
  }

  /**
   * Echa `ml` de agua con la piseta en `target`: la acerca (se acopla sola), aprieta y termina con «apretar suave».
   * `measure` permite medir sobre el receptor (la probeta); por omisión, lo que salió de la piseta.
   */
  async squeeze(target: string, ml: number, measure?: () => number) {
    if (!(await this.grab('piseta'))) return;
    const m = mouthOf(this.w.vessels[target]);
    await this.moveTipTo(m.x, m.y);
    const over = () => this.c.tipOver('piseta') === target;
    await this.until(() => this.c.alignedTarget('piseta') === target || over(), 4);
    const start = this.lv('piseta');
    const got = measure ?? (() => start - this.lv('piseta'));
    const goal = got() + ml;
    // Solo se aprieta con la boquilla sobre el recipiente; si se saliera, se deja de apretar.
    if (over()) {
      if (ml > 0.8) {
        this.c.startSqueeze(false);
        await this.until(() => got() >= goal - 0.45 || !over(), 60);
        this.c.stopSqueeze();
      }
      if (over()) {
        this.c.startSqueeze(true);
        await this.until(() => got() >= goal - 0.012 || !over(), 30);
        this.c.stopSqueeze();
      }
    }
    if (got() < goal - 0.05) {
      // Respaldo: la boquilla no quedó sobre la boca; el agua se agrega con el comando equivalente.
      console.warn(`[demo] respaldo: piseta → ${target}`);
      this.dispatch({ type: 'setPour', sourceId: 'piseta', targetId: target, liquidRateMlS: 0.6, solidRateGS: 0, tiltDeg: 0, guided: true });
      await this.until(() => got() >= goal - 0.012, 60);
      this.dispatch({ type: 'stopPour', sourceId: 'piseta' });
    }
    await this.wait(0.3);
  }

  /** Agitar con el botón «Agitar» (mantener) sobre un recipiente. */
  async agitate(id: string, seconds: number, tool: 'SHAKE' | 'SWIRL' | 'ROD') {
    const vesselId = tool === 'ROD' ? this.w.devices.rod.vesselId ?? id : id;
    await this.press(tool === 'ROD' ? 'rod' : id, 0.3);
    this.dispatch({ type: 'setAgitation', vesselId, intensity: 0.6, tool });
    await this.wait(seconds);
    this.dispatch({ type: 'setAgitation', vesselId, intensity: 0, tool: 'NONE' });
    this.endPress();
  }

  /** Con la varilla en la mano y dentro del vaso: círculos para agitar. */
  async stir(vesselId: string, seconds: number) {
    const v = this.w.vessels[vesselId];
    if (!this.c.held || this.c.held.id !== 'rod' || !v) return;
    const r = (SHAPES[v.type]?.r ?? 1.5) * 0.5;
    // ~0,9 vueltas/s: agitación firme (≈ 0,65) sin llegar a la «agitación brusca» que salpica o rompe la varilla.
    this.orbit = { cx: v.pose.x, cy: v.pose.y, r, omega: 2 * Math.PI * 0.9, a: 0 };
    await this.wait(seconds);
    this.orbit = null;
  }

  /** Mete la varilla en un recipiente (entra sola al acercarla); queda en la mano. */
  async insertRod(vesselId: string) {
    if (!(await this.grab('rod'))) return;
    const m = mouthOf(this.w.vessels[vesselId]);
    await this.moveTo(m.x, m.y);
    const ok = await this.until(() => this.w.devices.rod.vesselId === vesselId, 3);
    if (!ok) {
      console.warn(`[demo] respaldo: varilla → ${vesselId}`);
      this.dispatch({ type: 'insertRod', vesselId });
    }
  }

  /** Saca la varilla o la sonda (botón «Retirar») y la deja en la mesada en (x, y). */
  async takeOut(id: 'rod' | 'probe', x: number, y: number) {
    await this.press(id, 0.4);
    if (id === 'rod') this.dispatch({ type: 'insertRod', vesselId: null });
    else this.dispatch({ type: 'insertProbe', vesselId: null, touchingBottom: false });
    this.c.placeOnBench(id, true, x, y);
    this.endPress();
    await this.wait(0.4);
  }

  vessel(id: string): Vessel {
    return this.w.vessels[id];
  }
}
