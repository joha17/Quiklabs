/**
 * Escena 3D (React Three Fiber + Rapier) — §3.1, §3.3.
 * Orden de cada fotograma: dominio con paso fijo (runtime.advance) → interacción → animaciones →
 * física de objetos (60 Hz, propia) → vistas (solo leen) → efectos → render.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LabContext, useLab3D } from './context';
import type { Lab3D } from '../Lab3D';
import { GRAVITY } from '../units';
import { QUALITY, pickQuality, type QualityLevel } from '../quality';
import { BENCH_EXT, FLOOR_Y, ROOM, WALL_Z, createRoom } from './room';
import { VesselBody, PropBody } from './Bodies';
import { CameraRig } from './CameraRig';
import { InteractionBridge } from './InteractionBridge';
import { Effects3D } from '../effects/Effects3D';
import { NameTags3D } from '../effects/NameTags3D';
import { DemoCursor3D } from '../effects/DemoCursor3D';
import { useLab } from '../../app/store';

/** Pasos por fotograma como máximo al reproducir acelerado (demostración). */
const MAX_SUBSTEPS = 24;

/** Avance del dominio (paso fijo), interacción y animaciones: el primer suscriptor de cada fotograma. */
function Driver() {
  const lab = useLab3D();
  useFrame((_, dtRaw) => {
    const pb = lab.playback;
    if (pb.paused) return;
    // Reproducción más rápida = varios pasos normales por fotograma (no un paso más largo): así acoples, vertidos y
    // la piseta se comportan igual a cualquier velocidad. Más lenta = paso más corto.
    const n = pb.speed > 1 ? Math.min(MAX_SUBSTEPS, Math.round(pb.speed)) : 1;
    const dt = Math.min(dtRaw, 0.1) * (pb.speed > 1 ? 1 : pb.speed);
    const rt = lab.runtime;
    lab.animator.reduced = lab.host.reducedMotion();
    for (let i = 0; i < n; i++) {
      // La aceleración de tiempo se suspende mientras se vierte o se aprieta la piseta (precisión de medida).
      const busy = Object.keys(rt.world.pours).length > 0 || lab.controller.squeezing;
      const scale = rt.timeScale;
      if (busy) rt.timeScale = 1;
      rt.advance(dt);
      rt.timeScale = scale;
      lab.animator.update(dt);
      lab.controller.frame(dt);
      lab.onFrame?.(dt);
    }
    const w = rt.world;
    const boiling = Object.values(w.vessels).some((v) => v.support === 'hotplate' && v.mix.waterG > 0 && v.temperatureC > 99) ? 1 : 0;
    lab.audio.ambient(w.devices.hotplate.powerPct, boiling);
  });
  return null;
}

export function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    scene.background = new THREE.Color(0xdfe5e8);
    // Niebla leve: la mesada se ve nítida y la sala se aclara hacia el fondo, así la atención queda en el trabajo.
    scene.fog = new THREE.Fog(0xdfe5e8, 260, 820);
    return () => {
      scene.fog = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Luz direccional con sombra que sigue a la estación visible (sombras nítidas en un área acotada). */
export function Lights({ q }: { q: QualityLevel }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const { controls } = useThree() as unknown as { controls: { target: THREE.Vector3 } | null };
  const p = QUALITY[q];
  useFrame(() => {
    const l = light.current;
    const t = controls?.target;
    if (!l || !t) return;
    l.position.set(t.x + 50, 160, t.z + 90);
    l.target.position.set(t.x, 0, t.z);
    l.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={[0xffffff, 0x8a7e72, 0.75]} />
      <ambientLight intensity={0.15} />
      <directionalLight
        ref={light}
        intensity={2.2}
        castShadow={p.shadows}
        shadow-mapSize={[p.shadowMapSize, p.shadowMapSize]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

export function Room({ q, variant = 'p2' }: { q: QualityLevel; variant?: 'p2' | 'p3' | 'p4' }) {
  const room = useMemo(() => createRoom(q, variant), [q, variant]);
  return (
    <>
      <primitive object={room} />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[(BENCH_EXT + 12) / 2, 1.6, 33.5]} position={[(BENCH_EXT - 12) / 2, -1.6, -33]} friction={0.9} />
        <CuboidCollider args={[(ROOM.xMax - ROOM.xMin) / 2, 1, (ROOM.zFront - ROOM.zBack) / 2]} position={[(ROOM.xMin + ROOM.xMax) / 2, FLOOR_Y - 1, (ROOM.zFront + ROOM.zBack) / 2]} friction={0.9} />
        <CuboidCollider args={[(ROOM.xMax - ROOM.xMin) / 2, 140, 1]} position={[(ROOM.xMin + ROOM.xMax) / 2, 50, WALL_Z - 1]} />
        <CuboidCollider args={[(ROOM.xMax - ROOM.xMin) / 2, 140, 1]} position={[(ROOM.xMin + ROOM.xMax) / 2, 50, ROOM.zFront + 1]} />
        <CuboidCollider args={[1, 140, (ROOM.zFront - ROOM.zBack) / 2]} position={[ROOM.xMin - 1, 50, (ROOM.zFront + ROOM.zBack) / 2]} />
        <CuboidCollider args={[1, 140, (ROOM.zFront - ROOM.zBack) / 2]} position={[ROOM.xMax + 1, 50, (ROOM.zFront + ROOM.zBack) / 2]} />
      </RigidBody>
    </>
  );
}

function Objects() {
  const lab = useLab3D();
  useLab((s) => s.version);
  const w = lab.runtime.world;
  const vesselIds = Object.keys(w.vessels).join(',');
  const propIds = Object.keys(w.props).join(',');
  const vs = useMemo(() => vesselIds.split(',').filter(Boolean), [vesselIds]);
  const ps = useMemo(() => propIds.split(',').filter(Boolean), [propIds]);
  return (
    <>
      {ps.map((id) => (
        <PropBody key={id} id={id} />
      ))}
      {vs.map((id) => (
        <VesselBody key={id} id={id} />
      ))}
    </>
  );
}

const WARMUP_S = 4;
const PROBE_S = 3;

/** Medición de rendimiento y selección automática de calidad (§3.9). */
function PerfProbe({ onQuality }: { onQuality: (q: QualityLevel) => void }) {
  const lab = useLab3D();
  const { gl } = useThree();
  // Los primeros segundos compilan shaders y suben texturas: se descartan antes de medir (calentamiento).
  const acc = useRef({ frames: 0, time: 0, total: 0, probeFrames: 0, probeTime: 0, decided: false });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.time += dt;
    a.total += dt;
    if (a.total > WARMUP_S) {
      a.probeFrames++;
      a.probeTime += dt;
    }
    if (a.time >= 1) {
      const fps = a.frames / a.time;
      lab.stats = { fps: Math.round(fps), calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries };
      a.frames = 0;
      a.time = 0;
    }
    // Cambiar de calidad recrea la escena: nunca mientras se sostiene un objeto o lo apoya la física.
    const busy = !!lab.controller.held || lab.physicsActive.size > 0;
    if (!a.decided && !busy && a.probeTime >= PROBE_S && useLab.getState().settings.quality === 'AUTO') {
      a.decided = true;
      const next = pickQuality(a.probeFrames / a.probeTime, lab.quality);
      if (next !== lab.quality) onQuality(next);
    }
  });
  return null;
}

export function LabScene({ lab }: { lab: Lab3D }) {
  const setting = useLab((s) => s.settings.quality ?? 'AUTO');
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
      camera={{ fov: 38, near: 1, far: 3000, position: [55, 60, 70] }}
      onCreated={({ gl, scene, camera }) => {
        lab.three = { gl, scene, camera };
        gl.localClippingEnabled = true;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      data-testid="lab-3d"
    >
      <LabContext.Provider value={lab}>
        <Driver />
        <Environment />
        <Lights q={q} />
        <Physics gravity={[0, GRAVITY, 0]} timeStep={1 / 60} interpolate colliders={false}>
          <Room q={q} />
          <Objects />
        </Physics>
        <Effects3D />
        <NameTags3D />
        <DemoCursor3D />
        <CameraRig />
        <InteractionBridge />
        <PerfProbe onQuality={setAuto} />
      </LabContext.Provider>
    </Canvas>
  );
}
