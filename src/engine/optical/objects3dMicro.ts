/**
 * Vistas 3D procedurales de los objetos propios de B07 (§4): frascos de medio deshidratado, tubo de caldo, placas selladas
 * (colonias como textura, nunca una malla por colonia), bandeja, visor macroscópico, tablero de trazado, asa, área de
 * frotis, rejilla de tinción, frascos con gotero y maquetas no operables. Solo leen el estado del dominio.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { MicroWorld } from '../../simulation/micro-world/types';
import { GEO_B07 } from '../../simulation/micro-world/geometry';
import { PLATE_IMAGE_PX, plateLayout } from '../../simulation/micro-world/model';
import type { MaterialSet } from '../renderers/materials';
import { drawPlate } from '../instruments/optical/illustrationsMicro';
import type { CellVisual } from './objects3dCell';
import { hitMesh } from './parts';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;
type Label = (lines: string[], w: number, h: number, band: string) => THREE.Mesh;

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
const flat = (m: THREE.Mesh, x: number, y: number, z: number) => {
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
};

const STAIN_COLOR: Record<string, number> = { stP: 0x4b2a86, stM: 0x8a5a1e, stD: 0xd9d2b8, stC: 0xc93e6b, stW: 0xcfe6f2 };

/** Textura de la placa: la misma imagen que el visor. En pruebas sin canvas, un color liso. */
function plateTexture(plateId: string, w: MicroWorld, own: Own): THREE.Texture | null {
  const p = w.micro?.plates[plateId];
  if (!p || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawPlate(ctx, 256, PLATE_IMAGE_PX, p.medium, plateLayout(plateId, p.profile));
  const t = own(new THREE.CanvasTexture(canvas));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMicroObject(o: OpticalObject, w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: Label, seg: number): CellVisual | null {
  const id = o.id;
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }));
  const glass = () => own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, roughness: 0.08, depthWrite: false }));
  const plaque = (text: string, width: number, band: string, z: number) => flat(label([text], width, 1.2, band), 0, 0.05, z);
  switch (o.kind) {
    case 'mediaJar': {
      const J = GEO_B07.jar;
      const body = new THREE.Mesh(new RoundedBoxGeometry(J.w, J.h * 0.8, J.d, 3, 0.5), glass());
      body.position.y = J.h * 0.4;
      const powder = box(J.w * 0.84, J.h * 0.42, J.d * 0.84, std(id === 'mEMB' ? 0xb79ea8 : 0xd9c9a0, { roughness: 0.95 }));
      powder.position.y = J.h * 0.23;
      const cap = cyl(J.w * 0.36, J.h * 0.16, mats.blackPlastic, seg);
      cap.position.y = J.h * 0.88;
      group.add(powder, body, cap, plaque(o.label ?? 'Medio', 7.5, '#5d4037', J.d / 2 + 1.1));
      group.add(at(hitMesh(new THREE.BoxGeometry(J.w, J.h, J.d), id), 0, J.h / 2, 0));
      return { ringR: J.w * 0.75 };
    }
    case 'brothTube': {
      const B = GEO_B07.broth;
      const turbid = !!(w0 as MicroWorld).scenarios?.includes('S07');
      const tube = cyl(B.r, B.h, glass(), seg);
      tube.position.y = B.h / 2;
      const liq = cyl(B.r * 0.88, B.h * 0.6, std(0xe3c780, { transparent: true, opacity: turbid ? 0.9 : 0.45 }), seg);
      liq.position.y = B.h * 0.31;
      const cap = cyl(B.r * 1.05, 1, std(0xc62828), seg);
      cap.position.y = B.h + 0.5;
      group.add(liq, tube, cap, plaque(o.label ?? 'Caldo', 6, '#5d4037', B.r + 1.1));
      group.add(at(hitMesh(new THREE.CylinderGeometry(B.r, B.r, B.h + 1, 12), id), 0, (B.h + 1) / 2, 0));
      return { ringR: B.r + 1 };
    }
    case 'petriPlate': {
      const P = GEO_B07.plate;
      const tex = plateTexture(id, w0 as MicroWorld, own);
      const restricted = !!(w0 as MicroWorld).micro?.plates[id]?.restricted;
      const agar = cyl(P.r * 0.95, P.h * 0.5, tex ? std(0xffffff, { map: tex }) : std(0xd9c58a), seg);
      agar.position.y = P.h * 0.27;
      const lid = cyl(P.r, P.h, glass(), seg);
      lid.position.y = P.h / 2;
      group.add(agar, lid);
      if (restricted) {
        const tape = box(P.r * 2.1, 0.25, 0.9, std(0xd32f2f));
        tape.position.y = P.h + 0.15;
        group.add(tape);
      }
      group.add(at(hitMesh(new THREE.CylinderGeometry(P.r, P.r, P.h + 0.4, 12), id), 0, (P.h + 0.4) / 2, 0));
      return { ringR: P.r + 0.6 };
    }
    case 'plateTray': {
      const T = GEO_B07.tray;
      const base = box(T.w, 0.5, T.d, std(0x90a4ae));
      base.position.y = 0.25;
      const walls = [[0, T.d / 2, T.w, 0.5], [0, -T.d / 2, T.w, 0.5], [T.w / 2, 0, 0.5, T.d], [-T.w / 2, 0, 0.5, T.d]];
      for (const [x, z, wd, dp] of walls) group.add(at(box(wd, T.h, dp, std(0x90a4ae)), x, T.h / 2, z));
      group.add(base, plaque(o.label ?? 'Placas selladas', 10, '#37474f', T.d / 2 + 1.2));
      group.add(at(hitMesh(new THREE.BoxGeometry(T.w, T.h, T.d), id), 0, T.h / 2, 0));
      return { ringR: T.w / 2 + 1 };
    }
    case 'plateViewer': {
      const V = GEO_B07.viewer;
      const body = new THREE.Mesh(new RoundedBoxGeometry(V.w, V.h, V.d, 3, 0.6), std(0x455a64));
      body.position.y = V.h / 2;
      const light = cyl(5.2, 0.12, std(0xfff8e1, { emissive: 0xfff3c4, emissiveIntensity: 0.55 }), seg);
      light.position.y = V.h + 0.06;
      group.add(body, light, plaque(o.label ?? 'Visor con retícula', 11, '#263238', V.d / 2 + 1.2));
      group.add(at(hitMesh(new THREE.BoxGeometry(V.w, V.h, V.d), id), 0, V.h / 2, 0));
      return { ringR: V.w / 2 + 1 };
    }
    case 'streakBoard': {
      const B = GEO_B07.board;
      const base = box(B.w, B.h, B.d, std(0xeceff1));
      base.position.y = B.h / 2;
      const disc = cyl(4.5, 0.08, std(0xd9c58a), seg);
      disc.position.y = B.h + 0.04;
      group.add(base, disc, plaque(o.label ?? 'Trazado digital', 9, '#00695c', B.d / 2 + 1.1));
      group.add(at(hitMesh(new THREE.BoxGeometry(B.w, B.h + 0.2, B.d), id), 0, (B.h + 0.2) / 2, 0));
      return { ringR: B.w / 2 + 0.6 };
    }
    case 'transferLoop': {
      const L = GEO_B07.loop.length;
      const handle = cyl(0.35, L * 0.6, std(0x37474f), 10);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0.4, L * 0.15);
      const wire = cyl(0.06, L * 0.36, std(0xb0bec5, { metalness: 0.7, roughness: 0.3 }), 6);
      wire.rotation.x = Math.PI / 2;
      wire.position.set(0, 0.4, -L * 0.33);
      const tip = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 14), std(0xb0bec5, { metalness: 0.7, roughness: 0.3 }));
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0.4, -L * 0.53);
      group.add(handle, wire, tip);
      group.add(at(hitMesh(new THREE.BoxGeometry(1.2, 1, L), id), 0, 0.5, 0));
      return { ringR: 3 };
    }
    case 'smearPad': {
      const P = GEO_B07.pad;
      const b = box(P.w, P.h, P.d, std(0xf5f5f5));
      b.position.y = P.h / 2;
      group.add(b, plaque(o.label ?? 'Área de frotis', 8, '#6a1b9a', P.d / 2 + 1));
      group.add(at(hitMesh(new THREE.BoxGeometry(P.w, P.h, P.d), id), 0, P.h / 2, 0));
      return { ringR: P.w / 2 + 0.5 };
    }
    case 'stainRack': {
      const R = GEO_B07.rack;
      const m = std(0x78909c, { metalness: 0.5, roughness: 0.4 });
      for (const z of [-R.d / 2 + 0.4, R.d / 2 - 0.4]) group.add(at(box(R.w, 0.3, 0.3, m), 0, R.h, z));
      for (const x of [-R.w / 2 + 0.4, R.w / 2 - 0.4]) for (const z of [-R.d / 2 + 0.4, R.d / 2 - 0.4]) group.add(at(box(0.4, R.h, 0.4, m), x, R.h / 2, z));
      const sink = box(R.w + 1, 0.5, R.d + 1, std(0xcfd8dc));
      sink.position.y = 0.25;
      group.add(sink, plaque(o.label ?? 'Rejilla de tinción', 9, '#4a148c', R.d / 2 + 1.5));
      group.add(at(hitMesh(new THREE.BoxGeometry(R.w, R.h + 0.4, R.d), id), 0, (R.h + 0.4) / 2, 0));
      return { ringR: R.w / 2 + 1 };
    }
    case 'stainBottle': {
      const S = GEO_B07.bottle;
      const b = cyl(S.r, S.h, std(STAIN_COLOR[id] ?? 0xcccccc, { transparent: true, opacity: 0.85, roughness: 0.25 }), seg);
      b.position.y = S.h / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 10), mats.blackPlastic);
      tip.position.y = S.h + 0.8;
      group.add(b, tip, plaque(o.label ?? '', 6.5, '#37474f', S.r + 1));
      group.add(at(hitMesh(new THREE.CylinderGeometry(S.r, S.r, S.h + 1.6, 10), id), 0, (S.h + 1.6) / 2, 0));
      return { ringR: S.r + 0.8 };
    }
    case 'autoclaveMock': {
      const M = GEO_B07.mock;
      const b = cyl(M.w / 2, M.h, std(0x9e9e9e, { metalness: 0.4, roughness: 0.45 }), seg);
      b.position.y = M.h / 2;
      group.add(b, plaque(o.label ?? 'Autoclave · maqueta', 11, '#b71c1c', M.d / 2 + 1.2));
      group.add(at(hitMesh(new THREE.CylinderGeometry(M.w / 2, M.w / 2, M.h, 12), id), 0, M.h / 2, 0));
      return { ringR: M.w / 2 + 1 };
    }
    case 'burnerMock': {
      const b = cyl(2.4, 0.8, std(0x546e7a), seg);
      b.position.y = 0.4;
      const tube = cyl(0.7, 8, std(0x78909c, { metalness: 0.5 }), 12);
      tube.position.y = 4.8;
      group.add(b, tube, plaque(o.label ?? 'Mechero · maqueta', 9, '#b71c1c', 3.6));
      group.add(at(hitMesh(new THREE.CylinderGeometry(2.4, 2.4, 9, 10), id), 0, 4.5, 0));
      return { ringR: 3.4 };
    }
  }
  return null;
}
