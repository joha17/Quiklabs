/**
 * Interacción de la Práctica 4 (§16): gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js.
 * - Arrastre con punto de agarre e inercia moderada; lo que se lleva sube por encima de lo que hay debajo
 *   (no atraviesa frascos ni gradillas) y la altura de las herramientas se ajusta con la rueda, Q/E o ▲▼.
 * - Verter: al acercar un recipiente con líquido a un receptor válido y detenerse, se acopla con el pico sobre la
 *   boca; mantener P / clic derecho / «Verter» lo inclina poco a poco y el caudal sale de la geometría (§16.2).
 * - Goteros: el «imán» los lleva a la boca del frasco (P = aspirar) o del receptor (P = una gota).
 * - Varilla: dentro del recipiente, mover el puntero en círculos agita (la intensidad sale del giro medido).
 * - Tubo en la mano: sacudirlo de lado a lado lo agita; con fuerza, salpica (§16.3).
 * - Pinzas: P sujeta o suelta (tubo/clavo con la pinza para tubo; cinta de Mg, cápsula o clavo con la de crisol).
 * - Mechero: válvulas, manguera y encendedor con los mismos gestos que la Práctica 3.
 */
import type { ReactionHost } from './host';
import type { ReactionLab3D } from './ReactionLab3D';
import type { P4Command } from '../../simulation/reaction-world/commands';
import type { P4ObjKind, P4World, Pose, VesselKind } from '../../simulation/reaction-world/types';
import { disposalRefusal, ethanolNearBurner, liquidMl, mouthOf, surfaceZ } from '../../simulation/reaction-world/world';
import { hosePoints, isLit, mouthPos } from '../../simulation/flame-world/world';
import type { ValveId } from '../../simulation/flame-world/commands';
import { BURNER } from '../../practices/practice-03/instruments';
import { rackSlotPose4 } from '../../practices/practice-04/definition';
import { PROFILE_OF, RACK4, TILE4, WASH_NOZZLE, CAPSULE_PROFILE, MG_RIBBON } from '../../practices/practice-04/instruments';
import { lipPoint, pourRate, rotateLocal } from '../physics/geometry';
import { footR, POUR_TARGETS, SHAPES4 } from './shapes';

export interface PickHit4 {
  id: string;
  part?: string;
}

export interface ViewAdapter4 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHit4 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

type AnyKind = P4ObjKind | 'burner' | 'gasTap' | 'lighter' | 'extinguisher' | 'blanket' | 'emergencyStop' | 'extractor' | 'coDetector';

interface Magnet {
  id: string;
  x: number;
  y: number;
  z: number;
  mode: 'ASPIRATE' | 'DROP' | 'IN' | 'NOZZLE' | 'OVER';
}

export interface Held {
  id: string;
  kind: AnyKind;
  gas: boolean;
  ox: number;
  oy: number;
  /** Altura objetivo del origen y altura actual (suavizada). */
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  lifting: boolean;
  /** Inclinación de vertido actual (rad). */
  tilt: number;
  magnet: Magnet | null;
  track: Array<{ x: number; y: number; t: number }>;
}

interface PourDock {
  sourceId: string;
  targetId: string;
  side: 1 | -1;
  settled: boolean;
}

const KNOB_PARTS: Record<string, ValveId> = { needleValve: 'NEEDLE', airCollar: 'AIR', tableValve: 'TABLE' };
const POUR_CAPTURE_CM = 2.5;
const POUR_RELEASE_CM = 5;
const POUR_DWELL_S = 0.35;
const POUR_TILT_SPEED = (38 * Math.PI) / 180;
const POUR_RETURN_SPEED = (120 * Math.PI) / 180;
const POUR_MAX_TILT = (125 * Math.PI) / 180;
const VESSEL_KINDS = new Set<AnyKind>(['bottle', 'cylinder', 'beaker', 'tube', 'capsule', 'washBottle', 'dropperBottle']);
const TOOL_KINDS = new Set<AnyKind>(['dropper', 'rod', 'probe', 'tubeTongs', 'crucibleTongs', 'lighter', 'phPaper', 'towel', 'sandpaper', 'mgRibbon', 'nail', 'alStrip']);
/** Altura del origen (cm) al llevar cada herramienta, si no hay nada debajo. */
const TOOL_CARRY_Z: Partial<Record<AnyKind, number>> = {
  dropper: 15, rod: 9, probe: 9, tubeTongs: 16, crucibleTongs: 20, lighter: BURNER.mouthZ + 0.8, phPaper: 12, towel: 3, sandpaper: 3, mgRibbon: 4, nail: 6, alStrip: 6,
};
/** Altura superior de cada tipo (para pasar por encima sin atravesarlo). */
function topOf(kind: AnyKind, vk?: VesselKind): number {
  if (vk && PROFILE_OF[vk]) return PROFILE_OF[vk]!.rimY;
  switch (kind) {
    case 'rack': return RACK4.h + 0.5;
    case 'tile': return TILE4.h;
    case 'burner': return BURNER.mouthZ;
    case 'shield': return 28;
    case 'nailDish':
    case 'mgDish': return 0.8;
    case 'waste': return 12;
    default: return 1;
  }
}

export class ReactionController {
  view: ViewAdapter4 | null = null;
  held: Held | null = null;
  hovered: string | null = null;
  clampReady = false;
  /** Gotas en el aire (para la vista): posición, velocidad y color. */
  drops: Array<{ x: number; y: number; z: number; vz: number; color: [number, number, number]; to: number }> = [];
  pourDock: PourDock | null = null;
  private pourHover: { targetId: string; since: number } | null = null;
  private pourHold = false;
  private pourAuto = false;
  private pourSent = new Map<string, { target: string | null; rate: number; t: number }>();
  private knob: { valve: ValveId; sx: number; sy: number; start: number } | null = null;
  private hoseDrag = false;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private now = 0;
  private stirKey = 0;
  private stirSent = 0;
  private lastAngle: number | null = null;
  private angAcc = 0;
  private shieldTimer = 0;
  private lastShield = '';
  private dropTimer = 0;
  private sparkSound = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: ReactionHost, private lab: ReactionLab3D) {}

  private get w(): P4World {
    return this.host.runtime.world;
  }

  private get ctx() {
    return this.host.runtime.ctx;
  }

  private dispatch(c: P4Command) {
    return this.host.runtime.dispatch(c);
  }

  private blocked(): boolean {
    return !!this.w.safety.incident || this.w.safety.stoppedByTeacher;
  }

  /** Objeto (de la práctica o del mechero) con su tipo. */
  obj(id: string): { pose: Pose; support: string; kind: AnyKind; movable: boolean; gas: boolean } | null {
    const o = this.w.objects[id];
    if (o) return { pose: o.pose, support: o.support, kind: o.kind, movable: o.movable, gas: false };
    const g = this.w.gas.objects[id];
    if (g) return { pose: g.pose, support: g.support, kind: g.kind as AnyKind, movable: g.movable, gas: true };
    return null;
  }

  private hintOnce(key: string, level: 'info' | 'warn' = 'info', params?: Record<string, unknown>) {
    if (this.hinted.has(key)) return;
    this.hinted.add(key);
    this.host.notify(level, key, params);
  }

  private warn(key: string, gapS = 4, params?: Record<string, unknown>) {
    const t = this.now;
    if (t - (this.lastWarn.get(key) ?? -99) < gapS) return;
    this.lastWarn.set(key, t);
    this.host.notify('warn', key, params);
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
    if (hit.part && KNOB_PARTS[hit.part]) {
      const valve = KNOB_PARTS[hit.part];
      this.knob = { valve, sx, sy, start: this.valveValue(valve) };
      this.view.setOrbitEnabled(false);
      return true;
    }
    if (hit.id === 'hose') {
      this.hoseDrag = true;
      this.view.setOrbitEnabled(false);
      return true;
    }
    if (this.held && this.held.id === hit.id) return true;
    this.down = true;
    return this.beginDrag(hit.id, false, sx, sy);
  }

  onPointerMove(sx: number, sy: number) {
    this.pointer = { x: sx, y: sy };
    if (this.knob) {
      const d = (this.knob.sy - sy + (sx - this.knob.sx) * 0.5) / 160;
      this.setValve(this.knob.valve, this.knob.start + d);
      return;
    }
    if (this.hoseDrag && this.view) {
      const m = this.w.gas.hose.mid;
      const p = this.view.toBench(sx, sy, m.z);
      this.dispatch({ type: 'gas', cmd: { type: 'setHoseMid', x: p.x, y: p.y, z: m.z } });
      return;
    }
    if (!this.held && this.view) {
      const h = this.view.pick(sx, sy, null);
      this.hovered = h?.id ?? null;
    }
  }

  onPointerUp() {
    if (this.knob) {
      this.knob = null;
      this.view?.setOrbitEnabled(true);
      return;
    }
    if (this.hoseDrag) {
      this.hoseDrag = false;
      this.view?.setOrbitEnabled(true);
      return;
    }
    if (this.held && this.down && !this.held.keyboard) this.release();
    this.down = false;
  }

  /** Rueda: con un recipiente acoplado inclina; con una herramienta sube/baja; sobre una perilla gira la válvula. */
  onWheel(dy: number): boolean {
    const dir = dy > 0 ? -1 : 1;
    const h = this.held;
    if (h) {
      if (h.kind === 'lighter') {
        this.setValve('NEEDLE', this.valveValue('NEEDLE') + dir * 0.02);
        return true;
      }
      if (this.pourDock?.sourceId === h.id) {
        this.nudgeTilt(-dir, 4);
        return true;
      }
      this.nudgeHeight(dir * 0.5);
      return true;
    }
    if (this.pointer && this.view) {
      const hit = this.view.pick(this.pointer.x, this.pointer.y, null);
      if (hit?.part && KNOB_PARTS[hit.part]) {
        const v = KNOB_PARTS[hit.part];
        this.setValve(v, this.valveValue(v) + dir * 0.03);
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
  primaryDown() {
    const h = this.held;
    if (!h || this.primary || this.blocked()) return;
    this.primary = true;
    const w = this.w;
    switch (h.kind) {
      case 'lighter':
        this.dispatch({ type: 'gas', cmd: { type: 'spark', on: true } });
        this.host.sound('spark');
        break;
      case 'tubeTongs':
      case 'crucibleTongs':
        this.toggleClamp();
        break;
      case 'dropper':
        this.dropperAction(false);
        break;
      case 'washBottle':
        this.startSqueeze();
        break;
      case 'sandpaper':
        this.sandIfNear();
        break;
      case 'towel':
        this.towelIfNear();
        break;
      case 'phPaper':
        this.phIfOver();
        break;
      case 'rod':
        this.stirKey = 0.55;
        break;
      case 'tube':
        if (this.pourDock?.sourceId === h.id) this.startPourHold();
        else this.stirKey = 0.5;
        break;
      default:
        if (this.pourDock?.sourceId === h.id) this.startPourHold();
        else if (w.vessels[h.id]) this.host.notify('info', 'p4.hint.pourNotDocked');
    }
  }

  primaryUp() {
    if (!this.primary) return;
    this.primary = false;
    this.pourHold = false;
    this.stirKey = 0;
    this.dropTimer = 0;
    if (this.held?.kind === 'lighter' || this.w.gas.lighter.sparking) this.dispatch({ type: 'gas', cmd: { type: 'spark', on: false } });
    if (this.held?.kind === 'washBottle') this.stopSqueeze();
  }

  private startPourHold() {
    this.pourHold = true;
    this.pourAuto = true;
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const step = shift ? 5 : 1;
    const valveKeys: Record<string, [ValveId, number]> = { '[': ['NEEDLE', -0.02], ']': ['NEEDLE', 0.02], ',': ['AIR', -0.03], '.': ['AIR', 0.03] };
    if (valveKeys[key]) {
      const [v, d] = valveKeys[key];
      this.setValve(v, this.valveValue(v) + d);
      return true;
    }
    if (key === 'g' || key === 'G') {
      this.placeShield();
      return true;
    }
    const h = this.held;
    if (key === 'a' || key === 'A') {
      this.stirKey = 0.5;
      if (!h) this.stirSelected(0.5);
      return true;
    }
    if (h) {
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      if (key === 'p' || key === 'P') return this.primaryDown(), true;
      if (key === 'q' || key === 'Q' || key === 'PageUp') return this.onWheel(-1), true;
      if (key === 'e' || key === 'E' || key === 'PageDown') return this.onWheel(1), true;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key];
      if (d) {
        h.x += d[0];
        h.y += d[1];
        return true;
      }
      return false;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const all = [
        ...Object.values(this.w.objects).filter((o) => o.movable && !o.support.startsWith('disposed:')).map((o) => ({ id: o.id, x: o.pose.x, y: o.pose.y })),
        ...Object.values(this.w.gas.objects).filter((o) => o.movable || o.kind === 'gasTap').map((o) => ({ id: o.id, x: o.pose.x, y: o.pose.y })),
      ].sort((a, b) => a.x - b.x || a.y - b.y);
      const ids = all.map((o) => o.id);
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
    if (key === 'a' || key === 'A') {
      this.stirKey = 0;
      return true;
    }
    return false;
  }

  /** Agitar lo seleccionado sin tenerlo en la mano (varilla dentro, tubo en la gradilla, cápsula). */
  stirSelected(intensity: number) {
    const sel = this.host.getSelected();
    if (!sel) return;
    const v = this.w.vessels[sel];
    if (v) {
      const tool = this.w.rod.vesselId === sel ? 'ROD' : v.kind === 'TUBE' ? 'SHAKE' : 'SWIRL';
      this.dispatch({ type: 'setAgitation', id: sel, tool, intensity });
      this.host.sound('stir');
    }
  }

  // ─────────────── Tomar y soltar ───────────────

  beginDrag(id: string, keyboard: boolean, sx?: number, sy?: number): boolean {
    const o = this.obj(id);
    if (!o || !o.movable || this.blocked()) return false;
    if (o.support.startsWith('tongs:') || o.support.startsWith('disposed:')) return false;
    if (this.held) this.release();
    const r = o.gas ? this.dispatch({ type: 'gas', cmd: { type: 'pickUp', id, tool: 'HAND' } }) : this.dispatch({ type: 'pickUp', id, tool: 'HAND' });
    if (!r.ok) return false;
    // Antes de levantar un recipiente se sacan la varilla y la sonda que estaban dentro.
    if (this.w.vessels[id]) {
      for (const tool of ['rod', 'probe']) {
        const t = this.w.objects[tool];
        if (t?.support === `in:${id}`) {
          this.layOnBench(tool, o.pose.x + 6, o.pose.y - 6, 0.3);
          this.hintOnce('p4.hint.toolsOut');
        }
      }
    }
    this.lab.physicsActive.delete(id);
    let ox = 0;
    let oy = 0;
    const isTool = TOOL_KINDS.has(o.kind);
    if (!isTool && sx !== undefined && sy !== undefined && this.view) {
      const p = this.view.toBench(sx, sy, o.pose.z);
      ox = Math.max(-3, Math.min(3, o.pose.x - p.x));
      oy = Math.max(-3, Math.min(3, o.pose.y - p.y));
    }
    const carry = TOOL_CARRY_Z[o.kind];
    const fromSlot = o.support.startsWith('rack:') || o.support.startsWith('cap:') || o.support.startsWith('in:');
    const z0 = o.kind === 'burner' ? 0 : carry !== undefined ? Math.max(o.pose.z + 2, carry) : o.pose.z + 3;
    // El gotero sale de su frasco: el frasco queda abierto (lo registra el dominio con la nueva pose).
    this.held = {
      id, kind: o.kind, gas: o.gas, ox, oy, z: z0, curZ: o.pose.z, x: o.pose.x - ox, y: o.pose.y - oy, keyboard, from: { pose: { ...o.pose }, support: o.support },
      magnet: null, lifting: fromSlot, tilt: 0, track: [],
    };
    this.sendPose(id, { ...o.pose, quat: undefined, rotationRad: 0 }, 'hand');
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'capsule' ? 'porcelain' : VESSEL_KINDS.has(o.kind) || o.kind === 'dropper' ? 'clink' : 'click');
    if (o.kind === 'mgRibbon') this.hintOnce('p4.hint.mgTongs');
    if (o.kind === 'dropper') this.hintOnce('p4.hint.dropper');
    if (o.kind === 'rod') this.hintOnce('p4.hint.rod');
    if (VESSEL_KINDS.has(o.kind) && o.kind !== 'washBottle' && o.kind !== 'dropperBottle') this.hintOnce('p4.hint.pour');
    return true;
  }

  private sendPose(id: string, pose: Pose, support?: string) {
    const g = !!this.w.gas.objects[id];
    if (g) this.dispatch({ type: 'gas', cmd: { type: 'setPose', id, pose, support } });
    else this.dispatch({ type: 'setPose', id, pose, support });
  }

  /** Suelta lo que se sostiene: encaja en un soporte cercano, entra en un recipiente o se apoya en la mesada. */
  release() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.stopPour(h.id);
    const wasDocked = this.pourDock?.sourceId === h.id;
    this.pourDock = null;
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const o = this.obj(h.id);
    if (!o) return;
    const p = o.pose;
    const w = this.w;
    // Soltar un recipiente acoplado para verter: queda de pie al lado del receptor (no cae desde la altura del pico).
    if (wasDocked && h.kind !== 'tube') {
      this.layOnBench(h.id, p.x, p.y - 2, 0);
      return;
    }
    switch (h.kind) {
      case 'tube': {
        const slot = this.nearestRackSlot(p.x, p.y) ?? (wasDocked ? this.nearestRackSlot(h.from.pose.x, h.from.pose.y) : null);
        if (slot !== null) {
          this.sendPose(h.id, rackSlotPose4(slot), `rack:${slot}`);
          this.host.sound('clink');
          return;
        }
        if (this.disposeGlassIfOver(h.id, p)) return;
        this.restOrFall(h.id, p);
        return;
      }
      case 'dropper': {
        const m = h.magnet;
        if (m && m.mode === 'ASPIRATE' && w.vessels[m.id]?.kind === 'DROPPER_BOTTLE') {
          const b = w.objects[m.id];
          this.sendPose(h.id, { x: b.pose.x, y: b.pose.y, z: b.pose.z + 1.2, rotationRad: 0 }, `cap:${m.id}`);
          this.host.sound('clink');
          return;
        }
        if (this.disposeGlassIfOver(h.id, p)) return;
        this.layOnBench(h.id, p.x, p.y, 0.4);
        return;
      }
      case 'rod':
      case 'probe': {
        const m = h.magnet;
        if (m && m.mode === 'IN') {
          this.sendPose(h.id, { x: m.x, y: m.y, z: m.z, rotationRad: 0 }, `in:${m.id}`);
          this.host.sound('clink');
          return;
        }
        if (h.kind === 'rod' && this.disposeGlassIfOver(h.id, p)) return;
        this.layOnBench(h.id, p.x, p.y, 0.3);
        return;
      }
      case 'nail':
      case 'alStrip': {
        if (this.metalIntoTube(h.id, p)) return;
        if (this.disposeMetalIfOver(h.id, p)) return;
        const dish = w.objects.nail_dish?.pose;
        if (dish && Math.hypot(p.x - dish.x, p.y - dish.y) < 4) {
          this.sendPose(h.id, { x: dish.x, y: dish.y, z: 0.45, rotationRad: 0 }, 'dish');
          return;
        }
        this.layOnBench(h.id, p.x, p.y, 0.2);
        return;
      }
      case 'mgRibbon': {
        const dish = w.objects.mg_dish?.pose;
        if (dish && Math.hypot(p.x - dish.x, p.y - dish.y) < 5) this.sendPose(h.id, { x: dish.x, y: dish.y, z: 0.35, rotationRad: 0 }, 'dish');
        else this.layOnBench(h.id, p.x, p.y, 0.1);
        return;
      }
      case 'tubeTongs':
      case 'crucibleTongs': {
        const tg = w.tongs[h.id];
        if (tg?.holding) {
          const target = w.objects[tg.holding];
          if (target?.kind === 'tube') {
            this.dispatch({ type: 'unclamp', tongsId: h.id });
            const slot = this.nearestRackSlot(target.pose.x, target.pose.y);
            if (slot !== null) this.sendPose(target.id, rackSlotPose4(slot), `rack:${slot}`);
            else this.restOrFall(target.id, target.pose);
          } else if (target?.kind === 'capsule') {
            this.dispatch({ type: 'unclamp', tongsId: h.id });
            if (this.overTile(target.pose.x, target.pose.y)) this.sendPose('capsule', { x: target.pose.x, y: target.pose.y, z: TILE4.h, rotationRad: 0 }, 'tile');
            else this.restOrFall('capsule', target.pose);
          } else if (target && (target.kind === 'nail' || target.kind === 'alStrip')) {
            this.dispatch({ type: 'unclamp', tongsId: h.id });
            if (!this.metalIntoTube(target.id, target.pose) && !this.disposeMetalIfOver(target.id, target.pose)) this.layOnBench(target.id, target.pose.x, target.pose.y, 0.2);
          } else if (target) {
            this.dispatch({ type: 'unclamp', tongsId: h.id });
            if (w.objects[target.id]?.support === 'falling') this.layOnBench(target.id, target.pose.x, target.pose.y, 0.1);
          }
        }
        this.layOnBench(h.id, p.x, p.y - 5, 0.6);
        return;
      }
      case 'shield': {
        if (this.shieldAlignment() > 0.5) this.sendPose(h.id, { x: p.x, y: p.y, z: 0, rotationRad: 0 }, 'stand');
        else this.layOnBench(h.id, p.x, p.y, 0);
        return;
      }
      case 'capsule': {
        if (this.overTile(p.x, p.y)) {
          this.sendPose(h.id, { x: p.x, y: p.y, z: TILE4.h, rotationRad: 0 }, 'tile');
          this.host.sound('porcelain');
        } else this.restOrFall(h.id, p);
        return;
      }
      case 'washBottle':
        this.stopSqueeze();
        this.layOnBench(h.id, p.x, p.y, 0);
        return;
      case 'lighter':
        this.dispatch({ type: 'gas', cmd: { type: 'spark', on: false } });
        this.layOnBench(h.id, p.x, p.y, 1.2);
        return;
      case 'burner':
        this.sendPose(h.id, { x: p.x, y: p.y, z: 0, rotationRad: 0 }, 'bench');
        this.host.sound('metal');
        return;
      default:
        if (VESSEL_KINDS.has(h.kind)) {
          if (this.disposeGlassIfOver(h.id, p)) return;
          this.restOrFall(h.id, p);
          return;
        }
        this.layOnBench(h.id, p.x, p.y, h.kind === 'towel' ? 0.4 : h.kind === 'phPaper' ? 0.2 : 0.05);
    }
  }

  /** Esc: devuelve el objeto a donde estaba. */
  cancel() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.stopPour(h.id);
    this.pourDock = null;
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    this.sendPose(h.id, h.from.pose, h.from.support);
  }

  private restOrFall(id: string, p: Pose) {
    const base = this.platformZ(p.x, p.y, id);
    // Soltado desde muy alto: cae con la física (puede volcar o romperse).
    if (p.z - base > 7) {
      this.toPhysics(id);
      return;
    }
    this.layOnBench(id, p.x, p.y, 0);
  }

  private occupied(x: number, y: number, r: number, exclude: string): boolean {
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand' || o.support.startsWith('in:') || o.support.startsWith('cap:') || o.support.startsWith('tongs:') || o.support.startsWith('disposed:')) continue;
      const vk = this.w.vessels[o.id]?.kind;
      const rr = o.kind === 'rack' ? 0 : vk ? footR(vk) : o.kind === 'tile' ? 0 : 1.2;
      if (o.kind === 'rack' && Math.abs(x - o.pose.x) < RACK4.hx + r && Math.abs(y - o.pose.y) < RACK4.hy + r) return true;
      if (o.kind === 'waste' && Math.hypot(x - o.pose.x, y - o.pose.y) < 4.6 + r) return true;
      if (rr && Math.hypot(x - o.pose.x, y - o.pose.y) < rr + r + 0.3) return true;
    }
    for (const g of Object.values(this.w.gas.objects)) {
      if (g.id === exclude || g.support === 'hand' || g.support === 'wall') continue;
      if (g.kind === 'burner' && Math.hypot(x - g.pose.x, y - g.pose.y) < BURNER.baseR + r + 1) return true;
    }
    return false;
  }

  private freeSpot(x: number, y: number, r: number, exclude: string): { x: number; y: number } {
    for (let k = 0; k < 16; k++) {
      const ty = Math.max(3, Math.min(60, y - k * 3));
      if (!this.occupied(x, ty, r, exclude)) return { x, y: ty };
      for (const dx of [-4, 4, -8, 8, -12, 12]) if (!this.occupied(x + dx, ty, r, exclude)) return { x: x + dx, y: ty };
    }
    return { x, y: 4 };
  }

  layOnBench(id: string, x0: number, y0: number, z: number) {
    const vk = this.w.vessels[id]?.kind;
    const r = vk ? footR(vk) : 1;
    const spot = this.freeSpot(Math.max(-8, Math.min(620, x0)), Math.max(3, Math.min(60, y0)), r, id);
    const base = this.platformZ(spot.x, spot.y, id);
    this.sendPose(id, { x: spot.x, y: spot.y, z: base + z, rotationRad: 0 }, this.overTile(spot.x, spot.y) && id === 'capsule' ? 'tile' : 'bench');
    this.host.sound(VESSEL_KINDS.has(this.obj(id)?.kind as AnyKind) ? 'clink' : 'click');
  }

  private toPhysics(id: string) {
    const o = this.obj(id);
    if (!o) return;
    this.sendPose(id, o.pose, 'falling');
    this.lab.physicsActive.add(id);
  }

  private overTile(x: number, y: number) {
    const t = this.w.objects.tile?.pose;
    return !!t && Math.abs(x - t.x) < TILE4.half - 1 && Math.abs(y - t.y) < TILE4.half - 1;
  }

  private nearestRackSlot(x: number, y: number): number | null {
    let best: number | null = null;
    let bd = 2.6;
    for (let i = 0; i < RACK4.slots; i++) {
      const s = rackSlotPose4(i);
      const d = Math.hypot(s.x - x, s.y - y);
      const occupied = Object.values(this.w.objects).some((o) => o.support === `rack:${i}` && o.id !== this.held?.id);
      if (d < bd && !occupied) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Altura de apoyo en (x, y): mesada, placa refractaria, gradilla y la base del mechero. */
  platformZ(x: number, y: number, exclude?: string): number {
    let z = 0;
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand') continue;
      if (o.kind === 'tile' && Math.abs(x - o.pose.x) < TILE4.half && Math.abs(y - o.pose.y) < TILE4.half) z = Math.max(z, TILE4.h);
    }
    const b = this.w.gas.objects.burner?.pose;
    if (b && exclude !== 'burner' && Math.hypot(x - b.x, y - b.y) < BURNER.baseR) z = Math.max(z, BURNER.baseH);
    return z;
  }

  /** Altura mínima para pasar por encima de lo que hay debajo (no atravesar objetos, §28.7). */
  private clearZ(x: number, y: number, r: number, exclude: string): number {
    let z = this.platformZ(x, y, exclude);
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand' || o.support.startsWith('tongs:') || o.support.startsWith('disposed:') || o.support.startsWith('cap:') || o.support.startsWith('in:')) continue;
      if (o.kind === 'rack') {
        if (Math.abs(x - o.pose.x) < RACK4.hx + r && Math.abs(y - o.pose.y) < RACK4.hy + r) z = Math.max(z, RACK4.h + 0.6);
        continue;
      }
      const vk = this.w.vessels[o.id]?.kind;
      const rr = vk ? footR(vk) : o.kind === 'shield' ? 10 : o.kind === 'waste' ? 4.4 : 0;
      if (!rr) continue;
      if (Math.hypot(x - o.pose.x, y - o.pose.y) < rr + r) z = Math.max(z, o.pose.z + topOf(o.kind, vk) + 0.4);
    }
    const b = this.w.gas.objects.burner?.pose;
    if (b && exclude !== 'burner' && Math.hypot(x - b.x, y - b.y) < BURNER.barrelR + r + 0.3) z = Math.max(z, BURNER.mouthZ + 0.5);
    return z;
  }

  // ─────────────── Mechero (mismos gestos que la Práctica 3) ───────────────

  valveValue(v: ValveId): number {
    const b = this.w.gas.burner;
    return v === 'TABLE' ? b.tableGasValve : v === 'NEEDLE' ? b.needleGasValve : b.airCollar;
  }

  setValve(valve: ValveId, value: number) {
    const v = Math.max(0, Math.min(1, value));
    if (Math.abs(v - this.valveValue(valve)) < 1e-4) return;
    this.dispatch({ type: 'gas', cmd: { type: 'setValve', valve, value: v } });
  }

  nudgeHeight(dz: number) {
    const h = this.held;
    if (!h) return;
    if (h.magnet && (h.kind === 'probe' || h.kind === 'rod')) {
      h.magnet.z += dz * 0.4;
      return;
    }
    const z1 = Math.max(0, Math.min(45, h.z + dz));
    if (this.pointer && this.view && !h.keyboard) {
      const before = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
      const after = this.view.toBench(this.pointer.x, this.pointer.y, z1);
      h.ox += before.x - after.x;
      h.oy += before.y - after.y;
    }
    h.z = z1;
  }

  /** Inclinar lo sostenido (botones ⟲ ⟳ o rueda). Acoplado, solo hacia el receptor. */
  nudgeTilt(dir: number, deg: number) {
    const h = this.held;
    if (!h || !this.w.vessels[h.id]) return;
    const d = this.pourDock?.sourceId === h.id ? this.pourDock : null;
    if (d) {
      this.pourAuto = false;
      h.tilt = d.side * Math.max(0, Math.min(POUR_MAX_TILT, d.side * h.tilt + dir * d.side * (deg * Math.PI) / 180));
    } else h.tilt = Math.max(-0.6, Math.min(0.6, h.tilt + (dir * deg * Math.PI) / 180));
  }

  /** Pantalla para Mg entre la vista y el mechero (tecla G o botón), sin soltar lo que se tiene en la mano. */
  placeShield() {
    const s = this.w.objects.shield;
    const cam = this.lab.camera?.position();
    if (!s || !cam) return;
    if (this.held?.id === 'shield') this.release();
    if (s.support === 'stand') {
      this.layOnBench('shield', s.pose.x - 25, 52, 0);
      return;
    }
    const m = mouthPos(this.w.gas, this.ctx.gasCtx);
    const d = { x: cam.x - m.x, y: cam.y - m.y };
    const len = Math.hypot(d.x, d.y) || 1;
    const k = 16 / len;
    this.sendPose('shield', { x: m.x + d.x * k, y: Math.max(3, m.y + d.y * k), z: 0, rotationRad: Math.atan2(d.x, -d.y) }, 'stand');
    this.host.sound('click');
  }

  // ─────────────── Pinzas, lija, toalla, papel indicador ───────────────

  /** Punta de la pinza sostenida. */
  private tongsTip(id: string): Pose | null {
    return this.w.objects[id]?.pose ?? null;
  }

  /** Objeto que la pinza puede sujetar cerca de su punta (y lo bien que lo alcanza). */
  private grippable(tongsId: string): { id: string; grip: number } | null {
    const tip = this.tongsTip(tongsId);
    if (!tip) return null;
    const crucible = this.w.objects[tongsId]?.kind === 'crucibleTongs';
    let best: { id: string; grip: number } | null = null;
    for (const o of Object.values(this.w.objects)) {
      if (o.support.startsWith('tongs:') || o.support.startsWith('disposed:') || o.id === tongsId) continue;
      const kinds: P4ObjKind[] = crucible ? ['mgRibbon', 'capsule', 'nail', 'alStrip'] : ['tube', 'nail', 'alStrip', 'mgRibbon'];
      if (!kinds.includes(o.kind)) continue;
      // Punto de agarre: borde de la cápsula, parte alta del tubo, el cuerpo del clavo/cinta.
      let g = { x: o.pose.x, y: o.pose.y, z: o.pose.z };
      if (o.kind === 'capsule') g = { x: o.pose.x, y: o.pose.y - CAPSULE_PROFILE.outerR, z: o.pose.z + CAPSULE_PROFILE.rimY };
      if (o.kind === 'tube') g = { x: o.pose.x, y: o.pose.y, z: o.pose.z + 11 };
      if ((o.kind === 'nail' || o.kind === 'alStrip') && o.support.startsWith('in:')) {
        // Dentro de un recipiente se toma por la boca (la pinza entra hasta la cabeza del clavo).
        const holder = this.w.objects[o.support.slice(3)];
        const rim = holder ? holder.pose.z + (PROFILE_OF[this.w.vessels[holder.id]?.kind ?? 'TUBE']?.rimY ?? 15) : o.pose.z + 4.6;
        g = { x: o.pose.x, y: o.pose.y, z: Math.min(rim, o.pose.z + 4.6 + 3) };
      }
      // La cinta se toma por el extremo opuesto al libre (el libre es el que irá a la llama).
      if (o.kind === 'mgRibbon') g = { x: o.pose.x - MG_RIBBON.length * 0.85, y: o.pose.y, z: o.pose.z };
      const d = Math.hypot(tip.x - g.x, tip.y - g.y, (tip.z - g.z) * 0.8);
      const grip = Math.max(0, Math.min(1, 1 - d / 3));
      if (grip > 0.05 && (!best || grip > best.grip)) best = { id: o.id, grip };
    }
    return best;
  }

  toggleClamp() {
    const h = this.held;
    if (!h || (h.kind !== 'tubeTongs' && h.kind !== 'crucibleTongs')) return;
    const tg = this.w.tongs[h.id];
    if (!tg) return;
    if (tg.holding) {
      const target = this.w.objects[tg.holding];
      if (target && (target.kind === 'nail' || target.kind === 'alStrip')) {
        this.dispatch({ type: 'unclamp', tongsId: h.id });
        if (!this.metalIntoTube(target.id, target.pose) && !this.disposeMetalIfOver(target.id, target.pose)) this.layOnBench(target.id, target.pose.x, target.pose.y, 0.2);
      } else if (target?.kind === 'capsule') {
        this.dispatch({ type: 'unclamp', tongsId: h.id });
        if (this.overTile(target.pose.x, target.pose.y)) this.sendPose('capsule', { x: target.pose.x, y: target.pose.y, z: TILE4.h, rotationRad: 0 }, 'tile');
        else this.restOrFall('capsule', target.pose);
      } else if (target?.kind === 'tube') {
        this.dispatch({ type: 'unclamp', tongsId: h.id });
        const slot = this.nearestRackSlot(target.pose.x, target.pose.y);
        if (slot !== null) this.sendPose(target.id, rackSlotPose4(slot), `rack:${slot}`);
        else this.restOrFall(target.id, target.pose);
      } else {
        this.dispatch({ type: 'unclamp', tongsId: h.id });
        const t2 = target ? this.w.objects[target.id] : null;
        if (t2 && t2.support === 'falling') this.layOnBench(t2.id, t2.pose.x, t2.pose.y, 0.1);
      }
      this.host.sound('metal');
      return;
    }
    const g = this.grippable(h.id);
    if (!g) {
      this.host.notify('info', 'p4.hint.gripMissed');
      return;
    }
    const target = this.w.objects[g.id];
    if (target?.kind === 'mgRibbon' && !this.w.safety.mgWarningAccepted) this.host.requestMgWarning?.();
    const r = this.dispatch({ type: 'clamp', tongsId: h.id, targetId: g.id, grip: g.grip });
    if (!r.ok) {
      if (r.code === 'WRONG_TONGS') this.host.notify('warn', 'p4.hint.wrongTongs');
      else this.host.notify('info', 'p4.hint.gripMissed');
      return;
    }
    // Sacar el clavo del tubo con la pinza.
    this.host.sound('metal');
  }

  private sandIfNear() {
    const s = this.w.objects.sandpaper;
    if (!s) return;
    for (const id of ['nail', 'al_strip']) {
      const m = this.w.objects[id];
      if (!m || this.w.metals[id]?.immersedIn) continue;
      if (Math.hypot(m.pose.x - s.pose.x, m.pose.y - s.pose.y) < 7) {
        this.dispatch({ type: 'sand', id });
        this.host.sound('sand');
        return;
      }
    }
    this.host.notify('info', 'p4.hint.sandNear');
  }

  private towelIfNear() {
    const t = this.w.objects.towel;
    if (!t) return;
    const s = this.w.spills.find((x) => !x.cleaned && Math.hypot(x.x - t.pose.x, x.y - t.pose.y) < 8);
    if (s) {
      this.dispatch({ type: 'cleanSpill', spillId: s.id });
      this.host.sound('paper');
      return;
    }
    this.host.notify('info', 'p4.hint.towelNear');
  }

  private phIfOver() {
    const p = this.w.objects.ph_paper;
    if (!p) return;
    const target = this.vesselMouthNear(p.pose.x, p.pose.y, 2.5, ['ph_paper']);
    if (!target) {
      this.host.notify('info', 'p4.hint.phNear');
      return;
    }
    const r = this.dispatch({ type: 'checkPh', id: target });
    if (r.ok) this.host.notify('info', 'p4.hint.phResult', { ph: this.w.vessels[target]?.phChecked ?? '' });
  }

  /** Recipiente cuya boca queda cerca (horizontalmente) de un punto. */
  private vesselMouthNear(x: number, y: number, r: number, exclude: string[] = [], kinds?: VesselKind[]): string | null {
    let best: string | null = null;
    let bd = Infinity;
    for (const v of Object.values(this.w.vessels)) {
      if (exclude.includes(v.id) || v.broken || v.kind === 'DROPPER') continue;
      if (kinds && !kinds.includes(v.kind)) continue;
      const o = this.w.objects[v.id];
      if (!o || o.support === 'hand' || o.support.startsWith('disposed:') || o.support === 'falling') continue;
      const m = mouthOf(this.w, this.ctx, v.id);
      if (!m) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < Math.max(r, m.r + 0.4) && d < bd) {
        bd = d;
        best = v.id;
      }
    }
    return best;
  }

  /** Clavo (o tira de Al) sobre la boca de un tubo: entra y queda apoyado en el fondo. */
  private metalIntoTube(id: string, p: Pose): boolean {
    const t = this.vesselMouthNear(p.x, p.y, 1.4, [], ['TUBE', 'BEAKER100']);
    if (!t) return false;
    const to = this.w.objects[t];
    this.sendPose(id, { x: to.pose.x, y: to.pose.y, z: to.pose.z + 0.25, rotationRad: 0 }, `in:${t}`);
    this.host.sound('clink');
    return true;
  }

  private disposeMetalIfOver(id: string, p: Pose): boolean {
    for (const wid of ['waste_metals', 'waste_iron', 'waste_acidbase', 'waste_solids', 'waste_glass']) {
      const o = this.w.objects[wid];
      if (o && Math.hypot(o.pose.x - p.x, o.pose.y - p.y) < 4.6) {
        this.sendPose(id, { x: o.pose.x, y: o.pose.y, z: 2, rotationRad: 0 }, `disposed:${wid}`);
        this.host.sound('metal');
        return true;
      }
    }
    return false;
  }

  /** Vidrio roto soltado sobre un contenedor: queda desechado (§18.4). */
  private disposeGlassIfOver(id: string, p: Pose): boolean {
    if (!this.w.vessels[id]?.broken && !(id === 'rod' && this.w.rod.broken)) return false;
    for (const wid of ['waste_glass', 'waste_metals', 'waste_iron', 'waste_acidbase', 'waste_solids']) {
      const o = this.w.objects[wid];
      if (o && Math.hypot(o.pose.x - p.x, o.pose.y - p.y) < 4.6) {
        this.sendPose(id, { x: o.pose.x, y: o.pose.y, z: 2, rotationRad: 0 }, `disposed:${wid}`);
        this.host.sound('break');
        return true;
      }
    }
    return false;
  }

  // ─────────────── Goteros y piseta ───────────────

  /** P con el gotero: aspira dentro de un frasco o suelta una gota sobre el receptor. */
  private dropperAction(repeat: boolean) {
    const h = this.held;
    if (!h || h.kind !== 'dropper') return;
    const m = h.magnet;
    if (!m) {
      if (!repeat) this.host.notify('info', 'p4.hint.dropperAim');
      return;
    }
    if (m.mode === 'ASPIRATE') {
      const r = this.dispatch({ type: 'aspirate', dropperId: h.id, sourceId: m.id });
      if (r.ok) this.host.sound('squeeze');
      else if (r.code === 'SOURCE_EMPTY') this.host.notify('warn', 'p4.hint.sourceEmpty');
      return;
    }
    const d = this.w.vessels[h.id];
    if (!d || liquidMl(d) < 0.003) {
      if (!repeat) this.host.notify('info', 'p4.hint.dropperEmpty');
      return;
    }
    const r = this.dispatch({ type: 'drop', dropperId: h.id, targetId: m.id });
    if (r.ok) {
      const o = this.w.objects[h.id];
      const look = this.lab.frame(this.now, 0).look(h.id);
      if (o) this.drops.push({ x: o.pose.x, y: o.pose.y, z: o.pose.z - 0.2, vz: 0, color: look ? look.bulkRgb : [0.8, 0.9, 1], to: surfaceZ(this.w, this.ctx, m.id) });
      this.host.sound('drip');
    } else if (r.code === 'HOT_WATER_MG') this.host.notify('warn', 'p4.hint.waitCool');
  }

  startSqueeze() {
    const h = this.held;
    if (!h || h.kind !== 'washBottle') return;
    const target = h.magnet?.id ?? null;
    if (!target) {
      this.host.notify('info', 'p4.hint.washAim');
      return;
    }
    const r = this.dispatch({ type: 'squeeze', washId: h.id, targetId: target, rateMlS: 0.8 });
    if (!r.ok && r.code === 'HOT_WATER_MG') this.host.notify('warn', 'p4.hint.waitCool');
    else this.host.sound('squeeze');
  }

  stopSqueeze() {
    if (this.w.squeezes.wash) this.dispatch({ type: 'stopSqueeze', washId: 'wash' });
  }

  // ─────────────── Vertido ───────────────

  private pourTargetAt(id: string, x: number, y: number): string | null {
    const w = this.w;
    const v = w.vessels[id];
    if (!v) return null;
    const targets = POUR_TARGETS[v.kind];
    if (!targets || liquidMl(v) < 0.05) return null;
    let best: string | null = null;
    let bestGap = POUR_CAPTURE_CM;
    for (const t of Object.values(w.vessels)) {
      if (t.id === id || !targets.includes(t.kind) || t.broken) continue;
      const o = w.objects[t.id];
      if (!o || o.support === 'hand' || o.support === 'falling' || o.support.startsWith('disposed:') || o.support.startsWith('tongs:')) continue;
      const gap = Math.hypot(o.pose.x - x, o.pose.y - y) - footR(v.kind) - (t.kind === 'SINK' ? 10 : footR(t.kind));
      if (gap < bestGap) {
        bestGap = gap;
        best = t.id;
      }
    }
    return best;
  }

  /** Pose acoplada: el pico sobre el centro de la boca del receptor (no se separa al inclinar). */
  private pourDockPose(id: string, targetId: string, side: 1 | -1, a: number): { x: number; y: number; z: number } {
    const v = this.w.vessels[id];
    const sh = SHAPES4[v.kind]!;
    const m = mouthOf(this.w, this.ctx, targetId)!;
    const lip = rotateLocal(side * sh.r, sh.h, a);
    const x = m.x - lip[0];
    const R = footR(v.kind);
    const corners = ([[-R, 0], [R, 0], [R, sh.h], [-R, sh.h]] as Array<[number, number]>).map(([lx, lz]) => rotateLocal(lx, lz, a));
    const lowest = Math.min(...corners.map((q) => q[1]));
    // Ninguna parte del recipiente baja por debajo del borde del receptor dentro de su anchura.
    const rt = this.w.vessels[targetId].kind === 'SINK' ? 10 : footR(this.w.vessels[targetId].kind);
    let over = Infinity;
    for (const q of corners) if (Math.abs(x + q[0] - m.x) < rt) over = Math.min(over, q[1]);
    const z = Math.max(m.z + 0.6 - lip[1], Number.isFinite(over) ? m.z + 0.15 - over : -Infinity, -lowest);
    return { x, y: m.y, z };
  }

  private updatePour(id: string) {
    const w = this.w;
    const v = w.vessels[id];
    const o = w.objects[id];
    const sh = v ? SHAPES4[v.kind] : undefined;
    if (!v || !o || !sh) return;
    const theta = o.pose.rotationRad;
    const deg = Math.abs((theta * 180) / Math.PI);
    const lv = liquidMl(v);
    const rate = lv > 0 && deg > 2 ? pourRate(sh, theta, lv, 1) : 0;
    const lp = lipPoint(sh, theta);
    const lipX = o.pose.x + lp[0];
    const lipZ = o.pose.z + lp[1];
    const target = this.receiverAt(lipX, o.pose.y, lipZ, id);
    // Muy inclinado, un clavo o tira de metal que estaba dentro se desliza afuera, al receptor (o a la mesada).
    if (deg > 100) {
      for (const m of ['nail', 'al_strip']) {
        const mo = w.objects[m];
        if (mo?.support !== `in:${id}`) continue;
        const tv = target ? w.vessels[target] : null;
        if (tv && (tv.kind === 'WASTE' || tv.kind === 'SINK')) this.sendPose(m, { x: w.objects[target!].pose.x, y: w.objects[target!].pose.y, z: 2, rotationRad: 0 }, `disposed:${target}`);
        else if (tv) this.sendPose(m, { ...w.objects[target!].pose, z: w.objects[target!].pose.z + 0.3, rotationRad: 0 }, `in:${target}`);
        else this.layOnBench(m, lipX, o.pose.y, 0.2);
        this.host.sound('metal');
      }
    }
    const prev = this.pourSent.get(id);
    if (rate > 0.001) {
      if (target) {
        const ref = disposalRefusal(w, this.ctx, id, target);
        if (ref) {
          this.warn(`p4.hint.${ref}`);
          this.pourHold = false;
          this.pourAuto = true;
          if (prev) this.stopPour(id);
          return;
        }
      }
      const changed = !prev || prev.target !== target || Math.abs(prev.rate - rate) > Math.max(0.03, prev.rate * 0.12) || this.now - prev.t > 0.5;
      if (changed) {
        const r = this.dispatch({ type: 'setPour', sourceId: id, targetId: target, rateMlS: rate, tiltDeg: deg });
        if (!r.ok) {
          this.pourHold = false;
          this.pourAuto = true;
          if (r.code === 'HOT_WATER_MG') this.warn('p4.hint.waitCool');
          return;
        }
        this.pourSent.set(id, { target, rate, t: this.now });
        if (!prev) this.host.sound('pour');
      }
    } else if (prev) this.stopPour(id);
  }

  private stopPour(id: string) {
    if (this.pourSent.has(id)) {
      this.dispatch({ type: 'stopPour', sourceId: id });
      this.pourSent.delete(id);
    }
  }

  /** Recipiente cuya boca intercepta la vertical que baja desde el pico. */
  receiverAt(x: number, y: number, z: number, exclude: string): string | null {
    let best: string | null = null;
    let bestZ = -Infinity;
    for (const v of Object.values(this.w.vessels)) {
      if (v.id === exclude || v.broken || v.kind === 'DROPPER') continue;
      const o = this.w.objects[v.id];
      if (!o || o.support === 'hand' || o.support.startsWith('disposed:')) continue;
      const m = mouthOf(this.w, this.ctx, v.id);
      if (!m) continue;
      const tol = v.kind === 'TUBE' || v.kind === 'CYL10' || v.kind === 'CYL25' ? 0.45 : 0.25;
      if (Math.hypot(m.x - x, (m.y - y) * 0.8) <= m.r + tol && m.z <= z + 0.5 && m.z > bestZ) {
        best = v.id;
        bestZ = m.z;
      }
    }
    return best;
  }

  private pourDockHandled(h: Held, dt: number, tx: number, ty: number): boolean {
    const w = this.w;
    const v = w.vessels[h.id];
    if (!v || !POUR_TARGETS[v.kind] || !SHAPES4[v.kind]) return false;
    let d = this.pourDock?.sourceId === h.id ? this.pourDock : null;
    if (d) {
      const t = w.objects[d.targetId];
      if (!t || w.vessels[d.targetId]?.broken || Math.hypot(t.pose.x - tx, t.pose.y - ty) - footR(v.kind) - (w.vessels[d.targetId].kind === 'SINK' ? 10 : footR(w.vessels[d.targetId].kind)) > POUR_RELEASE_CM) {
        this.pourDock = null;
        this.pourHold = false;
        if (this.pourAuto) h.tilt = 0;
        this.pourAuto = false;
        return false;
      }
    } else {
      const t = this.pourTargetAt(h.id, tx, ty);
      if (!t) {
        this.pourHover = null;
        return false;
      }
      if (this.pourHover?.targetId !== t) this.pourHover = { targetId: t, since: this.now };
      if (this.now - this.pourHover.since < POUR_DWELL_S) return false;
      const to = w.objects[t];
      d = { sourceId: h.id, targetId: t, side: to.pose.x >= tx ? 1 : -1, settled: false };
      this.pourDock = d;
      this.pourHover = null;
      this.host.sound('clink');
      this.hintOnce('p4.hint.pourDocked');
    }
    let mag = Math.max(0, d.side * h.tilt);
    // Los frascos grandes se inclinan más despacio: su caudal crece muy rápido con el ángulo.
    const tiltSpeed = v.kind === 'BOTTLE' ? POUR_TILT_SPEED * 0.5 : POUR_TILT_SPEED;
    if (this.pourHold) mag = Math.min(POUR_MAX_TILT, mag + tiltSpeed * dt);
    else if (this.pourAuto) {
      mag = Math.max(0, mag - POUR_RETURN_SPEED * dt);
      if (mag === 0) this.pourAuto = false;
    }
    h.tilt = d.side * mag;
    const o = w.objects[h.id];
    const cur = o.pose.rotationRad + (h.tilt - o.pose.rotationRad) * Math.min(1, dt * 8);
    const goal = this.pourDockPose(h.id, d.targetId, d.side, cur);
    let { x, y, z } = goal;
    if (!d.settled) {
      const k = Math.min(1, dt * 12);
      x = o.pose.x + (goal.x - o.pose.x) * k;
      y = o.pose.y + (goal.y - o.pose.y) * k;
      z = o.pose.z + (goal.z - o.pose.z) * k;
      if (Math.hypot(goal.x - x, goal.y - y, goal.z - z) < 0.15) d.settled = true;
    }
    this.sendPose(h.id, { x, y, z, rotationRad: cur }, 'hand');
    h.curZ = z;
    this.updatePour(h.id);
    return true;
  }

  // ─────────────── Imanes ───────────────

  private dropperMagnet(h: Held, x: number, y: number): Magnet | null {
    const cur = h.magnet;
    if (cur && Math.hypot(x - cur.x, y - cur.y) < 2.4) return cur;
    for (const v of Object.values(this.w.vessels)) {
      if (v.kind === 'DROPPER' || v.kind === 'WASTE' || v.kind === 'SINK' || v.kind === 'WASH_BOTTLE' || v.broken) continue;
      const o = this.w.objects[v.id];
      if (!o || o.support === 'hand' || o.support.startsWith('disposed:') || o.support === 'falling' || o.support.startsWith('tongs:')) continue;
      const m = mouthOf(this.w, this.ctx, v.id)!;
      if (Math.hypot(x - m.x, y - m.y) > Math.max(1.3, m.r * 0.9)) continue;
      if (v.kind === 'DROPPER_BOTTLE' || v.kind === 'BOTTLE') return { id: v.id, x: m.x, y: m.y, z: o.pose.z + 1.5, mode: 'ASPIRATE' };
      // Sobre la boca del receptor (sin tocarlo, §16.2: el gotero no debe contaminarse).
      return { id: v.id, x: m.x, y: m.y, z: m.z + 0.9, mode: 'DROP' };
    }
    return null;
  }

  private inMagnet(h: Held, x: number, y: number): Magnet | null {
    const cur = h.magnet;
    if (cur && Math.hypot(x - cur.x, y - cur.y) < 2.6) return cur;
    const kinds: VesselKind[] = ['BEAKER100', 'TUBE', 'CAPSULE', 'CYL10', 'CYL25'];
    for (const v of Object.values(this.w.vessels)) {
      if (!kinds.includes(v.kind) || v.broken) continue;
      const o = this.w.objects[v.id];
      if (!o || o.support === 'hand' || o.support.startsWith('disposed:') || o.support === 'falling') continue;
      if (h.kind === 'probe' && v.kind !== 'BEAKER100' && v.kind !== 'TUBE' && v.kind !== 'CAPSULE') continue;
      const m = mouthOf(this.w, this.ctx, v.id)!;
      if (Math.hypot(x - m.x, y - m.y) > Math.max(1.4, m.r)) continue;
      const bottom = o.pose.z + (PROFILE_OF[v.kind]?.bottomY ?? 0.2);
      if (h.kind === 'rod') return { id: v.id, x: m.x + Math.min(0.6, m.r * 0.4), y: m.y, z: bottom + 0.15, mode: 'IN' };
      // Sonda: sumergida pero sin tocar el fondo (§16.5): a media profundidad, como máximo 1,2 cm.
      const surf = surfaceZ(this.w, this.ctx, v.id);
      const z = bottom + Math.max(0.2, Math.min((surf - bottom) * 0.5, 1.2));
      return { id: v.id, x: m.x - Math.min(0.5, m.r * 0.3), y: m.y, z, mode: 'IN' };
    }
    return null;
  }

  private nozzleMagnet(h: Held, x: number, y: number): Magnet | null {
    // Para la piseta, (x, y) es la posición del frasco; la boquilla está desplazada a la derecha.
    const nx = x + WASH_NOZZLE.dx;
    const cur = h.magnet;
    if (cur && Math.hypot(nx - cur.x, y - cur.y) < 3) return cur;
    for (const v of Object.values(this.w.vessels)) {
      if (!['CYL10', 'CYL25', 'BEAKER100', 'TUBE', 'CAPSULE'].includes(v.kind) || v.broken) continue;
      const o = this.w.objects[v.id];
      if (!o || o.support === 'hand' || o.support.startsWith('disposed:')) continue;
      const m = mouthOf(this.w, this.ctx, v.id)!;
      if (Math.hypot(nx - m.x, y - m.y) > Math.max(2, m.r + 0.6)) continue;
      return { id: v.id, x: m.x, y: m.y, z: m.z + 1.2, mode: 'NOZZLE' };
    }
    return null;
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const h = this.held;
    const w = this.w;
    this.clampReady = false;
    if (h && this.obj(h.id) && this.view) {
      if (!h.keyboard && this.pointer) {
        const p = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
        h.x = p.x;
        h.y = p.y;
      }
      const o = this.obj(h.id)!;
      let tx = h.x + h.ox;
      let ty = h.y + h.oy;
      let tz = h.z;
      if (h.lifting) {
        if (Math.abs(h.curZ - h.z) < 0.4 || h.curZ > h.from.pose.z + 6) h.lifting = false;
        else {
          tx = h.from.pose.x;
          ty = h.from.pose.y;
        }
      }
      // Seguridad: la fenolftaleína (etanol) no se acerca a la llama (§18.3).
      if (isLit(w.gas) && (h.id === 'pheno' || h.id === 'dropper_pheno')) {
        const m = mouthPos(w.gas, this.ctx.gasCtx);
        const d = Math.hypot(tx - m.x, ty - m.y);
        const lim = w.params.ethanolSafeCm + 1;
        if (d < lim) {
          tx = m.x + ((tx - m.x) / (d || 1)) * lim;
          ty = m.y + ((ty - m.y) / (d || 1)) * lim;
          this.warn('p4.hint.ethanolKeepAway', 5);
        }
      }
      // Recipientes: acople para verter.
      const docked = !h.gas && w.vessels[h.id] && !h.lifting ? this.pourDockHandled(h, dt, tx, ty) : false;
      if (!docked) {
        // Imanes de herramientas (no mientras se saca del soporte: primero sube en vertical).
        if (h.lifting) h.magnet = null;
        else if (h.kind === 'dropper') h.magnet = this.dropperMagnet(h, tx, ty);
        else if (h.kind === 'rod' || h.kind === 'probe') h.magnet = this.inMagnet(h, tx, ty);
        else if (h.kind === 'washBottle') h.magnet = this.nozzleMagnet(h, tx, ty);
        else h.magnet = null;
        let px = tx;
        let py = ty;
        if (h.magnet) {
          if (h.kind === 'washBottle') {
            px = h.magnet.x - WASH_NOZZLE.dx;
            py = h.magnet.y;
            tz = h.magnet.z - WASH_NOZZLE.z;
          } else {
            px = h.magnet.x;
            py = h.magnet.y;
            tz = h.magnet.z;
          }
        }
        const r = w.vessels[h.id] ? footR(w.vessels[h.id].kind) : h.kind === 'crucibleTongs' || h.kind === 'tubeTongs' ? 0.6 : 0.4;
        const floor = this.clearZ(px, py, r, h.id) + (h.kind === 'burner' ? 0 : 0.3);
        if (!h.magnet && !TOOL_KINDS.has(h.kind)) tz = Math.max(tz, floor);
        else if (!h.magnet) tz = Math.max(tz, floor);
        const k = Math.min(1, dt * (h.magnet ? 8 : 16));
        const nx = o.pose.x + (px - o.pose.x) * k;
        const ny = o.pose.y + (py - o.pose.y) * k;
        h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
        const nz = h.kind === 'burner' ? 0 : h.curZ;
        // Inclinación libre (rueda o ⟲ ⟳) y vuelta a vertical.
        const rot = o.pose.rotationRad + (h.tilt - o.pose.rotationRad) * Math.min(1, dt * 8);
        if (Math.hypot(nx - o.pose.x, ny - o.pose.y, nz - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001) {
          this.sendPose(h.id, { x: nx, y: ny, z: nz, rotationRad: rot }, 'hand');
        }
        if (Math.abs(o.pose.rotationRad) > 0.05 && w.vessels[h.id]) this.updatePour(h.id);
        else this.stopPour(h.id);
      }
      // Movimiento para agitar (tubo sacudido; varilla dentro del recipiente moviéndose en círculos).
      h.track.push({ x: tx, y: ty, t: this.now });
      while (h.track.length && this.now - h.track[0].t > 0.6) h.track.shift();
      this.measureAgitation(h, dt);
      if (this.pointer && !h.keyboard) {
        const W = this.view.viewW();
        if (this.pointer.x < 30) this.view.edgePan(-1, dt);
        else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
      }
      // Gotero: mantener P suelta gotas (≈ 3 por segundo).
      if (h.kind === 'dropper' && this.primary && h.magnet?.mode === 'DROP') {
        this.dropTimer += dt;
        if (this.dropTimer > 0.33) {
          this.dropTimer = 0;
          this.dropperAction(true);
        }
      }
      // ¿La pinza puede sujetar algo?
      if ((h.kind === 'tubeTongs' || h.kind === 'crucibleTongs') && !w.tongs[h.id]?.holding) this.clampReady = !!this.grippable(h.id) && this.grippable(h.id)!.grip > 0.3;
      // Lija sostenida cerca del clavo: frotar lija.
      if (h.kind === 'sandpaper' && this.primary) {
        this.stirSent += dt;
        if (this.stirSent > 0.35) {
          this.stirSent = 0;
          this.sandIfNear();
        }
      }
    } else if (this.stirKey > 0) this.stirSelected(this.stirKey);
    this.followTongs();
    this.updateDrops(dt);
    if (w.gas.lighter.sparking) {
      this.sparkSound -= dt;
      if (this.sparkSound <= 0) {
        this.host.sound('spark');
        this.sparkSound = 0.35;
      }
    }
    // Pantalla y vista de la combustión (geometría real, §13.1).
    this.shieldTimer -= dt;
    if (this.shieldTimer <= 0) {
      this.shieldTimer = 0.2;
      const a = this.shieldAlignment();
      // Colocada = en su pie junto al mechero (la alineación con la vista se mide aparte, al mirar la combustión).
      const sp = w.objects.shield?.pose;
      const mp = mouthPos(w.gas, this.ctx.gasCtx);
      const placed = w.objects.shield?.support === 'stand' && !!sp && Math.hypot(sp.x - mp.x, sp.y - mp.y) < 35;
      const view = this.mgViewState();
      const key = `${a.toFixed(2)}|${placed}|${view.inView}|${view.shielded}`;
      if (key !== this.lastShield) {
        this.lastShield = key;
        this.dispatch({ type: 'setShield', alignment: a, placed });
        this.dispatch({ type: 'setMgView', inView: view.inView, shielded: view.shielded });
      }
      // Advertencias tempranas (la interfaz las muestra antes del bloqueo del dominio).
      const ribbonInTongs = Object.values(w.objects).some((o) => o.kind === 'mgRibbon' && o.support.startsWith('tongs:'));
      if (ribbonInTongs && !w.safety.mgWarningAccepted) this.host.requestMgWarning?.();
      if (isLit(w.gas) && ethanolNearBurner(w, this.ctx)) this.warn('p4.hint.ethanolKeepAway', 6);
    }
  }

  /** Lo sujeto por una pinza sigue a su punta (tubo, clavo, cápsula, cinta de Mg). */
  private followTongs() {
    const w = this.w;
    for (const [tid, tg] of Object.entries(w.tongs)) {
      if (!tg.holding) continue;
      const tip = this.tongsTip(tid);
      const o = w.objects[tg.holding];
      if (!tip || !o) continue;
      let target: Pose;
      if (o.kind === 'capsule') target = { x: tip.x, y: tip.y + CAPSULE_PROFILE.outerR, z: tip.z - CAPSULE_PROFILE.rimY, rotationRad: 0 };
      else if (o.kind === 'tube') target = { x: tip.x, y: tip.y, z: tip.z - 11, rotationRad: 0 };
      // La cinta asoma de la pinza hacia adelante: su extremo libre (origen) es lo que entra a la llama.
      else if (o.kind === 'mgRibbon') target = { x: tip.x + MG_RIBBON.length * 0.85, y: tip.y, z: tip.z - 0.2, rotationRad: 0 };
      else target = { x: tip.x, y: tip.y, z: tip.z - 4.6, rotationRad: 0 };
      if (Math.hypot(o.pose.x - target.x, o.pose.y - target.y, o.pose.z - target.z) > 0.01) this.dispatch({ type: 'setPose', id: o.id, pose: target, support: `tongs:${tid}` });
    }
  }

  private measureAgitation(h: Held, dt: number) {
    const w = this.w;
    const tr = h.track;
    if (tr.length < 3) return;
    let intensity = 0;
    let target: string | null = null;
    let tool: 'ROD' | 'SHAKE' | 'SWIRL' = 'SHAKE';
    if (h.kind === 'rod' && h.magnet?.mode === 'IN') {
      // Giro del puntero alrededor del centro del recipiente.
      const c = this.w.objects[h.magnet.id]?.pose;
      if (c) {
        const last = tr[tr.length - 1];
        const ang = Math.atan2(last.y - c.y, last.x - c.x);
        if (this.lastAngle !== null) {
          let d = ang - this.lastAngle;
          if (d > Math.PI) d -= 2 * Math.PI;
          if (d < -Math.PI) d += 2 * Math.PI;
          this.angAcc = this.angAcc * Math.exp(-dt * 3) + Math.abs(d);
        }
        this.lastAngle = ang;
        intensity = Math.min(1, this.angAcc / (2 * Math.PI * 0.6));
        target = h.magnet.id;
        tool = 'ROD';
      }
    } else {
      this.lastAngle = null;
      if (h.kind === 'tube' || h.kind === 'capsule' || h.kind === 'beaker' || h.kind === 'tubeTongs') {
        // Sacudida: recorrido mucho mayor que el desplazamiento neto en el último medio segundo.
        let path = 0;
        for (let i = 1; i < tr.length; i++) path += Math.hypot(tr[i].x - tr[i - 1].x, tr[i].y - tr[i - 1].y);
        const net = Math.hypot(tr[tr.length - 1].x - tr[0].x, tr[tr.length - 1].y - tr[0].y);
        const span = Math.max(0.1, tr[tr.length - 1].t - tr[0].t);
        intensity = Math.min(1, Math.max(0, path - net * 1.2) / span / 40);
        target = h.kind === 'tubeTongs' ? w.tongs[h.id]?.holding ?? null : h.id;
        tool = h.kind === 'capsule' || h.kind === 'beaker' ? 'SWIRL' : 'SHAKE';
      }
    }
    if (this.stirKey > 0 && target === null && (h.kind === 'rod' || h.kind === 'tube')) target = h.kind === 'rod' ? h.magnet?.id ?? null : h.id;
    if (this.stirKey > 0) intensity = Math.max(intensity, this.stirKey);
    this.stirSent += dt;
    if (target && intensity > 0.05 && this.stirSent > 0.2 && w.vessels[target]) {
      this.stirSent = 0;
      this.dispatch({ type: 'setAgitation', id: target, tool, intensity });
      if (intensity > 0.2) this.host.sound('stir');
    }
  }

  private updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vz -= 900 * dt;
      d.z += d.vz * dt;
      if (d.z <= d.to) this.drops.splice(i, 1);
    }
  }

  /** Fracción de la cinta (o de la llama) que se ve a través de la pantalla desde la cámara. */
  shieldAlignment(): number {
    const s = this.lab.shield;
    const cam = this.lab.camPos;
    const w = this.w;
    if (!s.on) return 0;
    const pts: Array<{ x: number; y: number; z: number }> = [];
    const burning = Object.values(w.ribbons).filter((r) => r.phase === 'BRIGHT_COMBUSTION' || r.phase === 'IGNITION_THRESHOLD');
    if (burning.length) for (const r of burning) pts.push(w.objects[r.id].pose);
    else {
      const m = mouthPos(w.gas, this.ctx.gasCtx);
      for (let i = 0; i < 5; i++) pts.push({ x: m.x, y: m.y, z: m.z + 1 + i * 2 });
    }
    let inside = 0;
    for (const p of pts) if (this.rayHitsShield(cam, p)) inside++;
    return inside / pts.length;
  }

  private rayHitsShield(cam: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }): boolean {
    const s = this.lab.shield;
    // Escena: X = x, Y = z, Z = −y.
    const px = p.x;
    const py = p.z;
    const pz = -p.y;
    const dx = px - cam.x;
    const dy = py - cam.y;
    const dz = pz - cam.z;
    const den = dx * s.n.x + dy * s.n.y + dz * s.n.z;
    if (Math.abs(den) < 1e-6) return false;
    const t = ((s.center.x - cam.x) * s.n.x + (s.center.y - cam.y) * s.n.y + (s.center.z - cam.z) * s.n.z) / den;
    if (t <= 0 || t >= 1) return false;
    const hx = cam.x + dx * t - s.center.x;
    const hy = cam.y + dy * t - s.center.y;
    const hz = cam.z + dz * t - s.center.z;
    return Math.abs(hx * s.u.x + hy * s.u.y + hz * s.u.z) < s.halfW && Math.abs(hx * s.v.x + hy * s.v.y + hz * s.v.z) < s.halfH;
  }

  /** ¿Está la cinta encendida en la vista? ¿La cubre la pantalla? */
  private mgViewState(): { inView: boolean; shielded: boolean } {
    const w = this.w;
    const cam = this.lab.camera;
    const burning = Object.values(w.ribbons).find((r) => r.phase === 'BRIGHT_COMBUSTION');
    if (!burning || !cam) return { inView: false, shielded: false };
    const p = w.objects[burning.id].pose;
    const s = cam.screenOf(p.x, p.y, p.z);
    const W = this.view?.viewW() ?? 1000;
    const inView = s.x > -50 && s.x < W + 50 && s.y > -50 && s.y < 2000;
    return { inView, shielded: this.lab.shield.on && this.rayHitsShield(this.lab.camPos, p) };
  }

  hosePointsForPick() {
    return hosePoints(this.w.gas, this.ctx.gasCtx, 10);
  }
}
