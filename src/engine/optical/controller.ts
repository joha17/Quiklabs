/**
 * Controlador de gestos de B01 (§6.1, §14): convierte ratón y teclado en COMANDOS del dominio. Tomar/llevar/soltar con
 * encaje en el área de montaje, la platina, las ranuras de la caja, la base del estereoscopio y las bandejas. Las
 * herramientas actúan sobre lo que tienen debajo de la punta (P / clic izquierdo): pinza (tomar la hoja, el
 * cubreobjetos o una muestra; soltarlos; bajar el cubreobjetos con la inclinación elegida con Q/E), gotero, bisturí,
 * papel absorbente y papel de lente.
 * Los instrumentos se operan TOMANDO cada pieza en su lugar: clic sostenido sobre la perilla, el revólver, la palanca
 * de la pinza o del iris, los mandos X/Y, los oculares… y arrastre; la pieza gira sobre su pivote siguiendo la mano y
 * el giro se traduce a la magnitud del dominio con la tabla `KIN` (la misma que usa el modelo para dibujarla). El
 * revólver encaja en el enclavamiento cercano al soltarlo; la pinza vuelve cerrada por su resorte salvo que se suelte
 * abierta del todo. Cada arrastre va entre `gesture begin/end` y se envía una vez por fotograma, cuantizado.
 * Alternativa accesible: clic para seleccionar el mando y Q/E (Mayús = paso grande) o la rueda. Nada se decide aquí:
 * el dominio calcula foco, burbujas, choques…
 */
import type { B01Command, B01DispatchResult } from '../../simulation/optical-world/commands';
import type { B01ObjKind, OpticalWorld, Pose } from '../../simulation/optical-world/types';
import { microscopeView } from '../../simulation/optical-world/world';
import { COVER_BOX, GEO_B01, MIC_POS, PREP_SPOT, SAMPLE_TRAY, STAGE_SEAT, STEREO_BASE, STEREO_POS } from '../../simulation/optical-world/geometry';
import type { OpticalHost } from './host';
import type { OpticalLab3D } from './OpticalLab3D';
import { spotsFor, stageTop } from './layout';
import { KIN, type PartGrip } from './parts';
import type { GrabTracker } from './gestures';

export interface PickHitB01 {
  id: string;
  part?: string;
  grip?: PartGrip;
  /** Seguimiento geométrico del arrastre de la pieza tocada (solo en la escena real). */
  track?: (sx: number, sy: number) => GrabTracker | null;
}

export interface ViewAdapterB01 {
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  pick(sx: number, sy: number, excludeId?: string | null): PickHitB01 | null;
  viewW(): number;
  setOrbitEnabled(on: boolean): void;
  edgePan(dir: -1 | 1, dt: number): void;
  /** Punto de la mesada (cm) de una pieza, para la mano de la demostración. */
  partAnchor?(id: string, part: string): { x: number; y: number; z: number } | null;
}

/** Arrastre en curso sobre una pieza de un instrumento. */
export interface PartDragB01 {
  id: string;
  part: string;
  grip: PartGrip;
  tracker: GrabTracker | null;
  startX: number;
  startY: number;
  moved: boolean;
  /** Posición provisional de las piezas con resorte (pinza: 0 cerrada … 1 abierta). */
  value: number;
  warned: Set<string>;
}

/** Píxeles de movimiento a partir de los cuales un clic sobre una pieza pasa a ser un arrastre. */
const DRAG_SLOP_PX = 4;
/** Ventana (°) en la que el resorte del revólver lo lleva al enclavamiento al soltarlo. */
const TURRET_SNAP_DEG = 12;
/** Giro por muesca de la rueda del ratón sobre una pieza (rad) y fin del gesto de rueda (s sin girar). */
const WHEEL_RAD = 0.15;
const WHEEL_IDLE_S = 0.4;

export interface HeldB01 {
  id: string;
  kind: B01ObjKind;
  z: number;
  curZ: number;
  x: number;
  y: number;
  keyboard: boolean;
  from: { pose: Pose; support: string };
}

/** Mandos seleccionables (Q/E). */
export type KnobB01 =
  | 'mic:coarse' | 'mic:fine' | 'mic:stageX' | 'mic:stageY' | 'mic:light' | 'mic:diaphragm' | 'mic:condenser' | 'mic:turret'
  | 'ste:zoom' | 'ste:focus' | 'ste:head' | 'ste:incident' | 'ste:transmitted' | 'ste:ipd' | 'ste:diopterL' | 'ste:diopterR';

const CARRY_Z: Partial<Record<B01ObjKind, number>> = {
  slide: 6, fixedSlide: 6, forceps: 5, scalpel: 5, dropperBottle: 9, paper: 4, lensPaper: 4, towel: 4, leafSample: 6, insectSample: 6,
};
const TOOL_KINDS = new Set<B01ObjKind>(['forceps', 'scalpel', 'dropperBottle', 'paper', 'lensPaper', 'towel']);

export class OpticalController {
  view: ViewAdapterB01 | null = null;
  held: HeldB01 | null = null;
  hovered: string | null = null;
  /** Mando activo para Q/E y la rueda. */
  knob: KnobB01 | null = null;
  /** Cubreobjetos bajando (animación del gesto; el comando se envía al tocar). */
  lowering: { coverId: string; slideId: string; speed: number; progress: number } | null = null;
  /** Pieza tomada con el ratón (o con la mano de la demostración). */
  partDrag: PartDragB01 | null = null;
  /** Pieza bajo el puntero (cursor y rótulo). */
  hoverPart: PickHitB01 | null = null;
  /** Avance acumulado de cada pieza desde el último envío, en unidades del dominio. */
  private pending = new Map<string, number>();
  private wheelGesture: { key: string; idle: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private down = false;
  private hinted = new Set<string>();

  constructor(private host: OpticalHost, private lab: OpticalLab3D) {}

  private get w(): OpticalWorld {
    return this.host.runtime.world;
  }

  dispatch(c: B01Command): B01DispatchResult {
    return this.host.runtime.dispatch(c);
  }

  private run(r: B01DispatchResult | undefined) {
    if (r && !r.ok && r.code) this.host.notify('warn', `b01.cmd.${r.code}`);
    return r;
  }

  hintOnce(key: string, level: 'info' | 'warn' = 'info') {
    if (this.hinted.has(key) || !this.host.guidedHints()) return;
    this.hinted.add(key);
    this.host.notify(level, key);
  }

  // ─────────────── Puntero ───────────────

  onPointerDown(sx: number, sy: number, button: number): boolean {
    if (button !== 0 || !this.view || this.w.safety.stoppedByTeacher) return false;
    this.pointer = { x: sx, y: sy };
    if (this.held) {
      this.primary(false);
      return true;
    }
    const hit = this.view.pick(sx, sy, null);
    // Un clic en otro sitio suelta el mando seleccionado para el teclado.
    if (this.knob && (!hit?.part || this.knobFor(this.partKey(hit.id, hit.part)) !== this.knob)) this.knob = null;
    if (!hit) {
      this.host.select(null);
      return false;
    }
    this.host.select(hit.id);
    if (hit.part && hit.grip && hit.grip.kind !== 'press') return this.beginPartDrag(hit, sx, sy);
    if (hit.part && this.instrumentPart(hit.id, hit.part)) return true;
    const o = this.w.objects[hit.id];
    if (o?.movable) {
      this.down = true;
      return this.beginDrag(hit.id, false);
    }
    return true;
  }

  onPointerMove(sx: number, sy: number) {
    this.pointer = { x: sx, y: sy };
    const d = this.partDrag;
    if (d) {
      if (!d.moved && Math.hypot(sx - d.startX, sy - d.startY) >= DRAG_SLOP_PX) this.startPartMotion(d);
      if (d.moved && d.tracker) this.dragPart(d.tracker.move(sx, sy));
      return;
    }
    if (!this.held && this.view) {
      const hit = this.view.pick(sx, sy, null);
      this.hovered = hit?.id ?? null;
      this.hoverPart = hit?.part ? hit : null;
    }
  }

  onPointerUp() {
    if (this.partDrag) this.releasePart();
    if (this.held && this.down && !this.held.keyboard) this.release();
    this.down = false;
  }

  onWheel(dy: number): boolean {
    if (this.held) {
      this.nudgeHeight((dy > 0 ? -1 : 1) * 0.6);
      return true;
    }
    // Rueda sobre una pieza giratoria: la gira (un gesto mientras siga girando).
    const hp = this.hoverPart;
    if (hp?.part && hp.grip && (hp.grip.kind === 'rotary' || hp.grip.kind === 'lever') && !(hp.id === 'mic' && hp.part === 'clip')) {
      const key = `${hp.id === 'mic' ? 'mic' : 'ste'}:${hp.part}`;
      if (this.wheelGesture?.key !== key) {
        this.endWheelGesture();
        this.dispatch({ type: 'gesture', part: key, phase: 'begin' });
      }
      this.wheelGesture = { key, idle: 0 };
      this.applyPart(key, (dy > 0 ? -1 : 1) * WHEEL_RAD, hp.grip);
      this.flushParts();
      return true;
    }
    // Fuera de las piezas la rueda acerca o aleja la cámara (el mando seleccionado sigue con Q/E).
    return false;
  }

  private endWheelGesture() {
    const g = this.wheelGesture;
    if (!g) return;
    this.wheelGesture = null;
    if (g.key === 'mic:turret') this.snapTurret('nosepiece');
    this.dispatch({ type: 'gesture', part: g.key, phase: 'end' });
  }

  // ─────────────── Piezas tomadas con la mano ───────────────

  private partKey(id: string, part: string) {
    return `${id === 'mic' ? 'mic' : 'ste'}:${part}`;
  }

  /** Clic sostenido sobre una pieza: se toma (el giro empieza al moverse más de unos píxeles). */
  beginPartDrag(hit: PickHitB01, sx: number, sy: number): boolean {
    if (!hit.part || !hit.grip) return false;
    const key = this.partKey(hit.id, hit.part);
    this.partDrag = {
      id: hit.id, part: hit.part, grip: hit.grip, tracker: hit.track?.(sx, sy) ?? null, startX: sx, startY: sy, moved: false,
      value: key === 'mic:clip' ? (this.w.microscope.clipOpen ? 1 : 0) : 0, warned: new Set(),
    };
    this.view?.setOrbitEnabled(false);
    this.dispatch({ type: 'inspect', target: this.inspectTarget(key) });
    return true;
  }

  /** La mano de la demostración toma una pieza (mismo camino que el ratón, sin geometría de pantalla). */
  grabPart(id: string, part: string, grip: PartGrip): void {
    if (this.partDrag) this.releasePart();
    this.beginPartDrag({ id, part, grip }, 0, 0);
    this.startPartMotion(this.partDrag!);
  }

  private startPartMotion(d: PartDragB01) {
    d.moved = true;
    this.dispatch({ type: 'gesture', part: this.partKey(d.id, d.part), phase: 'begin' });
  }

  /** Avance de la pieza tomada: radianes (perillas, palancas) o cm (deslizamientos). */
  dragPart(amount: number) {
    const d = this.partDrag;
    if (!d || !amount) return;
    const key = this.partKey(d.id, d.part);
    if (key === 'mic:clip') {
      d.value = Math.max(0, Math.min(1, d.value + amount / KIN.clipOpenRad));
      return;
    }
    this.applyPart(key, amount, d.grip);
  }

  /** Suelta la pieza: clic simple (ocular, selección), resorte del revólver y de la pinza, fin del gesto. */
  releasePart() {
    const d = this.partDrag;
    if (!d) return;
    this.partDrag = null;
    this.view?.setOrbitEnabled(true);
    const key = this.partKey(d.id, d.part);
    if (!d.moved) {
      if (d.grip.click) this.instrumentPart(d.id, d.part);
      else {
        // Clic sin arrastre: el mando queda seleccionado para el teclado (alternativa accesible).
        this.knob = this.knobFor(key);
        this.hintOnce('b01.hint.dragKnob');
      }
      return;
    }
    this.flushParts(d);
    if (key === 'mic:turret') this.snapTurret(d.grip.variant === 'objective' ? 'objective' : 'nosepiece');
    if (key === 'mic:clip') {
      const open = d.value > 0.5;
      if (open !== this.w.microscope.clipOpen) this.dispatch({ type: 'openClip', open });
      this.host.sound('click');
    }
    this.dispatch({ type: 'gesture', part: key, phase: 'end' });
  }

  /** El resorte del revólver lo lleva al enclavamiento cercano (clic mecánico); lejos de todos, queda entre dos. */
  private snapTurret(grip: 'nosepiece' | 'objective') {
    const d = this.w.params.microscope.turretDetentDeg;
    const a = this.w.microscope.turretDeg;
    const off = Math.round(a / d) * d - a;
    if (Math.abs(off) > 1e-9 && Math.abs(off) <= TURRET_SNAP_DEG) {
      this.run(this.dispatch({ type: 'turnTurret', deltaDeg: Math.round(off * 100) / 100, grip }));
      this.host.sound('click');
    }
  }

  /** Posición provisional de la pieza arrastrada (la dibuja el modelo). */
  dragView(): { part: string; value: number } | null {
    const d = this.partDrag;
    return d && d.moved && d.part === 'clip' ? { part: 'mic:clip', value: d.value } : null;
  }

  private knobFor(key: string): KnobB01 | null {
    const k = key.replace('mic:ocular', 'mic:diopterL').replace('ste:oculars', 'ste:ipd') as KnobB01;
    return (['mic:coarse', 'mic:fine', 'mic:stageX', 'mic:stageY', 'mic:light', 'mic:diaphragm', 'mic:condenser', 'mic:turret', 'ste:zoom', 'ste:focus', 'ste:head', 'ste:incident', 'ste:transmitted', 'ste:ipd', 'ste:diopterL', 'ste:diopterR'] as string[]).includes(k) ? k : null;
  }

  private inspectTarget(key: string) {
    return key.replace(/mic:stage[XY]/, 'mic:stageKnobs').replace('ste:ipd', 'ste:interpupillary').replace(/ste:diopter[LR]/, 'ste:diopter').replace('mic:diopterL', 'mic:ocular');
  }

  /** Convierte el giro (rad) o desplazamiento (cm) de una pieza en avance del dominio (tabla `KIN`). */
  private applyPart(key: string, amount: number, grip: PartGrip) {
    const add = (k: string, v: number) => this.pending.set(k, (this.pending.get(k) ?? 0) + v);
    switch (key) {
      case 'mic:coarse': case 'mic:fine': case 'ste:focus': add(key, amount / KIN.radPerTurn); break;
      case 'mic:stageX': case 'mic:stageY': add(key, amount / KIN.stageRadPerMm); break;
      case 'mic:light': case 'ste:incident': case 'ste:transmitted': add(key, amount / KIN.dialRadPer01); break;
      case 'mic:diaphragm': add(key, amount / KIN.irisRadPer01); break;
      case 'mic:condenser': add(key, amount / KIN.condenserRadPer01); break;
      case 'mic:turret': add(grip.variant === 'objective' ? 'mic:turret:objective' : key, amount / KIN.turretRadPerDeg); break;
      case 'mic:diopterL': case 'ste:diopterL': case 'ste:diopterR': add(key, amount / KIN.diopterRadPerD); break;
      case 'ste:zoom': add(key, amount / KIN.zoomRadPerX); break;
      case 'ste:head': add(key, amount * 10); break;
      // Oculares: cada tubo se desliza hacia afuera o adentro; la separación cambia el doble (mm).
      case 'mic:ocular': case 'ste:oculars': add(key, (grip.variant === 'left' ? -1 : 1) * amount * 20); break;
    }
  }

  /** Envía lo acumulado de cada pieza (una vez por fotograma), cuantizado para que la cinta sea reproducible. */
  flushParts(d: PartDragB01 | null = this.partDrag) {
    if (!this.pending.size) return;
    const w = this.w;
    const m = w.microscope;
    const s = w.stereo;
    const q = (v: number, step: number) => Math.round(v / step) * step;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const send = (key: string, c: B01Command) => {
      const r = this.dispatch(c);
      if (!r.ok) {
        // Pieza bloqueada (p. ej. el macro en la zona de separación baja): no se acumula giro fantasma.
        this.pending.delete(key);
        if (r.code && (!d || !d.warned.has(r.code))) {
          d?.warned.add(r.code);
          this.host.notify('warn', `b01.cmd.${r.code}`);
        }
      }
    };
    for (const [key, v] of [...this.pending]) {
      let rest = 0;
      switch (key) {
        case 'mic:coarse': case 'mic:fine': case 'ste:focus': {
          const dq = q(v, 1e-4);
          rest = v - dq;
          if (dq) send(key, key === 'ste:focus' ? { type: 'setStereoFocus', deltaTurns: dq } : { type: key === 'mic:coarse' ? 'turnCoarse' : 'turnFine', deltaTurns: dq });
          break;
        }
        case 'mic:turret': case 'mic:turret:objective': {
          const dq = q(v, 0.01);
          rest = v - dq;
          if (dq) send(key, { type: 'turnTurret', deltaDeg: dq, grip: key === 'mic:turret' ? 'nosepiece' : 'objective' });
          break;
        }
        case 'mic:stageX': case 'mic:stageY': {
          const x = q(m.stageXmm + (key === 'mic:stageX' ? v : 0), 1e-3);
          const y = q(m.stageYmm + (key === 'mic:stageY' ? v : 0), 1e-3);
          if (x !== m.stageXmm || y !== m.stageYmm) send(key, { type: 'setStageXY', xMm: x, yMm: y });
          else rest = v;
          break;
        }
        case 'mic:light': send(key, { type: 'setIllumination', device: 'microscope', value01: q(clamp01(m.light01 + v), 1e-3) }); break;
        case 'ste:incident': send(key, { type: 'setIllumination', device: 'stereo-incident', value01: q(clamp01(s.incident01 + v), 1e-3) }); break;
        case 'ste:transmitted': send(key, { type: 'setIllumination', device: 'stereo-transmitted', value01: q(clamp01(s.transmitted01 + v), 1e-3) }); break;
        case 'mic:diaphragm': send(key, { type: 'setDiaphragm', value01: q(clamp01(m.diaphragm01 + v), 1e-3) }); break;
        case 'mic:condenser': send(key, { type: 'setCondenser', value01: q(clamp01(m.condenser01 + v), 1e-3) }); break;
        case 'ste:zoom': send(key, { type: 'setStereoZoom', zoomX: q(s.zoomX + v, 1e-3) }); break;
        case 'ste:head': send(key, { type: 'setStereoHead', zMm: q(s.headZmm + v, 0.01) }); break;
        case 'mic:ocular': send(key, { type: 'setInterpupillary', device: 'microscope', valueMm: q(m.ipdMm + v, 0.01) }); break;
        case 'ste:oculars': send(key, { type: 'setInterpupillary', valueMm: q(s.ipdMm + v, 0.01) }); break;
        case 'mic:diopterL': send(key, { type: 'setDiopter', device: 'microscope', side: 'left', value: q(m.leftDiopter + v, 0.01) }); break;
        case 'ste:diopterL': send(key, { type: 'setDiopter', side: 'left', value: q(s.leftDiopter + v, 0.01) }); break;
        case 'ste:diopterR': send(key, { type: 'setDiopter', side: 'right', value: q(s.rightDiopter + v, 0.01) }); break;
      }
      if (this.pending.has(key)) {
        if (Math.abs(rest) > 1e-12) this.pending.set(key, rest);
        else this.pending.delete(key);
      }
    }
  }

  // ─────────────── Partes de los instrumentos ───────────────

  /** Clic sobre una parte: botones y palancas actúan; los mandos quedan seleccionados para Q/E. */
  instrumentPart(id: string, part: string): boolean {
    const w = this.w;
    const knob = `${id === 'mic' ? 'mic' : 'ste'}:${part}` as KnobB01;
    switch (`${id}:${part}`) {
      case 'mic:power': this.dispatch({ type: 'setPower', device: 'microscope', on: !w.microscope.power }); break;
      case 'mic:clip': this.dispatch({ type: 'openClip', open: !w.microscope.clipOpen }); break;
      case 'mic:ocular': this.toggleEyepiece('compound'); break;
      case 'mic:turret': this.knob = 'mic:turret'; this.hintOnce('b01.hint.dragKnob'); break;
      case 'ste:power': this.dispatch({ type: 'setPower', device: 'stereo', on: !w.stereo.power }); break;
      case 'ste:oculars': this.toggleEyepiece('stereo'); break;
      case 'case:lid': this.dispatch({ type: 'openSlideCase', open: !w.slideCase.open }); break;
      case 'el:dish': case 'cvBox:box': return false;
      default:
        if (['mic:coarse', 'mic:fine', 'mic:stageX', 'mic:stageY', 'mic:light', 'mic:diaphragm', 'mic:condenser', 'ste:zoom', 'ste:focus', 'ste:head', 'ste:incident', 'ste:transmitted', 'ste:ipd', 'ste:diopterL', 'ste:diopterR'].includes(knob)) {
          this.knob = knob;
          this.dispatch({ type: 'inspect', target: knob.replace('stageX', 'stageKnobs').replace('stageY', 'stageKnobs').replace('ste:ipd', 'ste:interpupillary').replace(/ste:diopter[LR]/, 'ste:diopter') });
          this.hintOnce('b01.hint.knob');
        } else return false;
    }
    this.host.sound('click');
    return true;
  }

  /** Giro de revólver hasta el siguiente enclavamiento (teclado y panel; el revólver da la vuelta completa). */
  nextTurretDelta(dir: 1 | -1): number {
    const d = this.w.params.microscope.turretDetentDeg;
    const a = this.w.microscope.turretDeg;
    const next = dir > 0 ? Math.floor(a / d + 1e-6) * d + d : Math.ceil(a / d - 1e-6) * d - d;
    return next - a;
  }

  toggleEyepiece(instrument: 'compound' | 'stereo') {
    const open = this.w.view.instrument !== instrument;
    this.run(this.dispatch({ type: 'observe', instrument, open }));
    this.host.onEyepiece?.(open ? instrument : null);
  }

  /** Q/E sobre el mando activo (Mayús = paso grande). */
  turnKnob(dir: number, big: boolean) {
    const w = this.w;
    const k = this.knob;
    if (!k) return;
    const m = w.microscope;
    const s = w.stereo;
    const step = big ? 5 : 1;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    switch (k) {
      case 'mic:coarse': this.run(this.dispatch({ type: 'turnCoarse', deltaTurns: dir * 0.1 * step })); break;
      case 'mic:fine': this.run(this.dispatch({ type: 'turnFine', deltaTurns: dir * 0.05 * step })); break;
      case 'mic:stageX': this.dispatch({ type: 'setStageXY', xMm: m.stageXmm + dir * 0.2 * step, yMm: m.stageYmm }); break;
      case 'mic:stageY': this.dispatch({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm + dir * 0.2 * step }); break;
      case 'mic:light': this.dispatch({ type: 'setIllumination', device: 'microscope', value01: clamp01(m.light01 + dir * 0.02 * step) }); break;
      case 'mic:diaphragm': this.dispatch({ type: 'setDiaphragm', value01: clamp01(m.diaphragm01 + dir * 0.02 * step) }); break;
      case 'mic:condenser': this.dispatch({ type: 'setCondenser', value01: clamp01(m.condenser01 + dir * 0.02 * step) }); break;
      case 'mic:turret': this.run(this.dispatch({ type: 'turnTurret', deltaDeg: this.nextTurretDelta(dir > 0 ? 1 : -1) })); break;
      case 'ste:zoom': this.dispatch({ type: 'setStereoZoom', zoomX: Math.round((s.zoomX + dir * 0.1 * step) * 100) / 100 }); break;
      case 'ste:focus': this.run(this.dispatch({ type: 'setStereoFocus', deltaTurns: dir * 0.25 * step })); break;
      case 'ste:head': this.dispatch({ type: 'setStereoHead', zMm: s.headZmm + dir * 1 * step }); break;
      case 'ste:incident': this.dispatch({ type: 'setIllumination', device: 'stereo-incident', value01: clamp01(s.incident01 + dir * 0.02 * step) }); break;
      case 'ste:transmitted': this.dispatch({ type: 'setIllumination', device: 'stereo-transmitted', value01: clamp01(s.transmitted01 + dir * 0.02 * step) }); break;
      case 'ste:ipd': this.dispatch({ type: 'setInterpupillary', valueMm: s.ipdMm + dir * 0.5 * step }); break;
      case 'ste:diopterL': this.dispatch({ type: 'setDiopter', side: 'left', value: s.leftDiopter + dir * 0.25 * step }); break;
      case 'ste:diopterR': this.dispatch({ type: 'setDiopter', side: 'right', value: s.rightDiopter + dir * 0.25 * step }); break;
    }
    this.host.sound('click');
  }

  /** Mirar de lado la separación objetivo–preparación (también mueve la cámara). */
  checkSide() {
    this.dispatch({ type: 'checkSide' });
    this.lab.camera?.eyeLevel('micSide');
  }

  // ─────────────── Teclado ───────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const k = key.toLowerCase();
    const h = this.held;
    if (h) {
      if (key === 'Enter') return this.release(), true;
      if (key === 'Escape') return this.cancel(), true;
      if (k === 'p' || key === ' ') return this.primary(shift), true;
      if ((k === 'q' || k === 'e') && this.coverHeld()) {
        const c = this.w.covers[this.coverHeld()!];
        this.dispatch({ type: 'setCoverTilt', coverId: this.coverHeld()!, angleDeg: c.tiltDeg + (k === 'e' ? 5 : -5) * (shift ? 3 : 1) });
        return true;
      }
      if (k === 'q' || key === 'PageUp') return this.nudgeHeight(1), true;
      if (k === 'e' || key === 'PageDown') return this.nudgeHeight(-1), true;
      const step = shift ? 5 : 1;
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] } as Record<string, number[]>)[key];
      if (d) {
        h.x += d[0];
        h.y += d[1];
        return true;
      }
      return false;
    }
    if ((k === 'q' || k === 'e') && this.knob) return this.turnKnob(k === 'e' ? 1 : -1, shift), true;
    if (k === 'o') {
      const sel = this.host.getSelected();
      if (sel === 'ste') this.toggleEyepiece('stereo');
      else this.toggleEyepiece('compound');
      return true;
    }
    if (k === 'c') {
      const inst = this.w.view.instrument;
      if (inst) this.run(this.dispatch({ type: 'captureObservation', instrument: inst }));
      return true;
    }
    if (k === 'l') return this.checkSide(), true;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const ids = Object.values(this.w.objects).filter((o) => o.support !== 'fc').sort((a, b) => a.pose.x - b.pose.x || a.pose.y - b.pose.y).map((o) => o.id);
      const cur = this.host.getSelected();
      const i = cur ? ids.indexOf(cur) : -1;
      const next = ids[(i + (key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
      this.host.select(next);
      this.lab.camera?.focusObject(next, false);
      return true;
    }
    if (key === 'Enter') {
      const sel = this.host.getSelected();
      if (sel && this.w.objects[sel]?.movable) return this.beginDrag(sel, true);
    }
    return false;
  }

  onKeyUp(_key: string): boolean {
    return false;
  }

  // ─────────────── Tomar, mover, soltar ───────────────

  beginDrag(id: string, keyboard: boolean): boolean {
    const o = this.w.objects[id];
    if (!o || !o.movable || this.w.safety.stoppedByTeacher) return false;
    if (o.support === 'fc' || this.w.covers[id]) {
      this.hintOnce('b01.hint.useForceps');
      return false;
    }
    if (this.held) this.release();
    const r = this.dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: 'hand' });
    if (!r.ok) {
      this.run(r);
      return false;
    }
    const z0 = Math.max(o.pose.z + 2, CARRY_Z[o.kind] ?? o.pose.z + 3);
    this.held = { id, kind: o.kind, z: z0, curZ: o.pose.z, x: o.pose.x, y: o.pose.y, keyboard, from: { pose: { ...o.pose }, support: o.support } };
    this.view?.setOrbitEnabled(false);
    this.host.onHeldChange?.(id);
    this.host.sound(o.kind === 'slide' || o.kind === 'fixedSlide' ? 'clink' : 'click');
    if (o.kind === 'forceps') this.hintOnce('b01.hint.forceps');
    if (o.kind === 'dropperBottle') this.hintOnce('b01.hint.dropper');
    if (o.kind === 'fixedSlide') this.hintOnce('b01.hint.fixedSlide');
    return true;
  }

  release() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    this.lowering = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const o = this.w.objects[h.id];
    if (o) this.place(h.id, h.kind, o.pose);
  }

  cancel() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    this.lowering = null;
    this.view?.setOrbitEnabled(true);
    this.host.onHeldChange?.(null);
    const r = this.dispatch({ type: 'setPose', id: h.id, pose: h.from.pose, support: h.from.support === 'hand' ? 'bench' : h.from.support });
    if (!r.ok) this.layOnBench(h.id, h.from.pose.x, h.from.pose.y);
  }

  /** Suelta en el apoyo cercano (área de montaje, platina, ranura, base, bandeja) o sobre la mesada. */
  place(id: string, kind: B01ObjKind, p: Pose) {
    for (const s of spotsFor(this.w, kind)) {
      if (Math.hypot(p.x - s.x, p.y - s.y) > s.r) continue;
      if (Object.values(this.w.objects).some((o) => o.id !== id && o.support === s.id)) continue;
      // En la platina y la base la lámina o la muestra conservan su desalineación (la ve el dominio).
      const keep = s.id === 'stage' || s.id === 'stereoBase';
      const pose: Pose = keep ? { x: p.x, y: p.y, z: s.z, rotationRad: 0 } : { x: s.x, y: s.y, z: s.z, rotationRad: 0 };
      const r = this.dispatch({ type: 'setPose', id, pose, support: s.id });
      if (r.ok) {
        this.host.sound('glass');
        return;
      }
      this.run(r);
      // Rechazado (pinza cerrada, caja cerrada…): vuelve a la mano del alumno en la mesada.
      break;
    }
    this.layOnBench(id, p.x, p.y);
  }

  layOnBench(id: string, x0: number, y0: number) {
    const o = this.w.objects[id];
    const z = o?.kind === 'slide' || o?.kind === 'fixedSlide' ? 0.05 : o && TOOL_KINDS.has(o.kind) && o.kind !== 'dropperBottle' ? 0.4 : 0;
    this.dispatch({ type: 'setPose', id, pose: { x: Math.max(4, Math.min(556, x0)), y: Math.max(4, Math.min(60, y0)), z, rotationRad: 0 }, support: 'bench' });
  }

  nudgeHeight(dz: number) {
    if (this.held) this.held.z = Math.max(0, Math.min(40, this.held.z + dz));
  }

  /** Pose (x, y) de la mano relativa al centro de un objeto, en cm. */
  private rel(id: string): [number, number] {
    const h = this.held!;
    const o = this.w.objects[id];
    return [Math.round((h.x - o.pose.x) * 100) / 100, Math.round((h.y - o.pose.y) * 100) / 100];
  }

  /** Objeto bajo la punta de la herramienta sostenida. */
  targetUnder(): string | null {
    const h = this.held;
    if (!h) return null;
    const w = this.w;
    const near = (x: number, y: number, r: number) => Math.hypot(h.x - x, h.y - y) <= r;
    const prep = Object.values(w.objects).find((o) => o.support === 'prep');
    if (prep && near(prep.pose.x, prep.pose.y, 4.2)) return prep.id;
    if (near(w.objects.el.pose.x, w.objects.el.pose.y, GEO_B01.dish.r)) return 'el';
    if (near(COVER_BOX.x, COVER_BOX.y, 2.5)) return 'cvBox';
    if (near(w.objects.lp.pose.x, w.objects.lp.pose.y, 4)) return 'lp';
    if (near(STEREO_BASE.x, STEREO_BASE.y, 6)) return 'stereoBase';
    if (near(SAMPLE_TRAY.x, SAMPLE_TRAY.y, 6)) return 'sampleTray';
    if (near(MIC_POS.x, MIC_POS.y, 9)) return 'mic';
    if (w.benchSpillMl > 0.005 && prep && near(prep.pose.x, prep.pose.y, 12)) return 'bench';
    return null;
  }

  coverHeld(): string | null {
    const f = this.w.forceps.holding;
    return this.held?.kind === 'forceps' && f?.kind === 'cover' ? f.coverId : null;
  }

  /** Acción de la herramienta sostenida sobre lo que tiene debajo (P / clic). */
  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.w;
    const t = this.targetUnder();
    const f = w.forceps.holding;
    const r = (c: B01Command) => this.run(this.dispatch(c));
    switch (h.kind) {
      case 'forceps': {
        if (!f) {
          if (t === 'el') r({ type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
          else if (t === 'cvBox') {
            const cv = Object.keys(w.covers).find((c) => w.covers[c].state === 'box');
            if (cv) r({ type: 'grabCover', coverId: cv, toolId: 'fc' });
          } else if (t === 'lp') r({ type: 'wipe', targetId: 'fc', toolId: 'lp' });
          else if (t === 'stereoBase' || t === 'sampleTray') {
            const s = Object.values(w.objects).find((o) => o.support === t && (o.kind === 'leafSample' || o.kind === 'insectSample') && Math.hypot(o.pose.x - h.x, o.pose.y - h.y) < 4);
            if (s) r({ type: 'pickSpecimen', toolId: 'fc', sourceId: s.id, pressure01: strong ? 0.9 : 0.3 });
          } else if (t && w.mounts[t]?.coverId) r({ type: 'liftCover', slideId: t, toolId: 'fc' });
          else this.hintOnce('b01.hint.nothingToDo');
          break;
        }
        if (f.kind === 'specimen' && t && w.slides[t]) {
          const [dx, dy] = this.rel(t);
          r({ type: 'placeSpecimen', toolId: 'fc', targetId: t, dxCm: dx, dyCm: dy });
        } else if (f.kind === 'sample' && (t === 'stereoBase' || t === 'sampleTray')) {
          const base = t === 'stereoBase' ? STEREO_BASE : SAMPLE_TRAY;
          r({ type: 'placeSpecimen', toolId: 'fc', targetId: t, dxCm: Math.round((h.x - base.x) * 100) / 100, dyCm: Math.round((h.y - base.y) * 100) / 100 });
        } else if (f.kind === 'cover' && t && w.slides[t]) {
          // El cubreobjetos baja con la inclinación elegida (Q/E): lento con P, de golpe con Mayús.
          this.lowering = { coverId: f.coverId, slideId: t, speed: strong ? 2.5 : 0.4, progress: 0 };
        } else this.hintOnce('b01.hint.nothingToDo');
        break;
      }
      case 'dropperBottle':
        if (t && w.slides[t]) {
          const [dx, dy] = this.rel(t);
          r({ type: 'squeezeDropper', dispenserId: h.id, targetId: t, force01: strong ? 1 : 0.5, dxCm: dx, dyCm: dy });
          this.host.sound('drip');
        } else this.hintOnce('b01.hint.dropOnSlide');
        break;
      case 'scalpel':
        if (t && w.mounts[t]?.specimenId) r({ type: 'cutSpecimen', slideId: t, toolId: 'sc', keepFraction: 0.45, pressure01: strong ? 0.9 : 0.4 });
        else this.hintOnce('b01.hint.nothingToDo');
        break;
      case 'paper':
        if (t === 'bench') r({ type: 'wipe', targetId: 'bench', toolId: 'pp' });
        else if (t && w.slides[t]) {
          const [dx, dy] = this.rel(t);
          r({ type: 'wipe', targetId: t, toolId: 'pp', dxCm: dx, dyCm: dy });
        } else if (t === 'mic' && w.benchSpillMl > 0.005) r({ type: 'wipe', targetId: 'stage', toolId: 'pp' });
        break;
      case 'lensPaper':
        if (t === 'mic') r({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' });
        else if (t && w.slides[t]) r({ type: 'wipe', targetId: t, toolId: 'lp' });
        break;
      case 'towel':
        if (t === 'mic') r({ type: 'wipe', targetId: 'mic:lens', toolId: 'tw' });
        break;
      default:
        this.hintOnce('b01.hint.nothingToDo');
    }
  }

  // ─────────────── Fotograma ───────────────

  frame(dt: number) {
    this.flushParts();
    const wg = this.wheelGesture;
    if (wg && (wg.idle += dt) > WHEEL_IDLE_S) this.endWheelGesture();
    const h = this.held;
    if (!h || !this.view) return;
    const o = this.w.objects[h.id];
    if (!o) return;
    if (!h.keyboard && this.pointer) {
      const p = this.view.toBench(this.pointer.x, this.pointer.y, h.z);
      h.x = p.x;
      h.y = p.y;
    }
    // Sobre la platina o el área de montaje, la mano baja hasta apoyar.
    let floor = 0;
    if (Math.hypot(h.x - STAGE_SEAT.x, h.y - STAGE_SEAT.y) < 8) floor = stageTop(this.w) + 0.2;
    if (Math.hypot(h.x - PREP_SPOT.x, h.y - PREP_SPOT.y) < 9) floor = Math.max(floor, PREP_SPOT.z + 0.3);
    if (Math.hypot(h.x - STEREO_POS.x, h.y - STEREO_POS.y) < 9) floor = Math.max(floor, STEREO_BASE.z + 0.3);
    const tz = Math.max(h.z, floor);
    const k = Math.min(1, dt * 16);
    const nx = o.pose.x + (h.x - o.pose.x) * k;
    const ny = o.pose.y + (h.y - o.pose.y) * k;
    h.curZ += (tz - h.curZ) * Math.min(1, dt * 10);
    if (Math.hypot(nx - o.pose.x, ny - o.pose.y, h.curZ - o.pose.z) > 0.004) this.dispatch({ type: 'setPose', id: h.id, pose: { x: nx, y: ny, z: h.curZ, rotationRad: 0 } });
    // Descenso del cubreobjetos: al tocar el portaobjetos se envía el hecho (ángulo y velocidad del gesto).
    const lw = this.lowering;
    if (lw) {
      lw.progress += (lw.speed * dt) / 1.0;
      if (lw.progress >= 1) {
        const [dx, dy] = this.rel(lw.slideId);
        this.lowering = null;
        this.run(this.dispatch({ type: 'lowerCover', coverId: lw.coverId, slideId: lw.slideId, speedCmS: lw.speed, dxCm: dx, dyCm: dy }));
        this.host.sound('glass');
      }
    }
    if (this.pointer && !h.keyboard) {
      const W = this.view.viewW();
      if (this.pointer.x < 30) this.view.edgePan(-1, dt);
      else if (this.pointer.x > W - 30) this.view.edgePan(1, dt);
    }
  }

  /** Separación actual (para la banda y la ayuda). */
  gapMm() {
    return microscopeView(this.w).gapMm;
  }
}
