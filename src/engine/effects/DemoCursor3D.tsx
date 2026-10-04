/**
 * Mano de la demostración: un puntero que acompaña lo que la demostración toma, arrastra o pulsa, para que el
 * estudiante vea dónde haría clic. SOLO lee `lab.demoCursor`.
 */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab3D } from '../scene/context';
import { toScene } from '../units';
import { demoPointerTexture } from '../renderers/textures';

/** Alto mínimo en pantalla (px), como las etiquetas de nombre. */
const MIN_PX = 34;

export function DemoCursor3D() {
  const lab = useLab3D();
  const tex = useMemo(() => ({ up: demoPointerTexture(false), down: demoPointerTexture(true) }), []);
  const sprite = useMemo(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.up, transparent: true, depthTest: false, depthWrite: false }));
    s.renderOrder = 12;
    // La punta de la flecha (esquina superior izquierda del dibujo) marca el punto.
    s.center.set(30 / 128, 1 - 30 / 128);
    return s;
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
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 40;
    const cmPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, size.height);
    const h = Math.max(2.4, MIN_PX * cmPerPx * camPos.distanceTo(sprite.position));
    sprite.scale.set(h, h, 1);
  });

  return <primitive object={sprite} />;
}
