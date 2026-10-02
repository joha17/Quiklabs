/**
 * Capa de interacción (§7): traduce gestos (ratón, táctil, teclado) en COMANDOS del dominio.
 * Nunca modifica masas ni composición: solo poses (setPose) y comandos con significado.
 */
import type { Pose, Vessel, World } from '../../simulation/entities/types';
import type { Command } from '../../simulation/world/commands';
import { liquidVolumeMl, particulateMassG } from '../../simulation/solutions/mixture';
import { pourableSolidsG } from '../../simulation/world/world';
import { BENCH } from '../../practices/practice-02/definition';
import { SHAPES, lipPoint, pourRate, rotateLocal, uprightLevelCm } from '../physics/geometry';
import { type Animator, bell } from '../effects/animator';
import type { ParticleSystem } from '../effects/particles';
import { FUNNEL_STEM_CM, PROP_DIM, PROP_FOOTPRINT, VESSEL_DIM } from '../physics/dimensions';
import { mouthOf, supportZones, zoneById, zoneOccupied, type SupportZone } from '../physics/supports';
import type { EngineHost } from './host';
import type { ViewAdapter } from './viewport';

interface Held {
  id: string;
  isProp: boolean;
  offX: number;
  offY: number;
  tx: number;
  ty: number;
  tilt: number;
  startX: number;
  startY: number;
  startZ: number;
  startSupport: string | null;
  keyboard: boolean;
  samples: Array<{ t: number; x: number; y: number }>;
  lastAgit: number;
  lastAgitSent: number;
  stirPrevAngle: number | null;
  stirOmega: number;
}

interface Press {
  id: string | null;
  sx: number;
  sy: number;
  t: number;
  /** 'restTool': piseta en reposo sobre una boca; mantener quieto = apretar, mover = levantarla. */
  mode: 'none' | 'pan' | 'knob' | 'pending' | 'squeeze' | 'restTool';
  knobStartPct: number;
  knobLastSent: number;
}

const LIFT_Z = 5;
const MAX_SPEED = 220; // cm/s — sin teletransporte
const SPATULA_TIP = 7;
const SCOOP_TIP = 4.5;
const PISETA_NOZZLE: [number, number] = [5.5, 17.6];
/** Herramientas con imán: actúan al acercarlas (sin soltar el clic). */
const MAGNET_TOOLS = new Set(['SPATULA', 'SCOOP', 'DROPPER', 'WASH_BOTTLE']);
/** Tiempo que la punta debe quedarse sobre la boca antes de acoplarse (s). */
const MAGNET_DWELL_S = 0.2;
/** Radio de atracción más allá del borde de la boca (cm). */
const MAGNET_CAPTURE_CM = 1.5;
/** Distancia más allá del radio de captura a partir de la cual una herramienta acoplada se suelta (cm). */
const MAGNET_RELEASE_CM = 1.5;
/** La piseta se acopla si su cuerpo queda a menos de esto del recipiente (cm). */
const PISETA_BODY_CAPTURE_CM = 3;
/** Soltar un recipiente a menos de esto del punto bajo la boquilla de una piseta lo encaja ahí (cm). */
const PISETA_DOCK_CM = 4;
/** Recipientes que se pueden encajar bajo la boquilla de una piseta soltándolos a su lado. */
const PISETA_DOCKABLE = new Set(['GRADUATED_CYLINDER', 'BEAKER']);
/**
 * Acople para verter: recipiente que se sostiene → receptores a los que se acopla (pico sobre la boca).
 * Solo las transferencias que tienen sentido en la práctica, para que pasar cerca de otros objetos no lo enganche.
 */
const POUR_TARGETS: Record<string, readonly string[]> = {
  GRADUATED_CYLINDER: ['TEST_TUBE', 'BEAKER', 'PORCELAIN_DISH', 'FUNNEL', 'WASTE'],
  BEAKER: ['FUNNEL', 'GRADUATED_CYLINDER', 'BEAKER', 'PORCELAIN_DISH', 'WASTE'],
  PORCELAIN_DISH: ['BEAKER', 'WASTE'],
  TEST_TUBE: ['BEAKER', 'WASTE'],
  VIAL: ['BEAKER'],
  WEIGH_PAPER: ['BEAKER'],
  JUG: ['BATH'],
};
/** Separación entre los cuerpos (cm) por debajo de la cual el recipiente se acopla para verter. */
const POUR_CAPTURE_CM = 2.5;
/** Separación a partir de la cual se desacopla (cm). */
const POUR_RELEASE_CM = 5;
/** Pausa necesaria antes de acoplar para verter (s): más larga que la de las herramientas para no engancharse al pasar. */
const POUR_DWELL_S = 0.35;
/** Inclinación automática al mantener el botón (rad/s), al enderezarse (rad/s) y máxima (rad). */
const POUR_TILT_SPEED = (40 * Math.PI) / 180;
const POUR_RETURN_SPEED = (120 * Math.PI) / 180;
const POUR_MAX_TILT = (125 * Math.PI) / 180;
/** Recipientes en los que se puede introducir la varilla (agitar, guiar el decantado) y la sonda. */
const ROD_TARGETS = new Set(['BEAKER', 'FUNNEL', 'PORCELAIN_DISH', 'TEST_TUBE', 'GRADUATED_CYLINDER']);
const PROBE_TARGETS = new Set(['BEAKER', 'PORCELAIN_DISH', 'TEST_TUBE']);
/** Altura de la placa base del soporte universal (los recipientes pueden apoyarse encima, bajo el embudo). */
const STAND_PLATE_Z = 1.2;
/** Separación del centro del vaso respecto de la espiga para que esta toque la pared interna (cm, desde el borde). */
const FUNNEL_WALL_INSET_CM = 0.5;
/** Soltar un vaso a menos de esto del sitio bajo la espiga lo coloca ahí (cm). */
const FUNNEL_DOCK_CM = 6;
/** Pulsación quieta sobre la piseta en reposo que se interpreta como «apretar» (s). */
const REST_SQUEEZE_DELAY_S = 0.18;
type MagnetKind ='scoop' | 'tap' | 'aspirate' | 'align';
const STATIC_PROPS = new Set(['tray']);
const CLICK_PROPS = new Set(['tongs']);

/** Vista nula (antes de montar la escena): no selecciona nada. */
const NULL_VIEW: ViewAdapter = {
  toBench: () => ({ x: 0, y: 0 }),
  pick: () => null,
  viewW: () => 1000,
  edgePan: () => undefined,
  zoomBy: () => undefined,
  reveal: () => undefined,
  setOrbitEnabled: () => undefined,
};

export class InteractionController {
  held: Held | null = null;
  hovered: string | null = null;
  snapTarget: string | null = null;
  snapZone: SupportZone | null = null;
  squeezing = false;
  squeezeSince = 0;
  slowSqueeze = false;
  agitateKey = false;
  spillPos = { x: 160, y: 10 };
  private press: Press | null = null;
  private pointer = { x: 0, y: 0 };
  private now = 0;
  private pourSent = new Map<string, { target: string | null; rate: number; solid: number; t: number }>();
  private dripSent = new Map<string, string>();
  private lastRevealX = 55;
  /** Herramienta acoplada (o acoplándose) a un recipiente, con su pose de acople. */
  private magnet: { toolId: string; targetId: string; kind: MagnetKind; x: number; y: number; z: number } | null = null;
  /** Recipiente bajo la punta y desde cuándo (para exigir una breve pausa antes de acoplar). */
  private hoverTool: { targetId: string; since: number } | null = null;
  /** Tras una acción, no se repite sobre el mismo recipiente hasta que la punta salga de él. */
  private disarmed: { toolId: string; targetId: string } | null = null;
  private hinted = new Set<string>();
  /** Desde cuándo la espátula sucia está sobre el papel absorbente (pausa antes de limpiarse sola). */
  private towelSince: number | null = null;
  /** Herramientas en plena acción (cargar, depositar, aspirar). */
  private acting = new Set<string>();
  /** Recipiente sostenido acoplado a un receptor para verter (lado del receptor: +1 derecha, −1 izquierda). */
  pourDock: { sourceId: string; targetId: string; side: 1 | -1; settled: boolean } | null = null;
  private pourHover: { targetId: string; since: number } | null = null;
  /** Botón de verter mantenido (clic derecho / P) y si la inclinación actual la puso ese botón (se endereza al soltar). */
  private pourHold = false;
  private pourAuto = false;
  /** Vista activa (la registra la escena 3D al montarse). */
  view: ViewAdapter = NULL_VIEW;

  constructor(
    private host: EngineHost,
    private anim: Animator,
    private parts: ParticleSystem,
  ) {}

  // ───────────── Animaciones de acciones (visuales; el comando se aplica en el instante físico) ─────────────

  private colorsOf(v: Vessel): number[] {
    const subs = this.host.runtime.ctx.subs;
    const ks = Object.entries(v.mix.solid).filter(([, g]) => (g ?? 0) > 0.0005).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    const cols = ks.map(([k]) => subs[k as keyof typeof subs].colorHex);
    if (v.mix.crystals) cols.push(0xffffff);
    return cols.length ? cols : [0xdddddd];
  }

  private surfaceZ(id: string): number {
    const v = this.w.vessels[id];
    const sh = SHAPES[v.type];
    const m = mouthOf(v);
    if (!sh) return m.z - 1;
    if (v.type === 'FUNNEL') return v.pose.z + 1.2;
    return v.pose.z + sh.baseOffset + Math.max(0.15, uprightLevelCm(sh, liquidVolumeMl(v.mix, this.host.runtime.ctx.subs)) + particulateMassG(v.mix) * 0.15);
  }

  /** Bajada suave al soporte (el objeto «cae» y se asienta). */
  private settleAnim(id: string, fromDz: number, fromRot = 0) {
    if (fromDz <= 0.05 && Math.abs(fromRot) < 0.01) return;
    // Con inclinación previa (p. ej. tras verter) se endereza mientras baja.
    this.anim.play(id, Math.abs(fromRot) > 0.01 ? 0.35 : 0.22, (u) => {
      const e = (1 - u) * (1 - u);
      return { dz: Math.max(0, fromDz) * e, rot: fromRot * e };
    });
  }

  private animScoop(tool: Vessel, src: Vessel) {
    this.acting.add(tool.id);
    const m = mouthOf(src);
    const tip = tool.type === 'SCOOP' ? SCOOP_TIP : SPATULA_TIP - 1.8;
    const heapTop = this.surfaceZ(src.id);
    const baseZ = m.z + 1.2;
    this.send({ type: 'setPose', id: tool.id, pose: { x: m.x - tip, y: m.y, z: baseZ, rotationRad: 0 } });
    const depth = Math.max(0.8, baseZ - heapTop - 0.2);
    const before = tool.type === 'SCOOP' ? tool.mix.iceG : particulateMassG(tool.mix);
    this.anim.play(tool.id, 1.15, (u) => {
      const down = bell(u, 0.35, 0.6);
      return { dz: -depth * down, rot: 0.45 * down - 0.12 * bell(u, 0.62, 0.95) + Math.sin(u * 40) * 0.04 * down };
    }, [{
      at: 0.5,
      fn: () => {
        const r = this.send({ type: 'scoop', toolId: tool.id, sourceId: src.id });
        if (!r.ok && r.code) this.host.notify('warn', `cmd.${r.code}`);
        else {
          const t2 = this.w.vessels[tool.id];
          const got = (t2.type === 'SCOOP' ? t2.mix.iceG : particulateMassG(t2.mix)) - before;
          this.anim.label(t2.type === 'SCOOP' ? `+${Math.round(got)} g hielo` : `≈ ${got.toFixed(2).replace('.', ',')} g`, m.x, m.y, m.z + 3, 0xfff2b3);
          this.host.sound(t2.type === 'SCOOP' ? 'ice' : 'click');
        }
      },
    }], () => this.afterToolAction(tool.id, src.id, -7));
  }

  private animTap(tool: Vessel, target: Vessel) {
    this.acting.add(tool.id);
    const m = mouthOf(target);
    const tip = tool.type === 'SCOOP' ? SCOOP_TIP : SPATULA_TIP - 1.8;
    const baseZ = m.z + 2.2;
    this.send({ type: 'setPose', id: tool.id, pose: { x: m.x - tip + 0.6, y: m.y, z: baseZ, rotationRad: 0 } });
    const cols = this.colorsOf(tool);
    const surf = this.surfaceZ(target.id);
    const isIce = tool.type === 'SCOOP';
    const load = isIce ? tool.mix.iceG : particulateMassG(tool.mix);
    const events = [0.38, 0.48, 0.58, 0.68, 0.78].map((at) => ({
      at,
      fn: () => {
        if (isIce) this.parts.cube(m.x + (Math.random() - 0.5), m.y, baseZ - 0.5, surf);
        else this.parts.pourGrains(m.x, m.y, baseZ - 0.6, surf, cols, 7);
      },
    }));
    events.push({
      at: 0.62,
      fn: () => {
        const r = this.send({ type: 'tapTool', toolId: tool.id, targetId: target.id });
        if (!r.ok && r.code) this.host.notify('warn', `cmd.${r.code}`);
        else {
          this.host.sound(isIce ? 'ice' : 'click');
          const left = isIce ? this.w.vessels[tool.id].mix.iceG : particulateMassG(this.w.vessels[tool.id].mix);
          const moved = load - left;
          this.anim.label(isIce ? `+${Math.round(moved)} g hielo` : `+${moved.toFixed(2).replace('.', ',')} g`, m.x, m.y, m.z + 3);
        }
      },
    });
    this.anim.play(tool.id, 1.35, (u) => {
      const tilt = bell(u, 0.28, 0.85);
      const taps = u > 0.35 && u < 0.85 ? Math.abs(Math.sin((u - 0.35) * 36)) * 0.12 : 0;
      return { rot: (isIce ? 1.1 : 0.6) * tilt + taps, dz: -0.6 * tilt };
    }, events, () => this.afterToolAction(tool.id, target.id, -7));
  }

  private animAspirate(dropper: Vessel, src: Vessel) {
    this.acting.add(dropper.id);
    const m = mouthOf(src);
    this.send({ type: 'setPose', id: dropper.id, pose: { x: m.x, y: m.y, z: m.z + 0.5, rotationRad: 0 } });
    this.anim.play(dropper.id, 1.1, (u) => ({ dz: -2.2 * bell(u, 0.25, 0.75), squeeze: 1 - 0.4 * bell(u, 0.15, 0.45) }), [{
      at: 0.55,
      fn: () => {
        const r = this.send({ type: 'aspirate', toolId: dropper.id, sourceId: src.id, ml: 1.0 });
        if (r.ok) this.anim.label('aspira ≈1 mL', m.x, m.y, m.z + 9, 0xfff2b3);
      },
    }], () => this.afterToolAction(dropper.id, src.id, -5));
  }

  /** Una gota desde el gotero en reposo (o sostenido) hacia el recipiente de debajo. */
  dropFrom(id: string) {
    const v = this.w.vessels[id];
    if (!v) return;
    const target = (v.support ?? '').startsWith('mouth:') ? v.support!.slice(6) : this.receiverAt(v.pose.x, v.pose.y, v.pose.z + 30, v.id);
    if (liquidVolumeMl(v.mix, this.host.runtime.ctx.subs) <= 0.0001) {
      this.host.notify('warn', 'cmd.TOOL_EMPTY');
      return;
    }
    const surf = target ? this.surfaceZ(target) : 0;
    const col = Object.keys(v.mix.oil).length ? 0xf0d77a : 0xbfe0ff;
    const fall = Math.sqrt(Math.max(0.1, v.pose.z - surf) / 30);
    this.anim.play(id, 0.4 + fall, (u) => ({ squeeze: 1 - 0.35 * bell(u, 0.2, 0.45) }), [
      { at: 0.3, fn: () => this.parts.drop(v.pose.x, v.pose.y, v.pose.z - 0.2, surf, col, 1.4) },
      {
        at: 0.95,
        fn: () => {
          this.send({ type: 'dispenseDrops', toolId: id, targetId: target, drops: 1 });
          this.host.sound('drip');
          this.anim.label('+1 gota', v.pose.x + 2, v.pose.y, v.pose.z + 2, 0xd8ecff);
        },
      },
    ]);
  }

  /** Abanicar vapores: una mano ondea sobre la boca del tubo y luego se percibe (o no) el olor. */
  fan(id: string) {
    const v = this.w.vessels[id];
    if (!v) return;
    const m = mouthOf(v);
    this.anim.ghost('hand', m.x, m.y, m.z, 1.6);
    for (let i = 0; i < 6; i++) setTimeout(() => this.parts.mist(m.x, m.y, m.z + 0.5, -4 - Math.random() * 3), i * 150);
    this.anim.play(id, 1.6, () => ({}), [{ at: 0.9, fn: () => this.send({ type: 'fan', vesselId: id }) }]);
  }

  /** Acercar el tubo a la nariz (técnica insegura): el tubo sube hacia la cara y se muestra la corrección. */
  sniff(id: string) {
    const v = this.w.vessels[id];
    if (!v) return;
    const m = mouthOf(v);
    this.anim.ghost('face', m.x, m.y, m.z + 6, 1.4);
    this.anim.play(id, 1.2, (u) => ({ dz: 6 * bell(u, 0.4, 0.7), rot: -0.25 * bell(u, 0.4, 0.7) }), [{ at: 0.5, fn: () => this.send({ type: 'sniffDirect', vesselId: id }) }]);
  }

  labelPop(id: string, label: string | null) {
    const v = this.w.vessels[id];
    if (!v) return;
    this.send({ type: 'label', vesselId: id, label });
    const m = mouthOf(v);
    this.anim.play(id, 0.4, (u) => ({ dz: 0.6 * Math.sin(u * Math.PI) }));
    this.anim.label(label ? `🏷 ${label}` : 'sin rótulo', m.x, m.y, m.z + 1, 0xfff2b3);
    this.host.sound('click');
  }

  /** Limpiar la espátula: se frota sobre el papel absorbente. */
  cleanTool(id: string) {
    const v = this.w.vessels[id];
    const towel = this.w.vessels.towel;
    if (!v) return;
    this.acting.add(id);
    if (towel) this.send({ type: 'setPose', id, pose: { x: towel.pose.x - 5, y: towel.pose.y, z: 1.2, rotationRad: 0 } });
    this.anim.play(id, 0.9, (u) => ({ dx: Math.sin(u * Math.PI * 6) * 2, dz: -0.4 }), [{ at: 0.8, fn: () => this.send({ type: 'cleanTool', toolId: id }) }], () => {
      this.anim.label('limpia', v.pose.x + 5, v.pose.y, 2, 0xd8ffd8);
      this.afterToolAction(id, 'towel', 0, towel ? { x: towel.pose.x - 12, y: towel.pose.y } : undefined);
    });
  }

  /** Espátula sucia sostenida sobre el papel absorbente: se limpia sola (sin soltar el clic). */
  private towelMagnet(v: Vessel, h: Held): boolean {
    const towel = this.w.vessels.towel;
    if (v.type !== 'SPATULA' || !towel) return false;
    const dirty = !!v.lastLoaded || particulateMassG(v.mix) > 0.0005;
    const tip = this.toolTipAt(v, h.tx, h.ty);
    const over = Math.hypot(towel.pose.x - tip.x, towel.pose.y - tip.y) < 4.5;
    if (this.disarmed?.toolId === v.id && this.disarmed.targetId === 'towel' && !over) this.disarmed = null;
    if (!dirty || !over || this.disarmed?.targetId === 'towel') {
      this.towelSince = null;
      return false;
    }
    this.towelSince ??= this.now;
    if (this.now - this.towelSince < MAGNET_DWELL_S) return false;
    this.towelSince = null;
    this.cleanTool(v.id);
    return true;
  }

  scrape(vesselId: string) {
    const r = this.send({ type: 'scrape', vesselId });
    if (!r.ok) {
      if (r.code) this.host.notify('warn', `cmd.${r.code}`);
      return;
    }
    this.anim.play('rod', 1.0, (u) => ({ dz: Math.abs(Math.sin(u * Math.PI * 5)) * 0.8, dx: Math.sin(u * Math.PI * 5) * 0.3 }));
    const v = this.w.vessels[vesselId];
    this.anim.label('raspa la pared', v.pose.x, v.pose.y, v.pose.z + 7, 0xfff2b3);
    this.host.sound('stir');
  }

  tare() {
    this.send({ type: 'tareBalance' });
    this.host.sound('click');
    const b = this.w.props.balance;
    if (b) this.anim.label('TARA → 0,00 g', b.pose.x, b.pose.y, 8, 0x8dffb0);
  }

  private get w(): World {
    return this.host.runtime.world;
  }

  private send(cmd: Command) {
    return this.host.runtime.dispatch(cmd);
  }

  isProp(id: string) {
    return !!this.w.props[id];
  }

  // ───────────── Selección por puntero ─────────────

  /** Objeto bajo el puntero (raycast de la vista), excluido el que se sostiene. */
  pick(sx: number, sy: number): string | null {
    return this.view.pick(sx, sy, this.held?.id ?? null)?.id ?? null;
  }

  /** Puntero que inició la manipulación (multitáctil: los demás dedos no la interrumpen). */
  private activePointer: number | null = null;
  private pressPart: string | undefined;

  onPointerDown(sx: number, sy: number, button = 0, pointerId = 1) {
    if (this.activePointer !== null && this.activePointer !== pointerId) return;
    this.activePointer = pointerId;
    this.pointer = { x: sx, y: sy };
    if (this.held?.keyboard) return;
    const hit = this.view.pick(sx, sy, this.held?.id ?? null);
    const id = hit?.id ?? null;
    this.pressPart = hit?.part;
    if (button === 2 && this.held) {
      this.secondaryDown();
      return;
    }
    if (!id) {
      // Fondo: la cámara orbita (lo gestiona la vista).
      this.press = { id: null, sx, sy, t: this.now, mode: 'pan', knobStartPct: 0, knobLastSent: 0 };
      this.host.select(null);
      return;
    }
    this.view.setOrbitEnabled(false);
    this.host.select(id);
    const mode = id === 'hotplate' && hit?.part === 'knob' ? 'knob' : 'pending';
    this.press = { id, sx, sy, t: this.now, mode, knobStartPct: this.w.devices.hotplate.powerPct, knobLastSent: this.now };
    // Piseta en reposo sobre una boca: mantenerla pulsada sin mover = apretar; arrastrarla = levantarla (frame/move).
    const v = this.w.vessels[id];
    if (v && v.type === 'WASH_BOTTLE' && (v.support ?? '').startsWith('mouth:')) this.press.mode = 'restTool';
  }

  onPointerMove(sx: number, sy: number, pointerId = 1) {
    if (this.activePointer !== null && this.activePointer !== pointerId) return;
    this.pointer = { x: sx, y: sy };
    const pr = this.press;
    if (pr?.mode === 'pan') return;
    if (pr?.mode === 'knob') {
      const dy = pr.sy - sy;
      const pct = Math.max(0, Math.min(100, Math.round(pr.knobStartPct + dy / 1.5)));
      if (this.now - pr.knobLastSent > 0.25 && pct !== this.w.devices.hotplate.powerPct) {
        this.send({ type: 'setHotplatePower', pct });
        this.host.sound('click');
        pr.knobLastSent = this.now;
      }
      return;
    }
    // Mover lo pulsado lo levanta (también la piseta en reposo, aunque ya se esté apretando).
    const moved = pr ? Math.hypot(sx - pr.sx, sy - pr.sy) : 0;
    const lift = pr?.mode === 'pending' || pr?.mode === 'restTool' ? moved > 5 : pr?.mode === 'squeeze' && moved > 12;
    if (pr?.id && lift) {
      if (pr.mode === 'squeeze') this.stopSqueeze();
      this.beginDrag(pr.id, false, pr.sx, pr.sy);
      pr.mode = 'none';
    }
    if (this.held && !this.held.keyboard) {
      const h = this.held;
      // El puntero se proyecta siempre sobre el plano de la mesada: la sombra sigue al puntero.
      const b = this.view.toBench(sx, sy, 0);
      h.tx = b.x + h.offX;
      h.ty = b.y + h.offY;
    } else if (!this.held && !pr) {
      this.hovered = this.pick(sx, sy);
    }
  }

  onPointerUp(_sx: number, sy: number, pointerId = 1) {
    if (this.activePointer !== pointerId) return;
    this.activePointer = null;
    const pr = this.press;
    this.press = null;
    if (!this.held) this.view.setOrbitEnabled(true);
    if (this.squeezing && (!this.held || pr?.mode === 'squeeze')) this.stopSqueeze();
    if (pr?.mode === 'knob') {
      const dy = pr.sy - sy;
      const pct = Math.max(0, Math.min(100, Math.round(pr.knobStartPct + dy / 1.5)));
      if (pct !== this.w.devices.hotplate.powerPct) this.send({ type: 'setHotplatePower', pct });
      return;
    }
    if (pr?.mode === 'pending' && pr.id) {
      this.click(pr.id);
      return;
    }
    if (pr?.mode === 'restTool') return; // clic breve sobre la piseta en reposo: solo la selecciona
    if (this.held && !this.held.keyboard) this.release();
    this.view.setOrbitEnabled(!this.held);
  }

  /** Rueda: con un objeto sostenido lo inclina; si no, la cámara hace zoom (vista). */
  onWheel(deltaY: number): boolean {
    if (this.held) {
      // Acoplado para verter: rueda hacia abajo = verter más, hacia arriba = enderezar (sea cual sea el lado).
      const d = this.pourDock?.sourceId === this.held.id ? this.pourDock : null;
      this.nudgeTilt(d ? Math.sign(deltaY) * d.side : Math.sign(deltaY), 6);
      return true;
    }
    return false;
  }

  zoomBy(f: number) {
    this.view.zoomBy(f);
  }

  // ───────────── Clic (sin arrastre) ─────────────

  private click(id: string) {
    const w = this.w;
    if (id === 'balance' && this.pressPart === 'tare') {
      this.tare();
      return;
    }
    const pr = w.props[id];
    if (pr && CLICK_PROPS.has(pr.kind)) {
      this.toggleTongs();
      return;
    }
    const v = w.vessels[id];
    if (v?.type === 'DROPPER' && (v.support ?? '').startsWith('mouth:')) this.dropFrom(id);
  }

  toggleTongs() {
    const mode = this.w.devices.hand.mode === 'TONGS' ? 'HAND' : 'TONGS';
    this.send({ type: 'setHandMode', mode });
    this.host.notify('info', mode === 'TONGS' ? 'hint.tongsOn' : 'hint.tongsOff');
  }

  // ───────────── Arrastre ─────────────

  beginDrag(id: string, keyboard: boolean, grabSx?: number, grabSy?: number): boolean {
    const w = this.w;
    const isProp = this.isProp(id);
    if (isProp && (STATIC_PROPS.has(w.props[id].kind) || CLICK_PROPS.has(w.props[id].kind))) return false;
    if (this.anim.busy(id)) return false;
    const v = w.vessels[id];
    const prevSupport = isProp ? w.props[id].support : v.support; // antes de «grab», que lo borra
    // Varilla/sonda dentro de un recipiente: se mueven dentro de él.
    const r = this.send({ type: 'grab', id });
    if (!r.ok) {
      this.host.sound('alert');
      return false;
    }
    const pose = isProp ? w.props[id].pose : v.pose;
    // Herramienta levantada de una boca: el imán no la vuelve a acoplar ahí hasta que se aleje.
    if (prevSupport?.startsWith('mouth:')) this.disarmed = { toolId: id, targetId: prevSupport.slice(6) };
    // Recipiente con una herramienta en reposo sobre su boca: la herramienta no lo acompaña, queda al lado.
    if (!isProp) {
      for (const tid in w.vessels) {
        const t = w.vessels[tid];
        if (t.support === `mouth:${id}`) this.placeOnBench(tid, false, t.pose.x - 2, t.pose.y - 6);
      }
    }
    const b = this.view.toBench(grabSx ?? this.pointer.x, grabSy ?? this.pointer.y, 0);
    this.held = {
      id, isProp, offX: keyboard ? 0 : pose.x - b.x, offY: keyboard ? 0 : pose.y - b.y, tx: pose.x, ty: pose.y, tilt: 0,
      startX: pose.x, startY: pose.y, startZ: pose.z, startSupport: prevSupport, keyboard,
      samples: [], lastAgit: 0, lastAgitSent: 0, stirPrevAngle: null, stirOmega: 0,
    };
    if (id === 'rod' && w.devices.rod.vesselId) {
      this.held.offX = 0;
      this.held.offY = 0;
    }
    if (v && v.type === 'FUNNEL') this.send({ type: 'setDripTarget', funnelId: id, targetId: null, touchingWall: false });
    if (v && (v.type === 'BEAKER' || v.type === 'TEST_TUBE' || v.type === 'GRADUATED_CYLINDER' || v.type === 'PORCELAIN_DISH')) this.host.sound('glass');
    this.host.onHeldChange?.(id);
    return true;
  }

  /** Altura de transporte: por encima de lo que haya debajo (y de la boca del receptor al verter). */
  private liftZ(h: Held): number {
    const w = this.w;
    if (h.id === 'rod' && w.devices.rod.vesselId) {
      const v = w.vessels[w.devices.rod.vesselId];
      return v ? v.pose.z + (SHAPES[v.type]?.baseOffset ?? 0.2) + 0.3 : LIFT_Z;
    }
    if (h.id === 'probe' && w.devices.probe.vesselId) return LIFT_Z;
    let z = LIFT_Z;
    for (const id in w.vessels) {
      if (id === h.id) continue;
      const o = w.vessels[id];
      if (o.support === 'glass_waste') continue;
      const d = VESSEL_DIM[o.type];
      const dist = Math.hypot(o.pose.x - h.tx, o.pose.y - h.ty);
      if (dist < d.footR + 4) z = Math.max(z, o.pose.z + d.h + 1.5);
    }
    for (const id in w.props) {
      if (id === h.id) continue;
      const o = w.props[id];
      const d = PROP_DIM[o.kind];
      if (!d || o.kind === 'stand') continue;
      if (Math.hypot(o.pose.x - h.tx, o.pose.y - h.ty) < d.footR + 2) z = Math.max(z, o.pose.z + d.h + 1.5);
    }
    return Math.min(z, 30);
  }

  // ───────────── Fotograma ─────────────

  frame(dt: number) {
    this.now += dt;
    const w = this.w;
    // Piseta en reposo pulsada sin mover durante un instante: empieza a apretar.
    const pr = this.press;
    if (pr?.mode === 'restTool' && this.now - pr.t > REST_SQUEEZE_DELAY_S) {
      pr.mode = 'squeeze';
      this.startSqueeze();
    }
    this.syncAttachments();
    const h = this.held;
    if (h) {
      const pose = h.isProp ? w.props[h.id]?.pose : w.vessels[h.id]?.pose;
      if (!pose) {
        this.held = null;
        return;
      }
      // Autodesplazamiento de cámara en los bordes.
      if (!h.keyboard) {
        if (this.pointer.x < 40) this.view.edgePan(-1, dt);
        if (this.pointer.x > this.view.viewW() - 40) this.view.edgePan(1, dt);
      }
      if (!this.toolHandled(h, dt) && !this.propMagnetHandled(h) && !this.pourDockHandled(h, dt)) this.followHeld(h, pose, dt);
    }
    if (this.squeezing) this.updateSqueeze();
    // Agitación por teclado sobre la selección (sin sostener).
    if (!h && this.agitateKey) {
      const sel = this.host.getSelected();
      if (sel === 'rod' && w.devices.rod.vesselId) this.send({ type: 'setAgitation', vesselId: w.devices.rod.vesselId, intensity: 0.6, tool: 'ROD' });
    }
    this.updateDrips();
  }

  /** Seguimiento normal del objeto sostenido: muelle hacia el puntero, altura de transporte, agitación, vertido. */
  private followHeld(h: Held, pose: Pose, dt: number) {
    const w = this.w;
    let tx = h.tx;
    let ty = h.ty;
    // Varilla dentro de un recipiente: restringida a su interior → agitación circular.
    if (h.id === 'rod' && w.devices.rod.vesselId) {
      const v = w.vessels[w.devices.rod.vesselId];
      if (v) {
        const rr = (SHAPES[v.type]?.r ?? 1) * 0.65;
        const dx = tx - v.pose.x;
        const dy = ty - v.pose.y;
        const dist = Math.hypot(dx, dy);
        if (dist > rr * 4 + 3) {
          this.send({ type: 'insertRod', vesselId: null });
          this.send({ type: 'setAgitation', vesselId: v.id, intensity: 0, tool: 'NONE' });
          this.disarmed = { toolId: 'rod', targetId: v.id }; // no vuelve a entrar sola hasta alejarla
        } else {
          const k = dist > rr ? rr / dist : 1;
          tx = v.pose.x + dx * k;
          ty = v.pose.y + dy * k * 1.0;
          const ang = Math.atan2(dy, dx);
          if (h.stirPrevAngle !== null && dist > 0.15) {
            let da = ang - h.stirPrevAngle;
            if (da > Math.PI) da -= 2 * Math.PI;
            if (da < -Math.PI) da += 2 * Math.PI;
            h.stirOmega += (da / Math.max(dt, 1e-3) - h.stirOmega) * Math.min(1, dt * 4);
          } else h.stirOmega *= Math.max(0, 1 - dt * 3);
          h.stirPrevAngle = ang;
          const intensity = Math.min(1, Math.abs(h.stirOmega) / (2 * Math.PI * 1.4));
          this.sendAgitation(v.id, this.agitateKey ? Math.max(0.6, intensity) : intensity, 'ROD', h);
        }
      }
    }
    // Seguimiento con muelle y velocidad máxima.
    const dx = tx - pose.x;
    const dy = ty - pose.y;
    const k = Math.min(1, dt * 18);
    let mx = dx * k;
    let my = dy * k;
    const sp = Math.hypot(mx, my) / Math.max(dt, 1e-4);
    if (sp > MAX_SPEED) {
      mx *= MAX_SPEED / sp;
      my *= MAX_SPEED / sp;
    }
    let targetZ = this.liftZ(h);
    // Al inclinar, el pico se mantiene por encima de la boca del receptor que tiene debajo.
    const hv = w.vessels[h.id];
    const sh = hv ? SHAPES[hv.type] : undefined;
    if (hv && sh && VESSEL_DIM[hv.type].tiltable && Math.abs(pose.rotationRad) > 0.2) {
      const lp = lipPoint(sh, pose.rotationRad);
      const rec = this.receiverAt(pose.x + lp[0], pose.y, 1e3, hv.id);
      if (rec) targetZ = Math.max(targetZ, mouthOf(w.vessels[rec]).z + 1.2 - lp[1]);
    }
    const nz = pose.z + (targetZ - pose.z) * Math.min(1, dt * 10);
    const curTilt = pose.rotationRad + (h.tilt - pose.rotationRad) * Math.min(1, dt * 10);
    this.send({ type: 'setPose', id: h.id, pose: { x: pose.x + mx, y: pose.y + my, z: nz, rotationRad: curTilt } });
    // Muestras para detectar agitación (sacudir tubo / balancear vaso).
    h.samples.push({ t: this.now, x: pose.x, y: pose.y });
    while (h.samples.length && h.samples[0].t < this.now - 0.6) h.samples.shift();
    const v = w.vessels[h.id];
    if (v && h.id !== 'rod') {
      const shake = this.shakeIntensity(h);
      const tool = v.type === 'TEST_TUBE' || v.type === 'VIAL' ? 'SHAKE' : 'SWIRL';
      const val = this.agitateKey ? Math.max(0.6, shake) : shake;
      if (['TEST_TUBE', 'VIAL', 'BEAKER', 'GRADUATED_CYLINDER', 'PORCELAIN_DISH'].includes(v.type)) this.sendAgitation(v.id, val, tool, h);
      this.updatePour(v);
      this.updateSnap(v);
    } else {
      this.snapTarget = null;
      this.snapZone = null;
    }
    if (h.isProp && h.id !== 'rod') this.updatePropHover(h.id);
  }

  // ───────────── Imán de herramientas (acción sin soltar el clic) ─────────────

  /**
   * Al acercar la punta de una herramienta a un recipiente válido y detenerse un instante, la herramienta se acopla
   * sola (imán) y hace su acción natural SIN soltar el clic: la espátula/pala carga del frasco o deposita en el
   * recipiente; el gotero aspira del frasco. Gotero y piseta cargados se alinean con la boca del receptor y quedan
   * listos (clic derecho o P = gota / agua). Terminada la acción, la herramienta sigue en la mano.
   * Devuelve true si en este fotograma la pose la controlan el imán o la animación (no el puntero).
   */
  private toolHandled(h: Held, dt: number): boolean {
    const v = this.w.vessels[h.id];
    if (!v || !MAGNET_TOOLS.has(v.type)) return false;
    if (this.anim.busy(h.id)) return true;
    if (this.towelMagnet(v, h)) return true;
    // Punta «pretendida»: donde quedaría si la herramienta siguiera al puntero.
    const target = this.magnetTargetAt(v, h.tx, h.ty);
    if (this.disarmed && (this.disarmed.toolId !== v.id || this.disarmed.targetId !== target)) this.disarmed = null;

    let m = this.magnet?.toolId === v.id ? this.magnet : null;
    if (m) {
      // El imán se suelta si el puntero se aleja claramente del recipiente (histéresis).
      const tv = this.w.vessels[m.targetId];
      if (!tv || this.magnetGap(v, h.tx, h.ty, tv) > MAGNET_RELEASE_CM) {
        this.magnet = null;
        this.hoverTool = null;
        return false;
      }
    } else {
      if (!target || this.disarmed?.targetId === target) {
        this.hoverTool = null;
        return false;
      }
      const kind = this.magnetKind(v, this.w.vessels[target]);
      if (!kind) {
        this.hoverTool = null;
        return false;
      }
      // Hace falta detenerse un instante: pasar por encima de un frasco camino a otro no dispara nada.
      if (this.hoverTool?.targetId !== target) this.hoverTool = { targetId: target, since: this.now };
      if (this.now - this.hoverTool.since < MAGNET_DWELL_S) return false;
      m = { toolId: v.id, targetId: target, kind, ...this.magnetPose(v, this.w.vessels[target], kind) };
      this.magnet = m;
      if (kind === 'align') this.alignHint(v);
    }

    // Aproximación suave a la pose de acople. La piseta primero se desplaza por ENCIMA del recipiente
    // (sin atravesarlo) y después baja hasta dejar la boquilla sobre la boca.
    const p = v.pose;
    const k = Math.min(1, dt * 14);
    const nx = p.x + (m.x - p.x) * k;
    const ny = p.y + (m.y - p.y) * k;
    let zGoal = m.z;
    if (v.type === 'WASH_BOTTLE' && Math.hypot(m.x - p.x, m.y - p.y) > 0.4) {
      zGoal = Math.max(p.z, mouthOf(this.w.vessels[m.targetId]).z + 1);
    }
    const nz = p.z + (zGoal - p.z) * k;
    this.send({ type: 'setPose', id: v.id, pose: { x: nx, y: ny, z: nz, rotationRad: p.rotationRad * (1 - k) } });
    this.snapTarget = m.targetId;
    this.snapZone = null;
    if (m.kind !== 'align' && Math.hypot(m.x - nx, m.y - ny, m.z - nz) < 0.2) {
      const tv = this.w.vessels[m.targetId];
      this.magnet = null;
      this.hoverTool = null;
      if (m.kind === 'scoop') this.animScoop(v, tv);
      else if (m.kind === 'tap') this.animTap(v, tv);
      else this.animAspirate(v, tv);
    }
    return true;
  }

  /**
   * Recipiente que «atrae» a la herramienta: el más cercano cuya boca esté a menos de MAGNET_CAPTURE_CM de la punta
   * y sobre el que la herramienta tenga algo que hacer (los demás no atraen).
   */
  private magnetTargetAt(tool: Vessel, x: number, y: number, exclude?: string): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const id in this.w.vessels) {
      if (id === tool.id || id === exclude) continue;
      const t = this.w.vessels[id];
      if (t.integrity === 0 || t.support === 'glass_waste' || t.tipped || t.type === 'FILTER_PAPER') continue;
      if (mouthOf(t).r <= 0) continue;
      const d = this.magnetGap(tool, x, y, t);
      if (d > 0 || d >= bestD || !this.magnetKind(tool, t)) continue;
      best = id;
      bestD = d;
    }
    return best;
  }

  /**
   * «Distancia de atracción» de una herramienta con origen en (x, y) a un recipiente: ≤ 0 = dentro del radio de captura.
   * Se mide desde la punta hasta la boca; la piseta, además, se acopla con solo acercar su cuerpo al del recipiente
   * (desde cualquier lado), porque su boquilla queda a 5,5 cm del cuerpo y apuntarla con precisión es incómodo.
   */
  private magnetGap(tool: Vessel, x: number, y: number, t: Vessel): number {
    const m = mouthOf(t);
    const tip = this.toolTipAt(tool, x, y);
    const byTip = Math.hypot(m.x - tip.x, m.y - tip.y) - m.r - MAGNET_CAPTURE_CM;
    if (tool.type !== 'WASH_BOTTLE') return byTip;
    const bodyGap = Math.hypot(t.pose.x - x, t.pose.y - y) - VESSEL_DIM[tool.type].footR - VESSEL_DIM[t.type].footR;
    return Math.min(byTip, bodyGap - PISETA_BODY_CAPTURE_CM);
  }

  /** Qué hace la herramienta sobre ese recipiente (null = nada; así cruzar por encima de otros no tiene efecto). */
  private magnetKind(tool: Vessel, target: Vessel): MagnetKind | null {
    const subs = this.host.runtime.ctx.subs;
    if (tool.type === 'SPATULA' || tool.type === 'SCOOP') {
      const isSource = tool.type === 'SCOOP' ? target.type === 'ICE_BUCKET' : target.type === 'REAGENT_JAR' || target.type === 'VIAL';
      const load = tool.type === 'SCOOP' ? tool.mix.iceG : particulateMassG(tool.mix);
      if (isSource) return load < 0.001 ? 'scoop' : null; // cargada: no se mezcla con otro frasco
      return load >= 0.001 && target.type !== 'ICE_BUCKET' ? 'tap' : null;
    }
    if (tool.type === 'DROPPER') {
      const empty = liquidVolumeMl(tool.mix, subs) < 0.01;
      if (empty) return target.type === 'REAGENT_BOTTLE' || liquidVolumeMl(target.mix, subs) > 0.5 ? 'aspirate' : null;
      return target.type === 'REAGENT_BOTTLE' ? null : 'align';
    }
    if (tool.type === 'WASH_BOTTLE') return target.type === 'REAGENT_BOTTLE' || target.type === 'REAGENT_JAR' ? null : 'align';
    return null;
  }

  /** Pose de acople (la misma desde la que parten las animaciones de cada acción). */
  private magnetPose(tool: Vessel, target: Vessel, kind: MagnetKind): { x: number; y: number; z: number } {
    const m = mouthOf(target);
    const tip = tool.type === 'SCOOP' ? SCOOP_TIP : SPATULA_TIP - 1.8;
    if (kind === 'scoop') return { x: m.x - tip, y: m.y, z: m.z + 1.2 };
    if (kind === 'tap') return { x: m.x - tip + 0.6, y: m.y, z: m.z + 2.2 };
    if (kind === 'aspirate') return { x: m.x, y: m.y, z: m.z + 0.5 };
    if (tool.type === 'WASH_BOTTLE') return { x: m.x - PISETA_NOZZLE[0], y: m.y, z: Math.max(0, m.z + 1.5 - PISETA_NOZZLE[1]) };
    return { x: m.x, y: m.y, z: m.z + 1.0 };
  }

  private alignHint(tool: Vessel) {
    if (this.hinted.has(tool.type)) return;
    this.hinted.add(tool.type);
    this.host.notify('info', tool.type === 'DROPPER' ? 'hint.dropperAligned' : 'hint.pisetaAligned');
  }

  /** Tras una acción de herramienta: si sigue en la mano, continúa sostenida; si se soltó, se apoya al lado. */
  private afterToolAction(toolId: string, targetId: string, dy: number, at?: { x: number; y: number }) {
    this.acting.delete(toolId);
    this.disarmed = { toolId, targetId };
    if (this.held?.id === toolId) return;
    const p = this.w.vessels[toolId]?.pose;
    if (at) this.placeOnBench(toolId, false, at.x, at.y);
    else if (p) this.placeOnBench(toolId, false, p.x, p.y + dy);
  }

  /** Botón derecho (o P) con algo en la mano: verter si está acoplado, una gota del gotero o apretar la piseta. */
  secondaryDown() {
    const v = this.held ? this.w.vessels[this.held.id] : undefined;
    if (v && this.pourDock?.sourceId === v.id) {
      this.pourHold = true;
      this.pourAuto = true;
    } else if (v?.type === 'DROPPER') this.dropFrom(v.id);
    else this.startSqueeze();
  }

  /** Botón «Verter (mantener)» del panel: solo vierte si el recipiente está acoplado a un receptor. */
  pourButtonDown() {
    if (this.held && this.pourDock?.sourceId === this.held.id) this.secondaryDown();
    else this.host.notify('info', 'hint.pourNotDocked');
  }

  /** Se suelta el botón derecho / P: deja de apretar la piseta y el recipiente acoplado se endereza. */
  secondaryUp() {
    this.stopSqueeze();
    this.pourHold = false;
  }

  /**
   * Inclinar lo sostenido (rueda, Q/E, botones ⟲ ⟳). Acoplado para verter, la inclinación solo va hacia el receptor
   * (0 = vertical … máximo): inclinar hacia él vierte, hacia el otro lado endereza.
   */
  nudgeTilt(dir: number, deg: number) {
    const h = this.held;
    const v = h ? this.w.vessels[h.id] : undefined;
    if (!h || !v || !VESSEL_DIM[v.type].tiltable) return;
    const d = this.pourDock?.sourceId === v.id ? this.pourDock : null;
    if (d) {
      this.pourAuto = false;
      h.tilt = d.side * Math.max(0, Math.min(POUR_MAX_TILT, d.side * h.tilt + dir * d.side * (deg * Math.PI) / 180));
    } else h.tilt = clampTilt(h.tilt + (dir * deg * Math.PI) / 180);
  }

  // ───────────── Acople para verter ─────────────

  /**
   * Al acercar un recipiente con contenido a un receptor válido (POUR_TARGETS) y detenerse un instante, se acopla con
   * el pico sobre la boca del receptor. Mantener el clic derecho (o P) lo inclina poco a poco y vierte; al soltar el
   * botón se endereza. La posición se recalcula con la inclinación para que el pico no se mueva de la boca, como al
   * verter de verdad. El caudal sigue saliendo de la geometría (nivel frente al pico): la ciencia no cambia.
   */
  private pourDockHandled(h: Held, dt: number): boolean {
    const w = this.w;
    const v = h.isProp ? undefined : w.vessels[h.id];
    const targets = v ? POUR_TARGETS[v.type] : undefined;
    if (!v || !targets || !SHAPES[v.type]) return false;
    let d = this.pourDock?.sourceId === v.id ? this.pourDock : null;
    if (d) {
      const t = w.vessels[d.targetId];
      if (!t || t.integrity === 0 || t.tipped || this.bodyGap(v, h.tx, h.ty, t) > POUR_RELEASE_CM) {
        this.undock(h);
        return false;
      }
    } else {
      const t = this.pourTargetAt(v, h.tx, h.ty, targets);
      if (!t) {
        this.pourHover = null;
        return false;
      }
      if (this.pourHover?.targetId !== t.id) this.pourHover = { targetId: t.id, since: this.now };
      if (this.now - this.pourHover.since < POUR_DWELL_S) return false;
      d = { sourceId: v.id, targetId: t.id, side: mouthOf(t).x >= v.pose.x ? 1 : -1, settled: false };
      this.pourDock = d;
      this.pourHover = null;
      this.host.sound('glass');
      if (!this.hinted.has('pour')) {
        this.hinted.add('pour');
        this.host.notify('info', 'hint.pourDocked');
      }
    }
    const t = w.vessels[d.targetId];
    // Inclinación: el botón la aumenta poco a poco; al soltarlo vuelve a vertical (si la puso el botón).
    let mag = Math.max(0, d.side * h.tilt);
    if (this.pourHold) mag = Math.min(POUR_MAX_TILT, mag + POUR_TILT_SPEED * dt);
    else if (this.pourAuto) {
      mag = Math.max(0, mag - POUR_RETURN_SPEED * dt);
      if (mag === 0) this.pourAuto = false;
    }
    h.tilt = d.side * mag;
    const cur = v.pose.rotationRad + (h.tilt - v.pose.rotationRad) * Math.min(1, dt * 8);
    const goal = this.pourDockPose(v, t, d.side, cur);
    const p = v.pose;
    let { x, y, z } = goal;
    if (!d.settled) {
      // Llegada suave al acople; luego la pose se fija exactamente (el pico no se separa de la boca al inclinar).
      const k = Math.min(1, dt * 12);
      x = p.x + (goal.x - p.x) * k;
      y = p.y + (goal.y - p.y) * k;
      z = p.z + (goal.z - p.z) * k;
      if (Math.hypot(goal.x - x, goal.y - y, goal.z - z) < 0.15) d.settled = true;
    }
    this.send({ type: 'setPose', id: v.id, pose: { x, y, z, rotationRad: cur } });
    this.snapTarget = t.id;
    this.snapZone = null;
    this.updatePour(v);
    return true;
  }

  private undock(h: Held) {
    this.pourDock = null;
    this.pourHold = false;
    if (this.pourAuto) h.tilt = 0; // la inclinación del botón no se lleva puesta: se endereza
    this.pourAuto = false;
  }

  /** Receptor válido más cercano cuyo cuerpo queda a menos de POUR_CAPTURE_CM (si el recipiente tiene qué verter). */
  private pourTargetAt(v: Vessel, x: number, y: number, targets: readonly string[]): Vessel | null {
    const w = this.w;
    if (liquidVolumeMl(v.mix, this.host.runtime.ctx.subs) < 0.05 && pourableSolidsG(v) < 0.0005) return null;
    // Si se está llevando a una zona de apoyo (placa, baño, gradilla, balanza…), eso tiene prioridad.
    const zoneNear = supportZones(w).some((z) => z.accepts(v) && !zoneOccupied(w, z.id, v.id) && Math.hypot(z.x - x, z.y - y) < z.snapR);
    if (zoneNear) return null;
    let best: Vessel | null = null;
    let bestGap = POUR_CAPTURE_CM;
    for (const id in w.vessels) {
      const t = w.vessels[id];
      if (id === v.id || !targets.includes(t.type) || t.integrity === 0 || t.tipped || t.support === 'glass_waste') continue;
      if (t.support === `mouth:${v.id}`) continue;
      const gap = this.bodyGap(v, x, y, t);
      if (gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    }
    return best;
  }

  /** Separación horizontal entre los cuerpos de un recipiente con origen en (x, y) y otro (cm; negativa = solapados). */
  private bodyGap(v: Vessel, x: number, y: number, t: Vessel): number {
    return Math.hypot(t.pose.x - x, t.pose.y - y) - VESSEL_DIM[v.type].footR - VESSEL_DIM[t.type].footR;
  }

  /**
   * Pose del recipiente acoplado con inclinación `a` (signo = lado del receptor): el pico queda sobre el centro de la
   * boca del receptor, ligeramente por encima, y ninguna parte del recipiente baja por debajo del borde del receptor
   * dentro de su anchura (no lo atraviesa) ni por debajo de la mesada.
   */
  private pourDockPose(v: Vessel, t: Vessel, side: 1 | -1, a: number): { x: number; y: number; z: number } {
    const sh = SHAPES[v.type]!;
    const R = VESSEL_DIM[v.type].footR;
    const m = mouthOf(t);
    const lip = rotateLocal(side * sh.r, sh.h, a);
    const x = m.x - lip[0];
    const outline = ([[-R, 0], [R, 0], [R, sh.h], [-R, sh.h]] as Array<[number, number]>).map(([lx, lz]) => {
      const q = rotateLocal(lx, lz, a);
      return [x + q[0], q[1]] as [number, number];
    });
    const rt = VESSEL_DIM[t.type].footR;
    const overReceiver = minZOverX(outline, m.x - rt, m.x + rt);
    const lowest = Math.min(...outline.map((q) => q[1]));
    const z = Math.max(m.z + 0.6 - lip[1], Number.isFinite(overReceiver) ? m.z + 0.15 - overReceiver : -Infinity, -lowest);
    return { x, y: m.y, z };
  }

  // ───────────── Imán de varilla y sonda ─────────────

  /**
   * Varilla o sonda sostenida cerca de la boca de un recipiente: entra sola (baja deslizándose). La varilla sigue en la
   * mano para agitar en círculos; la sonda queda colocada midiendo. Al sacarlas no se vuelven a meter en el mismo
   * recipiente hasta alejarlas.
   */
  private propMagnetHandled(h: Held): boolean {
    if (!h.isProp || (h.id !== 'rod' && h.id !== 'probe')) return false;
    const w = this.w;
    const dev = h.id === 'rod' ? w.devices.rod : w.devices.probe;
    if (dev.vesselId) return false;
    const accepts = h.id === 'rod' ? ROD_TARGETS : PROBE_TARGETS;
    let target: Vessel | null = null;
    let best = Infinity;
    for (const id in w.vessels) {
      const t = w.vessels[id];
      if (!accepts.has(t.type) || t.integrity === 0 || t.tipped || t.support === 'glass_waste') continue;
      const m = mouthOf(t);
      const d = Math.hypot(m.x - h.tx, m.y - h.ty) - m.r - MAGNET_CAPTURE_CM;
      if (d <= 0 && d < best) {
        best = d;
        target = t;
      }
    }
    if (this.disarmed?.toolId === h.id && this.disarmed.targetId !== target?.id) this.disarmed = null;
    if (!target || this.disarmed?.toolId === h.id) {
      this.hoverTool = null;
      return false;
    }
    if (this.hoverTool?.targetId !== target.id) this.hoverTool = { targetId: target.id, since: this.now };
    if (this.now - this.hoverTool.since < MAGNET_DWELL_S) return false;
    this.hoverTool = null;
    const p = w.props[h.id].pose;
    const from = { x: p.x, y: p.y, z: p.z };
    if (h.id === 'rod') {
      this.send({ type: 'insertRod', vesselId: target.id });
      // La varilla sigue en la mano: el seguimiento la baja suavemente al fondo y la deja agitar dentro.
    } else {
      this.send({ type: 'insertProbe', vesselId: target.id, touchingBottom: false });
      // La sonda queda colocada: se suelta de la mano y se ve deslizar a su sitio.
      this.held = null;
      this.host.onHeldChange?.(null);
      this.snapTarget = null;
      this.syncAttachments();
      const q = w.props.probe.pose;
      this.anim.play('probe', 0.35, (u) => {
        const e = (1 - u) * (1 - u);
        return { dx: (from.x - q.x) * e, dy: (from.y - q.y) * e, dz: (from.z - q.z) * e };
      });
    }
    this.host.sound('glass');
    return true;
  }

  private sendAgitation(id: string, val: number, tool: 'ROD' | 'SHAKE' | 'SWIRL', h: Held) {
    if (Math.abs(val - h.lastAgit) > 0.08 || (this.now - h.lastAgitSent > 0.5 && Math.abs(val - h.lastAgit) > 0.01)) {
      this.send({ type: 'setAgitation', vesselId: id, intensity: val, tool: val > 0.02 ? tool : 'NONE' });
      h.lastAgit = val;
      h.lastAgitSent = this.now;
      if (val > 0.3) this.host.sound('stir');
    }
  }

  private shakeIntensity(h: Held): number {
    const s = h.samples;
    if (s.length < 4) return 0;
    let reversals = 0;
    let speedSum = 0;
    let prevVx = 0;
    let prevVy = 0;
    for (let i = 1; i < s.length; i++) {
      const dtt = Math.max(1e-3, s[i].t - s[i - 1].t);
      const vx = (s[i].x - s[i - 1].x) / dtt;
      const vy = (s[i].y - s[i - 1].y) / dtt;
      speedSum += Math.hypot(vx, vy);
      if (Math.abs(vx) > 20 && Math.sign(vx) !== Math.sign(prevVx) && Math.abs(prevVx) > 20) reversals++;
      if (Math.abs(vy) > 20 && Math.sign(vy) !== Math.sign(prevVy) && Math.abs(prevVy) > 20) reversals++;
      if (Math.abs(vx) > 20) prevVx = vx;
      if (Math.abs(vy) > 20) prevVy = vy;
    }
    const mean = speedSum / (s.length - 1);
    return Math.min(1, (reversals / 4) * Math.min(1.3, mean / 50));
  }

  /** Vertido por inclinación: el caudal sale de la geometría (nivel vs. pico), el receptor por intersección del chorro. */
  private updatePour(v: Vessel) {
    const w = this.w;
    const shape = SHAPES[v.type];
    const dim = VESSEL_DIM[v.type];
    if (!shape || !dim.tiltable) return;
    const theta = v.pose.rotationRad;
    const deg = Math.abs((theta * 180) / Math.PI);
    const lv = liquidVolumeMl(v.mix, this.host.runtime.ctx.subs);
    const oilFrac = Object.values(v.mix.oil).reduce((a, b) => a + (b ?? 0), 0) / Math.max(lv, 1e-6);
    let liquidRate = lv > 0 && deg > 2 ? pourRate(shape, theta, lv, oilFrac > 0.5 ? 6 : 1) : 0;
    let solidRate = 0;
    if (pourableSolidsG(v) > 0.0005) {
      const thr = v.type === 'WEIGH_PAPER' ? 25 : v.type === 'VIAL' || v.type === 'REAGENT_JAR' ? 70 : 95;
      const base = v.type === 'WEIGH_PAPER' ? 0.5 : v.type === 'VIAL' ? 0.5 : v.type === 'REAGENT_JAR' ? 0.8 : 0.15;
      if (deg > thr && (lv < 1.5 || v.type === 'WEIGH_PAPER')) solidRate = Math.min(1, (deg - thr) / 30) * base;
    }
    if (v.type === 'WEIGH_PAPER') liquidRate = 0;
    const lp = lipPoint(shape, theta);
    const lipX = v.pose.x + lp[0];
    const lipZ = v.pose.z + lp[1];
    const target = this.receiverAt(lipX, v.pose.y, lipZ, v.id);
    const prev = this.pourSent.get(v.id);
    if (liquidRate > 0.001 || solidRate > 0.0005) {
      const guided = !!target && w.devices.rod.vesselId === target;
      const changed = !prev || prev.target !== target || Math.abs(prev.rate - liquidRate) > Math.max(0.05, prev.rate * 0.15) || Math.abs(prev.solid - solidRate) > 0.02 || this.now - prev.t > 0.5;
      if (changed) {
        this.send({ type: 'setPour', sourceId: v.id, targetId: target, liquidRateMlS: liquidRate, solidRateGS: solidRate, tiltDeg: deg, guided });
        this.pourSent.set(v.id, { target, rate: liquidRate, solid: solidRate, t: this.now });
        if (!prev) this.host.sound('pour');
        if (!target) this.spillPos = { x: lipX, y: v.pose.y };
      }
    } else if (prev) {
      this.send({ type: 'stopPour', sourceId: v.id });
      this.pourSent.delete(v.id);
    }
  }

  /** Recipiente cuya boca intercepta la vertical que baja desde (x, y, z). */
  receiverAt(x: number, y: number, z: number, exclude: string): string | null {
    const w = this.w;
    let best: string | null = null;
    let bestZ = -Infinity;
    for (const id in w.vessels) {
      if (id === exclude) continue;
      const v = w.vessels[id];
      if (v.integrity === 0 || v.support === 'glass_waste' || v.tipped) continue;
      if (this.held && this.held.id === id) continue;
      const m = mouthOf(v);
      if (m.r <= 0 || v.type === 'FILTER_PAPER') continue;
      const tol = v.type === 'TEST_TUBE' || v.type === 'GRADUATED_CYLINDER' ? 0.45 : 0.2;
      if (Math.hypot(m.x - x, (m.y - y) * 0.8) <= m.r + tol && m.z <= z + 0.5 && m.z > bestZ) {
        best = id;
        bestZ = m.z;
      }
    }
    return best;
  }

  private updateSnap(v: Vessel) {
    const zones = supportZones(this.w).filter((z) => z.accepts(v) && !zoneOccupied(this.w, z.id, v.id));
    let best: SupportZone | null = null;
    let bestD = Infinity;
    for (const z of zones) {
      const d = Math.hypot(z.x - v.pose.x, z.y - v.pose.y);
      if (d < z.snapR && d < bestD) {
        best = z;
        bestD = d;
      }
    }
    this.snapZone = best;
    this.snapTarget = best ? best.id : null;
    // Vaso cerca de la espiga del embudo / probeta o vaso junto a una piseta: se resalta con qué se va a acoplar.
    if (!best) this.snapTarget = this.funnelDockFor(v)?.funnelId ?? this.pisetaDockFor(v)?.pisetaId ?? null;
    // Para herramientas: resaltar el recipiente objetivo.
    const tip = this.toolTip(v);
    if (tip) this.snapTarget = this.receiverAt(tip.x, tip.y, tip.z + 30, v.id);
  }

  private updatePropHover(id: string) {
    const w = this.w;
    const p = w.props[id];
    if (!p) return;
    this.snapTarget = null;
    if (id === 'rod' || id === 'probe') this.snapTarget = this.receiverAt(p.pose.x, p.pose.y, 40, id);
    if (id === 'watch_glass') {
      const dish = this.nearestDish(p.pose.x, p.pose.y);
      if (dish && Math.hypot(dish.pose.x - p.pose.x, dish.pose.y - p.pose.y) < 4.5) this.snapTarget = dish.id;
    }
  }

  /** Cápsula intacta más cercana (la original o un repuesto). */
  private nearestDish(x: number, y: number): Vessel | null {
    let best: Vessel | null = null;
    let bd = Infinity;
    for (const v of Object.values(this.w.vessels)) {
      if (v.type !== 'PORCELAIN_DISH' || v.integrity === 0 || v.support === 'glass_waste') continue;
      const d = Math.hypot(v.pose.x - x, v.pose.y - y);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** Punta de una herramienta si su origen estuviera en (x, y). */
  private toolTipAt(v: Vessel, x: number, y: number): { x: number; y: number } {
    if (v.type === 'SPATULA') return { x: x + SPATULA_TIP, y };
    if (v.type === 'SCOOP') return { x: x + SCOOP_TIP, y };
    if (v.type === 'WASH_BOTTLE') return { x: x + PISETA_NOZZLE[0], y };
    return { x, y };
  }

  private toolTip(v: Vessel): { x: number; y: number; z: number } | null {
    if (v.type === 'SPATULA') return { x: v.pose.x + SPATULA_TIP, y: v.pose.y, z: v.pose.z };
    if (v.type === 'SCOOP') return { x: v.pose.x + SCOOP_TIP, y: v.pose.y, z: v.pose.z };
    if (v.type === 'DROPPER') return { x: v.pose.x, y: v.pose.y, z: v.pose.z };
    if (v.type === 'WASH_BOTTLE') return { x: v.pose.x + PISETA_NOZZLE[0], y: v.pose.y, z: v.pose.z + PISETA_NOZZLE[1] };
    return null;
  }

  // ───────────── Piseta ─────────────

  startSqueeze(slow = false) {
    const w = this.w;
    const id = this.held?.id ?? this.host.getSelected();
    if (!id || w.vessels[id]?.type !== 'WASH_BOTTLE') return;
    this.squeezing = true;
    this.slowSqueeze = slow;
    this.squeezeSince = this.now;
    this.host.sound('squeeze');
  }

  stopSqueeze() {
    if (!this.squeezing) return;
    this.squeezing = false;
    if (this.pourSent.has('piseta')) {
      this.send({ type: 'stopPour', sourceId: 'piseta' });
      this.pourSent.delete('piseta');
    }
  }

  private updateSqueeze() {
    const v = this.w.vessels.piseta;
    if (!v) return;
    const tip = this.toolTip(v)!;
    const target = this.receiverAt(tip.x, tip.y, tip.z, v.id);
    const held = this.now - this.squeezeSince;
    const rate = this.slowSqueeze ? 0.25 : held < 0.5 ? 0.3 : 1.2;
    const prev = this.pourSent.get('piseta');
    if (!prev || prev.target !== target || prev.rate !== rate) {
      this.send({ type: 'setPour', sourceId: 'piseta', targetId: target, liquidRateMlS: rate, solidRateGS: 0, tiltDeg: 0, guided: true });
      this.pourSent.set('piseta', { target, rate, solid: 0, t: this.now });
      if (!target) this.spillPos = { x: tip.x, y: tip.y };
    }
  }

  // ───────────── Soltar ─────────────

  release() {
    const h = this.held;
    if (!h) return;
    const w = this.w;
    const docked = this.magnet?.toolId === h.id && this.magnet.kind === 'align';
    this.magnet = null;
    this.hoverTool = null;
    // Soltar estando acoplado para verter: deja de verter, se endereza y se apoya al lado del receptor.
    const pd = this.pourDock?.sourceId === h.id ? this.pourDock : null;
    this.pourDock = null;
    this.pourHold = false;
    this.pourAuto = false;
    this.pourHover = null;
    if (pd && w.vessels[h.id]) {
      this.held = null;
      this.host.onHeldChange?.(null);
      this.snapTarget = null;
      if (this.pourSent.has(h.id)) {
        this.send({ type: 'stopPour', sourceId: h.id });
        this.pourSent.delete(h.id);
      }
      const p = w.vessels[h.id].pose;
      this.placeOnBench(h.id, false, p.x - pd.side * 1.5, p.y, false, false);
      return;
    }
    // Soltar a mitad de una acción de herramienta: la acción termina y luego la herramienta se apoya al lado.
    if (!h.isProp && this.acting.has(h.id)) {
      this.held = null;
      this.host.onHeldChange?.(null);
      this.snapTarget = null;
      if (this.squeezing) this.stopSqueeze();
      return;
    }
    // Se suelta donde está el puntero (el muelle puede ir algo retrasado), salvo si estaba acoplada a una boca.
    const pose0 = h.isProp ? w.props[h.id]?.pose : w.vessels[h.id]?.pose;
    if (pose0 && !docked && !(h.id === 'rod' && w.devices.rod.vesselId)) {
      pose0.x = h.tx;
      pose0.y = h.ty;
      const vv = w.vessels[h.id];
      if (vv) this.updateSnap(vv);
      else this.updatePropHover(h.id);
    }
    this.held = null;
    this.host.onHeldChange?.(null);
    this.snapTarget = null;
    const v = w.vessels[h.id];
    if (v) {
      if (this.pourSent.has(v.id)) {
        this.send({ type: 'stopPour', sourceId: v.id });
        this.pourSent.delete(v.id);
      }
      if (h.lastAgit > 0) this.send({ type: 'setAgitation', vesselId: v.id, intensity: 0, tool: 'NONE' });
    }
    if (h.id === 'rod' && w.devices.rod.vesselId) {
      this.send({ type: 'setAgitation', vesselId: w.devices.rod.vesselId, intensity: 0, tool: 'NONE' });
      return; // la varilla queda dentro del recipiente
    }
    if (this.squeezing) this.stopSqueeze();
    if (h.isProp) this.releaseProp(h);
    else if (v) this.releaseVessel(h, v);
  }

  cancelHold() {
    const h = this.held;
    if (!h) return;
    const pose = h.isProp ? this.w.props[h.id].pose : this.w.vessels[h.id].pose;
    pose.rotationRad = 0;
    h.tx = h.startX;
    h.ty = h.startY;
    this.send({ type: 'setPose', id: h.id, pose: { x: h.startX, y: h.startY, z: h.startZ, rotationRad: 0 } });
    this.held = h;
    this.release();
  }

  private releaseProp(h: Held) {
    const w = this.w;
    const p = w.props[h.id];
    if (h.id === 'rod' || h.id === 'probe') {
      const target = this.receiverAt(p.pose.x, p.pose.y, 40, h.id);
      // (no se vuelve a meter en el recipiente del que se acaba de sacar)
      if (target && !(this.disarmed?.toolId === h.id && this.disarmed.targetId === target)) {
        const from = { x: p.pose.x, y: p.pose.y, z: p.pose.z };
        if (h.id === 'rod') this.send({ type: 'insertRod', vesselId: target });
        else this.send({ type: 'insertProbe', vesselId: target, touchingBottom: false });
        // Se ve entrar deslizándose a su sitio dentro del recipiente.
        this.syncAttachments();
        const q = p.pose;
        this.anim.play(h.id, 0.3, (u) => {
          const e = (1 - u) * (1 - u);
          return { dx: (from.x - q.x) * e, dy: (from.y - q.y) * e, dz: (from.z - q.z) * e };
        });
        this.host.sound('glass');
        return;
      }
      if (h.id === 'rod') this.send({ type: 'insertRod', vesselId: null });
      else this.send({ type: 'insertProbe', vesselId: null, touchingBottom: false });
    }
    if (h.id === 'watch_glass') {
      const dish = this.nearestDish(p.pose.x, p.pose.y);
      if (dish) {
        const d = Math.hypot(dish.pose.x - p.pose.x, dish.pose.y - p.pose.y);
        if (d < 4.5) {
          const from = { x: p.pose.x, y: p.pose.y, z: p.pose.z };
          const r = this.send({ type: 'cover', vesselId: dish.id, mode: d < 0.9 ? 'SEALED' : 'PARTIAL' });
          if (r.ok) {
            // El vidrio se desliza hasta apoyarse sobre la cápsula (dejando la abertura si es parcial).
            this.syncAttachments();
            const q = p.pose;
            this.anim.play(h.id, 0.3, (u) => {
              const e = (1 - u) * (1 - u);
              return { dx: (from.x - q.x) * e, dy: (from.y - q.y) * e, dz: (from.z - q.z) * e };
            });
            this.host.sound('glass');
            return;
          }
          this.host.notify('warn', 'hint.leaveGap');
        }
      }
    }
    this.placeOnBench(h.id, true, p.pose.x, p.pose.y);
  }

  private releaseVessel(_h: Held, v: Vessel) {
    const w = this.w;
    const tip = this.toolTip(v);
    // Herramientas: acción según dónde se suelta la punta.
    if (v.type === 'SPATULA' || v.type === 'SCOOP') {
      // Mismas reglas que el imán: no se repite sobre el recipiente recién usado ni se carga una herramienta llena.
      const target = this.receiverAt(tip!.x, tip!.y, tip!.z + 30, v.id);
      const kind = target && this.disarmed?.targetId !== target ? this.magnetKind(v, w.vessels[target]) : null;
      if (target && kind === 'scoop') {
        this.animScoop(v, w.vessels[target]);
        return;
      }
      if (target && kind === 'tap') {
        this.animTap(v, w.vessels[target]);
        return;
      }
      const towel = w.vessels.towel;
      if (v.type === 'SPATULA' && towel && Math.hypot(towel.pose.x - tip!.x, towel.pose.y - tip!.y) < 4.5) {
        this.cleanTool(v.id);
        return;
      }
    }
    if (v.type === 'DROPPER') {
      // Soltarlo cerca de una boca basta (mismo radio de captura que el imán).
      const target = this.receiverAt(v.pose.x, v.pose.y, v.pose.z + 30, v.id) ?? this.magnetTargetAt(v, v.pose.x, v.pose.y, this.disarmed?.targetId);
      if (target) {
        const tv = w.vessels[target];
        const kind = this.disarmed?.targetId === target ? null : this.magnetKind(v, tv);
        if (kind === 'aspirate') {
          this.animAspirate(v, tv);
          return;
        }
        if (tv.type !== 'REAGENT_BOTTLE') {
          this.rest(v, target);
          return;
        }
      }
    }
    if (v.type === 'WASH_BOTTLE') {
      // Soltar la piseta junto a un recipiente (por cualquier lado) la acopla con la boquilla sobre su boca;
      // salvo el recipiente del que se acaba de separar, para poder dejarla al lado.
      const target = this.receiverAt(tip!.x, tip!.y, tip!.z, v.id) ?? this.magnetTargetAt(v, v.pose.x, v.pose.y, this.disarmed?.targetId);
      if (target && this.disarmed?.targetId !== target) {
        this.rest(v, target, true);
        return;
      }
    }
    if (v.type === 'TOWEL' && w.bench.spillMl > 0 && Math.hypot(this.spillPos.x - v.pose.x, this.spillPos.y - v.pose.y) < 12) {
      // Se lleva el papel al charco y se frota en círculos; el charco desaparece al terminar de secar.
      const sp = { ...this.spillPos };
      this.send({ type: 'setPose', id: v.id, pose: { x: sp.x, y: sp.y, z: 0, rotationRad: 0 } });
      this.anim.play(v.id, 1.1, (u) => ({ dx: Math.sin(u * Math.PI * 6) * 2.5, dy: Math.cos(u * Math.PI * 6) * 1.5 }), [
        { at: 0.85, fn: () => this.send({ type: 'cleanSpill' }) },
      ], () => this.placeOnBench(v.id, false, sp.x, sp.y - 8));
      this.anim.label('seca el derrame', sp.x, sp.y, 2, 0xd8ffd8);
      this.host.sound('click');
      return;
    }
    // Inclinación al soltar: si el centro de masa sale de la base, se vuelca (§6).
    const deg = Math.abs((v.pose.rotationRad * 180) / Math.PI);
    if (VESSEL_DIM[v.type].tiltable && deg > 50 && (liquidVolumeMl(v.mix, this.host.runtime.ctx.subs) > 0.05 || particulateMassG(v.mix) > 0.01)) {
      this.placeOnBench(v.id, false, v.pose.x, v.pose.y, true);
      this.send({ type: 'tip', id: v.id });
      this.host.sound('glass');
      return;
    }
    // Zonas de encaje.
    const zone = this.snapZone;
    this.snapZone = null;
    if (zone && Math.hypot(zone.x - v.pose.x, zone.y - v.pose.y) < zone.snapR) {
      const fromZ = v.pose.z;
      const r = this.send({ type: 'place', id: v.id, support: zone.id });
      if (r.ok) {
        if (r.code !== 'BROKEN') {
          this.send({ type: 'setPose', id: v.id, pose: { x: zone.x, y: zone.y, z: zone.z, rotationRad: 0 } });
          this.settleAnim(v.id, fromZ - zone.z);
        }
        this.host.sound('glass');
        return;
      }
      this.host.notify('warn', `cmd.${r.code}`);
    }
    // Vaso soltado cerca de la espiga del embudo montado en el aro: se coloca debajo, sobre la placa base,
    // con la espiga tocando la pared interna (técnica correcta para recoger el filtrado sin salpicar).
    const fdock = this.funnelDockFor(v);
    if (fdock) {
      const fromZ = v.pose.z;
      const from = { x: v.pose.x, y: v.pose.y };
      this.send({ type: 'place', id: v.id, support: 'bench' });
      this.send({ type: 'setPose', id: v.id, pose: { x: fdock.x, y: fdock.y, z: fdock.z, rotationRad: 0 } });
      this.anim.play(v.id, 0.3, (u) => {
        const e = (1 - u) * (1 - u);
        return { dx: (from.x - fdock.x) * e, dy: (from.y - fdock.y) * e, dz: Math.max(0, fromZ - fdock.z) * e };
      });
      this.host.sound('glass');
      return;
    }
    // Probeta o vaso soltado junto a una piseta: se encaja bajo su boquilla y la piseta queda acoplada.
    const dock = this.pisetaDockFor(v);
    if (dock) {
      const fromZ = v.pose.z;
      const from = { x: v.pose.x, y: v.pose.y };
      this.send({ type: 'place', id: v.id, support: 'bench' });
      this.send({ type: 'setPose', id: v.id, pose: { x: dock.x, y: dock.y, z: 0, rotationRad: 0 } });
      this.anim.play(v.id, 0.25, (u) => {
        const e = (1 - u) * (1 - u);
        return { dx: (from.x - dock.x) * e, dy: (from.y - dock.y) * e, dz: fromZ * e };
      });
      this.rest(w.vessels[dock.pisetaId], v.id);
      this.host.sound('glass');
      return;
    }
    this.placeOnBench(v.id, false, v.pose.x, v.pose.y);
  }

  /** Lugar bajo la espiga de un embudo montado en el aro, si el vaso se soltó cerca y el sitio está libre. */
  private funnelDockFor(v: Vessel): { funnelId: string; x: number; y: number; z: number } | null {
    if (v.type !== 'BEAKER' || v.integrity === 0) return null;
    const w = this.w;
    for (const fid in w.vessels) {
      const f = w.vessels[fid];
      if (f.type !== 'FUNNEL' || f.support !== 'ring' || f.integrity === 0) continue;
      const r = SHAPES.BEAKER!.r;
      const x = f.pose.x - (r - FUNNEL_WALL_INSET_CM);
      const y = f.pose.y;
      if (Math.hypot(v.pose.x - x, v.pose.y - y) > FUNNEL_DOCK_CM) continue;
      const spot = this.freeSpot(v.id, x, y, VESSEL_DIM.BEAKER.footR);
      if (Math.hypot(spot.x - x, spot.y - y) > 0.3) continue;
      return { funnelId: fid, x, y, z: this.platformZ(x, y) };
    }
    return null;
  }

  /**
   * Piseta en la mesada a la que se puede encajar este recipiente: el punto bajo su boquilla está cerca del recipiente
   * soltado y libre de otros objetos. Devuelve la piseta y dónde queda el recipiente.
   */
  private pisetaDockFor(v: Vessel): { pisetaId: string; x: number; y: number } | null {
    if (!PISETA_DOCKABLE.has(v.type) || v.integrity === 0) return null;
    const w = this.w;
    for (const pid in w.vessels) {
      const p = w.vessels[pid];
      if (p.type !== 'WASH_BOTTLE' || p.support !== 'bench' || p.tipped || this.held?.id === pid) continue;
      const x = p.pose.x + PISETA_NOZZLE[0];
      const y = p.pose.y;
      if (Math.hypot(v.pose.x - x, v.pose.y - y) > PISETA_DOCK_CM) continue;
      const spot = this.freeSpot(v.id, x, y, VESSEL_DIM[v.type].footR, pid);
      if (Math.hypot(spot.x - x, spot.y - y) < 0.3) return { pisetaId: pid, x, y };
    }
    return null;
  }

  /**
   * Deja una herramienta "en reposo" sobre la boca de un recipiente (gotero/piseta).
   * Con `glide`, se ve deslizarse a su sitio (por encima del recipiente) en lugar de aparecer de golpe.
   */
  private rest(v: Vessel, targetId: string, glide = false) {
    const t = this.w.vessels[targetId];
    const m = mouthOf(t);
    let pose;
    if (v.type === 'WASH_BOTTLE') pose = { x: m.x - PISETA_NOZZLE[0], y: m.y, z: Math.max(0, m.z + 1.5 - PISETA_NOZZLE[1]), rotationRad: 0 };
    else pose = { x: m.x, y: m.y, z: m.z + 1.0, rotationRad: 0 };
    const from = { ...v.pose };
    this.send({ type: 'place', id: v.id, support: `mouth:${targetId}` });
    this.send({ type: 'setPose', id: v.id, pose });
    if (glide && Math.hypot(from.x - pose.x, from.y - pose.y, from.z - pose.z) > 0.3) {
      const over = Math.hypot(from.x - pose.x, from.y - pose.y) > 1 ? Math.max(0, m.z + 1 - pose.z) : 0;
      this.anim.play(v.id, 0.35, (u) => {
        const e = (1 - u) * (1 - u);
        return { dx: (from.x - pose.x) * e, dy: (from.y - pose.y) * e, dz: (from.z - pose.z) * e + over * Math.sin(Math.PI * u) };
      });
    }
    this.host.notify('info', v.type === 'WASH_BOTTLE' ? 'hint.pisetaRest' : 'hint.dropperRest');
  }

  /** Coloca sobre la mesada sin atravesar otros objetos; si cae fuera, cae al suelo. */
  placeOnBench(id: string, isProp: boolean, x: number, y: number, keepTilt = false, physics = true) {
    const w = this.w;
    const footR = isProp ? PROP_DIM[w.props[id].kind]?.footR ?? 2 : VESSEL_DIM[w.vessels[id].type].footR;
    const fell = x < -2 || x > BENCH.length + 2 || y < -3 || y > BENCH.depth + 3;
    if (fell) {
      const r = this.send({ type: 'drop', id, impactCmS: 400, fell: true });
      this.host.sound(r.code === 'BROKEN' ? 'break' : 'glass');
      x = Math.max(footR, Math.min(BENCH.length - footR, x));
      y = Math.max(footR, Math.min(BENCH.depth - footR, y));
    }
    const spot = this.freeSpot(id, x, y, footR);
    const pose0 = isProp ? w.props[id]?.pose : w.vessels[id]?.pose;
    const fromZ = pose0?.z ?? 0;
    const fromRot = keepTilt ? 0 : pose0?.rotationRad ?? 0;
    this.send({ type: 'place', id, support: 'bench' });
    // El embudo apoya sobre la punta del vástago: su origen (vértice del cono) queda a FUNNEL_STEM_CM.
    // Sobre la placa base del soporte universal, todo apoya a su altura.
    const restZ = (!isProp && w.vessels[id]?.type === 'FUNNEL' ? FUNNEL_STEM_CM : 0) + (isProp ? 0 : this.platformZ(spot.x, spot.y));
    if (physics && this.view.releaseToPhysics) {
      // Con física: se suelta a la altura actual y el cuerpo rígido cae y se apoya (o vuelca) solo.
      this.send({ type: 'setPose', id, pose: { x: spot.x, y: spot.y, z: Math.min(Math.max(fromZ, restZ + 0.3), 14), rotationRad: keepTilt ? pose0?.rotationRad ?? 0 : 0 } });
      if (this.view.releaseToPhysics(id, isProp)) return;
    }
    this.send({ type: 'setPose', id, pose: { x: spot.x, y: spot.y, z: restZ, rotationRad: 0 } });
    if (!this.anim.busy(id)) this.settleAnim(id, Math.min(Math.max(fromZ - restZ, 0), 12), fromRot);
  }

  /** Un objeto de radio r en (x, y) quedaría a caballo del borde de la placa base (ni encima ni fuera): se evita. */
  private straddlesPlate(x: number, y: number, r: number): boolean {
    const st = this.w.props.stand;
    if (!st || st.support !== 'bench') return false;
    const fp = PROP_FOOTPRINT.stand;
    const dx = Math.abs(x - st.pose.x);
    const dy = Math.abs(y - st.pose.y);
    const inside = dx <= fp.hx - r && dy <= fp.hy - r;
    const outside = Math.hypot(Math.max(dx - fp.hx, 0), Math.max(dy - fp.hy, 0)) >= r + 0.2;
    return !inside && !outside;
  }

  /** Altura de apoyo en (x, y): la placa base del soporte universal o la mesada. */
  platformZ(x: number, y: number): number {
    const st = this.w.props.stand;
    if (!st || st.support !== 'bench') return 0;
    const fp = PROP_FOOTPRINT.stand;
    return Math.abs(x - st.pose.x) <= fp.hx && Math.abs(y - st.pose.y) <= fp.hy ? STAND_PLATE_Z : 0;
  }

  private freeSpot(id: string, x: number, y: number, r: number, ignore?: string): { x: number; y: number } {
    const w = this.w;
    // Obstáculos: círculos (recipientes) o rectángulos (equipos, con la huella de su colisionador).
    const obstacles: Array<{ x: number; y: number; r: number; hx: number; hy: number }> = [];
    for (const vid in w.vessels) {
      if (vid === id || vid === ignore) continue;
      const o = w.vessels[vid];
      if (o.support !== 'bench' || o.support === null) continue;
      obstacles.push({ x: o.pose.x, y: o.pose.y, r: VESSEL_DIM[o.type].footR, hx: 0, hy: 0 });
    }
    for (const pid in w.props) {
      if (pid === id) continue;
      const o = w.props[pid];
      if (o.support !== 'bench') continue;
      if (o.kind === 'rod' || o.kind === 'probe' || o.kind === 'watch_glass' || o.kind === 'tongs') continue;
      // La placa base del soporte es una plataforma (el vaso receptor va encima, bajo el embudo): solo la columna estorba.
      if (o.kind === 'stand') {
        obstacles.push({ x: o.pose.x - 4, y: o.pose.y, r: 0.8, hx: 0, hy: 0 });
        continue;
      }
      const fp = PROP_FOOTPRINT[o.kind];
      if (fp) obstacles.push({ x: o.pose.x, y: o.pose.y, r: 0, hx: fp.hx, hy: fp.hy });
      else obstacles.push({ x: o.pose.x, y: o.pose.y, r: (PROP_DIM[o.kind]?.footR ?? 2) * 0.85, hx: 0, hy: 0 });
    }
    const free = (px: number, py: number) =>
      px >= r && px <= BENCH.length - r && py >= Math.min(r, 2) && py <= BENCH.depth - Math.min(r, 2) &&
      !this.straddlesPlate(px, py, r) &&
      obstacles.every((o) => {
        const dx = Math.max(Math.abs(o.x - px) - o.hx, 0);
        const dy = Math.max(Math.abs(o.y - py) - o.hy, 0);
        return Math.hypot(dx, dy) >= o.r + r + 0.3;
      });
    if (free(x, y)) return { x, y };
    for (let rad = 0.5; rad < 40; rad += 0.5) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad * 0.7;
        if (free(px, py)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  // ───────────── Objetos acoplados a soportes ─────────────

  private syncAttachments() {
    const w = this.w;
    const heldId = this.held?.id;
    for (const id in w.vessels) {
      if (id === heldId) continue;
      const v = w.vessels[id];
      const s = v.support;
      if (!s || s === 'bench' || s === 'glass_waste') continue;
      if (s.startsWith('mouth:')) {
        const t = w.vessels[s.slice(6)];
        if (!t || t.integrity === 0) continue;
        const m = mouthOf(t);
        const pose = v.type === 'WASH_BOTTLE'
          ? { x: m.x - PISETA_NOZZLE[0], y: m.y, z: Math.max(0, m.z + 1.5 - PISETA_NOZZLE[1]), rotationRad: 0 }
          : { x: m.x, y: m.y, z: m.z + 1.0, rotationRad: 0 };
        setPoseIfChanged(v.pose, pose);
        continue;
      }
      const z = zoneById(w, s);
      if (z) setPoseIfChanged(v.pose, { x: z.x, y: z.y, z: z.z, rotationRad: v.tipped ? v.pose.rotationRad : 0 });
      else if (s === 'funnel') {
        const f = Object.values(w.vessels).find((q) => q.funnel?.paperId === id);
        if (f) setPoseIfChanged(v.pose, { ...f.pose });
      }
    }
    // Papel dentro del embudo (soporte 'funnel').
    for (const id in w.vessels) {
      const f = w.vessels[id];
      if (f.funnel?.paperId && w.vessels[f.funnel.paperId]) setPoseIfChanged(w.vessels[f.funnel.paperId].pose, { ...f.pose });
    }
    // Varilla y sonda dentro de un recipiente.
    const rod = w.devices.rod;
    if (rod.vesselId && heldId !== 'rod') {
      const v = w.vessels[rod.vesselId];
      if (v && w.props.rod) {
        const sh = SHAPES[v.type];
        setPoseIfChanged(w.props.rod.pose, { x: v.pose.x + (sh?.r ?? 1) * 0.45, y: v.pose.y + 0.3, z: v.pose.z + (sh?.baseOffset ?? 0.2) + 0.2, rotationRad: 0 });
      }
    }
    const probe = w.devices.probe;
    if (probe.vesselId && heldId !== 'probe') {
      const v = w.vessels[probe.vesselId];
      if (v && w.props.probe) {
        const sh = SHAPES[v.type];
        setPoseIfChanged(w.props.probe.pose, { x: v.pose.x - (sh?.r ?? 1) * 0.45, y: v.pose.y - 0.3, z: v.pose.z + (sh?.baseOffset ?? 0.2), rotationRad: 0 });
      }
    }
    // Vidrio de reloj sobre la cápsula.
    const covered = Object.values(w.vessels).find((v) => v.cover !== 'NONE');
    if (covered && w.props.watch_glass && heldId !== 'watch_glass') setPoseIfChanged(w.props.watch_glass.pose, { ...covered.pose, x: covered.pose.x + 1.2 });
  }

  /** Receptor bajo la espiga del embudo (intersección vertical) y contacto con la pared interna. */
  private updateDrips() {
    const w = this.w;
    for (const id in w.vessels) {
      const f = w.vessels[id];
      if (!f.funnel || f.integrity === 0) continue;
      const tipZ = f.pose.z - FUNNEL_STEM_CM;
      let target: string | null = null;
      let wall = false;
      let bestZ = -Infinity;
      for (const vid in w.vessels) {
        if (vid === id) continue;
        const v = w.vessels[vid];
        if (v.integrity === 0 || v.type === 'FILTER_PAPER' || this.held?.id === vid) continue;
        const m = mouthOf(v);
        if (m.r <= 0) continue;
        const d = Math.hypot(m.x - f.pose.x, m.y - f.pose.y);
        if (d <= m.r && m.z <= tipZ + 2.5 && m.z > bestZ && v.pose.z < tipZ) {
          target = vid;
          bestZ = m.z;
          wall = tipZ < m.z && d >= m.r - 0.9;
        }
      }
      const key = `${target}|${wall}`;
      if (this.dripSent.get(id) !== key) {
        this.send({ type: 'setDripTarget', funnelId: id, targetId: target, touchingWall: wall });
        this.dripSent.set(id, key);
      }
    }
  }

  // ───────────── Teclado (§14) ─────────────

  onKeyDown(key: string, shift: boolean): boolean {
    const sel = this.host.getSelected();
    const h = this.held;
    const step = shift ? 5 : 1;
    switch (key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? step : key === 'ArrowDown' ? -step : 0;
        if (h) {
          h.tx += dx;
          h.ty += dy;
        } else this.selectNeighbor(dx, dy);
        return true;
      }
      case 'Enter':
        if (h) this.release();
        else if (sel) {
          if (this.beginDrag(sel, true)) this.host.notify('info', 'hint.keyboardHold');
        }
        return true;
      case 'Escape':
        if (h) this.cancelHold();
        else this.host.select(null);
        return true;
      case 'q':
      case 'Q':
      case 'e':
      case 'E':
        if (h) this.nudgeTilt(key.toLowerCase() === 'e' ? 1 : -1, 8);
        return true;
      case 'a':
      case 'A':
        this.agitateKey = true;
        return true;
      case 'p':
      case 'P':
      case ' ':
        this.primary(sel, shift);
        return true;
    }
    return false;
  }

  onKeyUp(key: string): boolean {
    if (key === 'a' || key === 'A') {
      this.agitateKey = false;
      const sel = this.host.getSelected();
      if (sel === 'rod' && this.w.devices.rod.vesselId) this.send({ type: 'setAgitation', vesselId: this.w.devices.rod.vesselId, intensity: 0, tool: 'NONE' });
      return true;
    }
    if (key === 'p' || key === 'P' || key === ' ') {
      this.secondaryUp();
      return true;
    }
    return false;
  }

  /** Acción principal sobre la selección: apretar piseta, soltar gota, golpear espátula. */
  primary(sel: string | null, slow = false) {
    const w = this.w;
    const id = this.held?.id ?? sel;
    if (!id) return;
    const v = w.vessels[id];
    if (!v) return;
    if (this.held && this.pourDock?.sourceId === id) this.secondaryDown();
    else if (v.type === 'WASH_BOTTLE') this.startSqueeze(slow);
    else if (v.type === 'DROPPER') this.dropFrom(id);
  }

  private selectNeighbor(dx: number, dy: number) {
    const w = this.w;
    const sel = this.host.getSelected();
    const cur = sel ? (w.vessels[sel]?.pose ?? w.props[sel]?.pose) : { x: this.lastRevealX, y: 30 };
    if (!cur) return;
    let best: string | null = null;
    let bestScore = Infinity;
    const all = [...Object.values(w.vessels).filter((v) => v.support !== 'glass_waste' && v.support !== 'funnel').map((v) => ({ id: v.id, p: v.pose })), ...Object.values(w.props).filter((p) => p.kind !== 'tray').map((p) => ({ id: p.id, p: p.pose }))];
    for (const o of all) {
      if (o.id === sel) continue;
      const ox = o.p.x - cur.x;
      const oy = o.p.y - cur.y;
      const along = dx !== 0 ? ox * Math.sign(dx) : oy * Math.sign(dy);
      if (along <= 0.3) continue;
      const across = dx !== 0 ? Math.abs(oy) : Math.abs(ox);
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = o.id;
      }
    }
    if (best) {
      this.host.select(best);
      const p = w.vessels[best]?.pose ?? w.props[best]?.pose;
      if (p) {
        this.lastRevealX = p.x;
        this.view.reveal(p.x);
      }
    }
  }
}

/** Mínima altura de un polígono convexo (x, z) dentro de la franja x0 ≤ x ≤ x1 (Infinity si no la cruza). */
function minZOverX(poly: Array<[number, number]>, x0: number, x1: number): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a[0] >= x0 && a[0] <= x1) best = Math.min(best, a[1]);
    for (const xb of [x0, x1]) {
      if ((a[0] - xb) * (b[0] - xb) < 0) best = Math.min(best, a[1] + ((xb - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
    }
  }
  return best;
}

function clampTilt(t: number) {
  const lim = (150 * Math.PI) / 180;
  return Math.max(-lim, Math.min(lim, t));
}

function setPoseIfChanged(target: { x: number; y: number; z: number; rotationRad: number }, p: { x: number; y: number; z: number; rotationRad: number }) {
  target.x = p.x;
  target.y = p.y;
  target.z = p.z;
  target.rotationRad = p.rotationRad;
}
