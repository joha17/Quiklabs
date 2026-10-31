/**
 * Vistas 3D procedurales de los objetos propios de B09 (§4): plántulas de fríjol y de maíz en tubo de vidrio (raíz a la vista),
 * con cada zona rotulable marcada con su letra; rama leñosa con corte visible; pecíolo de apio y hoja sobre plato. Giran según
 * los grados que el mundo registra y, como en B01–B08, SOLO leen el estado del dominio.
 */
import * as THREE from 'three';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { PlantWorld } from '../../simulation/plant-world/types';
import { GEO_B09 } from '../../simulation/plant-world/geometry';
import type { MaterialSet } from '../renderers/materials';
import type { CellVisual } from './objects3dCell';
import { hitMesh } from './parts';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;
type Label = (lines: string[], w: number, h: number, band: string) => THREE.Mesh;

const cyl = (r: number, h: number, m: THREE.Material, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

/** Rama cilíndrica entre dos puntos. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const d = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, d.length(), 8), m);
  mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return mesh;
}

/** Letra de zona: siempre de frente a la cámara, para que se lea al girar la plántula. */
function letterTag(t: string, own: Own) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#263238';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 42px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, 32, 34);
  const sprite = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: own(new THREE.CanvasTexture(c)) })));
  sprite.scale.set(1.3, 1.3, 1);
  return sprite;
}

/** Lámina elíptica; `long` la alarga (hoja de maíz) y `tilt` la inclina hacia afuera. */
function blade(len: number, wid: number, m: THREE.Material, angle: number, tilt: number, roll = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(wid / 2, len * 0.45, 0, len);
  shape.quadraticCurveTo(-wid / 2, len * 0.45, 0, 0);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10), m);
  const g = new THREE.Group();
  mesh.rotation.set(-tilt, 0, roll);
  g.add(mesh);
  g.rotation.y = angle;
  return g;
}

export function buildPlantObject(o: OpticalObject, w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: Label, seg: number): CellVisual | null {
  const id = o.id;
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }));
  const leaf = () => own(new THREE.MeshStandardMaterial({ color: id === 'maize' ? 0x5da23f : 0x4f8f3a, roughness: 0.7, side: THREE.DoubleSide }));
  const tag = (t: string, x: number, y: number, z: number) => at(letterTag(t, own), x, y, z);
  switch (o.kind) {
    case 'plantSpecimen': {
      const P = GEO_B09.plant;
      const spin = new THREE.Group();
      const glass = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.24, roughness: 0.08, depthWrite: false }));
      const tube = cyl(2.6, 7.5, glass, seg);
      tube.position.y = 3.75;
      const water = cyl(2.4, 5.5, own(new THREE.MeshStandardMaterial({ color: 0xd6ecf2, transparent: true, opacity: 0.3, depthWrite: false })), seg);
      water.position.y = 2.85;
      const stemM = std(id === 'maize' ? 0x8bb35a : 0x7ba84a);
      const rootM = std(0xe9dfc4);
      const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      if (id === 'bean') {
        spin.add(limb(v(0, 7, 0), v(0, P.h - 1.5, 0), 0.32, stemM));
        // Raíz axonomorfa: una principal con laterales.
        spin.add(limb(v(0, 7, 0), v(0, 0.8, 0), 0.26, rootM));
        for (const [y, s] of [[5, 1], [3.8, -1], [2.6, 1]] as const) spin.add(limb(v(0, y, 0), v(s * 1.9, y - 1.2, 0.5 * s), 0.09, rootM));
        // Nudo con pecíolo y lámina reticulada a cada lado; yema en el ápice.
        const node = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), stemM);
        node.position.y = 12.5;
        const bud = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), std(0xa8c76a));
        bud.scale.y = 1.5;
        bud.position.y = P.h - 1.1;
        spin.add(node, bud);
        for (const s of [1, -1]) {
          spin.add(limb(v(0, 12.5, 0), v(s * 3, 14.2, 0), 0.13, stemM));
          spin.add(at(blade(4.6, 3.6, leaf(), 0, 0.25, -s * 1.05), s * 3, 14.2, 0));
        }
        spin.add(tag('A', 1.1, P.h - 1, 0.4), tag('B', 5.2, 15.6, 0.8), tag('C', 1.8, 14.3, 0.5), tag('D', -1, 12.5, 0.6), tag('E', 1, 9.8, 0.4), tag('F', 0.7, 1.2, 2.7), tag('G', 2.6, 3.2, 2.7));
      } else {
        spin.add(limb(v(0, 7, 0), v(0, 11, 0), 0.42, stemM));
        // Raíces fibrosas: muchas de grosor parecido, sin una principal.
        for (let i = 0; i < 9; i++) {
          const a = (i * 2 * Math.PI) / 9;
          spin.add(limb(v(0, 7, 0), v(1.9 * Math.cos(a), 1.2 + (i % 3) * 1.1, 1.9 * Math.sin(a)), 0.09, rootM));
        }
        const node = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), stemM);
        node.position.y = 9;
        spin.add(node);
        // Vaina envolvente (sin pecíolo) y lámina larga de venación paralela.
        const sheath = cyl(0.56, 2.6, std(0x6d9c48), 10);
        sheath.position.y = 10.3;
        spin.add(sheath);
        for (const [a, y] of [[0.3, 11.4], [Math.PI + 0.3, 11]] as const) spin.add(at(blade(8.5, 1.6, leaf(), a, 0.6), 0, y, 0));
        spin.add(tag('A', 2, 15.5, 2.2), tag('B', 1.1, 10.6, 0.5), tag('C', -1.1, 9, 0.5), tag('D', 1, 7.8, 0.4), tag('E', 0.7, 1.4, 2.7));
      }
      const plate = label([o.label ?? id], 7, 1.2, id === 'bean' ? '#2e7d32' : '#558b2f');
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, 0.06, 4);
      group.add(spin, tube, water, plate, at(hitMesh(new THREE.CylinderGeometry(P.r * 0.7, P.r * 0.7, P.h, 10), id), 0, P.h / 2, 0));
      return {
        ringR: 4.5,
        update: (ctx) => {
          spin.rotation.y = (((ctx.world as PlantWorld).plant?.rotated[id] ?? 0) * Math.PI) / 180;
        },
      };
    }
    case 'woodyBranch': {
      const B = GEO_B09.branch;
      const branch = cyl(1.3, B.w, std(0x6b4a2f, { roughness: 0.95 }), seg);
      branch.rotation.z = Math.PI / 2;
      branch.position.y = 1.4;
      // Cara de corte con el leño claro y los anillos.
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.25, seg), std(0xd8b98a));
      face.rotation.y = Math.PI / 2;
      face.position.set(B.w / 2 + 0.01, 1.4, 0);
      group.add(branch, face);
      for (const r of [0.4, 0.75, 1.05]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.05, seg), std(0x8a6236));
        ring.rotation.y = Math.PI / 2;
        ring.position.set(B.w / 2 + 0.02, 1.4, 0);
        group.add(ring);
      }
      const plate = label([o.label ?? id], 6, 1.1, '#5d4037');
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, 0.06, 3);
      group.add(plate, at(hitMesh(new THREE.BoxGeometry(B.w, B.h, B.d), id), 0, B.h / 2, 0));
      return { ringR: B.w / 2 + 1 };
    }
    case 'tissueSource': {
      const S = GEO_B09.source;
      const kind = (w0 as PlantWorld).cell?.sources[id]?.kind;
      const dish = cyl(4, 0.3, mats.porcelain, seg);
      dish.position.y = 0.15;
      group.add(dish);
      if (kind === 'celery') {
        // Pecíolo acanalado tumbado: su cara de corte muestra los haces.
        const stalk = cyl(0.95, 6.4, std(0x9cc06a), 12);
        stalk.rotation.z = Math.PI / 2;
        stalk.scale.z = 0.72;
        stalk.position.y = 1.1;
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), std(0xdbe8b8));
        face.rotation.y = Math.PI / 2;
        face.scale.x = 0.72;
        face.position.set(3.21, 1.1, 0);
        group.add(stalk, face);
      } else {
        const lf = blade(6.4, 4.4, leaf(), 0, Math.PI / 2 - 0.05);
        lf.position.set(0, 0.5, 3);
        group.add(lf);
      }
      const lbl = label([o.label ?? id], 6, 1, '#2e7d32');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.32, 5);
      group.add(lbl, at(hitMesh(new THREE.CylinderGeometry(4, 4, S.h, 10), id), 0, S.h / 2, 0));
      return { ringR: 5 };
    }
    default:
      return null;
  }
}
