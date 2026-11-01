/**
 * Vistas 3D procedurales de los objetos propios de B10 (§4): mesa de orientación, estantes con modelos a escala y bandeja de huellas.
 * Los modelos son los mismos del visor, reducidos y fusionados por material para respetar el presupuesto de dibujo. Solo leen el estado.
 */
import * as THREE from 'three';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import { GEO_B10 } from '../../simulation/animal-world/geometry';
import { Kit } from '../anatomy/kit';
import { SPECIMEN_BUILDERS } from '../anatomy/specimens';
import { buildTrack } from '../anatomy/tracks';
import type { MaterialSet } from '../renderers/materials';
import type { CellVisual } from './objects3dCell';
import { mergeRigid } from './models/geom';
import { hitMesh } from './parts';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;
type Label = (lines: string[], w: number, h: number, band: string) => THREE.Mesh;

/** Qué modelos representan a cada estante (dos o tres bastan: el resto se abre desde el visor). */
const SHELF_SHOW: Record<string, Array<{ id: string; x: number; s: number; rotY?: number }>> = {
  invRack: [{ id: 'grasshopper', x: -6.5, s: 0.95 }, { id: 'spider', x: 6.5, s: 1 }],
  verRack: [{ id: 'boneFish', x: -6.5, s: 0.9 }, { id: 'frog', x: 6, s: 1 }],
  birdRack: [{ id: 'birdRaptor', x: -6, s: 1.05 }, { id: 'birdDuck', x: 6, s: 1.05 }],
  skullRack: [{ id: 'skullHorse', x: -6, s: 1 }, { id: 'skullCow', x: 6.5, s: 1 }],
};

function miniature(id: string, scale: number) {
  const kit = new Kit();
  SPECIMEN_BUILDERS[id]?.(kit);
  const g = new THREE.Group();
  g.add(kit.root);
  g.scale.setScalar(scale);
  return g;
}

const hitAt = (geo: THREE.BufferGeometry, id: string, x: number, y: number, z: number) => {
  const m = hitMesh(geo, id);
  m.position.set(x, y, z);
  return m;
};

export function buildAnimalObject(o: OpticalObject, _w0: OpticalWorld, group: THREE.Group, _mats: MaterialSet, own: Own, label: Label): CellVisual | null {
  const wood = () => own(new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.7 }));
  switch (o.kind) {
    case 'orientationBoard': {
      const B = GEO_B10.board;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(B.w, B.h, 0.6), wood());
      panel.position.set(0, B.h / 2, 0);
      const face = label(['Tejidos · Organismos', 'Modelos 3D · Huellas'], B.w - 2, B.h - 3, '#37474f');
      face.position.set(0, B.h / 2, 0.32);
      group.add(panel, face, hitAt(new THREE.BoxGeometry(B.w, B.h, B.d), o.id, 0, B.h / 2, 0));
      return { ringR: B.w / 2 + 1 };
    }
    case 'modelShelf': {
      const S = GEO_B10.shelf;
      const base = new THREE.Mesh(new THREE.BoxGeometry(S.w, 0.8, S.d), wood());
      base.position.y = 0.4;
      const back = new THREE.Mesh(new THREE.BoxGeometry(S.w, S.h, 0.5), wood());
      back.position.set(0, S.h / 2, -S.d / 2 + 0.25);
      const statics = new THREE.Group();
      statics.add(base, back);
      for (const m of SHELF_SHOW[o.id] ?? []) {
        const mini = miniature(m.id, m.s);
        mini.position.set(m.x * 0.82, 4.2, 0.4);
        statics.add(mini);
      }
      mergeRigid(statics);
      group.add(statics);
      const plate = label([o.label ?? o.id], 16, 1.6, '#37474f');
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, 0.84, S.d / 2 - 1);
      group.add(plate, hitAt(new THREE.BoxGeometry(S.w, S.h, S.d), o.id, 0, S.h / 2, 0));
      return { ringR: S.w / 2 + 1 };
    }
    case 'trackTray': {
      const T = GEO_B10.trackTray;
      const base = new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.8, T.d), wood());
      base.position.y = 0.4;
      group.add(base);
      for (const [i, id] of (['trackCow', 'trackDog'] as const).entries()) {
        const t = buildTrack(id);
        t.scale.setScalar(0.92);
        t.position.set(-5.2 + i * 10.4, 1, 0);
        t.traverse((n) => {
          if (n instanceof THREE.Mesh && n.userData.pick) n.visible = false;
        });
        group.add(t);
      }
      const plate = label([o.label ?? o.id], 12, 1.3, '#5d4037');
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, 0.84, T.d / 2 - 0.9);
      group.add(plate, hitAt(new THREE.BoxGeometry(T.w, T.h, T.d), o.id, 0, T.h / 2, 0));
      return { ringR: T.w / 2 + 1 };
    }
    default:
      return null;
  }
}
