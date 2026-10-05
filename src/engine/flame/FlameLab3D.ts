/**
 * Fachada del renderizador 3D de la Práctica 3: lo único que la interfaz React conoce del motor de esta práctica.
 * Reúne el controlador de interacción, el audio, la cámara (registrada por la escena), la calidad y el contexto
 * de dibujo por fotograma (colores de la llama y de las muestras calculados con el modelo espectral).
 */
import * as THREE from 'three';
import type { FlameHost } from './host';
import { FlameController } from './controller';
import { FlameAudio } from './audio';
import { QUALITY, type QualityLevel } from '../quality';
import { materials, type MaterialSet } from '../renderers/materials';
import type { FlameWorld } from '../../simulation/flame-world/types';
import { activeEmitters, flameBaseSpectrum, type EmitterView, type FlameContext } from '../../simulation/flame-world/world';
import { addComponents, applyFilter, emptySpectrum, observe } from '../../simulation/spectroscopy/spectrum';
import type { GlassUniforms } from './flameMaterial';

export interface CameraApi3 {
  goToStation(id: string): void;
  lookAt(x: number, y: number, z: number, dist?: number, elevation?: number): void;
  focusObject(id: string, close?: boolean): void;
  orbit(dAzimuth: number, dPolar: number): void;
  zoomBy(f: number): void;
  reset(): void;
  screenOf(x: number, y: number, z: number): { x: number; y: number };
  settle(): void;
  /** Posición de la cámara en cm de mesada. */
  position(): { x: number; y: number; z: number };
  edgePan(dir: -1 | 1, dt: number): void;
  reveal(x: number): void;
  setOrbitEnabled(on: boolean): void;
}

export interface FlameColors {
  /**
   * Colores lineales de la llama base sin y con filtro. El TONO sale del espectro observado; el brillo de dibujo se
   * normaliza (la pantalla no reproduce la luminancia real de una llama) y el filtro conserva su atenuación relativa.
   */
  body: [number, number, number];
  bodyF: [number, number, number];
  /** Quimioluminiscencia de CH* y C₂ (base azul de la llama y cono interno). */
  inner: [number, number, number];
  innerF: [number, number, number];
}

export interface FrameCtx3 {
  world: FlameWorld;
  t: number;
  dt: number;
  held: string | null;
  selected: string | null;
  hovered: string | null;
  reducedMotion: boolean;
  mats: MaterialSet;
  quality: QualityLevel;
  emitters: EmitterView[];
  colors: FlameColors;
  glass: GlassUniforms;
  camPos: THREE.Vector3;
  /** Modo de identificación de partes activo. */
  partMode: boolean;
  /** La pinza sostenida está en posición de sujetar la cápsula. */
  clampReady: boolean;
}

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
}

const toLinear = (c: [number, number, number], gain: number): [number, number, number] =>
  c.map((v) => Math.min(1.6, (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * gain)) as [number, number, number];

/**
 * Par de colores lineales (sin filtro, con filtro) con el tono de cada observación, brillo de dibujo `gain` y la
 * atenuación relativa que produce el vidrio (cociente de sus brillos de pantalla).
 */
export function huePair(raw: [number, number, number], filt: [number, number, number], gain: number): [[number, number, number], [number, number, number]] {
  const mr = Math.max(...raw, 1e-6);
  const mf = Math.max(...filt, 1e-6);
  const att = Math.min(1, mf / mr);
  const a = toLinear(raw.map((v) => v / mr) as [number, number, number], gain);
  const b = toLinear(filt.map((v) => v / mf) as [number, number, number], gain * att);
  return [a, b];
}

/** Colores de la llama base (sin y con vidrio de cobalto) a partir de su espectro. También los usa la Práctica 4. */
export function computeFlameColors(w: FlameWorld, ctx: FlameContext): FlameColors {
  const base = flameBaseSpectrum(w, ctx);
  const exp = w.params.exposure;
  const o = observe(base, exp);
  const of = observe(applyFilter(base, ctx.cobalt, w.glass.cleanliness), exp);
  const ch = emptySpectrum();
  addComponents(ch, ctx.blueFlame, 0.02);
  const c1 = observe(ch, exp);
  const c2 = observe(applyFilter(ch, ctx.cobalt, w.glass.cleanliness), exp);
  const [body, bodyF] = huePair(o.displayRgb, of.displayRgb, 1);
  const [inner, innerF] = huePair(c1.displayRgb, c2.displayRgb, 1);
  return { body, bodyF, inner, innerF };
}

/**
 * Lo que necesitan las vistas de la llama y de la manguera (`FlameView`, `HoseView`): FlameLab3D lo cumple, y la
 * Práctica 4 lo aporta con su sub-mundo del mechero.
 */
export interface BurnerViewSource {
  frame(t: number, dt: number): FrameCtx3;
  runtime: { world: FlameWorld; ctx: FlameContext };
  hitMeshes: Set<THREE.Mesh>;
  host: { getSelected(): string | null };
}

export class FlameLab3D {
  controller: FlameController;
  audio = new FlameAudio();
  camera: CameraApi3 | null = null;
  quality: QualityLevel;
  physicsActive = new Set<string>();
  hitMeshes = new Set<THREE.Mesh>();
  stats: RenderStats = { fps: 0, calls: 0, triangles: 0, geometries: 0 };
  contextLost = false;
  rebuildScene: (() => void) | null = null;
  three: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera } | null = null;
  savedView: { target: [number, number, number]; pos: [number, number, number] } | null = null;
  playback = { paused: false, speed: 1 };
  /** Se llama cada fotograma después de la interacción (lo usa la demostración para conducir la escena). */
  onFrame: ((dt: number) => void) | null = null;
  /** Mano de la demostración (cm de mesada; `down` = pulsando); null = oculta. */
  demoCursor: { x: number; y: number; z: number; down: boolean } | null = null;
  /** La demostración controla la escena: el puntero y el teclado del usuario no manipulan objetos (la cámara sí). */
  locked = false;
  /** Rectángulo del vidrio de cobalto en coordenadas de escena (lo actualiza su vista cada fotograma). */
  glass: GlassUniforms = { on: false, center: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1), halfW: 4.5, halfH: 4.5 };
  camPos = new THREE.Vector3();
  private frameCtx: FrameCtx3 | null = null;
  private frameStamp = -1;
  private colorKey = '';
  private colors: FlameColors = { body: [0, 0, 0], bodyF: [0, 0, 0], inner: [0, 0, 0], innerF: [0, 0, 0] };

  constructor(public host: FlameHost, quality: QualityLevel) {
    this.quality = quality;
    this.controller = new FlameController(host, this);
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

  /** Colores de la llama base a partir de su espectro (con y sin vidrio de cobalto). */
  private flameColors(): FlameColors {
    const w = this.runtime.world;
    const f = w.burner.flame;
    const key = `${w.burner.flameState}|${f.fuelFlow.toFixed(2)}|${f.airMix.toFixed(2)}|${w.glass.cleanliness.toFixed(2)}`;
    if (key === this.colorKey) return this.colors;
    this.colorKey = key;
    this.colors = computeFlameColors(w, this.runtime.ctx);
    return this.colors;
  }

  frame(t: number, dt: number): FrameCtx3 {
    if (this.frameCtx && this.frameStamp === t) return this.frameCtx;
    const rt = this.runtime;
    const c = this.controller;
    this.frameCtx = {
      world: rt.world,
      t,
      dt,
      held: c.held?.id ?? null,
      selected: this.host.getSelected(),
      hovered: c.hovered,
      reducedMotion: this.host.reducedMotion(),
      mats: materials(this.quality),
      quality: this.quality,
      emitters: activeEmitters(rt.world, rt.ctx),
      colors: this.flameColors(),
      glass: this.glass,
      camPos: this.camPos,
      partMode: !!this.host.pendingPartLabel(),
      clampReady: c.clampReady,
    };
    this.frameStamp = t;
    return this.frameCtx;
  }

  profile() {
    return QUALITY[this.quality];
  }
}

export { toLinear };
