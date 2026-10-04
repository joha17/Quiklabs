/**
 * Interacción de la Práctica 3 (§13): gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js.
 * - Arrastre con punto de agarre e inercia moderada; la altura del objeto sostenido se ajusta con la rueda,
 *   Q/E, RePág/AvPág o los botones ▲▼ (para acercar el asa o la cápsula a la zona deseada de la llama).
 * - Válvulas: arrastrar la perilla (continuo 0–100 %), rueda sobre la perilla o controles accesibles.
 * - Encaje suave solo en soportes (asa–soporte, tubo–gradilla, cápsula–placa refractaria) y «imán» del asa
 *   al acercarla a la boca de un tubo, del HCl o del vaso de enjuague (entra sola; al alejarla, sale).
 * - Nada se teletransporta a la llama: el estudiante lleva cada instrumento con su propio gesto.
 */
import type { FlameHost } from './host';
import type { FlameLab3D } from './FlameLab3D';
import type { Pose, Practice3Object } from '../../simulation/flame-world/types';
import { hosePoints, isLit, mouthPos } from '../../simulation/flame-world/world';
import { BURNER, CAPSULE, HOLDER, LOOP, RACK, TILE, TUBE } from '../../practices/practice-03/instruments';
import { REF, holderSlotPose, rackSlotPose } from '../../practices/practice-03/definition';
import type { ValveId } from '../../simulation/flame-world/commands';

export interface PickHit3 {
  id: string;
  part?: string;
}

export interface ViewAdapter3 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHit3 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

interface Held {
  id: string;
  kind: Practice3Object['kind'];
  /** Desplazamiento entre el punto agarrado y el origen del objeto (cm). */
  ox: number;
  oy: number;
  /** Altura objetivo de transporte y altura actual (suavizada). */
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
  magnet: { id: string; x: number; y: number; z: number } | null;
  /** Levantando del soporte (sin desplazamiento horizontal todavía). */
  lifting: boolean;
}

const MOUTH_Z = BURNER.mouthZ;
/** Alturas de transporte por defecto (el estudiante las ajusta). */
const CARRY_Z: Partial<Record<Practice3Object['kind'], number>> = {
  loop: MOUTH_Z + 4,
  tongs: MOUTH_Z + 6.5,
  lighter: MOUTH_Z + 0.8,
  glass: MOUTH_Z + 6,
};
const KNOB_PARTS: Record<string, ValveId> = { needleValve: 'NEEDLE', airCollar: 'AIR', tableValve: 'TABLE' };

export class FlameController {
  view: ViewAdapter3 | null = null;
  held: Held | null = null;
  hovered: string | null = null;
  clampReady = false;
  private knob: { valve: ValveId; sx: number; sy: number; start: number } | null = null;
  private hoseDrag = false;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private primary = false;
  private alignTimer = 0;
  private lastAlignment = -1;
  private sparkSound = 0;

  constructor(private host: FlameHost, private lab: FlameLab3D) {}

  private get w() {
    return this.host.runtime.world;
  }

  private dispatch(c: Parameters<FlameHost['runtime']['dispatch']>[0]) {
    return this.host.runtime.dispatch(c);
  }

  private blocked(): boolean {
    return !!this.w.safety.incident || this.w.safety.stoppedByTeacher;
  }

  // ─────────────── Puntero ───────────────

  onPointerDown(sx: number, sy: number, button: number): boolean {
    if (button !== 0 || !this.view) return false;
    this.pointer = { x: sx, y: sy };
    const hit = this.view.pick(sx, sy, null);
    if (!hit) {
      if (!this.held) this.host.select(null);
      return false;
    }
    const partLabel = this.host.pendingPartLabel();
    if (partLabel && hit.part && ['burner', 'gas_tap', 'hose'].includes(hit.id)) {
      this.host.onPartClicked?.(hit.part);
      return true;
    }
    this.host.select(hit.id === 'hose' ? 'hose' : hit.id);
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
      const m = this.w.hose.mid;
      const p = this.view.toBench(sx, sy, m.z);
      this.dispatch({ type: 'setHoseMid', x: p.x, y: p.y, z: m.z });
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

  /** La rueda: sobre una perilla gira la válvula; con un objeto en la mano ajusta su altura (o el giro del atomizador). */
  onWheel(dy: number): boolean {
    const dir = dy > 0 ? -1 : 1;
    if (this.held) {
      // Con el encendedor en la boca, la otra mano abre o cierra la válvula de aguja (§7.2-5).
      if (this.held.kind === 'lighter') {
        this.setValve('NEEDLE', this.valveValue('NEEDLE') + dir * 0.02);
        return true;
      }
      if (this.held.kind === 'atomizer') {
        const a = this.w.atomizers[this.held.id];
        if (a) this.dispatch({ type: 'setAtomizerYaw', id: this.held.id, yawRad: a.yawRad + dir * 0.08 });
      } else this.nudgeHeight(dir * 0.5);
      return true;
    }
    if (this.pointer && this.view) {
      const h = this.view.pick(this.pointer.x, this.pointer.y, null);
      if (h?.part && KNOB_PARTS[h.part]) {
        const v = KNOB_PARTS[h.part];
        this.setValve(v, this.valveValue(v) + dir * 0.03);
        return true;
      }
      if (h?.id === 'hose') {
        const m = this.w.hose.mid;
        this.dispatch({ type: 'setHoseMid', x: m.x, y: m.y, z: m.z + dir * 1 });
        return true;
      }
    }
    return false;
  }

  /** Botón secundario / tecla P / botón de acción: acción principal de la herramienta en la mano. */
  secondaryDown() {
    this.primaryDown();
  }
  secondaryUp() {
    this.primaryUp();
  }

  primaryDown() {
    const h = this.held;
    if (!h || this.primary || this.blocked()) return;
    this.primary = true;
    if (h.kind === 'lighter') {
      this.dispatch({ type: 'spark', on: true });
      this.host.sound('spark');
    } else if (h.kind === 'tongs') this.toggleClamp();
    else if (h.kind === 'atomizer') {
      this.dispatch({ type: 'spray', atomizerId: h.id });
      this.host.sound('spray');
    } else if (h.kind === 'cloth') this.wipeIfNear();
    else if (h.kind === 'soapBottle') this.soapIfNear();
  }

  primaryUp() {
    if (!this.primary) return;
    this.primary = false;
    if (this.held?.kind === 'lighter' || this.w.lighter.sparking) this.dispatch({ type: 'spark', on: false });
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const step = shift ? 5 : 1;
    // Válvulas y vidrio con la otra mano (sirven aunque se sostenga algo con el ratón).
    const valveKeys: Record<string, [ValveId, number]> = { '[': ['NEEDLE', -0.02], ']': ['NEEDLE', 0.02], ',': ['AIR', -0.03], '.': ['AIR', 0.03] };
    if (valveKeys[key]) {
      const [v, d] = valveKeys[key];
      this.setValve(v, this.valveValue(v) + d);
      return true;
    }
    if (key === 'g' || key === 'G') {
      this.alignGlass();
      return true;
    }
    const h = this.held;
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
      // Sin nada en la mano, ← → recorren los objetos.
      const ids = Object.values(this.w.objects).filter((o) => o.movable || o.kind === 'burner').sort((a, b) => a.pose.x - b.pose.x || a.pose.y - b.pose.y).map((o) => o.id);
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

  beginDrag(id: string, keyboard: boolean, sx?: number, sy?: number): boolean {
    const o = this.w.objects[id];
    if (!o || !o.movable || this.blocked()) return false;
    if (this.held) this.release();
    // Tomar con la mano: el dominio decide si quema (§14.2).
    if (o.kind === 'capsule' && this.w.capsule.clampedBy) return false;
    const r = this.dispatch({ type: 'pickUp', id, tool: 'HAND' });
    if (!r.ok) return false;
    this.lab.physicsActive.delete(id);
    let ox = 0;
    let oy = 0;
    // Herramientas (asa, pinza, encendedor, vidrio, atomizador): la punta sigue al puntero, para apuntar con precisión.
    const isTool = ['loop', 'tongs', 'lighter', 'glass', 'atomizer'].includes(o.kind);
    if (!isTool && sx !== undefined && sy !== undefined && this.view) {
      const p = this.view.toBench(sx, sy, o.pose.z);
      ox = o.pose.x - p.x;
      oy = o.pose.y - p.y;
      // El agarre lejano no desplaza: se toma del punto tocado, limitado a unos cm.
      ox = Math.max(-3, Math.min(3, ox));
      oy = Math.max(-3, Math.min(3, oy));
    }
    const carry = CARRY_Z[o.kind];
    const z0 = o.kind === 'burner' ? 0 : o.kind === 'tube' ? o.pose.z + 3.5 : carry !== undefined ? Math.max(o.pose.z + (o.support.startsWith('holder:') ? 2.5 : 1), carry) : o.pose.z + 2;
    this.held = { id, kind: o.kind, ox, oy, z: z0, curZ: o.pose.z, x: o.pose.x - ox, y: o.pose.y - oy, keyboard, from: { pose: { ...o.pose }, support: o.support }, magnet: null, lifting: o.support.startsWith('holder:') || o.support.startsWith('rack:') };
    this.dispatch({ type: 'setPose', id, pose: { ...o.pose, quat: undefined }, support: 'hand' });
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'capsule' ? 'porcelain' : 'click');
    return true;
  }

  /** Suelta lo que se sostiene: encaja en un soporte cercano o se apoya en la mesada. */
  release() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    const o = this.w.objects[h.id];
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    if (!o) return;
    const p = o.pose;
    if (h.kind === 'loop') {
      const slot = this.nearestSlot(p.x, p.y, 'holder');
      if (slot !== null) {
        this.dispatch({ type: 'setPose', id: h.id, pose: holderSlotPose(slot), support: `holder:${slot}` });
        this.host.sound('metal');
        return;
      }
      this.layOnBench(h.id, p.x, p.y, 0.5);
      return;
    }
    if (h.kind === 'tube') {
      const slot = this.nearestSlot(p.x, p.y, 'rack');
      if (slot !== null) {
        this.dispatch({ type: 'setPose', id: h.id, pose: rackSlotPose(slot), support: `rack:${slot}` });
        this.host.sound('glass');
        return;
      }
      this.toPhysics(h.id);
      return;
    }
    if (h.kind === 'tongs') {
      if (this.w.capsule.clampedBy === h.id) {
        // Soltar la pinza con la cápsula: si está sobre la placa refractaria, la cápsula queda apoyada en ella.
        const cap = this.w.objects.capsule;
        if (cap && this.overTile(cap.pose.x, cap.pose.y)) {
          this.dispatch({ type: 'setPose', id: 'capsule', pose: { x: cap.pose.x, y: cap.pose.y, z: TILE.h, rotationRad: 0 }, support: 'tile' });
          this.dispatch({ type: 'unclamp', tongsId: h.id });
          this.dispatch({ type: 'setPose', id: 'capsule', pose: { x: cap.pose.x, y: cap.pose.y, z: TILE.h, rotationRad: 0 }, support: 'tile' });
          this.host.sound('porcelain');
        } else {
          this.dispatch({ type: 'unclamp', tongsId: h.id });
          this.toPhysics('capsule');
        }
      }
      this.layOnBench(h.id, p.x, p.y - 6, 0.9);
      return;
    }
    if (h.kind === 'capsule') {
      if (this.overTile(p.x, p.y)) {
        this.dispatch({ type: 'setPose', id: h.id, pose: { x: p.x, y: p.y, z: TILE.h, rotationRad: 0 }, support: 'tile' });
        this.host.sound('porcelain');
      } else this.toPhysics(h.id);
      return;
    }
    if (h.kind === 'cloth') this.wipeIfNear();
    if (h.kind === 'soapBottle') this.soapIfNear();
    if (h.kind === 'lighter') this.dispatch({ type: 'spark', on: false });
    if (h.kind === 'burner') {
      this.dispatch({ type: 'setPose', id: h.id, pose: { x: p.x, y: p.y, z: 0, rotationRad: 0 }, support: 'bench' });
      this.host.sound('metal');
      return;
    }
    const lie: Partial<Record<Practice3Object['kind'], number>> = { lighter: 1.2, glass: 0.8, cloth: 0.3, tongs: 0.9 };
    this.layOnBench(h.id, p.x, p.y, lie[h.kind] ?? 0);
  }

  /** Esc: devuelve el objeto a donde estaba. */
  cancel() {
    const h = this.held;
    if (!h) return;
    this.primaryUp();
    this.held = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    this.dispatch({ type: 'setPose', id: h.id, pose: h.from.pose, support: h.from.support });
    if (h.kind === 'tongs' && this.w.capsule.clampedBy === h.id) {
      this.dispatch({ type: 'unclamp', tongsId: h.id });
      this.toPhysics('capsule');
    }
  }

  /** Huellas de los objetos fijos o grandes de la mesada (para no dejar nada encima de ellos). */
  private occupied(x: number, y: number, exclude: string): boolean {
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand' || o.support === 'wall') continue;
      const dx = Math.abs(x - o.pose.x);
      const dy = Math.abs(y - o.pose.y);
      if (o.kind === 'burner' && Math.hypot(dx, dy) < BURNER.baseR + 3) return true;
      if (o.kind === 'rack' && dx < RACK.hx + 1.5 && dy < RACK.hy + 1.5) return true;
      if (o.kind === 'loopHolder' && dx < HOLDER.hx + 1.5 && dy < HOLDER.hy + 1.5) return true;
      if (o.kind === 'backdrop' && dx < 24 && dy < 3) return true;
      if (o.kind === 'tube' && Math.hypot(dx, dy) < 2) return true;
    }
    return false;
  }

  /** Hueco libre más cercano hacia el frente de la mesada. */
  private freeSpot(x: number, y: number, exclude: string): { x: number; y: number } {
    for (let k = 0; k < 14; k++) {
      const ty = Math.max(3, y - k * 3.5);
      if (!this.occupied(x, ty, exclude)) return { x, y: ty };
      for (const dx of [-6, 6, -12, 12]) if (!this.occupied(x + dx, ty, exclude)) return { x: x + dx, y: ty };
    }
    return { x, y: 4 };
  }

  private layOnBench(id: string, x0: number, y0: number, z: number) {
    const spot = this.freeSpot(Math.max(-8, Math.min(REF.mouth.x + 400, x0)), Math.max(3, Math.min(60, y0)), id);
    const cx = spot.x;
    const cy = spot.y;
    const base = this.platformZ(cx, cy, id);
    this.dispatch({ type: 'setPose', id, pose: { x: cx, y: cy, z: base + z, rotationRad: 0 }, support: 'bench' });
    this.host.sound('click');
  }

  private toPhysics(id: string) {
    const o = this.w.objects[id];
    if (!o) return;
    this.dispatch({ type: 'setPose', id, pose: o.pose, support: 'falling' });
    this.lab.physicsActive.add(id);
  }

  private overTile(x: number, y: number) {
    const t = this.w.objects.tile?.pose;
    return !!t && Math.abs(x - t.x) < TILE.half - 1 && Math.abs(y - t.y) < TILE.half - 1;
  }

  private nearestSlot(x: number, y: number, kind: 'holder' | 'rack'): number | null {
    const n = kind === 'holder' ? HOLDER.slots : RACK.slots;
    let best: number | null = null;
    let bd = kind === 'holder' ? 2.2 : 2.6;
    for (let i = 0; i < n; i++) {
      const s = kind === 'holder' ? holderSlotPose(i) : rackSlotPose(i);
      const d = Math.hypot(s.x - x, s.y - y);
      const occupied = Object.values(this.w.objects).some((o) => o.support === `${kind}:${i}` && o.id !== this.held?.id);
      if (d < bd && !occupied) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Altura de apoyo en (x, y): mesada, placa, soportes y el mechero (el aro no entra al cañón). */
  platformZ(x: number, y: number, exclude?: string): number {
    let z = 0;
    for (const o of Object.values(this.w.objects)) {
      if (o.id === exclude || o.support === 'hand') continue;
      const dx = Math.abs(x - o.pose.x);
      const dy = Math.abs(y - o.pose.y);
      if (o.kind === 'tile' && dx < TILE.half && dy < TILE.half) z = Math.max(z, TILE.h);
      if (o.kind === 'rack' && dx < RACK.hx && dy < RACK.hy) z = Math.max(z, RACK.h);
      if (o.kind === 'loopHolder' && dx < HOLDER.hx && dy < HOLDER.hy) z = Math.max(z, HOLDER.h);
      if (o.kind === 'burner' && Math.hypot(dx, dy) < BURNER.baseR) z = Math.max(z, Math.hypot(dx, dy) < BURNER.barrelR + 0.4 ? MOUTH_Z + 0.2 : BURNER.baseH);
    }
    return z;
  }

  // ─────────────── Acciones ───────────────

  valveValue(v: ValveId): number {
    const b = this.w.burner;
    return v === 'TABLE' ? b.tableGasValve : v === 'NEEDLE' ? b.needleGasValve : b.airCollar;
  }

  setValve(valve: ValveId, value: number) {
    const v = Math.max(0, Math.min(1, value));
    if (Math.abs(v - this.valveValue(valve)) < 1e-4) return;
    this.dispatch({ type: 'setValve', valve, value: v });
  }

  nudgeHeight(dz: number) {
    const h = this.held;
    if (!h) return;
    if (h.magnet) {
      h.magnet.z = Math.max(h.magnet.z + dz * 0.5, h.magnet.z - 3);
      return;
    }
    const z1 = Math.max(0, Math.min(45, h.z + dz));
    // Subir o bajar no desplaza el objeto en la mesada: se compensa el cambio de proyección del puntero.
    if (this.pointer && this.view && !h.keyboard) {
      const before = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
      const after = this.view.toBench(this.pointer.x, this.pointer.y, z1);
      h.ox += before.x - after.x;
      h.oy += before.y - after.y;
    }
    h.z = z1;
  }

  /**
   * Coloca el vidrio de cobalto entre la vista y la llama, sostenido por la otra mano (soporte), sin soltar lo que se
   * tiene en la mano; si ya está colocado, lo retira a la mesada (control accesible, §9.5, tecla G).
   */
  alignGlass() {
    const g = this.w.objects.glass;
    const cam = this.lab.camera?.position();
    if (!g || !cam) return;
    if (this.held?.id === 'glass') this.release();
    if (g.support === 'stand') {
      this.layOnBench('glass', g.pose.x, 10, 0.8);
      return;
    }
    const m = mouthPos(this.w, this.host.runtime.ctx);
    const fz = m.z + Math.max(4, this.w.burner.flame.heightCm * 0.5);
    const d = { x: cam.x - m.x, y: cam.y - m.y, z: cam.z - fz };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const k = Math.min(30, len * 0.5) / len;
    this.dispatch({ type: 'setPose', id: 'glass', pose: { x: m.x + d.x * k, y: m.y + d.y * k, z: fz + d.z * k, rotationRad: 0 }, support: 'stand' });
  }

  private tongsTip(): Pose | null {
    const t = this.w.objects.tongs;
    return t ? t.pose : null;
  }

  /** Punto de agarre de la cápsula: el borde frontal (la pinza llega desde el estudiante). */
  private capsuleGripPoint() {
    const c = this.w.objects.capsule;
    if (!c) return null;
    return { x: c.pose.x, y: c.pose.y - CAPSULE.rimR, z: c.pose.z + CAPSULE.height };
  }

  toggleClamp() {
    const tg = this.w.tongs.tongs;
    if (!tg) return;
    if (tg.holding) {
      const cap = this.w.objects.capsule;
      this.dispatch({ type: 'unclamp', tongsId: 'tongs' });
      if (cap && this.overTile(cap.pose.x, cap.pose.y) && cap.pose.z - TILE.h < 4) {
        this.dispatch({ type: 'setPose', id: 'capsule', pose: { x: cap.pose.x, y: cap.pose.y, z: TILE.h, rotationRad: 0 }, support: 'tile' });
      } else this.toPhysics('capsule');
      this.host.sound('metal');
      return;
    }
    const tip = this.tongsTip();
    const g = this.capsuleGripPoint();
    if (!tip || !g) return;
    const d = Math.hypot(tip.x - g.x, tip.y - g.y, tip.z - g.z);
    const grip = Math.max(0, Math.min(1, 1 - d / 3));
    const r = this.dispatch({ type: 'clamp', tongsId: 'tongs', targetId: 'capsule', grip });
    if (!r.ok) this.host.notify('warn', 'p3.hint.gripMissed');
    else this.host.sound('metal');
  }

  private wipeIfNear() {
    const c = this.w.objects.capsule;
    const h = this.w.objects.cloth;
    if (!c || !h) return;
    if (Math.hypot(c.pose.x - h.pose.x, c.pose.y - h.pose.y) < 7) this.dispatch({ type: 'wipeCapsule' });
  }

  private soapIfNear() {
    const s = this.w.objects.soap;
    if (!s) return;
    const d = Math.min(...hosePoints(this.w, this.host.runtime.ctx, 10).map((q) => Math.hypot(q.x - s.pose.x, q.y - s.pose.y)));
    if (d < 7) this.dispatch({ type: 'soapTest' });
    else this.host.notify('info', 'p3.hint.soapNear');
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    const h = this.held;
    const w = this.w;
    if (h && w.objects[h.id] && this.view) {
      if (!h.keyboard && this.pointer) {
        // El puntero se proyecta a la altura de transporte (no a la actual): durante el descenso del imán la
        // posición horizontal no oscila.
        const p = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
        h.x = p.x;
        h.y = p.y;
      }
      const o = w.objects[h.id];
      let tx = h.x + h.ox;
      let ty = h.y + h.oy;
      let tz = h.z;
      // Al sacar un asa del soporte o un tubo de la gradilla, primero sube en vertical y después se desplaza:
      // así no roza a sus vecinos.
      if (h.lifting) {
        if (Math.abs(h.curZ - h.z) < 0.3) h.lifting = false;
        else {
          tx = h.from.pose.x;
          ty = h.from.pose.y;
        }
      }
      // Imán del asa: boca de un tubo, HCl o vaso de enjuague.
      if (h.kind === 'loop') {
        const m = this.loopMagnet(tx, ty, h.magnet);
        if (m && (!h.magnet || h.magnet.id !== m.id)) h.magnet = m;
        if (!m) h.magnet = null;
        if (h.magnet) {
          tx = h.magnet.x;
          ty = h.magnet.y;
          tz = h.magnet.z;
        }
      }
      const floor = this.platformZ(tx, ty, h.id) + (h.kind === 'burner' ? 0 : 0.3);
      if (!h.magnet) tz = Math.max(tz, floor);
      // Inercia moderada (§13.1): la pose sigue al puntero con suavizado.
      const k = Math.min(1, dt * (h.magnet ? 8 : 18));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const nz = h.kind === 'burner' ? 0 : h.curZ;
      if (Math.hypot(nx - o.pose.x, ny - o.pose.y, nz - o.pose.z) > 0.005) {
        this.dispatch({ type: 'setPose', id: h.id, pose: { x: nx, y: ny, z: nz, rotationRad: 0 }, support: 'hand' });
      }
      // Arrastre cerca del borde: la vista se desplaza.
      if (this.pointer && !h.keyboard) {
        const W = this.view.viewW();
        if (this.pointer.x < 30) this.view.edgePan(-1, dt);
        else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
      }
    }
    // La cápsula sujeta sigue a la pinza.
    const tg = w.tongs.tongs;
    const tip = this.tongsTip();
    if (tg?.holding && tip) {
      const target = { x: tip.x, y: tip.y + CAPSULE.rimR, z: tip.z - CAPSULE.height, rotationRad: 0 };
      const c = w.objects.capsule;
      if (c && Math.hypot(c.pose.x - target.x, c.pose.y - target.y, c.pose.z - target.z) > 0.01) this.dispatch({ type: 'setPose', id: 'capsule', pose: target, support: 'tongs:tongs' });
    }
    // ¿La pinza está en posición de sujetar?
    this.clampReady = false;
    if (this.held?.kind === 'tongs' && !tg?.holding && tip) {
      const g = this.capsuleGripPoint();
      if (g && Math.hypot(tip.x - g.x, tip.y - g.y, tip.z - g.z) < 3) this.clampReady = true;
    }
    // Chispas: sonido mientras se acciona el encendedor.
    if (w.lighter.sparking) {
      this.sparkSound -= dt;
      if (this.sparkSound <= 0) {
        this.host.sound('spark');
        this.sparkSound = 0.35;
      }
    }
    // Alineación del vidrio con la vista (geometría real, §13.6).
    this.alignTimer -= dt;
    if (this.alignTimer <= 0) {
      this.alignTimer = 0.2;
      const a = this.glassAlignment();
      if (Math.abs(a - this.lastAlignment) > 0.04 || (a === 0 && this.lastAlignment !== 0)) {
        this.lastAlignment = a;
        const cam = this.lab.camera?.position();
        const g = w.objects.glass?.pose;
        this.dispatch({ type: 'setFilterAlignment', alignment: a, distanceCm: cam && g ? Math.hypot(cam.x - g.x, cam.y - g.y, cam.z - g.z) : 0 });
      }
    }
  }

  private loopMagnet(x: number, y: number, current: Held['magnet']): Held['magnet'] {
    const w = this.w;
    const ctx = this.host.runtime.ctx;
    // Mientras está dentro, se mantiene hasta alejarse 2,5 cm del eje.
    if (current && Math.hypot(x - current.x, y - current.y) < 2.5) return current;
    for (const sol of Object.values(w.solutions)) {
      const t = w.objects[sol.id];
      if (!t || sol.spilled || t.support === 'hand' || t.support === 'falling') continue;
      if (Math.hypot(x - t.pose.x, y - t.pose.y) < 1.3) {
        const surf = t.pose.z + TUBE.bottomZ + sol.volumeMl * TUBE.cmPerMl;
        return { id: sol.id, x: t.pose.x, y: t.pose.y, z: Math.max(t.pose.z + TUBE.bottomZ + 0.3, surf - 0.6) };
      }
    }
    for (const id of ['hcl', 'rinse']) {
      const o = w.objects[id];
      if (!o) continue;
      const r = id === 'hcl' ? ctx.geo.hcl.r : ctx.geo.rinse.r;
      if (Math.hypot(x - o.pose.x, y - o.pose.y) < r) return { id, x: o.pose.x, y: o.pose.y, z: o.pose.z + 2 };
    }
    return null;
  }

  /** Fracción de la llama visible a través del vidrio (rayos cámara → puntos del eje de la llama). */
  glassAlignment(): number {
    const g = this.lab.glass;
    const cam = this.lab.camPos;
    const w = this.w;
    if (!g.on || !isLit(w) || w.burner.flame.heightCm <= 0) return 0;
    const m = mouthPos(w, this.host.runtime.ctx);
    const H = w.burner.flame.heightCm;
    let inside = 0;
    const N = 8;
    for (let i = 0; i < N; i++) {
      // Escena: X = x, Y = z, Z = −y.
      const px = m.x;
      const py = m.z + w.burner.flame.liftGapCm + (H * (i + 0.5)) / N;
      const pz = -m.y;
      const dx = px - cam.x;
      const dy = py - cam.y;
      const dz = pz - cam.z;
      const den = dx * g.n.x + dy * g.n.y + dz * g.n.z;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((g.center.x - cam.x) * g.n.x + (g.center.y - cam.y) * g.n.y + (g.center.z - cam.z) * g.n.z) / den;
      if (t <= 0 || t >= 1) continue;
      const hx = cam.x + dx * t - g.center.x;
      const hy = cam.y + dy * t - g.center.y;
      const hz = cam.z + dz * t - g.center.z;
      if (Math.abs(hx * g.u.x + hy * g.u.y + hz * g.u.z) < g.halfW && Math.abs(hx * g.v.x + hy * g.v.y + hz * g.v.z) < g.halfH) inside++;
    }
    return inside / N;
  }
}

export { LOOP };
