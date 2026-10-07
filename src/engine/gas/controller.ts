/**
 * Interacción de la Práctica 10: gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js.
 * - Arrastre con altura de transporte (pasa por encima de lo que hay debajo); al soltar, el objeto se coloca en el
 *   soporte cercano que corresponda (platillo con las puertas abiertas, embudo en el balón, pipeta en el balón o el
 *   Erlenmeyer, tapón en el Erlenmeyer, tubo en U en la bureta, termómetro y regla en el baño, jeringa en el sensor).
 * - Vertido (§7.2): un recipiente sobre la boca de otro y P (o clic derecho) mantenido lo inclina poco a poco; el
 *   caudal lo decide el dominio. Sin receptor debajo, se derrama.
 * - Piseta: P = una gota (mantener = gotas seguidas; Mayús = chorro de 10) para enrasar o lavar.
 * - Espátula: imán al frasco (P carga) y al vidrio de reloj (P deja caer; Mayús = todo).
 * - Bureta: llena, se lleva sobre el baño; P la invierte con la boca bajo el agua (soltarla sin P = boca en el aire).
 *   La llave se abre mientras se mantiene presionada (aforo a 50,0 mL).
 * - Erlenmeyer sostenido: moverlo en círculos lo agita (la intensidad sale de la rapidez del giro).
 * - Jeringa: arrastrar el émbolo lo lleva a una marca y la mano lo sostiene; al soltar, la presión puede moverlo.
 * - Lecturas (V, T, H, B, R): con la cámara a la altura del ojo no hay paralaje (doble clic sobre el instrumento).
 */
import type { GasHost } from './host';
import type { GasLab3D } from './GasLab3D';
import type { P10Command } from '../../simulation/gas-world/commands';
import type { P10ObjKind, P10World, Pose } from '../../simulation/gas-world/types';
import { ABALANCE_PAN } from '../../practices/practice-10/definition';
import { VIS, buretteInBathXY, buretteZ, cylinderLevelZ, erlenMouth, flaskLevelZ, pipetteLevelZ, sensorPort } from './layout';

export interface PickHit10 {
  id: string;
  part?: string;
}

export interface ViewAdapter10 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHit10 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

interface Magnet {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface Held10 {
  id: string;
  kind: P10ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  magnet: Magnet | null;
  tilt: number;
  pourTarget: string | null;
}

/** Recipientes que se vierten inclinándolos. */
export const POURABLE = new Set(['water_bottle', 'tap_jug', 'vinegar_bottle', 'beaker150', 'cylinder', 'erlenmeyer', 'flask']);
const CARRY_Z: Partial<Record<P10ObjKind, number>> = {
  watchGlass: 10, spatula: 14, beaker150: 4, funnel: 22, flask: 4, pipette: 22, propipette: 10, washBottle: 6, waterBottle: 4, vinegarBottle: 4, cylinder: 4,
  erlenmeyer: 4, stopper: 18, burette: 18, uTube: 18, thermometer: 16, ruler: 14, syringe: 6,
};
const TOP: Partial<Record<P10ObjKind, number>> = {
  abalance: 22, bicarbJar: 9, beaker150: 8.6, flask: 16, washBottle: 16, waterBottle: 25, vinegarBottle: 20, cylinder: 19, erlenmeyer: 14.5, beaker600: 13, stand: 4,
  sensor: 8, datalogger: 6, sink: 10,
};
const FOOT: Partial<Record<P10ObjKind, number>> = {
  abalance: 12, bicarbJar: 3.4, beaker150: 3, flask: 3.2, washBottle: 3.4, waterBottle: 5, vinegarBottle: 3.8, cylinder: 2.6, erlenmeyer: 4.4, beaker600: 4.6, stand: 7,
  sensor: 4, datalogger: 6, sink: 12,
};
/** Radio de la boca de cada receptor (para el acople del vertido). */
const MOUTH_R: Record<string, number> = { beaker150: 2.8, funnel: 2.6, flask: 0.7, cylinder: 1.0, erlenmeyer: 1.4, beaker600: 4.3, waste: 4.3, sink: 12 };
const SPOON_DX = 8.4;
const TILT_SPEED = 40;
const TILT_RETURN = 120;

export class GasController {
  view: ViewAdapter10 | null = null;
  held: Held10 | null = null;
  hovered: string | null = null;
  /** Receptor bajo lo que se sostiene (para la vista y el panel). */
  dockTarget: string | null = null;
  private stopcock = false;
  private plunger: { active: boolean } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private primaryShift = false;
  private now = 0;
  private dropTimer = 0;
  private swirl = { prevAng: null as number | null, omega: 0, t: 0 };
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: GasHost, private lab: GasLab3D) {}

  private get w(): P10World {
    return this.host.runtime.world;
  }

  private dispatch(c: P10Command) {
    return this.host.runtime.dispatch(c);
  }

  private blocked(): boolean {
    return !!this.w.safety.block || this.w.safety.stoppedByTeacher;
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
    if (!r.ok && r.code) this.warn(`p10.cmd.${r.code}`, 2);
    return r;
  }

  // ─────────────── Geometría ───────────────

  panPoint() {
    return { ...ABALANCE_PAN };
  }

  /** Boca (z) y centro de un receptor. */
  mouthOf(id: string): { x: number; y: number; z: number; r: number } | null {
    const o = this.w.objects[id];
    if (!o) return null;
    const p = o.pose;
    const r = MOUTH_R[id] ?? 2;
    switch (id) {
      case 'beaker150':
        return { x: p.x, y: p.y, z: p.z + VIS.beaker150.h, r };
      case 'flask':
        return { x: p.x, y: p.y, z: p.z + VIS.flask.neckZ1, r };
      case 'funnel':
        return o.support === 'funnel:flask' ? { x: p.x, y: p.y, z: p.z + 7, r } : null;
      case 'cylinder':
        return { x: p.x, y: p.y, z: p.z + VIS.cylinder.h + VIS.cylinder.floor, r };
      case 'erlenmeyer':
        return { x: p.x, y: p.y, z: p.z + VIS.erlen.mouthZ, r };
      case 'beaker600':
      case 'waste':
        return { x: p.x, y: p.y, z: p.z + VIS.beaker600.h, r };
      case 'sink':
        return { x: p.x, y: p.y, z: 10, r };
      default:
        return null;
    }
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
    if (hit.id === 'abalance' && hit.part) {
      if (hit.part === 'doors') this.toggleDoors();
      else if (hit.part === 'tare') this.tare();
      else if (hit.part === 'level') this.run(this.dispatch({ type: 'levelBalance' }));
      else if (hit.part === 'display') this.readBalance();
      this.host.sound('click');
      return true;
    }
    if (hit.id === 'burette' && hit.part === 'stopcock' && this.w.burette.inverted && !this.held) {
      this.stopcock = true;
      this.run(this.dispatch({ type: 'setStopcock', open: true }));
      this.view.setOrbitEnabled(false);
      this.hintOnce('p10.hint.stopcock');
      return true;
    }
    if (hit.id === 'stand' && hit.part === 'clamp' && this.w.burette.inverted && !this.w.burette.clamped) {
      this.clampBurette();
      return true;
    }
    if (hit.id === 'syringe' && hit.part === 'plunger' && !this.held) {
      this.plunger = { active: true };
      this.view.setOrbitEnabled(false);
      this.dragPlunger(sx, sy);
      this.hintOnce('p10.hint.plunger');
      return true;
    }
    if (hit.id === 'thermometer' && hit.part === 'display' && !this.held) {
      this.readThermometer();
      return true;
    }
    if (hit.id === 'barometer') {
      this.readBarometer();
      return true;
    }
    if (hit.id === 'datalogger' && !this.held) return true;
    if (this.held && this.held.id === hit.id) return true;
    this.down = true;
    return this.beginDrag(hit.id, false);
  }

  onPointerMove(sx: number, sy: number) {
    this.pointer = { x: sx, y: sy };
    if (this.plunger) {
      this.dragPlunger(sx, sy);
      return;
    }
    if (this.stopcock) return;
    if (!this.held && this.view) this.hovered = this.view.pick(sx, sy, null)?.id ?? null;
  }

  onPointerUp() {
    if (this.stopcock) {
      this.stopcock = false;
      this.run(this.dispatch({ type: 'setStopcock', open: false }));
      this.view?.setOrbitEnabled(true);
      return;
    }
    if (this.plunger) {
      this.plunger = null;
      const s = this.w.syringe;
      this.dispatch({ type: 'setPlunger', targetMl: s.markMl, held: false });
      this.view?.setOrbitEnabled(true);
      return;
    }
    if (this.held && this.down && !this.held.keyboard) this.release();
    this.down = false;
  }

  /** Arrastre del émbolo: la marca sale de la proyección del puntero sobre el eje de la jeringa. */
  private dragPlunger(sx: number, sy: number) {
    if (!this.view) return;
    const o = this.w.objects.syringe.pose;
    const p = this.view.toBench(sx, sy, o.z);
    const A = this.w.params.syringeAreaCm2;
    const mark = Math.max(0, Math.min(this.w.params.syringeMl + 1.2, (o.x - p.x - 1.0) * A));
    this.dispatch({ type: 'setPlunger', targetMl: mark, held: true });
  }

  /** Mantener el émbolo en una marca (panel accesible). */
  setPlunger(ml: number, held = true) {
    this.dispatch({ type: 'setPlunger', targetMl: ml, held });
  }

  onWheel(dy: number): boolean {
    const dir = dy > 0 ? -1 : 1;
    const h = this.held;
    if (h) {
      this.nudgeHeight(dir * 0.6);
      return true;
    }
    if (this.pointer && this.view) {
      const hit = this.view.pick(this.pointer.x, this.pointer.y, null);
      if (!hit) return false;
      if (hit.id === 'syringe') {
        const s = this.w.syringe;
        this.dispatch({ type: 'setPlunger', targetMl: s.targetMl - dir * 0.1, held: true });
        return true;
      }
      if (hit.id === 'burette' && this.w.burette.inverted) {
        this.run(this.dispatch({ type: 'setBuretteDepth', mouthAboveFloorCm: this.w.burette.mouthAboveFloorCm + dir * 0.2 }));
        return true;
      }
    }
    return false;
  }

  secondaryDown() {
    this.primaryDown();
  }
  secondaryUp() {
    this.primaryUp();
  }

  /** P, clic derecho o el botón de acción: acción principal de lo que se tiene en la mano. */
  primaryDown(shift = false) {
    const h = this.held;
    if (!h || this.primary || this.blocked()) return;
    this.primary = true;
    this.primaryShift = shift;
    switch (h.kind) {
      case 'washBottle':
        this.squeeze(shift ? 10 : 1);
        this.dropTimer = 0;
        break;
      case 'spatula':
        this.spatulaAction(shift);
        break;
      case 'burette':
        this.invertHere(true);
        break;
      case 'flask':
        if (this.w.flask.stoppered) {
          this.invertFlask();
          this.primary = false;
        }
        break;
      default:
        if (!POURABLE.has(h.id)) this.hintOnce('p10.hint.nothingToDo');
    }
  }

  primaryUp() {
    this.primary = false;
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const step = shift ? 5 : 1;
    const k = key.toLowerCase();
    if (k === 'r') return this.readBalance(), true;
    if (k === 't') return this.readThermometer(), true;
    if (k === 'b') return this.readBarometer(), true;
    if (k === 'd') return this.toggleDoors(), true;
    if (k === 'z') return this.tare(), true;
    if (k === 'h') return this.measureHeight(), true;
    if (k === 'v') {
      const sel = this.host.getSelected();
      const inst = sel === 'cylinder' || sel === 'flask' || sel === 'pipette' ? sel : 'burette';
      this.readVolume(inst);
      return true;
    }
    const h = this.held;
    if (h) {
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      if (k === 'p') return this.primaryDown(shift), true;
      if (k === 'q' || key === 'PageUp') return this.onWheel(-1), true;
      if (k === 'e' || key === 'PageDown') return this.onWheel(1), true;
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
    if (key === 'p' || key === 'P') {
      this.primaryUp();
      return true;
    }
    return false;
  }

  // ─────────────── Tomar y soltar ───────────────

  beginDrag(id: string, keyboard: boolean): boolean {
    const o = this.obj(id);
    if (!o || !o.movable || this.blocked()) return false;
    // La bureta sujeta en la prensa no se arrastra (primero se suelta desde el panel).
    if (id === 'burette' && this.w.burette.clamped) {
      this.hintOnce('p10.hint.buretteClamped');
      return false;
    }
    if (this.held) this.release();
    if (o.support === 'pan' && !this.w.balance.doorsOpen) {
      this.warn('p10.hint.openDoors', 2);
      return false;
    }
    const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: 'hand' });
    if (!r.ok) return !!this.run(r) && false;
    const z0 = Math.max(o.pose.z + 2, CARRY_Z[o.kind] ?? o.pose.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support }, magnet: null, tilt: 0, pourTarget: null };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'burette' || o.kind === 'cylinder' || o.kind === 'flask' || o.kind === 'erlenmeyer' ? 'clink' : 'click');
    if (POURABLE.has(id)) this.hintOnce('p10.hint.pour');
    if (o.kind === 'washBottle') this.hintOnce('p10.hint.wash');
    if (o.kind === 'spatula') this.hintOnce('p10.hint.spatula');
    if (o.kind === 'burette' && !this.w.burette.inverted) this.hintOnce(this.w.burette.waterMl > 0 ? 'p10.hint.invert' : 'p10.hint.fillFirst');
    if (o.kind === 'erlenmeyer') this.hintOnce('p10.hint.swirl');
    return true;
  }

  private sendPose(id: string, pose: Pose, support?: string) {
    return this.dispatch({ type: 'setPose', id, pose, support });
  }

  release() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.endPour(h);
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const o = this.obj(h.id);
    if (!o) return;
    this.place(h.id, h.kind, o.pose, h.curZ);
  }

  /** Destino al soltar según lo que haya cerca. */
  place(id: string, kind: P10ObjKind, p: Pose, _z = p.z) {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    const pan = this.panPoint();
    if ((kind === 'watchGlass' || kind === 'beaker150') && near(pan, 6)) {
      const r = this.sendPose(id, { x: pan.x, y: pan.y, z: pan.z, rotationRad: 0 }, 'pan');
      if (r.ok) {
        this.host.sound('clink');
        this.hintOnce('p10.hint.closeDoors');
        return;
      }
      this.run(r);
    }
    if (kind === 'funnel') {
      const f = w.objects.flask.pose;
      if (near(f, 4)) {
        this.sendPose(id, { x: f.x, y: f.y, z: f.z + VIS.flask.neckZ1 - 1, rotationRad: 0 }, 'funnel:flask');
        this.host.sound('glass');
        return;
      }
    }
    if (kind === 'pipette') {
      const f = w.objects.flask.pose;
      const e = w.objects.erlenmeyer.pose;
      if (near(f, 4)) {
        this.sendPose(id, { x: f.x, y: f.y, z: f.z + 1.2, rotationRad: 0 }, 'flask');
        this.host.sound('glass');
        this.hintOnce('p10.hint.aspirate');
        return;
      }
      if (near(e, 5)) {
        this.sendPose(id, { x: e.x, y: e.y, z: e.z + 3, rotationRad: 0 }, 'erlenmeyer');
        this.host.sound('glass');
        return;
      }
    }
    if (kind === 'propipette') {
      const pip = w.objects.pipette.pose;
      if (near(pip, 5)) {
        this.sendPose(id, { x: pip.x, y: pip.y, z: pip.z + VIS.pipette.topZ, rotationRad: 0 }, 'pipette');
        this.dispatch({ type: 'attachPropipette', on: true });
        this.host.sound('click');
        return;
      }
      this.dispatch({ type: 'attachPropipette', on: false });
    }
    if (kind === 'stopper') {
      const m = erlenMouth(w);
      if (near(m, 4)) {
        this.sendPose(id, { x: m.x, y: m.y, z: m.z - 0.8, rotationRad: 0 }, 'erlenmeyer');
        const r = this.run(this.dispatch({ type: 'insertStopper', on: true }));
        if (r.ok) this.host.sound('click');
        return;
      }
    }
    if (kind === 'burette') {
      const xy = buretteInBathXY(w);
      if (near(xy, 7) && w.burette.waterMl > 0 && !w.burette.inverted) {
        // Soltarla sobre el baño sin tapar la boca: se invierte con la boca en el aire.
        this.invertHere(false);
        return;
      }
      this.sendPose(id, { x: Math.max(4, p.x), y: Math.max(6, p.y), z: 0.7, rotationRad: Math.PI / 2 }, 'bench');
      return;
    }
    if (kind === 'uTube') {
      const b = w.objects.beaker600.pose;
      if (near(b, 8)) {
        this.sendPose(id, { x: b.x - 2.4, y: b.y, z: VIS.beaker600.floor, rotationRad: 0 }, 'burette');
        this.host.sound('glass');
        return;
      }
    }
    if (kind === 'thermometer') {
      const b = w.objects.beaker600.pose;
      const e = w.objects.erlenmeyer.pose;
      if (near(b, 7)) {
        this.sendPose(id, { x: b.x + 2.6, y: b.y + 1.5, z: VIS.beaker600.floor + 1.5, rotationRad: 0 }, 'beaker600');
        this.host.sound('click');
        return;
      }
      if (near(e, 5) && !w.reactor.stoppered) {
        this.sendPose(id, { x: e.x + 0.5, y: e.y, z: e.z + 1, rotationRad: 0 }, 'erlenmeyer');
        this.host.sound('click');
        return;
      }
    }
    if (kind === 'ruler') {
      const b = w.objects.beaker600.pose;
      if (near(b, 9)) {
        this.sendPose(id, { x: b.x + 2.2, y: b.y - 2.8, z: 0, rotationRad: 0 }, 'beaker600');
        // Apoyada vertical junto a la bureta: alineada (se lee de frente, sin perspectiva).
        this.dispatch({ type: 'alignRuler', aligned: true });
        this.host.sound('click');
        this.hintOnce('p10.hint.ruler');
        return;
      }
      this.dispatch({ type: 'alignRuler', aligned: false });
    }
    if (kind === 'syringe') {
      const port = sensorPort(w);
      if (near(port, 9)) {
        this.sendPose(id, { x: port.x, y: port.y, z: port.z, rotationRad: 0 }, 'sensor');
        const r = this.run(this.dispatch({ type: 'connectSyringe', on: true }));
        if (r.ok) this.host.sound('click');
        return;
      }
    }
    const lying = kind === 'spatula' || kind === 'pipette' || kind === 'thermometer' || kind === 'ruler' || kind === 'uTube' || kind === 'propipette' || kind === 'stopper' || kind === 'funnel' || kind === 'syringe';
    this.layOnBench(id, p.x, p.y, lying ? (kind === 'syringe' ? 1.1 : 0.4) : 0);
  }

  cancel() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
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

  layOnBench(id: string, x0: number, y0: number, z: number) {
    const o = this.obj(id);
    const r = FOOT[o?.kind ?? 'spatula'] ?? 1;
    const spot = this.freeSpot(Math.max(-8, Math.min(600, x0)), Math.max(3, Math.min(60, y0)), r, id);
    this.sendPose(id, { x: spot.x, y: spot.y, z, rotationRad: o?.kind === 'burette' ? Math.PI / 2 : 0 }, 'bench');
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

  /** Receptor bajo el pico del recipiente sostenido (el embudo puesto manda sobre el balón). */
  pourTargetAt(id: string, x: number, y: number, z: number): string | null {
    let best: string | null = null;
    let bd = 1e9;
    for (const t of ['beaker150', 'funnel', 'flask', 'cylinder', 'erlenmeyer', 'beaker600', 'waste', 'sink']) {
      if (t === id) continue;
      const m = this.mouthOf(t);
      if (!m) continue;
      const d = Math.hypot(x - m.x, y - m.y);
      const reach = m.r + 3.5;
      if (d < reach && z > m.z - 3 && d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best === 'funnel') return 'flask';
    return best;
  }

  private updatePour(h: Held10, dt: number) {
    const o = this.obj(h.id)!;
    const target = this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
    this.dockTarget = target;
    h.tilt = this.primary ? Math.min(135, h.tilt + TILT_SPEED * dt) : Math.max(0, h.tilt - TILT_RETURN * dt);
    if (h.tilt > 4) {
      if (target === 'erlenmeyer' && this.w.reactor.stoppered) {
        this.warn('p10.hint.stoppered', 3);
        h.tilt = 0;
        return;
      }
      if (h.id === 'flask' && this.w.flask.stoppered) {
        h.tilt = 0;
        return;
      }
      h.pourTarget = target;
      this.dispatch({ type: 'setPour', sourceId: h.id, targetId: target, tiltDeg: h.tilt });
    } else if (this.w.pours[h.id]) this.endPour(h);
  }

  private endPour(h: Held10) {
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
    const target = this.pourTargetAt('wash', o.pose.x + 2.5, o.pose.y, o.pose.z + 12);
    this.dispatch({ type: 'squeeze', targetId: target, drops });
    this.host.sound('drip');
  }

  /** Lectura del volumen con la posición real del ojo (cámara) respecto del menisco. */
  readVolume(inst: 'burette' | 'cylinder' | 'flask' | 'pipette') {
    const w = this.w;
    const menZ = inst === 'burette' ? (w.burette.inverted ? buretteZ(w).meniscus : 0) : inst === 'cylinder' ? cylinderLevelZ(w) : inst === 'flask' ? flaskLevelZ(w) : pipetteLevelZ(w);
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - menZ : 20;
    const r = this.run(this.dispatch({ type: 'readVolume', instrument: inst, eyeDzCm: eyeDz }));
    if (!r.ok && r.code === 'PARALLAX') this.hintOnce('p10.hint.eyeLevel', 'warn');
    this.host.sound('click');
    return r;
  }

  /** Ajuste del menisco de la pipeta a la marca con la posición real del ojo. */
  adjustPipette() {
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - pipetteLevelZ(this.w) : 20;
    return this.run(this.dispatch({ type: 'adjustPipette', eyeDzCm: eyeDz }));
  }

  measureHeight() {
    const w = this.w;
    if (!w.burette.inverted) return this.run({ ok: false, code: 'NOT_INVERTED' });
    const z = buretteZ(w);
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - (z.meniscus + z.outer) / 2 : 20;
    const r = this.run(this.dispatch({ type: 'measureHeight', eyeDzCm: Math.abs(eyeDz) < 1.5 ? 0 : eyeDz }));
    this.host.sound('click');
    return r;
  }

  // ─────────────── Sólido ───────────────

  private spatulaMagnet(x: number, y: number): Magnet | null {
    const tipX = x + SPOON_DX;
    const jar = this.w.objects.bicarb_jar.pose;
    if (Math.hypot(tipX - jar.x, y - jar.y) < 4.5) return { id: 'jar', x: jar.x, y: jar.y, z: 9 };
    const g = this.w.objects.watch_glass;
    if (g.support !== 'hand' && Math.hypot(tipX - g.pose.x, y - g.pose.y) < 4) return { id: 'watch_glass', x: g.pose.x, y: g.pose.y, z: g.pose.z + 2 };
    const b = this.w.objects.beaker150;
    if (Math.hypot(tipX - b.pose.x, y - b.pose.y) < 3.5) return { id: 'beaker150', x: b.pose.x, y: b.pose.y, z: b.pose.z + VIS.beaker150.h + 1 };
    return null;
  }

  spatulaAction(all = false) {
    const h = this.held;
    if (!h || h.kind !== 'spatula') return;
    const m = h.magnet;
    const s = this.w.solids;
    if (m?.id === 'jar') {
      if (s.spatulaG > 0.001) this.run(this.dispatch({ type: 'returnSpatula' }));
      else this.run(this.dispatch({ type: 'scoop', amountG: all ? 0.5 : 0.15 }));
      this.host.sound('click');
      return;
    }
    if (s.spatulaG <= 0.0005) {
      this.hintOnce('p10.hint.spatulaEmpty');
      return;
    }
    const r = this.run(this.dispatch({ type: 'tapSpatula', targetId: m ? m.id : 'bench', fraction: all ? 1 : 0.5 }));
    if (r.ok) this.host.sound('click');
  }

  // ─────────────── Montaje de gas ───────────────

  /** Invierte la bureta llena sobre el baño: con P (boca tapada y bajo el agua) o al soltarla (boca en el aire). */
  /** Invierte la bureta en el baño. `carry`: desde el panel accesible, la lleva primero sobre el baño. */
  invertHere(submerged: boolean, carry = false) {
    const h = this.held;
    const w = this.w;
    if (h && h.kind !== 'burette') return;
    if (this.blocked()) return;
    const xy = buretteInBathXY(w);
    const o = w.objects.burette.pose;
    if (!carry && Math.hypot(o.x - xy.x, o.y - xy.y) > 8) {
      this.hintOnce('p10.hint.overBath', 'warn');
      return;
    }
    if (h) {
      this.held = null;
      this.primaryUp();
      this.view?.setOrbitEnabled(true);
      this.host.onHeldChange?.(null);
    }
    this.sendPose('burette', { x: xy.x, y: xy.y, z: 0, rotationRad: 0 });
    const r = this.run(this.dispatch({ type: 'invertBurette', mouthSubmerged: submerged }));
    if (r.ok) {
      this.host.sound(submerged ? 'glass' : 'drip');
      if (!submerged) this.warn('p10.hint.invertedInAir', 2);
      this.hintOnce('p10.hint.clamp');
    } else this.layOnBench('burette', o.x, o.y, 0.7);
  }

  clampBurette() {
    const r = this.run(this.dispatch({ type: 'clampBurette', tiltDeg: 0 }));
    if (r.ok) {
      const xy = buretteInBathXY(this.w);
      this.sendPose('burette', { x: xy.x, y: xy.y, z: 0, rotationRad: 0 }, 'clamp');
      this.host.sound('metal');
    }
    return r;
  }

  invertFlask() {
    const r = this.run(this.dispatch({ type: 'invertFlask' }));
    if (r.ok) this.host.sound('glass');
    return r;
  }

  toggleDoors() {
    this.dispatch({ type: 'setDoors', open: !this.w.balance.doorsOpen });
    this.host.sound('click');
  }

  tare() {
    const r = this.dispatch({ type: 'tare' });
    this.host.sound('click');
    return r;
  }

  readBalance() {
    const r = this.dispatch({ type: 'readBalance' });
    this.host.sound('click');
    return r;
  }

  readThermometer() {
    const r = this.run(this.dispatch({ type: 'readThermometer' }));
    this.host.sound('click');
    return r;
  }

  readBarometer(source: 'LOCAL' | 'WEATHER_SEA_LEVEL' = 'LOCAL') {
    const r = this.dispatch({ type: 'readBarometer', source });
    this.host.sound('click');
    return r;
  }

  /** Traslado accesible (panel): lleva un objeto a un destino como si se soltara allí. */
  moveTo(id: string, where: 'pan' | 'bench' | 'flask' | 'erlenmeyer' | 'bath' | 'sensor' | 'pipette') {
    if (this.blocked()) return { ok: false, code: 'BLOCKED' };
    if (this.held) this.release();
    const o = this.w.objects[id];
    if (!o) return { ok: false };
    if (o.support === 'pan' && !this.w.balance.doorsOpen) return this.run({ ok: false, code: 'DOORS_CLOSED' });
    if (where !== 'bench' || o.support !== 'bench') {
      const r = this.sendPose(id, { ...o.pose }, 'hand');
      if (!r.ok) return this.run(r);
    }
    const dest =
      where === 'pan' ? this.panPoint()
        : where === 'flask' ? { ...this.w.objects.flask.pose, z: this.w.objects.flask.pose.z + 12 }
          : where === 'erlenmeyer' ? { ...this.w.objects.erlenmeyer.pose, z: 16 }
            : where === 'bath' ? { ...this.w.objects.beaker600.pose, z: 16 }
              : where === 'sensor' ? sensorPort(this.w)
                : where === 'pipette' ? { ...this.w.objects.pipette.pose, z: 20 }
                  : { x: o.pose.x, y: o.pose.y, z: 0 };
    if (where === 'bench') {
      this.place(id, o.kind, { x: o.pose.x, y: Math.max(8, o.pose.y), z: 0, rotationRad: 0 });
      return { ok: true };
    }
    this.place(id, o.kind, { x: dest.x, y: dest.y, z: dest.z, rotationRad: 0 }, dest.z);
    return { ok: true };
  }

  /** Vertido accesible (panel): de `src` a `target` hasta `ml` (o hasta vaciar). */
  pourDirect(src: string, target: string | null, ml: number | null) {
    const v = this.w.liquids[src];
    const start = target ? this.w.liquids[target]?.ml ?? 0 : this.w.liquids.spill.ml;
    if (target === 'erlenmeyer' && this.w.reactor.stoppered) return this.run({ ok: false, code: 'STOPPERED' });
    const tilt = src === 'cylinder' ? 130 : src === 'tap_jug' ? 110 : 100;
    this.run(this.dispatch({ type: 'setPour', sourceId: src, targetId: target, tiltDeg: tilt }));
    return { ok: true, until: () => (ml === null ? v.ml <= 0.01 : (target ? this.w.liquids[target].ml : this.w.liquids.spill.ml) - start >= ml) };
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
      h.magnet = h.kind === 'spatula' ? this.spatulaMagnet(tx, ty) : null;
      if (h.magnet) {
        tx = h.magnet.x - SPOON_DX;
        ty = h.magnet.y;
        tz = h.magnet.z;
      }
      const floor = this.clearZ(tx, ty, FOOT[h.kind] ?? 1, h.id) + 0.3;
      if (!h.magnet) tz = Math.max(tz, floor);
      const k = Math.min(1, dt * (h.magnet ? 8 : 16));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const rot = h.kind === 'burette' ? Math.PI / 2 : (h.tilt * Math.PI) / 180;
      if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001) this.sendPose(h.id, { x: nx, y: ny, z: h.curZ, rotationRad: rot }, 'hand');
      if (POURABLE.has(h.id)) this.updatePour(h, dt);
      if (h.kind === 'washBottle') {
        this.dockTarget = this.pourTargetAt('wash', o.pose.x + 2.5, o.pose.y, o.pose.z + 12);
        if (this.primary) {
          this.dropTimer += dt;
          if (this.dropTimer > 0.25) {
            this.dropTimer = 0;
            this.squeeze(this.primaryShift ? 10 : 1);
          }
        }
      }
      if (h.kind === 'erlenmeyer') this.trackSwirl(dt, nx, ny);
      if (this.pointer && !h.keyboard) {
        const W = this.view.viewW();
        if (this.pointer.x < 30) this.view.edgePan(-1, dt);
        else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
      }
    }
  }

  /** Agitación por giro: la velocidad angular del Erlenmeyer alrededor de su centro de agarre. */
  private trackSwirl(dt: number, x: number, y: number) {
    const s = this.swirl;
    const h = this.held!;
    const cx = h.x;
    const cy = h.y;
    const r = Math.hypot(x - cx, y - cy);
    const ang = Math.atan2(y - cy, x - cx);
    if (s.prevAng !== null && r > 0.15) {
      let da = ang - s.prevAng;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      s.omega += (Math.abs(da) / Math.max(dt, 1e-3) - s.omega) * Math.min(1, dt * 4);
    } else s.omega *= Math.max(0, 1 - dt * 2);
    s.prevAng = r > 0.15 ? ang : null;
    s.t += dt;
    if (s.t > 0.25) {
      s.t = 0;
      const intensity = Math.min(1, s.omega / 25);
      if (intensity > 0.05) {
        this.dispatch({ type: 'swirl', id: 'erlenmeyer', intensity });
        this.host.sound('stir');
      }
    }
  }

  /** Agitación accesible (panel o teclado). */
  swirlNow(intensity: number) {
    this.dispatch({ type: 'swirl', id: 'erlenmeyer', intensity });
    this.host.sound('stir');
  }
}
