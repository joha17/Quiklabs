/**
 * Escena 3D de la Práctica 5 (React Three Fiber), con la misma sala, luces y cámara que las prácticas 2 a 4. Orden de
 * cada fotograma: dominio con paso fijo → interacción → vistas → efectos. El mechero (modelo, llama paramétrica y
 * manguera) es el de la Práctica 3, alimentado por el sub-mundo `gas`. Aquí no hay objetos que caigan con física:
 * todo se apoya donde el controlador lo deja (la sala sí conserva sus colisionadores).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { StoichLabContext, useStoichLab } from './context';
import type { StoichLab3D } from './StoichLab3D';
import { createObjVisual5 } from './objects3d';
import { CameraRig5 } from './CameraRig5';
import { FlameView, HoseView } from '../flame/FlameScene';
import { createObjVisual } from '../flame/objects3d';
import { Environment, Lights, Room } from '../scene/LabScene';
import { GRAVITY, fromScene, toScene } from '../units';
import { QUALITY, pickQuality, type QualityLevel, type QualitySetting } from '../quality';
import { demoPointerTexture, nameTagTexture, softDotTexture } from '../renderers/textures';
import { gasFlows, isLit } from '../../simulation/flame-world/world';
import { solidsMassG, tubeAxis } from '../../simulation/stoich-world/world';
import { MOLAR_MASS } from '../../simulation/stoichiometry/stoich';

// ─────────────────────────── Avance del dominio, interacción y audio ───────────────────────────

function Driver() {
  const lab = useStoichLab();
  useFrame((_, dtRaw) => {
    if (lab.playback.paused) return;
    const dt = Math.min(dtRaw, 0.1) * lab.playback.speed;
    const rt = lab.runtime;
    const w = rt.world;
    // La aceleración del tiempo se suspende mientras se manipula algo o salta la chispa.
    const busy = !!lab.controller.held || w.gas.lighter.sparking;
    const scale = rt.timeScale;
    if (busy) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
    const g = w.gas;
    const b = g.burner;
    const fl = gasFlows(g);
    lab.audio.ambient({
      unlitFlow: isLit(g) ? fl.leak : fl.burner + fl.leak,
      lit: isLit(g) && b.flameState !== 'FLASHBACK',
      blueness: b.flame.blueness,
      flow: b.flame.fuelFlow,
      abnormal: b.flameState === 'FLASHBACK' ? 1 : b.flameState === 'LIFTED' ? 0.8 : b.flame.stability < 0.6 && isLit(g) ? 0.4 : 0,
      alarm: g.room.alarm,
      pouring: 0,
      mgBurning: false,
    });
  });
  return null;
}

// ─────────────────────────── Objetos ───────────────────────────

function registerHits(lab: StoichLab3D, root: THREE.Object3D) {
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

function ObjView({ id, gas }: { id: string; gas: boolean }) {
  const lab = useStoichLab();
  const w0 = lab.runtime.world;
  const quality = lab.quality;
  const visual = useMemo(
    () => (gas ? createObjVisual(w0.gas.objects[id], quality, lab.host.nameTag(id)) : createObjVisual5(w0.objects[id], w0, quality, lab.host.nameTag(id))),
    [id, quality],
  );
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  useFrame((state, dt) => {
    const w = lab.runtime.world;
    const o = gas ? w.gas.objects[id] : w.objects[id];
    if (!o) return;
    if (gas) {
      const p = toScene(o.pose.x, o.pose.y, o.pose.z);
      visual.group.position.set(...p);
      visual.update(lab.gasFrame(state.clock.elapsedTime, dt) as never, o as never);
    } else (visual as ReturnType<typeof createObjVisual5>).update(lab.frame(state.clock.elapsedTime, dt), w.objects[id]);
  });
  return <primitive object={visual.group} />;
}

function Objects() {
  const lab = useStoichLab();
  const w = lab.runtime.world;
  const ids = Object.keys(w.objects);
  const gasIds = Object.keys(w.gas.objects);
  return (
    <>
      {ids.map((id) => <ObjView key={id} id={id} gas={false} />)}
      {gasIds.map((id) => <ObjView key={`g:${id}`} id={id} gas />)}
    </>
  );
}

// ─────────────────────────── Derrames, polvo expulsado, calor ───────────────────────────

const MAX_SPILLS = 48;
const MAX_PARTS = 90;

function Effects() {
  const lab = useStoichLab();
  const spills = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.9 });
    const m = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), mat, MAX_SPILLS);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPILLS * 3), 3);
    m.count = 0;
    m.receiveShadow = true;
    return m;
  }, []);
  const parts = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTS * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTS * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.45, map: softDotTexture(), vertexColors: true, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }, []);
  const st = useRef({ lost: 0, items: [] as Array<{ p: THREE.Vector3; v: THREE.Vector3; life: number; c: THREE.Color }>, haze: 0 });
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color() }), []);
  useEffect(
    () => () => {
      spills.geometry.dispose();
      (spills.material as THREE.Material).dispose();
      parts.geometry.dispose();
      (parts.material as THREE.Material).dispose();
    },
    [spills, parts],
  );
  useFrame((_, dt) => {
    const w = lab.runtime.world;
    // Polvo derramado sobre la mesada (el color dice qué es: blanco = clorato/cloruro, negro = MnO₂).
    let n = 0;
    for (const s of w.spills) {
      if (s.cleaned || n >= MAX_SPILLS) continue;
      const g = solidsMassG(s.mol);
      if (g < 0.001) continue;
      const r = Math.min(3, 0.5 + Math.sqrt(g) * 2.2);
      tmp.p.set(...toScene(s.x, s.y, 0.04 + n * 0.002));
      tmp.s.set(r, r, 1);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      spills.setMatrixAt(n, tmp.m);
      tmp.c.setHex(0xf0efe9).lerp(new THREE.Color(0x1c1b1d), Math.min(0.85, (s.mol.MnO2 * MOLAR_MASS.MnO2) / g));
      spills.setColorAt(n, tmp.c);
      n++;
    }
    spills.count = n;
    spills.instanceMatrix.needsUpdate = true;
    if (spills.instanceColor) spills.instanceColor.needsUpdate = true;
    // Sólido arrastrado por el O₂ (calentamiento brusco): partículas que salen por la boca del tubo.
    const s = st.current;
    const lost = solidsMassG(w.tube.lostMol);
    const emit = Math.max(0, lost - s.lost);
    s.lost = lost;
    const ax = tubeAxis(w, lab.runtime.ctx);
    if (emit > 0 && !lab.host.reducedMotion()) {
      const k = Math.min(12, Math.ceil(emit * 400));
      for (let i = 0; i < k && s.items.length < MAX_PARTS; i++) {
        const d = new THREE.Vector3(ax.dir.x, ax.dir.z, -ax.dir.y);
        s.items.push({
          p: new THREE.Vector3(...toScene(ax.mouth.x, ax.mouth.y, ax.mouth.z)),
          v: d.multiplyScalar(12 + Math.random() * 10).add(new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 6)),
          life: 1.2 + Math.random() * 0.6,
          c: new THREE.Color(0x9a9894),
        });
      }
    }
    const pos = parts.geometry.attributes.position as THREE.BufferAttribute;
    const col = parts.geometry.attributes.color as THREE.BufferAttribute;
    let m = 0;
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        s.items.splice(i, 1);
        continue;
      }
      it.v.y -= 30 * dt;
      it.v.multiplyScalar(1 - dt * 1.5);
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < 0.05) it.p.y = 0.05;
    }
    for (const it of s.items) {
      pos.setXYZ(m, it.p.x, it.p.y, it.p.z);
      col.setXYZ(m, it.c.r, it.c.g, it.c.b);
      m++;
    }
    parts.geometry.setDrawRange(0, m);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <>
      <primitive object={spills} />
      <primitive object={parts} />
    </>
  );
}

// ─────────────────────────── Etiquetas ───────────────────────────

const TAG_Z: Record<string, number> = {
  balance: 17, tube: 17, bottle: 15, spatula: 3, tubeTongs: 3, stopper: 4, rack: 10, irThermometer: 5, washBottle: 18, waste: 15, shield: 36, sugarJar: 11,
  pestle: 10, weighPaper: 2, brush: 3, stand: 64, tray: 3, burner: 18, gasTap: 7, lighter: 3, extinguisher: 31, blanket: 10, emergencyStop: 8, extractor: 7,
  coDetector: 6,
};
const HIDE_TAGS = new Set(['tray']);

function NameTags() {
  const lab = useStoichLab();
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
    const ax = tubeAxis(w, lab.runtime.ctx);
    const all: Array<{ id: string; kind: string; pose: { x: number; y: number; z: number }; support: string }> = [...Object.values(w.objects), ...Object.values(w.gas.objects)];
    for (const o of all) {
      if (HIDE_TAGS.has(o.kind) || o.support === 'disposed' || (o.kind === 'stopper' && o.support === 'tube')) continue;
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
      const base = o.id === 'tube' && o.support === 'clamp' ? { x: ax.mouth.x, y: ax.mouth.y, z: ax.mouth.z - TAG_Z.tube + 3 } : o.id === 'stand' ? { ...o.pose, z: 0 } : o.pose;
      const p = toScene(base.x, base.y, base.z + (TAG_Z[o.kind] ?? 6));
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
  const lab = useStoichLab();
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
  const lab = useStoichLab();
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
      if (lab.locked) return;
      if (e.button === 2) {
        if (c.held) {
          c.secondaryDown();
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
      if (e.button === 2) {
        if (e.buttons & 2) {
          if (c.held) c.secondaryDown();
        } else c.secondaryUp();
        return;
      }
      if (e.button === 0 && !(e.buttons & 1) && c.held && !c.held.keyboard) {
        c.onPointerUp();
        return;
      }
      c.onPointerMove(p.x, p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (lab.locked) return;
      if (e.button === 2) {
        c.secondaryUp();
        return;
      }
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
      if (hit) {
        if (hit.id === 'balance' && hit.part?.startsWith('rider')) lab.camera?.eyeLevel();
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
  const lab = useStoichLab();
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

export function StoichScene({ lab, setting }: { lab: StoichLab3D; setting: QualitySetting }) {
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
      shadows={p.shadows ? (q === 'HIGH' ? 'soft' : true) : false}
      dpr={[1, p.maxDpr]}
      gl={{ antialias: p.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: 38, near: 1, far: 3000, position: [80, 40, 60] }}
      onCreated={({ gl, scene, camera }) => {
        lab.three = { gl, scene, camera };
        gl.localClippingEnabled = true;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      data-testid="lab-3d"
    >
      <StoichLabContext.Provider value={lab}>
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} colliders={false}>
          <Room q={q} variant="p5" />
        </Physics>
        <Objects />
        <HoseView src={lab.gasSource} />
        <FlameView src={lab.gasSource} />
        <Effects />
        <NameTags />
        <DemoCursor />
        <CameraRig5 />
        <Bridge />
        <PerfProbe setting={setting} onQuality={setAuto} />
      </StoichLabContext.Provider>
    </Canvas>
  );
}
