/**
 * Interacción de la Práctica 7: gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js (§14.1).
 * - Arrastre con altura de transporte; al soltar, el objeto va al soporte que corresponda: sitio de la gradilla,
 *   platillo, baldosa, soporte de la sonda, panel de control del detector o dentro de un recipiente (gotero, espátula,
 *   agitador, sonda, puntas).
 * - Vertido: un recipiente sobre la boca de otro y P mantenida lo inclina (el caudal lo decide el dominio). Sobre el
 *   detector o el conductímetro, el líquido moja el equipo (L09).
 * - Gotero dentro de un recipiente: P aspira (de la fase en la que está la punta); U o clic derecho entrega.
 * - Espátula: dentro de un frasco, P carga; sobre otro recipiente (o un vidrio de reloj), P descarga.
 * - Agitar: con el agitador dentro de un recipiente, P (Mayús = fuerte); con un tubo en la mano, A lo sacude.
 * - Piseta: P = 0,05 mL (Mayús = chorro de 2 mL) en el recipiente bajo la boquilla.
 * - Puntas del detector: se apoyan sobre una muestra (la separación real y el punto de contacto salen de la
 *   geometría); la sonda: la profundidad de inmersión y el contacto con el fondo salen de su altura.
 * - No hay botón «Disolver» ni «Conduce»: el dominio decide (§14.1).
 */
import { clearSpotNear, TIP_TOOLS } from '../interaction/solidFloor';
import { clampToBench } from '../interaction/viewport';
import type { BondingHost } from './host';
import type { BondingLab3D } from './BondingLab3D';
import type { P07Command } from '../../simulation/bonding-world/commands';
import type { P07ObjKind, P07World, Pose, SurfaceHit } from '../../simulation/bonding-world/types';
import { pourDockPose } from '../interaction/pourDock';
import { DETECTOR_POS, METER_POS, PAN_POS } from '../../practices/practice-07/definition';
import { GEO07 } from '../../simulation/bonding-world/geometry';
import { vesselMl } from '../../simulation/bonding-world/world';
import { POUR_LIP07, detectorPad, isPourable, levelsZ, mouthOf, probeHolder, rackSlot, specimenTop } from './layout';

export interface PickHit07 {
  id: string;
  part?: string;
}

export interface ViewAdapter07 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  /** Altura mínima para que el cuerpo completo del objeto no entre en lo que descansa en la mesada. */
  /** Saca (x, y) de lo que no se puede sobrevolar. */
  solidPush?(id: string, cur: { x: number; y: number }, x: number, y: number, resting: readonly string[], grounded: boolean, point?: boolean): { x: number; y: number };
  solidFloor?(id: string, cur: { x: number; y: number; z: number }, x: number, y: number, resting: readonly string[]): number;
  pick(sx: number, sy: number, excludeId?: string | null): PickHit07 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

export interface Held07 {
  id: string;
  kind: P07ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  tilt: number;
  pourTarget: string | null;
}

/** Herramientas que entran en un recipiente. */
const DIP_KINDS = new Set<P07ObjKind>(['dropper', 'spatula', 'stirRod', 'probe', 'tip']);
/** Lo que se puede poner en el platillo. */
const PAN_KINDS = new Set<P07ObjKind>(['watchGlass', 'beaker', 'tube', 'flask', 'cylinder10']);
const CARRY_Z: Partial<Record<P07ObjKind, number>> = {
  tube: 22, bottle: 14, jar: 10, beaker: 10, flask: 14, cylinder10: 16, dropper: 20, spatula: 18, stirRod: 22, washBottle: 12, probe: 16, tip: 10, watchGlass: 12,
  vial: 10, specimen: 8,
};
const TOP: Partial<Record<P07ObjKind, number>> = {
  balance: GEO07.balance.h, rack: GEO07.rack.h, bottle: 12, jar: 6, beaker: GEO07.beaker50.h, flask: GEO07.flask100.h, cylinder10: GEO07.cylinder10.h, waste: GEO07.waste.h,
  detector: GEO07.detector.h, meter: GEO07.meter.h, washBottle: GEO07.washBottle.h, vial: GEO07.vial.h, tile: GEO07.tile.h, watchGlass: GEO07.watchGlass.h,
};
const FOOT: Partial<Record<P07ObjKind, number>> = {
  balance: 12, rack: 12, bottle: 3, jar: 2.4, beaker: 2.4, flask: 3.4, cylinder10: 2.3, waste: 4.5, detector: 6, meter: 9, washBottle: 3.6, vial: 1.9, tile: 4.5,
  watchGlass: 3.6, ppeBoard: 8,
};
const TILT_SPEED = 40;
const TILT_RETURN = 120;
const WASH_DROP_ML = 0.05;

export class BondingController {
  view: ViewAdapter07 | null = null;
  held: Held07 | null = null;
  hovered: string | null = null;
  /** Receptor bajo lo que se sostiene (para la vista y el panel). */
  dockTarget: string | null = null;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private primaryShift = false;
  private secondary = false;
  private shaking = false;
  private now = 0;
  private dropTimer = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();
  private lastContacts = '';
  private lastProbe = '';

  constructor(private host: BondingHost, private lab: BondingLab3D) {}

  private get w(): P07World {
    return this.host.runtime.world;
  }

  private dispatch(c: P07Command) {
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
    if (!r.ok && r.code) this.warn(`p7.cmd.${r.code}`, 2);
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

  /** Botones de los instrumentos (encender, tara, rango, lectura). */
  private instrumentPart(id: string, part: string): boolean {
    const w = this.w;
    if (id === 'balance01') {
      if (part === 'power') this.run(this.dispatch({ type: 'powerBalance', on: !w.balance.powered }));
      else if (part === 'tare') this.tare();
      else if (part === 'display') this.readBalance();
      else return false;
    } else if (id === 'det01') {
      if (part === 'power') this.run(this.dispatch({ type: 'powerDetector', on: !w.detector.powered }));
      else if (part === 'range') this.dispatch({ type: 'setDetectorRange', range: w.detector.range === 'LOW' ? 'HIGH' : 'LOW' });
      else if (part === 'display') this.readDetector();
      else if (part === 'cable') this.dispatch({ type: 'setDetectorCables', connected: !w.detector.cablesOk });
      else return false;
    } else if (id === 'cond01') {
      if (part === 'power') this.run(this.dispatch({ type: 'powerMeter', on: !w.meter.powered }));
      else if (part === 'range') this.dispatch({ type: 'setMeterRange', range: w.meter.range === 'LOW' ? 'MID' : w.meter.range === 'MID' ? 'HIGH' : 'LOW' });
      else if (part === 'display') this.readConductivity();
      else if (part === 'cal') this.calibrate();
      else return false;
    } else if (w.vessels[id] && part === 'cap') {
      this.dispatch({ type: 'setCap', vesselId: id, capped: !w.vessels[id].capped });
    } else return false;
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
    const h = this.held;
    if (!h) return false;
    this.nudgeHeight((dy > 0 ? -1 : 1) * 0.6);
    return true;
  }

  /** Clic derecho / U mantenido: entregar con el gotero; en otro objeto, igual que P. */
  secondaryDown() {
    const h = this.held;
    if (!h || this.secondary) return;
    this.secondary = true;
    if (h.kind === 'dropper') this.run(this.dispatch({ type: 'setDropper', dropperId: h.id, squeeze01: 1 }));
    else this.primaryDown();
  }

  secondaryUp() {
    if (!this.secondary) return;
    this.secondary = false;
    const h = this.held;
    if (h?.kind === 'dropper') this.dispatch({ type: 'setDropper', dropperId: h.id, squeeze01: 0 });
    else this.primaryUp();
  }

  /** P, clic mantenido o el botón de acción: lo principal de lo que se tiene en la mano. */
  primaryDown(shift = false) {
    const h = this.held;
    if (!h || this.primary || this.blocked()) return;
    this.primary = true;
    this.primaryShift = shift;
    const o = this.obj(h.id)!;
    switch (h.kind) {
      case 'dropper':
        this.run(this.dispatch({ type: 'setDropper', dropperId: h.id, squeeze01: -1 }));
        if (!this.w.vessels[o.support]) this.hintOnce('p7.hint.dipFirst', 'warn');
        break;
      case 'spatula':
        this.spatulaAction();
        this.primary = false;
        break;
      case 'stirRod':
        if (this.w.vessels[o.support]) this.run(this.dispatch({ type: 'setStir', vesselId: o.support, motion01: shift ? 1 : 0.6 }));
        else this.hintOnce('p7.hint.stirInside', 'warn');
        break;
      case 'washBottle':
        this.squeeze(shift ? 2 : WASH_DROP_ML);
        this.dropTimer = 0;
        break;
      case 'probe':
        if (!this.w.meter.vesselId) this.rinseProbe();
        this.primary = false;
        break;
      default:
        if (!isPourable(this.w, h.id)) this.hintOnce('p7.hint.nothingToDo');
    }
  }

  primaryUp() {
    if (!this.primary) return;
    this.primary = false;
    const h = this.held;
    if (h?.kind === 'dropper') this.dispatch({ type: 'setDropper', dropperId: h.id, squeeze01: 0 });
    if (h?.kind === 'stirRod') {
      const o = this.obj(h.id);
      if (o && this.w.vessels[o.support]) this.dispatch({ type: 'setStir', vesselId: o.support, motion01: 0 });
    }
  }

  /** Sacudir el tubo (o recipiente) que se tiene en la mano. */
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

  /** Espátula: cargar dentro de un frasco con sólido; descargar sobre otro recipiente o la mesada. */
  spatulaAction() {
    const o = this.obj('spatula');
    if (!o) return;
    const sup = o.support;
    const w = this.w;
    const load = Object.values(w.spatula.load).reduce((s, g) => s + (g ?? 0), 0);
    if (w.vessels[sup] && Object.keys(w.vessels[sup].solid).length && load < 0.6 && (w.objects[sup]?.kind === 'jar' || w.objects[sup]?.kind === 'watchGlass')) {
      const r = this.run(this.dispatch({ type: 'scoop', sourceId: sup }));
      if (r.ok) this.host.sound('click');
      return;
    }
    if (load <= 0) {
      this.hintOnce('p7.hint.spatulaEmpty');
      return;
    }
    const target = w.vessels[sup] ? sup : this.pourTargetAt('spatula', o.pose.x, o.pose.y, o.pose.z + 4) ?? 'bench';
    const r = this.run(this.dispatch({ type: 'dropSpatula', targetId: target }));
    if (r.ok) this.host.sound('drip');
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const step = shift ? 5 : 1;
    const k = key.toLowerCase();
    if (k === 'r') return this.readBalance(), true;
    if (k === 'z') return this.tare(), true;
    if (k === 'k') return this.readConductivity(), true;
    if (k === 'd') return this.readDetector(), true;
    if (k === 'n') {
      const sel = this.host.getSelected();
      if (sel && this.w.vessels[sel]) this.observe(sel);
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
    const keep = DIP_KINDS.has(o.kind) && (this.w.vessels[o.support] || this.w.specimens[o.support]);
    const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: keep ? o.support : 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    const z0 = Math.max(o.pose.z + 2, CARRY_Z[o.kind] ?? o.pose.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support }, tilt: 0, pourTarget: null };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'tube' || o.kind === 'beaker' || o.kind === 'flask' || o.kind === 'bottle' || o.kind === 'cylinder10' ? 'clink' : 'click');
    if (this.w.vessels[id]?.capped) this.hintOnce('p7.hint.capped', 'warn');
    if (isPourable(this.w, id)) this.hintOnce('p7.hint.pour');
    if (o.kind === 'dropper') this.hintOnce('p7.hint.dropper');
    if (o.kind === 'spatula') this.hintOnce('p7.hint.spatula');
    if (o.kind === 'washBottle') this.hintOnce('p7.hint.wash');
    if (o.kind === 'tip') this.hintOnce('p7.hint.tips');
    if (o.kind === 'probe') this.hintOnce('p7.hint.probe');
    if (o.kind === 'tube') this.hintOnce('p7.hint.shake');
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

  /** Destino al soltar según lo que haya cerca. */
  place(id: string, kind: P07ObjKind, p: Pose) {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    // Tubo en un sitio libre de una gradilla.
    if (kind === 'tube') {
      for (const rack of ['rackB', 'rackE']) {
        if (!w.objects[rack]) continue;
        for (let i = 0; i < GEO07.rack.slots; i++) {
          const s = rackSlot(w, rack, i);
          const busy = Object.values(w.objects).some((o) => o.id !== id && o.support === `${rack}:${i}`);
          if (!busy && near(s, 1.4)) {
            this.sendPose(id, { x: s.x, y: s.y, z: s.z, rotationRad: 0 }, `${rack}:${i}`);
            this.host.sound('glass');
            return;
          }
        }
      }
    }
    if (PAN_KINDS.has(kind) && near(PAN_POS, 7)) {
      const r = this.sendPose(id, { x: PAN_POS.x, y: PAN_POS.y, z: PAN_POS.z, rotationRad: 0 }, 'pan');
      if (r.ok) {
        this.host.sound('clink');
        this.hintOnce('p7.hint.waitStable');
        return;
      }
      this.run(r);
    }
    if (kind === 'probe') {
      const ph = probeHolder(w);
      if (near(ph, 4)) {
        this.sendPose(id, { x: ph.x, y: ph.y, z: 0, rotationRad: 0 }, 'cond01');
        this.syncProbe();
        return;
      }
    }
    if (DIP_KINDS.has(kind)) {
      // Herramienta soltada dentro de un recipiente: queda apoyada donde está (la punta adentro).
      const t = this.dipTarget(p.x, p.y, id);
      if (t && kind !== 'tip') {
        const lv = levelsZ(w, w.vessels[t]);
        const z = kind === 'probe' ? Math.max(lv.floor + 0.3, p.z) : Math.max(lv.floor + 0.2, p.z);
        this.sendPose(id, { x: w.objects[t].pose.x, y: w.objects[t].pose.y, z, rotationRad: 0 }, t);
        if (kind === 'probe') this.syncProbe();
        this.host.sound('glass');
        return;
      }
      if (kind === 'tip') {
        const pad = detectorPad(w);
        if (near(pad, pad.r + 0.6)) {
          this.sendPose(id, { x: p.x, y: p.y, z: pad.z, rotationRad: 0 }, 'det01');
          this.syncContacts();
          this.host.sound('click');
          return;
        }
        const sp = this.specimenAt(p.x, p.y);
        if (sp) {
          const top = specimenTop(w, sp)!;
          this.sendPose(id, { x: p.x, y: p.y, z: top.z, rotationRad: 0 }, sp);
          this.syncContacts();
          this.host.sound('metal');
          return;
        }
        if (t) {
          // Las puntas en un líquido: mal uso (el dominio lo registra).
          this.sendPose(id, { x: w.objects[t].pose.x, y: w.objects[t].pose.y, z: levelsZ(w, w.vessels[t]).floor + 0.5, rotationRad: 0 }, t);
          this.syncContacts();
          return;
        }
      }
    }
    if (kind === 'specimen') {
      const tile = Object.values(w.objects).find((o) => o.kind === 'tile' && near(o.pose, 5) && !Object.values(w.objects).some((x) => x.id !== id && x.support === o.id));
      if (tile) {
        this.sendPose(id, { x: tile.pose.x, y: tile.pose.y, z: GEO07.tile.h, rotationRad: 0 }, tile.id);
        this.host.sound('click');
        return;
      }
    }
    const lying = kind === 'dropper' || kind === 'spatula' || kind === 'stirRod' || kind === 'tip' || kind === 'probe';
    this.layOnBench(id, p.x, p.y, lying ? 0.5 : 0);
    if (kind === 'tip') this.syncContacts();
    if (kind === 'probe') this.syncProbe();
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
    if (h.kind === 'tip') this.syncContacts();
    if (h.kind === 'probe') this.syncProbe();
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
    const r = FOOT[o?.kind ?? 'tip'] ?? 1;
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

  /** Receptor bajo el pico de lo que se sostiene (la boca más alta gana). Sobre el equipo eléctrico, 'electrics'. */
  pourTargetAt(id: string, x: number, y: number, z: number): string | null {
    let best: string | null = null;
    let bz = -1e9;
    let bd = 1e9;
    for (const t of Object.keys(this.w.vessels)) {
      if (t === id || this.w.objects[t]?.support === 'hand') continue;
      const m = mouthOf(this.w, t);
      if (!m) continue;
      const d = Math.hypot(x - m.x, y - m.y);
      const reach = m.r + 1.5;
      if (d >= reach || z <= m.z - 3) continue;
      if (m.z > bz + 0.5 || (Math.abs(m.z - bz) <= 0.5 && d < bd)) {
        bz = m.z;
        bd = d;
        best = t;
      }
    }
    if (best) return best;
    const overDet = Math.abs(x - DETECTOR_POS.x) < GEO07.detector.w / 2 + 1 && Math.abs(y - DETECTOR_POS.y) < GEO07.detector.d / 2 + 1;
    const overMeter = Math.abs(x - METER_POS.x) < GEO07.meter.w / 2 + 1 && Math.abs(y - METER_POS.y) < GEO07.meter.d / 2 + 1;
    return overDet || overMeter ? 'electrics' : null;
  }

  private pourDock(h: Held07): { x: number; y: number; z: number } | null {
    if (!isPourable(this.w, h.id) || h.tilt <= 4 || !h.pourTarget || h.pourTarget === 'electrics') return null;
    const m = mouthOf(this.w, h.pourTarget);
    const lip = POUR_LIP07[this.w.vessels[h.id].shape];
    return m && lip ? pourDockPose(lip, (h.tilt * Math.PI) / 180, m, h) : null;
  }

  private updatePour(h: Held07, dt: number) {
    const o = this.obj(h.id)!;
    const target = this.pourDock(h) ? h.pourTarget : this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
    this.dockTarget = target;
    h.tilt = this.primary ? Math.min(140, h.tilt + TILT_SPEED * dt) : Math.max(0, h.tilt - TILT_RETURN * dt);
    if (h.tilt > 4) {
      if (!this.w.pours[h.id] && this.w.vessels[h.id]?.capped) {
        this.hintOnce('p7.hint.capped', 'warn');
        h.tilt = 0;
        return;
      }
      h.pourTarget = target;
      const r = this.run(this.dispatch({ type: 'setPour', sourceId: h.id, targetId: target, tiltDeg: h.tilt }));
      if (!r.ok) h.tilt = 0;
    } else if (this.w.pours[h.id]) this.endPour(h);
  }

  private endPour(h: Held07) {
    if (this.w.pours[h.id]) {
      this.dispatch({ type: 'stopPour', sourceId: h.id });
      this.host.sound('drip');
    }
    h.tilt = 0;
    h.pourTarget = null;
  }

  squeeze(ml: number) {
    const h = this.held;
    if (!h || h.kind !== 'washBottle') return;
    const o = this.obj(h.id)!;
    const target = this.pourTargetAt('washBottle', o.pose.x + 2.5, o.pose.y, o.pose.z + 6) ?? '';
    this.dispatch({ type: 'squeezeWash', targetId: target === 'electrics' ? '' : target, ml });
    this.host.sound('drip');
  }

  rinseProbe() {
    const o = this.obj('probe01');
    if (!o) return;
    const over = this.pourTargetAt('probe01', o.pose.x, o.pose.y, o.pose.z + 2);
    const waste = over && over.startsWith('waste') ? over : 'wasteAq';
    const r = this.run(this.dispatch({ type: 'rinseProbe', wasteId: waste }));
    if (r.ok) this.host.sound('drip');
  }

  // ─────────────── Puntas y sonda: hechos geométricos ───────────────

  private specimenAt(x: number, y: number): string | null {
    for (const id of Object.keys(this.w.specimens)) {
      const t = specimenTop(this.w, id);
      if (t && Math.abs(x - t.x) <= t.halfL && Math.abs(y - t.y) <= t.halfW) return id;
    }
    return null;
  }

  /** Contacto de una punta: sobre qué está, en qué punto y a qué distancia de la superficie. */
  private tipHit(id: 'tipA' | 'tipB'): SurfaceHit | null {
    const w = this.w;
    const o = w.objects[id];
    if (!o) return null;
    const other = w.objects[id === 'tipA' ? 'tipB' : 'tipA'];
    if (other && Math.hypot(o.pose.x - other.pose.x, o.pose.y - other.pose.y, o.pose.z - other.pose.z) < 0.25 && o.support !== 'bench') return { targetId: id === 'tipA' ? 'tipB' : 'tipA', u: 0, v: 0, gapCm: 0, force01: 0.5 };
    if (o.support === 'det01') return { targetId: 'det01pad', u: o.pose.x, v: o.pose.y, gapCm: 0, force01: 0.5 };
    if (w.vessels[o.support]) return { targetId: o.support, u: 0, v: 0, gapCm: 0, force01: 0.5 };
    const sp = w.specimens[o.support] ? o.support : this.specimenAt(o.pose.x, o.pose.y);
    if (!sp) return null;
    const top = specimenTop(w, sp)!;
    const gap = Math.max(0, o.pose.z - top.z);
    if (gap > 3) return null;
    const pressed = o.support === sp ? 0.5 : 0.3;
    return { targetId: sp, u: o.pose.x - (top.x - top.halfL), v: o.pose.y - top.y, gapCm: Math.round(gap * 1000) / 1000, force01: pressed };
  }

  syncContacts() {
    const a = this.tipHit('tipA');
    const b = this.tipHit('tipB');
    const key = JSON.stringify([a, b]);
    if (key === this.lastContacts) return;
    this.lastContacts = key;
    this.dispatch({ type: 'setElectrodeContacts', a, b });
  }

  /** Inmersión de la sonda (cm) y contacto con el fondo, desde su altura real en el recipiente. */
  syncProbe() {
    const w = this.w;
    const o = w.objects.probe01;
    if (!o) return;
    let vessel: string | null = null;
    let imm = 0;
    let bottom = false;
    const v = w.vessels[o.support];
    if (v) {
      const lv = levelsZ(w, v);
      imm = Math.max(0, lv.surface - o.pose.z);
      bottom = o.pose.z <= lv.floor + 0.05;
      vessel = imm > 0 ? o.support : null;
    }
    const key = `${vessel}|${imm.toFixed(2)}|${bottom}`;
    if (key === this.lastProbe) return;
    this.lastProbe = key;
    this.dispatch({ type: 'setProbeDepth', vesselId: vessel, immersionCm: Math.round(imm * 100) / 100, bottomContact: bottom });
  }

  // ─────────────── Lecturas ───────────────

  readVolume(id: string) {
    const w = this.w;
    const v = w.vessels[id];
    const d = w.droppers[id];
    if (!v && !d) return { ok: false };
    const o = w.objects[id];
    const z = v ? levelsZ(w, v).surface : (o?.pose.z ?? 0) + 4;
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - z : 20;
    const r = this.run(this.dispatch({ type: 'readVolume', vesselId: id, eyeDzCm: eyeDz }));
    if (Math.abs(eyeDz) > 1) this.hintOnce('p7.hint.eyeLevel', 'warn');
    this.host.sound('click');
    return r;
  }

  observe(id: string) {
    const r = this.run(this.dispatch({ type: 'observe', vesselId: id }));
    if (r.ok) this.host.sound('click');
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

  readDetector() {
    const r = this.run(this.dispatch({ type: 'readDetector' }));
    this.host.sound('click');
    return r;
  }

  readConductivity() {
    const r = this.run(this.dispatch({ type: 'readConductivity' }));
    this.host.sound('click');
    return r;
  }

  calibrate() {
    const v = this.w.meter.vesselId;
    const r = this.run(this.dispatch({ type: 'calibrateConductivity', standardId: v ?? '' }));
    this.host.sound('click');
    return r;
  }

  /** Traslado accesible (panel): lleva un objeto a un destino como si se soltara allí. */
  moveTo(id: string, where: 'pan' | 'bench' | string, z?: number) {
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
      this.layOnBench(id, o.pose.x, Math.max(8, o.pose.y - (o.support === 'pan' ? 16 : 6)), DIP_KINDS.has(o.kind) ? 0.5 : 0);
      if (o.kind === 'tip') this.syncContacts();
      if (o.kind === 'probe') this.syncProbe();
      return { ok: true };
    }
    if (where === 'pan') {
      this.place(id, o.kind, { x: PAN_POS.x, y: PAN_POS.y, z: o.pose.z, rotationRad: 0 });
      return { ok: true };
    }
    // Dentro de un recipiente (herramientas) a una profundidad dada, o sobre una muestra (puntas).
    const t = w.objects[where];
    if (!t) return { ok: false };
    if (w.vessels[where] && DIP_KINDS.has(o.kind)) {
      const lv = levelsZ(w, w.vessels[where]);
      const zz = z ?? (o.kind === 'probe' ? Math.max(lv.floor + 0.4, lv.surface - 2) : lv.floor + 0.3);
      this.sendPose(id, { x: t.pose.x, y: t.pose.y, z: zz, rotationRad: 0 }, where);
      if (o.kind === 'probe') this.syncProbe();
      if (o.kind === 'tip') this.syncContacts();
      return { ok: true };
    }
    if (w.specimens[where] && o.kind === 'tip') {
      const top = specimenTop(w, where)!;
      const dx = id === 'tipA' ? -top.halfL * 0.6 : top.halfL * 0.6;
      this.sendPose(id, { x: top.x + dx, y: top.y, z: top.z, rotationRad: 0 }, where);
      this.syncContacts();
      return { ok: true };
    }
    if (where === 'det01' && o.kind === 'tip') {
      const pad = detectorPad(w);
      this.sendPose(id, { x: pad.x + (id === 'tipA' ? -0.6 : 0.6), y: pad.y, z: pad.z, rotationRad: 0 }, 'det01');
      this.syncContacts();
      return { ok: true };
    }
    this.place(id, o.kind, { x: t.pose.x, y: t.pose.y, z: o.pose.z, rotationRad: 0 });
    return { ok: true };
  }

  /** Vertido accesible (panel): de `src` a `target` con una inclinación suave mientras se mantiene el botón. */
  pourDirect(src: string, target: string | null, strong = false) {
    const v = this.w.vessels[src];
    if (!v) return { ok: false };
    const fill = Math.min(1, vesselMl(v) / Math.max(1, v.capacityMl));
    const tilt0 = 100 - 88 * fill;
    return this.run(this.dispatch({ type: 'setPour', sourceId: src, targetId: target, tiltDeg: tilt0 + (strong ? 16 : 5) }));
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
      // Herramientas: sobre un recipiente pueden bajar dentro; las puntas, apoyarse en una muestra.
      const dipping = DIP_KINDS.has(h.kind) ? this.dipTarget(tx, ty, h.id) : null;
      let floor = this.clearZ(tx, ty, FOOT[h.kind] ?? 0.6, h.id) + 0.3;
      if (dipping) floor = levelsZ(this.w, this.w.vessels[dipping]).floor + (h.kind === 'probe' ? 0 : 0.2);
      if (h.kind === 'tip') {
        const sp = this.specimenAt(tx, ty);
        if (sp) floor = specimenTop(this.w, sp)!.z;
        const pad = detectorPad(this.w);
        if (Math.hypot(tx - pad.x, ty - pad.y) < pad.r) floor = pad.z;
      }
      tz = Math.max(tz, floor);
      if (!dock && !dipping && h.kind !== 'tip') tz = Math.max(tz, this.bodyFloor(h.id, tx, ty));
      const k = Math.min(1, dt * (dock ? 8 : 16));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const rot = (h.tilt * Math.PI) / 180;
      // Soporte mientras se sostiene: la herramienta «está» en el recipiente si su punta queda bajo la boca.
      let support = 'hand';
      if (dipping) {
        const m = mouthOf(this.w, dipping)!;
        if (h.curZ < m.z - 0.5) support = dipping;
      }
      const moved = Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001;
      if (moved || support !== o.support) this.sendPose(h.id, { x: nx, y: ny, z: h.curZ, rotationRad: rot }, support);
      if (isPourable(this.w, h.id)) this.updatePour(h, dt);
      if (DIP_KINDS.has(h.kind)) this.dockTarget = support !== 'hand' ? support : dipping;
      if (h.kind === 'tip') this.syncContacts();
      if (h.kind === 'probe') this.syncProbe();
      if (h.kind === 'washBottle') {
        this.dockTarget = this.pourTargetAt('washBottle', o.pose.x + 2.5, o.pose.y, o.pose.z + 6);
        if (this.primary) {
          this.dropTimer += dt;
          if (this.dropTimer > 0.25) {
            this.dropTimer = 0;
            this.squeeze(this.primaryShift ? 2 : WASH_DROP_ML);
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

  private dipTarget(x: number, y: number, exclude: string): string | null {
    for (const t of Object.keys(this.w.vessels)) {
      if (t === exclude || this.w.objects[t]?.support === 'hand') continue;
      const m = mouthOf(this.w, t);
      if (m && Math.hypot(x - m.x, y - m.y) < Math.max(0.8, m.r - 0.1)) return t;
    }
    return null;
  }
}
