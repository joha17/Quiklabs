/**
 * Etiquetas fijas con el nombre de cada objeto del laboratorio (siempre visibles, no solo al seleccionar).
 * SOLO leen el estado. Los tubos muestran también su rótulo; en gradilla y bandeja se escalonan en altura
 * para que las etiquetas vecinas no se tapen.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab3D } from '../scene/context';
import { PROP_DIM, VESSEL_DIM } from '../physics/dimensions';
import { toScene } from '../units';
import { nameTagTexture } from '../renderers/textures';

/** Alto de la etiqueta en cm de escena (el ancho sigue al texto). */
const TAG_H = 1.15;
/** Alto mínimo en pantalla (px): de lejos la etiqueta no se encoge hasta volverse ilegible. */
const MIN_TAG_PX = 17;
/** Las etiquetas de objetos muy altos (soporte, piseta) no suben más de esto sobre la mesada. */
const MAX_TAG_Z = 21;

interface Slot {
  sprite: THREE.Sprite;
  key: string;
  aspect: number;
}

export function NameTags3D() {
  const lab = useLab3D();
  const root = useMemo(() => new THREE.Group(), []);
  const slots = useRef(new Map<string, Slot>());

  const camPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    const show = lab.host.showNames();
    root.visible = show;
    if (!show) return;
    const w = lab.runtime.world;
    camera.getWorldPosition(camPos);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 40;
    const cmPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, size.height);
    const seen = new Set<string>();
    const place = (id: string, text: string, x: number, y: number, z: number) => {
      seen.add(id);
      let slot = slots.current.get(id);
      if (!slot) {
        // Sin prueba de profundidad: la etiqueta se ve aunque otro objeto se interponga.
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
        sprite.renderOrder = 10;
        root.add(sprite);
        slot = { sprite, key: '', aspect: 1 };
        slots.current.set(id, slot);
      }
      const sel = lab.host.getSelected() === id;
      const key = `${text}|${sel}`;
      if (slot.key !== key) {
        slot.key = key;
        slot.sprite.material.map?.dispose();
        const tex = nameTagTexture(text, sel);
        slot.sprite.material.map = tex;
        slot.sprite.material.needsUpdate = true;
        slot.aspect = (tex.image as HTMLCanvasElement).width / (tex.image as HTMLCanvasElement).height;
      }
      const [X, Y, Z] = toScene(x, y, z);
      slot.sprite.position.set(X, Y, Z);
      const h = Math.max(TAG_H, MIN_TAG_PX * cmPerPx * camPos.distanceTo(slot.sprite.position));
      slot.sprite.scale.set(h * slot.aspect, h, 1);
      slot.sprite.visible = true;
    };

    for (const id in w.vessels) {
      const v = w.vessels[id];
      const sup = v.support ?? '';
      if (v.integrity === 0 || sup === 'glass_waste' || sup === 'funnel' || sup.startsWith('mouth:')) continue;
      const o = lab.animator.offset(id);
      const slotIdx = /^(rack|tray):(\d+)$/.exec(sup);
      // Dentro del baño, la etiqueta del vaso sube para no encimarse con la del cristalizador.
      const stagger = (slotIdx && Number(slotIdx[2]) % 2 ? 1.5 : 0) + (sup === 'bath' ? 2.6 : 0);
      const z = Math.min(MAX_TAG_Z, v.pose.z + (o?.dz ?? 0) + VESSEL_DIM[v.type].h + 1.2 + stagger);
      place(id, lab.host.nameTag(id), v.pose.x + (o?.dx ?? 0), v.pose.y + (o?.dy ?? 0), z);
    }
    for (const id in w.props) {
      const p = w.props[id];
      if (p.support === 'glass_waste' || p.support === null) continue;
      if (id === 'rod' && (w.devices.rod.vesselId || w.devices.rod.integrity === 0)) continue;
      if (id === 'probe' && w.devices.probe.vesselId) continue;
      const dim = PROP_DIM[p.kind] ?? PROP_DIM[id] ?? { footR: 2, h: 1 };
      // Bandeja y gradilla: etiqueta delante (los tubos llevan la suya encima). Soporte: en su base (arriba va el embudo).
      const front = p.kind === 'tray' || p.kind === 'rack' || p.kind === 'stand';
      const z = front ? 1 : Math.min(MAX_TAG_Z, p.pose.z + dim.h + 1.2);
      place(id, lab.host.nameTag(id), p.pose.x, p.pose.y - (front ? 4 : 0), z);
    }

    for (const [id, slot] of slots.current) if (!seen.has(id)) slot.sprite.visible = false;
  });

  return <primitive object={root} />;
}
