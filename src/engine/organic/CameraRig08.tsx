/**
 * Cámara orbital de la Práctica 8: vistas por estación (reconocimiento, agua, clavos, cilindro, análisis, entrega),
 * transición suave, zoom a objeto y vista horizontal a la altura del menisco (probeta, pipeta) o de la pantalla de un
 * instrumento (balanza, termómetro, calibrador), sin paralaje. Mismo comportamiento que las demás prácticas.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ORBIT_LIMITS, confineCamera } from '../scene/room';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useOrganicLab } from './context';
import { BENCH08, P08_STATIONS } from '../../practices/practice-08/definition';
import { fromScene, toScene } from '../units';
import { levelsZ } from './layout';
import { GEO08 } from '../../simulation/organic-world/geometry';

interface Tween {
  fromT: THREE.Vector3;
  toT: THREE.Vector3;
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  u: number;
}

const OBJ_H: Record<string, number> = {
  balance: 12, watchGlass: 1, pipette: 35, filler: 7, cylinder: 17, erlenmeyer: 13, washBottle: 18, thermometer: 18, caliper: 3, solidCylinder: 2.5,
  nailsDish: 2, weighBoat: 2, reservoir: 10, iceBath: 14, spillTray: 3, waste: 13, recBeaker: 10, recTubes: 12, recFunnel: 9, recFilter: 1, recSpatula: 1,
  recBurette: 60, recAnalytical: 22, recRuler: 1,
};

function view(target: [number, number, number], dist: number, elevation: number, azimuth = 0) {
  const t = new THREE.Vector3(...toScene(...target));
  const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).normalize();
  return { target: t, pos: t.clone().add(dir.multiplyScalar(dist)) };
}

export function CameraRig08() {
  const lab = useOrganicLab();
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
        const s = P08_STATIONS.find((q) => q.id === id) ?? P08_STATIONS[0];
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
        // Cámara horizontal a la altura del menisco, de las fases o de la pantalla del instrumento: sin paralaje (§14.2).
        const w = lab.runtime.world;
        const id = target === 'balance' ? 'balance01' : target;
        const o = w.objects[id]?.pose;
        if (!o) return;
        if (id === 'balance01') return horizontal(o.x, o.y - 10, 4, 34);
        if (id === 'plate01') return horizontal(o.x, o.y - 6, GEO08.plate.h * 0.55, 34);
        if (id === 'analyzer01' || id === 'mp01') return horizontal(o.x, o.y - 4, GEO08.analyzer.h * 0.6, 34);
        if (id === 'frac01') return horizontal(o.x, o.y - 4, GEO08.fractionModule.h * 0.3, 40);
        if (id === 'th01') return horizontal(o.x, o.y, o.z + 16, 16);
        const v = w.vessels[id];
        if (v) {
          const lv = levelsZ(w, v);
          // Con dos fases se mira la interfase; con una, el menisco.
          const z = lv.interface > lv.floor + 0.05 && lv.surface - lv.interface > 0.05 ? (lv.interface + lv.surface) / 2 : Math.max(lv.surface, lv.floor + 0.5);
          return horizontal(o.x, o.y, z, v.shape === 'cyl10' || v.shape === 'cyl25' || v.shape === 'vial' ? 18 : 22);
        }
        if (w.droppers[id]) return horizontal(o.x, o.y, o.z + 3, 12);
        horizontal(o.x, o.y, o.z + 1.5, 18);
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
        if (c.target.x + dx < 0 || c.target.x + dx > BENCH08.length + 60) return;
        c.target.x += dx;
        cam.position.x += dx;
      },
      setOrbitEnabled: (on) => {
        if (controls.current) controls.current.enabled = on;
      },
    };
    if (!placed.current && controls.current) {
      const s = P08_STATIONS[0];
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
      c.target.x = THREE.MathUtils.clamp(c.target.x, -10, BENCH08.length + 70);
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
