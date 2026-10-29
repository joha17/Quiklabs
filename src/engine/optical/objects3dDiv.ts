/**
 * Vistas 3D procedurales de los objetos propios de B06 (§4): maceta de Tradescantia, frasco de aceite de inmersión
 * (cuyo nivel baja con lo usado), pañuelo, zona sin desinfectar, placa cerrada de B. cereus, caja de lancetas
 * bloqueada, frascos de Wright y tampón, y las fichas del reto. Como en B01–B05, SOLO leen el estado del dominio.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { DivWorld } from '../../simulation/div-world/types';
import { GEO_B06 } from '../../simulation/div-world/geometry';
import type { MaterialSet } from '../renderers/materials';
import type { CellVisual } from './objects3dCell';
import { hitMesh } from './parts';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;
type Label = (lines: string[], w: number, h: number, band: string) => THREE.Mesh;

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
const flat = (m: THREE.Mesh, x: number, y: number, z: number) => {
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
};

/** Construye la vista de un objeto de B06 en `group`; null si la clase no es de B06. */
export function buildDivObject(o: OpticalObject, w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: Label, seg: number): CellVisual | null {
  const id = o.id;
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }));
  switch (o.kind) {
    case 'plantPot': {
      const P = GEO_B06.pot;
      const pot = cyl(P.r, P.h * 0.55, std(0xb5643c), seg);
      pot.position.y = P.h * 0.275;
      const soil = cyl(P.r * 0.92, 0.3, std(0x4a3524), seg);
      soil.position.y = P.h * 0.55;
      group.add(pot, soil);
      // Hojas lanceoladas violáceas por debajo y verdes por arriba.
      const leafGeo = new THREE.SphereGeometry(1, 10, 6);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = new THREE.Mesh(leafGeo, std(i % 2 ? 0x5f8a3a : 0x7a4a8a));
        leaf.scale.set(0.9, 0.25, 3);
        leaf.rotation.set(-0.5, a, 0);
        leaf.position.set(Math.sin(a) * 2.2, P.h * 0.75, Math.cos(a) * 2.2);
        group.add(leaf);
      }
      group.add(flat(label([o.label ?? 'Tradescantia'], 7, 1.2, '#6a1b9a'), 0, 0.05, P.r + 1.6));
      group.add(at(hitMesh(new THREE.CylinderGeometry(P.r, P.r, P.h, 10), id), 0, P.h / 2, 0));
      return { ringR: P.r + 1 };
    }
    case 'oilBottle': {
      const O = GEO_B06.oil;
      const glass = cyl(O.r, O.h, own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.6, transparent: true, opacity: 0.35, roughness: 0.1 })), seg);
      glass.position.y = O.h / 2;
      const oil = cyl(O.r * 0.9, 1, std(0xe8d48a, { transparent: true, opacity: 0.8 }), seg);
      const cap = cyl(O.r * 0.6, 1.2, mats.blackPlastic, seg);
      cap.position.y = O.h + 0.6;
      group.add(glass, oil, cap, flat(label(['Aceite de inmersión'], 6, 1, '#8d6e00'), 0, 0.05, O.r + 1.2));
      group.add(at(hitMesh(new THREE.CylinderGeometry(O.r + 0.3, O.r + 0.3, O.h + 1.2, 10), id), 0, (O.h + 1.2) / 2, 0));
      return {
        ringR: O.r + 1,
        update: (ctx) => {
          const d = (ctx.world as DivWorld).div;
          const f = d ? Math.max(0.05, d.bottles.oil / Math.max(1e-6, d.ledger.oil.initialMl)) : 1;
          const hh = (O.h - 0.6) * f;
          oil.scale.y = hh;
          oil.position.y = 0.3 + hh / 2;
        },
      };
    }
    case 'wrightBottle': {
      const isBuf = id === 'buf';
      const glass = cyl(1.2, 5, std(isBuf ? 0xcfe3f0 : 0x5a2a6a, { transparent: true, opacity: 0.85 }), seg);
      glass.position.y = 2.5;
      const cap = cyl(0.5, 1.4, mats.blackPlastic, seg);
      cap.position.y = 5.7;
      group.add(glass, cap, flat(label([isBuf ? 'Tampón' : 'Wright'], 4, 1, isBuf ? '#1565c0' : '#4a148c'), 0, 0.05, 2.4));
      group.add(at(hitMesh(new THREE.CylinderGeometry(1.5, 1.5, 6.4, 10), id), 0, 3.2, 0));
      return { ringR: 2 };
    }
    case 'tissue': {
      const t = box(5, 0.25, 5, std(0xfafafa, { roughness: 0.95 }));
      t.position.y = 0.13;
      group.add(t, at(hitMesh(new THREE.BoxGeometry(5, 1, 5), id), 0, 0.5, 0));
      return { ringR: 3.4 };
    }
    case 'dirtyZone': {
      const Z = GEO_B06.zone;
      const z = box(Z.w, 0.05, Z.d, std(0xc9a64a, { transparent: true, opacity: 0.45 }));
      z.position.y = 0.03;
      group.add(z, flat(label([o.label ?? 'Zona sin desinfectar'], Z.w * 0.8, 1.6, '#e65100'), 0, 0.08, 0));
      group.add(at(hitMesh(new THREE.BoxGeometry(Z.w, 0.4, Z.d), id), 0, 0.2, 0));
      return { ringR: Z.w / 2 };
    }
    case 'culturePlate': {
      const P = GEO_B06.plate;
      const base = cyl(P.r, P.h, std(0xf3e6c0, { transparent: true, opacity: 0.85 }), seg);
      base.position.y = P.h / 2;
      const lid = cyl(P.r + 0.2, 0.2, own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })), seg);
      lid.position.y = P.h + 0.1;
      const tape = box(P.r * 2.1, 0.25, 0.8, std(0xd32f2f));
      tape.position.y = P.h + 0.3;
      group.add(base, lid, tape, flat(label(['B. cereus · cerrado'], 7, 1.1, '#b71c1c'), 0, 0.05, P.r + 1.4));
      group.add(at(hitMesh(new THREE.CylinderGeometry(P.r, P.r, P.h + 0.5, 10), id), 0, (P.h + 0.5) / 2, 0));
      return { ringR: P.r + 1 };
    }
    case 'lancetBox': {
      const b = new THREE.Mesh(new RoundedBoxGeometry(6, 2, 4, 2, 0.3), std(0xeceff1));
      b.position.y = 1;
      const lock = box(6.2, 0.4, 0.6, std(0xd32f2f));
      lock.position.y = 2.1;
      group.add(b, lock, flat(label(['Lancetas · no permitidas'], 7, 1, '#b71c1c'), 0, 0.05, 3.2));
      group.add(at(hitMesh(new THREE.BoxGeometry(6, 2.4, 4), id), 0, 1.2, 0));
      return { ringR: 4 };
    }
    case 'sampleCards': {
      const C = GEO_B06.cards;
      const board = box(C.w, 0.3, C.d, std(0xfff8e1));
      board.position.y = 0.15;
      group.add(board);
      for (let i = 0; i < 8; i++) {
        const card = box(2.8, 0.06, 3.6, std(i < 4 ? 0x81c784 : 0x90caf9));
        card.position.set(-5.2 + (i % 4) * 3.4, 0.34, -1.9 + Math.floor(i / 4) * 4);
        group.add(card);
      }
      group.add(flat(label([o.label ?? 'Fichas del reto'], C.w * 0.8, 1.2, '#00695c'), 0, 0.4, C.d / 2 + 1));
      group.add(at(hitMesh(new THREE.BoxGeometry(C.w, 0.8, C.d), id), 0, 0.4, 0));
      return { ringR: C.w / 2 };
    }
  }
  void w0;
  return null;
}
