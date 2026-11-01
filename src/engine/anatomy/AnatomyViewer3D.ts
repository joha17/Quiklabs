/**
 * Visor 3D de B10 (§4.7, §6.5): su propio lienzo, con un modelo o dos lado a lado. Lee la orientación y el zoom del dominio, nunca al
 * revés: el arrastre se convierte en un comando y el comando vuelve aquí como pose. Dibuja solo cuando algo cambia, para no gastar GPU.
 * La selección usa un rayo sobre las mallas con `region`; nunca decide si el rótulo es correcto.
 */
import * as THREE from 'three';
import { modelById, regionVisible, type AnatomyRegion } from '../../simulation/animal-world/catalog';
import { Kit } from './kit';
import { SPECIMEN_BUILDERS } from './specimens';
import { buildTrack } from './tracks';

export interface ViewerPose {
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
}

interface Slot {
  modelId: string;
  group: THREE.Group;
  pins: Map<string, THREE.Sprite>;
  meshes: Map<string, THREE.Mesh[]>;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  spanH: number;
  spanV: number;
  zoom: number;
  light: THREE.DirectionalLight;
}

/** Un cuerpo por modelo, construido una sola vez por visor. */
function buildBody(id: string): THREE.Group {
  if (modelById(id)?.group === 'track') return buildTrack(id);
  const kit = new Kit();
  SPECIMEN_BUILDERS[id]?.(kit);
  const holder = new THREE.Group();
  holder.add(kit.root);
  return holder;
}

function pinTexture(text: string, active: boolean) {
  const c = document.createElement('canvas');
  const wide = text.length > 1;
  c.width = wide ? 256 : 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = active ? '#b45309' : '#263238';
  g.beginPath();
  g.roundRect(2, 2, c.width - 4, 60, 28);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `bold ${wide ? 28 : 40}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class AnatomyViewer3D {
  private renderer: THREE.WebGLRenderer | null;
  private slots: Slot[] = [];
  private ray = new THREE.Raycaster();
  private dirty = true;
  private raf = 0;
  private width = 1;
  private height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x1d2528);
    this.renderer.autoClear = false;
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (this.dirty) this.draw();
    };
    tick();
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer?.setSize(this.width, this.height, false);
    this.dirty = true;
  }

  /** Modelos en pantalla; solo reconstruye lo que cambió. */
  setModels(ids: string[]) {
    if (this.slots.length === ids.length && this.slots.every((s, i) => s.modelId === ids[i])) return;
    for (const s of this.slots) this.disposeSlot(s);
    this.slots = ids.map((id) => this.createSlot(id));
    this.dirty = true;
  }

  private createSlot(modelId: string): Slot {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4238, 0.9));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    scene.add(light);
    const group = buildBody(modelId);
    scene.add(group);
    const meshes = new Map<string, THREE.Mesh[]>();
    group.traverse((o) => {
      const r = o.userData.region as string | null | undefined;
      if (o instanceof THREE.Mesh && r) meshes.set(r, [...(meshes.get(r) ?? []), o]);
    });
    const pins = new Map<string, THREE.Sprite>();
    for (const r of modelById(modelId)?.regions ?? []) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(r.id.toUpperCase(), false), depthTest: false, transparent: true }));
      sprite.scale.setScalar(0.62);
      sprite.renderOrder = 10;
      const box = new THREE.Box3();
      for (const m of meshes.get(r.id) ?? []) box.expandByObject(m);
      group.updateMatrixWorld(true);
      box.makeEmpty();
      for (const m of meshes.get(r.id) ?? []) box.expandByObject(m);
      const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
      group.worldToLocal(c);
      // Sobre la cara que mira afuera: la letra no queda enterrada en el modelo.
      const f = r.facing ?? [0, 0, 0];
      sprite.position.set(c.x + f[0] * 0.4, c.y + f[1] * 0.4, c.z + f[2] * 0.4);
      group.add(sprite);
      pins.set(r.id, sprite);
    }
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 22);
    // Encuadre: el tamaño de cada modelo decide la distancia, para que uno pequeño no quede perdido en el visor.
    const size = new THREE.Box3();
    group.updateMatrixWorld(true);
    for (const list of meshes.values()) for (const m of list) size.expandByObject(m);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) size.expandByObject(o);
    });
    const spanH = Math.hypot(Math.max(size.max.x, -size.min.x), Math.max(size.max.z, -size.min.z)) || 4;
    const spanV = Math.max(size.max.y, -size.min.y, spanH * 0.45) || 2;
    return { modelId, group, pins, meshes, scene, camera, light, spanH, spanV, zoom: 1 };
  }

  private disposeSlot(s: Slot) {
    s.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      } else if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }

  setPose(modelId: string, p: ViewerPose) {
    const s = this.slots.find((x) => x.modelId === modelId);
    if (!s) return;
    const track = modelById(modelId)?.group === 'track';
    // El modelo gira frente a la cámara, igual que lo calcula `viewVector` en el dominio. La huella siempre se mira de arriba.
    if (track) s.group.rotation.set(0.95 - (p.pitchDeg * Math.PI) / 180, (p.yawDeg * Math.PI) / 180, 0, 'XYZ');
    else s.group.rotation.set((p.pitchDeg * Math.PI) / 180, (-p.yawDeg * Math.PI) / 180, 0, 'XYZ');
    s.zoom = p.zoom;
    if (!track) s.light.position.set(4, 8, 10);
    this.syncPins(s, p);
    this.dirty = true;
  }

  private syncPins(s: Slot, p: ViewerPose) {
    const regs: AnatomyRegion[] = modelById(s.modelId)?.regions ?? [];
    for (const r of regs) {
      const sp = s.pins.get(r.id);
      // Una letra de una región de espaldas se atenúa: se puede saber que existe, no señalarla.
      if (sp) sp.material.opacity = regionVisible(r, p.yawDeg, p.pitchDeg) ? 1 : 0.25;
    }
  }

  /** Luz de la huella: acimut y elevación reales de la lámpara. */
  setTrackLight(modelId: string, azimuthDeg: number, elevationDeg: number) {
    const s = this.slots.find((x) => x.modelId === modelId);
    if (!s) return;
    const a = (azimuthDeg * Math.PI) / 180;
    const e = (elevationDeg * Math.PI) / 180;
    s.light.position.set(Math.cos(a) * Math.cos(e) * 10, Math.sin(e) * 10, Math.sin(a) * Math.cos(e) * 10);
    // Con la luz rasante el ambiente baja: lo que se lee es la sombra del relieve.
    (s.scene.children[0] as THREE.HemisphereLight).intensity = 0.25 + 0.5 * Math.sin(e);
    this.dirty = true;
  }

  /** Nombre de estudio junto a la letra, o resaltado de la región elegida. */
  decorate(modelId: string, selected: string | null, names: Record<string, string> | null) {
    const s = this.slots.find((x) => x.modelId === modelId);
    if (!s) return;
    for (const [id, sp] of s.pins) {
      const name = names?.[id];
      sp.material.map?.dispose();
      const text = name ? `${id.toUpperCase()} · ${name}` : id.toUpperCase();
      sp.material.map = pinTexture(text, id === selected);
      sp.material.needsUpdate = true;
      sp.scale.set(name ? 2.2 : 0.62, name ? 0.55 : 0.62, 1);
    }
    for (const [id, list] of s.meshes) {
      for (const m of list) {
        const material = m.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
        if (m.userData.pick) (material as THREE.MeshBasicMaterial).opacity = id === selected ? 0.28 : 0;
        else if ('emissive' in material) material.emissive.setHex(id === selected ? 0x7a4100 : 0x000000);
      }
    }
    this.dirty = true;
  }

  /** Región bajo el puntero (coordenadas 0–1 del lienzo). */
  pick(u: number, v: number): { modelId: string; regionId: string } | null {
    if (!this.slots.length) return null;
    const n = this.slots.length;
    const i = Math.min(n - 1, Math.floor(u * n));
    const s = this.slots[i];
    const lx = u * n - i;
    s.scene.updateMatrixWorld(true);
    this.ray.setFromCamera(new THREE.Vector2(lx * 2 - 1, 1 - v * 2), s.camera);
    const list: THREE.Object3D[] = [];
    s.group.traverse((o) => {
      if (o instanceof THREE.Mesh) list.push(o);
    });
    for (const h of this.ray.intersectObjects(list, false)) {
      const r = h.object.userData.region as string | null | undefined;
      if (r) return { modelId: s.modelId, regionId: r };
      // Un apoyo de la huella va debajo de su disco de selección: se sigue buscando.
      if (!h.object.userData.relief) return null;
    }
    return null;
  }

  private draw() {
    const rn = this.renderer;
    if (!rn) return;
    this.dirty = false;
    rn.setScissorTest(true);
    rn.clear();
    const n = this.slots.length || 1;
    const w = this.width / n;
    this.slots.forEach((s, i) => {
      rn.setViewport(i * w, 0, w, this.height);
      rn.setScissor(i * w, 0, w, this.height);
      s.camera.aspect = w / this.height;
      s.camera.updateProjectionMatrix();
      s.camera.position.z = (Math.max(s.spanH / s.camera.aspect, s.spanV) * 1.2) / Math.tan((16 * Math.PI) / 180) / s.zoom;
      rn.render(s.scene, s.camera);
    });
    rn.setScissorTest(false);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const s of this.slots) this.disposeSlot(s);
    this.slots = [];
    this.renderer?.dispose();
    this.renderer = null;
  }
}
