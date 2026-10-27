/**
 * Estereoscopio binocular de zoom (§4.E) con las proporciones de un equipo de referencia tipo LABOMED Luxeo 6Z
 * (sin logotipos ni cotas de ficha: `rigGeometry` pending):
 * - base blanca ancha con platina circular (se ilumina desde abajo con la luz transmitida), diales de luz incidente y
 *   transmitida a los costados e interruptor;
 * - columna cromada con el carro de enfoque: el carro se fija a una altura (cabezal, `headZmm`) y la cremallera sube y
 *   baja el cuerpo óptico al girar las perillas de enfoque de ambos lados (`focusTurns`);
 * - cuerpo de zoom blanco con perillas de zoom a ambos lados, objetivo con anillo de luz incidente y cabezal binocular
 *   a 45° con oculares deslizantes (distancia interpupilar) y anillo de dioptrías en cada ocular.
 * La altura del cuerpo óptico es la que usa el dominio: lente = base + (cabezal + vueltas × paso).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalWorld } from '../../../simulation/optical-world/types';
import { GEO_B01, STEREO_BASE, STEREO_POS } from '../../../simulation/optical-world/geometry';
import type { MaterialSet } from '../../renderers/materials';
import type { FrameCtxB01 } from '../OpticalLab3D';
import { KIN, hitMesh, knobHit, placeAt } from '../parts';
import { knurled, lathe, mergeRigid, part, plan, roundedRect } from './geom';
import type { RigHandle } from './CompoundMicroscopeRig';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;

/** Centro de la platina respecto del origen del estereoscopio (cm hacia el alumno) y posición de la columna. */
const DZ = STEREO_POS.y - STEREO_BASE.y;
const PILLAR_Z = -7.5;

const keep = <T extends THREE.Object3D>(o: T): T => {
  o.userData.keep = true;
  return o;
};

/** Altura de la lente del objetivo sobre la mesada (cm) para el estado del dominio. */
export function stereoLensYcm(w: OpticalWorld) {
  const s = w.stereo;
  return GEO_B01.stereo.baseTopZ + (s.headZmm + s.focusTurns * w.params.stereo.focusPitchMmPerTurn) / 10;
}

export function buildStereoMicroscope(id: string, _w0: OpticalWorld, mats: MaterialSet, own: Own, seg: number): RigHandle {
  const S = GEO_B01.stereo;
  const group = new THREE.Group();
  const black = mats.blackPlastic;
  const white = own(new THREE.MeshStandardMaterial({ color: 0xf3f4f1, roughness: 0.36 }));
  const grey = own(new THREE.MeshStandardMaterial({ color: 0xc6cbcf, roughness: 0.45 }));
  const rubber = own(new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9 }));
  const lensGlass = own(new THREE.MeshStandardMaterial({ color: 0x30465a, roughness: 0.08, metalness: 0.2 }));

  // ───────── Base, platina, columna ─────────
  const body = new THREE.Group();
  body.add(part(plan((s) => roundedRect(s, 0, 0, S.baseW, S.baseD, 3.2), 1.2, 0.35), white));
  body.add(part(plan((s) => roundedRect(s, 0, 0.4, S.baseW - 1.2, S.baseD - 1.6, 2.8), S.baseTopZ - 1.0, 0.6), white, 0, 1.0, 0));
  body.add(part(plan((s) => roundedRect(s, 0, 0, S.baseW + 0.3, S.baseD + 0.3, 3.3), 0.3, 0.1), grey, 0, -0.02, 0));
  body.add(part(lathe([[4.6, S.baseTopZ - 0.05], [5.1, S.baseTopZ - 0.05], [5.1, S.baseTopZ + 0.12], [4.6, S.baseTopZ + 0.12]], seg), mats.chrome, 0, 0, DZ));
  body.add(part(lathe([[0, 3], [1.9, 3], [2.2, 3.3], [2.2, 4.6], [1.6, 5.0], [0, 5.0]], seg), white, 0, 0, PILLAR_Z));
  body.add(part(new THREE.CylinderGeometry(1.35, 1.35, 31, seg), mats.chrome, 0, 3 + 15.5, PILLAR_Z));
  body.add(part(new THREE.CylinderGeometry(1.5, 1.5, 0.6, seg), black, 0, 34.3, PILLAR_Z));
  const plateMat = own(new THREE.MeshBasicMaterial({ color: 0xe8e8e2 }));
  body.add(part(new THREE.CircleGeometry(4.6, seg * 2), plateMat, 0, S.baseTopZ + 0.13, DZ, -Math.PI / 2));
  const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x2a2f33 }));
  body.add(part(new THREE.SphereGeometry(0.22, 8, 6), ledMat, S.baseW / 2 - 2.6, S.baseTopZ + 0.02, S.baseD / 2 - 2.0));
  mergeRigid(body);
  group.add(body);

  // ───────── Diales de luz (derecha: incidente; izquierda: transmitida) e interruptor ─────────
  const dial = (x: number, color: THREE.Material) => {
    const d = new THREE.Group();
    d.position.set(x, 1.6, DZ - 1);
    d.add(part(knurled(1.15, 0.6, 16), black, 0, 0, 0, 0, 0, Math.PI / 2));
    d.add(part(new THREE.BoxGeometry(0.62, 0.15, 0.15), color, 0, 1.05, 0));
    mergeRigid(d);
    group.add(d);
    return d;
  };
  const incDial = dial(S.baseW / 2 + 0.05, mats.plasticYellow);
  const traDial = dial(-S.baseW / 2 - 0.05, mats.plasticBlue);
  const rocker = new THREE.Group();
  rocker.position.set(S.baseW / 2 + 0.0, 1.5, -6.5);
  rocker.add(part(new THREE.BoxGeometry(0.35, 0.9, 1.4), black));
  rocker.add(part(new THREE.BoxGeometry(0.05, 0.28, 0.28), mats.rubberRed, 0.2, 0.22, 0.35));
  mergeRigid(rocker);
  group.add(rocker);

  // ───────── Carro de enfoque en la columna (fijo a la altura del cabezal) ─────────
  const carrier = new THREE.Group();
  const carrierBody = new THREE.Group();
  carrierBody.add(part(new RoundedBoxGeometry(4.4, 5.6, 4.6, 2, 0.7), white, 0, 2.2, PILLAR_Z));
  carrierBody.add(part(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 12), mats.chrome, 0, 2.2, PILLAR_Z - 2.7, Math.PI / 2, 0, 0));
  carrierBody.add(part(knurled(0.8, 0.7, 12), black, 0, 2.2, PILLAR_Z - 3.5, Math.PI / 2, 0, 0));
  mergeRigid(carrierBody);
  carrier.add(carrierBody);
  const focusKnobs = keep(new THREE.Group());
  focusKnobs.position.set(0, 2.2, PILLAR_Z + 0.4);
  for (const sx of [-1, 1]) {
    focusKnobs.add(part(knurled(1.9, 1.1, 20), black, sx * 2.85, 0, 0, 0, 0, Math.PI / 2));
    focusKnobs.add(part(new THREE.CylinderGeometry(1.4, 1.4, 0.05, seg), grey, sx * 3.42, 0, 0, 0, 0, Math.PI / 2));
    focusKnobs.add(part(new THREE.BoxGeometry(0.2, 0.45, 0.2), mats.plasticYellow, sx * 2.85, 1.85, 0));
  }
  mergeRigid(focusKnobs);
  carrier.add(focusKnobs);
  carrier.add(placeAt(knobHit(2.05, 1.2, 'x', id, 'focus'), 2.85, 2.2, PILLAR_Z + 0.4));
  carrier.add(placeAt(knobHit(2.05, 1.2, 'x', id, 'focus'), -2.85, 2.2, PILLAR_Z + 0.4));
  carrier.add(placeAt(hitMesh(new THREE.BoxGeometry(4.6, 5.8, 5.4), id, 'head', { kind: 'linear', axis: 'y' }), 0, 2.2, PILLAR_Z - 0.4));
  group.add(carrier);

  // ───────── Cuerpo óptico (cremallera): brazo, zoom, objetivo, anillo de luz y cabezal binocular ─────────
  const head = new THREE.Group();
  const optics = new THREE.Group();
  optics.add(part(new RoundedBoxGeometry(3.2, 2.0, 10.6, 2, 0.6), white, 0, 3.0, PILLAR_Z - DZ + 5.6));
  optics.add(part(lathe([[0.001, 0], [2.0, 0], [2.0, 1.5], [2.6, 1.7], [0.001, 1.7]], seg), black));
  optics.add(part(new THREE.CircleGeometry(1.5, seg), lensGlass, 0, -0.005, 0, Math.PI / 2));
  optics.add(part(new RoundedBoxGeometry(8.4, 7.4, 7.2, 3, 1.6), white, 0, 1.7 + 3.7, 0));
  optics.add(part(new THREE.BoxGeometry(8.5, 0.35, 7.3), grey, 0, 2.2, 0));
  // Cabezal binocular: prisma inclinado sobre el zoom.
  optics.add(part(new RoundedBoxGeometry(7.6, 2.6, 6.4, 2, 0.9), white, 0, 10.2, -0.2));
  optics.add(part(new THREE.CylinderGeometry(2.4, 3.0, 2.2, seg), white, 0, 11.6, 1.2, Math.PI / 4, 0, 0));
  const ringMat = own(new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.15 }));
  optics.add(part(new THREE.TorusGeometry(2.45, 0.32, 8, seg), mats.darkMetal, 0, 0.35, 0, Math.PI / 2, 0, 0));
  optics.add(part(new THREE.TorusGeometry(2.45, 0.18, 6, seg), ringMat, 0, 0.12, 0, Math.PI / 2, 0, 0));
  mergeRigid(optics);
  head.add(optics);
  const zoomKnobs = keep(new THREE.Group());
  zoomKnobs.position.set(0, 4.8, 0.4);
  for (const sx of [-1, 1]) {
    zoomKnobs.add(part(knurled(2.05, 1.0, 24), black, sx * 4.75, 0, 0, 0, 0, Math.PI / 2));
    zoomKnobs.add(part(new THREE.CylinderGeometry(2.08, 2.08, 0.22, seg), grey, sx * 4.35, 0, 0, 0, 0, Math.PI / 2));
    zoomKnobs.add(part(new THREE.BoxGeometry(0.22, 0.6, 0.22), mats.plasticYellow, sx * 4.35, 1.9, 0));
  }
  mergeRigid(zoomKnobs);
  head.add(zoomKnobs);
  head.add(placeAt(knobHit(2.2, 1.4, 'x', id, 'zoom'), 4.8, 4.8, 0.4));
  head.add(placeAt(knobHit(2.2, 1.4, 'x', id, 'zoom'), -4.8, 4.8, 0.4));
  // Oculares a 45° (deslizan para la distancia interpupilar) con anillo de dioptrías cada uno.
  const tubes: Record<'left' | 'right', THREE.Group> = { left: new THREE.Group(), right: new THREE.Group() };
  const rings: Record<'left' | 'right', THREE.Group> = { left: keep(new THREE.Group()), right: keep(new THREE.Group()) };
  for (const side of ['left', 'right'] as const) {
    const t = tubes[side];
    t.rotation.x = Math.PI / 4;
    const tb = new THREE.Group();
    tb.add(part(new THREE.CylinderGeometry(0.85, 0.95, 3.4, seg), black, 0, 1.7, 0));
    tb.add(part(new THREE.CylinderGeometry(1.0, 1.0, 2.0, seg), black, 0, 4.3, 0));
    tb.add(part(lathe([[1.0, 5.3], [1.16, 5.35], [1.16, 5.8], [0.9, 6.1], [0.74, 6.1]], seg), rubber));
    tb.add(part(new THREE.CircleGeometry(0.62, seg), lensGlass, 0, 5.8, 0, -Math.PI / 2));
    mergeRigid(tb);
    t.add(tb);
    const r = rings[side];
    r.position.y = 3.6;
    r.add(part(knurled(1.12, 0.45, 18, 0.05), mats.darkMetal));
    r.add(part(new THREE.BoxGeometry(0.12, 0.47, 0.12), mats.plasticYellow, 0, 0, 1.1));
    mergeRigid(r);
    t.add(r);
    t.add(placeAt(knobHit(1.3, 0.6, 'y', id, side === 'left' ? 'diopterL' : 'diopterR'), 0, 3.6, 0));
    t.add(hitMesh(new THREE.CylinderGeometry(1.2, 1.2, 6.2, 10).translate(0, 3.0, 0), id, 'oculars', { kind: 'linear', axis: 'x', click: true, variant: side }));
    head.add(t);
  }
  head.add(placeAt(hitMesh(new THREE.BoxGeometry(8.4, 9, 7.2), id), 0, 6.2, 0));
  group.add(head);

  // ───────── Volúmenes de los diales, interruptor y cuerpo ─────────
  group.add(placeAt(knobHit(1.3, 0.8, 'x', id, 'incident'), incDial.position.x, incDial.position.y, incDial.position.z));
  group.add(placeAt(knobHit(1.3, 0.8, 'x', id, 'transmitted'), traDial.position.x, traDial.position.y, traDial.position.z));
  group.add(placeAt(hitMesh(new THREE.BoxGeometry(0.9, 1.3, 1.8), id, 'power', { kind: 'press', axis: 'x', click: true }), rocker.position.x, rocker.position.y, rocker.position.z));
  group.add(placeAt(hitMesh(new THREE.BoxGeometry(S.baseW, S.baseTopZ, S.baseD), id), 0, S.baseTopZ / 2, 0));
  group.add(placeAt(hitMesh(new THREE.CylinderGeometry(1.6, 1.6, 31, 8), id), 0, 18.5, PILLAR_Z));

  return {
    group,
    update(ctx: FrameCtxB01) {
      const w = ctx.world;
      const s = w.stereo;
      carrier.position.y = S.baseTopZ + s.headZmm / 10;
      head.position.set(0, stereoLensYcm(w), DZ);
      focusKnobs.rotation.x = s.focusTurns * KIN.radPerTurn;
      zoomKnobs.rotation.x = (s.zoomX - w.params.stereo.zoomRange[0]) * KIN.zoomRadPerX;
      const half = s.ipdMm / 20;
      tubes.left.position.set(-half, 11.5, 1.6);
      tubes.right.position.set(half, 11.5, 1.6);
      rings.left.rotation.y = s.leftDiopter * KIN.diopterRadPerD;
      rings.right.rotation.y = s.rightDiopter * KIN.diopterRadPerD;
      incDial.rotation.x = s.incident01 * KIN.dialRadPer01;
      traDial.rotation.x = s.transmitted01 * KIN.dialRadPer01;
      rocker.rotation.z = s.power ? -0.18 : 0.18;
      ringMat.opacity = s.power ? 0.15 + 0.85 * s.incident01 : 0.08;
      const tr = s.power ? s.transmitted01 : 0;
      plateMat.color.setRGB(0.8 + 0.2 * tr, 0.8 + 0.2 * tr, 0.78 + 0.2 * tr);
      ledMat.color.setHex(s.power ? 0x3bff59 : 0x2a2f33);
    },
  };
}
