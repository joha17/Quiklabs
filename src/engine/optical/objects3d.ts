/**
 * Vistas 3D procedurales de B01 (§4, §15.4): microscopio compuesto con partes independientes (platina que sube con
 * el foco y carro X/Y que lleva la lámina, pinza articulada, revólver indexado con tres objetivos, mandos macro y micro
 * coaxiales, condensador, palanca del diafragma, lámpara y regulador), estereoscopio (cabezal que sube y baja, zoom,
 * enfoque, oculares con distancia interpupilar y anillos de dioptría, luz incidente y transmitida), caja de láminas con
 * tapa y ranuras, portaobjetos con su montaje (fragmento, líquido, cubreobjetos, burbujas, grietas, residuo),
 * cubreobjetos, gotero, pinza, bisturí, papeles, muestras y bandejas. SOLO leen el estado del dominio.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import { GEO_B01, MIC_POS, STAGE_SEAT, STEREO_BASE, STEREO_POS, stageTopZCm } from '../../simulation/optical-world/geometry';
import { microscopeView } from '../../simulation/optical-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { labelTexture } from '../renderers/textures';
import type { FrameCtxB01 } from './OpticalLab3D';

export interface ObjHandleB01 {
  group: THREE.Group;
  update(ctx: FrameCtxB01, o: OpticalObject): void;
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

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;

function labelPlane(lines: string[], w: number, h: number, own: Own, band = '#123a63') {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(lines, { band, w: 256, h: 96 })), roughness: 0.6 })));
}

const LEAF_GREEN = 0x4f9a3a;
const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);

/** Altura (cm) de la lente frontal de cada objetivo según el dominio (plano focal + distancia de trabajo). */
function objectiveTipCm(w: OpticalWorld, x: 4 | 10 | 40) {
  const p = w.params.microscope;
  return stageTopZCm(0) + (p.focalPlaneZMm + p.parfocalOffsetMm[x] + p.workingDistanceMm[x]) / 10;
}

export function createObjVisualB01(o: OpticalObject, w0: OpticalWorld, q: QualityLevel, labelText = ''): ObjHandleB01 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 14 : q === 'MEDIUM' ? 20 : 28;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture | { dispose(): void }> = [];
  let ring: THREE.Mesh | null = null;
  let update: (ctx: FrameCtxB01, ob: OpticalObject) => void = () => undefined;
  const id = o.id;
  const own: Own = (m) => {
    disposables.push(m);
    return m;
  };
  /** Pose propia (las láminas en la platina siguen al carro X/Y y a la altura de la platina). */
  let customPose = false;

  switch (o.kind) {
    case 'slide':
    case 'fixedSlide': {
      const S = GEO_B01.slide;
      const inner = new THREE.Group();
      const glass = shadowed(box(S.w, S.h, S.d, mats.glass));
      glass.position.y = S.h / 2;
      glass.renderOrder = 3;
      inner.add(glass);
      const fixed = o.kind === 'fixedSlide';
      const asset = w0.slides[id]?.assetId;
      if (fixed) {
        const lbl = labelPlane((labelText || w0.slides[id]?.label || '').split('\n'), 2.3, 2.3, own, '#5d4037');
        lbl.rotation.x = -Math.PI / 2;
        lbl.position.set(-S.w / 2 + 1.25, S.h + 0.012, 0);
        const colors: Record<string, number> = { onion: 0x8e44ad, onionPlain: 0xd8d0c0, cornStem: 0xc0392b, rootTip: 0x7d3c98 };
        const spec = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), own(new THREE.MeshBasicMaterial({ color: colors[asset ?? ''] ?? 0x8e44ad, transparent: true, opacity: 0.75 })));
        spec.rotation.x = -Math.PI / 2;
        spec.position.set(0.6, S.h + 0.011, 0);
        const cover = box(1.8, 0.02, 1.8, mats.glass);
        cover.position.set(0.6, S.h + 0.02, 0);
        inner.add(lbl, spec, cover);
      }
      // Montaje fresco: fragmento, líquido, cubreobjetos, burbujas, grietas y residuo.
      const leafMat = own(new THREE.MeshStandardMaterial({ color: LEAF_GREEN, roughness: 0.6, transparent: true, opacity: 0.92 }));
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), leafMat);
      leaf.rotation.x = -Math.PI / 2;
      const waterMat = own(new THREE.MeshPhysicalMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false }));
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 24), waterMat);
      water.rotation.x = -Math.PI / 2;
      const cover = box(GEO_B01.coverslip.w, 0.02, GEO_B01.coverslip.d, mats.glass);
      const crackMat = own(new THREE.LineBasicMaterial({ color: 0x333333 }));
      const crack = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.8, 0, -0.5), new THREE.Vector3(0.7, 0, 0.6), new THREE.Vector3(-0.2, 0, -0.8), new THREE.Vector3(0.1, 0, 0.7)]), crackMat);
      const dirtMat = own(new THREE.MeshBasicMaterial({ color: 0x8d8170, transparent: true, opacity: 0.45, depthWrite: false }));
      const dirt = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.12 + (i % 3) * 0.07, 10), dirtMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(-2.4 + i * 0.9, S.h + 0.006, ((i * 37) % 7) / 7 - 0.5);
        dirt.add(d);
      }
      const bubbleMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
      const bubbles = new THREE.Group();
      inner.add(leaf, water, cover, crack, dirt, bubbles);
      inner.add(at(hit(new THREE.BoxGeometry(S.w, 0.6, S.d + 0.4), id), 0, 0.3, 0));
      group.add(inner);
      ring = selRing(4.4);
      group.add(ring);
      customPose = true;
      let bubbleKey = '';
      update = (ctx, ob) => {
        const w = ctx.world;
        // Pose: en la platina sigue al carro X/Y y a la altura; en la caja, de canto.
        let x = ob.pose.x;
        let y = ob.pose.y;
        let z = ob.pose.z;
        if (ob.support === 'stage') {
          const m = w.microscope;
          x = ob.pose.x + m.stageXmm / 10;
          y = ob.pose.y + m.stageYmm / 10;
          z = stageTopZCm(microscopeView(w).stageZmm);
        }
        group.position.set(x, z, -y);
        const upright = ob.support.startsWith('case:');
        inner.rotation.set(upright ? Math.PI / 2 : 0, 0, upright ? Math.PI / 2 : 0, 'XYZ');
        if (upright) inner.position.set(0, S.d / 2, 0);
        else inner.position.set(0, 0, 0);
        const flip = w.slides[id]?.faceDown;
        glass.scale.y = 1;
        inner.scale.y = flip ? -1 : 1;
        if (flip) inner.position.y = S.h;
        const mt = w.mounts[id];
        const sl = w.slides[id];
        dirt.visible = !!sl && sl.dirty01 > 0.2;
        leaf.visible = !!mt?.specimenId;
        water.visible = !!mt && mt.waterMl + mt.reagentMl > 0.002;
        cover.visible = !!mt?.coverId;
        crack.visible = !!mt?.broken;
        if (mt) {
          const len = Math.max(0.2, mt.fragmentCm);
          leaf.scale.set(len * 0.32, len, 1);
          leaf.position.set(mt.centerCm[0], S.h + 0.008, -mt.centerCm[1]);
          leafMat.color.setHex(mt.damage01 > 0.4 ? 0x7a8a3a : mt.hydrated01 < 0.6 ? 0x8a9a5a : LEAF_GREEN);
          const r = Math.min(1.6, 0.4 + Math.sqrt(mt.waterMl + mt.reagentMl) * 3.2);
          water.scale.set(r, r, 1);
          water.position.set(mt.waterCenterCm[0], S.h + 0.004, -mt.waterCenterCm[1]);
          waterMat.color.setHex(mt.reagentId ? 0xb5651d : 0x9cc8ea);
          cover.position.set(mt.coverOffsetCm[0] + (mt.floating ? 0.35 : 0), S.h + 0.03, -mt.coverOffsetCm[1]);
          crack.position.set(mt.coverOffsetCm[0], S.h + 0.045, -mt.coverOffsetCm[1]);
          const key = mt.bubbles.map((b) => `${b.x},${b.y},${b.r}`).join(';');
          if (key !== bubbleKey) {
            bubbleKey = key;
            for (const c of [...bubbles.children]) {
              bubbles.remove(c);
              (c as THREE.Mesh).geometry.dispose();
            }
            for (const b of mt.bubbles) {
              const g = new THREE.RingGeometry(b.r / 10 * 0.75, b.r / 10, 16);
              const bm = new THREE.Mesh(g, bubbleMat);
              bm.rotation.x = -Math.PI / 2;
              bm.position.set(mt.coverOffsetCm[0] + b.x / 10, S.h + 0.04, -(mt.coverOffsetCm[1] + b.y / 10));
              bubbles.add(bm);
            }
          }
        }
      };
      break;
    }
    case 'coverslip': {
      const C = GEO_B01.coverslip;
      const plate = box(C.w, 0.02, C.d, mats.glass);
      plate.renderOrder = 4;
      group.add(plate, at(hit(new THREE.BoxGeometry(C.w, 0.4, C.d), id), 0, 0.2, 0));
      customPose = true;
      update = (ctx, ob) => {
        const w = ctx.world;
        const c = w.covers[id];
        // Sobre un portaobjetos lo dibuja la lámina; en la pinza lo dibuja la pinza.
        group.visible = ob.support === 'coverBox' || ob.support === 'bench' || c?.state === 'broken' && ob.support === 'bench';
        group.position.set(ob.pose.x, ob.pose.z + 0.02, -ob.pose.y);
      };
      break;
    }
    case 'forceps': {
      const L = GEO_B01.forceps.length;
      const inner = new THREE.Group();
      const prong = (s: number) => {
        const m = shadowed(box(0.22, 0.12, L, mats.steel));
        m.position.set(s * 0.18, 0.06, -L / 2);
        m.rotation.y = s * 0.03;
        return m;
      };
      inner.add(prong(1), prong(-1));
      // Lo que sostiene la punta: hoja, cubreobjetos inclinado o muestra.
      const tipLeaf = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), own(new THREE.MeshStandardMaterial({ color: LEAF_GREEN, side: THREE.DoubleSide })));
      tipLeaf.rotation.x = -Math.PI / 2;
      tipLeaf.position.set(0, 0.05, -L);
      const tipCover = box(GEO_B01.coverslip.w, 0.02, GEO_B01.coverslip.d, mats.glass);
      const coverPivot = new THREE.Group();
      coverPivot.position.set(0, 0, -L);
      tipCover.position.set(0, 0, -GEO_B01.coverslip.d / 2);
      coverPivot.add(tipCover);
      const tipSample = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), own(new THREE.MeshStandardMaterial({ color: 0x3e2a1a })));
      tipSample.position.set(0, -0.2, -L);
      inner.add(tipLeaf, coverPivot, tipSample, at(hit(new THREE.BoxGeometry(1.2, 1, L), id), 0, 0.3, -L / 2));
      group.add(inner);
      ring = selRing(1.5);
      group.add(ring);
      update = (ctx, ob) => {
        const w = ctx.world;
        const hd = w.forceps.holding;
        tipLeaf.visible = hd?.kind === 'specimen';
        tipCover.visible = hd?.kind === 'cover';
        tipSample.visible = hd?.kind === 'sample';
        if (hd?.kind === 'cover') {
          const lw = ctx.lowering;
          const tilt = w.covers[hd.coverId]?.tiltDeg ?? 0;
          coverPivot.rotation.x = (-tilt * (1 - (lw?.progress ?? 0)) * Math.PI) / 180;
        }
        // La pinza apunta su punta hacia el centro de la mano: el cuerpo se extiende hacia el alumno.
        inner.position.set(0, 0, L);
        inner.rotation.set(ob.support === 'bench' ? 0 : -0.25, 0, 0);
      };
      break;
    }
    case 'scalpel': {
      const L = GEO_B01.scalpel.length;
      const handle = shadowed(box(0.6, 0.3, L * 0.7, mats.steel));
      handle.position.set(0, 0.15, L * 0.35 - L / 2);
      const blade = shadowed(box(0.5, 0.05, L * 0.3, mats.chrome));
      blade.position.set(0, 0.1, -L / 2 + L * 0.15 - L * 0.35);
      group.add(handle, blade, at(hit(new THREE.BoxGeometry(1.2, 1, L), id), 0, 0.4, -L * 0.2));
      ring = selRing(1.5);
      group.add(ring);
      break;
    }
    case 'dropperBottle': {
      const D = GEO_B01.dropperBottle;
      const isLugol = id === 'iod';
      const bottle = shadowed(cyl(D.r, D.h * 0.7, isLugol ? mats.amberGlass : mats.glass, seg));
      bottle.position.y = D.h * 0.35;
      const liq = cyl(D.r - 0.15, D.h * 0.45, own(new THREE.MeshStandardMaterial({ color: isLugol ? 0xa0522d : 0x9cc8ea, transparent: true, opacity: 0.6 })), seg);
      liq.position.y = D.h * 0.25;
      const neck = shadowed(cyl(0.45, 1.2, mats.blackPlastic));
      neck.position.y = D.h * 0.7 + 0.6;
      const bulb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), mats.rubberRed));
      bulb.scale.set(1, 1.4, 1);
      bulb.position.y = D.h * 0.7 + 1.8;
      const lbl = labelPlane([labelText || o.label || ''], 3, 1.4, own, isLugol ? '#6d4c41' : '#1565c0');
      lbl.position.set(0, D.h * 0.4, D.r + 0.02);
      group.add(bottle, liq, neck, bulb, lbl, at(hit(new THREE.CylinderGeometry(D.r + 0.4, D.r + 0.4, D.h + 2, 10), id), 0, (D.h + 2) / 2, 0));
      ring = selRing(D.r + 0.8);
      group.add(ring);
      update = (ctx) => {
        const d = ctx.world.dispensers[id];
        const f = d ? Math.min(1, d.ml / 10) : 0;
        liq.scale.y = Math.max(0.02, f);
        liq.position.y = (D.h * 0.45 * Math.max(0.02, f)) / 2 + 0.2;
      };
      break;
    }
    case 'elodeaDish': {
      const D = GEO_B01.dish;
      const dish = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.h, seg, 1, true), mats.glass));
      dish.position.y = D.h / 2;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(D.r, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      const water = new THREE.Mesh(new THREE.CircleGeometry(D.r - 0.1, seg), own(new THREE.MeshPhysicalMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.4 })));
      water.rotation.x = -Math.PI / 2;
      water.position.y = D.h * 0.6;
      const leaves = new THREE.Group();
      const leafMat = own(new THREE.MeshStandardMaterial({ color: LEAF_GREEN, side: THREE.DoubleSide }));
      for (let i = 0; i < 8; i++) {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), leafMat);
        l.scale.set(0.35, 1.2, 1);
        l.rotation.set(-Math.PI / 2, 0, (i * 0.8) % Math.PI);
        l.position.set(Math.cos(i * 2.1) * 2.4, D.h * 0.55, Math.sin(i * 2.1) * 2.4);
        leaves.add(l);
      }
      const lbl = labelPlane(['Elodea'], 4, 1, own, '#2e7d32');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, D.r + 1);
      group.add(dish, bottom, water, leaves, lbl, at(hit(new THREE.CylinderGeometry(D.r, D.r, D.h + 0.5, 12), id), 0, D.h / 2, 0));
      update = (ctx) => {
        const n = ctx.world.dish.leaves;
        leaves.children.forEach((c, i) => (c.visible = i < n + 2));
      };
      break;
    }
    case 'coverBox': {
      const B = GEO_B01.coverBox;
      const b = shadowed(box(B.w, B.h, B.d, mats.plasticWhite));
      b.position.y = B.h / 2;
      const lbl = labelPlane(['Cubreobjetos'], 4, 0.9, own, '#455a64');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, B.d / 2 + 0.7);
      group.add(b, lbl, at(hit(new THREE.BoxGeometry(B.w, B.h + 0.4, B.d), id, 'box'), 0, B.h / 2, 0));
      break;
    }
    case 'paper':
    case 'lensPaper':
    case 'towel': {
      const P = GEO_B01.paper;
      const m = o.kind === 'paper' ? mats.paper : o.kind === 'lensPaper' ? own(new THREE.MeshStandardMaterial({ color: 0xe3f0fb, roughness: 0.9, side: THREE.DoubleSide })) : own(new THREE.MeshStandardMaterial({ color: 0xc9b38a, roughness: 1 }));
      const sheet = shadowed(box(P.w, o.kind === 'towel' ? 0.3 : 0.06, P.d, m));
      sheet.position.y = 0.05;
      const lbl = labelPlane([o.kind === 'paper' ? 'Papel absorbente' : o.kind === 'lensPaper' ? 'Papel de lente' : 'Toalla (abrasiva)'], 5, 1, own, o.kind === 'towel' ? '#6d4c41' : '#455a64');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.2, 0);
      group.add(sheet, lbl, at(hit(new THREE.BoxGeometry(P.w, 0.8, P.d), id), 0, 0.3, 0));
      ring = selRing(4.5);
      group.add(ring);
      break;
    }
    case 'prepBoard': {
      const B = GEO_B01.prepBoard;
      const b = shadowed(new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 2, 0.3), mats.enamel));
      b.position.y = B.h / 2;
      const lbl = labelPlane(['Área de montaje'], 6, 1, own, '#1e8e4e');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, B.h + 0.01, B.d / 2 - 1);
      group.add(b, lbl, at(hit(new THREE.BoxGeometry(B.w, B.h, B.d), id), 0, B.h / 2, 0));
      break;
    }
    case 'microscope': {
      const M = GEO_B01.microscope;
      const dz = MIC_POS.y - STAGE_SEAT.y;
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(M.baseW, 3, M.baseD, 3, 0.8), mats.enamel));
      base.position.y = 1.5;
      const arm = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4, 30, 5, 2, 1), mats.enamel));
      arm.position.set(0, 17, -8);
      const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 6, 9, 2, 1), mats.enamel));
      head.position.set(0, 31, -3);
      const tube = shadowed(cyl(0.9, 6, mats.blackPlastic));
      tube.position.set(0, 36, 0);
      tube.rotation.x = -0.6;
      const ocular = shadowed(cyl(1.1, 2.5, mats.darkMetal));
      ocular.position.set(0, 38.6, 1.8);
      ocular.rotation.x = -0.6;
      // Platina (sube con el foco), carro X/Y y pinza.
      const stage = new THREE.Group();
      const plate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(M.stageW, 1, M.stageD, 2, 0.3), mats.blackPlastic));
      plate.position.y = -0.5;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), own(new THREE.MeshBasicMaterial({ color: 0x0a0a0a })));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(0, 0.005, 0);
      const carriage = new THREE.Group();
      const holder = shadowed(box(8, 0.4, 0.5, mats.steel));
      holder.position.set(0, 0.2, -1.6);
      carriage.add(holder);
      const clipPivot = new THREE.Group();
      clipPivot.position.set(-4.5, 0.25, 1.6);
      const clipArm = shadowed(box(4.5, 0.2, 0.5, mats.chrome));
      clipArm.position.set(2.25, 0, 0);
      clipPivot.add(clipArm);
      stage.add(plate, hole, carriage, clipPivot);
      stage.add(at(hit(new THREE.BoxGeometry(5, 1.2, 1.2), id, 'clip'), -2.2, 0.3, 1.6));
      stage.position.z = dz;
      // Condensador y diafragma bajo la platina.
      const condenser = shadowed(cyl(1.3, 2, mats.darkMetal));
      const lever = shadowed(box(2.2, 0.2, 0.3, mats.chrome));
      // Revólver con tres objetivos (la punta de cada uno a la altura que da el dominio).
      const turretY = 21;
      const turret = new THREE.Group();
      turret.position.set(0, turretY, dz);
      const disk = shadowed(cyl(2.6, 0.8, mats.chrome, 24));
      turret.add(disk);
      const objColors = [0xc0392b, 0xf1c40f, 0x2980b9];
      ([4, 10, 40] as const).forEach((x, i) => {
        const len = turretY - objectiveTipCm(w0, x);
        const a = (i * 2 * Math.PI) / 3;
        const ob = shadowed(cyl(0.6 - i * 0.06, len, mats.chrome));
        ob.position.set(Math.sin(a) * 1.6, -len / 2, Math.cos(a) * 1.6);
        const band = cyl(0.62 - i * 0.06, 0.25, own(new THREE.MeshStandardMaterial({ color: objColors[i] })));
        band.position.set(Math.sin(a) * 1.6, -len * 0.35, Math.cos(a) * 1.6);
        turret.add(ob, band);
      });
      turret.add(at(hit(new THREE.CylinderGeometry(3, 3, 3, 10), id, 'turret'), 0, -1, 0));
      // Mandos coaxiales (macro grande, micro chico) a la derecha; carro X/Y bajo la platina.
      const coarse = shadowed(cyl(2.2, 1.2, mats.blackPlastic, 20));
      coarse.rotation.z = Math.PI / 2;
      coarse.position.set(M.baseW / 2 - 6.5, 11, -6);
      const fine = shadowed(cyl(1.2, 1.2, mats.darkMetal, 20));
      fine.rotation.z = Math.PI / 2;
      fine.position.set(M.baseW / 2 - 5.2, 11, -6);
      const knobMark = (k: THREE.Mesh) => {
        const mk = box(0.15, 0.4, 0.15, mats.plasticYellow);
        mk.position.set(0, 0.7, (k.geometry as THREE.CylinderGeometry).parameters.radiusTop);
        k.add(mk);
      };
      knobMark(coarse);
      knobMark(fine);
      const sx = shadowed(cyl(0.7, 1, mats.blackPlastic));
      sx.rotation.x = Math.PI / 2;
      const sy = shadowed(cyl(0.6, 1, mats.darkMetal));
      sy.rotation.x = Math.PI / 2;
      // Lámpara, regulador e interruptor.
      const lampMat = own(new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.2 }));
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), lampMat);
      lamp.rotation.x = -Math.PI / 2;
      lamp.position.set(0, 3.02, dz);
      const lightKnob = shadowed(cyl(0.9, 0.8, mats.blackPlastic));
      lightKnob.rotation.z = Math.PI / 2;
      lightKnob.position.set(-M.baseW / 2 - 0.3, 1.8, 6);
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x3bff59 }));
      const power = shadowed(box(1.4, 0.8, 0.8, mats.rubberRed));
      power.position.set(M.baseW / 2 - 2, 2.2, M.baseD / 2 - 0.2);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), ledMat);
      led.position.set(M.baseW / 2 - 4, 2.4, M.baseD / 2);
      group.add(base, arm, head, tube, ocular, stage, condenser, lever, turret, coarse, fine, sx, sy, lamp, lightKnob, power, led);
      group.add(at(hit(new THREE.BoxGeometry(3, 3, 3), id, 'ocular'), 0, 38.6, 1.8));
      group.add(at(hit(new THREE.BoxGeometry(2, 5, 5), id, 'coarse'), M.baseW / 2 - 6.5, 11, -6));
      group.add(at(hit(new THREE.BoxGeometry(2.5, 3, 3), id, 'fine'), M.baseW / 2 - 4.8, 11, -6));
      const hx = at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'stageX'), M.stageW / 2 + 0.8, 0, dz + 3);
      const hy = at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'stageY'), M.stageW / 2 + 0.8, 0, dz + 4.6);
      const hCond = at(hit(new THREE.BoxGeometry(3, 2, 3), id, 'condenser'), 0, 0, dz);
      const hLever = at(hit(new THREE.BoxGeometry(3, 1, 1.5), id, 'diaphragm'), 2, 0, dz + 1.2);
      group.add(hx, hy, hCond, hLever);
      group.add(at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'light'), -M.baseW / 2 - 0.3, 1.8, 6));
      group.add(at(hit(new THREE.BoxGeometry(2, 1.6, 1.6), id, 'power'), M.baseW / 2 - 2, 2.2, M.baseD / 2 - 0.2));
      group.add(at(hit(new THREE.BoxGeometry(M.baseW, 3, M.baseD), id), 0, 1.5, 0), at(hit(new THREE.BoxGeometry(5, 30, 6), id), 0, 17, -8));
      ring = selRing(14);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        const m = w.microscope;
        const v = microscopeView(w);
        const top = stageTopZCm(v.stageZmm);
        stage.position.y = top;
        carriage.position.set(m.stageXmm / 10, 0, -m.stageYmm / 10);
        clipPivot.rotation.y = m.clipOpen ? 0.9 : 0;
        condenser.position.set(0, top - 2.6 - (1 - m.condenser01) * 2.5, dz);
        lever.position.set(1.5, top - 2.2 - (1 - m.condenser01) * 2.5, dz + 1.2);
        lever.rotation.y = -0.9 + m.diaphragm01 * 1.6;
        hCond.position.y = top - 2.6;
        hLever.position.y = top - 2.2;
        sx.position.set(M.stageW / 2 + 0.8, top - 1.6, dz + 3);
        sy.position.set(M.stageW / 2 + 0.8, top - 1.6, dz + 4.6);
        hx.position.y = top - 1.6;
        hy.position.y = top - 1.6;
        turret.rotation.y = (-m.turretDeg * Math.PI) / 180;
        coarse.rotation.x = m.coarseTurns * 2 * Math.PI;
        fine.rotation.x = m.fineTurns * 2 * Math.PI;
        lampMat.opacity = m.power ? 0.25 + 0.75 * m.light01 : 0.08;
        lightKnob.rotation.x = m.light01 * 4;
        ledMat.color.setHex(m.power ? 0x3bff59 : 0x2a2f33);
      };
      break;
    }
    case 'stereo': {
      const S = GEO_B01.stereo;
      const dz = STEREO_POS.y - STEREO_BASE.y;
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(S.baseW, S.baseTopZ, S.baseD, 3, 0.8), mats.enamel));
      base.position.y = S.baseTopZ / 2;
      const plateMat = own(new THREE.MeshBasicMaterial({ color: 0xf6f6f0 }));
      const plate = new THREE.Mesh(new THREE.CircleGeometry(4.5, 28), plateMat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, S.baseTopZ + 0.01, dz);
      const pillar = shadowed(cyl(1.4, 30, mats.chrome));
      pillar.position.set(0, S.baseTopZ + 15, -7);
      const head = new THREE.Group();
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 7, 9, 2, 1.5), mats.enamel));
      body.position.set(0, 0, -2);
      const zoom = shadowed(cyl(2, 1, mats.blackPlastic, 20));
      zoom.position.set(0, 4, -2);
      const eyeL = shadowed(cyl(0.9, 4, mats.darkMetal));
      const eyeR = shadowed(cyl(0.9, 4, mats.darkMetal));
      eyeL.rotation.x = -0.7;
      eyeR.rotation.x = -0.7;
      const ringL = cyl(1.05, 0.5, mats.plasticYellow);
      const ringR = cyl(1.05, 0.5, mats.plasticYellow);
      ringL.rotation.x = -0.7;
      ringR.rotation.x = -0.7;
      const lens = shadowed(cyl(1.6, 2, mats.blackPlastic));
      lens.position.set(0, -4.2, 0);
      head.add(body, zoom, eyeL, eyeR, ringL, ringR, lens);
      head.add(at(hit(new THREE.BoxGeometry(4, 2, 3), id, 'zoom'), 0, 4, -2));
      head.add(at(hit(new THREE.BoxGeometry(6, 3, 3), id, 'oculars'), 0, 4.5, 3));
      head.add(at(hit(new THREE.BoxGeometry(8, 7, 9), id, 'head'), 0, 0, -2));
      const hDl = at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.6), id, 'diopterL'), -2, 3.2, 3.4);
      const hDr = at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.6), id, 'diopterR'), 2, 3.2, 3.4);
      head.add(hDl, hDr);
      head.add(at(hit(new THREE.BoxGeometry(8, 1, 2), id, 'ipd'), 0, 6.2, 3));
      const focus = shadowed(cyl(1.8, 1.4, mats.blackPlastic, 20));
      focus.rotation.z = Math.PI / 2;
      focus.position.set(2.2, 16, -7);
      const lampArm = shadowed(box(0.6, 0.6, 7, mats.chrome));
      lampArm.position.set(-4.5, 12, -2);
      lampArm.rotation.x = 0.5;
      const lampMat = own(new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.2 }));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), lampMat);
      lamp.position.set(-4.5, 10.5, 1.4);
      const power = shadowed(box(1.4, 0.8, 0.8, mats.rubberRed));
      power.position.set(S.baseW / 2 - 2, S.baseTopZ - 0.4, S.baseD / 2);
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x2a2f33 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), ledMat);
      led.position.set(S.baseW / 2 - 4, S.baseTopZ - 0.2, S.baseD / 2);
      const tKnob = shadowed(cyl(0.7, 0.6, mats.plasticBlue));
      tKnob.rotation.z = Math.PI / 2;
      tKnob.position.set(-S.baseW / 2 - 0.2, 1.5, 6);
      const iKnob = shadowed(cyl(0.7, 0.6, mats.plasticYellow));
      iKnob.rotation.z = Math.PI / 2;
      iKnob.position.set(-S.baseW / 2 - 0.2, 1.5, 3);
      group.add(base, plate, pillar, head, focus, lampArm, lamp, power, led, tKnob, iKnob);
      group.add(at(hit(new THREE.BoxGeometry(3, 4, 4), id, 'focus'), 2.6, 16, -7));
      group.add(at(hit(new THREE.BoxGeometry(2, 1.6, 1.6), id, 'power'), S.baseW / 2 - 2, S.baseTopZ - 0.4, S.baseD / 2));
      group.add(at(hit(new THREE.BoxGeometry(2, 1.6, 1.6), id, 'transmitted'), -S.baseW / 2 - 0.2, 1.5, 6));
      group.add(at(hit(new THREE.BoxGeometry(2, 1.6, 1.6), id, 'incident'), -S.baseW / 2 - 0.2, 1.5, 3));
      group.add(at(hit(new THREE.BoxGeometry(S.baseW, S.baseTopZ, S.baseD), id), 0, S.baseTopZ / 2, 0));
      ring = selRing(13);
      group.add(ring);
      update = (ctx) => {
        const s = ctx.world.stereo;
        head.position.set(0, S.baseTopZ + 10 + (s.headZmm - 112) / 10, dz);
        const half = s.ipdMm / 20;
        eyeL.position.set(-half, 4.5, 3);
        eyeR.position.set(half, 4.5, 3);
        ringL.position.set(-half, 3.4, 3.3);
        ringR.position.set(half, 3.4, 3.3);
        hDl.position.x = -half;
        hDr.position.x = half;
        zoom.rotation.y = s.zoomX * 1.2;
        ringL.rotation.y = s.leftDiopter;
        ringR.rotation.y = s.rightDiopter;
        focus.rotation.x = s.focusTurns * 2 * Math.PI;
        lampMat.opacity = s.power ? 0.2 + 0.8 * s.incident01 : 0.08;
        plateMat.color.setRGB(0.85 + 0.15 * (s.power ? s.transmitted01 : 0), 0.85 + 0.15 * (s.power ? s.transmitted01 : 0), 0.82 + 0.1 * (s.power ? s.transmitted01 : 0));
        ledMat.color.setHex(s.power ? 0x3bff59 : 0x2a2f33);
      };
      break;
    }
    case 'slideCase': {
      const C = GEO_B01.slideCase;
      const body = shadowed(box(C.w, C.h, C.d, own(new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.7 }))));
      body.position.y = C.h / 2;
      const inside = box(C.w - 0.6, 0.1, C.d - 0.6, own(new THREE.MeshStandardMaterial({ color: 0xd7ccc8 })));
      inside.position.y = C.h + 0.02;
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, C.h, -C.d / 2);
      const lid = shadowed(box(C.w, 0.5, C.d, own(new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.6 }))));
      lid.position.set(0, 0.25, C.d / 2);
      const lbl = labelPlane(['Caja de láminas fijas'], 9, 1.2, own, '#3e2723');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.51, C.d / 2);
      lid.add(lbl);
      lidPivot.add(lid);
      group.add(body, inside, lidPivot);
      group.add(at(hit(new THREE.BoxGeometry(C.w, 1.2, 2), id, 'lid'), 0, C.h + 0.4, C.d / 2));
      group.add(at(hit(new THREE.BoxGeometry(C.w, C.h, C.d), id), 0, C.h / 2, 0));
      ring = selRing(11);
      group.add(ring);
      update = (ctx) => {
        lidPivot.rotation.x = ctx.world.slideCase.open ? -1.9 : 0;
        lbl.position.z = C.d / 2;
      };
      break;
    }
    case 'leafSample': {
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(1, 24), own(new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.7, side: THREE.DoubleSide })));
      leaf.scale.set(1.3, 2, 1);
      leaf.rotation.x = -Math.PI / 2;
      leaf.position.y = 0.05;
      const vein = box(0.06, 0.02, 3.6, own(new THREE.MeshStandardMaterial({ color: 0x9ccc65 })));
      vein.position.y = 0.07;
      group.add(leaf, vein, at(hit(new THREE.BoxGeometry(3, 0.6, 4.4), id), 0, 0.3, 0));
      ring = selRing(2.6);
      group.add(ring);
      break;
    }
    case 'insectSample': {
      const shiny = w0.stereoSamples[id]?.assetId === 'insectShiny';
      const shell = own(shiny ? new THREE.MeshStandardMaterial({ color: 0x2e7d32, metalness: 0.9, roughness: 0.15 }) : new THREE.MeshStandardMaterial({ color: 0x3e2a1a, roughness: 0.5 }));
      const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), shell));
      body.scale.set(1, 0.6, 1.5);
      body.position.y = 0.4;
      const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), shell));
      head.position.set(0, 0.35, -1.05);
      group.add(body, head);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const leg = box(0.8, 0.05, 0.05, mats.blackPlastic);
        leg.position.set(s * 0.8, 0.15, -0.4 + i * 0.4);
        group.add(leg);
      }
      group.add(at(hit(new THREE.BoxGeometry(2, 1, 3), id), 0, 0.4, 0));
      ring = selRing(1.8);
      group.add(ring);
      break;
    }
    case 'sampleTray':
    case 'cleanTray': {
      const T = o.kind === 'sampleTray' ? GEO_B01.sampleTray : GEO_B01.tray;
      const t = shadowed(new THREE.Mesh(new RoundedBoxGeometry(T.w, T.h, T.d, 2, 0.3), o.kind === 'sampleTray' ? mats.porcelain : mats.plasticWhite));
      t.position.y = T.h / 2;
      const lbl = labelPlane([o.kind === 'sampleTray' ? 'Muestras' : 'Bandeja de limpieza'], 6, 1, own, '#455a64');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, T.d / 2 + 0.8);
      group.add(t, lbl, at(hit(new THREE.BoxGeometry(T.w, T.h, T.d), id), 0, T.h / 2, 0));
      break;
    }
    case 'glassBin':
    case 'bioWaste': {
      const B = GEO_B01.bin;
      const bin = shadowed(cyl(B.r, B.h, o.kind === 'glassBin' ? own(new THREE.MeshStandardMaterial({ color: 0x546e7a })) : own(new THREE.MeshStandardMaterial({ color: 0xf9a825 })), seg));
      bin.position.y = B.h / 2;
      const lbl = labelPlane([o.kind === 'glassBin' ? 'Vidrio roto' : 'Residuos biológicos'], 7, 2, own, o.kind === 'glassBin' ? '#263238' : '#b71c1c');
      lbl.position.set(0, B.h * 0.6, B.r + 0.05);
      group.add(bin, lbl, at(hit(new THREE.CylinderGeometry(B.r, B.r, B.h, 10), id), 0, B.h / 2, 0));
      break;
    }
    case 'ppeTray': {
      const P = GEO_B01.ppeTray;
      const tray = shadowed(new THREE.Mesh(new RoundedBoxGeometry(P.w, P.h, P.d, 3, 0.6), mats.plasticWhite));
      tray.position.y = P.h / 2;
      const coat = shadowed(box(10, 1.2, 12, own(new THREE.MeshStandardMaterial({ color: 0xf4f6f8 }))));
      coat.position.set(-7, P.h + 0.6, -2);
      const shoes = shadowed(box(4, 2, 7, mats.blackPlastic));
      shoes.position.set(6, P.h + 1, -2);
      const poster = labelPlane(['Bata · calzado cerrado · cabello recogido · manos limpias'], 26, 2.4, own, '#1e8e4e');
      poster.rotation.x = -Math.PI / 2;
      poster.position.set(0, P.h + 0.05, 7);
      group.add(tray, coat, shoes, poster, at(hit(new THREE.BoxGeometry(P.w, 3, P.d), id), 0, 1.5, 0));
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
      if (!customPose) {
        const p = ob.pose;
        group.position.set(p.x, p.z, -p.y);
        group.rotation.set(0, -p.rotationRad, 0);
      }
      // Lo que va en la pinza lo dibuja la pinza.
      if (ob.support === 'fc') group.visible = false;
      else if (o.kind !== 'coverslip') group.visible = true;
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
