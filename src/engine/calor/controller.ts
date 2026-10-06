/**
 * Interacción de la Práctica 6: gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js.
 * - Arrastre con altura de transporte (pasa por encima de lo que hay debajo).
 * - Vertido (§6.2): un recipiente con agua sobre la boca de otro y P (o clic derecho) mantenido lo inclina poco a poco;
 *   el caudal lo decide el dominio con la inclinación y el llenado. Sin receptor debajo, se derrama.
 * - Piseta: sobre una boca, P = una gota (mantener = gotas seguidas) para enrasar.
 * - Espátula: imán a los frascos de metal (P toma una pieza) y a la boca de los tubos (P la deja caer).
 * - Pinza para tubo: P sujeta/suelta; con el tubo sobre el calorímetro abierto, P vierte el metal.
 * - Calorímetro: clic en la tapa la abre o cierra; arrastre vertical sobre el agitador agita.
 * - Termómetros: se colocan en el vaso o en el baño; la rueda cambia la profundidad; clic en la pantalla = leer.
 * - Plantilla: arrastre o rueda sobre la perilla. Balanza: como en la Práctica 5.
 */
import type { CalorHost } from './host';
import type { CalorLab3D } from './CalorLab3D';
import type { P6Command } from '../../simulation/calorimetry-world/commands';
import type { P6ObjKind, P6World, Pose } from '../../simulation/calorimetry-world/types';
import { piecesAt, tubeTempC } from '../../simulation/calorimetry-world/world';
import { BALANCE_GEO6, CUP_POS, GEO6, PLATE_POS, PLATE_TOP, RACK_POS6 } from '../../practices/practice-06/definition';
import { BEAM } from '../instruments/tripleBeam3d';

export interface PickHit6 {
  id: string;
  part?: string;
}

export interface ViewAdapter6 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHit6 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

interface Magnet {
  id: string;
  x: number;
  y: number;
  z: number;
  mode: 'PICK' | 'DROP' | 'RETURN';
}

export interface Held6 {
  id: string;
  kind: P6ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  magnet: Magnet | null;
  /** Inclinación de vertido (°) y su objetivo. */
  tilt: number;
  pourTarget: string | null;
}

const POURABLE = new Set(['water_bottle', 'cylinder', 'beaker']);
const CARRY_Z: Partial<Record<P6ObjKind, number>> = {
  spatula: 14, tubeTongs: 16, tube: 14, thermometer: 14, stirrer: 14, cylinder: 4, waterBottle: 4, washBottle: 6, beaker: 4, towel: 3, bomb: 4,
};
const TOP: Partial<Record<P6ObjKind, number>> = {
  balance: 15, cylinder: 21, waterBottle: 25, washBottle: 16, cup: 12, jar: 7.5, hotplate: PLATE_TOP, beaker: 11, rack: 8.5, sink: 10, bombUnit: 24, oxygen: 46, analyticBalance: 16, bomb: 13,
};
const FOOT: Partial<Record<P6ObjKind, number>> = {
  balance: 20, cylinder: 3.2, waterBottle: 6.3, washBottle: 3.4, cup: 5, jar: 3.4, hotplate: 10, beaker: 4, rack: 8, sink: 12, bombUnit: 16, oxygen: 4.5, analyticBalance: 10, bomb: 3.8,
};
const SPOON_DX = 8.4;
const TONGS_TIP = 17;
const FINE_STEP = 0.05;
const TILT_SPEED = 40;
const TILT_RETURN = 120;

/** Radio del recipiente (para el acople del vertido). */
const RADIUS: Record<string, number> = { water_bottle: 6, cylinder: 1.5, beaker: 3.9, cup: 4.4, sink: 12, wash: 3 };

export class CalorController {
  view: ViewAdapter6 | null = null;
  held: Held6 | null = null;
  hovered: string | null = null;
  /** ¿La pinza para tubo puede sujetar el tubo? */
  clampReady = false;
  /** Receptor bajo lo que se sostiene (para la vista y el panel). */
  dockTarget: string | null = null;
  private knob: { sy: number; start: number } | null = null;
  private rider: { beam: 0 | 1 | 2 } | null = null;
  private screw: { sy: number; acc: number } | null = null;
  private stirDrag: { sy: number; t: number; acc: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private now = 0;
  private dropTimer = 0;
  private hinted = new Set<string>();
  private lastWarn = new Map<string, number>();

  constructor(private host: CalorHost, private lab: CalorLab3D) {}

  private get w(): P6World {
    return this.host.runtime.world;
  }

  private dispatch(c: P6Command) {
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
    if (!r.ok && r.code) this.warn(`p6.cmd.${r.code}`, 2);
    return r;
  }

  // ─────────────── Geometría ───────────────

  panPoint() {
    const b = this.w.objects.balance.pose;
    return { x: b.x + BALANCE_GEO6.panDx, y: b.y + BALANCE_GEO6.panDy, z: BALANCE_GEO6.panZ };
  }

  beakerFloorZ() {
    const b = this.w.objects.beaker;
    return (b.support === 'plate' ? PLATE_TOP : b.pose.z) + GEO6.beaker.floor;
  }

  /** Borde superior (z) y centro de un recipiente receptor. */
  mouthOf(id: string): { x: number; y: number; z: number; r: number } | null {
    const o = this.w.objects[id];
    if (!o) return null;
    const p = o.pose;
    switch (id) {
      case 'cylinder':
        return { x: p.x, y: p.y, z: p.z + GEO6.cylinder.h + GEO6.cylinder.floor, r: RADIUS.cylinder };
      case 'cup':
        return { x: p.x, y: p.y, z: p.z + GEO6.cup.h + 1.2, r: RADIUS.cup };
      case 'beaker':
        return { x: p.x, y: p.y, z: this.beakerFloorZ() + GEO6.beaker.h, r: RADIUS.beaker };
      case 'sink':
        return { x: p.x, y: p.y, z: GEO6.sink.h, r: RADIUS.sink };
      case 'water_bottle':
        return { x: p.x, y: p.y, z: p.z + GEO6.bottle.h, r: 1.8 };
      default:
        return null;
    }
  }

  tongsTip(): { x: number; y: number; z: number } | null {
    const t = this.w.objects.tongs?.pose;
    if (!t) return null;
    return { x: t.x + TONGS_TIP, y: t.y, z: t.z + 0.5 };
  }

  /** Superficie del agua del calorímetro (z). */
  cupWaterZ() {
    const v = this.w.vessels.cup;
    return this.w.objects.cup.pose.z + GEO6.cup.floor + v.waterG / v.areaCm2;
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
    if (hit.id === 'hotplate' && hit.part === 'knob') {
      this.knob = { sy, start: this.w.plate.knob };
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
        this.hintOnce('p6.hint.zeroScrew');
        return true;
      }
      if (hit.part === 'level') {
        this.dispatch({ type: 'levelBalance' });
        this.host.sound('click');
      }
      return true;
    }
    if (hit.id === 'cup' && hit.part === 'lid') {
      this.toggleLid();
      return true;
    }
    if (this.w.thermos[hit.id] && hit.part === 'display' && this.w.objects[hit.id].support !== 'bench' && !this.held) {
      this.readThermometer(hit.id, false);
      return true;
    }
    if (hit.id === 'stirrer' && this.w.objects.stirrer.support === 'cup' && !this.held) {
      this.stirDrag = { sy, t: this.now, acc: 0 };
      this.view.setOrbitEnabled(false);
      this.hintOnce('p6.hint.stir');
      return true;
    }
    if (hit.id === 'bomb_unit' && hit.part) {
      if (hit.part === 'arm') this.run(this.dispatch({ type: 'bomb', cmd: { type: 'arm' } }));
      if (hit.part === 'ignite') this.run(this.dispatch({ type: 'bomb', cmd: { type: 'ignite' } }));
      if (hit.part === 'lid' && this.w.bomb.inBucket && !this.w.bomb.lidClosed) this.run(this.dispatch({ type: 'bomb', cmd: { type: 'closeLid' } }));
      this.host.sound('click');
      return true;
    }
    if (hit.id === 'oxygen' && hit.part === 'valve') {
      this.run(this.dispatch({ type: 'bomb', cmd: { type: 'pressurize', deltaAtm: 2 } }));
      this.host.sound('hiss');
      return true;
    }
    if (this.held && this.held.id === hit.id) return true;
    this.down = true;
    return this.beginDrag(hit.id, false);
  }

  onPointerMove(sx: number, sy: number) {
    this.pointer = { x: sx, y: sy };
    if (this.knob) {
      this.setKnob(this.knob.start + (this.knob.sy - sy) / 200);
      return;
    }
    if (this.rider) {
      this.dragRider(sx, sy);
      return;
    }
    if (this.screw) {
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
    if (this.stirDrag) {
      // La intensidad sale de la rapidez del vaivén vertical (px/s).
      this.stirDrag.acc += Math.abs(sy - this.stirDrag.sy);
      this.stirDrag.sy = sy;
      return;
    }
    if (!this.held && this.view) this.hovered = this.view.pick(sx, sy, null)?.id ?? null;
  }

  onPointerUp() {
    if (this.knob || this.rider || this.screw || this.stirDrag) {
      if (this.rider) this.host.sound('clink');
      this.knob = null;
      this.rider = null;
      this.screw = null;
      this.stirDrag = null;
      this.view?.setOrbitEnabled(true);
      return;
    }
    if (this.held && this.down && !this.held.keyboard) this.release();
    this.down = false;
  }

  private dragRider(sx: number, sy: number) {
    if (!this.view || !this.rider) return;
    const b = this.rider.beam;
    const bal = this.w.objects.balance.pose;
    const p = this.view.toBench(sx, sy, BEAM.y[b]);
    const u = Math.max(0, Math.min(1, (p.x - bal.x - BEAM.x0) / (BEAM.x1 - BEAM.x0)));
    let v = u * BEAM.max[b];
    v = b === 0 ? Math.round(v / 100) * 100 : b === 1 ? Math.round(v / 10) * 10 : Math.round(v / FINE_STEP) * FINE_STEP;
    if (Math.abs(v - this.w.balance.riders[b]) > 1e-6) {
      this.dispatch({ type: 'setRider', beam: b, valueG: v });
      if (b < 2) this.host.sound('click');
    }
  }

  onWheel(dy: number): boolean {
    const dir = dy > 0 ? -1 : 1;
    const h = this.held;
    if (h) {
      this.nudgeHeight(dir * 0.5);
      return true;
    }
    if (this.pointer && this.view) {
      const hit = this.view.pick(this.pointer.x, this.pointer.y, null);
      if (!hit) return false;
      if (hit.id === 'hotplate') {
        this.setKnob(this.w.plate.knob + dir * 0.02);
        return true;
      }
      if (hit.id === 'balance' && hit.part === 'zeroScrew') {
        this.dispatch({ type: 'turnZeroScrew', deltaG: dir * 0.02 });
        return true;
      }
      if (hit.id === 'balance' && hit.part === 'rider2') {
        this.nudgeRider(2, dir * FINE_STEP);
        return true;
      }
      if (this.w.thermos[hit.id] && this.w.objects[hit.id].support !== 'bench') {
        this.setThermoDepth(hit.id, this.w.thermos[hit.id].depth - dir * 0.05);
        return true;
      }
      if (this.w.tubes[hit.id] && this.w.objects[hit.id].support === 'bath') {
        this.setTubeDepth(hit.id, this.w.tubes[hit.id].bottomAboveFloorCm + dir * 0.4);
        return true;
      }
    }
    return false;
  }

  nudgeRider(beam: 0 | 1 | 2, d: number) {
    this.dispatch({ type: 'setRider', beam, valueG: this.w.balance.riders[beam] + d });
  }

  setKnob(v: number) {
    const k = Math.max(0, Math.min(1, v));
    if (Math.abs(k - this.w.plate.knob) < 1e-4) return;
    this.dispatch({ type: 'setPlate', knob: k });
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
    switch (h.kind) {
      case 'washBottle':
        this.squeeze(shift ? 10 : 1);
        this.dropTimer = 0;
        break;
      case 'spatula':
        this.spatulaAction();
        break;
      case 'tubeTongs':
        this.tongsAction();
        break;
      case 'tube':
        this.pourMetalHere();
        break;
      default:
        if (!POURABLE.has(h.id)) this.hintOnce('p6.hint.nothingToDo');
    }
  }

  primaryUp() {
    this.primary = false;
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const step = shift ? 5 : 1;
    if (key === 'r' || key === 'R') {
      this.readBalance();
      return true;
    }
    if (key === 't' || key === 'T') {
      const sel = this.host.getSelected();
      this.readThermometer(sel && this.w.thermos[sel] ? sel : 'therm_cal', false);
      return true;
    }
    if (key === 'y' || key === 'Y') {
      this.readThermometer('therm_cal', true);
      return true;
    }
    if (key === 'n' || key === 'N') {
      this.readCylinder();
      return true;
    }
    if (key === 'g' || key === 'G') {
      this.stir(shift ? 1 : 0.6);
      return true;
    }
    if (key === 'h' || key === 'H') {
      this.toggleLid();
      return true;
    }
    const h = this.held;
    if (h) {
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      if (key === 'p' || key === 'P') return this.primaryDown(shift), true;
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
      const ids = Object.values(this.w.objects).filter((o) => o.support !== 'disposed').sort((a, b) => a.pose.x - b.pose.x || a.pose.y - b.pose.y).map((o) => o.id);
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
    if (this.w.tubes[id] && o.support === 'tongs') return false;
    if (this.held) this.release();
    // El dominio decide si quema (tubo caliente o beaker del baño).
    const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: 'hand' });
    if (!r.ok) {
      this.host.sound('sizzle');
      this.warn(this.w.tubes[id] ? 'p6.hint.useTongs' : 'p6.hint.hot', 2);
      return false;
    }
    const z0 = Math.max(o.pose.z + 2, CARRY_Z[o.kind] ?? o.pose.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support }, magnet: null, tilt: 0, pourTarget: null };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'tube' || o.kind === 'cylinder' || o.kind === 'beaker' ? 'clink' : 'click');
    if (POURABLE.has(id)) this.hintOnce('p6.hint.pour');
    if (o.kind === 'washBottle') this.hintOnce('p6.hint.wash');
    if (o.kind === 'spatula') this.hintOnce('p6.hint.spatula');
    if (o.kind === 'tubeTongs') this.hintOnce('p6.hint.tongs');
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
    this.place(h.id, h.kind, o.pose);
  }

  /** Destino al soltar: platillo, gradilla, baño, plantilla, calorímetro, unidad de la bomba o mesada. */
  private place(id: string, kind: P6ObjKind, p: Pose) {
    const pan = this.panPoint();
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    if ((kind === 'cylinder' || kind === 'tube') && near(pan, 7)) {
      const r = this.sendPose(id, { x: p.x, y: p.y, z: pan.z, rotationRad: 0 }, 'pan');
      if (r.ok) {
        this.host.sound('clink');
        this.hintOnce('p6.hint.waitPointer');
        return;
      }
      this.run(r);
    }
    if (kind === 'tube') {
      const beaker = this.w.objects.beaker.pose;
      if (near(beaker, 4) && this.w.vessels.beaker.waterG >= 0) {
        const hb = Math.max(0, Math.min(12, p.z - this.beakerFloorZ()));
        this.sendPose(id, { x: beaker.x - 1, y: beaker.y, z: this.beakerFloorZ() + hb, rotationRad: 0 }, 'bath');
        this.dispatch({ type: 'setTubeDepth', tubeId: id, bottomAboveFloorCm: hb });
        this.host.sound('glass');
        this.hintOnce('p6.hint.depth');
        return;
      }
      if (Math.abs(p.x - RACK_POS6.x) < 10 && Math.abs(p.y - RACK_POS6.y) < 7) {
        const slot = id === 'tube_fe' ? -3 : 3;
        this.sendPose(id, { x: RACK_POS6.x + slot, y: RACK_POS6.y, z: 0.6, rotationRad: 0 }, 'rack');
        this.host.sound('clink');
        return;
      }
      const hot = tubeTempC(this.w.tubes[id]) > this.w.params.ambientC + 30;
      if (hot) this.warn('p6.hint.hotOnBench', 3);
      this.sendPose(id, { x: p.x - GEO6.tube.length / 2, y: Math.max(4, p.y), z: GEO6.tube.outerR, rotationRad: 0 }, 'bench');
      return;
    }
    if (kind === 'thermometer' || kind === 'stirrer') {
      const cup = this.w.objects.cup.pose;
      if (near(cup, 6)) {
        const dx = kind === 'thermometer' ? -1.4 : 1.4;
        this.sendPose(id, { x: cup.x + dx, y: cup.y, z: this.thermoZ(id, 'cup', kind === 'thermometer' ? 0.5 : 0.8), rotationRad: 0 }, 'cup');
        if (kind === 'thermometer') this.dispatch({ type: 'setThermoDepth', id, depth: 0.5 });
        this.host.sound('click');
        return;
      }
      const beaker = this.w.objects.beaker.pose;
      if (kind === 'thermometer' && near(beaker, 5)) {
        this.sendPose(id, { x: beaker.x + 1.6, y: beaker.y + 1, z: this.thermoZ(id, 'bath', 0.5), rotationRad: 0 }, 'bath');
        this.dispatch({ type: 'setThermoDepth', id, depth: 0.5 });
        this.host.sound('click');
        return;
      }
    }
    if (kind === 'beaker') {
      if (near(PLATE_POS, 7)) {
        this.sendPose(id, { x: PLATE_POS.x, y: PLATE_POS.y, z: PLATE_TOP, rotationRad: 0 }, 'plate');
        this.host.sound('glass');
        return;
      }
    }
    if (kind === 'bomb') {
      const u = this.w.objects.bomb_unit.pose;
      if (near(u, 12)) {
        const r = this.run(this.dispatch({ type: 'bomb', cmd: { type: 'submerge' } }));
        if (r.ok) {
          this.sendPose(id, { x: u.x - 4, y: u.y, z: 8, rotationRad: 0 }, 'unit');
          return;
        }
      }
    }
    this.layOnBench(id, p.x, p.y, kind === 'spatula' ? 0.3 : kind === 'tubeTongs' ? 0.4 : kind === 'thermometer' || kind === 'stirrer' ? 0.6 : 0);
  }

  /** Altura del termómetro según su profundidad (z del origen = punta del bulbo). */
  thermoZ(id: string, where: 'cup' | 'bath', depth: number) {
    void id;
    if (where === 'cup') return this.w.objects.cup.pose.z + GEO6.cup.floor + (1 - depth) * 8;
    return this.beakerFloorZ() + (1 - depth) * 8;
  }

  setThermoDepth(id: string, depth: number) {
    const d = Math.max(0, Math.min(1, depth));
    this.dispatch({ type: 'setThermoDepth', id, depth: d });
    const o = this.w.objects[id];
    if (o.support === 'cup' || o.support === 'bath') this.sendPose(id, { ...o.pose, z: this.thermoZ(id, o.support, d) });
  }

  setTubeDepth(id: string, hb: number) {
    const v = Math.max(0, Math.min(12, hb));
    this.dispatch({ type: 'setTubeDepth', tubeId: id, bottomAboveFloorCm: v });
    const o = this.w.objects[id];
    this.sendPose(id, { ...o.pose, z: this.beakerFloorZ() + v });
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
      if (o.id === exclude || o.support !== 'bench' && o.support !== 'plate') continue;
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
    const spot = this.freeSpot(Math.max(-8, Math.min(600, x0)), Math.max(3, Math.min(60, y0)), 1, id);
    this.sendPose(id, { x: spot.x, y: spot.y, z, rotationRad: 0 }, 'bench');
    this.host.sound('click');
  }

  private clearZ(x: number, y: number, r: number, exclude: string): number {
    let z = 0;
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand' || o.support === 'disposed' || o.support === 'tongs') continue;
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
    h.z = Math.max(0, Math.min(40, h.z + dz));
  }

  // ─────────────── Agua ───────────────

  /** Receptor bajo el pico del recipiente sostenido. */
  private pourTargetAt(id: string, x: number, y: number, z: number): string | null {
    let best: string | null = null;
    let bd = 1e9;
    for (const t of ['cylinder', 'cup', 'beaker', 'sink', 'water_bottle']) {
      if (t === id) continue;
      const m = this.mouthOf(t);
      if (!m) continue;
      const d = Math.hypot(x - m.x, y - m.y);
      const reach = m.r + (RADIUS[id] ?? 2) + 2;
      if (d < reach && z > m.z - 3 && d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  private updatePour(h: Held6, dt: number) {
    const o = this.obj(h.id)!;
    const target = this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
    this.dockTarget = target;
    const want = this.primary;
    h.tilt = want ? Math.min(135, h.tilt + TILT_SPEED * dt) : Math.max(0, h.tilt - TILT_RETURN * dt);
    if (h.tilt > 4) {
      if (target === 'cup' && this.w.cal.lidClosed) {
        this.warn('p6.hint.lidClosed', 3);
        h.tilt = 0;
      } else {
        h.pourTarget = target;
        this.dispatch({ type: 'setPour', sourceId: h.id, targetId: target, tiltDeg: h.tilt });
      }
    } else if (this.w.pours[h.id]) this.endPour(h);
  }

  private endPour(h: Held6) {
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
    if (target === 'cup' && this.w.cal.lidClosed) {
      this.warn('p6.hint.lidClosed', 3);
      return;
    }
    this.dispatch({ type: 'squeeze', targetId: target, drops });
    this.host.sound('drip');
  }

  readCylinder() {
    const c = this.w.objects.cylinder;
    const v = this.w.vessels.cylinder;
    const menZ = c.pose.z + GEO6.cylinder.floor + v.waterG / v.areaCm2;
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - menZ : 20;
    const r = this.run(this.dispatch({ type: 'readCylinder', eyeDzCm: eyeDz }));
    if (!r.ok && r.code === 'PARALLAX') this.hintOnce('p6.hint.eyeLevel', 'warn');
    return r;
  }

  // ─────────────── Metal ───────────────

  private spatulaMagnet(x: number, y: number): Magnet | null {
    const tipX = x + SPOON_DX;
    const loaded = piecesAt(this.w, 'spatula').length > 0;
    for (const jar of ['jar_fe', 'jar_x']) {
      const p = this.w.objects[jar].pose;
      if (Math.hypot(tipX - p.x, y - p.y) < 4.5) return { id: `jar:${jar}`, x: p.x, y: p.y, z: 8, mode: loaded ? 'RETURN' : 'PICK' };
    }
    for (const t of ['tube_fe', 'tube_x']) {
      const o = this.w.objects[t];
      if (o.support === 'bench' || o.support === 'tongs' || o.support === 'hand') continue;
      const mz = o.pose.z + GEO6.tube.length;
      if (Math.hypot(tipX - o.pose.x, y - o.pose.y) < 3.5) return { id: `tube:${t}`, x: o.pose.x, y: o.pose.y, z: mz + 0.6, mode: loaded ? 'DROP' : 'PICK' };
    }
    return null;
  }

  spatulaAction() {
    const h = this.held;
    if (!h || h.kind !== 'spatula') return;
    const m = h.magnet;
    const loaded = piecesAt(this.w, 'spatula').length > 0;
    if (m && !loaded) {
      const r = this.run(this.dispatch({ type: 'pickPiece', from: m.id }));
      if (r.ok) this.host.sound('clink');
      return;
    }
    if (!loaded) {
      this.hintOnce('p6.hint.spatulaEmpty');
      return;
    }
    const r = this.run(this.dispatch({ type: 'dropPiece', to: m ? m.id : 'bench' }));
    if (r.ok) this.host.sound('clink');
  }

  /** Acción directa del panel (sin tener la espátula en la mano). */
  spatulaDirect(action: 'pick' | 'drop', loc: string) {
    const r = this.run(this.dispatch(action === 'pick' ? { type: 'pickPiece', from: loc } : { type: 'dropPiece', to: loc }));
    if (r.ok) this.host.sound('clink');
    return r;
  }

  private tongsCanGrip(): string | null {
    const tip = this.tongsTip();
    if (!tip) return null;
    for (const t of ['tube_fe', 'tube_x']) {
      const o = this.w.objects[t];
      if (o.support === 'bench') continue;
      const gz = o.pose.z + GEO6.tube.length * 0.75;
      if (Math.hypot(tip.x - o.pose.x, tip.y - o.pose.y, (tip.z - gz) * 0.6) < 4) return t;
    }
    return null;
  }

  private tongsHolding(): string | null {
    return ['tube_fe', 'tube_x'].find((t) => this.w.objects[t].support === 'tongs') ?? null;
  }

  /** P con la pinza: verter el metal (sobre el vaso abierto), soltar el tubo o sujetarlo. */
  tongsAction() {
    const t = this.tongsHolding();
    if (t) {
      const o = this.w.objects[t];
      const cup = this.w.objects.cup.pose;
      if (Math.hypot(o.pose.x - cup.x, o.pose.y - cup.y) < 7 && piecesAt(this.w, `tube:${t}`).length) {
        this.pourMetal(t);
        return;
      }
      this.place(t, 'tube', o.pose);
      this.host.sound('metal');
      return;
    }
    const g = this.tongsCanGrip();
    if (g) {
      this.sendPose(g, { ...this.w.objects[g].pose }, 'tongs');
      this.host.sound('metal');
    } else this.hintOnce('p6.hint.tongsAim');
  }

  /** P con el tubo en la mano: verter el metal si está sobre el calorímetro. */
  pourMetalHere() {
    const h = this.held;
    if (!h || !this.w.tubes[h.id]) return;
    this.pourMetal(h.id);
  }

  pourMetal(tubeId: string) {
    const o = this.w.objects[tubeId];
    const cup = this.w.objects.cup.pose;
    const offset = Math.hypot(o.pose.x - cup.x, o.pose.y - cup.y);
    const target = offset < 7 ? 'cup' : null;
    const drop = Math.max(0, o.pose.z + GEO6.tube.length * 0.4 - this.cupWaterZ());
    const r = this.run(this.dispatch({ type: 'pourMetal', tubeId, targetId: target, dropHeightCm: drop, offsetCm: offset }));
    if (r.ok) this.host.sound('clink');
    if (!target) this.hintOnce('p6.hint.pourMetalAim', 'warn');
    return r;
  }

  /** Traslado accesible del tubo (panel). */
  moveTube(id: string, target: 'pan' | 'rack' | 'bath' | 'cupPour', viaTongs: boolean) {
    if (this.blocked()) return { ok: false, code: 'BLOCKED' };
    if (this.held) this.release();
    const o = this.w.objects[id];
    const r = this.sendPose(id, { ...o.pose }, viaTongs ? 'tongs' : 'hand');
    if (!r.ok) {
      this.host.sound('sizzle');
      this.warn('p6.hint.useTongs', 1);
      return r;
    }
    if (target === 'cupPour') {
      const cup = this.w.objects.cup.pose;
      this.sendPose(id, { x: cup.x, y: cup.y, z: cup.z + GEO6.cup.h + 4, rotationRad: 0 });
      return this.pourMetal(id);
    }
    const dest = target === 'pan' ? this.panPoint() : target === 'bath' ? { ...this.w.objects.beaker.pose, z: this.beakerFloorZ() + 0.8 } : { x: RACK_POS6.x, y: RACK_POS6.y, z: 1 };
    this.place(id, 'tube', { x: dest.x, y: dest.y, z: dest.z, rotationRad: 0 });
    return { ok: true };
  }

  /** Traslado accesible del termómetro o el agitador al vaso o al baño (panel). */
  moveInstrument(id: string, where: 'cup' | 'bath' | 'bench') {
    const o = this.w.objects[id];
    if (where === 'bench') {
      this.layOnBench(id, o.pose.x, o.pose.y, 0.6);
      return;
    }
    const dest = where === 'cup' ? this.w.objects.cup.pose : this.w.objects.beaker.pose;
    this.place(id, o.kind, { x: dest.x, y: dest.y, z: 10, rotationRad: 0 });
  }

  /** Traslado accesible de un recipiente (panel): probeta al platillo o a la mesada; beaker a la plantilla. */
  moveVessel(id: string, where: 'pan' | 'bench' | 'plate') {
    if (this.held) this.release();
    const o = this.w.objects[id];
    if (where === 'bench') {
      this.sendPose(id, { ...o.pose }, 'hand');
      this.layOnBench(id, id === 'cylinder' ? 130 : 280, id === 'cylinder' ? 24 : 22, 0);
      return;
    }
    const r = this.sendPose(id, { ...o.pose }, 'hand');
    if (!r.ok) return this.run(r);
    const dest = where === 'pan' ? this.panPoint() : { ...PLATE_POS, z: PLATE_TOP };
    this.place(id, o.kind, { x: dest.x, y: dest.y, z: dest.z, rotationRad: 0 });
    return { ok: true };
  }

  /** Vertido accesible (panel): de `src` a `target` hasta `grams` (o hasta vaciar). */
  pourDirect(src: string, target: string | null, grams: number | null) {
    const v = this.w.vessels[src];
    const start = target ? this.w.vessels[target]?.waterG ?? 0 : this.w.spilledG;
    if (target === 'cup' && this.w.cal.lidClosed) return this.run({ ok: false, code: 'LID_CLOSED' });
    const tilt = src === 'cylinder' ? 140 : 70;
    this.run(this.dispatch({ type: 'setPour', sourceId: src, targetId: target, tiltDeg: tilt }));
    return { ok: true, until: () => (grams === null ? v.waterG <= 0.01 : (target ? this.w.vessels[target].waterG : this.w.spilledG) - start >= grams) };
  }

  toggleLid() {
    const r = this.run(this.dispatch({ type: 'setLid', closed: !this.w.cal.lidClosed }));
    if (r.ok) this.host.sound('click');
  }

  stir(intensity: number) {
    const r = this.run(this.dispatch({ type: 'stir', intensity }));
    if (r.ok) this.host.sound('stir');
  }

  readThermometer(id: string, peak: boolean) {
    const r = this.run(this.dispatch({ type: 'readThermometer', id, peak }));
    this.host.sound('click');
    return r;
  }

  readBalance() {
    const r = this.dispatch({ type: 'readBalance' });
    this.host.sound('click');
    return r;
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.now += dt;
    const h = this.held;
    this.clampReady = false;
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
      const floor = this.clearZ(tx, ty, RADIUS[h.id] ?? 1, h.id) + 0.3;
      if (!h.magnet) tz = Math.max(tz, floor);
      const k = Math.min(1, dt * (h.magnet ? 8 : 16));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const rot = (h.tilt * Math.PI) / 180;
      if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001) this.sendPose(h.id, { x: nx, y: ny, z: h.curZ, rotationRad: rot }, 'hand');
      if (POURABLE.has(h.id)) this.updatePour(h, dt);
      if (h.kind === 'washBottle') {
        const tgt = this.pourTargetAt('wash', o.pose.x + 2.5, o.pose.y, o.pose.z + 12);
        this.dockTarget = tgt;
        if (this.primary) {
          this.dropTimer += dt;
          if (this.dropTimer > 0.25) {
            this.dropTimer = 0;
            this.squeeze(1);
          }
        }
      }
      if (this.pointer && !h.keyboard) {
        const W = this.view.viewW();
        if (this.pointer.x < 30) this.view.edgePan(-1, dt);
        else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
      }
      if (h.kind === 'tubeTongs' && !this.tongsHolding()) this.clampReady = !!this.tongsCanGrip();
    }
    if (this.stirDrag) {
      const s = this.stirDrag;
      if (this.now - s.t > 0.2) {
        const speed = s.acc / (this.now - s.t);
        s.acc = 0;
        s.t = this.now;
        if (speed > 20) this.stir(Math.min(1, speed / 900));
      }
    }
    this.followTongs();
  }

  private followTongs() {
    const t = this.tongsHolding();
    if (!t) return;
    const tip = this.tongsTip();
    if (!tip) return;
    const o = this.w.objects[t];
    const pz = Math.max(0, tip.z - GEO6.tube.length * 0.75);
    if (Math.hypot(o.pose.x - tip.x, o.pose.y - tip.y, o.pose.z - pz) > 0.01) this.dispatch({ type: 'setPose', id: t, pose: { x: tip.x, y: tip.y, z: pz, rotationRad: 0 } });
  }
}

export { CUP_POS };
