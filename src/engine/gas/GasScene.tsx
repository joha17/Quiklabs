/**
 * Escena 3D de la Práctica 10 (React Three Fiber), con la misma sala, luces y cámara que las prácticas 2 a 6. Orden de
 * cada fotograma: dominio con paso fijo → interacción → vistas → efectos (chorro al verter, gotas de la piseta,
 * manguera hasta el tubo en U, burbujas que suben a la bureta, charcos). Los objetos se apoyan donde el controlador los deja; la sala conserva sus colisionadores.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { GasLabContext, useGasLab } from './context';
import type { GasLab3D } from './GasLab3D';
import { createObjVisual10 } from './objects3d';
import { CameraRig10 } from './CameraRig10';
import { Environment, Lights, Room } from '../scene/LabScene';
import { GRAVITY, fromScene, toScene } from '../units';
import { QUALITY, pickQuality, type QualityLevel, type QualitySetting } from '../quality';
import { demoPointerTexture, nameTagTexture, softDotTexture } from '../renderers/textures';
import { VIS, buretteZ, erlenMouth } from './layout';

// ─────────────────────────── Avance del dominio, interacción y audio ───────────────────────────

function Driver() {
  const lab = useGasLab();
  useFrame((_, dtRaw) => {
    if (lab.playback.paused) return;
    const dt = Math.min(dtRaw, 0.1) * lab.playback.speed;
    const rt = lab.runtime;
    const w = rt.world;
    // La aceleración del tiempo se suspende mientras se manipula algo o se vierte.
    const busy = !!lab.controller.held || Object.keys(w.pours).length > 0;
    const scale = rt.timeScale;
    if (busy) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
    lab.audio.ambient({
      unlitFlow: 0, lit: false, blueness: 0, flow: 0, abnormal: 0, alarm: false,
      pouring: Object.values(w.pours).length ? 2 : 0,
      mgBurning: false,
    });
  });
  return null;
}

// ─────────────────────────── Objetos ───────────────────────────

function registerHits(lab: GasLab3D, root: THREE.Object3D) {
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
  const lab = useGasLab();
  const w0 = lab.runtime.world;
  const quality = lab.quality;
  const visual = useMemo(() => createObjVisual10(w0.objects[id], w0, quality), [id, quality]);
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  useFrame((state, dt) => {
    const o = lab.runtime.world.objects[id];
    if (o) visual.update(lab.frame(state.clock.elapsedTime, dt), o);
  });
  return <primitive object={visual.group} />;
}

function Objects() {
  const lab = useGasLab();
  const ids = Object.keys(lab.runtime.world.objects);
  return <>{ids.map((id) => <ObjView key={id} id={id} />)}</>;
}

// ─────────────────────────── Chorro, gotas, manguera, burbujas y charcos ───────────────────────────

const POUR_GEO: Record<string, { r: number; h: number }> = {
  water_bottle: { r: 4.6, h: 22 }, tap_jug: { r: 5.5, h: 22 }, vinegar_bottle: { r: 3.6, h: 18 }, beaker150: { r: VIS.beaker150.r, h: VIS.beaker150.h },
  cylinder: { r: VIS.cylinder.r, h: VIS.cylinder.h + VIS.cylinder.floor }, erlenmeyer: { r: VIS.erlen.mouthR, h: VIS.erlen.mouthZ }, flask: { r: VIS.flask.neckR, h: VIS.flask.neckZ1 },
};

function Effects() {
  const lab = useGasLab();
  const stream = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 1, 8, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.6, roughness: 0.05, depthWrite: false }));
    m.visible = false;
    return m;
  }, []);
  const drops = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.4, color: 0x7fb6e0, transparent: true, opacity: 0.9, depthWrite: false }));
    pts.frustumCulled = false;
    return pts;
  }, []);
  const bubbles = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.5, map: softDotTexture(), color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false;
    return pts;
  }, []);
  const hoseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.6, transparent: true, opacity: 0.85 }), []);
  const hose = useMemo(() => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), hoseMat);
    m.castShadow = true;
    m.visible = false;
    return m;
  }, [hoseMat]);
  const puddle = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshPhysicalMaterial({ color: 0xa9cbe6, transparent: true, opacity: 0.45, roughness: 0.02 }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    return m;
  }, []);
  const st = useRef({ drops: [] as Array<{ p: THREE.Vector3; v: number }>, bubbles: [] as Array<{ p: THREE.Vector3; top: number }>, spilled: 0, washMl: 0, hoseKey: '', lastGas: 0 });
  useEffect(
    () => () => {
      for (const o of [stream, drops, bubbles, hose, puddle]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    },
    [stream, drops, bubbles, hose, puddle],
  );
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const w = lab.runtime.world;
    const c = lab.controller;
    const s = st.current;
    // Chorro del vertido: del borde del recipiente inclinado al receptor (o a la mesada).
    const pr = Object.values(w.pours)[0];
    stream.visible = false;
    if (pr && c.held?.id === pr.sourceId && c.held.tilt > 20) {
      const o = w.objects[pr.sourceId];
      const g = POUR_GEO[pr.sourceId] ?? { r: 2, h: 10 };
      const th = o.pose.rotationRad;
      a.set(o.pose.x + Math.sin(th) * g.h + Math.cos(th) * g.r, o.pose.z + Math.cos(th) * g.h - Math.sin(th) * g.r, -o.pose.y);
      const m = pr.targetId ? c.mouthOf(pr.targetId) : null;
      b.set(a.x, m ? m.z - 2 : 0.05, a.z);
      const len = Math.max(0.2, a.y - b.y);
      stream.scale.set(1, len, 1);
      stream.position.set(a.x, (a.y + b.y) / 2, a.z);
      stream.visible = len > 0.3;
    }
    // Gotas de la piseta.
    if (w.liquids.wash.ml < s.washMl - 1e-6 && c.held?.id === 'wash') {
      const o = w.objects.wash.pose;
      s.drops.push({ p: new THREE.Vector3(o.x + 3.5, o.z + 13.6, -o.y), v: 0 });
    }
    s.washMl = w.liquids.wash.ml;
    for (const d of s.drops) {
      d.v += 900 * dt;
      d.p.y -= d.v * dt;
    }
    s.drops = s.drops.filter((d) => d.p.y > 0).slice(-30);
    const dp = drops.geometry.attributes.position as THREE.BufferAttribute;
    s.drops.forEach((d, i) => dp.setXYZ(i, d.p.x, d.p.y, d.p.z));
    drops.geometry.setDrawRange(0, s.drops.length);
    dp.needsUpdate = true;
    // Manguera: del tapón (en el Erlenmeyer o donde esté) al extremo libre del tubo en U, si están conectados.
    const cs = w.connections;
    const tube = w.objects.u_tube.pose;
    const stp = w.objects.stopper.pose;
    const showHose = !!cs.c_stopper.connectedTo && !!cs.c_hose_u.connectedTo;
    hose.visible = showHose;
    if (showHose) {
      const top = w.objects.u_tube.support === 'burette' ? { x: tube.x - 3.5, y: tube.y, z: tube.z + 16 } : { x: tube.x, y: tube.y, z: tube.z + 0.5 };
      const from = w.objects.stopper.support === 'erlenmeyer' ? { ...erlenMouth(w), z: erlenMouth(w).z + 4.6 } : { x: stp.x, y: stp.y, z: stp.z + 4.4 };
      const kink = Math.max(cs.c_stopper.kinkFraction, cs.c_hose_u.kinkFraction);
      const key = [from.x, from.y, from.z, top.x, top.y, top.z, kink].map((v) => v.toFixed(1)).join(',');
      if (key !== s.hoseKey) {
        s.hoseKey = key;
        const mid = new THREE.Vector3((from.x + top.x) / 2, Math.max(from.z, top.z) + 8 - kink * 8, -(from.y + top.y) / 2 - 6);
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(from.x, from.z, -from.y), new THREE.Vector3(from.x, from.z + 3, -from.y), mid, new THREE.Vector3(top.x, top.z + 3, -top.y), new THREE.Vector3(top.x, top.z, -top.y),
        ]);
        hose.geometry.dispose();
        hose.geometry = new THREE.TubeGeometry(curve, 48, 0.4, 8, false);
      }
      hoseMat.color.setHex(cs.c_stopper.wetFraction > 0.2 ? 0xe8d6b0 : 0xc9a27a);
    }
    // Burbujas que suben por la bureta mientras entra gas (solo si de verdad entra).
    const gas = w.burette.nAir + w.burette.nCo2;
    const rising = gas > s.lastGas + 1e-9 && w.burette.inverted;
    s.lastGas = gas;
    if (rising && !lab.host.reducedMotion() && s.bubbles.length < 40 && Math.random() < dt * 30) {
      const z = buretteZ(w);
      const x = w.objects.beaker600.pose.x + 0.6;
      s.bubbles.push({ p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, z.mouth + 0.5, -w.objects.beaker600.pose.y), top: z.meniscus });
    }
    for (const q of s.bubbles) q.p.y += 18 * dt;
    s.bubbles = s.bubbles.filter((q) => q.p.y < q.top);
    const bp = bubbles.geometry.attributes.position as THREE.BufferAttribute;
    s.bubbles.forEach((q, i) => bp.setXYZ(i, q.p.x, q.p.y, q.p.z));
    bubbles.geometry.setDrawRange(0, s.bubbles.length);
    bp.needsUpdate = true;
    // Charco del líquido derramado.
    const spilled = w.liquids.spill.ml;
    if (spilled > s.spilled + 0.05) {
      const src = c.held ? w.objects[c.held.id].pose : w.objects.erlenmeyer.pose;
      if (!puddle.visible) puddle.position.set(src.x + 3, 0.04, -src.y + 4);
      puddle.visible = true;
    }
    s.spilled = spilled;
    const r = Math.min(10, 1 + Math.sqrt(spilled) * 1.2);
    puddle.scale.set(r, r, 1);
  });
  return (
    <>
      <primitive object={stream} />
      <primitive object={drops} />
      <primitive object={bubbles} />
      <primitive object={hose} />
      <primitive object={puddle} />
    </>
  );
}

// ─────────────────────────── Etiquetas ───────────────────────────

const TAG_Z: Record<string, number> = {
  abalance: 25, watchGlass: 3, spatula: 3, bicarbJar: 11, beaker150: 11, funnel: 10, flask: 19, pipette: 46, propipette: 7, washBottle: 18, waterBottle: 26,
  vinegarBottle: 22, cylinder: 21, erlenmeyer: 17, stopper: 6, beaker600: 15, burette: 62, stand: 80, uTube: 18, thermometer: 21, barometer: 12, ruler: 32,
  sensor: 6, datalogger: 6, syringe: 4, sink: 13,
};
const HIDE_TAGS = new Set(['stand', 'propipette']);

function NameTags() {
  const lab = useGasLab();
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
      // En el baño, el balón y el Erlenmeyer, solo la etiqueta del seleccionado (están juntos).
      if (['beaker600', 'burette', 'flask', 'erlenmeyer', 'funnel:flask', 'pipette', 'sensor'].includes(o.support) && sel !== o.id && lab.controller.hovered !== o.id) continue;
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
      const lying = o.support === 'bench' && (o.kind === 'thermometer' || o.kind === 'pipette' || o.kind === 'burette' || o.kind === 'ruler' || o.kind === 'uTube');
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
  const lab = useGasLab();
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
  const lab = useGasLab();
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
        const eye: Record<string, 'burette' | 'cylinder' | 'flask' | 'pipette' | 'ruler' | 'balance'> = { burette: 'burette', cylinder: 'cylinder', flask: 'flask', pipette: 'pipette', ruler: 'ruler', abalance: 'balance' };
        if (eye[hit.id] && (hit.id !== 'burette' || lab.runtime.world.burette.inverted)) lab.camera?.eyeLevel(eye[hit.id]);
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
  const lab = useGasLab();
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

export function GasScene({ lab, setting }: { lab: GasLab3D; setting: QualitySetting }) {
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
      <GasLabContext.Provider value={lab}>
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} colliders={false}>
          <Room q={q} variant="p10" />
        </Physics>
        <Objects />
        <Effects />
        <NameTags />
        <DemoCursor />
        <CameraRig10 />
        <Bridge />
        <PerfProbe setting={setting} onQuality={setAuto} />
      </GasLabContext.Provider>
    </Canvas>
  );
}
