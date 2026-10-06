/**
 * Vistas 3D procedurales de la Práctica 5 (§5, §6): balanza de triple brazo (pesas corredizas, fiel, tornillo de cero
 * y nivel de burbuja), tubo de borosilicato con la mezcla (capas → gris homogéneo, fusión e incandescencia), soporte
 * universal con nuez y pinza, gradilla refractaria, frascos rotulados, espátulas dedicadas, pinza para tubo, tapón,
 * pantalla, termómetro IR, piseta, residuos y los distractores incompatibles (papel, azúcar, mortero).
 * SOLO leen el estado; no deciden nada. Cada malla de selección lleva `userData = { objId, part }`.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { P5Object, P5World } from '../../simulation/stoich-world/types';
import { tubeTempC } from '../../simulation/stoich-world/world';
import { MOLAR_MASS } from '../../simulation/stoichiometry/stoich';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { labelTexture, lcdTexture, tapeTexture } from '../renderers/textures';
import { BALANCE_GEO, CLAMP_ARM, TUBE5 } from '../../practices/practice-05/definition';
import type { FrameCtx5 } from './StoichLab3D';

export interface ObjHandle5 {
  group: THREE.Group;
  update(ctx: FrameCtx5, o: P5Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;

function hit(geo: THREE.BufferGeometry, objId: string, part?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, hitMat());
  m.userData = { objId, part };
  return m;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function shadowed<T extends THREE.Object3D>(o: T, receive = true): T {
  o.traverse((c) => {
    (c as THREE.Mesh).castShadow = true;
    (c as THREE.Mesh).receiveShadow = receive;
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

/** Incandescencia del vidrio solo cuando la temperatura lo justifica. */
export function glowColor(tC: number, out: THREE.Color): number {
  if (tC < 480) return 0;
  const u = Math.min(1, (tC - 480) / 600);
  out.setRGB(1, 0.25 + 0.55 * u, 0.05 + 0.3 * u * u);
  return 0.4 + 2.2 * u;
}

/** Densidad aparente del polvo (g/cm³) para dibujar la altura de la carga. */
const BULK_DENSITY = 1.25;
const INNER_R = TUBE5.outerR - TUBE5.wall;

/** Altura (cm) que ocupa una masa de polvo dentro del tubo. */
export const powderHeight = (g: number) => g / (BULK_DENSITY * Math.PI * INNER_R * INNER_R);

const WHITE = new THREE.Color(0xf2f1ec);
const KCL = new THREE.Color(0xe9e7df);
const MNO2 = new THREE.Color(0x1c1b1d);
const MIXED = new THREE.Color(0x4a494c);

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

export function createObjVisual5(o: P5Object, w0: P5World, q: QualityLevel, label: string): ObjHandle5 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle5['update'] = () => undefined;
  const id = o.id;
  const own = <T extends THREE.Material | THREE.Texture>(m: T): T => {
    disposables.push(m);
    return m;
  };
  void label;

  switch (o.kind) {
    case 'balance': {
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
      const dustMat = own(new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 1, transparent: true, opacity: 0.85 }));
      const dust = new THREE.Mesh(new THREE.CircleGeometry(1, 20), dustMat);
      dust.rotation.x = -Math.PI / 2;
      dust.position.set(BALANCE_GEO.panDx + 2.2, BALANCE_GEO.panZ + 0.02, 1.4);
      dust.visible = false;
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
        r.add(hit(new THREE.BoxGeometry(2.6, 2.6, 1.4), id, `rider${b}`));
        beams.add(r);
        riders.push(r);
        const beamHit = hit(new THREE.BoxGeometry(len, 1.6, 0.9), id, `beam${b}`);
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
      const screwHit = hit(new THREE.SphereGeometry(1.9, 10, 8), id, 'zeroScrew');
      screwHit.position.copy(screw.position);
      const vial = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 24), own(new THREE.MeshPhysicalMaterial({ color: 0xd8f0c8, roughness: 0.1, transparent: true, opacity: 0.85 })));
      vial.position.set(-10, 2.35, 5.6);
      const ringMark = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 24), own(new THREE.MeshBasicMaterial({ color: 0x1d2329 })));
      ringMark.rotation.x = -Math.PI / 2;
      ringMark.position.set(-10, 2.52, 5.6);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      bubble.scale.y = 0.4;
      bubble.position.set(-10, 2.5, 5.6);
      const levelHit = hit(new THREE.SphereGeometry(1.8, 10, 8), id, 'level');
      levelHit.position.set(-10, 2.5, 5.6);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Balanza de triple brazo', '610 g · 0,1 g'], { band: '#3c4650', w: 256, h: 64 })) })));
      plate.position.set(4, 1.15, 7.52);
      group.add(base, panPost, tower, scale, scaleFace, marks, pan, panRim, dust, beams, screw, screwHit, vial, ringMark, bubble, levelHit, plate);
      group.add(at(hit(new THREE.BoxGeometry(40, 2.4, 15), id, 'body'), -1, 1.2, 0));
      const panHit = hit(new THREE.CylinderGeometry(6.4, 6.4, 1.2, 16), id, 'pan');
      panHit.position.copy(pan.position);
      group.add(panHit);
      ring = selRing(24);
      group.add(ring);
      let screwAngle = 0;
      update = (ctx) => {
        const b = ctx.world.balance;
        for (let i = 0; i < 3; i++) riders[i].position.x = riderX(i, b.riders[i]) - BEAM.pivotX;
        // El fiel sube cuando el lado del platillo pesa más (los brazos giran sobre el pivote).
        const ang = THREE.MathUtils.clamp(b.pointer, -1, 1) * 0.07;
        beams.rotation.z = ang;
        screwAngle += (b.zeroScrewG * 6 - screwAngle) * Math.min(1, ctx.dt * 8);
        knurl.rotation.x = screwAngle;
        nub.position.set(0, Math.cos(screwAngle) * 1.0, Math.sin(screwAngle) * 1.0);
        const lv = THREE.MathUtils.clamp(b.levelErrorDeg / 2, -1, 1);
        bubble.position.set(-10 + lv * 0.8, 2.5, 5.6 - lv * 0.3);
        const res = b.panResidueMol.KClO3 * MOLAR_MASS.KClO3 + b.panResidueMol.MnO2 * MOLAR_MASS.MnO2 + b.panResidueMol.KCl * MOLAR_MASS.KCl;
        dust.visible = res > 0.002;
        if (dust.visible) {
          const s = Math.min(2.2, 0.6 + Math.sqrt(res) * 4);
          dust.scale.set(s, s, 1);
          dustMat.color.copy(WHITE).lerp(MNO2, Math.min(0.8, (b.panResidueMol.MnO2 * MOLAR_MASS.MnO2) / Math.max(1e-9, res)));
        }
        pan.position.y = BALANCE_GEO.panZ - 0.18 - ang * 6;
        if (ring) ring.visible = ctx.selected === id;
      };
      break;
    }

    case 'tube': {
      // Origen = fondo exterior; el eje del tubo es +Y local. Se orienta según el eje del dominio.
      const inner = new THREE.Group();
      const L = TUBE5.length;
      const R = TUBE5.outerR;
      const glassMat = own(mats.glass.clone());
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L - R, seg, 1, true), glassMat);
      wall.position.y = R + (L - R) / 2;
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(R, seg, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
      bottom.position.y = R;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.09, 8, seg), glassMat);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = L;
      wall.renderOrder = 4;
      bottom.renderOrder = 4;
      // Incandescencia del fondo (aditiva).
      const glowMat = own(new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glowMat);
      glow.position.y = R;
      const glowWall = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 3, 16, 1, true), glowMat);
      glowWall.position.y = R + 1.5;
      // Polvo: capa de MnO₂ (negra, abajo), capa clara (KClO₃ / KCl) arriba; al mezclar, todo gris.
      const powderMatA = own(new THREE.MeshStandardMaterial({ color: MNO2, roughness: 1 }));
      const powderMatB = own(new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.95 }));
      const pr = INNER_R * 0.97;
      const capA = new THREE.Mesh(new THREE.SphereGeometry(pr, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), powderMatA);
      capA.position.y = R;
      const layerA = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, 1, 16), powderMatA);
      const layerB = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, 1, 16), powderMatB);
      const capB = new THREE.Mesh(new THREE.SphereGeometry(pr, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), powderMatB);
      capB.position.y = R;
      // Vapor condensado cerca de la boca (agua de humedad).
      const fogMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      const fog = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.99, 4, 16, 1, true), fogMat);
      fog.position.y = L - 3;
      // Grieta (visible al inspeccionar o si se rompió).
      const crackMat = own(new THREE.MeshBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.8 }));
      const crack = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.04), crackMat);
        c.position.set(Math.sin(i) * 0.2, 2 + i * 1.1, R * 0.98);
        c.rotation.z = (i % 2 ? 1 : -1) * 0.5;
        crack.add(c);
      }
      crack.visible = false;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), own(new THREE.MeshStandardMaterial({ map: own(tapeTexture('KClO₃')) })));
      tag.position.set(0, L - 3.5, R + 0.01);
      inner.add(wall, bottom, lip, glow, glowWall, capA, layerA, layerB, capB, fog, crack, tag);
      inner.add(at(hit(new THREE.CylinderGeometry(R * 1.8, R * 1.8, L, 10), id), 0, L / 2, 0));
      group.add(inner);
      ring = selRing(2);
      group.add(ring);
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      const q4 = new THREE.Quaternion();
      const gc = new THREE.Color();
      update = (ctx, ob) => {
        const w = ctx.world;
        const t = w.tube;
        const ax = ctx.axis;
        // Pose: inclinado en la pinza (eje del dominio) o vertical donde esté apoyado.
        if (ob.support === 'clamp') {
          const p = ob.pose;
          inner.position.set(ax.bottom.x - p.x, ax.bottom.z - p.z, -(ax.bottom.y - p.y));
          dir.set(ax.dir.x, ax.dir.z, -ax.dir.y).normalize();
          q4.setFromUnitVectors(up, dir);
          inner.quaternion.copy(q4);
        } else {
          inner.position.set(0, 0, 0);
          inner.quaternion.identity();
          if (ob.pose.quat) inner.quaternion.set(...ob.pose.quat);
        }
        // Polvo
        const c = t.contents;
        const gA = c.MnO2 * MOLAR_MASS.MnO2;
        const gB = c.KClO3 * MOLAR_MASS.KClO3 + c.KCl * MOLAR_MASS.KCl;
        const total = gA + gB;
        const h = t.homogeneity;
        const hA = total > 0 ? powderHeight(gA) * (1 - h) : 0;
        const hTot = powderHeight(total);
        const any = total > 0.005;
        capA.visible = any && hA > 0.02;
        capB.visible = any && !capA.visible;
        layerA.visible = capA.visible && hA > R;
        if (layerA.visible) {
          layerA.scale.y = hA - R;
          layerA.position.y = R + layerA.scale.y / 2;
        }
        const bStart = Math.max(R, hA);
        layerB.visible = any && hTot > bStart;
        if (layerB.visible) {
          layerB.scale.y = hTot - bStart;
          layerB.position.y = bStart + layerB.scale.y / 2;
        }
        // Color: claro (KClO₃/KCl) que se oscurece al mezclar con MnO₂; fundido = brillante.
        const mnFrac = total > 0 ? gA / total : 0;
        const kclFrac = gB > 0 ? (c.KCl * MOLAR_MASS.KCl) / gB : 0;
        powderMatB.color.copy(WHITE).lerp(KCL, kclFrac).lerp(MIXED, Math.min(1, h * Math.min(1, mnFrac * 14)));
        const melt = t.sampleC > 356 && c.KClO3 > 1e-5 ? Math.min(1, (t.sampleC - 356) / 60) : 0;
        powderMatB.roughness = 0.95 - melt * 0.6;
        powderMatB.emissive.setRGB(melt * 0.05, melt * 0.03, 0);
        capA.material = h > 0.6 ? powderMatB : powderMatA;
        // Incandescencia del vidrio
        const k = glowColor(t.glassC, gc);
        glowMat.opacity = k > 0 ? Math.min(0.85, k * 0.3) : 0;
        if (k > 0) glowMat.color.copy(gc);
        glow.visible = glowWall.visible = k > 0;
        // Humedad
        fogMat.opacity = Math.min(0.35, c.waterG * 0.8) * (t.upperC < 90 ? 1 : 0.3);
        fog.visible = fogMat.opacity > 0.01;
        crack.visible = t.cracked || (t.preCracked && t.inspected);
        crackMat.color.setHex(t.cracked ? 0x111111 : 0x555555);
        if (ring) {
          ring.visible = ctx.selected === id && ob.support !== 'clamp';
        }
      };
      break;
    }

    case 'stand': {
      // Soporte universal: base, varilla, nuez (con tornillo) y pinza con brazo hacia el frente.
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(18, 1.4, 13, 2, 0.3), mats.darkMetal));
      base.position.set(0, 0.7, -1.5);
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 62, 16), mats.chrome));
      rod.position.set(0, 31, 0);
      const boss = new THREE.Group();
      const block = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.6, 2.6, 2.6, 2, 0.3), mats.darkMetal));
      const nutKnob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 12), mats.blackPlastic));
      nutKnob.rotation.z = Math.PI / 2;
      nutKnob.position.set(-2.2, 0, 0);
      const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, CLAMP_ARM, 12), mats.chrome));
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, 0, CLAMP_ARM / 2);
      const jawL = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.6, 3.4, 2.2, 2, 0.2), mats.darkMetal));
      const jawR = jawL.clone();
      const pads = new THREE.MeshStandardMaterial({ color: 0xc9b38a, roughness: 0.9 });
      disposables.push(pads);
      const padL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 1.8), pads);
      const padR = padL.clone();
      const jawScrew = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4, 8), mats.chrome));
      jawScrew.rotation.z = Math.PI / 2;
      const jaws = new THREE.Group();
      jaws.add(jawL, jawR, padL, padR, jawScrew);
      jaws.position.set(0, 0, CLAMP_ARM);
      boss.add(block, nutKnob, arm, jaws);
      boss.add(at(hit(new THREE.SphereGeometry(2.2, 10, 8), id, 'nut'), -1.2, 0, 0));
      boss.add(at(hit(new THREE.SphereGeometry(2.6, 10, 8), id, 'jaws'), 0, 0, CLAMP_ARM));
      group.add(base, rod, boss);
      group.add(at(hit(new THREE.CylinderGeometry(1.4, 1.4, 62, 8), id, 'rod'), 0, 31, 0));
      update = (ctx) => {
        const c = ctx.world.clamp;
        // La pinza está a `heightCm` sobre la mesada; la varilla está en (stand.x, stand.y) → origen del grupo.
        boss.position.y = c.heightCm;
        nutKnob.rotation.x = c.nutTight ? 0 : 0.9;
        nutKnob.material = c.nutTight ? mats.blackPlastic : mats.rubberRed;
        // Mordazas alineadas con el tubo (yaw) y abiertas según la presión.
        jaws.rotation.y = (-ctx.world.clamp.mouthYawDeg * Math.PI) / 180;
        const gap = 1.25 - c.grip * 0.4;
        jawL.position.x = -gap;
        jawR.position.x = gap;
        padL.position.x = -gap + 0.45;
        padR.position.x = gap - 0.45;
      };
      break;
    }

    case 'rack': {
      // Gradilla refractaria (cerámica con orificios), para enfriar el tubo de pie.
      const ceramic = own(new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.95 }));
      const topPlate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(16, 1, 6, 2, 0.2), ceramic));
      topPlate.position.y = 7.5;
      const basePlate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(16, 0.8, 6, 2, 0.2), ceramic));
      basePlate.position.y = 0.4;
      const sides = [-7.6, 7.6].map((x) => shadowed(at(new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.5, 6), ceramic), x, 4, 0)));
      const holes = new THREE.Group();
      for (const x of [-3, 0, 3]) {
        const h = new THREE.Mesh(new THREE.CircleGeometry(1.1, 18), own(new THREE.MeshBasicMaterial({ color: 0x2b2b2b })));
        h.rotation.x = -Math.PI / 2;
        h.position.set(x, 8.02, 0);
        holes.add(h);
      }
      group.add(topPlate, basePlate, ...sides, holes);
      group.add(at(hit(new THREE.BoxGeometry(16, 8.2, 6), id), 0, 4.1, 0));
      break;
    }

    case 'tray': {
      const plastic = own(new THREE.MeshStandardMaterial({ color: 0xe8edf0, roughness: 0.55 }));
      const floor = shadowed(new THREE.Mesh(new RoundedBoxGeometry(40, 0.4, 22, 2, 0.15), plastic));
      floor.position.y = 0.2;
      const rims = [
        at(new THREE.Mesh(new THREE.BoxGeometry(40, 1.2, 0.4), plastic), 0, 0.8, 11),
        at(new THREE.Mesh(new THREE.BoxGeometry(40, 1.2, 0.4), plastic), 0, 0.8, -11),
        at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 22), plastic), 20, 0.8, 0),
        at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 22), plastic), -20, 0.8, 0),
      ];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Zona de mezcla', 'sin papel, azúcar ni grasa'], { band: '#f2a900', w: 256, h: 64 })) })));
      sign.rotation.x = -Math.PI / 2;
      sign.position.set(0, 0.42, 8.5);
      group.add(floor, ...rims, sign);
      break;
    }

    case 'bottle': {
      const species = w0.bottles[id]?.species ?? 'KClO3';
      const amber = own(new THREE.MeshPhysicalMaterial({ color: 0x7a3d0c, roughness: 0.15, transmission: q === 'LOW' ? 0 : 0.3, transparent: true, opacity: 0.92, thickness: 0.4 }));
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 9, seg), amber));
      body.position.y = 4.5;
      const shoulder = shadowed(new THREE.Mesh(new THREE.SphereGeometry(3, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2), amber));
      shoulder.scale.y = 0.45;
      shoulder.position.y = 9;
      const neck = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.4, seg), amber));
      neck.position.y = 10.9;
      const capMat = own(new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.45 }));
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 1.6, seg), capMat));
      cap.position.y = 12.3;
      const tex = species === 'KClO3'
        ? labelTexture(['KClO₃', 'Clorato de potasio', 'Comburente · Nocivo'], { picto: 'ox', band: '#f2a900', w: 256, h: 160 })
        : labelTexture(['MnO₂', 'Dióxido de manganeso', 'Nocivo'], { picto: 'warn', band: '#3a3a3a', w: 256, h: 160 });
      own(tex);
      const labelMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.02, 3.02, 5.2, seg, 1, true, -Math.PI * 0.42, Math.PI * 0.84), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })));
      labelMesh.position.y = 4.6;
      // Polvo visible por la boca cuando está abierto.
      const powder = new THREE.Mesh(new THREE.CircleGeometry(1.3, 18), own(new THREE.MeshStandardMaterial({ color: species === 'KClO3' ? WHITE : MNO2, roughness: 1 })));
      powder.rotation.x = -Math.PI / 2;
      powder.position.y = 11.4;
      group.add(body, shoulder, neck, cap, labelMesh, powder);
      group.add(at(hit(new THREE.CylinderGeometry(3.4, 3.4, 11.6, 10), id, 'body'), 0, 5.8, 0));
      const capHit = hit(new THREE.CylinderGeometry(2.2, 2.2, 2.4, 10), id, 'cap');
      group.add(capHit);
      ring = selRing(4);
      group.add(ring);
      update = (ctx) => {
        const b = ctx.world.bottles[id];
        const open = !!b?.open;
        // Abierto: la tapa queda boca arriba al lado del frasco.
        cap.position.set(open ? 5 : 0, open ? 0.8 : 12.3, open ? 1.5 : 0);
        capHit.position.copy(cap.position);
        powder.visible = open;
        if (ring) ring.visible = ctx.selected === id;
      };
      break;
    }

    case 'spatula': {
      const sp = w0.spatulas[id];
      const inner = new THREE.Group();
      const blade = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 0.12, 1.3, 2, 0.05), mats.steel));
      blade.position.set(4.5, 0.1, 0);
      const spoon = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.steel));
      spoon.scale.set(1.3, 0.35, 1);
      spoon.position.set(8.4, 0.18, 0);
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 0.7, 1.1, 2, 0.25), own(new THREE.MeshStandardMaterial({ color: sp?.dedicatedTo === 'MnO2' ? 0x2b2b2b : 0xf2a900, roughness: 0.5 }))));
      handle.position.set(-3, 0.35, 0);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), own(new THREE.MeshStandardMaterial({ map: own(tapeTexture(sp?.dedicatedTo === 'MnO2' ? 'MnO₂' : 'KClO₃')) })));
      tag.rotation.x = -Math.PI / 2;
      tag.position.set(-3, 0.72, 0);
      const loadMat = own(new THREE.MeshStandardMaterial({ color: WHITE, roughness: 1 }));
      const load = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.8, 14), loadMat);
      load.position.set(8.4, 0.5, 0);
      const film = new THREE.Mesh(new THREE.CircleGeometry(0.7, 14), own(new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 1, transparent: true, opacity: 0.7 })));
      film.rotation.x = -Math.PI / 2;
      film.position.set(8.4, 0.25, 0);
      const grease = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14), own(new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.2, transparent: true, opacity: 0.5 })));
      grease.rotation.x = -Math.PI / 2;
      grease.position.set(6, 0.18, 0);
      inner.add(blade, spoon, handle, tag, load, film, grease);
      inner.add(at(hit(new THREE.BoxGeometry(18, 1.8, 2.2), id), 1.5, 0.4, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const s = ctx.world.spatulas[id];
        if (!s) return;
        inner.rotation.y = ob.pose.rotationRad;
        const gK = s.loadMol.KClO3 * MOLAR_MASS.KClO3;
        const gM = s.loadMol.MnO2 * MOLAR_MASS.MnO2;
        const g = gK + gM;
        load.visible = g > 0.005;
        if (load.visible) {
          const k = Math.cbrt(g / 0.5);
          load.scale.set(k, k, k);
          loadMat.color.copy(WHITE).lerp(MNO2, gM / g);
        }
        film.visible = s.residueMol.KClO3 + s.residueMol.MnO2 > 0 && !load.visible;
        grease.visible = !!s.contaminant;
      };
      break;
    }

    case 'tubeTongs': {
      // Pinza para tubo de madera: dos brazos con muelle; las puntas están en +X.
      const wood = mats.wood;
      const armA = shadowed(new THREE.Mesh(new RoundedBoxGeometry(17, 0.6, 1.2, 2, 0.2), wood));
      const armB = armA.clone();
      armA.position.set(8.5, 0.5, 0.75);
      armB.position.set(8.5, 0.5, -0.75);
      const spring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 6, 14), mats.steel));
      spring.position.set(3, 0.5, 0);
      const tipA = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.2, 6, 14, Math.PI), mats.steel));
      tipA.position.set(17, 0.5, 0);
      tipA.rotation.x = Math.PI / 2;
      const inner = new THREE.Group();
      inner.add(armA, armB, spring, tipA);
      inner.add(at(hit(new THREE.BoxGeometry(19, 2, 3), id), 9, 0.6, 0));
      group.add(inner);
      update = (_ctx, ob) => {
        inner.rotation.y = ob.pose.rotationRad;
      };
      break;
    }

    case 'stopper': {
      const rubber = own(new THREE.MeshStandardMaterial({ color: 0x7a2a1f, roughness: 0.85 }));
      const plug = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.75, 2.2, 16), rubber));
      plug.position.y = 1.1;
      const inner = new THREE.Group();
      inner.add(plug);
      inner.add(at(hit(new THREE.SphereGeometry(1.8, 8, 6), id), 0, 1.1, 0));
      group.add(inner);
      const up = new THREE.Vector3(0, 1, 0);
      const d = new THREE.Vector3();
      update = (ctx, ob) => {
        if (ob.support === 'tube') {
          // Encajado en la boca del tubo, siguiendo su eje.
          const ax = ctx.axis;
          const p = ob.pose;
          inner.position.set(ax.mouth.x - p.x - ax.dir.x * 1.2, ax.mouth.z - p.z - ax.dir.z * 1.2, -(ax.mouth.y - p.y - ax.dir.y * 1.2));
          d.set(ax.dir.x, ax.dir.z, -ax.dir.y).normalize();
          inner.quaternion.setFromUnitVectors(up, d);
        } else {
          inner.position.set(0, 0, 0);
          inner.quaternion.identity();
        }
      };
      break;
    }

    case 'brush': {
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(10, 0.7, 1.2, 2, 0.25), mats.wood));
      handle.position.set(-2, 0.35, 0);
      const bristles = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 1, 2.2), own(new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 1 }))));
      bristles.position.set(4.5, 0.5, 0);
      group.add(handle, bristles);
      group.add(at(hit(new THREE.BoxGeometry(14, 1.6, 2.6), id), 0.5, 0.6, 0));
      break;
    }

    case 'weighPaper': {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 10), mats.paper);
      sheet.position.y = 0.03;
      sheet.receiveShadow = true;
      const fold = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.05), own(new THREE.MeshBasicMaterial({ color: 0xc9c9c9 })));
      fold.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
      fold.position.y = 0.07;
      group.add(sheet, fold);
      group.add(at(hit(new THREE.BoxGeometry(10, 0.8, 10), id), 0, 0.4, 0));
      break;
    }

    case 'sugarJar': {
      const jarMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35 }));
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, seg, 1, true), jarMat);
      jar.position.y = 4;
      const sugar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, seg), own(new THREE.MeshStandardMaterial({ color: 0xfaf7ee, roughness: 1 }))));
      sugar.position.y = 2.6;
      const lid = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1, seg), own(new THREE.MeshStandardMaterial({ color: 0x2f7fd1, roughness: 0.5 }))));
      lid.position.y = 8.5;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Azúcar', 'material orgánico'], { band: '#2f7fd1', w: 256, h: 96 })) })));
      lbl.position.set(0, 4.6, 3.25);
      group.add(jar, sugar, lid, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(3.6, 3.6, 9, 10), id), 0, 4.5, 0));
      break;
    }

    case 'pestle': {
      // Mortero con su mano: no debe usarse con el clorato (fricción).
      const mortar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4, 2.8, 4, seg, 1, false), mats.porcelain));
      mortar.position.y = 2;
      const hollow = new THREE.Mesh(new THREE.CircleGeometry(3.6, seg), own(new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.9 })));
      hollow.rotation.x = -Math.PI / 2;
      hollow.position.y = 4.01;
      const hand = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 9, 12), mats.porcelain));
      hand.position.set(1.4, 6.5, 0);
      hand.rotation.z = -0.5;
      group.add(mortar, hollow, hand);
      group.add(at(hit(new THREE.CylinderGeometry(4.4, 4.4, 9, 10), id), 0, 4.5, 0));
      break;
    }

    case 'shield': {
      // Pantalla de policarbonato transparente en un pie, entre el montaje y la persona.
      const paneMat = own(new THREE.MeshPhysicalMaterial({ color: 0xcfe3ef, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 }));
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), paneMat);
      pane.position.y = 18;
      pane.renderOrder = 6;
      const frame = new THREE.Group();
      for (const [ww, hh, x, y] of [[40.6, 0.6, 0, 33.2], [40.6, 0.6, 0, 2.8], [0.6, 30, 20.2, 18], [0.6, 30, -20.2, 18]] as const) {
        frame.add(shadowed(at(new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.6), mats.blackPlastic), x, y, 0)));
      }
      const feet = [-16, 16].map((x) => shadowed(at(new THREE.Mesh(new RoundedBoxGeometry(3, 1, 10, 2, 0.3), mats.blackPlastic), x, 0.5, 0)));
      const tex = own(labelTexture(['PANTALLA', 'entre el montaje y usted'], { band: '#1f2a1f', w: 256, h: 80 }));
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), own(new THREE.MeshStandardMaterial({ map: tex })));
      plate.position.set(0, 4.8, 0.32);
      group.add(pane, frame, ...feet, plate);
      group.add(at(hit(new THREE.BoxGeometry(41, 34, 1.4), id), 0, 17, 0));
      break;
    }

    case 'irThermometer': {
      const shell = own(new THREE.MeshStandardMaterial({ color: 0xf2a900, roughness: 0.45 }));
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 2.6, 2.4, 3, 0.5), shell));
      body.position.set(0, 1.8, 0);
      const grip = shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.8, 4.2, 2, 3, 0.4), mats.blackPlastic));
      grip.position.set(-2, 0.5, 0);
      grip.rotation.z = 0.3;
      grip.visible = false;
      const lcd = lcdTexture(160, 64);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(-0.6, 3.11, 0);
      screen.rotation.x = -Math.PI / 2;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.6, 14), own(new THREE.MeshStandardMaterial({ color: 0x20242a, metalness: 0.4, roughness: 0.2 })));
      lens.rotation.y = Math.PI / 2;
      lens.position.set(3.51, 1.8, 0);
      group.add(body, grip, screen, lens);
      group.add(at(hit(new THREE.BoxGeometry(8, 3.6, 3.2), id), 0, 1.8, 0));
      update = (ctx) => {
        const r = ctx.irReading;
        lcd.set(r === null ? '--.- °C' : `${r.toFixed(0)} °C`, r !== null && r > ctx.world.params.ambientC + ctx.world.params.allowedDeltaC ? '#ffb347' : '#6ef08a', 'IR');
      };
      break;
    }

    case 'washBottle': {
      const plastic = mats.plasticWhite;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 12, seg), plastic));
      body.position.y = 6;
      const capM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 12), mats.plasticBlue));
      capM.position.y = 12.6;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 8), mats.plasticWhite));
      tube.position.set(1.8, 15.2, 0);
      tube.rotation.z = -0.7;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['H₂O', 'destilada'], { band: '#2f7fd1', w: 128, h: 64 })) })));
      lbl.position.set(0, 6, 3.12);
      group.add(body, capM, tube, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(3.6, 3.6, 15, 10), id), 0, 7.5, 0));
      break;
    }

    case 'waste': {
      const bin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(5, 4.4, 12, seg, 1, true), own(new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, side: THREE.DoubleSide }))));
      bin.position.y = 6;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(4.4, seg), own(new THREE.MeshStandardMaterial({ color: 0x8a7a2a })));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.2;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['RESIDUOS SÓLIDOS', 'KCl + MnO₂', 'no al desagüe'], { band: '#d0021b', picto: 'warn', w: 256, h: 140 })) })));
      lbl.position.set(0, 6.5, 4.9);
      lbl.rotation.x = -0.05;
      group.add(bin, floor, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(5.4, 5.4, 12.5, 10), id), 0, 6.2, 0));
      break;
    }
  }

  group.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry) disposables.push(m.geometry);
  });

  return {
    group,
    update: (ctx, ob) => {
      // Pose del objeto (la vista solo copia el estado del dominio).
      const p = ob.pose;
      group.position.set(p.x, p.z, -p.y);
      if (ob.kind !== 'spatula' && ob.kind !== 'tubeTongs' && ob.kind !== 'tube' && ob.kind !== 'stopper') group.rotation.set(0, p.rotationRad, 0);
      group.visible = ob.support !== 'disposed';
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Temperatura que se muestra en la etiqueta del tubo caliente (para la vista accesible). */
export const tubeHot = (w: P5World) => tubeTempC(w.tube) > w.params.ambientC + w.params.allowedDeltaC;
