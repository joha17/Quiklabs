/**
 * Vistas 3D procedurales de B01 (§4, §15.4): los dos instrumentos articulados (`models/`: microscopio compuesto
 * binocular y estereoscopio de zoom, con cada mando sobre su pivote físico), caja de láminas con tapa y ranuras,
 * portaobjetos con su montaje (fragmento, líquido, cubreobjetos, burbujas, grietas, residuo), cubreobjetos, gotero,
 * pinza, bisturí, papeles, muestras y bandejas. SOLO leen el estado del dominio.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import { GEO_B01, stageTopZCm } from '../../simulation/optical-world/geometry';
import { microscopeView } from '../../simulation/optical-world/world';
import type { QualityLevel } from '../quality';
import { asGlass, materials } from '../renderers/materials';
import { labelTexture, grainTexture } from '../renderers/textures';
import type { FrameCtxB01 } from './OpticalLab3D';
import { buildCompoundMicroscope } from './models/CompoundMicroscopeRig';
import { buildStereoMicroscope } from './models/StereoMicroscopeRig';
import { mergeRigid, part } from './models/geom';
import { hitMesh } from './parts';
import { KIND_COLOR, STAIN_COLOR, buildCellObject, mountTint } from './objects3dCell';
import { buildPermObject } from './objects3dPerm';
import { buildBioObject } from './objects3dBio';
import { buildEnzObject } from './objects3dEnz';
import { buildDivObject } from './objects3dDiv';
import { buildMicroObject } from './objects3dMicro';
import { buildPhotoObject } from './objects3dPhoto';
import { buildPlantObject } from './objects3dPlant';

export interface ObjHandleB01 {
  group: THREE.Group;
  update(ctx: FrameCtxB01, o: OpticalObject): void;
  dispose(): void;
}

const hit = hitMesh;

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
      // Vidrio de portaobjetos: algo más denso y verdoso que el de los frascos, para que el canto se lea sin contorno.
      const slideGlass = own(asGlass(mats.glass.clone(), 0.25));
      slideGlass.color.setHex(0xd4ebe2);
      slideGlass.opacity = 0.2;
      // Vidrio claro y tan delgado que su sombra rayaría la superficie sobre la que apoya: ni la proyecta ni la recibe.
      const glass = box(S.w, S.h, S.d, slideGlass);
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
      // B02: una mancha por zona de tejido (color de la muestra), en lugar de la hoja única de B01.
      const zones = new THREE.Group();
      inner.add(leaf, water, cover, crack, dirt, bubbles, zones);
      inner.add(at(hit(new THREE.BoxGeometry(S.w, 0.6, S.d + 0.4), id), 0, 0.3, 0));
      group.add(inner);
      ring = selRing(4.4);
      group.add(ring);
      customPose = true;
      let bubbleKey = '';
      let zoneKey = '';
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
          // Apenas por encima de la platina: dos caras coplanares parpadean en rayas.
          z = stageTopZCm(microscopeView(w).stageZmm) + 0.015;
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
        leaf.visible = !!mt?.specimenId && !mt.cell;
        zones.visible = !!mt?.cell;
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
          waterMat.color.setHex(mt.cell ? mountTint(mt.cell.stainMl, mt.waterMl) : mt.reagentId ? 0xb5651d : 0x9cc8ea);
          const zk = mt.cell ? mt.cell.zones.map((z) => `${z.kind},${z.centerCm},${z.areaMm2},${z.thicknessMm}`).join(';') : '';
          if (zk !== zoneKey) {
            zoneKey = zk;
            for (const c of [...zones.children]) {
              zones.remove(c);
              (c as THREE.Mesh).geometry.dispose();
              ((c as THREE.Mesh).material as THREE.Material).dispose();
            }
            for (const z of mt.cell?.zones ?? []) {
              const L = Math.max(0.15, Math.min(1.4, Math.sqrt(2 * z.areaMm2) / 10));
              const zm = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshStandardMaterial({ color: KIND_COLOR[z.kind], roughness: 0.6, transparent: true, opacity: z.prep === 'smear' ? 0.45 : 0.9 }));
              zm.rotation.x = -Math.PI / 2;
              zm.scale.set(L, z.prep === 'smear' ? L * 0.45 : L * 0.7, 1);
              zm.position.set(z.centerCm[0], S.h + 0.008 + Math.min(0.3, z.thicknessMm / 10), -z.centerCm[1]);
              zones.add(zm);
            }
          }
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
        const frag = w.cell?.held.fc;
        (tipLeaf.material as THREE.MeshStandardMaterial).color.setHex(frag ? KIND_COLOR[frag.kind] : LEAF_GREEN);
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
      const reagent = w0.dispensers[id]?.reagent ?? 'water';
      const isLugol = reagent === 'lugol';
      const bottle = shadowed(cyl(D.r, D.h * 0.7, isLugol ? mats.amberGlass : mats.glass, seg));
      bottle.position.y = D.h * 0.35;
      const liq = cyl(D.r - 0.15, D.h * 0.45, own(new THREE.MeshStandardMaterial({ color: isLugol ? 0xa0522d : reagent === 'water' ? 0x9cc8ea : STAIN_COLOR[reagent], transparent: true, opacity: 0.6 })), seg);
      liq.position.y = D.h * 0.25;
      const neck = shadowed(cyl(0.45, 1.2, mats.blackPlastic));
      neck.position.y = D.h * 0.7 + 0.6;
      const bulb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), mats.rubberRed));
      bulb.scale.set(1, 1.4, 1);
      bulb.position.y = D.h * 0.7 + 1.8;
      const lbl = labelPlane([labelText || o.label || ''], 3, 1.4, own, isLugol ? '#6d4c41' : reagent === 'methylene-blue' ? '#0d47a1' : reagent === 'eosin-1pct' ? '#ad1457' : '#1565c0');
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
    case 'microscope':
    case 'stereo': {
      const rig = (o.kind === 'microscope' ? buildCompoundMicroscope : buildStereoMicroscope)(id, w0, mats, own, seg);
      group.add(rig.group);
      ring = selRing(o.kind === 'microscope' ? 14 : 13);
      group.add(ring);
      update = (ctx) => rig.update(ctx);
      break;
    }
    case 'slideCase': {
      const C = GEO_B01.slideCase;
      const wood = own(new THREE.MeshPhysicalMaterial({ map: own(grainTexture()), roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
      const rounded = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 2, Math.min(0.07, Math.min(w, h, d) * 0.45));
      const felt = own(new THREE.MeshStandardMaterial({ color: 0x1f4a3e, roughness: 0.95 }));
      const rack = own(new THREE.MeshStandardMaterial({ map: own(grainTexture('#a98a63', '#7d6243')), roughness: 0.6 }));
      const brass = own(new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.7, roughness: 0.35 }));
      // Bandeja hueca: fondo con paño, cuatro paredes y dos peines cuyas ranuras reciben las láminas de canto.
      const tray = new THREE.Group();
      tray.add(part(rounded(C.w, C.rackZ - 0.15, C.d), wood, 0, (C.rackZ - 0.15) / 2, 0));
      tray.add(part(new THREE.BoxGeometry(C.w - 2 * C.wall, 0.15, C.d - 2 * C.wall), felt, 0, C.rackZ - 0.075, 0));
      for (const sz of [-1, 1]) tray.add(part(rounded(C.w, C.h - C.rackZ + 0.15, C.wall), wood, 0, (C.h + C.rackZ - 0.15) / 2, sz * (C.d - C.wall) / 2));
      for (const sx of [-1, 1]) tray.add(part(rounded(C.wall, C.h - C.rackZ + 0.15, C.d - 2 * C.wall), wood, sx * (C.w - C.wall) / 2, (C.h + C.rackZ - 0.15) / 2, 0));
      for (const sz of [-1, 1]) {
        const rz = sz * (C.d / 2 - C.wall - 0.14);
        tray.add(part(rounded(C.w - 2 * C.wall, 0.4, 0.2), rack, 0, C.rackZ + 0.2, rz));
        for (let i = 0; i <= C.slots; i++) tray.add(part(rounded(0.3, 0.8, 0.3), rack, (i - C.slots / 2) * C.pitch, C.rackZ + 0.4, rz));
      }
      // Bisagras y cierre.
      for (const sx of [-1, 1]) tray.add(part(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10), brass, sx * C.w * 0.3, C.h, -C.d / 2 - 0.03, 0, 0, Math.PI / 2));
      tray.add(part(new THREE.BoxGeometry(1.6, 0.7, 0.08), brass, 0, C.h - 0.3, C.d / 2 + 0.04));
      mergeRigid(tray);
      shadowed(tray);
      // Tapa de cajón: con la caja cerrada cubre las láminas que asoman sobre el borde.
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, C.h, -C.d / 2);
      const lid = new THREE.Group();
      const shellT = 0.3;
      lid.add(part(rounded(C.w, shellT, C.d), wood, 0, C.lidH - shellT / 2, C.d / 2));
      lid.add(part(new THREE.BoxGeometry(C.w - 2 * C.wall, 0.04, C.d - 2 * C.wall), felt, 0, C.lidH - shellT - 0.02, C.d / 2));
      for (const z of [C.wall / 2, C.d - C.wall / 2]) lid.add(part(rounded(C.w, C.lidH - shellT, C.wall), wood, 0, (C.lidH - shellT) / 2, z));
      for (const sx of [-1, 1]) lid.add(part(rounded(C.wall, C.lidH - shellT, C.d - 2 * C.wall), wood, sx * (C.w - C.wall) / 2, (C.lidH - shellT) / 2, C.d / 2));
      mergeRigid(lid);
      shadowed(lid);
      const lbl = labelPlane(['Láminas fijas'], 7, 1.6, own, '#7a5a2a');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, C.lidH + 0.01, C.d / 2);
      lidPivot.add(lid, lbl);
      lidPivot.add(at(hit(new THREE.BoxGeometry(C.w, C.lidH + 0.2, 2.4), id, 'lid', { kind: 'press', axis: 'x', click: true }), 0, C.lidH / 2, C.d - 1.2));
      group.add(tray, lidPivot);
      group.add(at(hit(new THREE.BoxGeometry(C.w, C.h, C.d), id), 0, C.h / 2, 0));
      ring = selRing(11);
      group.add(ring);
      update = (ctx) => {
        lidPivot.rotation.x = ctx.world.slideCase.open ? -1.9 : 0;
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
    default: {
      // Objetos propios de B02 (fuentes de tejido, tabla, espátula, hisopos…) y de B03 (membranas, cámaras, frascos…).
      const lbl = (lines: string[], w: number, h: number, band: string) => labelPlane(lines, w, h, own, band);
      const cv = buildCellObject(o, w0, group, mats, own, lbl, seg) ?? buildPermObject(o, w0, group, mats, own, lbl, seg) ?? buildBioObject(o, w0, group, mats, own, lbl, seg) ?? buildEnzObject(o, w0, group, mats, own, lbl, seg) ?? buildDivObject(o, w0, group, mats, own, lbl, seg) ?? buildMicroObject(o, w0, group, mats, own, lbl, seg) ?? buildPhotoObject(o, w0, group, mats, own, lbl, seg) ?? buildPlantObject(o, w0, group, mats, own, lbl, seg);
      if (cv) {
        ring = selRing(cv.ringR);
        group.add(ring);
        if (cv.update) update = cv.update;
      }
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
