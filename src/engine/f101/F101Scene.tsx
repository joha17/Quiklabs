/**
 * Escena 3D de F101 (React Three Fiber): misma sala, luces y orbitador que las demás prácticas. Orden de cada
 * fotograma: dominio con paso fijo → interacción → vistas → efectos (salpicadura al soltar una pieza en la probeta).
 * La escena además resuelve, con un rayo real, si un sólido tapa el menisco entre el ojo y la probeta (E25).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { solidFloorOf, solidPushOf } from '../interaction/solidFloor';
import { F101LabContext, useF101Lab } from './context';
import type { F101Lab3D } from './F101Lab3D';
import { createObjVisualF } from './objects3d';
import { CameraRigF101 } from './CameraRigF101';
import { Environment, Lights, Room } from '../scene/LabScene';
import { GRAVITY, fromScene, toScene } from '../units';
import { QUALITY, pickQuality, type QualityLevel, type QualitySetting } from '../quality';
import { demoPointerTexture, nameTagTexture } from '../renderers/textures';
import { gradCylMouth, meniscusZ } from './layout';
import { TABLE_CENTER } from '../../simulation/f101-world/geometry';

function Driver() {
  const lab = useF101Lab();
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

function registerHits(lab: F101Lab3D, root: THREE.Object3D) {
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
  const lab = useF101Lab();
  const w0 = lab.runtime.world;
  const quality = lab.quality;
  const visual = useMemo(() => createObjVisualF(w0.objects[id], w0, quality), [id, quality]);
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  useFrame((state, dt) => {
    const o = lab.runtime.world.objects[id];
    if (o) visual.update(lab.frame(state.clock.elapsedTime, dt), o);
  });
  return <primitive object={visual.group} />;
}

function Objects() {
  const lab = useF101Lab();
  const ids = Object.keys(lab.runtime.world.objects);
  return <>{ids.map((id) => <ObjView key={id} id={id} />)}</>;
}

/** Gotas que saltan de la probeta cuando una pieza entra desde demasiado alto (solo visual, del estado). */
function Splash() {
  const lab = useF101Lab();
  const pts = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, color: 0x7fb6e0, transparent: true, opacity: 0.9, depthWrite: false }));
    p.frustumCulled = false;
    return p;
  }, []);
  const st = useRef({ bench: 0, drops: [] as Array<{ p: THREE.Vector3; v: THREE.Vector3 }> });
  useEffect(
    () => () => {
      pts.geometry.dispose();
      (pts.material as THREE.Material).dispose();
    },
    [pts],
  );
  useFrame((_, dt) => {
    const w = lab.runtime.world;
    const s = st.current;
    if (w.water.benchMl > s.bench + 0.05 && !lab.host.reducedMotion()) {
      const m = gradCylMouth(w);
      const z = meniscusZ(w);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        s.drops.push({ p: new THREE.Vector3(...toScene(m.x, m.y, z)), v: new THREE.Vector3(Math.cos(a) * 18, 40 + (i % 3) * 8, Math.sin(a) * 18) });
      }
    }
    s.bench = w.water.benchMl;
    for (const d of s.drops) {
      d.v.y -= 980 * dt;
      d.p.addScaledVector(d.v, dt);
    }
    s.drops = s.drops.filter((d) => d.p.y > 0).slice(-24);
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
    s.drops.forEach((d, i) => pos.setXYZ(i, d.p.x, d.p.y, d.p.z));
    pts.geometry.setDrawRange(0, s.drops.length);
    pos.needsUpdate = true;
  });
  return <primitive object={pts} />;
}

const TAG_Z: Record<string, number> = {
  gaugeBlock: 3, massStd: 6, metalCyl: 8, steelBall: 4, tissue: 3, level: 4, returnTray: 5, caliper: 3, micrometer: 8, ruler: 3,
  balance: 12, dish: 4, gradCyl: 23, forceTable: 34, hanger: 12, massRack: 9, dynamometer: 5, sensorBox: 8,
};
const HIDE_TAGS = new Set(['pulley', 'slotMass']);

function NameTags() {
  const lab = useF101Lab();
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
      if (o.support !== 'bench' && o.support !== 'hand' && sel !== o.id && lab.controller.hovered !== o.id) continue;
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
      const base = o.kind === 'forceTable' ? { x: TABLE_CENTER.x, y: TABLE_CENTER.y - 18, z: 0 } : o.pose;
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
  const lab = useF101Lab();
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

const EYE: Record<string, 'caliper01' | 'micrometer01' | 'gradCyl01' | 'balance01' | 'dynamometer01' | 'forceTable01' | 'ruler01'> = {
  caliper01: 'caliper01', micrometer01: 'micrometer01', gradCyl01: 'gradCyl01', balance01: 'balance01', dynamometer01: 'dynamometer01', forceTable01: 'forceTable01', ruler01: 'ruler01',
};

function Bridge() {
  const lab = useF101Lab();
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
    c.view = {
      toBench(sx, sy, z) {
        setRay(sx, sy);
        plane.constant = -z;
        const p = ray.ray.intersectPlane(plane, hitPt);
        if (!p) return { x: 0, y: 0 };
        const b = fromScene(p.x, p.y, p.z);
        return { x: b.x, y: b.y };
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
    // Rayo real del ojo al menisco: ¿lo tapa otro sólido (una pieza, la mano, otro instrumento)?
    const occRay = new THREE.Raycaster();
    const eye = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    lab.occluded = (x, y, z, except) => {
      camera.getWorldPosition(eye);
      tgt.set(...toScene(x, y, z));
      const dir = tgt.clone().sub(eye);
      const dist = dir.length();
      occRay.set(eye, dir.normalize());
      occRay.far = Math.max(0, dist - 1.5);
      const hits = occRay.intersectObjects([...lab.hitMeshes], false);
      return hits.some((h) => {
        const id = h.object.userData.objId as string;
        return id && id !== except && !lab.runtime.world.gradCyl.parts.includes(id) && visibleChain(h.object.parent);
      });
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
      else if (hit.id.startsWith('pulley')) lab.camera?.eyeLevel('forceTable01');
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
      lab.occluded = null;
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
  const lab = useF101Lab();
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

export function F101Scene({ lab, setting }: { lab: F101Lab3D; setting: QualitySetting }) {
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
      <F101LabContext.Provider value={lab}>
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} colliders={false}>
          <Room q={q} variant="f101" />
        </Physics>
        <Objects />
        <Splash />
        <NameTags />
        <DemoCursor />
        <CameraRigF101 />
        <Bridge />
        <PerfProbe setting={setting} onQuality={setAuto} />
      </F101LabContext.Provider>
    </Canvas>
  );
}
