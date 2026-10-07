/**
 * Cámara orbital de la Práctica 10: vistas por estación (balanza, volumetría, reactor, recolección de gas, Boyle,
 * lavadero), transición suave, zoom a objeto y vista horizontal a la altura del menisco (bureta, probeta, balón,
 * pipeta) o del cero de la regla, sin paralaje. Mismo comportamiento que las prácticas 2 a 6.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ORBIT_LIMITS, confineCamera } from '../scene/room';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useGasLab } from './context';
import { BENCH10, P10_STATIONS } from '../../practices/practice-10/definition';
import { fromScene, toScene } from '../units';
import { buretteInBathXY, buretteZ, cylinderLevelZ, flaskLevelZ, pipetteLevelZ } from './layout';

interface Tween {
  fromT: THREE.Vector3;
  toT: THREE.Vector3;
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  u: number;
}

const OBJ_H: Record<string, number> = {
  abalance: 22, watchGlass: 1, spatula: 2, bicarbJar: 9, beaker150: 9, funnel: 9, flask: 17, pipette: 44, propipette: 6, washBottle: 16, waterBottle: 24,
  vinegarBottle: 20, cylinder: 19, erlenmeyer: 15, stopper: 3, beaker600: 13, burette: 60, stand: 75, uTube: 14, thermometer: 18, barometer: 20, ruler: 30,
  sensor: 8, datalogger: 6, syringe: 3, sink: 10,
};

function view(target: [number, number, number], dist: number, elevation: number, azimuth = 0) {
  const t = new THREE.Vector3(...toScene(...target));
  const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).normalize();
  return { target: t, pos: t.clone().add(dir.multiplyScalar(dist)) };
}

export function CameraRig10() {
  const lab = useGasLab();
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const tween = useRef<Tween | null>(null);
  const placed = useRef(false);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const reduced = () => lab.host.reducedMotion();
    const go = (target: THREE.Vector3, pos: THREE.Vector3) => {
      const c = controls.current;
      if (!c) return;
      tween.current = { fromT: c.target.clone(), toT: target, fromP: cam.position.clone(), toP: pos, u: reduced() ? 1 : 0 };
    };
    const aspectK = () => Math.max(0.8, Math.min(1.4, 1.5 / Math.max(0.6, size.width / Math.max(1, size.height))));
    const horizontal = (x: number, y: number, z: number, dist = 22) => {
      const t = new THREE.Vector3(...toScene(x, y, z));
      go(t, t.clone().add(new THREE.Vector3(0, 0, dist)));
    };
    lab.camera = {
      goToStation: (id) => {
        const s = P10_STATIONS.find((q) => q.id === id) ?? P10_STATIONS[0];
        const v = view(s.target, s.dist * aspectK(), s.elevation);
        go(v.target, v.pos);
      },
      lookAt: (x, y, z, dist = 40, elevation = 0.5) => {
        const v = view([x, y, z], dist, elevation);
        go(v.target, v.pos);
      },
      focusObject: (id, close) => {
        const w = lab.runtime.world;
        const o = w.objects[id];
        const p = o?.pose ?? null;
        if (!p) return;
        const h = o ? Math.min(30, OBJ_H[o.kind] ?? 6) : 4;
        const t = new THREE.Vector3(...toScene(p.x, p.y, p.z + h / 2));
        const dist = close ? Math.max(14, h * 2.2) : Math.max(30, h * 3.5);
        const c = controls.current;
        const dir = c ? cam.position.clone().sub(c.target).normalize() : new THREE.Vector3(0, 0.5, 0.866);
        go(t, t.clone().add(dir.multiplyScalar(dist)));
      },
      eyeLevel: (target) => {
        // Cámara horizontal a la altura del menisco: lectura sin paralaje (§9, §15.5).
        const w = lab.runtime.world;
        if (target === 'burette' || target === 'ruler') {
          const xy = buretteInBathXY(w);
          const z = buretteZ(w);
          horizontal(xy.x, xy.y, target === 'ruler' ? (z.meniscus + z.outer) / 2 : z.meniscus, target === 'ruler' ? 40 : 18);
          return;
        }
        if (target === 'balance') {
          const b = w.objects.abalance.pose;
          horizontal(b.x, b.y - 8, 5, 28);
          return;
        }
        const o = w.objects[target].pose;
        const z = target === 'cylinder' ? cylinderLevelZ(w) : target === 'flask' ? flaskLevelZ(w) : pipetteLevelZ(w);
        horizontal(o.x, o.y, z, 16);
      },
      orbit: (dAz, dPol) => {
        const c = controls.current;
        if (!c) return;
        const off = cam.position.clone().sub(c.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta += dAz;
        sph.phi = THREE.MathUtils.clamp(sph.phi + dPol, 0.42, 1.55);
        off.setFromSpherical(sph);
        go(c.target.clone(), c.target.clone().add(off));
      },
      zoomBy: (f) => {
        const c = controls.current;
        if (!c) return;
        const off = cam.position.clone().sub(c.target);
        const len = THREE.MathUtils.clamp(off.length() / f, ORBIT_LIMITS.minDistance, ORBIT_LIMITS.maxDistance);
        go(c.target.clone(), c.target.clone().add(off.setLength(len)));
      },
      reset: () => lab.camera?.goToStation('A'),
      screenOf: (x, y, z) => {
        const v = new THREE.Vector3(...toScene(x, y, z)).project(cam);
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
      },
      settle: () => {
        const tw = tween.current;
        const c = controls.current;
        if (tw && c) {
          c.target.copy(tw.toT);
          cam.position.copy(tw.toP);
          c.update();
          tween.current = null;
        }
      },
      position: () => fromScene(cam.position.x, cam.position.y, cam.position.z),
      edgePan: (dir, dt) => {
        const c = controls.current;
        if (!c) return;
        const dx = dir * 60 * dt;
        if (c.target.x + dx < 0 || c.target.x + dx > BENCH10.length + 60) return;
        c.target.x += dx;
        cam.position.x += dx;
      },
      setOrbitEnabled: (on) => {
        if (controls.current) controls.current.enabled = on;
      },
    };
    if (!placed.current && controls.current) {
      const s = P10_STATIONS[0];
      const v = lab.savedView
        ? { target: new THREE.Vector3(...lab.savedView.target), pos: new THREE.Vector3(...lab.savedView.pos) }
        : view(s.target, s.dist * aspectK(), s.elevation);
      cam.position.copy(v.pos);
      controls.current.target.copy(v.target);
      controls.current.update();
      placed.current = true;
    }
    const ctl = controls.current;
    return () => {
      if (ctl) lab.savedView = { target: ctl.target.toArray(), pos: cam.position.toArray() };
      lab.camera = null;
    };
  }, [lab, camera, size.width, size.height]);

  useFrame((_, dt) => {
    const c = controls.current;
    const tw = tween.current;
    if (c && tw) {
      tw.u = Math.min(1, tw.u + dt * 2.2);
      const k = 1 - (1 - tw.u) ** 3;
      c.target.lerpVectors(tw.fromT, tw.toT, k);
      camera.position.lerpVectors(tw.fromP, tw.toP, k);
      if (tw.u >= 1) tween.current = null;
    }
    if (c) {
      c.target.x = THREE.MathUtils.clamp(c.target.x, -10, BENCH10.length + 70);
      c.target.y = THREE.MathUtils.clamp(c.target.y, -2, 80);
      c.target.z = THREE.MathUtils.clamp(c.target.z, -66, 10);
      if (camera.position.y < 0.5) camera.position.y = 0.5;
      c.update();
      confineCamera(camera);
    }
    lab.camPos.copy(camera.position);
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      {...ORBIT_LIMITS}
      minPolarAngle={0.42}
      maxPolarAngle={1.56}
      screenSpacePanning
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    />
  );
}
