/**
 * Fachada del renderizador 3D de F05: lo único que la interfaz React conoce del motor de esta práctica. Reúne el
 * controlador de interacción, el audio, la cámara (registrada por la escena), la calidad y el contexto por fotograma.
 * Cambiar la calidad gráfica o los FPS no cambia fuerzas ni medidas: el dominio avanza con su paso fijo.
 */
import * as THREE from 'three';
import type { F05Host } from './host';
import { F05Controller } from './controller';
import { ReactionAudio } from '../reaction/audio';
import { QUALITY, type QualityLevel } from '../quality';
import { materials, type MaterialSet } from '../renderers/materials';
import type { F05World } from '../../simulation/f05-world/types';

/** Lo que se lee de frente y a la altura del ojo (vista normal a la escala, sin paralaje). */
export type EyeTargetF5 = 'gate1' | 'gate2' | 'gonio01' | 'elevator01' | 'balance01' | 'logger01' | 'thermo01' | 'block01';

export interface CameraApiF {
  goToStation(id: string): void;
  lookAt(x: number, y: number, z: number, dist?: number, elevation?: number): void;
  focusObject(id: string, close?: boolean): void;
  eyeLevel(target: EyeTargetF5): void;
  orbit(dAzimuth: number, dPolar: number): void;
  zoomBy(f: number): void;
  reset(): void;
  screenOf(x: number, y: number, z: number): { x: number; y: number };
  settle(): void;
  position(): { x: number; y: number; z: number };
  target(): { x: number; y: number; z: number };
  edgePan(dir: -1 | 1, dt: number): void;
  setOrbitEnabled(on: boolean): void;
}

export interface FrameCtxF {
  world: F05World;
  t: number;
  dt: number;
  held: string | null;
  selected: string | null;
  hovered: string | null;
  hoveredPart: string | null;
  reducedMotion: boolean;
  mats: MaterialSet;
  quality: QualityLevel;
  camPos: THREE.Vector3;
}

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
}

export class F05Lab3D {
  controller: F05Controller;
  audio = new ReactionAudio();
  camera: CameraApiF | null = null;
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
  /** Corrimiento vertical del ojo de lectura (cm); 0 salvo pruebas de paralaje. */
  eyeOffsetCm = 0;
  camPos = new THREE.Vector3();
  private frameCtx: FrameCtxF | null = null;
  private frameStamp = -1;

  constructor(public host: F05Host, quality: QualityLevel) {
    this.quality = quality;
    this.controller = new F05Controller(host, this);
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

  frame(t: number, dt: number): FrameCtxF {
    if (this.frameCtx && this.frameStamp === t) return this.frameCtx;
    const c = this.controller;
    this.frameCtx = {
      world: this.runtime.world, t, dt, held: c.held?.id ?? null, selected: this.host.getSelected(), hovered: c.hovered, hoveredPart: c.hoveredPart,
      reducedMotion: this.host.reducedMotion(), mats: materials(this.quality), quality: this.quality, camPos: this.camPos,
    };
    this.frameStamp = t;
    return this.frameCtx;
  }

  profile() {
    return QUALITY[this.quality];
  }
}
