/**
 * Vistas 3D procedurales de los objetos propios de B04 (§4.2): frascos de lotes y reactivos, probetas, pipetas,
 * goteros, gradillas y tubos (rótulo, tapón, colector de gas y espuma), beakers, placas con agitador (perilla, brillo
 * de la placa, barra que gira), balanza, bote de pesaje, frascos de polvo, hígado, baños María, pinza de tubos,
 * termómetro, tiras de pH, fotómetro y cubetas, frascos de Feulgen y mechero. Como en B01–B03, SOLO leen el estado
 * del dominio: el color de cada líquido sale de `observeVessel` (la misma química que lee el estudiante).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { BioVessel, BioWorld } from '../../simulation/bio-world/types';
import { GEO_B04 } from '../../simulation/bio-world/geometry';
import { observeVessel } from '../../simulation/bio-world/world';
import type { MaterialSet } from '../renderers/materials';
import type { FrameCtxB01 } from './OpticalLab3D';
import type { CellVisual } from './objects3dCell';
import { hitMesh } from './parts';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;
type Label = (lines: string[], w: number, h: number, band: string) => THREE.Mesh;

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

const bio = (w: OpticalWorld) => (w as BioWorld).bio;

/** Color de cada lectura visual (los mismos estados que el estudiante lee con el ojo). */
const LOOK: Record<string, [number, number]> = {
  'lugol:yellow': [0xd9a441, 0.6], 'lugol:faint': [0x8a7a9c, 0.7], 'lugol:blue': [0x2b3a8c, 0.85], 'lugol:black': [0x14142a, 0.93],
  'biuret:blue': [0x4a7ee0, 0.7], 'biuret:lilac': [0x9a7ad0, 0.75], 'biuret:violet': [0x6b2fa5, 0.85], 'biuret:precipitate': [0x6f9fd8, 0.9],
  'benedict:blue': [0x2f7fe0, 0.75], 'benedict:green': [0x5f9f4a, 0.8], 'benedict:yellow': [0xd8c040, 0.85], 'benedict:orange': [0xe0802a, 0.9], 'benedict:brick': [0xb0402a, 0.95],
  'emulsion:clear': [0xf2f0e0, 0.35], 'emulsion:cloudy': [0xf0eee6, 0.7], 'emulsion:milky': [0xfafaf6, 0.92], 'emulsion:layers': [0xe8d890, 0.6],
  'initial:clear': [0x9cc8ea, 0.4], 'initial:turbid': [0xf0ece0, 0.8], 'initial:colored': [0xb8603a, 0.75],
  interference: [0x6e6450, 0.85],
};

/** Color y opacidad de un recipiente según su química (frascos sin reactivo: color propio del lote). */
export function liquidLookBio(w: OpticalWorld, id: string): { color: number; opacity: number } {
  const v = bio(w).vessels[id];
  if (!v || v.volumeMl <= 1e-6) return { color: 0x9cc8ea, opacity: 0.4 };
  const V = v.volumeMl;
  if (v.s.iodine > 0 && v.s.starch + v.s.dextrin < 1e-9 && V < 20 && !bio(w).tubes[id]) return { color: 0x8a4a1e, opacity: 0.8 };
  if (v.s.cu > 0 && !bio(w).tubes[id] && v.s.acid < 0 && V > 20) return { color: 0x2f7fe0, opacity: 0.75 };
  if (v.s.cu > 0 && !bio(w).tubes[id]) return { color: 0x4a90e0, opacity: 0.7 };
  if (v.s.lipidMg / V > 300) return { color: 0xe8c860, opacity: 0.75 };
  if (v.s.nadh > 0) return { color: 0xf4f4f0, opacity: 0.4 };
  const q = observeVessel(w as BioWorld, id).quality.replace(/:(spots|pigment)$/, '');
  const base = q.startsWith('foam') ? 'initial:clear' : q;
  const l = LOOK[base] ?? LOOK['initial:clear'];
  return { color: l[0], opacity: l[1] };
}

function liquidMesh(geo: THREE.BufferGeometry, own: Own) {
  const mat = own(new THREE.MeshStandardMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.45, roughness: 0.15, depthWrite: false }));
  return { mesh: new THREE.Mesh(geo, mat), mat };
}

function setLiquid(w: OpticalWorld, id: string, mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial, v: BioVessel | undefined, base: number, h: number) {
  const f = v ? Math.min(1, v.volumeMl / Math.max(1e-6, v.capacityMl)) : 0;
  mesh.visible = f > 0.002;
  mesh.scale.y = Math.max(0.001, f);
  mesh.position.y = base + (h * Math.max(0.001, f)) / 2;
  if (v && mesh.visible) {
    const l = liquidLookBio(w, id);
    mat.color.setHex(l.color);
    mat.opacity = l.opacity;
  }
}

/** Base interior y altura útil (cm) de cada recipiente, para el líquido y el menisco. */
function vesselBox(w: OpticalWorld, id: string): { base: number; h: number } | null {
  const o = w.objects[id];
  if (!o) return null;
  switch (o.kind) {
    case 'bioBottle': return { base: 0.4, h: GEO_B04.bottle.h * 0.7 };
    case 'bioCylinder': return { base: 0.8, h: (id === 'g10' ? GEO_B04.cylinder10.h : GEO_B04.cylinder100.h) - 2 };
    case 'bioBeaker': return { base: 0.3, h: beakerGeo(id).h - 1 };
    case 'bioTube':
    case 'cuvette': return { base: 0.6, h: GEO_B04.tube.h - 1.4 };
    case 'bioPipette': return { base: 0.3, h: GEO_B04.pipette.length * 0.6 };
  }
  return null;
}

const beakerGeo = (id: string) => (id === 'bk1' ? GEO_B04.beaker250 : id === 'bk2' ? GEO_B04.beaker50 : GEO_B04.beaker25);

/** Altura del menisco (cm sobre la mesada) de un recipiente de B04; null si no aplica. */
export function meniscusAtBio(w: OpticalWorld, id: string): { x: number; y: number; z: number } | null {
  const o = w.objects[id];
  const g = vesselBox(w, id);
  const v = bio(w)?.vessels[id];
  if (!o || !g || !v) return null;
  const f = Math.min(1, v.volumeMl / Math.max(1e-6, v.capacityMl));
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + g.base + f * g.h };
}

const BAND: Record<string, string> = { bW: '#1565c0', bEt: '#827717', bBe: '#0d47a1', bH: '#00838f', bHo: '#6d4c41', bMe: '#b71c1c', bHCl: '#c62828', bOH: '#4527a0' };

/** Construye la vista de un objeto de B04 en `group`; null si la clase no es de B04. */
export function buildBioObject(o: OpticalObject, _w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: Label, seg: number): CellVisual | null {
  const id = o.id;
  switch (o.kind) {
    case 'bioBottle': {
      const B = GEO_B04.bottle;
      const inner = new THREE.Group();
      const amber = id === 'bH' || id === 'bHo' || id === 'aNad';
      const bottle = cyl(B.r, B.h * 0.75, amber ? mats.amberGlass : mats.glass, seg);
      bottle.position.y = (B.h * 0.75) / 2;
      const neck = cyl(B.r * 0.45, B.h * 0.2, mats.glass, seg);
      neck.position.y = B.h * 0.85;
      const cap = cyl(B.r * 0.5, 0.8, id === 'bMe' ? mats.rubberRed : mats.blackPlastic, seg);
      cap.position.y = B.h * 0.98;
      const l = liquidMesh(new THREE.CylinderGeometry(B.r - 0.2, B.r - 0.2, B.h * 0.7, seg), own);
      const lbl = label((o.label ?? id).split(' · '), 4.4, 2, BAND[id] ?? (id.startsWith('s') ? '#2e7d32' : id.startsWith('a') ? '#37474f' : '#e65100'));
      lbl.position.set(0, B.h * 0.4, B.r + 0.03);
      inner.add(bottle, neck, cap, l.mesh, lbl);
      group.add(inner, at(hitMesh(new THREE.CylinderGeometry(B.r + 0.4, B.r + 0.4, B.h + 1, 10), id), 0, (B.h + 1) / 2, 0));
      return {
        ringR: B.r + 0.9,
        update: (ctx) => {
          setLiquid(ctx.world, id, l.mesh, l.mat, bio(ctx.world).vessels[id], 0.4, B.h * 0.7);
          tilt(inner, ctx, id);
        },
      };
    }
    case 'bioCylinder': {
      const C = id === 'g10' ? GEO_B04.cylinder10 : GEO_B04.cylinder100;
      const inner = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, C.h, seg, 1, true), mats.glass);
      tube.position.y = C.h / 2;
      const foot = cyl(C.r * 2, 0.6, mats.glass, seg);
      foot.position.y = 0.3;
      const tickMat = own(new THREE.MeshBasicMaterial({ color: 0x1a237e }));
      for (let i = 1; i <= 10; i++) {
        const t = box(i % 2 ? 0.4 : 0.8, 0.05, 0.05, tickMat);
        t.position.set(-C.r + 0.2, 0.8 + ((C.h - 2) * i) / 10, C.r + 0.01);
        inner.add(t);
      }
      const l = liquidMesh(new THREE.CylinderGeometry(C.r - 0.1, C.r - 0.1, C.h - 2, seg), own);
      inner.add(tube, foot, l.mesh);
      const lbl = label([o.label ?? id], 5, 1, '#1a237e');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, C.r * 2 + 0.8);
      group.add(inner, lbl, at(hitMesh(new THREE.CylinderGeometry(C.r + 0.6, C.r + 0.6, C.h, 10), id), 0, C.h / 2, 0));
      return {
        ringR: C.r * 2 + 0.6,
        update: (ctx) => {
          setLiquid(ctx.world, id, l.mesh, l.mat, bio(ctx.world).vessels[id], 0.8, C.h - 2);
          tilt(inner, ctx, id);
        },
      };
    }
    case 'bioPipette': {
      const L = GEO_B04.pipette.length;
      const inner = new THREE.Group();
      const body = cyl(id === 'pv' ? 0.2 : 0.25, L, mats.glass, 10);
      body.position.y = L / 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(id === 'pv' ? 0.45 : 0.55, 12, 8), id === 'pv' ? mats.plasticBlue : mats.rubberRed);
      bulb.scale.set(1, 1.6, 1);
      bulb.position.y = L + 0.6;
      if (id === 'pv') {
        const swell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), mats.glass);
        swell.scale.set(1, 2, 1);
        swell.position.y = L * 0.45;
        inner.add(swell);
      }
      const l = liquidMesh(new THREE.CylinderGeometry(0.16, 0.16, L * 0.6, 8), own);
      inner.add(body, bulb, l.mesh);
      group.add(inner, at(hitMesh(new THREE.BoxGeometry(1.2, 1.2, L), id), 0, 0.6, 0));
      return {
        ringR: 2,
        update: (ctx, ob) => {
          setLiquid(ctx.world, id, l.mesh, l.mat, bio(ctx.world).vessels[id], 0.3, L * 0.6);
          inner.rotation.x = ob.support === 'hand' ? 0 : Math.PI / 2;
          inner.position.set(0, ob.support === 'hand' ? 0 : 0.3, ob.support === 'hand' ? 0 : L / 2);
        },
      };
    }
    case 'bioDropper': {
      const D = GEO_B04.dropper;
      const bottle = cyl(D.r, D.h * 0.7, id === 'dI' ? mats.amberGlass : mats.glass, seg);
      bottle.position.y = (D.h * 0.7) / 2;
      const teat = new THREE.Mesh(new THREE.SphereGeometry(D.r * 0.5, 10, 8), mats.rubberRed);
      teat.scale.set(1, 1.5, 1);
      teat.position.y = D.h * 0.95;
      const neck = cyl(D.r * 0.3, D.h * 0.2, mats.glass, 10);
      neck.position.y = D.h * 0.78;
      const l = liquidMesh(new THREE.CylinderGeometry(D.r - 0.15, D.r - 0.15, D.h * 0.6, seg), own);
      const lbl = label([o.label ?? id], 4, 1.2, id === 'dI' ? '#6d4c41' : id === 'dCu' ? '#0d47a1' : '#4527a0');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, D.r + 1);
      group.add(bottle, neck, teat, l.mesh, lbl, at(hitMesh(new THREE.CylinderGeometry(D.r + 0.4, D.r + 0.4, D.h, 10), id), 0, D.h / 2, 0));
      return { ringR: D.r + 0.8, update: (ctx) => setLiquid(ctx.world, id, l.mesh, l.mat, bio(ctx.world).vessels[id], 0.3, D.h * 0.6) };
    }
    case 'bioRack': {
      const R = GEO_B04.rack;
      const wide = id === 'rkD' ? 1 : 0;
      const W = id === 'rkC' ? R.w * 0.8 : R.w;
      const D = R.d + wide * 3.6;
      const top = box(W, 0.4, D, mats.plasticWhite);
      top.position.y = R.h;
      const bottom = box(W, 0.4, D, mats.plasticWhite);
      bottom.position.y = 0.2;
      const legL = box(0.4, R.h, D, mats.plasticWhite);
      legL.position.set(-W / 2 + 0.2, R.h / 2, 0);
      const legR = legL.clone();
      legR.position.x = W / 2 - 0.2;
      const lbl = label([o.label ?? id], 6, 1, '#00695c');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, D / 2 + 0.8);
      group.add(top, bottom, legL, legR, lbl, at(hitMesh(new THREE.BoxGeometry(W, R.h, D), id), 0, R.h / 2, 0));
      return { ringR: W / 2 + 0.6 };
    }
    case 'bioTube':
    case 'cuvette': {
      const cuv = o.kind === 'cuvette';
      const T = cuv ? { r: GEO_B04.cuvette.w / 2, h: GEO_B04.cuvette.h } : GEO_B04.tube;
      const tube = cuv
        ? new THREE.Mesh(new THREE.BoxGeometry(T.r * 2, T.h, T.r * 2), mats.glass)
        : new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, T.h, 12, 1, true), mats.glass);
      tube.position.y = T.h / 2;
      const l = liquidMesh(cuv ? new THREE.BoxGeometry(T.r * 2 - 0.15, T.h - 0.6, T.r * 2 - 0.15) : new THREE.CylinderGeometry(T.r - 0.1, T.r - 0.1, T.h - 1.4, 12), own);
      const foam = cyl(T.r - 0.08, 1, own(new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 0.9 })), 12);
      const tagMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff }));
      const tag = box(T.r * 2 + 0.1, 1, 0.05, tagMat);
      tag.position.set(0, T.h - 1.5, T.r + 0.03);
      const cap = cyl(T.r + 0.08, 0.6, mats.rubberRed, 12);
      cap.position.y = T.h + 0.3;
      // Colector de gas: manguera hacia la probeta invertida (sellado: tapón gris; suelto: tapón torcido).
      const stopper = cyl(T.r + 0.05, 0.8, own(new THREE.MeshStandardMaterial({ color: 0x78909c })), 12);
      stopper.position.y = T.h + 0.3;
      const hose = cyl(0.12, 6, own(new THREE.MeshStandardMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.7 })), 6);
      hose.rotation.z = Math.PI / 2.6;
      hose.position.set(2.2, T.h + 1.6, 0);
      if (!cuv) group.add(tube, new THREE.Mesh(new THREE.SphereGeometry(T.r, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.glass));
      else group.add(tube);
      group.add(l.mesh, foam, tag, cap, stopper, hose, at(hitMesh(new THREE.CylinderGeometry(T.r + 0.3, T.r + 0.3, T.h, 8), id), 0, T.h / 2, 0));
      const inner = cuv ? T.h - 0.6 : T.h - 1.4;
      return {
        ringR: T.r + 0.6,
        update: (ctx, ob) => {
          const B = bio(ctx.world);
          const t = B.tubes[id];
          const v = B.vessels[id];
          setLiquid(ctx.world, id, l.mesh, l.mat, v, cuv ? 0.3 : 0.6, inner);
          const f = v ? Math.min(1, v.volumeMl / v.capacityMl) : 0;
          const fm = t ? Math.min(T.h * 0.9 - f * inner, t.foamMl * 0.25) : 0;
          foam.visible = fm > 0.05;
          foam.scale.y = Math.max(0.01, fm);
          foam.position.y = (cuv ? 0.3 : 0.6) + f * inner + fm / 2;
          tag.visible = !!t?.label;
          tagMat.color.setHex(!t?.label ? 0xffffff : t.label.startsWith('LUG') ? 0xffe0b2 : t.label.startsWith('BIU') ? 0xd1c4e9 : t.label.startsWith('BEN') ? 0xbbdefb : t.label.startsWith('EMU') ? 0xfff9c4 : t.label.startsWith('CAT') ? 0xc8e6c9 : 0xf8bbd0);
          cap.visible = !!t?.capped;
          stopper.visible = !!t?.collector;
          hose.visible = !!t?.collector;
          stopper.rotation.z = t?.collector && !t.collector.sealed ? 0.35 : 0;
          group.visible = !t?.discarded;
          void ob;
        },
      };
    }
    case 'bioBeaker':
    case 'rinseBeaker': {
      const B = o.kind === 'rinseBeaker' ? GEO_B04.rinse : beakerGeo(id);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r * 0.92, B.h, seg, 1, true), mats.glass);
      b.position.y = B.h / 2;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(B.r * 0.92, seg), mats.glass);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      const l = liquidMesh(new THREE.CylinderGeometry(B.r - 0.2, B.r * 0.92 - 0.2, B.h - 1, seg), own);
      // Sedimento del almidón sin dispersar en el fondo.
      const sed = cyl(B.r * 0.85, 0.3, own(new THREE.MeshStandardMaterial({ color: 0xf5f2e8, roughness: 0.95 })), seg);
      sed.position.y = 0.2;
      const lbl = label([o.label ?? id], 4.5, 1, '#1565c0');
      lbl.position.set(0, B.h * 0.45, B.r + 0.03);
      const tagLbl = label(['P'], 1.6, 1, '#2e7d32');
      tagLbl.position.set(B.r * 0.5, B.h * 0.75, B.r * 0.85 + 0.03);
      group.add(b, floor, l.mesh, sed, lbl, tagLbl, at(hitMesh(new THREE.CylinderGeometry(B.r, B.r, B.h, 10), id), 0, B.h / 2, 0));
      return {
        ringR: B.r + 0.6,
        update: (ctx) => {
          const v = bio(ctx.world).vessels[id];
          setLiquid(ctx.world, id, l.mesh, l.mat, v, 0.3, B.h - 1);
          const solid = v ? v.s.starchSolid + v.s.amySolid * 0 : 0;
          sed.visible = solid > 1;
          sed.scale.y = Math.min(4, 0.5 + solid / 60);
          const prep = Object.values(bio(ctx.world).preps).find((p) => p?.vesselId === id);
          tagLbl.visible = !!prep?.labeled;
        },
      };
    }
    case 'hotplate': {
      const H = GEO_B04.hotplate;
      const body = new THREE.Mesh(new RoundedBoxGeometry(H.w, H.h, H.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.5 })));
      body.position.y = H.h / 2;
      const plateMat = own(new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.6, roughness: 0.4, emissive: 0x000000 }));
      const plate = cyl(H.w * 0.42, 0.4, plateMat, seg);
      plate.position.set(0, H.h + 0.2, -1.5);
      const knobs = [-3, 3].map((x, i) => {
        const k = cyl(1, 1, i ? mats.plasticBlue : mats.rubberRed, 14);
        k.rotation.x = Math.PI / 2;
        k.position.set(x, H.h * 0.45, H.d / 2 + 0.5);
        return k;
      });
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x424242 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat);
      led.position.set(0, H.h * 0.75, H.d / 2 + 0.05);
      const lbl = label([o.label ?? id], 7, 1, '#37474f');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, H.d / 2 + 1.6);
      group.add(body, plate, ...knobs, led, lbl, at(hitMesh(new THREE.BoxGeometry(H.w, H.h, H.d), id), 0, H.h / 2, 0));
      return {
        ringR: H.w / 2 + 1,
        update: (ctx) => {
          const p = bio(ctx.world).plates[id];
          if (!p) return;
          knobs[0].rotation.z = -((p.setK - 298.15) / 250) * Math.PI * 1.5;
          knobs[1].rotation.z = -(p.rpm / 1500) * Math.PI * 1.5;
          // La placa caliente brilla (más de 60 °C); el LED rojo indica calefacción encendida.
          const hot = Math.max(0, Math.min(1, (p.plateK - 333) / 150));
          plateMat.emissive.setRGB(hot * 0.7, hot * 0.15, 0);
          ledMat.color.setHex(p.on ? 0xe53935 : p.rpm > 0 ? 0x43a047 : 0x424242);
        },
      };
    }
    case 'stirBar': {
      const L = GEO_B04.bar.length;
      const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, L - 0.5, 4, 8), own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })));
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 0.25;
      const spin = new THREE.Group();
      spin.add(bar);
      group.add(spin, at(hitMesh(new THREE.BoxGeometry(L + 0.6, 0.8, 1), id), 0, 0.4, 0));
      return {
        ringR: L / 2 + 0.6,
        update: (ctx) => {
          const B = bio(ctx.world);
          const vid = B.bars[id];
          const pl = vid ? Object.values(B.plates).find((p) => p.vesselId === vid) : null;
          if (pl && pl.rpm > 0 && !ctx.reducedMotion) spin.rotation.y += Math.min(0.9, (pl.rpm / 60) * Math.PI * 2 * ctx.dt * 0.15);
        },
      };
    }
    case 'balance': {
      const Bl = GEO_B04.balance;
      const body = new THREE.Mesh(new RoundedBoxGeometry(Bl.w, Bl.h, Bl.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 })));
      body.position.y = Bl.h / 2;
      const pan = cyl(Bl.w * 0.35, 0.3, mats.steel, seg);
      pan.position.set(0, Bl.h + 0.15, -1.5);
      const screenMat = own(new THREE.MeshBasicMaterial({ color: 0x263238 }));
      const screen = box(Bl.w * 0.5, Bl.h * 0.4, 0.05, screenMat);
      screen.position.set(0, Bl.h * 0.5, Bl.d / 2 + 0.03);
      const lbl = label([o.label ?? id], 7, 1, '#37474f');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, Bl.d / 2 + 0.9);
      group.add(body, pan, screen, lbl, at(hitMesh(new THREE.BoxGeometry(Bl.w, Bl.h, Bl.d), id), 0, Bl.h / 2, 0));
      return { ringR: Bl.w / 2 + 1, update: (ctx) => void screenMat.color.setHex(bio(ctx.world).balance.tared ? 0x1b5e20 : 0x263238) };
    }
    case 'weighBoat': {
      const W = GEO_B04.boat;
      const boat = new THREE.Mesh(new THREE.CylinderGeometry(W.w / 2, W.w / 2.6, W.h, 4, 1, true), own(new THREE.MeshStandardMaterial({ color: 0xe1f5fe, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })));
      boat.rotation.y = Math.PI / 4;
      boat.position.y = W.h / 2;
      const heap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 12), own(new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.95 })));
      heap.position.y = 0.4;
      group.add(boat, heap, at(hitMesh(new THREE.BoxGeometry(W.w, 1, W.d), id), 0, 0.5, 0));
      return {
        ringR: W.w / 2 + 0.6,
        update: (ctx) => {
          const g = Object.values(bio(ctx.world).boat.load).reduce((a, b) => a + b, 0);
          heap.visible = g > 0.01;
          heap.scale.setScalar(Math.min(1.4, 0.3 + Math.cbrt(g) / 3));
        },
      };
    }
    case 'powderJar': {
      const J = GEO_B04.jar;
      const jar = cyl(J.r, J.h, mats.glass, seg);
      jar.position.y = J.h / 2;
      const powder = cyl(J.r - 0.2, J.h * 0.6, own(new THREE.MeshStandardMaterial({ color: id === 'jAm' ? 0xf3e5ab : 0xfdfdfb, roughness: 0.95 })), seg);
      powder.position.y = (J.h * 0.6) / 2 + 0.1;
      const lid = cyl(J.r + 0.15, 0.6, mats.blackPlastic, seg);
      lid.position.y = J.h + 0.3;
      const lbl = label((o.label ?? id).split(' ('), 5, 1.6, id === 'jAm' ? '#6a1b9a' : '#5d4037');
      lbl.position.set(0, J.h * 0.5, J.r + 0.03);
      group.add(jar, powder, lid, lbl, at(hitMesh(new THREE.CylinderGeometry(J.r + 0.4, J.r + 0.4, J.h + 0.6, 10), id), 0, (J.h + 0.6) / 2, 0));
      return {
        ringR: J.r + 0.9,
        update: (ctx) => {
          const g = bio(ctx.world).powders[id] ?? 0;
          const f = Math.max(0.02, Math.min(1, g / (id === 'jAm' ? 2 : 60)));
          powder.scale.y = f;
          powder.position.y = (J.h * 0.6 * f) / 2 + 0.1;
        },
      };
    }
    case 'liverSample': {
      const piece = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), own(new THREE.MeshStandardMaterial({ color: 0x6d1f1f, roughness: 0.6 })));
      piece.scale.set(1.4, 0.45, 1);
      piece.position.y = 0.6;
      const bits = new THREE.Group();
      const bitGeo = new THREE.BoxGeometry(0.5, 0.35, 0.5);
      const bitMat = own(new THREE.MeshStandardMaterial({ color: 0x7a2424, roughness: 0.6 }));
      for (let i = 0; i < 9; i++) bits.add(at(new THREE.Mesh(bitGeo, bitMat), ((i % 3) - 1) * 0.8, 0.2, (Math.floor(i / 3) - 1) * 0.8));
      group.add(piece, bits, at(hitMesh(new THREE.BoxGeometry(4, 1.5, 3), id), 0, 0.7, 0));
      return {
        ringR: 2.8,
        update: (ctx) => {
          const lv = bio(ctx.world).liver;
          const cut = lv.sizeCm !== null && lv.sizeCm < 2.5;
          piece.visible = !cut;
          bits.visible = cut;
          bits.scale.setScalar(lv.sizeCm ? Math.max(0.5, Math.min(1.6, lv.sizeCm / 0.6)) : 1);
          group.visible = lv.inVessel !== 'waste';
        },
      };
    }
    case 'waterBath': {
      const W = GEO_B04.bath;
      const tank = new THREE.Mesh(new RoundedBoxGeometry(W.w, W.h, W.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.4, roughness: 0.4 })));
      tank.position.y = W.h / 2;
      const waterMat = own(new THREE.MeshStandardMaterial({ color: 0x7fb8e6, transparent: true, opacity: 0.6, emissive: 0x000000 }));
      const water = box(W.w - 1.2, 0.1, W.d - 1.2, waterMat);
      water.position.y = W.h - 1.2;
      const panel = box(W.w * 0.4, W.h * 0.35, 0.05, own(new THREE.MeshBasicMaterial({ color: 0x263238 })));
      panel.position.set(-W.w * 0.2, W.h * 0.5, W.d / 2 + 0.03);
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x424242 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), ledMat);
      led.position.set(W.w * 0.2, W.h * 0.5, W.d / 2 + 0.05);
      const lbl = label([o.label ?? id], 8, 1.2, '#01579b');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, W.d / 2 + 1);
      group.add(tank, water, panel, led, lbl, at(hitMesh(new THREE.BoxGeometry(W.w, W.h, W.d), id), 0, W.h / 2, 0));
      return {
        ringR: W.w / 2 + 1,
        update: (ctx) => {
          const b = bio(ctx.world).baths[id];
          if (!b) return;
          const hot = Math.max(0, Math.min(1, (b.tK - 310) / 60));
          waterMat.emissive.setRGB(hot * 0.25, hot * 0.08, 0);
          ledMat.color.setHex(!b.on ? 0x424242 : b.readyAt !== null ? 0x43a047 : 0xffb300);
        },
      };
    }
    case 'tongs': {
      const L = GEO_B04.tongs.length;
      const armMat = mats.steel;
      const a = box(0.3, 0.3, L, armMat);
      a.position.set(-0.3, 0.3, 0);
      a.rotation.y = 0.04;
      const b = box(0.3, 0.3, L, armMat);
      b.position.set(0.3, 0.3, 0);
      b.rotation.y = -0.04;
      group.add(a, b, at(hitMesh(new THREE.BoxGeometry(1.4, 1, L), id), 0, 0.5, 0));
      return { ringR: 2.5 };
    }
    case 'bioThermo': {
      const L = GEO_B04.thermometer.length;
      const stick = cyl(0.2, L, mats.glass, 8);
      stick.rotation.x = Math.PI / 2;
      stick.position.y = 0.25;
      const red = cyl(0.08, L * 0.45, own(new THREE.MeshBasicMaterial({ color: 0xd32f2f })), 6);
      red.rotation.x = Math.PI / 2;
      red.position.set(0, 0.25, L / 2 - (L * 0.45) / 2);
      group.add(stick, red, at(hitMesh(new THREE.BoxGeometry(1, 1, L), id), 0, 0.4, 0));
      return { ringR: 2 };
    }
    case 'phStrips': {
      const S = GEO_B04.strips;
      const pack = box(S.w, S.h, S.d, own(new THREE.MeshStandardMaterial({ color: 0xfff176 })));
      pack.position.y = S.h / 2;
      const scale = new THREE.Group();
      [0xd32f2f, 0xff9800, 0xfdd835, 0x7cb342, 0x1e88e5, 0x5e35b1].forEach((c, i) => scale.add(at(box(0.55, 0.05, 1, own(new THREE.MeshBasicMaterial({ color: c }))), -S.w / 2 + 0.45 + i * 0.62, S.h + 0.03, 0)));
      group.add(pack, scale, at(hitMesh(new THREE.BoxGeometry(S.w, S.h + 0.5, S.d), id), 0, S.h / 2, 0));
      return { ringR: S.d / 2 + 0.8 };
    }
    case 'photometer': {
      const P = GEO_B04.photometer;
      const body = new THREE.Mesh(new RoundedBoxGeometry(P.w, P.h, P.d, 2, 0.5), own(new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.5 })));
      body.position.y = P.h / 2;
      const screen = box(P.w * 0.5, P.h * 0.35, 0.05, own(new THREE.MeshBasicMaterial({ color: 0x263238 })));
      screen.position.set(-P.w * 0.15, P.h * 0.6, P.d / 2 + 0.03);
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0xff7043 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), ledMat);
      led.position.set(P.w * 0.32, P.h * 0.6, P.d / 2 + 0.05);
      const lbl = label([o.label ?? 'Fotómetro'], 6, 1, '#37474f');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, P.d / 2 + 0.8);
      group.add(body, screen, led, lbl, at(hitMesh(new THREE.BoxGeometry(P.w, P.h, P.d), id), 0, P.h / 2, 0));
      return { ringR: P.w / 2 + 1, update: (ctx) => void ledMat.color.setHex(bio(ctx.world).photometer.blanked ? 0x66bb6a : 0xff7043) };
    }
    case 'stainJar': {
      const S = GEO_B04.stainJar;
      const jar = cyl(S.r, S.h, mats.glass, seg);
      jar.position.y = S.h / 2;
      const COLOR: Record<string, number> = { jFix: 0xf1f8e9, jHcl: 0xffe0b2, jWash: 0x9cc8ea, jSch: 0xc2185b };
      const liq = cyl(S.r - 0.15, S.h * 0.7, own(new THREE.MeshStandardMaterial({ color: COLOR[id] ?? 0x9cc8ea, transparent: true, opacity: 0.55 })), seg);
      liq.position.y = (S.h * 0.7) / 2 + 0.1;
      const lid = cyl(S.r + 0.1, 0.5, mats.blackPlastic, seg);
      lid.position.y = S.h + 0.25;
      const lbl = label((o.label ?? id).split(' a '), 4, 1.4, id === 'jSch' ? '#880e4f' : '#37474f');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, S.r + 1);
      group.add(jar, liq, lid, lbl, at(hitMesh(new THREE.CylinderGeometry(S.r + 0.4, S.r + 0.4, S.h + 0.5, 10), id), 0, (S.h + 0.5) / 2, 0));
      return { ringR: S.r + 0.8 };
    }
    case 'burner': {
      const Bu = GEO_B04.burner;
      const base = cyl(Bu.r, 0.8, mats.darkMetal, seg);
      base.position.y = 0.4;
      const pipe = cyl(0.6, Bu.h, mats.chrome, 12);
      pipe.position.y = Bu.h / 2 + 0.8;
      const flameMat = own(new THREE.MeshBasicMaterial({ color: 0x4f7fff, transparent: true, opacity: 0.7 }));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 10), flameMat);
      flame.position.y = Bu.h + 2.4;
      const lbl = label([o.label ?? 'Mechero'], 6, 1, '#b71c1c');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, Bu.r + 1);
      group.add(base, pipe, flame, lbl, at(hitMesh(new THREE.CylinderGeometry(Bu.r, Bu.r, Bu.h + 1, 10), id), 0, (Bu.h + 1) / 2, 0));
      return { ringR: Bu.r + 0.8, update: (ctx) => void (flame.visible = bio(ctx.world).burnerLit) };
    }
  }
  return null;
}

/** Inclinación del frasco, beaker o probeta mientras vierte (la boca hacia el destino). */
function tilt(inner: THREE.Group, ctx: FrameCtxB01, id: string) {
  const pour = bio(ctx.world).pours[id];
  const target = pour ? ctx.world.objects[pour.targetId] : null;
  const self = ctx.world.objects[id];
  const dir = target && self ? Math.sign(target.pose.x - self.pose.x) || 1 : 1;
  const goal = pour ? (-dir * Math.min(115, pour.tiltDeg) * Math.PI) / 180 : 0;
  inner.rotation.z += (goal - inner.rotation.z) * Math.min(1, ctx.dt * 6);
}
