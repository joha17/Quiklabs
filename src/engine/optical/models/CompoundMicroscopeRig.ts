/**
 * Microscopio compuesto binocular de laboratorio (§4.C), con las proporciones y la disposición de un equipo de
 * referencia tipo LABOMED LX 400 (sin logotipos ni cotas de ficha: `rigGeometry` pending). Piezas articuladas sobre
 * sus pivotes físicos:
 * - brazo curvo con nariz delantera; revólver inclinado bajo la nariz (el objetivo enclavado queda vertical sobre el
 *   eje óptico) con 3 objetivos parfocales de longitud distinta y aro de color;
 * - cabezal binocular negro con tubos a 30°, gomas, distancia interpupilar y anillo de dioptrías en el tubo izquierdo;
 * - platina mecánica negra que sube y baja con el foco, con carro X/Y, tope trasero, pinza de resorte con lengüeta y
 *   mandos coaxiales X/Y colgando a la derecha; condensador de Abbe con palanca del iris y perilla de altura;
 * - mandos macro y micro coaxiales a ambos lados del brazo; lámpara LED en la base, rueda de intensidad e interruptor.
 * Las piezas solo LEEN el dominio: la altura de la platina, la punta de cada objetivo y los ángulos salen del mundo.
 */
import * as THREE from 'three';
import type { OpticalWorld } from '../../../simulation/optical-world/types';
import { GEO_B01, MIC_POS, STAGE_SEAT, stageTopZCm } from '../../../simulation/optical-world/geometry';
import { microscopeView } from '../../../simulation/optical-world/world';
import type { MaterialSet } from '../../renderers/materials';
import type { FrameCtxB01 } from '../OpticalLab3D';
import { KIN, hitMesh, knobHit, placeAt, type PartGrip } from '../parts';
import { knurled, lathe, mergeRigid, part, plan, roundedRect, sideProfile } from './geom';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;

/** Centro de la platina respecto del origen del microscopio (cm hacia el alumno). */
const DZ = MIC_POS.y - STAGE_SEAT.y;
/** Inclinación del eje del revólver (rad) y radio de montaje de los objetivos (cm). */
const TILT = 0.21;
const MOUNT_R = 1.55;
/** Altura del hombro de los objetivos (cm sobre la mesada): todos parfocales a 45 mm del plano focal. */
const SHOULDER = 20.6;
const OBJ_COLORS = [0xd0312d, 0xf2c230, 0x4aa3df];
const IPD_TUBE_Y = 36.3;

/** Altura (cm) de la lente frontal de cada objetivo según el dominio (plano focal + distancia de trabajo). */
export function objectiveTipCm(w: OpticalWorld, x: 4 | 10 | 40) {
  const p = w.params.microscope;
  return stageTopZCm(0) + (p.focalPlaneZMm + p.parfocalOffsetMm[x] + p.workingDistanceMm[x]) / 10;
}

const keep = <T extends THREE.Object3D>(o: T): T => {
  o.userData.keep = true;
  return o;
};

export interface RigHandle {
  group: THREE.Group;
  update(ctx: FrameCtxB01): void;
}

export function buildCompoundMicroscope(id: string, w0: OpticalWorld, mats: MaterialSet, own: Own, seg: number): RigHandle {
  const M = GEO_B01.microscope;
  const group = new THREE.Group();
  const black = mats.blackPlastic;
  const rubber = own(new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9 }));
  const white = own(new THREE.MeshStandardMaterial({ color: 0xf1f2ef, roughness: 0.38 }));
  const grey = own(new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.45 }));
  const lensGlass = own(new THREE.MeshStandardMaterial({ color: 0x30465a, roughness: 0.08, metalness: 0.2 }));

  // ───────── Cuerpo fijo: base, brazo con nariz, cabezal, lámpara ─────────
  const body = new THREE.Group();
  body.add(part(plan((s) => roundedRect(s, 0, 0, M.baseW, M.baseD, 3), 1.4, 0.4), white));
  body.add(part(plan((s) => roundedRect(s, 0, 0.6, M.baseW - 1.6, M.baseD - 2.6, 2.4), 2.6, 0.7), white, 0, 1.2, 0));
  body.add(part(plan((s) => roundedRect(s, 0, 0, M.baseW + 0.3, M.baseD + 0.3, 3.1), 0.3, 0.1), grey, 0, -0.02, 0));
  const arm = sideProfile((s) => {
    s.moveTo(-10.4, 3.6);
    s.lineTo(-4.4, 3.6);
    s.quadraticCurveTo(-3.4, 3.6, -3.4, 5.5);
    s.lineTo(-3.0, 20.5);
    s.quadraticCurveTo(-2.6, 23.0, 0.5, 23.2);
    s.lineTo(5.6, 23.2);
    s.quadraticCurveTo(6.8, 23.2, 6.8, 24.6);
    s.lineTo(6.6, 29.6);
    s.quadraticCurveTo(6.4, 31, 4.8, 31);
    s.lineTo(-5.4, 31);
    s.quadraticCurveTo(-9.4, 31, -9.6, 26.5);
    // Lomo del brazo con una curva suave hacia atrás (silueta en «C»).
    s.quadraticCurveTo(-8.6, 15, -10.0, 6.2);
    s.quadraticCurveTo(-10.4, 3.6, -10.4, 3.6);
  }, 6.0, 0.7);
  body.add(part(arm, white));
  // Paneles laterales grises del brazo (rompen el blanco plano, como las tapas del equipo de referencia).
  body.add(part(sideProfile((s) => roundedRect(s, -6.4, 15.5, 4.2, 15, 1.6), 6.12, 0), grey));
  // Carcasa del mecanismo de foco a ambos lados del brazo (gris) y guía de la platina.
  for (const sx of [-1, 1]) body.add(part(new THREE.CylinderGeometry(2.6, 2.6, 0.5, seg), grey, sx * 3.2, 10.5, -6.6, 0, 0, Math.PI / 2));
  body.add(part(new THREE.BoxGeometry(4.2, 11, 0.6), grey, 0, 14.5, -3.1));
  // Cabezal binocular negro sobre el brazo, con la caja de prismas inclinada.
  body.add(part(lathe([[0, 31], [2.4, 31], [2.4, 31.6], [0, 31.6]], seg), mats.chrome, 0, 0, 0.3));
  const head = sideProfile((s) => {
    s.moveTo(-6.4, 31.5);
    s.lineTo(5.2, 31.5);
    s.quadraticCurveTo(6.2, 31.5, 6.0, 32.6);
    s.lineTo(5.4, 34.2);
    s.lineTo(-5.6, 34.6);
    s.quadraticCurveTo(-6.6, 34.6, -6.6, 33.4);
    s.lineTo(-6.4, 31.5);
  }, 6.8, 0.5);
  body.add(part(head, black));
  body.add(part(new THREE.CylinderGeometry(2.6, 3.1, 2.4, seg), black, 0, 35.4, 2.0, Math.PI / 6, 0, 0));
  // Nariz: anillo de montaje del revólver.
  body.add(part(lathe([[0, 22.9], [2.2, 22.9], [2.4, 23.3], [0, 23.3]], seg), mats.darkMetal, 0, 0, DZ - 0.25));
  // Lámpara LED con colector en la base.
  body.add(part(lathe([[1.0, 3.75], [1.9, 3.75], [1.9, 4.2], [1.2, 4.35], [1.0, 4.35]], seg), black, 0, 0, DZ));
  const lampMat = own(new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.2 }));
  body.add(part(new THREE.CircleGeometry(1.05, seg), lampMat, 0, 4.36, DZ, -Math.PI / 2));
  const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x2a2f33 }));
  body.add(part(new THREE.SphereGeometry(0.22, 8, 6), ledMat, M.baseW / 2 - 2.6, 3.85, M.baseD / 2 - 2.2));
  mergeRigid(body);
  group.add(body);

  // ───────── Rueda de intensidad (lado derecho de la base) e interruptor ─────────
  const dial = new THREE.Group();
  dial.position.set(M.baseW / 2 - 0.15, 2.0, -5);
  dial.add(part(knurled(1.6, 0.7, 20), black, 0, 0, 0, 0, 0, Math.PI / 2));
  dial.add(part(new THREE.BoxGeometry(0.72, 0.18, 0.18), mats.plasticYellow, 0, 1.45, 0));
  mergeRigid(dial);
  group.add(dial);
  const rocker = new THREE.Group();
  rocker.position.set(-M.baseW / 2 - 0.05, 2.1, -7.5);
  rocker.add(part(new THREE.BoxGeometry(0.35, 1.0, 1.5), black));
  rocker.add(part(new THREE.BoxGeometry(0.05, 0.3, 0.3), mats.rubberRed, -0.2, 0.25, 0.4));
  mergeRigid(rocker);
  group.add(rocker);

  // ───────── Mandos macro y micro coaxiales (ambos lados giran juntos) ─────────
  const coarse = new THREE.Group();
  coarse.position.set(0, 10.5, -6.6);
  const fine = new THREE.Group();
  fine.position.set(0, 10.5, -6.6);
  for (const sx of [-1, 1]) {
    coarse.add(part(knurled(2.3, 1.1, 22), black, sx * 3.95, 0, 0, 0, 0, Math.PI / 2));
    coarse.add(part(new THREE.BoxGeometry(0.2, 0.5, 0.2), mats.plasticYellow, sx * 3.95, 2.25, 0));
    fine.add(part(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 12), mats.darkMetal, sx * 4.75, 0, 0, 0, 0, Math.PI / 2));
    fine.add(part(knurled(1.25, 0.9, 16, 0.09), black, sx * 5.4, 0, 0, 0, 0, Math.PI / 2));
    fine.add(part(new THREE.CylinderGeometry(1.0, 1.0, 0.04, seg), grey, sx * 5.86, 0, 0, 0, 0, Math.PI / 2));
  }
  mergeRigid(coarse);
  mergeRigid(fine);
  group.add(coarse, fine);

  // ───────── Platina mecánica (sube y baja con el foco) ─────────
  const stage = new THREE.Group();
  const stageStatic = new THREE.Group();
  stageStatic.add(part(plan((s) => roundedRect(s, 0, -DZ, M.stageW, M.stageD, 0.6), 1.0, 0.2), black, 0, -1.0, 0));
  stageStatic.add(part(new THREE.CircleGeometry(1.15, seg), own(new THREE.MeshBasicMaterial({ color: 0x050607 })), 0, 0.006, DZ, -Math.PI / 2));
  stageStatic.add(part(new THREE.RingGeometry(1.15, 1.35, seg), mats.chrome, 0, 0.007, DZ, -Math.PI / 2));
  // Ménsula hacia la guía del brazo y portacondensador.
  stageStatic.add(part(new THREE.BoxGeometry(5.5, 2.6, 2.2), grey, 0, -2.0, -2.4));
  stageStatic.add(part(new THREE.BoxGeometry(0.9, 3.6, 4.6), grey, -2.6, -2.6, DZ - 2.0));
  // Guía de los mandos X/Y bajo la esquina derecha.
  stageStatic.add(part(new THREE.CylinderGeometry(0.28, 0.28, 3.8, 10), mats.darkMetal, 5.6, -2.7, DZ + 3.4));
  stageStatic.add(part(new THREE.BoxGeometry(1.4, 0.8, 2.4), black, 5.6, -1.0, DZ + 3.0));
  mergeRigid(stageStatic);
  stage.add(stageStatic);
  // Carro X/Y con tope trasero, guía y pinza.
  const carriage = keep(new THREE.Group());
  carriage.add(part(new THREE.BoxGeometry(6.4, 0.4, 0.45), mats.darkMetal, -0.6, 0.2, DZ - 1.5));
  carriage.add(part(new THREE.BoxGeometry(0.5, 0.42, 1.8), mats.darkMetal, -3.95, 0.21, DZ - 0.7));
  carriage.add(part(new THREE.BoxGeometry(9.5, 0.5, 1.0), black, 0.8, 0.25, DZ - 3.6));
  carriage.add(part(new THREE.BoxGeometry(1.0, 0.5, 6.4), black, 5.9, 0.25, DZ - 0.6));
  const clip = keep(new THREE.Group());
  clip.position.set(-4.4, 0.32, DZ + 1.55);
  clip.add(part(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 14), mats.chrome));
  clip.add(part(new THREE.BoxGeometry(4.6, 0.2, 0.32), mats.chrome, 2.35, 0, 0));
  clip.add(part(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 12), black, -0.75, 0.15, 0.25));
  mergeRigid(clip);
  // Volumen de la palanca: pivote en el eje de la pinza, a lo largo del brazo y la lengüeta.
  const clipHit = hitMesh(new THREE.BoxGeometry(6.2, 1.2, 1.3).translate(1.9, 0.2, 0), id, 'clip', { kind: 'lever', axis: 'y', click: true });
  clip.add(clipHit);
  carriage.add(clip);
  mergeRigid(carriage);
  stage.add(carriage);
  // Mandos coaxiales X/Y (arriba: Y; abajo: X).
  const knobY = keep(new THREE.Group());
  knobY.position.set(5.6, -2.5, DZ + 3.4);
  knobY.add(part(knurled(1.05, 0.9, 16), black));
  knobY.add(part(new THREE.BoxGeometry(0.16, 0.92, 0.16), mats.plasticYellow, 0, 0, 1.02));
  mergeRigid(knobY);
  const knobX = keep(new THREE.Group());
  knobX.position.set(5.6, -3.9, DZ + 3.4);
  knobX.add(part(knurled(0.85, 0.9, 14), black));
  knobX.add(part(new THREE.BoxGeometry(0.16, 0.92, 0.16), mats.plasticYellow, 0, 0, 0.82));
  mergeRigid(knobX);
  stage.add(knobY, knobX);
  stage.add(placeAt(knobHit(1.2, 1.0, 'y', id, 'stageY'), 5.6, -2.5, DZ + 3.4));
  stage.add(placeAt(knobHit(1.0, 1.0, 'y', id, 'stageX'), 5.6, -3.9, DZ + 3.4));
  // Condensador de Abbe (sube y baja con su perilla) con la palanca del iris.
  const condenser = keep(new THREE.Group());
  condenser.add(part(lathe([[0.9, -3.0], [1.75, -2.8], [1.75, -1.9], [1.45, -1.55], [1.1, -1.3], [0.6, -1.25]], seg), black));
  condenser.add(part(lathe([[1.6, -3.25], [1.9, -3.25], [1.9, -2.85], [1.6, -2.85]], seg), mats.chrome));
  condenser.add(part(new THREE.CircleGeometry(0.6, seg), lensGlass, 0, -1.24, 0, -Math.PI / 2));
  mergeRigid(condenser);
  const iris = keep(new THREE.Group());
  iris.position.y = -3.05;
  iris.add(part(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 8), mats.chrome, 0, 0, 2.7, Math.PI / 2, 0, 0));
  iris.add(part(new THREE.SphereGeometry(0.22, 10, 8), black, 0, 0, 3.55));
  mergeRigid(iris);
  iris.add(hitMesh(new THREE.BoxGeometry(1.0, 0.9, 2.4).translate(0, 0, 2.9), id, 'diaphragm', { kind: 'lever', axis: 'y' }));
  condenser.add(iris);
  condenser.position.set(0, 0, DZ);
  stage.add(condenser);
  const condKnob = keep(new THREE.Group());
  condKnob.position.set(-3.35, -2.7, DZ - 2.0);
  condKnob.add(part(knurled(0.75, 0.6, 12), black, 0, 0, 0, 0, 0, Math.PI / 2));
  condKnob.add(part(new THREE.BoxGeometry(0.62, 0.12, 0.12), mats.plasticYellow, 0, 0.7, 0));
  mergeRigid(condKnob);
  stage.add(condKnob);
  stage.add(placeAt(knobHit(0.9, 0.8, 'x', id, 'condenser'), -3.35, -2.7, DZ - 2.0));
  group.add(stage);

  // ───────── Revólver inclinado con los tres objetivos ─────────
  const tilt = new THREE.Group();
  tilt.position.set(0, SHOULDER + MOUNT_R * Math.sin(TILT), DZ - MOUNT_R * Math.cos(TILT));
  tilt.rotation.x = TILT;
  const spin = keep(new THREE.Group());
  spin.add(part(lathe([[0.4, 0], [3.0, 0], [3.1, 0.3], [3.1, 1.0], [2.6, 1.6], [1.6, 2.0], [0.4, 2.1]], seg), mats.chrome));
  spin.add(part(knurled(3.12, 0.6, 30, 0.04), mats.darkMetal, 0, 0.62, 0));
  const tips: number[] = [];
  ([4, 10, 40] as const).forEach((x, i) => {
    const L = SHOULDER - objectiveTipCm(w0, x);
    tips.push(L);
    const a = (i * 2 * Math.PI) / 3;
    const og = new THREE.Group();
    og.position.set(Math.sin(a) * MOUNT_R, 0, Math.cos(a) * MOUNT_R);
    og.rotation.y = a;
    const ob = new THREE.Group();
    ob.rotation.x = -TILT;
    const neck = Math.min(0.9, L * 0.25);
    ob.add(part(lathe([[0.001, -L], [0.36, -L], [0.5, -L + 0.18], [0.72, -L + 0.55], [0.8, -L * 0.62], [0.95, -L * 0.55], [0.95, -neck], [1.0, -neck + 0.05], [1.0, 0], [0.001, 0]], seg), mats.chrome));
    ob.add(part(new THREE.CylinderGeometry(0.975, 0.975, 0.2, seg), own(new THREE.MeshStandardMaterial({ color: OBJ_COLORS[i], roughness: 0.4 })), 0, -L * 0.42, 0));
    ob.add(part(new THREE.CircleGeometry(0.34, seg), lensGlass, 0, -L - 0.005, 0, Math.PI / 2));
    if (x === 40) ob.add(part(new THREE.CylinderGeometry(0.74, 0.74, 0.08, seg), black, 0, -L + 0.62, 0));
    og.add(ob);
    spin.add(og);
    // Tomar el revólver por un objetivo también lo gira, pero es mala técnica (E72): mismo eje, otra variante.
    og.updateMatrixWorld(true);
    const geo = new THREE.CylinderGeometry(1.15, 1.15, L, 10).translate(0, -L / 2, 0);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-TILT));
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(og.position.x, 0, og.position.z));
    spin.add(hitMesh(geo, id, 'turret', { kind: 'rotary', axis: 'y', variant: 'objective' }));
  });
  mergeRigid(spin);
  tilt.add(spin);
  tilt.add(placeAt(knobHit(3.3, 1.0, 'y', id, 'turret'), 0, 0.6, 0));
  group.add(tilt);

  // ───────── Tubos oculares (distancia interpupilar) y anillo de dioptrías ─────────
  const tubes: Record<'left' | 'right', THREE.Group> = { left: new THREE.Group(), right: new THREE.Group() };
  let diopterRing: THREE.Group | null = null;
  for (const side of ['left', 'right'] as const) {
    const t = tubes[side];
    t.rotation.x = Math.PI / 6;
    const tb = new THREE.Group();
    tb.add(part(new THREE.CylinderGeometry(0.85, 0.9, 4.2, seg), black, 0, 2.1, 0));
    tb.add(part(new THREE.CylinderGeometry(1.0, 1.0, 2.0, seg), black, 0, 5.1, 0));
    tb.add(part(lathe([[1.0, 6.1], [1.18, 6.15], [1.18, 6.6], [0.9, 6.95], [0.75, 6.95]], seg), rubber));
    tb.add(part(new THREE.CircleGeometry(0.62, seg), lensGlass, 0, 6.6, 0, -Math.PI / 2));
    mergeRigid(tb);
    t.add(tb);
    if (side === 'left') {
      diopterRing = keep(new THREE.Group());
      diopterRing.position.y = 4.45;
      diopterRing.add(part(knurled(1.13, 0.5, 18, 0.05), mats.darkMetal));
      diopterRing.add(part(new THREE.BoxGeometry(0.12, 0.52, 0.12), mats.plasticYellow, 0, 0, 1.1));
      mergeRigid(diopterRing);
      t.add(diopterRing);
      t.add(placeAt(knobHit(1.3, 0.6, 'y', id, 'diopterL'), 0, 4.45, 0));
    }
    const grip: PartGrip = { kind: 'linear', axis: 'x', click: true, variant: side };
    t.add(hitMesh(new THREE.CylinderGeometry(1.2, 1.2, 7, 10).translate(0, 3.4, 0), id, 'ocular', grip));
    group.add(t);
  }

  // ───────── Volúmenes de selección de las demás piezas ─────────
  group.add(placeAt(knobHit(2.45, 1.15, 'x', id, 'coarse'), 3.95, 10.5, -6.6));
  group.add(placeAt(knobHit(2.45, 1.15, 'x', id, 'coarse'), -3.95, 10.5, -6.6));
  group.add(placeAt(knobHit(1.4, 1.2, 'x', id, 'fine'), 5.45, 10.5, -6.6));
  group.add(placeAt(knobHit(1.4, 1.2, 'x', id, 'fine'), -5.45, 10.5, -6.6));
  group.add(placeAt(knobHit(1.75, 0.9, 'x', id, 'light'), dial.position.x, dial.position.y, dial.position.z));
  group.add(placeAt(hitMesh(new THREE.BoxGeometry(0.9, 1.4, 1.9), id, 'power', { kind: 'press', axis: 'x', click: true }), rocker.position.x, rocker.position.y, rocker.position.z));
  // Cuerpo (seleccionar el equipo, no es un mando).
  group.add(placeAt(hitMesh(new THREE.BoxGeometry(M.baseW, 3.8, M.baseD), id), 0, 1.9, 0));
  group.add(placeAt(hitMesh(new THREE.BoxGeometry(5.6, 26, 6), id), 0, 17, -6.8));
  group.add(placeAt(hitMesh(new THREE.BoxGeometry(6, 7.5, 13), id), 0, 27.3, -1.5));

  return {
    group,
    update(ctx) {
      const w = ctx.world;
      const m = w.microscope;
      const v = microscopeView(w);
      const top = stageTopZCm(v.stageZmm);
      stage.position.y = top;
      carriage.position.set(m.stageXmm / 10, 0, -m.stageYmm / 10);
      const drag = ctx.drag;
      const clipOpen = drag?.part === 'mic:clip' ? drag.value : m.clipOpen ? 1 : 0;
      clip.rotation.y = clipOpen * KIN.clipOpenRad;
      knobX.rotation.y = m.stageXmm * KIN.stageRadPerMm;
      knobY.rotation.y = m.stageYmm * KIN.stageRadPerMm;
      condenser.position.y = -(1 - m.condenser01) * 2.0;
      condKnob.rotation.x = m.condenser01 * KIN.condenserRadPer01;
      iris.rotation.y = KIN.irisRad0 + m.diaphragm01 * KIN.irisRadPer01;
      spin.rotation.y = m.turretDeg * KIN.turretRadPerDeg;
      coarse.rotation.x = m.coarseTurns * KIN.radPerTurn;
      fine.rotation.x = m.fineTurns * KIN.radPerTurn;
      dial.rotation.x = m.light01 * KIN.dialRadPer01;
      rocker.rotation.z = m.power ? 0.18 : -0.18;
      const half = (m.ipdMm ?? 63) / 20;
      tubes.left.position.set(-half, IPD_TUBE_Y, 3.1);
      tubes.right.position.set(half, IPD_TUBE_Y, 3.1);
      if (diopterRing) diopterRing.rotation.y = (m.leftDiopter ?? 0) * KIN.diopterRadPerD;
      lampMat.opacity = m.power ? 0.25 + 0.75 * m.light01 : 0.08;
      ledMat.color.setHex(m.power ? 0x3bff59 : 0x2a2f33);
    },
  };
}

/** Longitud de cada objetivo (para pruebas de geometría): del hombro a la lente frontal. */
export const objectiveLengthsCm = (w: OpticalWorld) => ([4, 10, 40] as const).map((x) => SHOULDER - objectiveTipCm(w, x));
