/**
 * Cámara orbital de F101: vistas por estación (A–F), transición suave, zoom a objeto y «vista de lectura» normal a
 * cada escala: desde arriba para el calibrador, la regla, el dinamómetro y la escala angular de la mesa; de frente
 * para el micrómetro y la pantalla de la balanza; horizontal a la altura del menisco para la probeta. A diferencia de
 * las prácticas de química, la cámara puede mirar casi en vertical (escalas horizontales).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ORBIT_LIMITS, confineCamera } from '../scene/room';
import { useF101Lab } from './context';
import { BENCH_F101, F101_STATIONS } from '../../practices/practice-f101/definition';
import { GEOF101, TABLE_CENTER } from '../../simulation/f101-world/geometry';
import { fromScene, toScene } from '../units';
import { T, gradCylMouth, meniscusZ, micrometerAxis, rimPoint } from './layout';

interface Tween {
  fromT: THREE.Vector3;
  toT: THREE.Vector3;
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  u: number;
}

const OBJ_H: Record<string, number> = {
  gaugeBlock: 1, massStd: 3, metalCyl: 5, steelBall: 2, tissue: 1, level: 2, returnTray: 3, caliper: 1, micrometer: 5, ruler: 1,
  balance: 9, dish: 2, gradCyl: 20, forceTable: 30, pulley: 30, hanger: 10, slotMass: 1, massRack: 6, dynamometer: 3, sensorBox: 5,
};

function view(target: [number, number, number], dist: number, elevation: number, azimuth = 0) {
  const t = new THREE.Vector3(...toScene(...target));
  const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).normalize();
  return { target: t, pos: t.clone().add(dir.multiplyScalar(dist)) };
}

export function CameraRigF101() {
  const lab = useF101Lab();
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
    /** Ojo casi vertical sobre el punto (un leve corrimiento hacia el operador evita la singularidad del orbitador). */
    const above = (x: number, y: number, z: number, dist: number) => {
      const t = new THREE.Vector3(...toScene(x, y, z));
      go(t, t.clone().add(new THREE.Vector3(0, dist, dist * 0.03)));
    };
    lab.camera = {
      goToStation: (id) => {
        const s = F101_STATIONS.find((q) => q.id === id) ?? F101_STATIONS[0];
        const v = view(s.target, s.dist * aspectK(), s.elevation);
        go(v.target, v.pos);
      },
      lookAt: (x, y, z, dist = 40, elevation = 0.5) => {
        const v = view([x, y, z], dist, elevation);
        go(v.target, v.pos);
      },
      focusObject: (id, close) => {
        const o = lab.runtime.world.objects[id];
        if (!o) return;
        const p = id.startsWith('pulley') ? { x: TABLE_CENTER.x, y: TABLE_CENTER.y, z: 0 } : o.pose;
        const h = Math.min(30, OBJ_H[o.kind] ?? 6);
        const t = new THREE.Vector3(...toScene(p.x, p.y, p.z + h / 2));
        const dist = close ? Math.max(14, h * 2.2) : Math.max(30, h * 3.5);
        const c = controls.current;
        const dir = c ? cam.position.clone().sub(c.target).normalize() : new THREE.Vector3(0, 0.5, 0.866);
        go(t, t.clone().add(dir.multiplyScalar(dist)));
      },
      eyeLevel: (target) => {
        const w = lab.runtime.world;
        const o = w.objects[target]?.pose;
        if (!o) return;
        switch (target) {
          case 'caliper01':
            above(o.x + 4, o.y, o.z + 0.6, 20);
            return;
          case 'ruler01':
            above(o.x, o.y, o.z, 36);
            return;
          case 'micrometer01': {
            const a = micrometerAxis(w);
            front(a.x + 3, a.y, a.z, 16);
            return;
          }
          case 'gradCyl01': {
            const m = gradCylMouth(w);
            // La cámara queda a la altura del menisco; el corrimiento del escenario S06 lo suma el controlador.
            front(m.x, m.y, meniscusZ(w), 18);
            return;
          }
          case 'balance01':
            front(o.x - 2.5, o.y, 3, 26);
            return;
          case 'dynamometer01': {
            const d = w.table.dyn;
            const p = d.onRim ? rimPoint(d.angleDeg, 10, T.topZ + 1) : { x: o.x, y: o.y, z: o.z + 1 };
            above(p.x, p.y, p.z, 26);
            return;
          }
          case 'forceTable01':
            above(TABLE_CENTER.x, TABLE_CENTER.y, GEOF101.forceTable.topZ, 62);
            return;
        }
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
        if (c.target.x + dx < 0 || c.target.x + dx > BENCH_F101.length) return;
        c.target.x += dx;
        cam.position.x += dx;
      },
      setOrbitEnabled: (on) => {
        if (controls.current) controls.current.enabled = on;
      },
    };
    if (!placed.current && controls.current) {
      const s = F101_STATIONS[0];
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
      c.target.x = THREE.MathUtils.clamp(c.target.x, -10, BENCH_F101.length + 10);
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
      minPolarAngle={0.02}
      maxPolarAngle={1.56}
      screenSpacePanning
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    />
  );
}
