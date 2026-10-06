/**
 * Interacción de la Práctica 5: gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js.
 * - Arrastre con altura de transporte: lo que se lleva pasa por encima de lo que hay debajo (no lo atraviesa).
 * - Tubo: al soltarlo encaja en el platillo, en la pinza del soporte o en la gradilla refractaria; caliente no se toma
 *   con la mano (lo decide el dominio: quemadura) — se usa la pinza para tubo (P sujeta/suelta).
 * - Espátulas: el «imán» las lleva a la boca del frasco abierto (P = tomar una porción; rueda = cantidad) o a la boca
 *   del tubo (P = volcar). Fuera del tubo, volcar es un derrame.
 * - Balanza: las pesas corredizas se arrastran sobre su brazo (las de 100 g y 10 g encajan en sus muescas), el tornillo
 *   de cero gira con arrastre vertical o rueda, el nivel se corrige con un clic; R lee la balanza.
 * - Tubo en la mano: golpecitos laterales (moverlo de lado a lado) mezclan; con fuerza, sale polvo.
 * - Mechero: válvulas, encendedor y desplazamiento a lo largo del tubo con los mismos gestos de la Práctica 3.
 */
import type { StoichHost } from './host';
import type { StoichLab3D } from './StoichLab3D';
import type { P5Command } from '../../simulation/stoich-world/commands';
import type { P5ObjKind, P5World, Pose } from '../../simulation/stoich-world/types';
import { tubeAxis, tubeTempC } from '../../simulation/stoich-world/world';
import { isLit, mouthPos } from '../../simulation/flame-world/world';
import type { ValveId } from '../../simulation/flame-world/commands';
import { BURNER } from '../../practices/practice-03/instruments';
import { BALANCE_GEO, CLAMP_ARM, TUBE5 } from '../../practices/practice-05/definition';
import { BEAM } from './objects3d';

export interface PickHit5 {
  id: string;
  part?: string;
}

export interface ViewAdapter5 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHit5 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

type AnyKind = P5ObjKind | 'burner' | 'gasTap' | 'lighter' | 'extinguisher' | 'blanket' | 'emergencyStop' | 'extractor' | 'coDetector';

export type ScoopAmount = 'tip' | 'small' | 'level';

interface Magnet {
  id: string;
  x: number;
  y: number;
  z: number;
  mode: 'SCOOP' | 'TIP' | 'RETURN' | 'PAPER' | 'MOUTH';
}

export interface Held {
  id: string;
  kind: AnyKind;
  gas: boolean;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  magnet: Magnet | null;
  track: Array<{ x: number; t: number }>;
}

const KNOB_PARTS: Record<string, ValveId> = { needleValve: 'NEEDLE', airCollar: 'AIR', tableValve: 'TABLE' };
/** Altura de transporte (cm del origen) de cada objeto, si no hay nada debajo. */
const CARRY_Z: Partial<Record<AnyKind, number>> = {
  spatula: 14, tubeTongs: 16, lighter: BURNER.mouthZ + 0.8, brush: 12, irThermometer: 16, stopper: 18, weighPaper: 3, tube: 12, washBottle: 6, pestle: 3, sugarJar: 3,
};
/** Altura superior de lo que hay sobre la mesada (para pasar por encima). */
const TOP: Partial<Record<AnyKind, number>> = {
  balance: 15, bottle: 13.2, rack: 8.5, sugarJar: 9, pestle: 9, washBottle: 16, waste: 12.5, stand: 1.4, burner: BURNER.mouthZ + 0.5, irThermometer: 3.2,
};
const FOOT: Partial<Record<AnyKind, number>> = { balance: 20, bottle: 3.2, rack: 8, sugarJar: 3.4, pestle: 4.2, washBottle: 3.4, waste: 5.2, stand: 9, burner: 4, irThermometer: 4 };
/** Punta (cuchara) de la espátula respecto a su origen. */
const SPOON_DX = 8.4;
const TONGS_TIP = 17;
/** Paso de la pesa fina al arrastrar (g). */
const FINE_STEP = 0.05;

export class StoichController {
  view: ViewAdapter5 | null = null;
  held: Held | null = null;
  hovered: string | null = null;
  /** Cantidad que se toma con la espátula (la rueda la cambia). */
  scoopAmount: ScoopAmount = 'small';
  /** ¿La pinza para tubo está en posición de sujetar el tubo? */
  clampReady = false;
  private knob: { valve: ValveId; sx: number; sy: number; start: number } | null = null;
  private rider: { beam: 0 | 1 | 2 } | null = null;
  private screw: { sy: number; acc: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private now = 0;
  private tapDir = 0;
  private tapCool = 0;
  private sparkSound = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: StoichHost, private lab: StoichLab3D) {}

  private get w(): P5World {
    return this.host.runtime.world;
  }

  private get ctx() {
    return this.host.runtime.ctx;
  }

  private dispatch(c: P5Command) {
    return this.host.runtime.dispatch(c);
  }

  private blocked(): boolean {
    return !!this.w.safety.incident || this.w.safety.stoppedByTeacher || !!this.w.gas.safety.incident;
  }

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
    if (this.now - (this.lastWarn.get(key) ?? -99) < gapS) return;
    this.lastWarn.set(key, this.now);
    this.host.notify('warn', key, params);
  }

  private run(r: { ok: boolean; code?: string }) {
    if (!r.ok && r.code) this.warn(`p5.cmd.${r.code}`, 2);
    return r;
  }

  // ─────────────── Geometría útil ───────────────

  panPoint() {
    const b = this.w.objects.balance.pose;
    return { x: b.x + BALANCE_GEO.panDx, y: b.y + BALANCE_GEO.panDy, z: BALANCE_GEO.panZ };
  }

  jawsPoint() {
    const s = this.ctx.geo.stand;
    return { x: s.x, y: s.y - CLAMP_ARM, z: this.w.clamp.heightCm };
  }

  tubeMouth() {
    return tubeAxis(this.w, this.ctx).mouth;
  }

  tongsTip(): { x: number; y: number; z: number } | null {
    const t = this.w.objects.tongs?.pose;
    if (!t) return null;
    return { x: t.x + Math.cos(t.rotationRad) * TONGS_TIP, y: t.y + Math.sin(t.rotationRad) * TONGS_TIP, z: t.z + 0.5 };
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
    if (hit.id === 'balance' && hit.part) {
      const m = /^(rider|beam)([012])$/.exec(hit.part);
      if (m) {
        this.rider = { beam: Number(m[2]) as 0 | 1 | 2 };
        this.view.setOrbitEnabled(false);
        if (m[1] === 'beam') this.dragRider(sx, sy);
        return true;
      }
      if (hit.part === 'zeroScrew') {
        this.screw = { sy, acc: 0 };
        this.view.setOrbitEnabled(false);
        this.hintOnce('p5.hint.zeroScrew');
        return true;
      }
      if (hit.part === 'level') {
        this.dispatch({ type: 'levelBalance' });
        this.host.sound('click');
        return true;
      }
      return true;
    }
    if (hit.id.startsWith('bottle_') && hit.part === 'cap') {
      this.toggleBottle(hit.id);
      return true;
    }
    if (this.held && this.held.id === hit.id) return true;
    this.down = true;
    return this.beginDrag(hit.id, false);
  }

  onPointerMove(sx: number, sy: number) {
    this.pointer = { x: sx, y: sy };
    if (this.knob) {
      const d = (this.knob.sy - sy + (sx - this.knob.sx) * 0.5) / 160;
      this.setValve(this.knob.valve, this.knob.start + d);
      return;
    }
    if (this.rider) {
      this.dragRider(sx, sy);
      return;
    }
    if (this.screw) {
      // Arrastre vertical: 40 px = 0,1 g de corrección.
      const d = (this.screw.sy - sy) / 400;
      this.screw.sy = sy;
      this.screw.acc += d;
      if (Math.abs(this.screw.acc) >= 0.01) {
        const step = Math.round(this.screw.acc * 100) / 100;
        this.screw.acc -= step;
        this.dispatch({ type: 'turnZeroScrew', deltaG: step });
      }
      return;
    }
    if (!this.held && this.view) {
      const h = this.view.pick(sx, sy, null);
      this.hovered = h?.id ?? null;
    }
  }

  onPointerUp() {
    if (this.knob || this.rider || this.screw) {
      if (this.rider) this.host.sound('clink');
      this.knob = null;
      this.rider = null;
      this.screw = null;
      this.view?.setOrbitEnabled(true);
      return;
    }
    if (this.held && this.down && !this.held.keyboard) this.release();
    this.down = false;
  }

  /** Lleva la pesa del brazo arrastrado al punto del brazo bajo el puntero. */
  private dragRider(sx: number, sy: number) {
    if (!this.view || !this.rider) return;
    const b = this.rider.beam;
    const bal = this.w.objects.balance.pose;
    const p = this.view.toBench(sx, sy, BEAM.y[b]);
    const lx = p.x - bal.x;
    const u = Math.max(0, Math.min(1, (lx - BEAM.x0) / (BEAM.x1 - BEAM.x0)));
    let v = u * BEAM.max[b];
    v = b === 0 ? Math.round(v / 100) * 100 : b === 1 ? Math.round(v / 10) * 10 : Math.round(v / FINE_STEP) * FINE_STEP;
    if (Math.abs(v - this.w.balance.riders[b]) > 1e-6) {
      this.dispatch({ type: 'setRider', beam: b, valueG: v });
      if (b < 2) this.host.sound('click');
    }
  }

  /** Rueda: espátula = cantidad; herramienta = altura; perilla = válvula; tornillo de cero = ajuste fino. */
  onWheel(dy: number): boolean {
    const dir = dy > 0 ? -1 : 1;
    const h = this.held;
    if (h) {
      if (h.kind === 'lighter') {
        this.setValve('NEEDLE', this.valveValue('NEEDLE') + dir * 0.02);
        return true;
      }
      if (h.kind === 'spatula' && h.magnet?.mode === 'SCOOP') {
        const order: ScoopAmount[] = ['tip', 'small', 'level'];
        const i = Math.max(0, Math.min(2, order.indexOf(this.scoopAmount) + dir));
        this.scoopAmount = order[i];
        this.host.notify('info', `p5.hint.amount.${this.scoopAmount}`);
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
      if (hit?.id === 'balance' && hit.part === 'zeroScrew') {
        this.dispatch({ type: 'turnZeroScrew', deltaG: dir * 0.02 });
        return true;
      }
      if (hit?.id === 'balance' && hit.part === 'rider2') {
        this.nudgeRider(2, dir * FINE_STEP);
        return true;
      }
    }
    return false;
  }

  nudgeRider(beam: 0 | 1 | 2, d: number) {
    const v = this.w.balance.riders[beam] + d;
    this.dispatch({ type: 'setRider', beam, valueG: v });
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
    switch (h.kind) {
      case 'lighter':
        this.dispatch({ type: 'gas', cmd: { type: 'spark', on: true } });
        this.host.sound('spark');
        break;
      case 'tubeTongs':
        this.toggleTongs();
        break;
      case 'spatula':
        this.spatulaAction(false);
        break;
      case 'irThermometer':
        this.measureIR();
        break;
      case 'washBottle':
        this.waterOnTube();
        break;
      case 'brush':
        this.brush();
        break;
      case 'pestle':
        // §9.1: moler el clorato está prohibido; el dominio lo detiene.
        if (this.near(h, this.w.objects.tube.pose, 10) || this.near(h, this.w.objects.bottle_kclo3.pose, 10)) this.run(this.dispatch({ type: 'grind' }));
        break;
      case 'tube':
        if (this.overWaste()) this.disposeResidue();
        else this.tap(0.5);
        break;
    }
  }

  primaryUp() {
    if (!this.primary) return;
    this.primary = false;
    if (this.held?.kind === 'lighter' || this.w.gas.lighter.sparking) this.dispatch({ type: 'gas', cmd: { type: 'spark', on: false } });
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
    if (key === 'r' || key === 'R') {
      this.readBalance();
      return true;
    }
    if (key === 'a' || key === 'A' || key === 'd' || key === 'D') {
      // Llama a lo largo del tubo (vaivén manual).
      this.sweepBurner(key === 'a' || key === 'A' ? -0.5 : 0.5);
      return true;
    }
    const h = this.held;
    if (key === 't' || key === 'T') {
      this.tap(shift ? 1 : 0.5);
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
        ...Object.values(this.w.objects).filter((o) => o.support !== 'disposed').map((o) => ({ id: o.id, x: o.pose.x, y: o.pose.y })),
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
    return false;
  }

  // ─────────────── Tomar y soltar ───────────────

  beginDrag(id: string, keyboard: boolean): boolean {
    const o = this.obj(id);
    if (!o || !o.movable || this.blocked()) return false;
    if (o.support === 'disposed') return false;
    // El tubo sujeto por la pinza para tubo se maneja con la pinza.
    if (id === 'tube' && o.support === 'tongs') return false;
    if (this.held) this.release();
    if (o.gas) {
      const r = this.dispatch({ type: 'gas', cmd: { type: 'pickUp', id, tool: 'HAND' } });
      if (!r.ok) return false;
    }
    if (id === 'stopper' && o.support === 'tube') this.dispatch({ type: 'stopper', on: false });
    if (id === 'tube') {
      // El dominio decide si quema: un tubo caliente se toma con la pinza para tubo.
      const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose, quat: undefined, rotationRad: 0 }, support: 'hand' });
      if (!r.ok) {
        this.host.sound('sizzle');
        this.warn('p5.hint.useTongs', 2);
        return false;
      }
    }
    const carry = CARRY_Z[o.kind];
    const z0 = o.kind === 'burner' ? 0 : Math.max(o.pose.z + 2, carry ?? o.pose.z + 3);
    this.held = {
      id, kind: o.kind, gas: o.gas, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support }, magnet: null, track: [],
    };
    this.sendPose(id, { ...o.pose, quat: undefined }, 'hand');
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'tube' || o.kind === 'bottle' ? 'clink' : 'click');
    if (o.kind === 'spatula') this.hintOnce('p5.hint.spatula');
    if (o.kind === 'tube') this.hintOnce('p5.hint.tube');
    if (o.kind === 'tubeTongs') this.hintOnce('p5.hint.tongs');
    return true;
  }

  private sendPose(id: string, pose: Pose, support?: string) {
    if (this.w.gas.objects[id]) this.dispatch({ type: 'gas', cmd: { type: 'setPose', id, pose, support } });
    else this.dispatch({ type: 'setPose', id, pose, support });
  }

  /** Suelta lo que se sostiene: encaja en un soporte cercano o se apoya en la mesada. */
  release() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const o = this.obj(h.id);
    if (!o) return;
    const p = o.pose;
    switch (h.kind) {
      case 'tube':
        this.placeTube(p);
        return;
      case 'stopper': {
        const m = this.tubeMouth();
        if (Math.hypot(p.x - m.x, p.y - m.y) < 3.5 && Math.abs(p.z - m.z) < 6) {
          this.sendPose('stopper', { x: m.x, y: m.y, z: m.z, rotationRad: 0 }, 'tube');
          this.dispatch({ type: 'stopper', on: true });
          this.host.sound('clink');
          return;
        }
        break;
      }
      case 'burner':
        this.sendPose(h.id, { x: p.x, y: p.y, z: 0, rotationRad: 0 }, 'bench');
        this.host.sound('metal');
        return;
      case 'lighter':
        this.layOnBench(h.id, p.x, p.y, 1.2);
        return;
    }
    this.layOnBench(h.id, p.x, p.y, h.kind === 'spatula' || h.kind === 'brush' ? 0.3 : h.kind === 'tubeTongs' ? 0.4 : 0);
  }

  /** Destino del tubo al soltarlo: platillo, pinza del soporte, gradilla o (acostado) la bandeja. */
  private placeTube(p: Pose, support: 'hand' | 'tongs' = 'hand') {
    const pan = this.panPoint();
    const j = this.jawsPoint();
    const rack = this.ctx.geo.rack;
    if (Math.hypot(p.x - pan.x, p.y - pan.y) < 7) {
      const r = this.dispatch({ type: 'setPose', id: 'tube', pose: { x: pan.x, y: pan.y, z: pan.z, rotationRad: 0 }, support: 'pan' });
      if (r.ok) {
        this.host.sound('clink');
        this.hintOnce('p5.hint.waitPointer');
        return;
      }
      this.run(r);
    }
    if (Math.hypot(p.x - j.x, p.y - j.y) < 9 && Math.abs(p.z + TUBE5.length * 0.6 - j.z) < 14) {
      this.dispatch({ type: 'setPose', id: 'tube', pose: { x: j.x, y: j.y, z: j.z, rotationRad: 0 }, support: 'clamp' });
      this.host.sound('metal');
      if (!this.w.clamp.nutTight) this.warn('p5.hint.nut', 3);
      return;
    }
    if (Math.abs(p.x - rack.x) < 10 && Math.abs(p.y - rack.y) < 7) {
      this.dispatch({ type: 'setPose', id: 'tube', pose: { x: rack.x - 3, y: rack.y, z: 0.6, rotationRad: 0 }, support: 'rack' });
      this.host.sound('clink');
      return;
    }
    void support;
    // Sin soporte: se acuesta (un tubo de pie en la mesada se cae).
    const spot = this.freeSpot(p.x, p.y, 1.2, 'tube');
    const hot = tubeTempC(this.w.tube) > this.w.params.ambientC + 40;
    if (hot) this.warn('p5.hint.hotOnBench', 3);
    const s = Math.SQRT1_2;
    this.dispatch({ type: 'setPose', id: 'tube', pose: { x: spot.x - TUBE5.length / 2, y: spot.y, z: TUBE5.outerR, rotationRad: 0, quat: [0, 0, -s, s] }, support: 'bench' });
    this.host.sound('clink');
  }

  /**
   * Traslado accesible del tubo (panel de acciones): con la mano o con la pinza para tubo, al platillo, la pinza del
   * soporte o la gradilla. Pasa por los mismos comandos que el gesto (un tubo caliente quema si se toma con la mano).
   */
  moveTube(target: 'pan' | 'clamp' | 'rack' | 'hand', viaTongs: boolean) {
    if (this.blocked()) return { ok: false, code: 'BLOCKED' };
    if (this.held) this.release();
    const t = this.w.objects.tube;
    const r = this.dispatch({ type: 'setPose', id: 'tube', pose: { ...t.pose, quat: undefined }, support: viaTongs ? 'tongs' : 'hand' });
    if (!r.ok) {
      this.host.sound('sizzle');
      this.warn('p5.hint.useTongs', 1);
      return r;
    }
    if (target === 'hand') {
      const p = { x: 205, y: 26, z: 8, rotationRad: 0 };
      this.dispatch({ type: 'setPose', id: 'tube', pose: p, support: 'hand' });
      return { ok: true };
    }
    const dest = target === 'pan' ? this.panPoint() : target === 'clamp' ? { ...this.jawsPoint(), z: this.jawsPoint().z - TUBE5.length * 0.6 } : { x: this.ctx.geo.rack.x, y: this.ctx.geo.rack.y, z: 2 };
    this.placeTube({ x: dest.x, y: dest.y, z: dest.z, rotationRad: 0 });
    return { ok: true };
  }

  /** Pantalla de seguridad entre el montaje y la persona (o retirarla). */
  placeShield(on = !this.w.safety.shieldPlaced) {
    const s = this.ctx.geo.stand;
    const pose = on ? { x: s.x + 10, y: s.y - 34, z: 0, rotationRad: 0 } : { x: s.x + 40, y: 52, z: 0, rotationRad: 0 };
    this.dispatch({ type: 'setPose', id: 'shield', pose, support: 'bench' });
    this.host.sound('click');
  }

  /** Espátula sin tenerla en la mano (panel accesible): tomar del frasco o volcar en el tubo. */
  spatulaDirect(spatulaId: string, action: 'scoop' | 'tip' | 'tipHalf', bottleId?: string) {
    if (action === 'scoop' && bottleId) {
      const r = this.run(this.dispatch({ type: 'scoop', spatulaId, bottleId, amount: this.scoopAmount }));
      if (r.ok) this.host.sound('sand');
      return r;
    }
    const r = this.run(this.dispatch({ type: 'tip', spatulaId, targetId: 'tube', fraction: action === 'tipHalf' ? 0.5 : 1 }));
    if (r.ok) this.host.sound('sand');
    return r;
  }

  cancel() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    this.sendPose(h.id, h.from.pose, h.from.support === 'hand' ? 'bench' : h.from.support);
  }

  private occupied(x: number, y: number, r: number, exclude: string): boolean {
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support !== 'bench') continue;
      const rr = FOOT[o.kind] ?? (o.kind === 'tray' || o.kind === 'shield' ? 0 : 1.2);
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
    const spot = this.freeSpot(Math.max(-8, Math.min(600, x0)), Math.max(3, Math.min(60, y0)), 1, id);
    this.sendPose(id, { x: spot.x, y: spot.y, z, rotationRad: 0 }, 'bench');
    this.host.sound('click');
  }

  /** Altura mínima para pasar por encima de lo que hay debajo (no atravesar objetos). */
  private clearZ(x: number, y: number, r: number, exclude: string): number {
    let z = 0;
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand' || o.support === 'disposed') continue;
      const top = TOP[o.kind];
      const rr = FOOT[o.kind];
      if (top === undefined || rr === undefined) continue;
      if (Math.hypot(x - o.pose.x, y - o.pose.y) < rr + r) z = Math.max(z, o.pose.z + top + 0.4);
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

  /** Mueve el mechero a lo largo del tubo (técnica: no calentar siempre el mismo punto). */
  sweepBurner(dx: number) {
    const b = this.w.gas.objects.burner;
    if (!b || b.support === 'hand') return;
    this.dispatch({ type: 'gas', cmd: { type: 'setPose', id: 'burner', pose: { ...b.pose, x: b.pose.x + dx }, support: 'bench' } });
  }

  /** Lleva el mechero bajo la muestra (en profundidad) sin cambiar su posición a lo largo del tubo. */
  burnerUnderSample() {
    const ax = tubeAxis(this.w, this.ctx);
    this.dispatch({ type: 'gas', cmd: { type: 'setPose', id: 'burner', pose: { x: ax.sample.x, y: ax.sample.y, z: 0, rotationRad: 0 }, support: 'bench' } });
  }

  burnerAway() {
    const b = this.w.gas.objects.burner;
    if (!b) return;
    this.dispatch({ type: 'gas', cmd: { type: 'setPose', id: 'burner', pose: { x: b.pose.x + 22, y: Math.max(14, b.pose.y - 6), z: 0, rotationRad: 0 }, support: 'bench' } });
  }

  nudgeHeight(dz: number) {
    const h = this.held;
    if (!h || h.kind === 'burner') return;
    h.z = Math.max(0, Math.min(40, h.z + dz));
  }

  // ─────────────── Balanza ───────────────

  readBalance() {
    const r = this.dispatch({ type: 'readBalance' });
    this.host.sound('click');
    return r;
  }

  toggleBottle(id: string) {
    const b = this.w.bottles[id];
    if (!b) return;
    this.dispatch({ type: 'openBottle', id, open: !b.open });
    this.host.sound('click');
  }

  // ─────────────── Espátulas ───────────────

  private spatulaMagnet(h: Held, x: number, y: number): Magnet | null {
    const tipX = x + SPOON_DX;
    const s = this.w.spatulas[h.id];
    if (!s) return null;
    const loaded = s.loadMol.KClO3 + s.loadMol.MnO2 > 0;
    for (const b of Object.values(this.w.bottles)) {
      const bp = this.w.objects[b.id].pose;
      if (Math.hypot(tipX - bp.x, y - bp.y) < 5) {
        if (!b.open) {
          this.warn('p5.hint.bottleClosed', 4);
          return null;
        }
        return { id: b.id, x: bp.x, y: bp.y, z: bp.z + 10.6, mode: loaded ? 'RETURN' : 'SCOOP' };
      }
    }
    const m = this.tubeMouth();
    const t = this.w.objects.tube;
    if (t.support !== 'clamp' && Math.hypot(tipX - m.x, y - m.y) < 4.5) return { id: 'tube', x: m.x, y: m.y, z: m.z + 0.6, mode: 'TIP' };
    const paper = this.w.objects.weigh_paper;
    if (paper && paper.support !== 'disposed' && Math.hypot(tipX - paper.pose.x, y - paper.pose.y) < 5) return { id: 'weigh_paper', x: paper.pose.x, y: paper.pose.y, z: paper.pose.z + 1.5, mode: 'PAPER' };
    return null;
  }

  /** P con la espátula: tomar del frasco, volcar en el tubo (o en el papel), devolver al frasco (error). */
  spatulaAction(half: boolean) {
    const h = this.held;
    if (!h || h.kind !== 'spatula') return;
    const s = this.w.spatulas[h.id];
    const m = h.magnet;
    const loaded = s.loadMol.KClO3 + s.loadMol.MnO2 > 0;
    if (m?.mode === 'SCOOP') {
      const r = this.run(this.dispatch({ type: 'scoop', spatulaId: h.id, bottleId: m.id, amount: this.scoopAmount }));
      if (r.ok) this.host.sound('sand');
      return;
    }
    if (m?.mode === 'RETURN') {
      this.dispatch({ type: 'returnToBottle', spatulaId: h.id, bottleId: m.id });
      this.host.sound('sand');
      return;
    }
    if (!loaded) {
      this.hintOnce('p5.hint.spatulaEmpty');
      return;
    }
    const target = m?.mode === 'TIP' ? 'tube' : m?.mode === 'PAPER' ? 'weigh_paper' : 'bench';
    const r = this.run(this.dispatch({ type: 'tip', spatulaId: h.id, targetId: target, fraction: half ? 0.5 : 1 }));
    if (r.ok) this.host.sound('sand');
  }

  wipeSpatula(id: string) {
    this.dispatch({ type: 'wipeSpatula', spatulaId: id });
  }

  // ─────────────── Tubo, pinzas, herramientas ───────────────

  private near(h: Held, p: { x: number; y: number }, r: number) {
    const o = this.obj(h.id);
    return !!o && Math.hypot(o.pose.x - p.x, o.pose.y - p.y) < r;
  }

  private overWaste(): boolean {
    const o = this.w.objects.tube.pose;
    const wst = this.w.objects.waste.pose;
    return Math.hypot(o.x - wst.x, o.y - wst.y) < 8;
  }

  disposeResidue() {
    const r = this.run(this.dispatch({ type: 'disposeResidue' }));
    if (r.ok) this.host.sound('sand');
  }

  /** Golpecitos con el dedo al tubo (en la mano o en la pinza para tubo). */
  tap(strength: number) {
    const r = this.run(this.dispatch({ type: 'tap', strength }));
    if (r.ok) this.host.sound('clink');
    return r;
  }

  /** Pinza para tubo: sujetar (si la punta está en el tercio superior del tubo) o soltar donde corresponda. */
  toggleTongs() {
    const tube = this.w.objects.tube;
    if (tube.support === 'tongs') {
      this.placeTube(tube.pose, 'tongs');
      this.host.sound('metal');
      return;
    }
    if (this.clampReady) {
      this.dispatch({ type: 'setPose', id: 'tube', pose: { ...tube.pose }, support: 'tongs' });
      this.host.sound('metal');
    } else this.hintOnce('p5.hint.tongsAim');
  }

  private tongsCanGrip(): boolean {
    const tip = this.tongsTip();
    if (!tip) return false;
    const ax = tubeAxis(this.w, this.ctx);
    // Punto de sujeción: tercio superior del tubo.
    const gx = ax.bottom.x + ax.dir.x * TUBE5.length * 0.7;
    const gy = ax.bottom.y + ax.dir.y * TUBE5.length * 0.7;
    const gz = ax.bottom.z + ax.dir.z * TUBE5.length * 0.7;
    return Math.hypot(tip.x - gx, tip.y - gy, (tip.z - gz) * 0.6) < 4;
  }

  measureIR() {
    const r = this.dispatch({ type: 'measureIR' });
    if (r.value !== undefined) {
      this.lab.irReading = r.value;
      this.host.onIR?.(r.value);
    }
    this.host.sound('click');
  }

  private waterOnTube() {
    const h = this.held;
    if (!h) return;
    const ax = tubeAxis(this.w, this.ctx);
    if (!this.near(h, ax.bottom, 12)) {
      this.hintOnce('p5.hint.washAim');
      return;
    }
    this.run(this.dispatch({ type: 'waterOnTube' }));
    this.host.sound('squeeze');
  }

  private brush() {
    const h = this.held;
    if (!h) return;
    const pan = this.panPoint();
    if (this.near(h, pan, 8)) {
      this.run(this.dispatch({ type: 'cleanPan' }));
      this.host.sound('sand');
      return;
    }
    const o = this.obj(h.id)!;
    const sp = this.w.spills.find((s) => !s.cleaned && Math.hypot(s.x - o.pose.x, s.y - o.pose.y) < 9);
    if (sp) {
      this.dispatch({ type: 'cleanSpill', spillId: sp.id });
      this.host.sound('sand');
    } else this.hintOnce('p5.hint.brushAim');
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
      let tx = h.x;
      let ty = h.y;
      let tz = h.z;
      h.magnet = h.kind === 'spatula' ? this.spatulaMagnet(h, tx, ty) : null;
      if (h.magnet) {
        tx = h.magnet.x - SPOON_DX;
        ty = h.magnet.y;
        tz = h.magnet.z;
      }
      if (h.kind === 'burner') {
        // Imán suave: en profundidad, bajo la muestra; a lo largo del tubo queda libre (vaivén).
        const ax = tubeAxis(w, this.ctx);
        if (ax.clamped && Math.abs(tx - ax.sample.x) < 8 && Math.abs(ty - ax.sample.y) < 5) ty = ax.sample.y;
      }
      const r = h.kind === 'tube' ? 1 : 0.6;
      const floor = this.clearZ(tx, ty, r, h.id) + (h.kind === 'burner' ? 0 : 0.3);
      if (!h.magnet) tz = Math.max(tz, floor);
      const k = Math.min(1, dt * (h.magnet ? 8 : 16));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const nz = h.kind === 'burner' ? 0 : h.curZ;
      if (Math.hypot(nx - o.pose.x, ny - o.pose.y, nz - o.pose.z) > 0.004) this.sendPose(h.id, { x: nx, y: ny, z: nz, rotationRad: 0 }, 'hand');
      // Golpecitos: el tubo en la mano movido de lado a lado (cada cambio de sentido rápido = un golpe).
      if (h.kind === 'tube') this.measureTaps(h, tx, dt);
      if (this.pointer && !h.keyboard) {
        const W = this.view.viewW();
        if (this.pointer.x < 30) this.view.edgePan(-1, dt);
        else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
      }
      if (h.kind === 'tubeTongs' && w.objects.tube.support !== 'tongs') this.clampReady = this.tongsCanGrip();
      if (h.kind === 'tube' && this.overWaste()) this.hintOnce('p5.hint.wasteP');
    }
    this.followTongs();
    if (w.gas.lighter.sparking) {
      this.sparkSound -= dt;
      if (this.sparkSound <= 0) {
        this.host.sound('spark');
        this.sparkSound = 0.35;
      }
    }
    if (isLit(w.gas) && w.objects.tube.support !== 'clamp') {
      const m = mouthPos(w.gas, this.ctx.gasCtx);
      const t = w.objects.tube.pose;
      if (Math.hypot(t.x - m.x, t.y - m.y) < 6 && w.objects.tube.support === 'hand') this.warn('p5.hint.heatInClamp', 6);
    }
  }

  private measureTaps(h: Held, x: number, dt: number) {
    h.track.push({ x, t: this.now });
    while (h.track.length && this.now - h.track[0].t > 0.25) h.track.shift();
    this.tapCool -= dt;
    if (h.track.length < 3) return;
    const a = h.track[0];
    const b = h.track[h.track.length - 1];
    const v = (b.x - a.x) / Math.max(0.05, b.t - a.t);
    const dir = Math.abs(v) > 12 ? Math.sign(v) : 0;
    if (dir && this.tapDir && dir !== this.tapDir && this.tapCool <= 0) {
      // Fuerza a partir de la rapidez del vaivén: suave ≈ 15–40 cm/s; violento > 70 cm/s.
      this.tap(Math.min(1, Math.abs(v) / 80));
      this.tapCool = 0.12;
    }
    if (dir) this.tapDir = dir;
  }

  /** El tubo sujeto por la pinza para tubo sigue su punta. */
  private followTongs() {
    const t = this.w.objects.tube;
    if (t.support !== 'tongs') return;
    const tip = this.tongsTip();
    if (!tip) return;
    const pz = Math.max(0, tip.z - TUBE5.length * 0.7);
    if (Math.hypot(t.pose.x - tip.x, t.pose.y - tip.y, t.pose.z - pz) > 0.01) this.dispatch({ type: 'setPose', id: 'tube', pose: { x: tip.x, y: tip.y, z: pz, rotationRad: 0 } });
  }
}
