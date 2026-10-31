/**
 * Interacción de la Práctica 1: gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js.
 * - Arrastre con altura de transporte; al soltar, el objeto va al soporte cercano que corresponda (platillo, baño con
 *   hielo, vidrio de reloj, bandeja, recipiente para la pipeta o el termómetro, pera sobre la pipeta).
 * - Pipeta sostenida: al bajarla dentro de un recipiente la punta queda sumergida (el dominio lo sabe por su soporte);
 *   P mantenida aspira con la pera, el clic derecho mantenido descarga, A ajusta el menisco con el ojo REAL (paralaje)
 *   y W limpia la gota exterior. Q/E inclinan (una pipeta inclinada enrasa mal).
 * - Vertido (§14): un recipiente sobre la boca de otro y P (o clic derecho) mantenido lo inclina; el caudal lo decide
 *   el dominio; sin receptor debajo, se derrama.
 * - Piseta: P = una gota (Mayús = chorro de 10) en el recipiente bajo la boquilla.
 * - Recipiente de pesada con clavos sobre la probeta: P los introduce de a uno (Mayús = de golpe).
 * - Lecturas (V, R, T, C): con la cámara a la altura del ojo no hay paralaje.
 */
import { clearSpotNear, TIP_TOOLS } from '../interaction/solidFloor';
import { clampToBench } from '../interaction/viewport';
import type { DensityHost } from './host';
import type { DensityLab3D } from './DensityLab3D';
import type { P01Command } from '../../simulation/density-world/commands';
import type { P01ObjKind, P01World, Pose } from '../../simulation/density-world/types';
import { pourDockPose } from '../interaction/pourDock';
import { ICE_BATH_POS, PAN_POS, SPILL_TRAY_POS } from '../../practices/practice-01/definition';
import { GEO01 } from '../../simulation/density-world/geometry';
import { POUR_LIP01, cylinderLevelZ, mouthOf, pipetteLevelZ } from './layout';

export interface PickHit01 {
  id: string;
  part?: string;
}

export interface ViewAdapter01 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  /** Altura mínima para que el cuerpo completo del objeto no entre en lo que descansa en la mesada. */
  /** Saca (x, y) de lo que no se puede sobrevolar. */
  solidPush?(id: string, cur: { x: number; y: number }, x: number, y: number, resting: readonly string[], grounded: boolean, point?: boolean): { x: number; y: number };
  solidFloor?(id: string, cur: { x: number; y: number; z: number }, x: number, y: number, resting: readonly string[]): number;
  pick(sx: number, sy: number, excludeId?: string | null): PickHit01 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

export interface Held01 {
  id: string;
  kind: P01ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  tilt: number;
  pourTarget: string | null;
}

/** Recipientes que se vierten inclinándolos. */
export const POURABLE = new Set(['waterRoom01', 'waterCold01', 'cylinder50', 'erlenmeyer150']);
/** Recipientes donde se puede meter la pipeta o el termómetro. */
const DIP_TARGETS = ['waterRoom01', 'waterCold01', 'erlenmeyer150', 'erlenmeyer150b', 'cylinder50', 'waste01'];
/** Lo que se puede poner en el platillo. */
const PAN_KINDS = new Set<P01ObjKind>(['erlenmeyer', 'weighBoat', 'watchGlass', 'solidCylinder', 'nailsDish', 'cylinder']);
const CARRY_Z: Partial<Record<P01ObjKind, number>> = {
  watchGlass: 12, pipette: 18, filler: 14, cylinder: 6, erlenmeyer: 6, washBottle: 6, thermometer: 16, caliper: 10, solidCylinder: 12, nailsDish: 10,
  weighBoat: 12, reservoir: 6,
};
const TOP: Partial<Record<P01ObjKind, number>> = {
  balance: GEO01.balance.h, reservoir: GEO01.reservoir.h, iceBath: GEO01.iceBath.h, cylinder: GEO01.cylinder50.h, erlenmeyer: GEO01.erlenmeyer150.mouthZ,
  waste: GEO01.waste.h, washBottle: GEO01.washBottle.h, recAnalytical: 22, recBurette: 4, recTubes: 12, recBeaker: 10,
};
const FOOT: Partial<Record<P01ObjKind, number>> = {
  balance: 13, reservoir: 3.8, iceBath: 12, cylinder: 3, erlenmeyer: 3.6, waste: 4.5, washBottle: 3.4, recAnalytical: 12, recBurette: 6, recTubes: 8, recBeaker: 3.5,
  spillTray: 11, nailsDish: 4.5, weighBoat: 4, watchGlass: 4.5, solidCylinder: 1.2,
};
const TILT_SPEED = 40;
const TILT_RETURN = 120;

export class DensityController {
  view: ViewAdapter01 | null = null;
  held: Held01 | null = null;
  hovered: string | null = null;
  /** Receptor bajo lo que se sostiene (para la vista y el panel). */
  dockTarget: string | null = null;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private primaryShift = false;
  private secondary = false;
  private now = 0;
  private dropTimer = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: DensityHost, private lab: DensityLab3D) {}

  private get w(): P01World {
    return this.host.runtime.world;
  }

  private dispatch(c: P01Command) {
    return this.host.runtime.dispatch(c);
  }

  private blocked(): boolean {
    return !!this.w.safety.incident || this.w.safety.stoppedByTeacher;
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
    if (!r.ok && r.code) this.warn(`p01.cmd.${r.code}`, 2);
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
    if (this.w.safety.stoppedByTeacher) return true;
    if (hit.id === 'balance01' && hit.part) {
      if (hit.part === 'power') this.run(this.dispatch({ type: 'powerBalance', on: !this.w.balance.powered }));
      else if (hit.part === 'tare') this.tare();
      else if (hit.part === 'level') this.run(this.dispatch({ type: 'levelBalance' }));
      else if (hit.part === 'display') this.readBalance();
      this.host.sound('click');
      return true;
    }
    if (hit.id === 'thermometer01' && hit.part === 'display' && !this.held) {
      this.readThermometer();
      return true;
    }
    if (this.held && this.held.id === hit.id) return true;
    this.down = true;
    return this.beginDrag(hit.id, false);
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
    const h = this.held;
    if (!h) return false;
    const dir = dy > 0 ? -1 : 1;
    this.nudgeHeight(dir * 0.6);
    return true;
  }

  /** Clic derecho mantenido: descargar la pipeta, verter o apretar la piseta. */
  secondaryDown() {
    const h = this.held;
    if (!h || this.secondary) return;
    this.secondary = true;
    if (h.kind === 'pipette') this.run(this.dispatch({ type: 'setPipetteRelease', release01: 1 }));
    else this.primaryDown();
  }
  secondaryUp() {
    if (!this.secondary) return;
    this.secondary = false;
    const h = this.held;
    if (h?.kind === 'pipette') this.dispatch({ type: 'setPipetteRelease', release01: 0 });
    else this.primaryUp();
  }

  /** P, clic derecho o el botón de acción: acción principal de lo que se tiene en la mano. */
  primaryDown(shift = false) {
    const h = this.held;
    if (!h || this.primary || this.blocked()) return;
    this.primary = true;
    this.primaryShift = shift;
    switch (h.kind) {
      case 'pipette':
        this.run(this.dispatch({ type: 'setAspirate', suction01: shift ? 1 : 0.6 }));
        if (this.w.objects.pipette25.support === 'hand') this.hintOnce('p01.hint.dipFirst', 'warn');
        break;
      case 'washBottle':
        this.squeeze(shift ? 10 : 1);
        this.dropTimer = 0;
        break;
      case 'weighBoat':
        this.nailsIntoCylinder(!shift);
        this.primary = false;
        break;
      default:
        if (!POURABLE.has(h.id)) this.hintOnce('p01.hint.nothingToDo');
    }
  }

  primaryUp() {
    if (!this.primary) return;
    this.primary = false;
    if (this.held?.kind === 'pipette') this.dispatch({ type: 'setAspirate', suction01: 0 });
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const step = shift ? 5 : 1;
    const k = key.toLowerCase();
    if (k === 'r') return this.readBalance(), true;
    if (k === 't') return this.readThermometer(), true;
    if (k === 'z') return this.tare(), true;
    if (k === 'c') return this.readCaliper(), true;
    if (k === 'v') {
      const sel = this.host.getSelected();
      this.readVolume(sel === 'pipette25' ? 'pipette25' : sel === 'erlenmeyer150' ? 'erlenmeyer150' : 'cylinder50');
      return true;
    }
    const h = this.held;
    if (h) {
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      if (k === 'p') return this.primaryDown(shift), true;
      if (k === 'u') return this.secondaryDown(), true;
      if (k === 'a' && h.kind === 'pipette') return this.adjustMeniscus(), true;
      if (k === 'w' && h.kind === 'pipette') return this.dispatch({ type: 'wipeTip', method: 'outside' }), true;
      if (k === 'q' || key === 'PageUp') return this.tiltHeld(-0.08), true;
      if (k === 'e' || key === 'PageDown') return this.tiltHeld(0.08), true;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key];
      if (d) {
        const moved = clampToBench(h.x + d[0], h.y + d[1]);
        h.x = moved.x;
        h.y = moved.y;
        return true;
      }
      if (k === '+') return this.nudgeHeight(1), true;
      if (k === '-') return this.nudgeHeight(-1), true;
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
    if (k === 'p') {
      this.primaryUp();
      return true;
    }
    if (k === 'u') {
      this.secondaryUp();
      return true;
    }
    return false;
  }

  /** Inclina la pipeta o la probeta sostenidas (sin verter): una pipeta inclinada enrasa mal. */
  tiltHeld(d: number) {
    const h = this.held;
    if (!h) return;
    if (h.kind === 'pipette') {
      const o = this.obj(h.id)!;
      const rot = Math.max(-0.4, Math.min(0.4, o.pose.rotationRad + d));
      this.sendPose(h.id, { ...o.pose, rotationRad: rot }, o.support);
      return;
    }
    this.nudgeHeight(-d * 10);
  }

  // ─────────────── Tomar y soltar ───────────────

  beginDrag(id: string, keyboard: boolean): boolean {
    const o = this.obj(id);
    if (!o || !o.movable || this.blocked()) return false;
    if (this.held) this.release();
    const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: id === 'pipette25' && this.isDip(o.support) ? o.support : 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    const z0 = Math.max(o.pose.z + 2, CARRY_Z[o.kind] ?? o.pose.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support }, tilt: 0, pourTarget: null };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'cylinder' || o.kind === 'erlenmeyer' || o.kind === 'reservoir' || o.kind === 'pipette' ? 'clink' : 'click');
    if (POURABLE.has(id)) this.hintOnce('p01.hint.pour');
    if (o.kind === 'pipette') this.hintOnce(this.w.pipette.fillerAttached ? 'p01.hint.pipette' : 'p01.hint.fillerFirst');
    if (o.kind === 'washBottle') this.hintOnce('p01.hint.wash');
    if (o.kind === 'weighBoat' && this.w.nails.some((n) => n.where === 'weighBoat01')) this.hintOnce('p01.hint.nailsIn');
    if (o.kind === 'caliper') this.hintOnce('p01.hint.caliper');
    return true;
  }

  private isDip(support: string) {
    return DIP_TARGETS.includes(support);
  }

  private sendPose(id: string, pose: Pose, support?: string) {
    return this.dispatch({ type: 'setPose', id, pose, support });
  }

  release() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.secondaryUp();
    this.endPour(h);
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const o = this.obj(h.id);
    if (!o) return;
    this.place(h.id, h.kind, o.pose);
  }

  /** Destino al soltar según lo que haya cerca. */
  place(id: string, kind: P01ObjKind, p: Pose) {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    if (PAN_KINDS.has(kind) && near(PAN_POS, 7)) {
      const r = this.sendPose(id, { x: PAN_POS.x, y: PAN_POS.y, z: PAN_POS.z, rotationRad: 0 }, 'pan');
      if (r.ok) {
        this.host.sound('clink');
        this.hintOnce('p01.hint.waitStable');
        return;
      }
      this.run(r);
    }
    if (kind === 'pipette' || kind === 'thermometer') {
      for (const t of DIP_TARGETS) {
        const m = mouthOf(w, t);
        if (m && near(m, Math.max(2.5, m.r + 0.8))) {
          const z = kind === 'pipette' ? Math.max(w.objects[t].pose.z + 1, m.z - 6) : w.objects[t].pose.z + 1.5;
          const r = this.sendPose(id, { x: m.x, y: m.y, z, rotationRad: 0 }, t);
          if (r.ok) {
            this.host.sound('glass');
            if (kind === 'pipette') this.hintOnce('p01.hint.aspirate');
            return;
          }
          this.run(r);
          break;
        }
      }
    }
    if (kind === 'filler') {
      const pip = w.objects.pipette25.pose;
      if (near(pip, 6) || near({ x: pip.x + GEO01.pipette25.length / 2, y: pip.y }, 8)) {
        this.dispatch({ type: 'attachFiller', on: true });
        this.host.sound('click');
        this.hintOnce('p01.hint.fillerOn');
        return;
      }
    }
    if (kind === 'reservoir' && id === 'waterCold01' && near(ICE_BATH_POS, 9)) {
      this.sendPose(id, { x: ICE_BATH_POS.x, y: ICE_BATH_POS.y, z: 2, rotationRad: 0 }, 'iceBath01');
      this.host.sound('glass');
      this.hintOnce('p01.hint.cooling');
      return;
    }
    if (kind === 'solidCylinder') {
      const g = w.objects.watchGlass01.pose;
      if (near(g, 3.5)) {
        this.sendPose(id, { x: g.x, y: g.y, z: g.z + 0.5, rotationRad: 0 }, 'watchGlass01');
        this.host.sound('metal');
        return;
      }
    }
    if (kind === 'cylinder' && near(SPILL_TRAY_POS, 8)) {
      this.sendPose(id, { x: SPILL_TRAY_POS.x, y: SPILL_TRAY_POS.y, z: 0.35, rotationRad: 0 }, 'bench');
      this.host.sound('glass');
      return;
    }
    const lying = kind === 'pipette' || kind === 'thermometer' || kind === 'caliper' || kind === 'filler';
    this.layOnBench(id, p.x, p.y, lying ? 0.6 : kind === 'weighBoat' ? 0.1 : 0);
  }

  cancel() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.secondaryUp();
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

  private freeSpot(x: number, y: number, r: number, exclude: string) {
    for (let k = 0; k < 16; k++) {
      const ty = Math.max(3, Math.min(60, y - k * 3));
      if (!this.occupied(x, ty, r, exclude)) return { x, y: ty };
      for (const dx of [-4, 4, -8, 8, -12, 12]) if (!this.occupied(x + dx, ty, r, exclude)) return { x: x + dx, y: ty };
    }
    return { x, y: 4 };
  }

  private restingIds(): string[] {
    return Object.values(this.w.objects).filter((o) => o.support === 'bench').map((o) => o.id);
  }

  /** Altura mínima del cuerpo macizo de `id` en (x, y); 0 sin vista. */
  private bodyFloor(id: string, x: number, y: number): number {
    const body = this.obj(id);
    if (!body || TIP_TOOLS.has(body.kind)) return 0;
    return this.view?.solidFloor?.(id, body.pose, x, y, this.restingIds()) ?? 0;
  }

  layOnBench(id: string, x0: number, y0: number, z: number) {
    const o = this.obj(id);
    const r = FOOT[o?.kind ?? 'filler'] ?? 1;
    const free = this.freeSpot(Math.max(-8, Math.min(600, x0)), Math.max(3, Math.min(60, y0)), r, id);
    const spot = clearSpotNear((x, y) => this.bodyFloor(id, x, y), free.x, free.y, z);
    this.sendPose(id, { x: spot.x, y: spot.y, z, rotationRad: 0 }, 'bench');
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
    h.z = Math.max(0, Math.min(60, h.z + dz));
  }

  // ─────────────── Líquidos ───────────────

  /** Receptor bajo el pico del recipiente sostenido. */
  pourTargetAt(id: string, x: number, y: number, z: number): string | null {
    let best: string | null = null;
    let bz = -1e9;
    let bd = 1e9;
    for (const t of ['waterRoom01', 'waterCold01', 'erlenmeyer150', 'erlenmeyer150b', 'cylinder50', 'waste01', 'spillTray01']) {
      if (t === id) continue;
      const m = mouthOf(this.w, t);
      if (!m) continue;
      const d = Math.hypot(x - m.x, y - m.y);
      const reach = m.r + 3.5;
      if (d >= reach || z <= m.z - 3) continue;
      // La boca más alta recibe el chorro primero (la probeta sobre la bandeja, no la bandeja); a igual altura, la más cercana.
      if (m.z > bz + 0.5 || (Math.abs(m.z - bz) <= 0.5 && d < bd)) {
        bz = m.z;
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Pose que deja el pico sobre la boca del receptor mientras se vierte (null si no hay acople). */
  private pourDock(h: Held01): { x: number; y: number; z: number } | null {
    if (!POURABLE.has(h.id) || h.tilt <= 4 || !h.pourTarget) return null;
    const m = mouthOf(this.w, h.pourTarget);
    const lip = POUR_LIP01[h.id];
    return m && lip ? pourDockPose(lip, (h.tilt * Math.PI) / 180, m, h) : null;
  }

  private updatePour(h: Held01, dt: number) {
    const o = this.obj(h.id)!;
    const target = this.pourDock(h) ? h.pourTarget : this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
    this.dockTarget = target;
    h.tilt = this.primary ? Math.min(135, h.tilt + TILT_SPEED * dt) : Math.max(0, h.tilt - TILT_RETURN * dt);
    if (h.tilt > 4) {
      h.pourTarget = target;
      this.run(this.dispatch({ type: 'setPour', sourceId: h.id, targetId: target, tiltDeg: h.tilt }));
    } else if (this.w.pours[h.id]) this.endPour(h);
  }

  private endPour(h: Held01) {
    if (this.w.pours[h.id]) {
      this.dispatch({ type: 'stopPour', sourceId: h.id });
      this.host.sound('drip');
    }
    h.tilt = 0;
    h.pourTarget = null;
  }

  squeeze(drops: number) {
    const h = this.held;
    if (!h || h.kind !== 'washBottle') return;
    const o = this.obj(h.id)!;
    const target = this.pourTargetAt('washBottle', o.pose.x + 2.5, o.pose.y, o.pose.z + 14);
    this.dispatch({ type: 'squeeze', targetId: target, drops });
    this.host.sound('drip');
  }

  /** Clavos del recipiente de pesada a la probeta: suave = de a uno; si no, de golpe. */
  nailsIntoCylinder(gentle: boolean) {
    const o = this.obj('weighBoat01')!;
    const m = mouthOf(this.w, 'cylinder50');
    if (!m || Math.hypot(o.pose.x - m.x, o.pose.y - m.y) > 6) {
      this.hintOnce('p01.hint.overCylinder', 'warn');
      return;
    }
    const n = this.w.nails.filter((x) => x.where === 'weighBoat01').length;
    if (!n) return;
    const r = this.run(this.dispatch({ type: 'transferNails', from: 'weighBoat01', to: 'cylinder50', count: gentle ? 1 : n, gentle, tool: 'tongs' }));
    if (r.ok) this.host.sound(gentle ? 'metal' : 'glass');
  }

  // ─────────────── Lecturas con la posición real del ojo ───────────────

  readVolume(inst: 'cylinder50' | 'pipette25' | 'erlenmeyer150') {
    const w = this.w;
    const menZ = inst === 'pipette25' ? pipetteLevelZ(w) : inst === 'cylinder50' ? cylinderLevelZ(w) : w.objects.erlenmeyer150.pose.z + 2;
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - menZ : 20;
    const r = this.run(this.dispatch({ type: 'readVolume', instrumentId: inst, eyeDzCm: eyeDz }));
    if (!r.ok && r.code === 'PARALLAX') this.hintOnce('p01.hint.eyeLevel', 'warn');
    this.host.sound('click');
    return r;
  }

  adjustMeniscus() {
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - pipetteLevelZ(this.w) : 20;
    const r = this.run(this.dispatch({ type: 'adjustMeniscus', eyeDzCm: eyeDz }));
    if (r.ok) this.host.sound('drip');
    if (Math.abs(eyeDz) >= 1) this.hintOnce('p01.hint.eyeLevel', 'warn');
    return r;
  }

  tare() {
    const r = this.run(this.dispatch({ type: 'tare' }));
    this.host.sound('click');
    return r;
  }

  readBalance() {
    const r = this.run(this.dispatch({ type: 'readBalance' }));
    this.host.sound('click');
    return r;
  }

  readThermometer() {
    const r = this.run(this.dispatch({ type: 'readThermometer' }));
    this.host.sound('click');
    return r;
  }

  readCaliper() {
    const r = this.run(this.dispatch({ type: 'readCaliper' }));
    this.host.sound('click');
    return r;
  }

  /** Traslado accesible (panel): lleva un objeto a un destino como si se soltara allí. */
  moveTo(id: string, where: 'pan' | 'bench' | 'bath' | 'watchGlass' | 'tray' | string) {
    if (this.blocked()) return { ok: false, code: 'INCIDENT' };
    if (this.held) this.release();
    const o = this.w.objects[id];
    if (!o) return { ok: false };
    if (o.support !== 'hand') {
      const r = this.sendPose(id, { ...o.pose }, id === 'pipette25' && this.isDip(o.support) ? o.support : 'hand');
      if (!r.ok) return this.run(r);
    }
    const target =
      where === 'pan' ? { x: PAN_POS.x, y: PAN_POS.y }
        : where === 'bath' ? ICE_BATH_POS
          : where === 'watchGlass' ? this.w.objects.watchGlass01.pose
            : where === 'tray' ? SPILL_TRAY_POS
              : where === 'bench' ? { x: o.pose.x, y: Math.max(8, o.pose.y - (o.support === 'pan' ? 16 : 0)) }
                : (this.w.objects[where]?.pose ?? o.pose);
    this.place(id, o.kind, { x: target.x, y: target.y, z: o.pose.z, rotationRad: 0 });
    return { ok: true };
  }

  /** Vertido accesible (panel): de `src` a `target` mientras se mantiene el botón. */
  pourDirect(src: string, target: string | null) {
    return this.run(this.dispatch({ type: 'setPour', sourceId: src, targetId: target, tiltDeg: 100 }));
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
      const onBench = clampToBench(tx, ty);
      tx = onBench.x;
      ty = onBench.y;
      const pushed = this.view.solidPush?.(h.id, o.pose, tx, ty, this.restingIds(), false, TIP_TOOLS.has(h.kind));
      if (pushed) {
        tx = pushed.x;
        ty = pushed.y;
      }
      let tz = h.z;
      const dock = this.pourDock(h);
      if (dock) {
        tx = dock.x;
        ty = dock.y;
        tz = dock.z;
      }
      // Pipeta y termómetro: sobre un recipiente pueden bajar dentro (la punta entra al agua).
      const dipping = h.kind === 'pipette' || h.kind === 'thermometer' ? this.dipTarget(tx, ty) : null;
      const floor = dipping ? this.w.objects[dipping].pose.z + 1 : this.clearZ(tx, ty, FOOT[h.kind] ?? 1, h.id) + 0.3;
      tz = Math.max(tz, floor);
      if (!dock && !dipping) tz = Math.max(tz, this.bodyFloor(h.id, tx, ty));
      const k = Math.min(1, dt * (dock ? 8 : 16));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const rot = h.kind === 'pipette' ? o.pose.rotationRad : (h.tilt * Math.PI) / 180;
      // Soporte mientras se sostiene: la pipeta «está» en el recipiente si su punta queda bajo la boca.
      let support = 'hand';
      if (h.kind === 'pipette' && dipping) {
        const m = mouthOf(this.w, dipping)!;
        if (h.curZ < m.z - 1) support = dipping;
      }
      const moved = Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001;
      if (moved || support !== o.support) this.sendPose(h.id, { x: nx, y: ny, z: h.curZ, rotationRad: rot }, support);
      if (POURABLE.has(h.id)) this.updatePour(h, dt);
      if (h.kind === 'pipette') this.dockTarget = support !== 'hand' ? support : dipping;
      if (h.kind === 'washBottle') {
        this.dockTarget = this.pourTargetAt('washBottle', o.pose.x + 2.5, o.pose.y, o.pose.z + 14);
        if (this.primary) {
          this.dropTimer += dt;
          if (this.dropTimer > 0.25) {
            this.dropTimer = 0;
            this.squeeze(this.primaryShift ? 10 : 1);
          }
        }
      }
      if (this.pointer && !h.keyboard) {
        const W = this.view.viewW();
        if (this.pointer.x < 30) this.view.edgePan(-1, dt);
        else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
      }
    }
  }

  private dipTarget(x: number, y: number): string | null {
    for (const t of DIP_TARGETS) {
      const m = mouthOf(this.w, t);
      if (m && Math.hypot(x - m.x, y - m.y) < Math.max(1.2, m.r - 0.3)) return t;
    }
    return null;
  }
}
