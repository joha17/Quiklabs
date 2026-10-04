/**
 * Puente de interacción 3D (§3.8, §7): registra el `ViewAdapter` del controlador (rayo del puntero,
 * selección sobre volúmenes simples, plano de arrastre) y enruta los eventos del puntero/rueda.
 * Si el puntero toca un objeto, el evento NO llega a la órbita de cámara; si toca el fondo, la cámara orbita.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab3D } from './context';
import type { ViewAdapter } from '../interaction/viewport';
import { fromScene } from '../units';

export function InteractionBridge() {
  const lab = useLab3D();
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
      for (let p = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    };
    const adapter: ViewAdapter = {
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
      edgePan: (dir, dt) => lab.camera?.edgePan(dir, dt),
      zoomBy: (f) => lab.camera?.zoomBy(f),
      reveal: (x) => lab.camera?.reveal(x),
      setOrbitEnabled: (on) => lab.camera?.setOrbitEnabled(on),
      releaseToPhysics: (id, isProp) => {
        if (isProp) return false;
        const v = lab.runtime.world.vessels[id];
        if (!v || v.type === 'FUNNEL') return false;
        lab.physicsActive.add(id);
        return true;
      },
    };
    lab.controller.view = adapter;

    const el = gl.domElement;
    const host = el.parentElement ?? el;
    const rel = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const c = lab.controller;
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
      c.onPointerDown(p.x, p.y, e.button, e.pointerId);
      // Si se tomó un objeto (o una perilla), la cámara no recibe el gesto.
      if (adapter.pick(p.x, p.y, null)) {
        e.stopPropagation();
        el.setPointerCapture?.(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (lab.locked) return;
      const p = rel(e);
      // Botones «acordados»: con el izquierdo pulsado, pulsar/soltar el derecho llega como pointermove (no pointerdown).
      if (e.button === 2) {
        if (e.buttons & 2) {
          if (c.held) c.secondaryDown();
        } else c.secondaryUp();
        return;
      }
      if (e.button === 0 && !(e.buttons & 1)) {
        c.onPointerUp(p.x, p.y, e.pointerId); // se soltó el izquierdo mientras el derecho seguía pulsado
        return;
      }
      c.onPointerMove(p.x, p.y, e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      if (lab.locked) return;
      const p = rel(e);
      if (e.button === 2) {
        c.secondaryUp();
        return;
      }
      c.onPointerUp(p.x, p.y, e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      if (!lab.locked && c.onWheel(e.deltaY)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onDbl = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const hit = adapter.pick(e.clientX - r.left, e.clientY - r.top, null);
      if (hit) lab.camera?.focusObject(hit.id, true);
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      lab.contextLost = true;
      lab.host.notify('warn', 'hint.contextLost');
    };
    const onRestored = () => {
      lab.contextLost = false;
      lab.host.notify('info', 'hint.contextRestored');
      // Las texturas, geometrías y sombras del contexto perdido no son fiables: se recrea la escena desde el estado.
      lab.rebuildScene?.();
    };
    host.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    host.addEventListener('wheel', onWheel, { capture: true, passive: false });
    host.addEventListener('dblclick', onDbl);
    const onMenu = (e: Event) => e.preventDefault();
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
