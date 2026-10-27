/**
 * Vistas 3D procedurales de los objetos propios de B02 (§4.2): fuentes de tejido (frutos y tubérculo cortados),
 * tabla de corte con el fragmento que espera, espátula, caja de hisopos, hisopos (limpio, cargado, usado), fuente
 * virtual de epitelio y papelera común. Como en B01, SOLO leen el estado del dominio.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { CellKind } from '../../simulation/specimens/thin-section';
import type { StainId } from '../../simulation/specimens/thin-section';
import { GEO_B02 } from '../../simulation/cell-world/geometry';
import type { MaterialSet } from '../renderers/materials';
import type { FrameCtxB01 } from './OpticalLab3D';
import { hitMesh } from './parts';

/** Color de cada muestra (pulpa) y de cada colorante. */
export const KIND_COLOR: Record<CellKind, number> = {
  elodea: 0x4f9a3a, potato: 0xeee2b8, tomato: 0xd8402a, pepper: 0xe8b218, carrot: 0xec7a12, pear: 0xeee8c8, guava: 0xf0b8a8, apple: 0xf3eccb, buccal: 0xe8dcd4,
};
export const STAIN_COLOR: Record<StainId, number> = { water: 0x9cc8ea, lugol: 0x8a4a1e, 'methylene-blue': 0x2a5fb8, 'eosin-1pct': 0xe0507a };
const SKIN: Partial<Record<CellKind, number>> = { potato: 0x9c7a4c, tomato: 0xc0281a, pepper: 0xe0a800, carrot: 0xe06a10, pear: 0xb8c050, guava: 0x9cbc5c, apple: 0xc8382a };

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;

export interface CellVisual {
  update?: (ctx: FrameCtxB01, ob: OpticalObject) => void;
  ringR: number;
}

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

/** Construye la vista de un objeto de B02 en `group`; null si la clase no es de B02. */
export function buildCellObject(o: OpticalObject, w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: (lines: string[], w: number, h: number, band: string) => THREE.Mesh, seg: number): CellVisual | null {
  const id = o.id;
  switch (o.kind) {
    case 'tissueSource': {
      const kind = w0.cell?.sources[id]?.kind ?? 'apple';
      const S = GEO_B02.source;
      const dish = cyl(S.r + 1.2, 0.3, mats.porcelain, seg);
      dish.position.y = 0.15;
      // Medio fruto con la cara de corte hacia arriba (pulpa) y la piel por debajo.
      const half = new THREE.Mesh(new THREE.SphereGeometry(S.r, seg, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), own(new THREE.MeshStandardMaterial({ color: SKIN[kind] ?? 0x999999, roughness: 0.55 })));
      half.position.y = S.h * 0.9 + 0.3;
      const flesh = new THREE.Mesh(new THREE.CircleGeometry(S.r * 0.98, seg), own(new THREE.MeshStandardMaterial({ color: KIND_COLOR[kind], roughness: 0.7 })));
      flesh.rotation.x = -Math.PI / 2;
      flesh.position.y = S.h * 0.9 + 0.31;
      const lbl = label([o.label ?? id], 5, 1, kind === 'apple' ? '#6d4c41' : '#2e7d32');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.32, S.r + 2);
      group.add(dish, half, flesh, lbl, at(hitMesh(new THREE.CylinderGeometry(S.r + 1, S.r + 1, S.h + 1, 10), id), 0, (S.h + 1) / 2, 0));
      return {
        ringR: S.r + 1.6,
        update: (ctx) => {
          const src = ctx.world.cell?.sources[id];
          // Lo que se corta se nota: la pieza se achica con la masa retirada.
          const f = src ? Math.max(0.55, Math.cbrt(src.massMg / Math.max(1, src.initialMg))) : 1;
          half.scale.setScalar(f);
          flesh.scale.setScalar(f);
          half.position.y = (S.h * 0.9) * f + 0.3;
          flesh.position.y = (S.h * 0.9) * f + 0.31;
        },
      };
    }
    case 'cuttingBoard': {
      const B = GEO_B02.board;
      const b = new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 2, 0.3), mats.wood);
      b.position.y = B.h / 2;
      b.castShadow = b.receiveShadow = true;
      const fragMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.9 }));
      const frag = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), fragMat);
      frag.rotation.x = -Math.PI / 2;
      frag.position.y = B.h + 0.02;
      const lbl = label(['Tabla de corte'], 6, 1, '#6d4c41');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, B.h + 0.01, B.d / 2 - 1);
      group.add(b, frag, lbl, at(hitMesh(new THREE.BoxGeometry(B.w, B.h + 0.4, B.d), id), 0, B.h / 2, 0));
      return {
        ringR: 8,
        update: (ctx) => {
          const f = ctx.world.cell?.board;
          frag.visible = !!f;
          if (f) {
            const L = Math.sqrt(2 * f.areaMm2) / 10;
            frag.scale.set(L, L * 0.6, 1);
            frag.position.y = B.h + 0.02 + Math.min(0.5, f.thicknessMm / 10);
            fragMat.color.setHex(KIND_COLOR[f.kind]);
          }
        },
      };
    }
    case 'spatula': {
      const L = GEO_B02.spatula.length;
      const handle = box(0.7, 0.35, L * 0.6, mats.wood);
      handle.position.set(0, 0.18, L * 0.3 - L / 2 + L * 0.4);
      const blade = box(1.1, 0.05, L * 0.4, mats.steel);
      blade.position.set(0, 0.06, -L / 2 + L * 0.2);
      const load = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), own(new THREE.MeshStandardMaterial({ color: 0xffffff })));
      load.rotation.x = -Math.PI / 2;
      load.position.set(0, 0.1, -L / 2 + 0.6);
      group.add(handle, blade, load, at(hitMesh(new THREE.BoxGeometry(1.4, 1, L), id), 0, 0.4, 0));
      return {
        ringR: 1.6,
        update: (ctx) => {
          const f = ctx.world.cell?.held.sp;
          load.visible = !!f;
          if (f) (load.material as THREE.MeshStandardMaterial).color.setHex(KIND_COLOR[f.kind]);
        },
      };
    }
    case 'swabBox': {
      const B = GEO_B02.swabBox;
      const b = box(B.w, B.h, B.d, mats.plasticWhite);
      b.position.y = B.h / 2;
      const lbl = label(['Hisopos estériles'], 6, 1, '#00695c');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, B.d / 2 + 0.8);
      group.add(b, lbl, at(hitMesh(new THREE.BoxGeometry(B.w, B.h + 0.4, B.d), id), 0, B.h / 2, 0));
      return { ringR: 5 };
    }
    case 'swab': {
      const L = GEO_B02.swab.length;
      const stick = cyl(0.12, L, mats.paper, 8);
      stick.rotation.x = Math.PI / 2;
      stick.position.y = 0.2;
      const tipMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), tipMat);
      tip.scale.set(1, 1, 1.8);
      tip.position.set(0, 0.25, -L / 2);
      group.add(stick, tip, at(hitMesh(new THREE.BoxGeometry(1, 1, L), id), 0, 0.3, 0));
      return {
        ringR: 1.4,
        update: (ctx) => {
          const s = ctx.world.cell?.swabs[id];
          tipMat.color.setHex(s?.state === 'loaded' ? 0xe8c8c0 : s?.state === 'used' ? 0xb8a898 : 0xffffff);
        },
      };
    }
    case 'cheekSource': {
      const C = GEO_B02.cheek;
      const b = new THREE.Mesh(new RoundedBoxGeometry(C.w, C.h, C.d, 3, 1), own(new THREE.MeshStandardMaterial({ color: 0xe8b4a8, roughness: 0.6 })));
      b.position.y = C.h / 2;
      const lbl = label(['Fuente virtual de epitelio', '(sin muestra real)'], 7, 1.6, '#ad1457');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, C.d / 2 + 1.2);
      group.add(b, lbl, at(hitMesh(new THREE.BoxGeometry(C.w, C.h + 0.5, C.d), id), 0, C.h / 2, 0));
      return { ringR: 5 };
    }
    case 'trashBin': {
      const T = GEO_B02.trash;
      const bin = cyl(T.r, T.h, own(new THREE.MeshStandardMaterial({ color: 0x8d99a6 })), seg);
      bin.position.y = T.h / 2;
      const lbl = label(['Residuos comunes'], 7, 2, '#37474f');
      lbl.position.set(0, T.h * 0.6, T.r + 0.05);
      group.add(bin, lbl, at(hitMesh(new THREE.CylinderGeometry(T.r, T.r, T.h, 10), id), 0, T.h / 2, 0));
      return { ringR: T.r + 0.6 };
    }
  }
  return null;
}

/** Color de la gota de un montaje B02 según los colorantes que contiene (mezcla ponderada por volumen). */
export function mountTint(stainMl: Partial<Record<StainId, number>>, waterMl: number): number {
  const parts: Array<[number, number]> = [[STAIN_COLOR.water, waterMl]];
  for (const [s, v] of Object.entries(stainMl)) if ((v ?? 0) > 0) parts.push([STAIN_COLOR[s as StainId], (v ?? 0) * 3]);
  const tot = parts.reduce((a, [, v]) => a + v, 0) || 1;
  const c = new THREE.Color(0, 0, 0);
  for (const [hex, v] of parts) c.add(new THREE.Color(hex).multiplyScalar(v / tot));
  return c.getHex();
}
