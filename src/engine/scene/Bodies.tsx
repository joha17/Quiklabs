/**
 * Cuerpos rígidos (Rapier, §3.7) y vistas 3D de cada objeto.
 * - En reposo, sostenido o en un soporte (gradilla, placa, aro, baño…): cuerpo CINEMÁTICO que sigue la pose del dominio.
 * - Al soltarlo sobre la mesada: cuerpo DINÁMICO temporal que cae, se apoya o vuelca; al quedarse quieto
 *   se escribe su pose final (posición + cuaternión) en el dominio y vuelve a ser cinemático.
 * - Golpes fuertes (velocidad de impacto > umbral) se informan al dominio, que decide la rotura.
 * La física NUNCA decide masas ni caudales.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useLab3D } from './context';
import { createVesselVisual } from '../renderers/vesselView3d';
import { createPropVisual } from '../renderers/propView3d';
import { FUNNEL_STEM_CM, PROP_FOOTPRINT, VESSEL_DIM } from '../physics/dimensions';
import { fromScene, poseToScene } from '../units';
import { useLab } from '../../app/store';
import * as THREE from 'three';
import { QUALITY } from '../quality';

/** Velocidad de impacto (cm/s) a partir de la cual el golpe se informa al dominio (≈ caída de 30 cm). */
const IMPACT_CM_S = 250;
const NO_COLLIDER = new Set(['SPATULA', 'SCOOP', 'DROPPER', 'FILTER_PAPER', 'WEIGH_PAPER', 'TOWEL']);

/** Textura radial compartida para la sombra de contacto (calidad Baja, sin sombras proyectadas). */
let blobTex: THREE.Texture | null = null;
function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

/** Sombra de contacto: disco difuso bajo la base del objeto (§3.9, nivel Baja). */
function ContactShadow({ r, y = 0.03 }: { r: number; y?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} renderOrder={-1}>
      <planeGeometry args={[r * 2.8, r * 2.8]} />
      <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

function registerHits(lab: ReturnType<typeof useLab3D>, root: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData?.objId) {
      lab.hitMeshes.add(o as THREE.Mesh);
      list.push(o as THREE.Mesh);
    }
  });
  return () => list.forEach((m) => lab.hitMeshes.delete(m));
}

export function VesselBody({ id }: { id: string }) {
  const lab = useLab3D();
  const { rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const v0 = lab.runtime.world.vessels[id];
  const quality = lab.quality;
  const visual = useMemo(() => createVesselVisual(v0, quality), [id, quality]);  
  const st = useRef({ dynamic: false, still: 0, speed: 0, lastWrite: '' });
  const eye = useLab((s) => s.levelView);
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  useEffect(() => () => visual.dispose(), [visual]);
  const dim = VESSEL_DIM[v0.type];
  const init = poseToScene(v0.pose);

  useFrame((state, dt) => {
    const b = body.current;
    const w = lab.runtime.world;
    const v = w.vessels[id];
    if (!b || !v) return;
    const wantDynamic = lab.physicsActive.has(id) && v.support === 'bench' && v.integrity === 1 && lab.controller.held?.id !== id && !lab.animator.busy(id);
    const s = st.current;
    if (wantDynamic !== s.dynamic) {
      s.dynamic = wantDynamic;
      s.still = 0;
      if (wantDynamic) {
        const p = poseToScene(v.pose);
        b.setBodyType(rapier.RigidBodyType.Dynamic, true);
        b.setTranslation({ x: p.position[0], y: p.position[1], z: p.position[2] }, true);
        b.setRotation({ x: p.quaternion[0], y: p.quaternion[1], z: p.quaternion[2], w: p.quaternion[3] }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    }
    let pivotY: number;
    if (!s.dynamic) {
      const p = poseToScene(v.pose);
      b.setNextKinematicTranslation({ x: p.position[0], y: p.position[1], z: p.position[2] });
      b.setNextKinematicRotation({ x: p.quaternion[0], y: p.quaternion[1], z: p.quaternion[2], w: p.quaternion[3] });
      pivotY = p.position[1];
    } else {
      const t = b.translation();
      const r = b.rotation();
      const lv = b.linvel();
      const av = b.angvel();
      s.speed = Math.hypot(lv.x, lv.y, lv.z);
      pivotY = t.y;
      const pp = fromScene(t.x, t.y, t.z);
      const upright = Math.abs(r.x) < 0.02 && Math.abs(r.z) < 0.02;
      const key = `${pp.x.toFixed(2)}|${pp.y.toFixed(2)}|${pp.z.toFixed(2)}|${r.x.toFixed(3)}|${r.z.toFixed(3)}`;
      if (key !== s.lastWrite) {
        s.lastWrite = key;
        lab.runtime.dispatch({ type: 'setPose', id, pose: { x: pp.x, y: pp.y, z: Math.max(0, pp.z), rotationRad: 0, quat: upright ? undefined : [r.x, r.y, r.z, r.w] } });
      }
      // Caído de la mesada: el dominio registra la caída y el objeto vuelve al canto de la mesada.
      if (t.y < -12) {
        lab.physicsActive.delete(id);
        lab.controller.placeOnBench(id, false, pp.x < 0 ? -5 : pp.x > 560 ? 565 : pp.x, pp.y < 0 ? -5 : 70);
      } else if ((s.speed < 0.8 && Math.hypot(av.x, av.y, av.z) < 0.08) || b.isSleeping()) {
        s.still += dt;
        if (s.still > 0.3) {
          lab.physicsActive.delete(id);
          // Quedó apoyado encima de algo que no es un soporte (carcasa de un equipo, otro objeto): el dominio
          // lo tiene «en la mesada», así que se baja a un hueco libre para que nada quede suspendido.
          const rest = (v.type === 'FUNNEL' ? FUNNEL_STEM_CM : 0) + lab.controller.platformZ(pp.x, pp.y);
          // (Un recipiente volcado yace de costado: su altura es legítima y no se toca.)
          if (upright && pp.z - rest > 0.6) lab.controller.placeOnBench(id, false, pp.x, pp.y, false, false);
        }
      } else s.still = 0;
    }
    visual.update(lab.frame(state.clock.elapsedTime, dt, eye), v, pivotY);
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
        if (s.dynamic && dim.glass && s.speed > IMPACT_CM_S) {
          const r = lab.runtime.dispatch({ type: 'drop', id, impactCmS: s.speed, fell: false });
          lab.audio.play(r.code === 'BROKEN' ? 'break' : 'glass');
          if (r.code === 'BROKEN') lab.physicsActive.delete(id);
        } else if (s.dynamic && s.speed > 40) lab.audio.play('glass');
      }}
    >
      {!NO_COLLIDER.has(v0.type) && (
        <CylinderCollider
          args={[dim.h / 2, dim.footR]}
          position={[0, v0.type === 'FUNNEL' ? dim.h / 2 - 4 : dim.h / 2, 0]}
          friction={0.9}
          restitution={0.05}
          density={v0.type === 'JUG' || v0.type === 'WASH_BOTTLE' ? 0.6 : 1.2}
        />
      )}
      {NO_COLLIDER.has(v0.type) && <CuboidCollider args={[dim.footR, 0.15, dim.footR * 0.6]} position={[0, 0.15, 0]} friction={1} density={0.8} />}
      {!QUALITY[quality].shadows && !NO_COLLIDER.has(v0.type) && <ContactShadow r={dim.footR} y={v0.type === 'FUNNEL' ? -4 + 0.03 : 0.03} />}
      <primitive object={visual.group} />
    </RigidBody>
  );
}

// La base de cada colisionador usa la misma huella que la búsqueda de hueco libre del controlador.
const FP = PROP_FOOTPRINT;
const PROP_COLLIDERS: Record<string, Array<{ half: [number, number, number]; pos: [number, number, number] }>> = {
  hotplate: [{ half: [FP.hotplate.hx, 2.2, FP.hotplate.hy], pos: [0, 2.2, 0] }],
  balance: [{ half: [FP.balance.hx, 2.25, FP.balance.hy], pos: [0, 2.25, 0] }],
  stand: [{ half: [FP.stand.hx, 0.6, FP.stand.hy], pos: [0, 0.6, 0] }, { half: [0.5, 18, 0.5], pos: [-4, 18, 0] }],
  rack: [{ half: [FP.rack.hx, 0.3, FP.rack.hy], pos: [0, 0.3, 0] }, { half: [0.5, 3.5, 2.5], pos: [-12.5, 3.5, 0] }, { half: [0.5, 3.5, 2.5], pos: [12.5, 3.5, 0] }],
  tray: [{ half: [FP.tray.hx, 0.15, FP.tray.hy], pos: [0, 0.15, 0] }],
};

export function PropBody({ id }: { id: string }) {
  const lab = useLab3D();
  const body = useRef<RapierRigidBody>(null);
  const p0 = lab.runtime.world.props[id];
  const quality = lab.quality;
  const visual = useMemo(() => createPropVisual(p0, quality), [id, quality]);  
  const eye = useLab((s) => s.levelView);
  useEffect(() => registerHits(lab, visual.group), [lab, visual]);
  const init = poseToScene(p0.pose);
  useFrame((state, dt) => {
    const b = body.current;
    const p = lab.runtime.world.props[id];
    if (!b || !p) return;
    const s = poseToScene(p.pose);
    b.setNextKinematicTranslation({ x: s.position[0], y: s.position[1], z: s.position[2] });
    b.setNextKinematicRotation({ x: s.quaternion[0], y: s.quaternion[1], z: s.quaternion[2], w: s.quaternion[3] });
    visual.update(lab.frame(state.clock.elapsedTime, dt, eye), p);
  });
  const cols = PROP_COLLIDERS[p0.kind] ?? [];
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={init.position}>
      {cols.map((c, i) => (
        <CuboidCollider key={i} args={c.half} position={c.pos} friction={0.9} />
      ))}
      {!QUALITY[quality].shadows && cols[0] && <ContactShadow r={Math.max(cols[0].half[0], cols[0].half[2])} />}
      <primitive object={visual.group} />
    </RigidBody>
  );
}
