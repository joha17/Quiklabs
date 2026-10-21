/**
 * Interacción de la Práctica 8: gestos → comandos. Trabaja en cm de mesada y nunca conoce Three.js (§14.1).
 * - Arrastre con altura de transporte; al soltar, el objeto va al apoyo que corresponda: platillo, baño, hielo, aro
 *   de corcho, aro del embudo, Büchner, estufa, colector de fracciones, condensador sobre el balón o, para las
 *   herramientas (gotero, espátula, termómetro), dentro de un recipiente. Un balón soltado en la mesada se vuelca: el
 *   dominio lo decide (ORG04).
 * - Vertido: un recipiente sobre la boca de otro (o sobre el Büchner) y P mantenida lo inclina; el caudal sale del
 *   dominio. Gotero: P aspira, U entrega. Espátula: P carga o descarga. Piseta: P = 0,5 mL (Mayús = 4 mL).
 * - Embudo en la mano: A agita (con tapón), X ventea, T pone o quita el tapón. La llave se abre desde la propia llave
 *   o el panel, y descarga en el recipiente que esté bajo el vástago.
 * - Recipiente en la mano: A lo hace girar (mezcla). G toma o deja la pinza para el balón caliente.
 * - No hay botón «Reaccionar», «Separar» ni «Secar»: el dominio decide (§5.2).
 */
import type { OrganicHost } from './host';
import type { OrganicLab3D } from './OrganicLab3D';
import type { P08Command } from '../../simulation/organic-world/commands';
import type { P08ObjKind, P08World, Pose } from '../../simulation/organic-world/types';
import { pourDockPose } from '../interaction/pourDock';
import { PAN_POS } from '../../practices/practice-08/definition';
import { GEO08 } from '../../simulation/organic-world/geometry';
import { vesselMl } from '../../simulation/organic-world/world';
import { POUR_LIP08, SPOTS, buchnerMouth, isPourable, levelsZ, mouthOf, supportPoint } from './layout';

export interface PickHit08 {
  id: string;
  part?: string;
}

export interface ViewAdapter08 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHit08 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
}

export interface Held08 {
  id: string;
  kind: P08ObjKind;
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
const DIP_KINDS = new Set<P08ObjKind>(['dropper', 'spatula', 'thermometer']);
/** Lo que se puede poner en el platillo. */
const PAN_KINDS = new Set<P08ObjKind>(['watchGlass', 'beaker', 'erlenmeyer', 'roundFlask', 'cylinder', 'vial', 'filterPaper', 'bottle', 'jar', 'washBottle', 'plasticCup']);
const CARRY_Z: Partial<Record<P08ObjKind, number>> = {
  roundFlask: 16, beaker: 12, erlenmeyer: 14, cylinder: 20, bottle: 14, jar: 10, vial: 10, dropper: 22, spatula: 18, thermometer: 22, washBottle: 14,
  watchGlass: 12, filterPaper: 18, sepFunnel: 26, condenser: 18, plasticCup: 10,
};
const TOP: Partial<Record<P08ObjKind, number>> = {
  balance: GEO08.balance.h, bottle: 12, jar: 6, beaker: GEO08.beaker100.h, erlenmeyer: GEO08.erlenmeyer.h, cylinder: GEO08.cyl25.h, waste: GEO08.waste.h,
  washBottle: GEO08.washBottle.h, vial: GEO08.vial.h, watchGlass: GEO08.watchGlass.h, plate: GEO08.plate.h + GEO08.bath.h, iceBath: GEO08.iceBath.h, oven: GEO08.oven.h,
  fractionModule: GEO08.fractionModule.h * 0.5, analyzer: GEO08.analyzer.h, mpApparatus: GEO08.mpApparatus.h, kitasato: GEO08.kitasato.h + GEO08.buchner.h,
  roundFlask: GEO08.roundFlask.h, burner: 8, ppeTray: 5, corkRing: 1.2, plasticCup: GEO08.plasticCup.h,
};
const FOOT: Partial<Record<P08ObjKind, number>> = {
  balance: 13, bottle: 3, jar: 2.4, beaker: 2.8, erlenmeyer: 3.2, cylinder: 2.6, waste: 4.5, washBottle: 3.6, vial: 1.6, watchGlass: 4.6, plate: 13, iceBath: 9.5,
  oven: 15, fractionModule: 17, analyzer: 12, mpApparatus: 9, kitasato: 4, roundFlask: 2.6, funnelRing: 4, burner: 3.5, ppeTray: 15, corkRing: 3, plasticCup: 2.6,
  vacuumPump: 5, filterPaper: 3.6,
};
const TILT_SPEED = 40;
const TILT_RETURN = 120;
const WASH_ML = 0.5;

export class OrganicController {
  view: ViewAdapter08 | null = null;
  held: Held08 | null = null;
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

  constructor(private host: OrganicHost, private lab: OrganicLab3D) {}

  private get w(): P08World {
    return this.host.runtime.world;
  }

  private dispatch(c: P08Command) {
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
    if (!r.ok && r.code) this.warn(`p8.cmd.${r.code}`, 2);
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
    const pl = w.plate;
    const fr = w.fractions;
    switch (`${id}:${part}`) {
      case 'balance01:power': this.run(this.dispatch({ type: 'powerBalance', on: !w.balance.powered })); break;
      case 'balance01:tare': this.tare(); break;
      case 'balance01:display': this.readBalance(); break;
      case 'plate01:power': this.run(this.dispatch({ type: 'setPlate', on: !pl.on, setpointC: pl.setpointC })); break;
      case 'plate01:up': this.dispatch({ type: 'setPlate', on: pl.on, setpointC: pl.setpointC + 5 }); break;
      case 'plate01:down': this.dispatch({ type: 'setPlate', on: pl.on, setpointC: pl.setpointC - 5 }); break;
      case 'plate01:stir': this.dispatch({ type: 'setMagneticStir', level01: pl.stir01 > 0 ? (pl.stir01 >= 0.9 ? 0 : 0.9) : 0.5 }); break;
      case 'condenser01:water': this.dispatch({ type: 'setCondenserWater', on: !w.reflux.waterOn }); break;
      case 'th01:display': this.readThermometer(); break;
      case 'sf:valve': this.toggleValve(); break;
      case 'sf:stopper': this.dispatch({ type: 'setStopper', on: !w.vessels.sf?.stoppered }); break;
      case 'buchner:seal': this.dispatch({ type: 'sealBuchner', on: !w.filtration.sealed }); break;
      case 'pump01:power': this.dispatch({ type: 'setVacuum', on: !w.filtration.vacuum }); break;
      case 'oven01:power': this.dispatch({ type: 'setOven', on: !w.oven.on }); break;
      case 'frac01:loDown': this.dispatch({ type: 'setFractionCut', loC: fr.cutLoC - 2, hiC: fr.cutHiC }); break;
      case 'frac01:loUp': this.dispatch({ type: 'setFractionCut', loC: Math.min(fr.cutHiC - 1, fr.cutLoC + 2), hiC: fr.cutHiC }); break;
      case 'frac01:hiDown': this.dispatch({ type: 'setFractionCut', loC: fr.cutLoC, hiC: Math.max(fr.cutLoC + 1, fr.cutHiC - 2) }); break;
      case 'frac01:hiUp': this.dispatch({ type: 'setFractionCut', loC: fr.cutLoC, hiC: fr.cutHiC + 2 }); break;
      case 'frac01:run': this.run(this.dispatch({ type: 'runFractions' })); break;
      case 'analyzer01:purity': this.run(this.dispatch({ type: 'requestAnalysis', method: 'purity' })); break;
      case 'analyzer01:density': this.run(this.dispatch({ type: 'requestAnalysis', method: 'density' })); break;
      case 'mp01:run': this.run(this.dispatch({ type: 'requestAnalysis', method: 'mp' })); break;
      case 'burner01:ignite': this.run(this.dispatch({ type: 'setBurner', on: true })); break;
      default:
        if (w.vessels[id] && part === 'cap') this.dispatch({ type: 'setCap', vesselId: id, capped: !w.vessels[id].capped });
        else return false;
    }
    this.host.sound('click');
    return true;
  }

  /** Llave del embudo: abre hacia el recipiente bajo el vástago o la cierra. */
  toggleValve(opening = 1) {
    const f = this.w.vessels.sf;
    if (!f) return;
    if ((f.valve01 ?? 0) > 0.05) {
      this.dispatch({ type: 'setValve', opening01: 0, receiverId: null });
      return;
    }
    const o = this.w.objects.sf;
    const rec = this.pourTargetAt('sf', o.pose.x, o.pose.y, o.pose.z - GEO08.sepFunnel.stemLen + 1);
    if (!rec) this.hintOnce('p8.hint.receiverBelow', 'warn');
    this.run(this.dispatch({ type: 'setValve', opening01: opening, receiverId: rec === 'buchner' ? null : rec }));
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
        if (!this.w.vessels[o.support]) this.hintOnce('p8.hint.dipFirst', 'warn');
        break;
      case 'spatula':
        this.spatulaAction();
        this.primary = false;
        break;
      case 'washBottle':
        this.squeeze(shift ? 4 : WASH_ML);
        this.dropTimer = 0;
        break;
      case 'thermometer':
        this.readThermometer();
        this.primary = false;
        break;
      default:
        if (!isPourable(this.w, h.id)) this.hintOnce('p8.hint.nothingToDo');
    }
  }

  primaryUp() {
    if (!this.primary) return;
    this.primary = false;
    const h = this.held;
    if (h?.kind === 'dropper') this.dispatch({ type: 'setDropper', dropperId: h.id, squeeze01: 0 });
  }

  /** Agitar: el embudo tapado se sacude; otro recipiente en la mano, se hace girar. */
  shakeDown(strong = false) {
    const h = this.held;
    if (!h || this.shaking || !this.w.vessels[h.id]) return;
    this.shaking = true;
    if (h.kind === 'sepFunnel') {
      const r = this.run(this.dispatch({ type: 'shakeFunnel', on: true }));
      if (!r.ok) this.shaking = false;
      return;
    }
    this.run(this.dispatch({ type: 'setStir', vesselId: h.id, motion01: strong ? 1 : 0.5 }));
  }

  shakeUp() {
    if (!this.shaking) return;
    this.shaking = false;
    const h = this.held;
    if (!h || !this.w.vessels[h.id]) return;
    if (h.kind === 'sepFunnel') this.dispatch({ type: 'shakeFunnel', on: false });
    else this.dispatch({ type: 'setStir', vesselId: h.id, motion01: 0 });
  }

  /** Espátula: cargar dentro de un frasco o vidrio con sólido; descargar sobre otro recipiente. */
  spatulaAction() {
    const o = this.obj('spatula');
    if (!o) return;
    const sup = o.support;
    const w = this.w;
    const load = Object.keys(w.spatula.load).length;
    const src = w.objects[sup];
    if (w.vessels[sup] && Object.keys(w.vessels[sup].solid).length && !load && (src?.kind === 'jar' || src?.kind === 'watchGlass')) {
      const r = this.run(this.dispatch({ type: 'scoop', sourceId: sup }));
      if (r.ok) this.host.sound('click');
      return;
    }
    if (!load) {
      this.hintOnce('p8.hint.spatulaEmpty');
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
    if (k === 'y') return this.readThermometer(), true;
    if (k === 'g') return this.dispatch({ type: 'useTongs', on: !this.w.tongs }), this.host.sound('metal'), true;
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
      if (k === 'x' && h.kind === 'sepFunnel') return this.dispatch({ type: 'vent' }), this.host.sound('drip'), true;
      if (k === 't' && h.kind === 'sepFunnel') return this.dispatch({ type: 'setStopper', on: !this.w.vessels.sf?.stoppered }), true;
      if (k === 'q' || key === 'PageUp') return this.nudgeHeight(1), true;
      if (k === 'e' || key === 'PageDown') return this.nudgeHeight(-1), true;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key];
      if (d) {
        h.x += d[0];
        h.y += d[1];
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
    const keep = DIP_KINDS.has(o.kind) && this.w.vessels[o.support] && o.kind !== 'thermometer';
    const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: keep ? o.support : 'hand' });
    if (!r.ok) {
      this.run(r);
      if (r.code === 'HOT') this.hintOnce('p8.hint.tongs', 'warn');
      return false;
    }
    const z0 = Math.max(o.pose.z + 2, CARRY_Z[o.kind] ?? o.pose.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support }, tilt: 0, pourTarget: null };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(this.w.vessels[id] ? 'clink' : 'click');
    if (this.w.vessels[id]?.capped) this.hintOnce('p8.hint.capped', 'warn');
    if (isPourable(this.w, id)) this.hintOnce('p8.hint.pour');
    if (o.kind === 'roundFlask') this.hintOnce('p8.hint.flaskSupport');
    if (o.kind === 'dropper') this.hintOnce('p8.hint.dropper');
    if (o.kind === 'spatula') this.hintOnce('p8.hint.spatula');
    if (o.kind === 'washBottle') this.hintOnce('p8.hint.wash');
    if (o.kind === 'sepFunnel') this.hintOnce('p8.hint.funnel');
    if (o.kind === 'thermometer') this.hintOnce('p8.hint.thermometer');
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
  place(id: string, kind: P08ObjKind, p: Pose) {
    const w = this.w;
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(p.x - a.x, p.y - a.y) < r;
    // Apoyos con nombre (baño, hielo, aros, Büchner, estufa, colector, condensador sobre el balón).
    for (const s of SPOTS[kind] ?? []) {
      const pt = supportPoint(w, s);
      if (!pt || !near(pt, s === 'rf' ? 3.5 : 6)) continue;
      const busy = Object.values(w.objects).some((o) => o.id !== id && o.movable && o.support === s && o.kind === kind && kind !== 'thermometer');
      if (busy) continue;
      const r = this.sendPose(id, { x: pt.x, y: pt.y, z: pt.z, rotationRad: 0 }, s);
      if (r.ok) {
        this.host.sound(kind === 'condenser' ? 'clink' : 'glass');
        return;
      }
      this.run(r);
    }
    if (PAN_KINDS.has(kind) && near(PAN_POS, 7)) {
      const r = this.sendPose(id, { x: PAN_POS.x, y: PAN_POS.y, z: PAN_POS.z, rotationRad: 0 }, 'pan');
      if (r.ok) {
        this.host.sound('clink');
        this.hintOnce('p8.hint.waitStable');
        return;
      }
      this.run(r);
    }
    if (DIP_KINDS.has(kind)) {
      // Herramienta soltada dentro de un recipiente: queda apoyada con la punta adentro.
      const t = this.dipTarget(p.x, p.y, id);
      if (t) {
        const lv = levelsZ(w, w.vessels[t]);
        this.sendPose(id, { x: w.objects[t].pose.x, y: w.objects[t].pose.y, z: Math.max(lv.floor + 0.2, p.z), rotationRad: 0 }, t);
        this.host.sound('glass');
        return;
      }
    }
    const lying = kind === 'dropper' || kind === 'spatula' || kind === 'thermometer' || kind === 'condenser';
    this.layOnBench(id, p.x, p.y, lying ? 0.5 : 0);
    if (kind === 'roundFlask' && (this.w.objects[id]?.pose.rotationRad ?? 0) > 1) this.hintOnce('p8.hint.flaskTipped', 'warn');
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
    const r = FOOT[o?.kind ?? 'dropper'] ?? 1;
    const spot = this.freeSpot(Math.max(-8, Math.min(600, x0)), Math.max(3, Math.min(60, y0)), r, id);
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
    h.z = Math.max(0, Math.min(70, h.z + dz));
  }

  // ─────────────── Líquidos ───────────────

  /** Receptor bajo el pico de lo que se sostiene (la boca más alta gana); el Büchner cuenta como receptor. */
  pourTargetAt(id: string, x: number, y: number, z: number): string | null {
    let best: string | null = null;
    let bz = -1e9;
    let bd = 1e9;
    const consider = (t: string, m: { x: number; y: number; z: number; r: number } | null) => {
      if (!m) return;
      const d = Math.hypot(x - m.x, y - m.y);
      if (d >= m.r + 1.5 || z <= m.z - 3) return;
      if (m.z > bz + 0.5 || (Math.abs(m.z - bz) <= 0.5 && d < bd)) {
        bz = m.z;
        bd = d;
        best = t;
      }
    };
    for (const t of Object.keys(this.w.vessels)) {
      const o = this.w.objects[t];
      if (t === id || !o || o.support === 'hand' || o.kind === 'filterPaper' && o.support === 'buchner') continue;
      consider(t, mouthOf(this.w, t));
    }
    if (this.w.objects.buchner) consider('buchner', buchnerMouth(this.w));
    return best;
  }

  private pourDock(h: Held08): { x: number; y: number; z: number } | null {
    if (!isPourable(this.w, h.id) || h.tilt <= 4 || !h.pourTarget) return null;
    const m = h.pourTarget === 'buchner' ? buchnerMouth(this.w) : mouthOf(this.w, h.pourTarget);
    const lip = POUR_LIP08[this.w.vessels[h.id].shape];
    return m && lip ? pourDockPose(lip, (h.tilt * Math.PI) / 180, m, h) : null;
  }

  private updatePour(h: Held08, dt: number) {
    const o = this.obj(h.id)!;
    const target = this.pourDock(h) ? h.pourTarget : this.pourTargetAt(h.id, o.pose.x, o.pose.y, o.pose.z);
    this.dockTarget = target;
    h.tilt = this.primary ? Math.min(140, h.tilt + TILT_SPEED * dt) : Math.max(0, h.tilt - TILT_RETURN * dt);
    if (h.tilt > 4) {
      if (!this.w.pours[h.id] && this.w.vessels[h.id]?.capped) {
        this.hintOnce('p8.hint.capped', 'warn');
        h.tilt = 0;
        return;
      }
      h.pourTarget = target;
      const r = this.run(this.dispatch({ type: 'setPour', sourceId: h.id, targetId: target, tiltDeg: h.tilt }));
      if (!r.ok) h.tilt = 0;
    } else if (this.w.pours[h.id]) this.endPour(h);
  }

  private endPour(h: Held08) {
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
    this.run(this.dispatch({ type: 'squeezeWash', targetId: target, ml }));
    this.host.sound('drip');
  }

  // ─────────────── Lecturas ───────────────

  readVolume(id: string) {
    const w = this.w;
    const v = w.vessels[id];
    if (!v) return { ok: false };
    const z = levelsZ(w, v).surface;
    const cam = this.lab.camera?.position();
    const eyeDz = cam ? cam.z - z : 20;
    const r = this.run(this.dispatch({ type: 'readVolume', vesselId: id, eyeDzCm: eyeDz }));
    if (Math.abs(eyeDz) > 1) this.hintOnce('p8.hint.eyeLevel', 'warn');
    this.host.sound('click');
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

  /** Traslado accesible (panel): lleva un objeto a un destino como si se soltara allí. */
  moveTo(id: string, where: 'pan' | 'bench' | string, z?: number): { ok: boolean; code?: string } {
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
      // El balón se deja en su aro de corcho (en la mesada se volcaría): el panel elige el apoyo seguro.
      if (o.kind === 'roundFlask' && w.objects.cork01 && !Object.values(w.objects).some((x) => x.id !== id && x.support === 'cork01')) return this.moveTo(id, 'cork01');
      this.layOnBench(id, o.pose.x, Math.max(8, o.pose.y - (o.support === 'pan' ? 16 : 6)), DIP_KINDS.has(o.kind) || o.kind === 'condenser' ? 0.5 : 0);
      return { ok: true };
    }
    if (where === 'pan') {
      this.place(id, o.kind, { x: PAN_POS.x, y: PAN_POS.y, z: o.pose.z, rotationRad: 0 });
      return { ok: true };
    }
    const pt = supportPoint(w, where);
    if (pt && (SPOTS[o.kind] ?? []).includes(where)) {
      return this.run(this.sendPose(id, { x: pt.x, y: pt.y, z: pt.z, rotationRad: 0 }, where));
    }
    // Herramientas dentro de un recipiente.
    const t = w.objects[where];
    if (!t) return { ok: false };
    if (w.vessels[where] && DIP_KINDS.has(o.kind)) {
      const lv = levelsZ(w, w.vessels[where]);
      return this.run(this.sendPose(id, { x: t.pose.x, y: t.pose.y, z: z ?? lv.floor + 0.3, rotationRad: 0 }, where));
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
      let tz = h.z;
      const dock = this.pourDock(h);
      if (dock) {
        tx = dock.x;
        ty = dock.y;
        tz = dock.z;
      }
      const dipping = DIP_KINDS.has(h.kind) ? this.dipTarget(tx, ty, h.id) : null;
      let floor = this.clearZ(tx, ty, FOOT[h.kind] ?? 0.6, h.id) + 0.3;
      if (dipping) floor = levelsZ(this.w, this.w.vessels[dipping]).floor + 0.2;
      tz = Math.max(tz, floor);
      const k = Math.min(1, dt * (dock ? 8 : 16));
      const nx = o.pose.x + (tx - o.pose.x) * k;
      const ny = o.pose.y + (ty - o.pose.y) * k;
      h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
      const rot = (h.tilt * Math.PI) / 180;
      let support = 'hand';
      if (dipping && h.kind !== 'thermometer') {
        const m = mouthOf(this.w, dipping)!;
        if (h.curZ < m.z - 0.5) support = dipping;
      }
      const moved = Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004 || Math.abs(rot - o.pose.rotationRad) > 0.001;
      if (moved || support !== o.support) this.sendPose(h.id, { x: nx, y: ny, z: h.curZ, rotationRad: rot }, support);
      if (isPourable(this.w, h.id)) this.updatePour(h, dt);
      if (DIP_KINDS.has(h.kind)) this.dockTarget = support !== 'hand' ? support : dipping;
      if (h.kind === 'washBottle') {
        this.dockTarget = this.pourTargetAt('washBottle', o.pose.x + 2.5, o.pose.y, o.pose.z + 6);
        if (this.primary) {
          this.dropTimer += dt;
          if (this.dropTimer > 0.3) {
            this.dropTimer = 0;
            this.squeeze(this.primaryShift ? 4 : WASH_ML);
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
