/**
 * Interacción de la Práctica 9: gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js (§13).
 * - Arrastre con altura de transporte; al soltar, el objeto va al apoyo cercano: sitio de la gradilla, posición del
 *   rotor (con la tapa abierta), turbidímetro, platillo, llama (asa), soporte sobre el emisor (vidrio o refractario),
 *   vaso de limpieza; la pipeta y el asa entran en un recipiente.
 * - Tubo o vaso sobre la boca de otro: P inclina (vertido/decantación; el caudal lo decide el dominio). A agita.
 * - Frasco gotero sobre un tubo: P = 1 gota (Mayús = 5). Pipeta dentro de un recipiente: P aspira, U entrega.
 * - Piseta: P = 0,5 mL (Mayús = 2 mL). Asa en el vaso de limpieza: P la limpia.
 * - Equipos: botones de la centrífuga (tapa, giro), de la campana (extracción, mampara, luz LOCAL), del emisor
 *   (llama virtual), de la vista espectral y del turbidímetro. No hay «identificar» ni «precipitar»: decide el dominio.
 */
import type { CationHost } from './host';
import type { CationLab3D } from './CationLab3D';
import type { P09Command } from '../../simulation/cation-analysis-world/commands';
import type { P09ObjKind, P09World, Pose } from '../../simulation/cation-analysis-world/types';
import { pourDockPose } from '../interaction/pourDock';
import { GEO09 } from '../../simulation/cation-analysis-world/geometry';
import { vesselMl } from '../../simulation/cation-analysis-world/world';
import { POUR_LIP09, isPourable, levelsZ, mouthOf, spotsFor, supportPoint } from './layout';

export interface PickHit09 {
  id: string;
  part?: string;
}

export interface ViewAdapter09 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHit09 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

export interface Held09 {
  id: string;
  kind: P09ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  tilt: number;
  pourTarget: string | null;
}

const DIP_KINDS = new Set<P09ObjKind>(['pipette', 'loop']);
const CARRY_Z: Partial<Record<P09ObjKind, number>> = {
  tube: 16, cylinder: 18, beaker: 12, pipette: 26, dropperBottle: 16, bottle: 14, washBottle: 14, loop: 22, watchGlass: 18, refractoryCup: 18,
};
const TOP: Partial<Record<P09ObjKind, number>> = {
  balance: GEO09.balance.h, centrifuge: GEO09.centrifuge.h, rack: GEO09.rack.h, bottle: GEO09.bottle.h + 2, dropperBottle: GEO09.dropperBottle.h + 2, beaker: GEO09.beaker.h,
  cylinder: GEO09.cylinder.h, waste: GEO09.waste.h, washBottle: GEO09.washBottle.h, turbidimeter: GEO09.turbidimeter.h, emitter: GEO09.emitter.h, cleanCup: GEO09.cleanCup.h,
  spectroCam: 10, ppeTray: 3,
};
const FOOT: Partial<Record<P09ObjKind, number>> = {
  balance: 12, centrifuge: 15, rack: 13, bottle: 2.6, dropperBottle: 1.7, beaker: 2.6, cylinder: 2.4, waste: 4.5, washBottle: 3.4, turbidimeter: 8, emitter: 4,
  cleanCup: 2.4, spectroCam: 5, ppeTray: 15, tube: 0.9, watchGlass: 4, refractoryCup: 2.2,
};
const TILT_SPEED = 40;
const TILT_RETURN = 120;

export class CationController {
  view: ViewAdapter09 | null = null;
  held: Held09 | null = null;
  hovered: string | null = null;
  dockTarget: string | null = null;
  /** Duración programada de la centrífuga (s) y ganancia de la vista espectral. */
  spinSeconds = 60;
  gain: 1 | 4 | 16 = 1;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private secondary = false;
  private shaking = false;
  private now = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: CationHost, private lab: CationLab3D) {}

  private get w(): P09World {
    return this.host.runtime.world;
  }

  private dispatch(c: P09Command) {
    return this.host.runtime.dispatch(c);
  }

  private blocked(): boolean {
    return this.w.safety.stoppedByTeacher;
  }

  obj(id: string) {
    return this.w.objects[id] ?? null;
  }

  private hintOnce(key: string, level: 'info' | 'warn' = 'info', params?: Record<string, unknown>) {
    if (this.hinted.has(key)) return;
    this.hinted.add(key);
    this.host.notify(level, key, params);
  }

  private warn(key: string, gapS = 4, params?: Record<string, unknown>) {
    if (this.now - (this.lastWarn.get(key) ?? -99) < gapS) return;
    this.lastWarn.set(key, this.now);
    this.host.notify('warn', key, params);
  }

  run<T extends { ok: boolean; code?: string }>(r: T): T {
    if (!r.ok && r.code) this.warn(`p9.cmd.${r.code}`, 2);
    return r;
  }

  mouthOf(id: string) {
    return mouthOf(this.w, id);
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
    if (hit.part && !this.held && this.instrumentPart(hit.id, hit.part)) return true;
    if (this.held && this.held.id === hit.id) return true;
    this.down = true;
    return this.beginDrag(hit.id, false);
  }

  /** Botones y perillas de los equipos. */
  instrumentPart(id: string, part: string): boolean {
    const w = this.w;
    switch (`${id}:${part}`) {
      case 'balance01:power': this.run(this.dispatch({ type: 'powerBalance', on: !w.balance.powered })); break;
      case 'balance01:tare': this.run(this.dispatch({ type: 'tare' })); break;
      case 'balance01:display': this.readBalance(); break;
      case 'cf01:lid': this.run(this.dispatch({ type: 'setLid', closed: !w.centrifuge.lidClosed })); break;
      case 'cf01:spin': this.run(this.dispatch({ type: 'spin', seconds: this.spinSeconds })); break;
      case 'hood01:fan': this.dispatch({ type: 'setHoodFan', on: !w.hood.fanOn }); break;
      case 'hood01:sashUp': this.dispatch({ type: 'setSash', heightCm: w.hood.sashCm + 10 }); break;
      case 'hood01:sashDown': this.dispatch({ type: 'setSash', heightCm: w.hood.sashCm - 10 }); break;
      case 'hood01:light': this.dispatch({ type: 'setObservationLight', pct: w.hood.lightPct === 100 ? 45 : w.hood.lightPct === 45 ? 20 : 100, scope: 'local' }); break;
      case 'emitter01:ignite': this.run(this.dispatch({ type: 'setIgnition', on: !w.flame.ignited })); break;
      case 'spec01:read': this.readSpectrum(); break;
      case 'spec01:gain': this.gain = this.gain === 1 ? 4 : this.gain === 4 ? 16 : 1; break;
      case 'turb01:read': this.run(this.dispatch({ type: 'readTurbidity' })); break;
      default:
        if (w.vessels[id] && part === 'cap') this.dispatch({ type: 'setCap', vesselId: id, capped: !w.vessels[id].capped });
        else return false;
    }
    this.host.sound('click');
    return true;
  }

  onPointerMove(sx: number, sy: number) {
    this.pointer = { x: sx, y: sy };
    if (!this.held && this.view) this.hovered = this.view.pick(sx, sy, null)?.id ?? null;
  }

  onPointerUp() {
    if (this.held && this.down && !this.held.keyboard) this.release();
    this.down = false;
  }

  onWheel(dy: number): boolean {
    if (!this.held) return false;
    this.nudgeHeight((dy > 0 ? -1 : 1) * 0.6);
    return true;
  }

  secondaryDown() {
    const h = this.held;
    if (!h || this.secondary) return;
    this.secondary = true;
    if (h.kind === 'pipette') this.run(this.dispatch({ type: 'setPipette', squeeze01: 1 }));
    else this.primaryDown();
  }

  secondaryUp() {
    if (!this.secondary) return;
    this.secondary = false;
    if (this.held?.kind === 'pipette') this.dispatch({ type: 'setPipette', squeeze01: 0 });
    else this.primaryUp();
  }

  primaryDown(shift = false) {
    const h = this.held;
    if (!h || this.primary || this.blocked()) return;
    this.primary = true;
    const o = this.obj(h.id)!;
    switch (h.kind) {
      case 'pipette':
        this.run(this.dispatch({ type: 'setPipette', squeeze01: -1 }));
        if (!this.w.vessels[o.support]) this.hintOnce('p9.hint.dipFirst', 'warn');
        break;
      case 'dropperBottle': {
        const t = this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
        this.run(this.dispatch({ type: 'squeezeDropper', sourceId: h.id, targetId: t, drops: shift ? 5 : 1 }));
        this.host.sound('drip');
        this.primary = false;
        break;
      }
      case 'washBottle': {
        const t = this.pourTargetAt('washBottle', o.pose.x + 2.5, o.pose.y, o.pose.z + 6) ?? '';
        this.run(this.dispatch({ type: 'squeezeWash', targetId: t, ml: shift ? 2 : 0.5 }));
        this.host.sound('drip');
        this.primary = false;
        break;
      }
      case 'loop':
        if (o.support === 'clean01') this.run(this.dispatch({ type: 'cleanSupport', supportId: 'loop01' }));
        else this.hintOnce('p9.hint.loop');
        this.primary = false;
        break;
      default:
        if (!isPourable(this.w, h.id)) this.hintOnce('p9.hint.nothingToDo');
    }
  }

  primaryUp() {
    if (!this.primary) return;
    this.primary = false;
    if (this.held?.kind === 'pipette') this.dispatch({ type: 'setPipette', squeeze01: 0 });
  }

  shakeDown(strong = false) {
    const h = this.held;
    if (!h || this.shaking || !this.w.vessels[h.id]) return;
    this.shaking = true;
    this.run(this.dispatch({ type: 'setStir', vesselId: h.id, motion01: strong ? 1 : 0.6 }));
  }

  shakeUp() {
    if (!this.shaking) return;
    this.shaking = false;
    const h = this.held;
    if (h && this.w.vessels[h.id]) this.dispatch({ type: 'setStir', vesselId: h.id, motion01: 0 });
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const step = shift ? 5 : 1;
    const k = key.toLowerCase();
    if (k === 'r') return this.readBalance(), true;
    if (k === 'z') return this.run(this.dispatch({ type: 'tare' })), true;
    if (k === 'x') return this.observeFlame(), true;
    if (k === 'y') return this.readSpectrum(), true;
    if (k === 't') return this.run(this.dispatch({ type: 'readTurbidity' })), true;
    if (k === 'n') {
      const sel = this.held?.id ?? this.host.getSelected();
      if (sel && this.w.vessels[sel]) this.run(this.dispatch({ type: 'observeTube', vesselId: sel }));
      return true;
    }
    if (k === 'v') {
      const sel = this.held?.id ?? this.host.getSelected();
      if (sel) this.readVolume(sel);
      return true;
    }
    const h = this.held;
    if (h) {
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      if (k === 'p' || key === ' ') return this.primaryDown(shift), true;
      if (k === 'u') return this.secondaryDown(), true;
      if (k === 'a') return this.shakeDown(shift), true;
      if (k === 'q' || key === 'PageUp') return this.nudgeHeight(1), true;
      if (k === 'e' || key === 'PageDown') return this.nudgeHeight(-1), true;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key];
      if (d) {
        h.x += d[0];
        h.y += d[1];
        return true;
      }
      return false;
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
      if (sel) return this.beginDrag(sel, true);
    }
    return false;
  }

  onKeyUp(key: string): boolean {
    const k = key.toLowerCase();
    if (k === 'p' || key === ' ') return this.primaryUp(), true;
    if (k === 'u') return this.secondaryUp(), true;
    if (k === 'a') return this.shakeUp(), true;
    return false;
  }

  // ─────────────── Tomar y soltar ───────────────

  beginDrag(id: string, keyboard: boolean): boolean {
    const o = this.obj(id);
    if (!o || !o.movable || this.blocked()) return false;
    if (this.held) this.release();
    const keep = o.kind === 'pipette' && this.w.vessels[o.support];
    const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: keep ? o.support : 'hand' });
    if (!r.ok) {
      this.run(r);
      return false;
    }
    const z0 = Math.max(o.pose.z + 2, CARRY_Z[o.kind] ?? o.pose.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support }, tilt: 0, pourTarget: null };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(this.w.vessels[id] ? 'clink' : 'click');
    if (this.w.vessels[id]?.capped) this.hintOnce('p9.hint.capped', 'warn');
    if (isPourable(this.w, id)) this.hintOnce('p9.hint.pour');
    if (o.kind === 'pipette') this.hintOnce('p9.hint.pipette');
    if (o.kind === 'dropperBottle') this.hintOnce('p9.hint.dropper');
    if (o.kind === 'loop') this.hintOnce('p9.hint.loop');
    if (o.kind === 'washBottle') this.hintOnce('p9.hint.wash');
    if (o.kind === 'watchGlass') this.hintOnce('p9.hint.virtualGlass', 'warn');
    return true;
  }

  private sendPose(id: string, pose: Pose, support?: string) {
    return this.dispatch({ type: 'setPose', id, pose, support });
  }

  release() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.secondaryUp();
    this.shakeUp();
    this.endPour(h);
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const o = this.obj(h.id);
    if (!o) return;
    this.place(h.id, h.kind, o.pose);
  }

  place(id: string, kind: P09ObjKind, p: Pose) {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    for (const s of spotsFor(kind)) {
      const pt = supportPoint(w, s);
      if (!pt || !near(pt, s.startsWith('rack:') ? 1.4 : s.startsWith('cf:') ? 2 : 5)) continue;
      if (Object.values(w.objects).some((o) => o.id !== id && o.support === s && s !== 'pan')) continue;
      const r = this.sendPose(id, { x: pt.x, y: pt.y, z: pt.z, rotationRad: 0 }, s);
      if (r.ok) {
        this.host.sound(s.startsWith('cf:') || s.startsWith('rack:') ? 'glass' : 'clink');
        return;
      }
      this.run(r);
    }
    if (DIP_KINDS.has(kind)) {
      const t = this.dipTarget(p.x, p.y, id);
      if (t) {
        const lv = levelsZ(w, t);
        this.sendPose(id, { x: w.objects[t].pose.x, y: w.objects[t].pose.y, z: Math.max(lv.floor + 0.3, p.z), rotationRad: 0 }, t);
        this.host.sound('glass');
        return;
      }
    }
    this.layOnBench(id, p.x, p.y, kind === 'pipette' || kind === 'loop' ? 0.5 : 0);
  }

  cancel() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.secondaryUp();
    this.shakeUp();
    this.endPour(h);
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    this.sendPose(h.id, h.from.pose, h.from.support === 'hand' ? 'bench' : h.from.support);
  }

  private occupied(x: number, y: number, r: number, exclude: string): boolean {
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support !== 'bench') continue;
      const rr = FOOT[o.kind];
      if (rr && Math.hypot(x - o.pose.x, y - o.pose.y) < rr + r + 0.3) return true;
    }
    return false;
  }

  layOnBench(id: string, x0: number, y0: number, z: number) {
    const o = this.obj(id);
    const r = FOOT[o?.kind ?? 'loop'] ?? 1;
    let spot = { x: x0, y: y0 };
    outer: for (let k = 0; k < 16; k++) {
      const ty = Math.max(3, Math.min(60, y0 - k * 3));
      for (const dx of [0, -4, 4, -8, 8, -12, 12]) {
        if (!this.occupied(x0 + dx, ty, r, id)) {
          spot = { x: x0 + dx, y: ty };
          break outer;
        }
      }
    }
    this.sendPose(id, { x: Math.max(-8, Math.min(600, spot.x)), y: spot.y, z, rotationRad: 0 }, 'bench');
    this.host.sound('click');
  }

  private clearZ(x: number, y: number, r: number, exclude: string): number {
    let z = 0;
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand') continue;
      const top = TOP[o.kind];
      const rr = FOOT[o.kind];
      if (top === undefined || rr === undefined) continue;
      if (Math.hypot(x - o.pose.x, y - o.pose.y) < rr + r) z = Math.max(z, o.pose.z + top + 0.4);
    }
    return z;
  }

  nudgeHeight(dz: number) {
    const h = this.held;
    if (!h) return;
    h.z = Math.max(0, Math.min(70, h.z + dz));
  }

  // ─────────────── Líquidos ───────────────

  pourTargetAt(id: string, x: number, y: number, z: number): string | null {
    let best: string | null = null;
    let bz = -1e9;
    let bd = 1e9;
    for (const t of Object.keys(this.w.vessels)) {
      const o = this.w.objects[t];
      if (t === id || !o || o.support === 'hand') continue;
      const m = mouthOf(this.w, t);
      if (!m) continue;
      const d = Math.hypot(x - m.x, y - m.y);
      if (d >= m.r + 1.5 || z <= m.z - 3) continue;
      if (m.z > bz + 0.5 || (Math.abs(m.z - bz) <= 0.5 && d < bd)) {
        bz = m.z;
        bd = d;
        best = t;
      }
    }
    return best;
  }

  private pourDock(h: Held09): { x: number; y: number; z: number } | null {
    if (!isPourable(this.w, h.id) || h.tilt <= 4 || !h.pourTarget) return null;
    const m = mouthOf(this.w, h.pourTarget);
    const lip = POUR_LIP09[this.w.vessels[h.id].shape];
    return m && lip ? pourDockPose(lip, (h.tilt * Math.PI) / 180, m, h) : null;
  }

  private updatePour(h: Held09, dt: number) {
    const o = this.obj(h.id)!;
    const target = this.pourDock(h) ? h.pourTarget : this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
    this.dockTarget = target;
    h.tilt = this.primary ? Math.min(140, h.tilt + TILT_SPEED * dt) : Math.max(0, h.tilt - TILT_RETURN * dt);
    if (h.tilt > 4) {
      if (!this.w.pours[h.id] && this.w.vessels[h.id]?.capped) {
        this.hintOnce('p9.hint.capped', 'warn');
        h.tilt = 0;
        return;
      }
      h.pourTarget = target;
      const r = this.run(this.dispatch({ type: 'setPour', sourceId: h.id, targetId: target, tiltDeg: h.tilt }));
      if (!r.ok) h.tilt = 0;
    } else if (this.w.pours[h.id]) this.endPour(h);
  }

  private endPour(h: Held09) {
    if (this.w.pours[h.id]) {
      this.dispatch({ type: 'stopPour', sourceId: h.id });
      this.host.sound('drip');
    }
    h.tilt = 0;
    h.pourTarget = null;
  }

  // ─────────────── Lecturas ───────────────

  readVolume(id: string) {
    const w = this.w;
    if (!w.vessels[id]) return { ok: false };
    const z = levelsZ(w, id).surface;
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - z : 20;
    const r = this.run(this.dispatch({ type: 'readVolume', vesselId: id, eyeDzCm: eyeDz }));
    if (Math.abs(eyeDz) > 1) this.hintOnce('p9.hint.eyeLevel', 'warn');
    this.host.sound('click');
    return r;
  }

  readBalance() {
    const r = this.run(this.dispatch({ type: 'readBalance' }));
    this.host.sound('click');
    return r;
  }

  observeFlame(zone: 'whole' | 'core' = 'whole') {
    const r = this.run(this.dispatch({ type: 'sampleEmission', zone }));
    this.host.sound('click');
    return r;
  }

  readSpectrum() {
    const r = this.run(this.dispatch({ type: 'readSpectrum', gain: this.gain }));
    this.host.sound('click');
    return r;
  }

  /** Traslado accesible (panel): lleva un objeto a un destino como si se soltara allí. */
  moveTo(id: string, where: string, z?: number): { ok: boolean; code?: string } {
    if (this.blocked()) return { ok: false, code: 'TEACHER_STOP' };
    if (this.held) this.release();
    const w = this.w;
    const o = w.objects[id];
    if (!o) return { ok: false };
    if (o.support !== 'hand') {
      const r = this.sendPose(id, { ...o.pose }, 'hand');
      if (!r.ok) return this.run(r);
    }
    if (where === 'bench') {
      this.layOnBench(id, o.pose.x, Math.max(8, o.pose.y - 6), DIP_KINDS.has(o.kind) ? 0.5 : 0);
      return { ok: true };
    }
    const pt = supportPoint(w, where);
    if (pt && spotsFor(o.kind).includes(where)) return this.run(this.sendPose(id, { x: pt.x, y: pt.y, z: pt.z, rotationRad: 0 }, where));
    const t = w.objects[where];
    if (t && w.vessels[where] && DIP_KINDS.has(o.kind)) {
      const lv = levelsZ(w, where);
      return this.run(this.sendPose(id, { x: t.pose.x, y: t.pose.y, z: z ?? Math.max(lv.pellet + 0.4, lv.floor + 0.6), rotationRad: 0 }, where));
    }
    return { ok: false, code: 'NO_SPOT' };
  }

  pourDirect(src: string, target: string | null, strong = false) {
    const v = this.w.vessels[src];
    if (!v) return { ok: false };
    const fill = Math.min(1, vesselMl(v) / Math.max(1, v.capacityMl));
    const tilt0 = 100 - 88 * fill;
    return this.run(this.dispatch({ type: 'setPour', sourceId: src, targetId: target, tiltDeg: Math.min(strong ? 118 : 104, tilt0 + (strong ? 16 : 5)) }));
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const h = this.held;
    this.dockTarget = null;
    if (h && this.obj(h.id) && this.view) {
      if (!h.keyboard && this.pointer) {
        const p = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
        h.x = p.x;
        h.y = p.y;
      }
      const o = this.obj(h.id)!;
      let tx = h.x;
      let ty = h.y;
      let tz = h.z;
      const dock = this.pourDock(h);
      if (dock) {
        tx = dock.x;
        ty = dock.y;
        tz = dock.z;
      }
      const dipping = DIP_KINDS.has(h.kind) ? this.dipTarget(tx, ty, h.id) : null;
      let floor = this.clearZ(tx, ty, FOOT[h.kind] ?? 0.6, h.id) + 0.3;
      if (dipping) floor = levelsZ(this.w, dipping).floor + 0.2;
      tz = Math.max(tz, floor);
      const k = Math.min(1, dt * (dock ? 8 : 16));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const rot = (h.tilt * Math.PI) / 180;
      let support = 'hand';
      if (dipping) {
        const m = mouthOf(this.w, dipping)!;
        // Recipientes bajos (vidrio de reloj, refractario): basta con bajar la punta por debajo del borde.
        const lv = levelsZ(this.w, dipping);
        if (h.curZ < m.z - Math.min(0.5, (m.z - lv.floor) / 3)) support = dipping;
      }
      const moved = Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001;
      if (moved || support !== o.support) this.sendPose(h.id, { x: nx, y: ny, z: h.curZ, rotationRad: rot }, support);
      if (isPourable(this.w, h.id)) this.updatePour(h, dt);
      if (DIP_KINDS.has(h.kind)) this.dockTarget = support !== 'hand' ? support : dipping;
      if (h.kind === 'dropperBottle') this.dockTarget = this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
      if (h.kind === 'washBottle') this.dockTarget = this.pourTargetAt('washBottle', o.pose.x + 2.5, o.pose.y, o.pose.z + 6);
      if (this.pointer && !h.keyboard) {
        const W = this.view.viewW();
        if (this.pointer.x < 30) this.view.edgePan(-1, dt);
        else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
      }
    }
  }

  private dipTarget(x: number, y: number, exclude: string): string | null {
    for (const t of Object.keys(this.w.vessels)) {
      if (t === exclude || this.w.objects[t]?.support === 'hand') continue;
      const m = mouthOf(this.w, t);
      if (m && Math.hypot(x - m.x, y - m.y) < Math.max(0.8, m.r - 0.1)) return t;
    }
    return null;
  }
}
