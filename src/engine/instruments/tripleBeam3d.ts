/**
 * Modelo 3D compartido de la balanza de triple brazo (prácticas 5 y 6): base, platillo, tres brazos graduados con sus
 * pesas corredizas, fiel con escala frontal, tornillo de cero y nivel de burbuja. Solo dibuja el estado que recibe.
 * Las mallas de selección llevan `userData = { objId, part }` (rider0–2, beam0–2, zeroScrew, level, pan, body).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MaterialSet } from '../renderers/materials';
import { labelTexture } from '../renderers/textures';

export interface TripleBeamView {
  riders: [number, number, number];
  pointer: number;
  zeroScrewG: number;
  levelErrorDeg: number;
}

/** Platillo y fiel respecto del origen de la balanza (cm). */
export const BALANCE_GEO = { panDx: -16, panDy: 0, panZ: 9.5, beamZ: 13, beamLen: 30, pointerDx: 17 };

function hit(geo: THREE.BufferGeometry, objId: string, mat: THREE.Material, part?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.userData = { objId, part };
  return m;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    (c as THREE.Mesh).castShadow = true;
    (c as THREE.Mesh).receiveShadow = true;
  });
  return o;
}

function selRing(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 48), new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.visible = false;
  return m;
}

/** Regla graduada de un brazo de la balanza: marcas y números. */
function beamTexture(max: number, step: number, label: string, fine: boolean): THREE.CanvasTexture {
  const W = 1024;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9ecef';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1d2329';
  g.strokeStyle = '#1d2329';
  const x0 = 40;
  const x1 = W - 30;
  const n = Math.round(max / step);
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H * 0.42);
    g.stroke();
    g.font = `bold ${H * 0.42}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    if (!fine || i % 1 === 0) g.fillText(String(Math.round(i * step)), x, H * 0.92);
    if (fine && i < n) {
      // Subdivisiones de 0,1 g en el brazo fino.
      for (let k = 1; k < 10; k++) {
        const xs = x + ((x1 - x0) / n) * (k / 10);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(xs, 0);
        g.lineTo(xs, H * (k === 5 ? 0.3 : 0.18));
        g.stroke();
      }
    }
  }
  g.font = `${H * 0.32}px system-ui, sans-serif`;
  g.textAlign = 'left';
  g.fillStyle = '#5b6570';
  g.fillText(label, 4, H * 0.92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Geometría de la balanza en coordenadas locales de la escena (X a lo largo, Y arriba, Z hacia el frente). */
export const BEAM = {
  pivotX: -9,
  x0: -6.5,
  x1: 15.5,
  /** Alturas y profundidades de los tres brazos: 100 g (centro), 10 g (atrás, más alto), fino (frente). */
  y: [13, 13.9, 12.1],
  z: [0, -1.7, 1.7],
  max: [500, 90, 10],
};

/** Posición local X de una pesa corrediza. */
export const riderX = (beam: number, v: number) => BEAM.x0 + ((BEAM.x1 - BEAM.x0) * v) / BEAM.max[beam];

export function createTripleBeamVisual(id: string, mats: MaterialSet, seg: number, own: <T extends THREE.Material | THREE.Texture>(m: T) => T, hitMat: THREE.Material, label: [string, string] = ['Balanza de triple brazo', '610 g · 0,1 g']) {
  const group = new THREE.Group();
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
    o.position.set(x, y, z);
    return o;
  };

      // ── Base, columna del platillo, torre del pivote y escala del fiel ──
      const enamel = own(new THREE.MeshStandardMaterial({ color: 0x3c4650, roughness: 0.45, metalness: 0.2 }));
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(40, 2.2, 15, 3, 0.6), enamel));
      base.position.set(-1, 1.1, 0);
      const panPost = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, BALANCE_GEO.panZ - 2.2, 12), mats.chrome));
      panPost.position.set(BALANCE_GEO.panDx, 2.2 + (BALANCE_GEO.panZ - 2.2) / 2 - 0.4, 0);
      const tower = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3, 11, 6, 2, 0.4), enamel));
      tower.position.set(BEAM.pivotX, 2.2 + 5.5, 0);
      const scale = shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.4, 9, 4.2, 2, 0.3), enamel));
      scale.position.set(BALANCE_GEO.pointerDx + 2.4, 2.2 + 8.5, 0);
      // Escala del fiel en la cara frontal de la columna derecha: se lee de frente, a la altura de la aguja.
      const SX = BALANCE_GEO.pointerDx + 2.4;
      const scaleFace = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.6), own(new THREE.MeshBasicMaterial({ color: 0xf4f6f8 })));
      scaleFace.position.set(SX, 13, 2.12);
      const marks = new THREE.Group();
      for (const [dy, len] of [[0, 1.0], [1, 0.55], [-1, 0.55], [2, 0.55], [-2, 0.55]] as const) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, dy === 0 ? 0.1 : 0.07, 0.02), own(new THREE.MeshBasicMaterial({ color: dy === 0 ? 0xc0392b : 0x1d2329 })));
        m.position.set(SX + 0.2, 13 + dy, 2.14);
        marks.add(m);
      }
      // Platillo (acero) y polvo derramado sobre él.
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(6.2, 5.8, 0.35, seg), mats.steel));
      pan.position.set(BALANCE_GEO.panDx, BALANCE_GEO.panZ - 0.18, 0);
      const panRim = new THREE.Mesh(new THREE.TorusGeometry(6.1, 0.12, 6, seg), mats.steel);
      panRim.rotation.x = Math.PI / 2;
      panRim.position.copy(pan.position).add(new THREE.Vector3(0, 0.18, 0));
      // ── Brazos (giran sobre el pivote) con regla, pesas y fiel ──
      const beams = new THREE.Group();
      beams.position.set(BEAM.pivotX, BEAM.y[0], 0);
      const riders: THREE.Group[] = [];
      const beamNames = ['× 100 g', '× 10 g', '0–10 g'];
      for (let b = 0; b < 3; b++) {
        const len = BEAM.x1 - BEAM.x0 + 2;
        const beam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.45), mats.chrome));
        beam.position.set((BEAM.x0 + BEAM.x1) / 2 - BEAM.pivotX, BEAM.y[b] - BEAM.y[0], BEAM.z[b]);
        const tex = own(beamTexture(BEAM.max[b], b === 0 ? 100 : b === 1 ? 10 : 1, beamNames[b], b === 2));
        const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.86), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })));
        face.position.copy(beam.position).add(new THREE.Vector3(0, 0, 0.23 + 0.001));
        beams.add(beam, face);
        // Muescas del brazo de 100 g y de 10 g (la pesa encaja en ellas).
        const r = new THREE.Group();
        const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(b === 2 ? 0.7 : 1.2, b === 2 ? 1.3 : 1.7, 0.95, 2, 0.15), b === 2 ? mats.steel : mats.darkMetal));
        const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
        pointer.rotation.x = Math.PI;
        pointer.position.set(0, -0.95, 0.5);
        r.add(body, pointer);
        r.position.set(0, BEAM.y[b] - BEAM.y[0], BEAM.z[b]);
        r.add(hit(new THREE.BoxGeometry(2.6, 2.6, 1.4), id, hitMat, `rider${b}`));
        beams.add(r);
        riders.push(r);
        const beamHit = hit(new THREE.BoxGeometry(len, 1.6, 0.9), id, hitMat, `beam${b}`);
        beamHit.position.copy(beam.position);
        beams.add(beamHit);
      }
      // Aguja del fiel: sale del extremo de los brazos y pasa por delante de la escala.
      const needleLen = BALANCE_GEO.pointerDx + 2.6 - BEAM.x1;
      const needle = new THREE.Mesh(new THREE.BoxGeometry(needleLen, 0.12, 0.12), own(new THREE.MeshStandardMaterial({ color: 0x1d2329 })));
      needle.position.set(BEAM.x1 - BEAM.pivotX + needleLen / 2, 0, 2.3);
      const needleTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 6), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      needleTip.rotation.z = -Math.PI / 2;
      needleTip.position.set(BEAM.x1 - BEAM.pivotX + needleLen + 0.2, 0, 2.3);
      const needleArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.3), own(new THREE.MeshStandardMaterial({ color: 0x1d2329 })));
      needleArm.position.set(BEAM.x1 - BEAM.pivotX, 0, 1.15);
      const damper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14), mats.darkMetal));
      damper.position.set(BEAM.x1 + 1 - BEAM.pivotX, -1.6, 0);
      const knife = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 3), mats.steel);
      knife.position.set(0, -0.6, 0);
      knife.rotation.x = Math.PI;
      beams.add(needle, needleTip, needleArm, damper, knife);
      // ── Tornillo de cero (bajo el platillo) y nivel de burbuja ──
      const screw = new THREE.Group();
      const knurl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 16), mats.blackPlastic));
      knurl.rotation.z = Math.PI / 2;
      const nub = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.2), own(new THREE.MeshBasicMaterial({ color: 0xf2a900 })));
      nub.position.set(0, 1.0, 0);
      screw.add(knurl, nub);
      screw.position.set(-21.4, 2.6, 3.2);
      const screwHit = hit(new THREE.SphereGeometry(1.9, 10, 8), id, hitMat, 'zeroScrew');
      screwHit.position.copy(screw.position);
      const vial = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 24), own(new THREE.MeshPhysicalMaterial({ color: 0xd8f0c8, roughness: 0.1, transparent: true, opacity: 0.85 })));
      vial.position.set(-10, 2.35, 5.6);
      const ringMark = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 24), own(new THREE.MeshBasicMaterial({ color: 0x1d2329 })));
      ringMark.rotation.x = -Math.PI / 2;
      ringMark.position.set(-10, 2.52, 5.6);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      bubble.scale.y = 0.4;
      bubble.position.set(-10, 2.5, 5.6);
      const levelHit = hit(new THREE.SphereGeometry(1.8, 10, 8), id, hitMat, 'level');
      levelHit.position.set(-10, 2.5, 5.6);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(label, { band: '#3c4650', w: 256, h: 64 })) })));
      plate.position.set(4, 1.15, 7.52);
      group.add(base, panPost, tower, scale, scaleFace, marks, pan, panRim, beams, screw, screwHit, vial, ringMark, bubble, levelHit, plate);
      group.add(at(hit(new THREE.BoxGeometry(40, 2.4, 15), id, hitMat, 'body'), -1, 1.2, 0));
      const panHit = hit(new THREE.CylinderGeometry(6.4, 6.4, 1.2, 16), id, hitMat, 'pan');
      panHit.position.copy(pan.position);
      group.add(panHit);
      const ring = selRing(24);
      group.add(ring);
      let screwAngle = 0;
      return {
        group,
        update(b: TripleBeamView, dt: number, selected: boolean) {
          for (let i = 0; i < 3; i++) riders[i].position.x = riderX(i, b.riders[i]) - BEAM.pivotX;
          // El fiel sube cuando el lado del platillo pesa más (los brazos giran sobre el pivote).
          const ang = THREE.MathUtils.clamp(b.pointer, -1, 1) * 0.07;
          beams.rotation.z = ang;
          screwAngle += (b.zeroScrewG * 6 - screwAngle) * Math.min(1, dt * 8);
          knurl.rotation.x = screwAngle;
          nub.position.set(0, Math.cos(screwAngle) * 1.0, Math.sin(screwAngle) * 1.0);
          const lv = THREE.MathUtils.clamp(b.levelErrorDeg / 2, -1, 1);
          bubble.position.set(-10 + lv * 0.8, 2.5, 5.6 - lv * 0.3);
          pan.position.y = BALANCE_GEO.panZ - 0.18 - ang * 6;
          ring.visible = selected;
        },
      };
}
