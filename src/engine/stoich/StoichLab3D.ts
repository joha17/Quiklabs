/**
 * Fachada del renderizador 3D de la Práctica 5: lo único que la interfaz React conoce del motor de esta práctica.
 * Reúne el controlador de interacción, el audio (el sintetizador de la Práctica 4), la cámara (registrada por la
 * escena), la calidad, el contexto de dibujo por fotograma y la fuente de datos de las vistas del mechero de la
 * Práctica 3 (llama paramétrica y manguera).
 */
import * as THREE from 'three';
import type { StoichHost } from './host';
import { StoichController } from './controller';
import { ReactionAudio } from '../reaction/audio';
import { QUALITY, type QualityLevel } from '../quality';
import { materials, type MaterialSet } from '../renderers/materials';
import type { P5World } from '../../simulation/stoich-world/types';
import { tubeAxis, type StoichContext, type TubeAxis } from '../../simulation/stoich-world/world';
import { computeFlameColors, type BurnerViewSource, type FlameColors, type FrameCtx3 } from '../flame/FlameLab3D';
import type { GlassUniforms } from '../flame/flameMaterial';

export interface CameraApi5 {
  goToStation(id: string): void;
  lookAt(x: number, y: number, z: number, dist?: number, elevation?: number): void;
  focusObject(id: string, close?: boolean): void;
  /** Vista frontal a la altura del fiel de la balanza (lectura sin paralaje, §6.3). */
  eyeLevel(): void;
  orbit(dAzimuth: number, dPolar: number): void;
  zoomBy(f: number): void;
  reset(): void;
  screenOf(x: number, y: number, z: number): { x: number; y: number };
  settle(): void;
  position(): { x: number; y: number; z: number };
  edgePan(dir: -1 | 1, dt: number): void;
  setOrbitEnabled(on: boolean): void;
}

export interface FrameCtx5 {
  world: P5World;
  ctx: StoichContext;
  axis: TubeAxis;
  t: number;
  dt: number;
  held: string | null;
  selected: string | null;
  hovered: string | null;
  reducedMotion: boolean;
  mats: MaterialSet;
  quality: QualityLevel;
  camPos: THREE.Vector3;
  /** Última lectura del termómetro IR (°C) o null. */
  irReading: number | null;
}

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
}

export class StoichLab3D {
  controller: StoichController;
  audio = new ReactionAudio();
  camera: CameraApi5 | null = null;
  quality: QualityLevel;
  hitMeshes = new Set<THREE.Mesh>();
  stats: RenderStats = { fps: 0, calls: 0, triangles: 0, geometries: 0 };
  contextLost = false;
  rebuildScene: (() => void) | null = null;
  three: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera } | null = null;
  savedView: { target: [number, number, number]; pos: [number, number, number] } | null = null;
  playback = { paused: false, speed: 1 };
  onFrame: ((dt: number) => void) | null = null;
  demoCursor: { x: number; y: number; z: number; down: boolean } | null = null;
  locked = false;
  camPos = new THREE.Vector3();
  irReading: number | null = null;
  private noGlass: GlassUniforms = { on: false, center: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1), halfW: 1, halfH: 1 };
  private frameCtx: FrameCtx5 | null = null;
  private gasCtx: FrameCtx3 | null = null;
  private frameStamp = -1;
  private colorKey = '';
  private colors: FlameColors = { body: [0, 0, 0], bodyF: [0, 0, 0], inner: [0, 0, 0], innerF: [0, 0, 0] };
  readonly gasSource: BurnerViewSource;

  constructor(public host: StoichHost, quality: QualityLevel) {
    this.quality = quality;
    this.controller = new StoichController(host, this);
    const runtimeOf = () => ({ world: this.runtime.world.gas, ctx: this.runtime.ctx.gasCtx });
    this.gasSource = {
      frame: (t, dt) => this.gasFrame(t, dt),
      get runtime() {
        return runtimeOf();
      },
      hitMeshes: this.hitMeshes,
      host: { getSelected: () => host.getSelected() },
    };
  }

  get runtime() {
    return this.host.runtime;
  }

  goToStation(id: string) {
    this.camera?.goToStation(id);
  }

  focusObject(id: string, zoom?: number) {
    this.camera?.focusObject(id, !!zoom && zoom > 2);
  }

  private flameColors(): FlameColors {
    const g = this.runtime.world.gas;
    const f = g.burner.flame;
    const key = `${g.burner.flameState}|${f.fuelFlow.toFixed(2)}|${f.airMix.toFixed(2)}`;
    if (key === this.colorKey) return this.colors;
    this.colorKey = key;
    this.colors = computeFlameColors(g, this.runtime.ctx.gasCtx);
    return this.colors;
  }

  /** Contexto de dibujo del mechero (formato de la Práctica 3) para reutilizar sus vistas. */
  gasFrame(t: number, dt: number): FrameCtx3 {
    this.frame(t, dt);
    return this.gasCtx!;
  }

  frame(t: number, dt: number): FrameCtx5 {
    if (this.frameCtx && this.frameStamp === t) return this.frameCtx;
    const rt = this.runtime;
    const c = this.controller;
    const mats = materials(this.quality);
    this.frameCtx = {
      world: rt.world,
      ctx: rt.ctx,
      axis: tubeAxis(rt.world, rt.ctx),
      t,
      dt,
      held: c.held?.id ?? null,
      selected: this.host.getSelected(),
      hovered: c.hovered,
      reducedMotion: this.host.reducedMotion(),
      mats,
      quality: this.quality,
      camPos: this.camPos,
      irReading: this.irReading,
    };
    this.gasCtx = {
      world: rt.world.gas,
      t,
      dt,
      held: c.held?.id ?? null,
      selected: this.host.getSelected(),
      hovered: c.hovered,
      reducedMotion: this.host.reducedMotion(),
      mats,
      quality: this.quality,
      emitters: [],
      colors: this.flameColors(),
      glass: this.noGlass,
      camPos: this.camPos,
      partMode: false,
      clampReady: false,
    };
    this.frameStamp = t;
    return this.frameCtx;
  }

  profile() {
    return QUALITY[this.quality];
  }
}
