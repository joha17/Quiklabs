/**
 * Escena 3D de la práctica B01 (React Three Fiber) con la sala, luces y cámara de las demás prácticas y materiales
 * realistas. Orden de cada fotograma: dominio con paso fijo → interacción → vistas → efectos
 * (charco de lo derramado). Los objetos se apoyan donde el controlador los deja; la sala conserva sus colisionadores.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { OpticalLabContext, useOpticalLab } from './context';
import type { OpticalLab3D } from './OpticalLab3D';
import { createObjVisualB01 } from './objects3d';
import { CameraRigB01 } from './CameraRigB01';
import { Environment, Lights, Room } from '../scene/LabScene';
import { GRAVITY, fromScene, toScene } from '../units';
import { QUALITY, pickQuality, type QualityLevel, type QualitySetting } from '../quality';
import { demoPointerTexture, nameTagTexture } from '../renderers/textures';
import { LinearGrab, RotaryGrab, partFrame } from './gestures';
import { gripKey, type HitData } from './parts';
import type { PickHitB01 } from './controller';

/** Tolerancia de agarre (cm): si el rayo toca el cuerpo justo delante de una pieza, se toma la pieza. */
const PART_TOLERANCE_CM = 1.5;

// ─────────────────────────── Avance del dominio, interacción y audio ───────────────────────────

function Driver() {
  const lab = useOpticalLab();
  useFrame((_, dtRaw) => {
    if (lab.playback.paused) return;
    const dt = Math.min(dtRaw, 0.1) * lab.playback.speed;
    const rt = lab.runtime;
    // La aceleración del tiempo se suspende mientras se manipula algo o baja el cubreobjetos (§6.7).
    const busy = !!lab.controller.held || !!lab.controller.lowering;
    const scale = rt.timeScale;
    if (busy) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
    const w = rt.world;
    lab.audio.ambient({ unlitFlow: 0, lit: false, blueness: 0, flow: 0, abnormal: 0, alarm: false, pouring: 0, mgBurning: false });
    void w;
  });
  return null;
}

// ─────────────────────────── Objetos ───────────────────────────

function registerHits(lab: OpticalLab3D, root: THREE.Object3D) {
  const added: THREE.Mesh[] = [];
  root.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.userData?.objId) {
      lab.hitMeshes.add(m);
      added.push(m);
    }
  });
  return () => {
    for (const m of added) lab.hitMeshes.delete(m);
  };
}

function ObjView({ id }: { id: string }) {
  const lab = useOpticalLab();
  const w0 = lab.runtime.world;
  const quality = lab.quality;
  const visual = useMemo(() => {
    const v = createObjVisualB01(w0.objects[id], w0, quality, lab.host.nameTag(id));
    return v;
  }, [id, quality]);
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  useFrame((state, dt) => {
    const o = lab.runtime.world.objects[id];
    if (o) visual.update(lab.frame(state.clock.elapsedTime, dt), o);
  });
  return <primitive object={visual.group} />;
}

function Objects() {
  const lab = useOpticalLab();
  const ids = Object.keys(lab.runtime.world.objects);
  return <>{ids.map((id) => <ObjView key={id} id={id} />)}</>;
}

// ─────────────────────────── Chorro, gotas y charcos ───────────────────────────

function Effects() {
  const lab = useOpticalLab();
  const puddle = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshPhysicalMaterial({ color: 0xa9cbe6, transparent: true, opacity: 0.45, roughness: 0.02 }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    return m;
  }, []);
  useEffect(() => () => {
    puddle.geometry.dispose();
    (puddle.material as THREE.Material).dispose();
  }, [puddle]);
  useFrame(() => {
    const w = lab.runtime.world;
    const ml = w.benchSpillMl;
    puddle.visible = ml > 0.005;
    if (!puddle.visible) return;
    const prep = Object.values(w.objects).find((o) => o.support === 'prep' || o.support === 'stage');
    const at = prep ? (prep.support === 'stage' ? { x: 280, y: 30, z: 14 } : prep.pose) : { x: 140, y: 24, z: 0.8 };
    puddle.position.set(at.x + 3.2, (at.z ?? 0) + 0.06, -at.y + 1.5);
    const r = Math.min(4, 0.6 + Math.sqrt(ml) * 6);
    puddle.scale.set(r, r, 1);
  });
  return <primitive object={puddle} />;
}

// ─────────────────────────── Etiquetas ───────────────────────────

const TAG_Z: Record<string, number> = {
  microscope: 42, stereo: 38, slideCase: 7, slide: 2, fixedSlide: 3, coverslip: 1.5, coverBox: 3, forceps: 2, scalpel: 2, dropperBottle: 12, paper: 2, lensPaper: 2, towel: 2,
  elodeaDish: 4, prepBoard: 2, leafSample: 2, insectSample: 2, sampleTray: 3, cleanTray: 3, glassBin: 17, bioWaste: 17, ppeTray: 5,
};
const HIDE_TAGS = new Set(['coverslip']);

function NameTags() {
  const lab = useOpticalLab();
  const root = useMemo(() => new THREE.Group(), []);
  const slots = useRef(new Map<string, { sprite: THREE.Sprite; key: string; aspect: number }>());
  const camPos = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const show = lab.host.showNames();
    root.visible = show;
    if (!show) return;
    const w = lab.runtime.world;
    camera.getWorldPosition(camPos);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 38;
    const cmPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, size.height);
    const seen = new Set<string>();
    const sel = lab.host.getSelected();
    for (const o of Object.values(w.objects)) {
      if (HIDE_TAGS.has(o.kind)) continue;
      // Lo que está dentro de otro (pipeta, termómetro, pera, cilindro sobre el vidrio): solo la etiqueta del seleccionado.
      // Lo que está dentro de otro recipiente (gotero, espátula, termómetro, condensador): solo si se selecciona.
      const inside = o.support === 'fc' || o.support.startsWith('case:') || o.support === 'coverBox';
      if (inside && sel !== o.id && lab.controller.hovered !== o.id) continue;
      seen.add(o.id);
      let slot = slots.current.get(o.id);
      if (!slot) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
        sprite.renderOrder = 20;
        root.add(sprite);
        slot = { sprite, key: '', aspect: 1 };
        slots.current.set(o.id, slot);
      }
      const text = lab.host.nameTag(o.id);
      const isSel = sel === o.id;
      const key = `${text}|${isSel}`;
      if (slot.key !== key) {
        slot.key = key;
        slot.sprite.material.map?.dispose();
        const tex = nameTagTexture(text, isSel);
        slot.sprite.material.map = tex;
        slot.sprite.material.needsUpdate = true;
        slot.aspect = (tex.image as HTMLCanvasElement).width / (tex.image as HTMLCanvasElement).height;
      }
      const lying = o.support === 'bench' && false;
      const p = toScene(o.pose.x, o.pose.y, o.pose.z + (lying ? 3 : TAG_Z[o.kind] ?? 6));
      slot.sprite.position.set(...p);
      const d = camPos.distanceTo(slot.sprite.position);
      const h = Math.max(1.0, 16 * cmPerPx * d);
      slot.sprite.scale.set(h * slot.aspect, h, 1);
    }
    for (const [sid, s] of slots.current) {
      if (!seen.has(sid)) {
        root.remove(s.sprite);
        s.sprite.material.map?.dispose();
        s.sprite.material.dispose();
        slots.current.delete(sid);
      }
    }
  });
  return <primitive object={root} />;
}

function DemoCursor() {
  const lab = useOpticalLab();
  const tex = useMemo(() => ({ up: demoPointerTexture(false), down: demoPointerTexture(true) }), []);
  const sprite = useMemo(() => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.up, transparent: true, depthTest: false, depthWrite: false }));
    sp.renderOrder = 22;
    sp.center.set(30 / 128, 1 - 30 / 128);
    return sp;
  }, [tex]);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const c = lab.demoCursor;
    sprite.visible = !!c;
    if (!c) return;
    const map = c.down ? tex.down : tex.up;
    if (sprite.material.map !== map) {
      sprite.material.map = map;
      sprite.material.needsUpdate = true;
    }
    sprite.position.set(...toScene(c.x, c.y, c.z));
    camera.getWorldPosition(camPos);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 38;
    const cmPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, size.height);
    const h = Math.max(2.4, 34 * cmPerPx * camPos.distanceTo(sprite.position));
    sprite.scale.set(h, h, 1);
  });
  return <primitive object={sprite} />;
}

// ─────────────────────────── Puente de interacción ───────────────────────────

function Bridge() {
  const lab = useOpticalLab();
  const { camera, gl, size } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPt = new THREE.Vector3();
    const setRay = (sx: number, sy: number) => {
      ndc.set((sx / size.width) * 2 - 1, -(sy / size.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    const visibleChain = (o: THREE.Object3D | null): boolean => {
      for (let p = o; p; p = p.parent) if (!p.visible && !(p as THREE.Mesh).userData?.objId) return false;
      return true;
    };
    const c = lab.controller;
    const project = (p: THREE.Vector3) => {
      const v = p.clone().project(camera);
      return new THREE.Vector2(((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height);
    };
    const toHit = (h: THREE.Intersection): PickHitB01 => {
      const data = h.object.userData as HitData;
      const grip = data.grip;
      const mesh = h.object;
      const point = h.point.clone();
      return {
        id: data.objId, part: data.part, grip,
        track: grip && grip.kind !== 'press' ? (sx0, sy0) => {
          const { pivot, axis } = partFrame(mesh, grip.axis);
          if (grip.kind === 'linear') return new LinearGrab(point, axis, project, sx0, sy0);
          const geo = (mesh as THREE.Mesh).geometry;
          if (!geo.boundingSphere) geo.computeBoundingSphere();
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          return new RotaryGrab(grip.kind, pivot, axis, point, dir, (geo.boundingSphere?.radius ?? 1) * 0.6, project, sx0, sy0);
        } : undefined,
      };
    };
    c.view = {
      toBench(sx, sy, z) {
        setRay(sx, sy);
        plane.constant = -z;
        const p = ray.ray.intersectPlane(plane, hitPt);
        if (!p) return { x: 0, y: 0 };
        const b = fromScene(p.x, p.y, p.z);
        return { x: b.x, y: b.y };
      },
      pick(sx, sy, exclude) {
        setRay(sx, sy);
        const hits = ray.intersectObjects([...lab.hitMeshes], false).filter((h) => {
          const id = h.object.userData.objId as string;
          return !!id && id !== exclude && visibleChain(h.object.parent);
        });
        const first = hits[0];
        if (!first) return null;
        // El cuerpo del equipo no tapa la pieza que está justo detrás de su borde (agarre discreto, no flotante).
        if (!first.object.userData.part) {
          const near = hits.find((h) => h.object.userData.part && h.object.userData.objId === first.object.userData.objId && h.distance - first.distance <= PART_TOLERANCE_CM);
          if (near) return toHit(near);
        }
        return toHit(first);
      },
      partAnchor(id, part) {
        for (const m of lab.hitMeshes) {
          const d = m.userData as HitData;
          if (d.objId !== id || d.part !== part) continue;
          m.updateWorldMatrix(true, false);
          const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
          return fromScene(p.x, p.y, p.z);
        }
        return null;
      },
      viewW: () => size.width,
      setOrbitEnabled: (on) => lab.camera?.setOrbitEnabled(on),
      edgePan: (dir, dt) => lab.camera?.edgePan(dir, dt),
    };
    const el = gl.domElement;
    const host = el.parentElement ?? el;
    const tip = document.createElement('div');
    tip.className = 'part-tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;
    host.appendChild(tip);
    let tipKey = '';
    const showHover = (x: number, y: number) => {
      const d = c.partDrag;
      const hp = d ? { id: d.id, part: d.part, grip: d.grip } : c.held ? null : c.hoverPart;
      el.style.cursor = d ? 'grabbing' : hp?.grip ? (hp.grip.kind === 'press' ? 'pointer' : 'grab') : '';
      if (!hp?.part) {
        tip.hidden = true;
        return;
      }
      const key = gripKey(hp.id, hp.part);
      if (key !== tipKey) {
        tipKey = key;
        const txt = lab.host.t(key);
        tip.textContent = txt === key ? lab.host.t(`b01.part.${hp.id}_${hp.part}`) : txt;
      }
      tip.hidden = false;
      tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`;
    };
    const onLeave = () => {
      tip.hidden = true;
      el.style.cursor = '';
    };
    const rel = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const p = rel(e);
      (host as HTMLElement).closest<HTMLElement>('.canvas-host')?.focus({ preventScroll: true });
      if (lab.locked) return;
      if (e.button === 2) {
        if (c.held) {
          c.primary(true);
          e.stopPropagation();
        }
        return;
      }
      if (c.onPointerDown(p.x, p.y, e.button)) {
        e.stopPropagation();
        el.setPointerCapture?.(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (lab.locked) return;
      const p = rel(e);
      if (e.button === 2) return;
      if (e.button === 0 && !(e.buttons & 1) && (c.held && !c.held.keyboard || c.partDrag)) {
        c.onPointerUp();
        return;
      }
      c.onPointerMove(p.x, p.y);
      if (e.target === el || c.partDrag) showHover(p.x, p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (lab.locked) return;
      if (e.button === 2) return;
      c.onPointerUp();
      const p = rel(e);
      showHover(p.x, p.y);
    };
    const onWheel = (e: WheelEvent) => {
      if (!lab.locked && c.onWheel(e.deltaY)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onDbl = (e: MouseEvent) => {
      const p = rel(e);
      const hit = c.view?.pick(p.x, p.y, null);
      if (hit) {
        if (hit.id === 'mic' || hit.id === 'ste') lab.camera?.eyeLevel(hit.id);
        else lab.camera?.focusObject(hit.id, true);
      }
    };
    const onMenu = (e: Event) => e.preventDefault();
    const onLost = (e: Event) => {
      e.preventDefault();
      lab.contextLost = true;
      lab.host.notify('warn', 'hint.contextLost');
    };
    const onRestored = () => {
      lab.contextLost = false;
      lab.host.notify('info', 'hint.contextRestored');
      lab.rebuildScene?.();
    };
    host.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    host.addEventListener('wheel', onWheel, { capture: true, passive: false });
    host.addEventListener('dblclick', onDbl);
    el.addEventListener('pointerleave', onLeave);
    host.addEventListener('contextmenu', onMenu);
    el.addEventListener('webglcontextlost', onLost);
    el.addEventListener('webglcontextrestored', onRestored);
    return () => {
      host.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      host.removeEventListener('wheel', onWheel, { capture: true });
      host.removeEventListener('dblclick', onDbl);
      el.removeEventListener('pointerleave', onLeave);
      tip.remove();
      host.removeEventListener('contextmenu', onMenu);
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [lab, camera, gl, size.width, size.height]);
  return null;
}

function PerfProbe({ setting, onQuality }: { setting: QualitySetting; onQuality: (q: QualityLevel) => void }) {
  const lab = useOpticalLab();
  const { gl } = useThree();
  const acc = useRef({ frames: 0, time: 0, total: 0, probeFrames: 0, probeTime: 0, decided: false });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.time += dt;
    a.total += dt;
    if (a.total > 4) {
      a.probeFrames++;
      a.probeTime += dt;
    }
    if (a.time >= 1) {
      lab.stats = { fps: Math.round(a.frames / a.time), calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries };
      a.frames = 0;
      a.time = 0;
    }
    if (!a.decided && !lab.controller.held && a.probeTime >= 3 && setting === 'AUTO') {
      a.decided = true;
      const next = pickQuality(a.probeFrames / a.probeTime, lab.quality);
      if (next !== lab.quality) onQuality(next);
    }
  });
  return null;
}

export function OpticalScene({ lab, setting }: { lab: OpticalLab3D; setting: QualitySetting }) {
  const [auto, setAuto] = useState<QualityLevel>(lab.quality);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    lab.rebuildScene = () => setEpoch((e) => e + 1);
    return () => {
      lab.rebuildScene = null;
    };
  }, [lab]);
  const q: QualityLevel = setting === 'AUTO' ? auto : setting;
  lab.quality = q;
  const p = QUALITY[q];
  return (
    <Canvas
      key={`${q}:${epoch}`}
      shadows={p.shadows ? 'soft' : false}
      dpr={[1, p.maxDpr]}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: 38, near: 1, far: 3000, position: [80, 40, 60] }}
      onCreated={({ gl, scene, camera }) => {
        lab.three = { gl, scene, camera };
        gl.localClippingEnabled = true;
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 0.9;
      }}
      data-testid="lab-3d"
    >
      <OpticalLabContext.Provider value={lab}>
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} colliders={false}>
          <Room q={q} variant={(lab.host.roomVariant ?? 'b01') as 'b01'} />
        </Physics>
        <Objects />
        <Effects />
        <NameTags />
        <DemoCursor />
        <CameraRigB01 />
        <Bridge />
        <PerfProbe setting={setting} onQuality={setAuto} />
      </OpticalLabContext.Provider>
    </Canvas>
  );
}
