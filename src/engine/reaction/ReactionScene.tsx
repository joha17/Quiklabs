/**
 * Escena 3D de la Práctica 4 (React Three Fiber + Rapier), con la misma sala, luces, física y cámara que las
 * prácticas 2 y 3. Orden de cada fotograma: dominio con paso fijo → interacción → física (60 Hz) → vistas → efectos.
 * El mechero (modelo, llama paramétrica y manguera) es el de la Práctica 3, alimentado por el sub-mundo `gas`.
 * La combustión del Mg se dibuja con luz controlada: la exposición se reduce y nunca hay un destello real (§13.1).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, Physics, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { ReactionLabContext, useReactionLab } from './context';
import type { ReactionLab3D } from './ReactionLab3D';
import { bindShieldRect, createObjVisual4 } from './objects3d';
import { CameraRig4 } from './CameraRig4';
import { SHAPES4 } from './shapes';
import { mgExposure, mgLightIntensity } from './protection';
import { FlameView, HoseView } from '../flame/FlameScene';
import { createObjVisual } from '../flame/objects3d';
import { Environment, Lights, Room } from '../scene/LabScene';
import { GRAVITY, fromScene, poseToScene, toScene } from '../units';
import { QUALITY, pickQuality, type QualityLevel, type QualitySetting } from '../quality';
import { demoPointerTexture, nameTagTexture, softDotTexture } from '../renderers/textures';
import { gasFlows, isLit } from '../../simulation/flame-world/world';
import { surfaceZ } from '../../simulation/reaction-world/world';
import type { P4Object } from '../../simulation/reaction-world/types';
import { lipPoint } from '../physics/geometry';
import { PROFILE_OF, RACK4, TILE4, WASH_NOZZLE } from '../../practices/practice-04/instruments';
import { BURNER } from '../../practices/practice-03/instruments';

// ─────────────────────────── Avance del dominio, interacción y audio ───────────────────────────

function Driver() {
  const lab = useReactionLab();
  const { gl } = useThree();
  useFrame((_, dtRaw) => {
    if (lab.playback.paused) return;
    const dt = Math.min(dtRaw, 0.1) * lab.playback.speed;
    const rt = lab.runtime;
    const w = rt.world;
    // La aceleración del tiempo se suspende mientras se manipula, se vierte, gotea o arde el Mg.
    const mgBurning = Object.values(w.ribbons).some((r) => r.phase === 'BRIGHT_COMBUSTION' || r.phase === 'IGNITION_THRESHOLD');
    const busy = !!lab.controller.held || Object.keys(w.pours).length > 0 || Object.keys(w.squeezes).length > 0 || mgBurning || w.gas.lighter.sparking;
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
      pouring: Object.values(w.pours).reduce((s, p) => s + p.rateMlS, 0) + Object.values(w.squeezes).reduce((s, p) => s + p.rateMlS, 0),
      mgBurning,
    });
    // Protección visual (§13.1): mientras arde el Mg la exposición baja; nunca hay un destello real.
    const target = mgExposure({ burning: mgBurning, shielded: w.mgView.shielded, reduced: lab.host.reducedMotion() });
    gl.toneMappingExposure += (target - gl.toneMappingExposure) * Math.min(1, dt * 4);
    lab.mgGlow += ((mgBurning ? 1 : 0) - lab.mgGlow) * Math.min(1, dt * 6);
  });
  return null;
}

// ─────────────────────────── Cuerpos (Rapier) ───────────────────────────

const IMPACT_CM_S = 260;

function collidersFor(kind: string, vk?: string): Array<{ type: 'box' | 'cyl'; args: number[]; pos: [number, number, number] }> {
  const prof = vk ? PROFILE_OF[vk as keyof typeof PROFILE_OF] : undefined;
  if (prof && kind !== 'waste') return [{ type: 'cyl', args: [prof.rimY / 2, prof.outerR], pos: [0, prof.rimY / 2, 0] }];
  switch (kind) {
    case 'waste':
      return [{ type: 'cyl', args: [6, 4.3], pos: [0, 6, 0] }];
    case 'tile':
      return [{ type: 'box', args: [TILE4.half, TILE4.h / 2, TILE4.half], pos: [0, TILE4.h / 2, 0] }];
    case 'rack':
      return [{ type: 'box', args: [RACK4.hx, 0.3, RACK4.hy], pos: [0, 0.3, 0] }];
    case 'burner':
      return [{ type: 'cyl', args: [BURNER.baseH / 2, BURNER.baseR - 0.4], pos: [0, BURNER.baseH / 2, 0] }, { type: 'cyl', args: [BURNER.mouthZ / 2, BURNER.barrelR], pos: [0, BURNER.mouthZ / 2, 0] }];
    case 'shield':
      return [{ type: 'box', args: [4, 0.4, 2.5], pos: [0, 0.4, 0] }];
    default:
      return [];
  }
}

function registerHits(lab: ReactionLab3D, root: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData?.objId) {
      lab.hitMeshes.add(o as THREE.Mesh);
      list.push(o as THREE.Mesh);
    }
  });
  return () => list.forEach((m) => lab.hitMeshes.delete(m));
}

/** Cuerpo de un objeto de la práctica (o del mechero, `gas`): cinemático salvo cuando cae. */
function ObjBody({ id, gas }: { id: string; gas: boolean }) {
  const lab = useReactionLab();
  const { rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const w0 = lab.runtime.world;
  const o0 = gas ? w0.gas.objects[id] : w0.objects[id];
  const quality = lab.quality;
  const visual = useMemo(
    () => (gas ? createObjVisual(w0.gas.objects[id], quality, lab.host.nameTag(id)) : createObjVisual4(w0.objects[id], w0, quality, lab.host.nameTag(id))),
    [id, quality],
  );
  const st = useRef({ dynamic: false, still: 0, speed: 0, lastSpeed: 0 });
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  const init = poseToScene(o0.pose);
  const vk = gas ? undefined : w0.vessels[id]?.kind;
  const cols = collidersFor(o0.kind, vk);

  useFrame((state, dt) => {
    const b = body.current;
    const w = lab.runtime.world;
    const o = gas ? w.gas.objects[id] : w.objects[id];
    if (!b || !o) return;
    const hidden = !gas && (o.support.startsWith('disposed:') || (o.support.startsWith('in:') && (o as P4Object).kind === 'mgRibbon'));
    visual.group.visible = !hidden;
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
      s.lastSpeed = s.speed;
      s.speed = Math.hypot(lv.x, lv.y, lv.z);
      const pp = fromScene(t.x, t.y, t.z);
      const upright = Math.abs(r.x) < 0.03 && Math.abs(r.z) < 0.03;
      const pose = { x: pp.x, y: pp.y, z: Math.max(0, pp.z), rotationRad: 0, quat: upright ? undefined : ([r.x, r.y, r.z, r.w] as [number, number, number, number]) };
      if (gas) lab.runtime.dispatch({ type: 'gas', cmd: { type: 'setPose', id, pose, support: 'falling' } });
      else lab.runtime.dispatch({ type: 'setPose', id, pose, support: 'falling' });
      if (t.y < -12) {
        lab.physicsActive.delete(id);
        const back = { x: Math.max(-5, Math.min(600, pp.x)), y: 8, z: 0, rotationRad: 0 };
        if (gas) lab.runtime.dispatch({ type: 'gas', cmd: { type: 'setPose', id, pose: back, support: 'bench' } });
        else lab.runtime.dispatch({ type: 'setPose', id, pose: back, support: 'bench' });
      } else if ((s.speed < 0.8 && Math.hypot(av.x, av.y, av.z) < 0.08) || b.isSleeping()) {
        s.still += dt;
        if (s.still > 0.3) {
          lab.physicsActive.delete(id);
          const tile = w.objects.tile?.pose;
          const onTile = !!tile && Math.abs(pp.x - tile.x) < TILE4.half && Math.abs(pp.y - tile.y) < TILE4.half && pp.z > TILE4.h - 0.5 && pp.z < TILE4.h + 1;
          const fin = { ...pose, z: Math.max(0, pp.z) };
          if (gas) lab.runtime.dispatch({ type: 'gas', cmd: { type: 'setPose', id, pose: fin, support: 'bench' } });
          else lab.runtime.dispatch({ type: 'setPose', id, pose: fin, support: onTile ? 'tile' : 'bench' });
        }
      } else s.still = 0;
    }
    if (gas) visual.update(lab.gasFrame(state.clock.elapsedTime, dt) as never, o as never);
    else (visual as ReturnType<typeof createObjVisual4>).update(lab.frame(state.clock.elapsedTime, dt), o as P4Object);
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
        const v = Math.max(s.speed, s.lastSpeed);
        if (v > 40) lab.host.sound(o0.kind === 'capsule' ? 'porcelain' : vk ? 'glass' : 'metal');
        // Un recipiente de vidrio que cae con fuerza se rompe (lo decide el dominio con la velocidad del impacto).
        if (v > IMPACT_CM_S && !gas) {
          lab.runtime.dispatch({ type: 'impact', id, speedCmS: v });
          if (lab.runtime.world.vessels[id]?.broken || (id === 'rod' && lab.runtime.world.rod.broken)) lab.host.sound('break');
        }
      }}
    >
      {cols.map((c, i) =>
        c.type === 'box' ? (
          <CuboidCollider key={i} args={c.args as [number, number, number]} position={c.pos} friction={0.9} restitution={0.05} />
        ) : (
          <CylinderCollider key={i} args={c.args as [number, number]} position={c.pos} friction={0.9} restitution={0.05} density={1.4} />
        ),
      )}
      <primitive object={visual.group} />
    </RigidBody>
  );
}

function Objects() {
  const lab = useReactionLab();
  const key = () => `${Object.keys(lab.runtime.world.objects).join(',')}|${Object.keys(lab.runtime.world.gas.objects).join(',')}`;
  const [k, setK] = useState(key);
  useFrame(() => {
    const nk = key();
    if (nk !== k) setK(nk);
  });
  const [ids, gasIds] = k.split('|').map((s) => s.split(',').filter(Boolean));
  return (
    <>
      {ids.map((id) => <ObjBody key={id} id={id} gas={false} />)}
      {gasIds.map((id) => <ObjBody key={`g:${id}`} id={id} gas />)}
    </>
  );
}

// ─────────────────────────── Chorros, gotas, derrames, humo y luz del Mg ───────────────────────────

const MAX_PARTS = 140;

interface Particle {
  kind: 'smoke' | 'spark';
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
}

function Effects() {
  const lab = useReactionLab();
  const { scene } = useThree();
  const fx = useMemo(() => {
    const streamMat = new THREE.MeshPhysicalMaterial({ color: 0xdfefff, transparent: true, opacity: 0.6, roughness: 0.05, depthWrite: false });
    const streams = Array.from({ length: 3 }, () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8, 1, true), streamMat.clone());
      m.visible = false;
      m.renderOrder = 2;
      return m;
    });
    const dropGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const drops = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(dropGeo, new THREE.MeshPhysicalMaterial({ color: 0xdfefff, transparent: true, opacity: 0.8, roughness: 0.05 }));
      m.visible = false;
      return m;
    });
    const puddleGeo = new THREE.CircleGeometry(1, 24);
    const puddles = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(puddleGeo, new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      return m;
    });
    const light = new THREE.PointLight(0xffffff, 0, 140, 2);
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowSprite.visible = false;
    const dot = softDotTexture();
    const smokeMat = new THREE.SpriteMaterial({ map: dot, color: 0xf2f2f2, transparent: true, opacity: 0.35, depthWrite: false });
    const sparkMat = new THREE.SpriteMaterial({ map: dot, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sprites = Array.from({ length: MAX_PARTS }, () => {
      const s = new THREE.Sprite(smokeMat);
      s.visible = false;
      return s;
    });
    const group = new THREE.Group();
    group.add(...streams, ...drops, ...puddles, light, glowSprite, ...sprites);
    return { streams, drops, puddles, light, glowSprite, sprites, smokeMat, sparkMat, group };
  }, []);
  const ps = useRef<Particle[]>([]);
  const acc = useRef(0);
  useEffect(() => {
    scene.add(fx.group);
    return () => {
      scene.remove(fx.group);
    };
  }, [scene, fx]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const t = state.clock.elapsedTime;
    const ctx = lab.frame(t, dt);
    const w = ctx.world;
    const rctx = lab.runtime.ctx;
    // ── Chorros de vertido y de la piseta: del pico a la superficie del receptor ──
    const streams: Array<{ from: THREE.Vector3; to: THREE.Vector3; color: [number, number, number]; r: number }> = [];
    for (const [sid, p] of Object.entries(w.pours)) {
      const v = w.vessels[sid];
      const o = w.objects[sid];
      const sh = v ? SHAPES4[v.kind] : undefined;
      if (!v || !o || !sh || p.rateMlS < 0.01) continue;
      const lp = lipPoint(sh, o.pose.rotationRad);
      const from = new THREE.Vector3(...toScene(o.pose.x + lp[0], o.pose.y, o.pose.z + lp[1]));
      const toZ = p.targetId ? surfaceZ(w, rctx, p.targetId) : 0;
      const to = new THREE.Vector3(from.x, toZ, from.z);
      const look = ctx.look(sid);
      streams.push({ from, to, color: look ? look.bulkRgb : [0.9, 0.95, 1], r: 0.05 + Math.min(0.12, p.rateMlS * 0.03) });
    }
    for (const [wid, s] of Object.entries(w.squeezes)) {
      const o = w.objects[wid];
      if (!o) continue;
      const from = new THREE.Vector3(...toScene(o.pose.x + WASH_NOZZLE.dx, o.pose.y, o.pose.z + WASH_NOZZLE.z));
      const toZ = s.targetId ? surfaceZ(w, rctx, s.targetId) : 0;
      streams.push({ from, to: new THREE.Vector3(from.x, toZ, from.z), color: [0.9, 0.95, 1], r: 0.06 });
    }
    fx.streams.forEach((m, i) => {
      const s = streams[i];
      m.visible = !!s;
      if (!s) return;
      const len = Math.max(0.05, s.from.y - s.to.y);
      m.position.set(s.from.x, (s.from.y + s.to.y) / 2, s.from.z);
      m.scale.set(s.r / 0.08, len, s.r / 0.08);
      (m.material as THREE.MeshPhysicalMaterial).color.setRGB(s.color[0], s.color[1], s.color[2]);
    });
    // ── Gotas ──
    const drops = lab.controller.drops;
    fx.drops.forEach((m, i) => {
      const d = drops[i];
      m.visible = !!d;
      if (!d) return;
      m.position.set(...toScene(d.x, d.y, d.z));
      (m.material as THREE.MeshPhysicalMaterial).color.setRGB(d.color[0], d.color[1], d.color[2]);
    });
    // ── Derrames sin limpiar (charcos) ──
    const open = w.spills.filter((s) => !s.cleaned);
    fx.puddles.forEach((m, i) => {
      const s = open[i];
      m.visible = !!s;
      if (!s) return;
      const ml = s.cell.volL * 1000;
      const solid = Object.keys(s.cell.mol).some((k) => k.endsWith('(s)'));
      const r = Math.max(0.6, Math.sqrt(Math.max(ml, solid ? 0.2 : 0) / 0.05 / Math.PI) * 0.6);
      m.position.set(...toScene(s.x, s.y, 0.04));
      m.scale.setScalar(r);
      (m.material as THREE.MeshPhysicalMaterial).color.setHex(solid && ml < 0.05 ? 0xf2f2ee : 0xcfe6ff);
    });
    // ── Combustión del Mg: luz blanca intensa pero limitada, humo blanco de MgO, chispas ──
    const burning = Object.values(w.ribbons).filter((r) => r.phase === 'BRIGHT_COMBUSTION');
    const qp = QUALITY[ctx.quality];
    const reduced = ctx.reducedMotion;
    if (burning.length) {
      const r = burning[0];
      const o = w.objects[r.id];
      const front = new THREE.Vector3(...toScene(o.pose.x - r.burnFrac * 3, o.pose.y, o.pose.z));
      fx.light.position.copy(front);
      // Intensidad atenuada: se ve muy brillante en relación con la sala, sin deslumbrar (§13.1).
      fx.light.intensity = mgLightIntensity({ burning: true, shielded: w.mgView.shielded, reduced }, t);
      fx.glowSprite.visible = true;
      fx.glowSprite.position.copy(front);
      const size = (w.mgView.shielded ? 2.2 : 3.2) * (reduced ? 1 : 1 + 0.1 * Math.sin(t * 31));
      fx.glowSprite.scale.set(size, size, 1);
      (fx.glowSprite.material as THREE.SpriteMaterial).opacity = w.mgView.shielded ? 0.6 : 0.9;
    } else {
      fx.light.intensity = 0;
      fx.glowSprite.visible = false;
    }
    const list = ps.current;
    acc.current += dt;
    if (acc.current > 0.05) {
      acc.current = 0;
      for (const r of burning) {
        const o = w.objects[r.id];
        const p = new THREE.Vector3(...toScene(o.pose.x - r.burnFrac * 3, o.pose.y, o.pose.z));
        for (let i = 0; i < 2 && list.length < MAX_PARTS * qp.particles && !reduced; i++) list.push({ kind: 'smoke', p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 3, 8 + Math.random() * 5, (Math.random() - 0.5) * 3), life: 2.5, max: 2.5 });
        for (let i = 0; i < 2 && list.length < MAX_PARTS * qp.particles && !reduced; i++) list.push({ kind: 'spark', p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 25, Math.random() * 12, (Math.random() - 0.5) * 25), life: 0.4, max: 0.4 });
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      q.life -= dt;
      if (q.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      q.p.addScaledVector(q.v, dt);
      if (q.kind === 'spark') q.v.y -= 50 * dt;
    }
    fx.sprites.forEach((s, i) => {
      const q = list[i];
      s.visible = !!q;
      if (!q) return;
      s.position.copy(q.p);
      s.material = q.kind === 'smoke' ? fx.smokeMat : fx.sparkMat;
      const u = 1 - q.life / q.max;
      s.scale.setScalar(q.kind === 'smoke' ? 1 + 3 * u : 0.2);
    });
  });
  return null;
}

// ─────────────────────────── Etiquetas de nombre ───────────────────────────

const TAG_Z: Record<string, number> = {
  bottle: 14, dropperBottle: 11, dropper: 12, cylinder: 13, beaker: 9, tube: 17, rack: 9, capsule: 5, tile: 2.5, rod: 3, probe: 3, washBottle: 21, waste: 15,
  sink: 22, towel: 2.5, phPaper: 3, nail: 2.5, alStrip: 2.5, nailDish: 2, sandpaper: 2, tubeTongs: 3, crucibleTongs: 3, mgRibbon: 2.5, mgDish: 2, shield: 31,
  burner: 18, gasTap: 7, lighter: 3, extinguisher: 31, blanket: 10, emergencyStop: 8, extractor: 7, coDetector: 6,
};
const HIDE_TAGS = new Set(['rack', 'nailDish', 'mgDish', 'tile']);

function NameTags() {
  const lab = useReactionLab();
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
    const all: Array<{ id: string; kind: string; pose: { x: number; y: number; z: number }; support: string }> = [...Object.values(w.objects), ...Object.values(w.gas.objects)];
    for (const o of all) {
      if (HIDE_TAGS.has(o.kind) || o.support.startsWith('disposed:') || o.support.startsWith('cap:') || o.support.startsWith('in:') || o.support.startsWith('tongs:')) continue;
      // Tubos, goteros y frascos gotero: solo la etiqueta del seleccionado, sostenido o apuntado (están juntos).
      if ((o.kind === 'tube' || o.kind === 'dropper' || o.kind === 'mgRibbon') && sel !== o.id && lab.controller.held?.id !== o.id && lab.controller.hovered !== o.id) continue;
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
      // Frascos gotero en fila: alturas escalonadas para que no se tapen.
      const stagger = o.kind === 'dropperBottle' ? (Math.round(o.pose.x / 12) % 2) * 2.5 : 0;
      const p = toScene(o.pose.x, o.pose.y, o.pose.z + (TAG_Z[o.kind] ?? 6) + stagger);
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
  const lab = useReactionLab();
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
  const lab = useReactionLab();
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

function PerfProbe({ setting, onQuality }: { setting: QualitySetting; onQuality: (q: QualityLevel) => void }) {
  const lab = useReactionLab();
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

/** Comparte el rectángulo de la pantalla para Mg con la fachada (la alineación la calcula el controlador). */
function ShieldBinding() {
  const lab = useReactionLab();
  useEffect(() => {
    bindShieldRect(lab.shield);
    return () => bindShieldRect(null);
  }, [lab]);
  return null;
}

export function ReactionScene({ lab, setting }: { lab: ReactionLab3D; setting: QualitySetting }) {
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
      <ReactionLabContext.Provider value={lab}>
        <ShieldBinding />
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} interpolate colliders={false}>
          <Room q={q} variant="p4" />
          <Objects />
        </Physics>
        <HoseView src={lab.gasSource} />
        <FlameView src={lab.gasSource} />
        <Effects />
        <NameTags />
        <DemoCursor />
        <CameraRig4 />
        <Bridge />
        <PerfProbe setting={setting} onQuality={setAuto} />
      </ReactionLabContext.Provider>
    </Canvas>
  );
}

