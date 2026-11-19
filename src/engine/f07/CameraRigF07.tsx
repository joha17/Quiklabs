/**
 * Cámara orbital de F07: vistas por estación (A–F), transición suave, zoom a objeto y «vista de lectura» normal a
 * cada escala: de frente a la burbuja del nivel y a la regla de posición (sin paralaje), al calibre, y a las pantallas
 * de la balanza y del registrador.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ORBIT_LIMITS, ROOM } from '../scene/room';
import { useF07Lab } from './context';
import { F07_STATIONS } from '../../practices/practice-f07/definition';
import { fromScene, toScene } from '../units';
import { eyePoint, objRoom } from './layout';

interface Tween {
  fromT: THREE.Vector3;
  toT: THREE.Vector3;
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  u: number;
}

const OBJ_H: Record<string, number> = {
  track: 10, endStop: 8, launcher: 8, level: 4, cart: 12, cartMass: 3, massRack: 6, balance: 8, caliper: 3, gate: 16, forceSensor: 4, logger: 8, camera: 34, posRuler: 3, bumperKit: 4,
};

/** Mantiene la cámara dentro de la sala y sobre la mesada (delante de ella puede bajar hasta 12 cm del suelo). */
function confineF07(camera: THREE.Camera) {
  const p = camera.position;
  p.x = THREE.MathUtils.clamp(p.x, ROOM.xMin + 14, ROOM.xMax - 14);
  p.z = THREE.MathUtils.clamp(p.z, ROOM.zBack + 4, ROOM.zFront - 14);
  const yMin = p.z > 8 ? ROOM.yFloor + 12 : 1;
  p.y = THREE.MathUtils.clamp(p.y, yMin, ROOM.yCeil - 14);
}

function view(target: [number, number, number], dist: number, elevation: number, azimuth = 0) {
  const t = new THREE.Vector3(...toScene(...target));
  const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).normalize();
  return { target: t, pos: t.clone().add(dir.multiplyScalar(dist)) };
}

export function CameraRigF07() {
  const lab = useF07Lab();
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
    /** Ojo horizontal frente al punto (desde −y de la mesada). */
    const front = (x: number, y: number, z: number, dist: number) => {
      const t = new THREE.Vector3(...toScene(x, y, z));
      go(t, t.clone().add(new THREE.Vector3(0, 0, dist)));
    };
    lab.camera = {
      goToStation: (id) => {
        const s = F07_STATIONS.find((q) => q.id === id) ?? F07_STATIONS[0];
        const v = view(s.target, s.dist * aspectK(), s.elevation, s.azimuth ?? 0);
        go(v.target, v.pos);
      },
      lookAt: (x, y, z, dist = 40, elevation = 0.5) => {
        const v = view([x, y, z], dist, elevation);
        go(v.target, v.pos);
      },
      focusObject: (id, close) => {
        const o = lab.runtime.world.objects[id];
        if (!o) return;
        const w = lab.runtime.world;
        const p = o.support === 'hand' ? o.pose : objRoom(w, id);
        const h = Math.min(30, OBJ_H[o.kind] ?? 6);
        const t = new THREE.Vector3(...toScene(p.x, p.y, p.z + h / 2));
        const dist = close ? Math.max(14, h * 2.2) : Math.max(30, h * 3.5);
        const c = controls.current;
        const dir = c ? cam.position.clone().sub(c.target).normalize() : new THREE.Vector3(0, 0.5, 0.866);
        go(t, t.clone().add(dir.multiplyScalar(dist)));
      },
      eyeLevel: (target) => {
        const w = lab.runtime.world;
        const e = eyePoint(w, target);
        if (target === 'balance01') {
          // El estante de pesas queda entre el operador y la balanza: la pantalla se lee un poco desde arriba.
          const v = view([e.x, e.y, e.z], 30, 0.38);
          go(v.target, v.pos);
          return;
        }
        // Escalas y pantallas: de frente, a la altura del índice (el ojo en la normal de la escala).
        const dist = target === 'level01' || target === 'ruler01' || target === 'caliper01' ? 26 : target === 'cartA' || target === 'cartB' || target === 'launcherA' || target === 'launcherB' ? 45 : target === 'camera01' ? 60 : 30;
        front(e.x, e.y, e.z, dist);
      },
      orbit: (dAz, dPol) => {
        const c = controls.current;
        if (!c) return;
        const off = cam.position.clone().sub(c.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta += dAz;
        sph.phi = THREE.MathUtils.clamp(sph.phi + dPol, 0.05, 1.55);
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
      target: () => {
        const c = controls.current;
        return c ? fromScene(c.target.x, c.target.y, c.target.z) : { x: 0, y: 0, z: 0 };
      },
      edgePan: (dir, dt) => {
        const c = controls.current;
        if (!c) return;
        const dx = dir * 60 * dt;
        if (c.target.x + dx < -120 || c.target.x + dx > 740) return;
        c.target.x += dx;
        cam.position.x += dx;
      },
      setOrbitEnabled: (on) => {
        if (controls.current) controls.current.enabled = on;
      },
    };
    if (!placed.current && controls.current) {
      const s = F07_STATIONS[0];
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
      c.target.x = THREE.MathUtils.clamp(c.target.x, -120, 740);
      c.target.y = THREE.MathUtils.clamp(c.target.y, -88, 175);
      c.target.z = THREE.MathUtils.clamp(c.target.z, -66, 225);
      c.update();
      confineF07(camera);
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
      maxDistance={460}
      minAzimuthAngle={-Math.PI}
      maxAzimuthAngle={Math.PI}
      minPolarAngle={0.02}
      maxPolarAngle={1.56}
      screenSpacePanning
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    />
  );
}
