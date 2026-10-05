/**
 * Escena 3D de la Práctica 3 (React Three Fiber + Rapier), con la misma sala, luces, física y cámara que la
 * Práctica 2. Orden de cada fotograma: dominio con paso fijo → interacción → física (60 Hz) → vistas → efectos.
 * La llama es una malla paramétrica con shader (no imágenes fijas): altura, anchura, conos, color, luminosidad,
 * oscilación, separación de la boca y humo dependen del estado del dominio en cada fotograma.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, Physics, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { FlameLabContext, useFlameLab } from './context';
import type { BurnerViewSource, FlameLab3D } from './FlameLab3D';
import { huePair } from './FlameLab3D';
import { coneProfile, createFlameMaterial, flameProfile, plumeProfile, setGlass } from './flameMaterial';
import { createObjVisual } from './objects3d';
import { CameraRig3 } from './CameraRig3';
import { Environment, Lights, Room } from '../scene/LabScene';
import { GRAVITY, fromScene, poseToScene, toScene } from '../units';
import { QUALITY, pickQuality, type QualityLevel, type QualitySetting } from '../quality';
import { demoPointerTexture, nameTagTexture, softDotTexture } from '../renderers/textures';
import { gasFlows, hosePoints, isLit, mouthPos } from '../../simulation/flame-world/world';
import type { Practice3Object } from '../../simulation/flame-world/types';
import { BURNER, CAPSULE, HOLDER, RACK, TILE, TUBE } from '../../practices/practice-03/instruments';

// ─────────────────────────── Avance del dominio, interacción y audio ───────────────────────────

function Driver() {
  const lab = useFlameLab();
  useFrame((_, dtRaw) => {
    if (lab.playback.paused) return;
    const dt = Math.min(dtRaw, 0.1) * lab.playback.speed;
    const rt = lab.runtime;
    const w = rt.world;
    // La aceleración del tiempo se suspende mientras se manipula o hay emisión: la prueba de llama se observa en tiempo real.
    const busy = !!lab.controller.held || Object.values(w.loops).some((l) => l.emission > 0.001) || Object.values(w.atomizers).some((a) => Object.keys(a.aerosolInFlameMg).length > 0) || w.lighter.sparking;
    const scale = rt.timeScale;
    if (busy) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
    const b = w.burner;
    const fl = gasFlows(w);
    lab.audio.ambient({
      unlitFlow: isLit(w) ? fl.leak : fl.burner + fl.leak,
      lit: isLit(w) && b.flameState !== 'FLASHBACK',
      blueness: b.flame.blueness,
      flow: b.flame.fuelFlow,
      abnormal: b.flameState === 'FLASHBACK' ? 1 : b.flameState === 'LIFTED' ? 0.8 : b.flame.stability < 0.6 && isLit(w) ? 0.4 : 0,
      alarm: w.room.alarm,
    });
  });
  return null;
}

// ─────────────────────────── Cuerpos (Rapier) ───────────────────────────

const IMPACT_CM_S = 220;

function colliderFor(kind: Practice3Object['kind']): Array<{ type: 'box' | 'cyl'; args: number[]; pos: [number, number, number] }> {
  switch (kind) {
    case 'burner':
      return [{ type: 'cyl', args: [BURNER.baseH / 2, BURNER.baseR - 0.4], pos: [0, BURNER.baseH / 2, 0] }, { type: 'cyl', args: [BURNER.mouthZ / 2, BURNER.barrelR], pos: [0, BURNER.mouthZ / 2, 0] }];
    case 'tile':
      return [{ type: 'box', args: [TILE.half, TILE.h / 2, TILE.half], pos: [0, TILE.h / 2, 0] }];
    case 'backdrop':
      return [{ type: 'box', args: [23, 21, 0.5], pos: [0, 21.5, 0] }];
    case 'rack':
      return [{ type: 'box', args: [RACK.hx, 0.3, RACK.hy], pos: [0, 0.3, 0] }];
    case 'loopHolder':
      return [{ type: 'box', args: [HOLDER.hx, HOLDER.h / 2, HOLDER.hy], pos: [0, HOLDER.h / 2, 0] }];
    case 'capsule':
      return [{ type: 'cyl', args: [CAPSULE.height / 2, CAPSULE.rimR * 0.8], pos: [0, CAPSULE.height / 2, 0] }];
    case 'tube':
      return [{ type: 'cyl', args: [TUBE.height / 2, TUBE.outerR], pos: [0, TUBE.height / 2, 0] }];
    default:
      return [];
  }
}

function registerHits(lab: FlameLab3D, root: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData?.objId) {
      lab.hitMeshes.add(o as THREE.Mesh);
      list.push(o as THREE.Mesh);
    }
  });
  return () => list.forEach((m) => lab.hitMeshes.delete(m));
}

function ObjBody({ id }: { id: string }) {
  const lab = useFlameLab();
  const { rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const o0 = lab.runtime.world.objects[id];
  const quality = lab.quality;
  const visual = useMemo(() => createObjVisual(o0, quality, lab.host.nameTag(id)), [id, quality]);
  const st = useRef({ dynamic: false, still: 0, speed: 0 });
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  const init = poseToScene(o0.pose);
  const cols = colliderFor(o0.kind);

  useFrame((state, dt) => {
    const b = body.current;
    const w = lab.runtime.world;
    const o = w.objects[id];
    if (!b || !o) return;
    const wantDynamic = lab.physicsActive.has(id) && o.support === 'falling';
    const s = st.current;
    if (wantDynamic !== s.dynamic) {
      s.dynamic = wantDynamic;
      s.still = 0;
      if (wantDynamic) {
        const p = poseToScene(o.pose);
        b.setBodyType(rapier.RigidBodyType.Dynamic, true);
        b.setTranslation({ x: p.position[0], y: p.position[1], z: p.position[2] }, true);
        b.setRotation({ x: p.quaternion[0], y: p.quaternion[1], z: p.quaternion[2], w: p.quaternion[3] }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    }
    if (!s.dynamic) {
      if (lab.physicsActive.has(id) && o.support !== 'falling') lab.physicsActive.delete(id);
      const p = poseToScene(o.pose);
      b.setNextKinematicTranslation({ x: p.position[0], y: p.position[1], z: p.position[2] });
      b.setNextKinematicRotation({ x: p.quaternion[0], y: p.quaternion[1], z: p.quaternion[2], w: p.quaternion[3] });
    } else {
      const t = b.translation();
      const r = b.rotation();
      const lv = b.linvel();
      const av = b.angvel();
      s.speed = Math.hypot(lv.x, lv.y, lv.z);
      const pp = fromScene(t.x, t.y, t.z);
      const upright = Math.abs(r.x) < 0.03 && Math.abs(r.z) < 0.03;
      lab.runtime.dispatch({ type: 'setPose', id, pose: { x: pp.x, y: pp.y, z: Math.max(0, pp.z), rotationRad: 0, quat: upright ? undefined : [r.x, r.y, r.z, r.w] }, support: 'falling' });
      if (t.y < -12) {
        lab.physicsActive.delete(id);
        lab.runtime.dispatch({ type: 'setPose', id, pose: { x: Math.max(-5, Math.min(560, pp.x)), y: 8, z: 0, rotationRad: 0 }, support: 'bench' });
      } else if ((s.speed < 0.8 && Math.hypot(av.x, av.y, av.z) < 0.08) || b.isSleeping()) {
        s.still += dt;
        if (s.still > 0.3) {
          lab.physicsActive.delete(id);
          const tile = w.objects.tile?.pose;
          const onTile = !!tile && Math.abs(pp.x - tile.x) < TILE.half && Math.abs(pp.y - tile.y) < TILE.half && pp.z > TILE.h - 0.5 && pp.z < TILE.h + 1;
          lab.runtime.dispatch({ type: 'setPose', id, pose: { x: pp.x, y: pp.y, z: Math.max(0, pp.z), rotationRad: 0, quat: upright ? undefined : [r.x, r.y, r.z, r.w] }, support: onTile ? 'tile' : 'bench' });
        }
      } else s.still = 0;
    }
    visual.update(lab.frame(state.clock.elapsedTime, dt), o);
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={init.position}
      ccd
      canSleep
      linearDamping={0.2}
      angularDamping={0.4}
      onCollisionEnter={() => {
        const s = st.current;
        if (!s.dynamic) return;
        if (s.speed > 40) lab.host.sound(o0.kind === 'capsule' ? 'porcelain' : o0.kind === 'tube' ? 'glass' : 'metal');
        if (s.speed > IMPACT_CM_S && o0.kind === 'tube') lab.host.sound('glass');
      }}
    >
      {cols.map((c, i) =>
        c.type === 'box' ? (
          <CuboidCollider key={i} args={c.args as [number, number, number]} position={c.pos} friction={0.9} restitution={0.05} />
        ) : (
          <CylinderCollider key={i} args={c.args as [number, number]} position={c.pos} friction={0.9} restitution={0.05} density={o0.kind === 'capsule' ? 1.8 : 1.2} />
        ),
      )}
      <primitive object={visual.group} />
    </RigidBody>
  );
}

function Objects() {
  const lab = useFlameLab();
  const [ids, setIds] = useState(() => Object.keys(lab.runtime.world.objects));
  useFrame(() => {
    const keys = Object.keys(lab.runtime.world.objects);
    if (keys.length !== ids.length) setIds(keys);
  });
  return (
    <>
      {ids.map((id) => (
        <ObjBody key={id} id={id} />
      ))}
    </>
  );
}

// ─────────────────────────── Manguera ───────────────────────────

/** Manguera de gas (también la usa la Práctica 4 con su sub-mundo del mechero). */
export function HoseView({ src }: { src?: BurnerViewSource }) {
  const ctxLab = useContext(FlameLabContext);
  const lab = (src ?? ctxLab)!;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xd9612b, roughness: 0.55, emissive: 0x000000 }), []);
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    m.castShadow = true;
    m.userData = { objId: 'hose', part: 'hose' };
    return m;
  }, [mat]);
  const midHit = useMemo(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    m.userData = { objId: 'hose', part: 'hoseMid' };
    return m;
  }, []);
  const crack = useMemo(() => new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 6, 14), new THREE.MeshBasicMaterial({ color: 0x1a0f0a })), []);
  const bubbles = useMemo(() => {
    const g = new THREE.Group();
    const bm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0, clearcoat: 1 });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.18 + (i % 3) * 0.08, 8, 6), bm);
      b.position.set(Math.cos(i * 1.7) * 0.7, 0.4 + (i % 4) * 0.2, Math.sin(i * 1.7) * 0.7);
      g.add(b);
    }
    return g;
  }, []);
  const key = useRef('');
  useEffect(() => {
    lab.hitMeshes.add(mesh);
    lab.hitMeshes.add(midHit);
    return () => {
      lab.hitMeshes.delete(mesh);
      lab.hitMeshes.delete(midHit);
    };
  }, [lab, mesh, midHit]);
  useFrame(() => {
    const w = lab.runtime.world;
    const pts = hosePoints(w, lab.runtime.ctx, 24);
    if (!pts.length) return;
    if (!w.burner.hoseConnected) {
      // Desconectada: el extremo cuelga junto a la espiga, sin encajar.
      const last = pts[pts.length - 1];
      for (let i = pts.length - 4; i < pts.length; i++) {
        const u = (i - (pts.length - 4)) / 3;
        pts[i] = { x: pts[i].x + 2.5 * u, y: pts[i].y + 3 * u, z: Math.max(0.4, pts[i].z - (last.z - 0.4) * u) };
      }
    }
    const k = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`).join('|');
    if (k !== key.current) {
      key.current = k;
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...toScene(p.x, p.y, p.z))));
      mesh.geometry.dispose();
      mesh.geometry = new THREE.TubeGeometry(curve, 48, 0.55, 10, false);
    }
    const m = w.hose.mid;
    midHit.position.set(...toScene(m.x, m.y, m.z));
    crack.visible = w.hose.crackFound;
    crack.position.set(...toScene(m.x, m.y, m.z + 0.3));
    crack.rotation.y = 0.6;
    bubbles.visible = w.hose.crackFound && w.hose.soapTested && w.burner.tableGasValve > 0.02 && w.burner.supplyOn;
    bubbles.position.copy(crack.position);
    const dmg = 1 - w.burner.hoseIntegrity;
    mat.color.setHex(0xd9612b).multiplyScalar(1 - dmg * 0.6);
    const hot = Math.max(0, Math.min(1, (w.hose.temperatureC - 60) / 200));
    mat.emissive.setRGB(hot * 0.6, hot * 0.15, 0);
    const sel = lab.host.getSelected() === 'hose';
    mat.emissiveIntensity = sel ? 0.9 : 1;
    if (sel) mat.emissive.setRGB(Math.max(hot * 0.6, 0.25), Math.max(hot * 0.15, 0.17), 0);
  });
  return (
    <>
      <primitive object={mesh} />
      <primitive object={midHit} />
      <primitive object={crack} />
      <primitive object={bubbles} />
    </>
  );
}

// ─────────────────────────── Llama, penachos de color, humo y chispas ───────────────────────────

const MAX_PLUMES = 4;
const MAX_PARTS = 160;

interface Particle {
  kind: 'smoke' | 'spark' | 'mist';
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
}

/** Llama paramétrica, penachos de color, humo y chispas (también la usa la Práctica 4 con su sub-mundo del mechero). */
export function FlameView({ src }: { src?: BurnerViewSource }) {
  const ctxLab = useContext(FlameLabContext);
  const lab = (src ?? ctxLab)!;
  const { scene } = useThree();
  const parts = useMemo(() => {
    const outerMat = createFlameMaterial(0.3);
    const innerMat = createFlameMaterial(1.7);
    // Capa luminosa: el hollín incandescente de la llama amarilla emite como un cuerpo casi opaco.
    const lumMat = createFlameMaterial(0.9, false);
    const flameGeo = new THREE.LatheGeometry(flameProfile(20), 28);
    const outer = new THREE.Mesh(flameGeo, outerMat);
    const lum = new THREE.Mesh(flameGeo, lumMat);
    const inner = new THREE.Mesh(new THREE.LatheGeometry(coneProfile(), 24), innerMat);
    lum.renderOrder = 7;
    outer.renderOrder = 8;
    inner.renderOrder = 9;
    const plumeGeo = new THREE.LatheGeometry(plumeProfile(), 20);
    const plumes = Array.from({ length: MAX_PLUMES }, (_, i) => {
      const m = new THREE.Mesh(plumeGeo, createFlameMaterial(2.5 + i));
      m.renderOrder = 10;
      m.visible = false;
      return m;
    });
    const light = new THREE.PointLight(0xffb060, 0, 60, 2);
    const group = new THREE.Group();
    group.add(lum, outer, inner, light);
    const dot = softDotTexture();
    const smokeMat = new THREE.SpriteMaterial({ map: dot, color: 0x1b1b1b, transparent: true, opacity: 0.22, depthWrite: false });
    const sparkMat = new THREE.SpriteMaterial({ map: dot, color: 0xffc46b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mistMat = new THREE.SpriteMaterial({ map: dot, color: 0xe8f3ff, transparent: true, opacity: 0.4, depthWrite: false });
    const sprites = Array.from({ length: MAX_PARTS }, () => {
      const s = new THREE.Sprite(smokeMat);
      s.visible = false;
      return s;
    });
    const pgroup = new THREE.Group();
    sprites.forEach((s) => pgroup.add(s));
    return { outer, lum, inner, outerMat, lumMat, innerMat, plumes, light, group, sprites, pgroup, smokeMat, sparkMat, mistMat, dot };
  }, []);
  const ps = useRef<Particle[]>([]);
  const sprayCount = useRef<Record<string, number>>({});
  const emitAcc = useRef(0);

  useEffect(() => {
    scene.add(parts.group, parts.pgroup);
    parts.plumes.forEach((p) => scene.add(p));
    return () => {
      scene.remove(parts.group, parts.pgroup);
      parts.plumes.forEach((p) => scene.remove(p));
    };
  }, [scene, parts]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const t = state.clock.elapsedTime;
    const ctx = lab.frame(t, dt);
    const w = ctx.world;
    const b = w.burner;
    const f = b.flame;
    const m = mouthPos(w, lab.runtime.ctx);
    const [mx, my, mz] = toScene(m.x, m.y, m.z);
    parts.group.position.set(mx, my, mz);
    const lit = isLit(w) && b.flameState !== 'FLASHBACK' && f.heightCm > 0;
    const reduced = ctx.reducedMotion;
    const qp = QUALITY[ctx.quality];
    // ── Cápsula sobre la llama: la llama no la atraviesa (se recorta y se ensancha debajo). ──
    let clipY = 1e6;
    let spread = 1;
    const cap = w.objects.capsule;
    if (cap && lit) {
      const r = Math.hypot(cap.pose.x - m.x, cap.pose.y - m.y);
      const dz = cap.pose.z - m.z;
      if (r < CAPSULE.rimR && dz > 0 && dz < f.heightCm + f.liftGapCm) {
        clipY = cap.pose.z + 0.05;
        spread = 1 + 0.6 * (1 - dz / (f.heightCm + 0.01));
      }
    }
    const flare = b.flareS > 0 ? 1.45 : 1;
    const c = ctx.colors;
    for (const mat of [parts.outerMat, parts.innerMat, parts.lumMat]) {
      const u = mat.uniforms;
      u.uTime.value = t;
      u.uClipY.value = clipY;
      setGlass(mat, ctx.glass);
    }
    parts.outer.visible = lit;
    parts.lum.visible = lit && f.luminosity > 0.04;
    parts.inner.visible = lit && f.blueness > 0.25;
    if (lit) {
      const H = f.heightCm * flare;
      const R = f.radiusCm * spread * flare;
      parts.outer.scale.set(R, H, R);
      parts.outer.position.y = f.liftGapCm;
      parts.lum.scale.set(R * 0.9, H * 0.97, R * 0.9);
      parts.lum.position.y = f.liftGapCm + 0.15;
      const wob = reduced ? 0.02 : (0.05 + 0.3 * f.luminosity + 0.5 * (1 - f.stability) + 0.4 * w.room.draft) / Math.max(1, f.radiusCm);
      // Envolvente transparente: base azul (CH*, C₂) que pasa al color del cuerpo de la llama.
      const ou = parts.outerMat.uniforms;
      // La llama azul es tenue frente a la emisión de una sal: si hay muestra emitiendo, su color domina.
      const emitVis = Math.min(1, Math.max(0, ...ctx.emitters.map((e) => Math.max(...e.noFilter.rgb))));
      const k = (0.35 + 0.2 * f.blueness) * (1 - 0.85 * emitVis);
      ou.uColA.value.setRGB(c.inner[0] * k, c.inner[1] * k, c.inner[2] * k);
      ou.uColB.value.setRGB(...mixRgb(c.inner, c.body, 1 - 0.7 * f.blueness, k));
      ou.uColAf.value.setRGB(c.innerF[0] * k, c.innerF[1] * k, c.innerF[2] * k);
      ou.uColBf.value.setRGB(...mixRgb(c.innerF, c.bodyF, 1 - 0.7 * f.blueness, k));
      ou.uAlpha.value = 0.4 + 0.15 * f.blueness;
      ou.uEdge.value = 0.85 * f.blueness;
      ou.uNoise.value = reduced ? 0.1 : 0.2 + 0.35 * f.luminosity + 0.3 * (1 - f.stability);
      ou.uWobble.value = wob;
      ou.uTipFade.value = 0.25 + 0.2 * f.luminosity;
      // Cuerpo luminoso amarillo (solo con hollín): se ve aun frente a fondos claros.
      const lu = parts.lumMat.uniforms;
      lu.uColA.value.setRGB(...c.body);
      lu.uColB.value.setRGB(...c.body);
      lu.uColAf.value.setRGB(...c.bodyF);
      lu.uColBf.value.setRGB(...c.bodyF);
      lu.uAlpha.value = 0.82 * f.luminosity;
      lu.uEdge.value = 0;
      lu.uNoise.value = reduced ? 0.1 : 0.45;
      lu.uWobble.value = wob * 1.15;
      lu.uTipFade.value = 0.45;
      parts.inner.scale.set(BURNER.mouthR * 1.05, f.innerConeHeightCm, BURNER.mouthR * 1.05);
      parts.inner.position.y = f.liftGapCm;
      const iu = parts.innerMat.uniforms;
      iu.uColA.value.setRGB(...c.inner);
      iu.uColB.value.setRGB(...c.inner);
      iu.uColAf.value.setRGB(...c.innerF);
      iu.uColBf.value.setRGB(...c.innerF);
      iu.uAlpha.value = 0.95 * f.blueness;
      iu.uEdge.value = 0.95;
      iu.uNoise.value = 0.08;
      iu.uWobble.value = reduced ? 0 : 0.02;
      iu.uTipFade.value = 0.12;
    }
    // ── Penachos de color: alrededor de la muestra, no en toda la pantalla (§26.5-3). ──
    const em = lit ? ctx.emitters : [];
    let lightCol = new THREE.Color(...mixRgb(c.inner, c.body, f.luminosity));
    let lightI = lit ? 120 + 1400 * f.luminosity + 250 * f.blueness : 0;
    parts.plumes.forEach((p, i) => {
      const e = em[i];
      if (!e) {
        p.visible = false;
        return;
      }
      p.visible = true;
      const top = m.z + f.liftGapCm + f.heightCm;
      const h = Math.max(1.5, top - e.z + 1.2);
      p.position.set(...toScene(e.x, e.y, e.z - 0.4));
      const vis = Math.max(...e.noFilter.rgb);
      p.scale.set(0.55 + 0.6 * Math.min(1, vis), h, 0.55 + 0.6 * Math.min(1, vis));
      const u = (p.material as THREE.ShaderMaterial).uniforms;
      // Tono de la emisión (del espectro) con brillo según su intensidad; el filtro conserva su atenuación.
      const [nf, fl] = huePair(e.emission.noFilter, e.emission.filter, 0.6 + 2.4 * Math.min(1, vis));
      u.uColA.value.setRGB(...nf);
      u.uColB.value.setRGB(...nf.map((v) => v * 0.8) as [number, number, number]);
      u.uColAf.value.setRGB(...fl);
      u.uColBf.value.setRGB(...fl.map((v) => v * 0.8) as [number, number, number]);
      u.uAlpha.value = Math.min(1, 0.25 + vis);
      u.uEdge.value = 0.2;
      u.uNoise.value = reduced ? 0.1 : 0.45;
      u.uWobble.value = reduced ? 0 : 0.15;
      u.uTipFade.value = 0.5;
      u.uTime.value = t;
      u.uClipY.value = clipY;
      setGlass(p.material as THREE.ShaderMaterial, ctx.glass);
      lightCol = lightCol.lerp(new THREE.Color(...nf), Math.min(0.85, vis));
      lightI += 900 * vis;
    });
    parts.light.color.copy(lightCol);
    parts.light.intensity = lightI * (qp.shadows ? 1 : 0.8);
    parts.light.position.set(0, f.liftGapCm + f.heightCm * 0.45, 0);

    // ── Partículas ──
    const list = ps.current;
    emitAcc.current += dt;
    const spawn = (kind: Particle['kind'], p: THREE.Vector3, v: THREE.Vector3, life: number) => {
      if (list.length >= MAX_PARTS * qp.particles) return;
      list.push({ kind, p, v, life, max: life });
    };
    if (emitAcc.current > 0.05) {
      const n = emitAcc.current;
      emitAcc.current = 0;
      // Humo tenue de hollín solo en combustión muy incompleta (nunca para representar el CO, §23.2).
      if (lit && f.luminosity > 0.75 && f.sootRateMgS > 0.45 && !reduced) {
        const k = Math.min(3, f.sootRateMgS * 4 * n * 10);
        for (let i = 0; i < k; i++) spawn('smoke', new THREE.Vector3(mx + (Math.random() - 0.5), Math.min(clipY, my + f.heightCm * flare), mz + (Math.random() - 0.5)), new THREE.Vector3((Math.random() - 0.5) * 2, 6 + Math.random() * 3, (Math.random() - 0.5) * 2), 2.2);
      }
      if (w.lighter.sparking && w.objects.lighter) {
        const lp = w.objects.lighter.pose;
        const [lx, ly, lz] = toScene(lp.x, lp.y, lp.z);
        for (let i = 0; i < 3; i++) spawn('spark', new THREE.Vector3(lx, ly + 0.3, lz), new THREE.Vector3((Math.random() - 0.5) * 20, Math.random() * 15, (Math.random() - 0.5) * 20), 0.25);
      }
      for (const l of Object.values(w.loops)) {
        if (l.overloaded && l.surfaceWaterMg > 0 && l.temperatureC > 95 && w.objects[l.id]) {
          const lp = w.objects[l.id].pose;
          for (let i = 0; i < 2; i++) spawn('spark', new THREE.Vector3(...toScene(lp.x, lp.y, lp.z)), new THREE.Vector3((Math.random() - 0.5) * 18, 8 + Math.random() * 10, (Math.random() - 0.5) * 18), 0.35);
        }
      }
    }
    for (const [id, a] of Object.entries(w.atomizers)) {
      const prev = sprayCount.current[id] ?? a.bursts;
      if (a.bursts > prev && w.objects[id]) {
        const op = w.objects[id].pose;
        const dir = new THREE.Vector3(Math.cos(a.yawRad), 0.05, -Math.sin(a.yawRad));
        const origin = new THREE.Vector3(...toScene(op.x, op.y, op.z + 8.6));
        for (let i = 0; i < 24; i++) spawn('mist', origin.clone(), dir.clone().multiplyScalar(30 + Math.random() * 20).add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8)), 0.7);
      }
      sprayCount.current[id] = a.bursts;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      q.life -= dt;
      if (q.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      q.p.addScaledVector(q.v, dt);
      if (q.kind === 'spark') q.v.y -= 40 * dt;
      if (q.kind === 'mist') q.v.multiplyScalar(1 - 2.5 * dt);
    }
    parts.sprites.forEach((s, i) => {
      const q = list[i];
      if (!q) {
        s.visible = false;
        return;
      }
      s.visible = true;
      s.position.copy(q.p);
      const u = 1 - q.life / q.max;
      s.material = q.kind === 'smoke' ? parts.smokeMat : q.kind === 'spark' ? parts.sparkMat : parts.mistMat;
      const sc = q.kind === 'smoke' ? 1 + 3 * u : q.kind === 'spark' ? 0.25 : 0.5 + u;
      s.scale.setScalar(sc);
    });
  });
  return null;
}

function mixRgb(a: [number, number, number], b: [number, number, number], k: number, lum = 1): [number, number, number] {
  return [(a[0] * (1 - k) + b[0] * k) * lum, (a[1] * (1 - k) + b[1] * k) * lum, (a[2] * (1 - k) + b[2] * k) * lum];
}

// ─────────────────────────── Etiquetas de nombre ───────────────────────────

const TAG_Z: Partial<Record<Practice3Object['kind'], number>> = {
  burner: 18, tube: 17, loop: 2.5, capsule: 4, tongs: 3, glass: 7, lighter: 3, rack: 9, loopHolder: 26, tile: 2.5, cloth: 2, soapBottle: 13,
  rinseBeaker: 8, waste: 14, backdrop: 44, hclVial: 9, extinguisher: 31, blanket: 10, emergencyStop: 8, extractor: 7, coDetector: 6, ruler: 37, atomizer: 11, gasTap: 7,
};
const HIDE_TAGS = new Set(['rack', 'backdrop']);

function NameTags() {
  const lab = useFlameLab();
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
      // Asas y tubos: solo la etiqueta del seleccionado o sostenido (son muchos y están juntos).
      if ((o.kind === 'loop' || o.kind === 'tube') && sel !== o.id && lab.controller.held?.id !== o.id && lab.controller.hovered !== o.id) continue;
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
      const p = toScene(o.pose.x, o.pose.y, o.pose.z + (TAG_Z[o.kind] ?? 6));
      slot.sprite.position.set(...p);
      const d = camPos.distanceTo(slot.sprite.position);
      const h = Math.max(1.15, 17 * cmPerPx * d);
      slot.sprite.scale.set(h * slot.aspect, h, 1);
    }
    for (const [id, s] of slots.current) {
      if (!seen.has(id)) {
        root.remove(s.sprite);
        s.sprite.material.map?.dispose();
        s.sprite.material.dispose();
        slots.current.delete(id);
      }
    }
  });
  return <primitive object={root} />;
}

// ─────────────────────────── Mano de la demostración ───────────────────────────

/** Puntero de la demostración: muestra dónde haría clic o qué arrastraría el estudiante. SOLO lee `lab.demoCursor`. */
function DemoCursor() {
  const lab = useFlameLab();
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
  const lab = useFlameLab();
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
      if (lab.locked) return; // demostración: solo la cámara responde
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
      if (hit) lab.camera?.focusObject(hit.id, true);
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

// ─────────────────────────── Rendimiento ───────────────────────────

function PerfProbe({ setting, onQuality }: { setting: QualitySetting; onQuality: (q: QualityLevel) => void }) {
  const lab = useFlameLab();
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
    const busy = !!lab.controller.held || lab.physicsActive.size > 0;
    if (!a.decided && !busy && a.probeTime >= 3 && setting === 'AUTO') {
      a.decided = true;
      const next = pickQuality(a.probeFrames / a.probeTime, lab.quality);
      if (next !== lab.quality) onQuality(next);
    }
  });
  return null;
}

export function FlameScene({ lab, setting }: { lab: FlameLab3D; setting: QualitySetting }) {
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
      camera={{ fov: 38, near: 1, far: 3000, position: [200, 40, 50] }}
      onCreated={({ gl, scene, camera }) => {
        lab.three = { gl, scene, camera };
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      data-testid="lab-3d"
    >
      <FlameLabContext.Provider value={lab}>
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} interpolate colliders={false}>
          <Room q={q} variant="p3" />
          <Objects />
        </Physics>
        <HoseView />
        <FlameView />
        <NameTags />
        <DemoCursor />
        <CameraRig3 />
        <Bridge />
        <PerfProbe setting={setting} onQuality={setAuto} />
      </FlameLabContext.Provider>
    </Canvas>
  );
}
