/**
 * Fachada del renderizador 3D de la Práctica 4: lo único que la interfaz React conoce del motor de esta práctica.
 * Reúne el controlador de interacción, el audio, la cámara (registrada por la escena), la calidad, el contexto de
 * dibujo por fotograma (apariencia de cada recipiente calculada con el modelo químico) y la fuente de datos de las
 * vistas del mechero reutilizadas de la Práctica 3 (llama paramétrica y manguera).
 */
import * as THREE from 'three';
import type { ReactionHost } from './host';
import { ReactionController } from './controller';
import { ReactionAudio } from './audio';
import { QUALITY, type QualityLevel } from '../quality';
import { materials, type MaterialSet } from '../renderers/materials';
import type { P4World } from '../../simulation/reaction-world/types';
import { vesselAppearance, type VesselAppearance } from '../../simulation/reaction-world/world';
import { computeFlameColors, type BurnerViewSource, type FlameColors, type FrameCtx3 } from '../flame/FlameLab3D';
import type { GlassUniforms } from '../flame/flameMaterial';

export interface CameraApi4 {
  goToStation(id: string): void;
  lookAt(x: number, y: number, z: number, dist?: number, elevation?: number): void;
  focusObject(id: string, close?: boolean): void;
  /** Vista a la altura del menisco de un recipiente (lectura sin paralaje, §16.1). */
  eyeLevel(id: string): void;
  orbit(dAzimuth: number, dPolar: number): void;
  zoomBy(f: number): void;
  reset(): void;
  screenOf(x: number, y: number, z: number): { x: number; y: number };
  settle(): void;
  position(): { x: number; y: number; z: number };
  edgePan(dir: -1 | 1, dt: number): void;
  setOrbitEnabled(on: boolean): void;
}

export interface FrameCtx4 {
  world: P4World;
  t: number;
  dt: number;
  held: string | null;
  selected: string | null;
  hovered: string | null;
  reducedMotion: boolean;
  mats: MaterialSet;
  quality: QualityLevel;
  camPos: THREE.Vector3;
  clampReady: boolean;
  /** Apariencia por recipiente (calculada una vez por fotograma). */
  look(id: string): VesselAppearance | null;
  /** Luz de la combustión del Mg (0–1, ya limitada para no deslumbrar). */
  mgGlow: number;
}

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
}

export class ReactionLab3D {
  controller: ReactionController;
  audio = new ReactionAudio();
  camera: CameraApi4 | null = null;
  quality: QualityLevel;
  physicsActive = new Set<string>();
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
  /** Rectángulo de la pantalla para Mg en la escena (lo actualiza su vista; sirve para la alineación). */
  shield = { on: false, center: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1), halfW: 10, halfH: 8 };
  /** El mechero no usa el vidrio de cobalto en esta práctica. */
  private noGlass: GlassUniforms = { on: false, center: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1), halfW: 1, halfH: 1 };
  mgGlow = 0;
  private frameCtx: FrameCtx4 | null = null;
  private gasCtx: FrameCtx3 | null = null;
  private frameStamp = -1;
  private colorKey = '';
  private colors: FlameColors = { body: [0, 0, 0], bodyF: [0, 0, 0], inner: [0, 0, 0], innerF: [0, 0, 0] };
  readonly gasSource: BurnerViewSource;

  constructor(public host: ReactionHost, quality: QualityLevel) {
    this.quality = quality;
    this.controller = new ReactionController(host, this);
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

  frame(t: number, dt: number): FrameCtx4 {
    if (this.frameCtx && this.frameStamp === t) return this.frameCtx;
    const rt = this.runtime;
    const c = this.controller;
    const looks = new Map<string, VesselAppearance | null>();
    const mats = materials(this.quality);
    this.frameCtx = {
      world: rt.world,
      t,
      dt,
      held: c.held?.id ?? null,
      selected: this.host.getSelected(),
      hovered: c.hovered,
      reducedMotion: this.host.reducedMotion(),
      mats,
      quality: this.quality,
      camPos: this.camPos,
      clampReady: c.clampReady,
      look: (id) => {
        if (!looks.has(id)) looks.set(id, vesselAppearance(rt.world, rt.ctx, id));
        return looks.get(id) ?? null;
      },
      mgGlow: this.mgGlow,
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
