/**
 * Escena 3D de F06 (React Three Fiber): misma sala, luces y orbitador que las demás prácticas. Orden de cada
 * fotograma: dominio con paso fijo → interacción → vistas. El soporte del resorte con su regla, el estante de pesas y
 * la balanza ocupan el extremo izquierdo; el riel de 180 cm con el lanzador, las compuertas y el tramo de pérdidas va
 * en el centro, delante, con el registrador detrás; el péndulo oscila en el fondo derecho.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { solidFloorOf, solidPushOf } from '../interaction/solidFloor';
import { F06LabContext, useF06Lab } from './context';
import type { EyeTargetF6, F06Lab3D } from './F06Lab3D';
import { createObjVisualF } from './objects3d';
import { CameraRigF06 } from './CameraRigF06';
import { Environment, Lights, Room } from '../scene/LabScene';
import { GRAVITY, fromScene, toScene } from '../units';
import { QUALITY, pickQuality, type QualityLevel, type QualitySetting } from '../quality';
import { demoPointerTexture, nameTagTexture } from '../renderers/textures';
import { objRoom } from './layout';

function Driver() {
  const lab = useF06Lab();
  useFrame((_, dtRaw) => {
    if (lab.playback.paused) return;
    const dt = Math.min(dtRaw, 0.1) * lab.playback.speed;
    const rt = lab.runtime;
    const scale = rt.timeScale;
    if (lab.controller.held) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
  });
  return null;
}

function registerHits(lab: F06Lab3D, root: THREE.Object3D) {
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
  const lab = useF06Lab();
  const w0 = lab.runtime.world;
  const quality = lab.quality;
  const visual = useMemo(() => createObjVisualF(w0.objects[id], w0, quality, () => lab.controller.ghost), [id, quality]);
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  useFrame((state, dt) => {
    const o = lab.runtime.world.objects[id];
    if (o) visual.update(lab.frame(state.clock.elapsedTime, dt), o);
  });
  return <primitive object={visual.group} />;
}

function Objects() {
  const lab = useF06Lab();
  const ids = Object.keys(lab.runtime.world.objects);
  return <>{ids.map((id) => <ObjView key={id} id={id} />)}</>;
}

const TAG_Z: Record<string, number> = {
  stand: 132, ruler: 80, spring: 4, hanger: 9, slotMass: 3, massRack: 8, balance: 9, track: 10, launcher: 10, cart: 14, cartMass: 3, brake: 6, gauge: 64,
  gate: 16, pad: 4, damper: 5, forceSensor: 5, posSensor: 4, logger: 10, pendulum: 12, angleSensor: 6,
};
const HIDE_TAGS = new Set(['slotMass', 'cartMass', 'pad', 'damper', 'spring']);
/** Aparatos montados (no están «sobre la mesada») cuyo nombre igual se muestra. */
const MOUNTED_TAGS = new Set(['stand', 'ruler', 'track', 'launcher', 'cart', 'gate', 'gauge', 'logger', 'balance', 'massRack', 'pendulum', 'forceSensor', 'brake', 'hanger']);

function tagBase(w: Parameters<typeof objRoom>[0], o: { id: string; kind: string; pose: { x: number; y: number; z: number } }) {
  if (o.kind === 'stand') return { x: o.pose.x, y: o.pose.y, z: 0 };
  if (o.kind === 'ruler' || o.kind === 'gauge') return { ...objRoom(w, o.id), z: 0 };
  if (o.kind === 'pendulum') return { x: o.pose.x, y: o.pose.y, z: 140 - 12 };
  return w.objects[o.id].support === 'hand' ? o.pose : objRoom(w, o.id);
}

function NameTags() {
  const lab = useF06Lab();
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
      if (HIDE_TAGS.has(o.kind) && sel !== o.id) continue;
      if (o.support !== 'bench' && o.support !== 'hand' && !MOUNTED_TAGS.has(o.kind) && sel !== o.id && lab.controller.hovered !== o.id) continue;
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
      const base = tagBase(w, o);
      slot.sprite.position.set(...toScene(base.x, base.y, base.z + (TAG_Z[o.kind] ?? 6)));
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
  const lab = useF06Lab();
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

const EYE: Record<string, EyeTargetF6> = { ruler01: 'ruler01', gauge01: 'gauge01', pend01: 'pendScale', balance01: 'balance01', logger01: 'logger01', cart01: 'cart01', launcher01: 'launcher01' };

function Bridge() {
  const lab = useF06Lab();
  const { camera, gl, size } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const wall = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
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
    c.view = {
      toBench(sx, sy, z) {
        setRay(sx, sy);
        plane.constant = -z;
        const p = ray.ray.intersectPlane(plane, hitPt);
        if (!p) return { x: 0, y: 0 };
        const b = fromScene(p.x, p.y, p.z);
        return { x: b.x, y: b.y };
      },
      toWall(sx, sy, y) {
        setRay(sx, sy);
        // Plano vertical y = const de la mesada (z de la escena = −y).
        wall.constant = y;
        const p = ray.ray.intersectPlane(wall, hitPt);
        if (!p) return { x: 0, z: 0 };
        const b = fromScene(p.x, p.y, p.z);
        return { x: b.x, z: b.z };
      },
      solidPush(id, cur, x, y, resting, grounded, point) {
        return solidPushOf(lab.hitMeshes, id, cur, x, y, resting, grounded, point);
      },
      solidFloor(id, cur, x, y, resting) {
        return solidFloorOf(lab.hitMeshes, id, cur, x, y, resting);
      },
      pick(sx, sy, exclude) {
        setRay(sx, sy);
        const hits = ray.intersectObjects([...lab.hitMeshes], false);
        for (const h of hits) {
          const id = h.object.userData.objId as string;
          if (!id || id === exclude || !visibleChain(h.object.parent)) continue;
          return { id, part: h.object.userData.part as string | undefined };
        }
        return null;
      },
      viewW: () => size.width,
      setOrbitEnabled: (on) => lab.camera?.setOrbitEnabled(on),
      edgePan: (dir, dt) => lab.camera?.edgePan(dir, dt),
    };
    const el = gl.domElement;
    const host = el.parentElement ?? el;
    const rel = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const p = rel(e);
      (host as HTMLElement).closest<HTMLElement>('.canvas-host')?.focus({ preventScroll: true });
      if (lab.locked || e.button !== 0) return;
      if (c.onPointerDown(p.x, p.y, e.button)) {
        e.stopPropagation();
        el.setPointerCapture?.(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (lab.locked) return;
      const p = rel(e);
      if (!(e.buttons & 1) && c.held && !c.held.keyboard) {
        c.onPointerUp();
        return;
      }
      c.onPointerMove(p.x, p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (lab.locked || e.button !== 0) return;
      c.onPointerUp();
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
      if (!hit) return;
      if (EYE[hit.id]) lab.camera?.eyeLevel(EYE[hit.id]);
      else lab.camera?.focusObject(hit.id, true);
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
    host.addEventListener('contextmenu', onMenu);
    el.addEventListener('webglcontextlost', onLost);
    el.addEventListener('webglcontextrestored', onRestored);
    return () => {
      host.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      host.removeEventListener('wheel', onWheel, { capture: true });
      host.removeEventListener('dblclick', onDbl);
      host.removeEventListener('contextmenu', onMenu);
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [lab, camera, gl, size.width, size.height]);
  return null;
}

function PerfProbe({ setting, onQuality }: { setting: QualitySetting; onQuality: (q: QualityLevel) => void }) {
  const lab = useF06Lab();
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

export function F06Scene({ lab, setting }: { lab: F06Lab3D; setting: QualitySetting }) {
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
      <F06LabContext.Provider value={lab}>
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} colliders={false}>
          <Room q={q} variant="f06" />
        </Physics>
        <Objects />
        <NameTags />
        <DemoCursor />
        <CameraRigF06 />
        <Bridge />
        <PerfProbe setting={setting} onQuality={setAuto} />
      </F06LabContext.Provider>
    </Canvas>
  );
}
