/**
 * Fachada del renderizador 3D de la Práctica 6: lo único que la interfaz React conoce del motor de esta práctica.
 * Reúne el controlador de interacción, el audio (sintetizador de la Práctica 4), la cámara (registrada por la escena),
 * la calidad y el contexto de dibujo por fotograma.
 */
import * as THREE from 'three';
import type { CalorHost } from './host';
import { CalorController } from './controller';
import { ReactionAudio } from '../reaction/audio';
import { QUALITY, type QualityLevel } from '../quality';
import { materials, type MaterialSet } from '../renderers/materials';
import type { P6World } from '../../simulation/calorimetry-world/types';

export interface CameraApi6 {
  goToStation(id: string): void;
  lookAt(x: number, y: number, z: number, dist?: number, elevation?: number): void;
  focusObject(id: string, close?: boolean): void;
  /** Vista horizontal a la altura del menisco de la probeta o del fiel de la balanza (sin paralaje). */
  eyeLevel(target: 'cylinder' | 'balance'): void;
  orbit(dAzimuth: number, dPolar: number): void;
  zoomBy(f: number): void;
  reset(): void;
  screenOf(x: number, y: number, z: number): { x: number; y: number };
  settle(): void;
  position(): { x: number; y: number; z: number };
  edgePan(dir: -1 | 1, dt: number): void;
  setOrbitEnabled(on: boolean): void;
}

export interface FrameCtx6 {
  world: P6World;
  t: number;
  dt: number;
  held: string | null;
  selected: string | null;
  hovered: string | null;
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

export class CalorLab3D {
  controller: CalorController;
  audio = new ReactionAudio();
  camera: CameraApi6 | null = null;
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
  private frameCtx: FrameCtx6 | null = null;
  private frameStamp = -1;

  constructor(public host: CalorHost, quality: QualityLevel) {
    this.quality = quality;
    this.controller = new CalorController(host, this);
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

  frame(t: number, dt: number): FrameCtx6 {
    if (this.frameCtx && this.frameStamp === t) return this.frameCtx;
    const c = this.controller;
    this.frameCtx = {
      world: this.runtime.world, t, dt, held: c.held?.id ?? null, selected: this.host.getSelected(), hovered: c.hovered,
      reducedMotion: this.host.reducedMotion(), mats: materials(this.quality), quality: this.quality, camPos: this.camPos,
    };
    this.frameStamp = t;
    return this.frameCtx;
  }

  profile() {
    return QUALITY[this.quality];
  }
}
