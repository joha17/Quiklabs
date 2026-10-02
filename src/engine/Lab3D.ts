/**
 * Fachada del renderizador 3D (§3.3 «LabRenderer»): lo único que la interfaz React conoce del motor.
 * Reúne el controlador de interacción, el animador de acciones, las partículas, el audio, la cámara
 * (registrada por CameraRig al montarse) y el nivel de calidad. No contiene reglas químicas.
 */
import type * as THREE from 'three';
import type { EngineHost } from './interaction/host';
import { InteractionController } from './interaction/controller';
import { Animator } from './effects/animator';
import { ParticleSystem } from './effects/particles';
import { LabAudio } from './effects/audio';
import { QUALITY, type QualityLevel } from './quality';
import { materials } from './renderers/materials';
import type { FrameCtx } from './renderers/frame';
import { balanceReading } from '../simulation/world/world';
import { SHAPES, liquidLevel } from './physics/geometry';
import { liquidVolumeMl } from '../simulation/solutions/mixture';

export interface CameraApi {
  goToStation(id: string): void;
  /** Mira un punto de la mesada (cm) desde una distancia dada. */
  lookAt(x: number, y: number, z: number, dist?: number): void;
  focusObject(id: string, close?: boolean): void;
  /** «Nivel del ojo»: alinea la cámara con el menisco del instrumento (null = volver a la vista normal). */
  eyeLevel(id: string | null): void;
  orbit(dAzimuth: number, dPolar: number): void;
  zoomBy(f: number): void;
  reset(): void;
  /** Píxeles (relativos al lienzo) de un punto de la mesada. */
  screenOf(x: number, y: number, z: number): { x: number; y: number };
  /** Termina las transiciones de cámara al instante (pruebas). */
  settle(): void;
  /** Altura de la cámara y su distancia horizontal al punto (para el paralaje). */
  elevationTo(x: number, y: number, z: number): { dy: number; dist: number };
  /** Desplazamiento lateral al arrastrar cerca del borde, revelar una x y activar/desactivar la órbita. */
  edgePan(dir: -1 | 1, dt: number): void;
  reveal(x: number): void;
  setOrbitEnabled(on: boolean): void;
}

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
}

export class Lab3D {
  controller: InteractionController;
  animator = new Animator();
  particles = new ParticleSystem();
  audio = new LabAudio();
  camera: CameraApi | null = null;
  quality: QualityLevel;
  /** Objetos soltados que la física hace caer/apoyarse (cuerpos dinámicos temporales). */
  physicsActive = new Set<string>();
  /** Volúmenes de selección registrados por las vistas. */
  hitMeshes = new Set<THREE.Mesh>();
  eyeLevelId: string | null = null;
  stats: RenderStats = { fps: 0, calls: 0, triangles: 0, geometries: 0 };
  contextLost = false;
  /** Lo registra la escena: recrea el lienzo completo a partir del estado del dominio (contexto WebGL restaurado). */
  rebuildScene: (() => void) | null = null;
  /** Renderizador, escena y cámara activos (diagnóstico de rendimiento y pruebas visuales). */
  three: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera } | null = null;
  /** Vista de cámara conservada si la escena se recrea (cambio de calidad, contexto restaurado). */
  savedView: { target: [number, number, number]; pos: [number, number, number] } | null = null;
  private frameCtx: FrameCtx | null = null;
  private frameStamp = -1;

  constructor(public host: EngineHost, quality: QualityLevel) {
    this.quality = quality;
    this.controller = new InteractionController(host, this.animator, this.particles);
  }

  get runtime() {
    return this.host.runtime;
  }

  goToStation(id: string) {
    this.eyeLevelId = null;
    this.camera?.goToStation(id);
  }

  focusObject(id: string, zoom?: number) {
    this.camera?.focusObject(id, !!zoom && zoom > 2);
  }

  /** Vista «nivel del ojo» sobre el objeto seleccionado (o la probeta). */
  setLevelView(on: boolean) {
    const sel = this.host.getSelected();
    const id = on ? (sel && this.runtime.world.vessels[sel] ? sel : 'cyl') : null;
    this.eyeLevelId = id;
    this.camera?.eyeLevel(id);
  }

  /**
   * Paralaje real (§7): si la cámara no está a la altura del menisco, la lectura se desvía una división
   * (arriba → se lee de más; abajo → de menos). Devuelve el sesgo en mL.
   */
  parallaxMl(id: string): number {
    const v = this.runtime.world.vessels[id];
    const sh = v ? SHAPES[v.type] : undefined;
    if (!v || !sh || !this.camera) return 0;
    const level = v.pose.z + liquidLevel(sh, 0, liquidVolumeMl(v.mix, this.runtime.ctx.subs));
    const { dy, dist } = this.camera.elevationTo(v.pose.x, v.pose.y, level);
    const slope = dy / Math.max(dist, 1);
    if (Math.abs(slope) < 0.08) return 0;
    return slope > 0 ? 0.2 : -0.2;
  }

  /** Contexto de dibujo del fotograma (se calcula una vez por fotograma). */
  frame(t: number, dt: number, eyeLevel: boolean): FrameCtx {
    if (this.frameCtx && this.frameStamp === t) return this.frameCtx;
    const rt = this.runtime;
    const w = rt.world;
    const probe = w.devices.probe;
    let probeReading: number | null = null;
    if (probe.vesselId && w.vessels[probe.vesselId]) {
      const v = w.vessels[probe.vesselId];
      const plate = v.support === 'hotplate' ? w.devices.hotplate.plateTempC : v.temperatureC;
      // Sonda tocando el fondo sobre la placa: lectura sesgada (§7).
      probeReading = v.temperatureC + (probe.touchingBottom ? 0.35 * (plate - v.temperatureC) : 0) + (v.support === 'hotplate' && v.agitation < 0.15 && w.devices.hotplate.powerPct > 0 ? 1.5 : 0);
    } else if (w.props.probe) probeReading = w.params.ambientC;
    const bal = w.props.balance ? balanceReading(w) : null;
    const c = this.controller;
    this.frameCtx = {
      world: w,
      subs: rt.ctx.subs,
      t,
      dt,
      held: c.held?.id ?? null,
      selected: this.host.getSelected(),
      hovered: c.hovered,
      snapTarget: c.snapTarget && w.vessels[c.snapTarget] ? c.snapTarget : null,
      reducedMotion: this.host.reducedMotion(),
      offset: (id) => this.animator.offset(id),
      squeezingId: c.squeezing ? 'piseta' : null,
      probeReading,
      balanceText: bal === null ? 'OL' : `${bal.toFixed(2)} g`,
      mats: materials(this.quality),
      quality: this.quality,
      eyeLevel,
    };
    this.frameStamp = t;
    return this.frameCtx;
  }

  profile() {
    return QUALITY[this.quality];
  }
}
