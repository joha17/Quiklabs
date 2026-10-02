/**
 * Cámara orbital limitada (§3.8): vistas predefinidas por estación con transición suave, «nivel del ojo»
 * alineado con el menisco, zoom a objeto y controles accesibles (API para la interfaz).
 * La órbita no atraviesa la mesada (ángulo polar limitado) y el objetivo se mantiene sobre la mesada.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useLab3D } from './context';
import { STATIONS, BENCH } from '../../practices/practice-02/definition';
import { toScene } from '../units';
import { SHAPES, liquidLevel } from '../physics/geometry';
import { VESSEL_DIM } from '../physics/dimensions';
import { liquidVolumeMl } from '../../simulation/solutions/mixture';
import { useLab } from '../../app/store';

interface Tween {
  fromT: THREE.Vector3;
  toT: THREE.Vector3;
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  u: number;
}

/** Vista de estación: objetivo sobre la mesada, cámara delante y arriba (~35° de elevación). */
function stationView(id: string, aspect: number) {
  const s = STATIONS.find((q) => q.id === id) ?? STATIONS[0];
  const cx = (s.x0 + s.x1) / 2;
  const width = s.x1 - s.x0 + 6;
  // Distancia para encuadrar ~90 % del ancho de la estación con fov 38° (los extremos quedan a un giro de cámara):
  // así el instrumental se ve con detalle sin acercar a mano.
  const dist = Math.max(55, Math.min(160, (width / 2 / Math.tan((38 * Math.PI) / 360)) / Math.max(0.8, aspect) * 0.86));
  const target = new THREE.Vector3(cx, 5, -28);
  const dir = new THREE.Vector3(0, 0.55, 0.835).normalize();
  return { target: target.toArray(), pos: target.clone().add(dir.multiplyScalar(dist)).toArray() };
}

export function CameraRig() {
  const lab = useLab3D();
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const tween = useRef<Tween | null>(null);
  const placed = useRef(false);
  const reduced = () => lab.host.reducedMotion();
  const setLevelView = useLab((s) => s.setLevelViewFlag);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const go = (target: THREE.Vector3, pos: THREE.Vector3) => {
      const c = controls.current;
      if (!c) return;
      tween.current = { fromT: c.target.clone(), toT: target, fromP: cam.position.clone(), toP: pos, u: reduced() ? 1 : 0 };
    };
    const objectCenter = (id: string) => {
      const w = lab.runtime.world;
      const v = w.vessels[id];
      const p = v?.pose ?? w.props[id]?.pose;
      if (!p) return null;
      const h = v ? VESSEL_DIM[v.type].h : 6;
      return { p, h };
    };
    lab.camera = {
      goToStation: (id) => {
        const v = stationView(id, size.width / Math.max(1, size.height));
        go(new THREE.Vector3(...v.target), new THREE.Vector3(...v.pos));
        setLevelView(false);
      },
      lookAt: (x, y, z, dist = 40) => {
        const t = new THREE.Vector3(...toScene(x, y, z));
        const dir = new THREE.Vector3(0, 0.5, 0.866).normalize();
        go(t, t.clone().add(dir.multiplyScalar(dist)));
      },
      focusObject: (id, close) => {
        const o = objectCenter(id);
        if (!o) return;
        const t = new THREE.Vector3(...toScene(o.p.x, o.p.y, o.p.z + o.h / 2));
        const dist = close ? Math.max(14, o.h * 2.4) : Math.max(28, o.h * 4);
        const c = controls.current;
        const dir = c ? cam.position.clone().sub(c.target).normalize() : new THREE.Vector3(0, 0.5, 0.866);
        go(t, t.clone().add(dir.multiplyScalar(dist)));
      },
      eyeLevel: (id) => {
        if (!id) {
          setLevelView(false);
          const c = controls.current;
          if (c) {
            const t = c.target.clone();
            go(t, t.clone().add(new THREE.Vector3(0, 0.55, 0.835).multiplyScalar(70)));
          }
          return;
        }
        const w = lab.runtime.world;
        const v = w.vessels[id];
        if (!v) return;
        const sh = SHAPES[v.type];
        const level = v.pose.z + (sh ? liquidLevel(sh, 0, liquidVolumeMl(v.mix, lab.runtime.ctx.subs)) : 5);
        const t = new THREE.Vector3(...toScene(v.pose.x, v.pose.y, level));
        // Cámara a la altura exacta del menisco, de frente y cerca: lectura sin paralaje.
        go(t, t.clone().add(new THREE.Vector3(0, 0, 16)));
        setLevelView(true);
      },
      orbit: (dAz, dPol) => {
        const c = controls.current;
        if (!c) return;
        const off = cam.position.clone().sub(c.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta += dAz;
        sph.phi = THREE.MathUtils.clamp(sph.phi + dPol, 0.25, 1.4);
        off.setFromSpherical(sph);
        go(c.target.clone(), c.target.clone().add(off));
      },
      zoomBy: (f) => {
        const c = controls.current;
        if (!c) return;
        const off = cam.position.clone().sub(c.target);
        const len = THREE.MathUtils.clamp(off.length() / f, 10, 320);
        go(c.target.clone(), c.target.clone().add(off.setLength(len)));
      },
      reset: () => {
        const c = controls.current;
        const x = c?.target.x ?? 55;
        const s = STATIONS.find((q) => x >= q.x0 && x < q.x1) ?? STATIONS[0];
        lab.camera?.goToStation(s.id);
      },
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
      elevationTo: (x, y, z) => {
        const p = new THREE.Vector3(...toScene(x, y, z));
        return { dy: cam.position.y - p.y, dist: Math.hypot(cam.position.x - p.x, cam.position.z - p.z) };
      },
      edgePan: () => undefined,
      reveal: () => undefined,
      setOrbitEnabled: () => undefined,
    };
    const api = lab.camera!;
    api.reveal = (x: number) => {
      const c = controls.current;
      if (!c || Math.abs(x - c.target.x) < 40) return;
      const d = x - c.target.x;
      go(c.target.clone().add(new THREE.Vector3(d, 0, 0)), cam.position.clone().add(new THREE.Vector3(d, 0, 0)));
    };
    api.edgePan = (dir: -1 | 1, dt: number) => {
      const c = controls.current;
      if (!c) return;
      const dx = dir * 60 * dt;
      if (c.target.x + dx < 0 || c.target.x + dx > BENCH.length) return;
      c.target.x += dx;
      cam.position.x += dx;
    };
    api.setOrbitEnabled = (on: boolean) => {
      if (controls.current) controls.current.enabled = on;
    };
    // Vista inicial: estación A (solo al montar; redimensionar la ventana no mueve la cámara).
    // Si la escena se recrea (cambio de calidad o contexto restaurado), se conserva la vista anterior.
    if (!placed.current && controls.current) {
      const v = lab.savedView ?? stationView('A', size.width / Math.max(1, size.height));
      cam.position.set(...v.pos);
      controls.current.target.set(...v.target);
      controls.current.update();
      placed.current = true;
    }
    const ctl = controls.current;
    return () => {
      if (ctl) lab.savedView = { target: ctl.target.toArray(), pos: cam.position.toArray() };
      lab.camera = null;
    };
  }, [lab, camera, size.width, size.height, setLevelView]);  

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
      // El objetivo no sale de la mesada (ni por debajo).
      c.target.x = THREE.MathUtils.clamp(c.target.x, -10, BENCH.length + 70);
      c.target.y = THREE.MathUtils.clamp(c.target.y, -2, 60);
      c.target.z = THREE.MathUtils.clamp(c.target.z, -66, 10);
      if (camera.position.y < 1) camera.position.y = 1;
      c.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={10}
      maxDistance={320}
      minPolarAngle={0.2}
      maxPolarAngle={1.52}
      screenSpacePanning
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    />
  );
}
