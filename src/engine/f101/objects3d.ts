/**
 * Vistas 3D procedurales de F101: calibrador con cursor y mordaza móvil, micrómetro con husillo y tambor que gira
 * según el paso, regla, bloque patrón, masa patrón, cilindro y balín, balanza de 2 kg, cápsula, probeta de 100 mL
 * (misma sección que el dominio, menisco, espuma, grieta), mesa de fuerzas con escala angular, perno, anillo e hilos
 * (los portapesas suben y bajan con el anillo: el hilo tiene largo fijo), poleas con prensa y rueda, portapesas,
 * pesas ranuradas, dinamómetro con resorte que se estira según la fuerza y caja del sensor 2D. SOLO leen el estado;
 * cada pieza funcional tiene un colisionador invisible simple (`userData {objId, part}`) para el rayo.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F101Object, F101World } from '../../simulation/f101-world/types';
import { GEOF101, GRADCYL_AREA, TABLE_CENTER } from '../../simulation/f101-world/geometry';
import { balanceDisplayG, dynamometerForceN, hangingOn, PULLEYS } from '../../simulation/f101-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { graduationTexture, labelTexture, lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F101Lab3D';
import { CALIPER_ZERO_DX, T, caliperGap, gradCylMouth, hangerZ, hungPose, meniscusZ, micrometerAxis, rimPoint, ringPoint } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F101Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;

function hit(geo: THREE.BufferGeometry, objId: string, part?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, hitMat());
  m.userData = { objId, part };
  return m;
}

function at<O extends THREE.Object3D>(o: O, x: number, y: number, z: number): O {
  o.position.set(x, y, z);
  return o;
}

function shadowed<O extends THREE.Object3D>(o: O): O {
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

/** Lienzo para texturas propias (escala angular, escala del calibrador). */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Escala angular de la mesa (1°, números cada 10°; 0° en +x, antihorario visto desde arriba). */
function angleScaleTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 1024, (g) => {
    const c = 512;
    g.fillStyle = '#f3f1ea';
    g.beginPath();
    g.arc(c, c, 510, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let d = 0; d < 360; d++) {
      // El lienzo tiene y hacia abajo: un ángulo antihorario visto desde arriba es −d en el lienzo.
      const a = (-d * Math.PI) / 180;
      const major = d % 10 === 0;
      const r0 = major ? 455 : d % 5 === 0 ? 475 : 488;
      g.lineWidth = major ? 3 : 1.4;
      g.beginPath();
      g.moveTo(c + r0 * Math.cos(a), c + r0 * Math.sin(a));
      g.lineTo(c + 506 * Math.cos(a), c + 506 * Math.sin(a));
      g.stroke();
      if (major) {
        g.font = 'bold 26px sans-serif';
        g.fillText(String(d), c + 425 * Math.cos(a), c + 425 * Math.sin(a));
      }
    }
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(c - 400, c);
    g.lineTo(c + 400, c);
    g.moveTo(c, c - 400);
    g.lineTo(c, c + 400);
    g.stroke();
  });
}

/** Escala del calibrador en mm (0–150), sobre la regla. */
function caliperScaleTexture(): THREE.CanvasTexture {
  return canvasTex(2048, 128, (g) => {
    g.fillStyle = '#dfe4e8';
    g.fillRect(0, 0, 2048, 128);
    g.strokeStyle = '#111';
    g.fillStyle = '#111';
    g.textAlign = 'center';
    const px = 2048 / 175;
    for (let mm = 0; mm <= 150; mm++) {
      const x = 60 * px / 10 + mm * px;
      const major = mm % 10 === 0;
      g.lineWidth = major ? 3 : 1.5;
      g.beginPath();
      g.moveTo(x, 128);
      g.lineTo(x, major ? 64 : mm % 5 === 0 ? 84 : 96);
      g.stroke();
      if (major) {
        g.font = 'bold 34px sans-serif';
        g.fillText(String(mm / 10), x, 44);
      }
    }
  });
}

export function createObjVisualF(o: F101Object, w0: F101World, q: QualityLevel): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  /** La vista coloca el grupo ella misma (piezas acopladas, colgadas o montadas). */
  let place: ((ctx: FrameCtxF, ob: F101Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const brass = own(new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 }));
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xd6dadd, metalness: 0.75, roughness: 0.32 }));
  const nylon = own(new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.55 }));
  const orange = own(new THREE.MeshStandardMaterial({ color: 0xe8812c, roughness: 0.5 }));
  const body = new THREE.Group();
  group.add(body);

  /** Pieza medible: se dibuja entre las mordazas, entre las caras, dentro de la probeta o donde apoye. */
  const placePart = (ctx: FrameCtxF, ob: F101Object, halfH: number) => {
    const w = ctx.world;
    if (ob.support === 'caliper01') {
      const g = caliperGap(w);
      group.position.set(g.x, g.z + halfH, -g.y);
      return true;
    }
    if (ob.support === 'micrometer01') {
      const a = micrometerAxis(w);
      const ext = w.micrometer.part?.extentMm ?? 20;
      group.position.set(a.x + ext / 20, a.z, -a.y);
      return true;
    }
    if (ob.support === 'gradCyl01') {
      const m = gradCylMouth(w);
      const k = w.gradCyl.parts.indexOf(ob.id);
      group.position.set(m.x, w.objects.gradCyl01.pose.z + GEOF101.gradCyl.floor + (k > 0 ? 2.2 : 0), -m.y);
      return true;
    }
    return false;
  };

  switch (o.kind) {
    case 'gaugeBlock': {
      const L = w0.parts.gaugeBlock01.dMm / 10;
      const blk = shadowed(new THREE.Mesh(new RoundedBoxGeometry(L, 0.9, 3.5, 2, 0.05), mats.chrome));
      blk.position.y = 0.45;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['20 mm'], { band: '#123a63', w: 128, h: 40 })) })));
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.91, 0.8);
      body.add(blk, lbl);
      group.add(at(hit(new THREE.BoxGeometry(L + 0.4, 1.4, 3.9), id), 0, 0.5, 0));
      ring = selRing(2.4);
      group.add(ring);
      place = (ctx, ob) => {
        body.rotation.set(0, ob.support === 'micrometer01' ? Math.PI / 2 : 0, 0);
        return placePart(ctx, ob, -0.45);
      };
      break;
    }
    case 'massStd': {
      const cyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, seg), brass));
      cyl.position.y = 1.2;
      const neck = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.5, 12), brass));
      neck.position.y = 2.65;
      const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10), brass));
      knob.position.y = 3.2;
      body.add(cyl, neck, knob);
      group.add(at(hit(new THREE.CylinderGeometry(1.5, 1.5, 3.8, 10), id), 0, 1.9, 0));
      ring = selRing(2);
      group.add(ring);
      break;
    }
    case 'metalCyl': {
      const P = w0.parts.metalCyl01;
      const r = P.dMm / 20;
      const h = P.hMm / 10;
      const cyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), P.material === 'nylon' ? nylon : alu));
      cyl.position.y = h / 2;
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.04, h * 0.6, 0.2), own(new THREE.MeshBasicMaterial({ color: 0x1b2733 })));
      mark.position.set(r + 0.01, h / 2, 0);
      body.add(cyl, mark);
      const hb = at(hit(new THREE.CylinderGeometry(r + 0.3, r + 0.3, h + 0.4, 10), id), 0, h / 2, 0);
      body.add(hb);
      ring = selRing(2);
      group.add(ring);
      place = (ctx, ob) => {
        const lying = ob.orient === 'lying' || (ob.support === 'caliper01' && ctx.world.evidence.__calDim === 2);
        body.rotation.set(0, ((ob.spinDeg ?? 0) * Math.PI) / 180, lying ? Math.PI / 2 : 0);
        body.position.set(lying ? h / 2 : 0, lying ? r : 0, 0);
        if (ob.support === 'caliper01') {
          const g = caliperGap(ctx.world);
          group.position.set(g.x - (lying ? h / 2 : 0), g.z - (lying ? r : h / 2), -g.y);
          body.rotation.z += lying ? 0 : 0;
          group.rotation.set(0, 0, ((ctx.world.caliper.part?.tiltDeg ?? 0) * Math.PI) / 180);
          return true;
        }
        group.rotation.set(0, 0, 0);
        if (ob.support === 'gradCyl01') {
          body.rotation.set(0, 0, 0);
          body.position.set(0, 0, 0);
        }
        return placePart(ctx, ob, 0);
      };
      break;
    }
    case 'steelBall': {
      const r = w0.parts.steelBall01.dMm / 20;
      const ball = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.6)), mats.chrome));
      ball.position.y = r;
      body.add(ball);
      group.add(at(hit(new THREE.SphereGeometry(r + 0.3, 10, 8), id), 0, r, 0));
      ring = selRing(1.6);
      group.add(ring);
      place = (ctx, ob) => {
        if (ob.support === 'micrometer01') {
          const a = micrometerAxis(ctx.world);
          group.position.set(a.x + r, a.z - r, -a.y);
          return true;
        }
        if (ob.support === 'caliper01') {
          const g = caliperGap(ctx.world);
          group.position.set(g.x, g.z - r, -g.y);
          return true;
        }
        return placePart(ctx, ob, 0);
      };
      break;
    }
    case 'tissue': {
      const t = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 0.8, 5, 2, 0.35), mats.paper));
      t.position.y = 0.4;
      t.rotation.y = 0.3;
      body.add(t);
      group.add(at(hit(new THREE.BoxGeometry(6.5, 1.2, 5.5), id), 0, 0.5, 0));
      break;
    }
    case 'level': {
      const bar = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 1.4, 1.6, 2, 0.2), mats.plasticYellow));
      bar.position.y = 0.7;
      const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 12), own(new THREE.MeshPhysicalMaterial({ color: 0xb8f0a0, transparent: true, opacity: 0.8 })));
      vial.rotation.z = Math.PI / 2;
      vial.position.set(0, 1.45, 0);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      bubble.position.set(0, 1.6, 0);
      body.add(bar, vial, bubble);
      group.add(at(hit(new THREE.BoxGeometry(7.4, 2, 2), id), 0, 0.9, 0));
      update = (ctx, ob) => {
        const tilt = ob.support === 'forceTable01' ? ctx.world.table.levelDeg : 0;
        bubble.position.x = Math.max(-1, Math.min(1, tilt * 0.6));
      };
      break;
    }
    case 'returnTray': {
      const Tr = GEOF101.tray;
      const m = own(new THREE.MeshStandardMaterial({ color: 0x4f6d7a, roughness: 0.6 }));
      const floor = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Tr.w, 0.25, Tr.d), m));
      floor.position.y = 0.12;
      body.add(floor);
      for (const [x, z, ry, len] of [[0, Tr.d / 2, 0, Tr.w], [0, -Tr.d / 2, 0, Tr.w], [Tr.w / 2, 0, Math.PI / 2, Tr.d], [-Tr.w / 2, 0, Math.PI / 2, Tr.d]] as const) {
        const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, Tr.h, 0.3), m));
        wall.position.set(x, Tr.h / 2, z);
        wall.rotation.y = ry;
        body.add(wall);
      }
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Devolución'], { band: '#1e8e4e', w: 256, h: 48 })) })));
      lbl.position.set(0, Tr.h * 0.55, Tr.d / 2 + 0.17);
      body.add(lbl);
      group.add(at(hit(new THREE.BoxGeometry(Tr.w, 0.6, Tr.d), id), 0, 0.3, 0));
      break;
    }

    // ── B: medición dimensional ──
    case 'caliper': {
      const C = GEOF101.caliper;
      const beam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(C.length, 0.3, C.beamW), mats.steel));
      beam.position.set(C.length / 2 - 8, 0.15, 0);
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 0.9), own(new THREE.MeshBasicMaterial({ map: own(caliperScaleTexture()) })));
      scale.rotation.x = -Math.PI / 2;
      scale.position.set(CALIPER_ZERO_DX + 17.5 / 2 - 0.6, 0.31, -0.2);
      const fixedJaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, C.jawLen), mats.steel));
      fixedJaw.position.set(CALIPER_ZERO_DX - 0.25, 0.15, C.jawLen / 2 + C.beamW / 2 - 0.2);
      const slider = new THREE.Group();
      const sBody = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.6, 2.4, 2, 0.1), mats.steel));
      sBody.position.set(1.8, 0.3, 0);
      const window = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), own(new THREE.MeshBasicMaterial({ color: 0x9aa6af, transparent: true, opacity: 0.6 })));
      window.rotation.x = -Math.PI / 2;
      window.position.set(1.6, 0.61, -0.2);
      const movJaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, C.jawLen), mats.steel));
      movJaw.position.set(0.25, 0.15, C.jawLen / 2 + C.beamW / 2 - 0.2);
      const thumb = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14), mats.darkMetal));
      thumb.rotation.x = Math.PI / 2;
      thumb.position.set(3.6, 0.2, -1.4);
      const lock = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), mats.darkMetal));
      lock.position.set(2.4, 0.85, 0.6);
      slider.add(sBody, window, movJaw, thumb, lock);
      slider.add(at(hit(new THREE.BoxGeometry(4.6, 1.2, 2.8), id, 'slider'), 1.8, 0.4, -0.2));
      slider.add(at(hit(new THREE.BoxGeometry(1, 1, 1), id, 'lock'), 2.4, 1, 0.6));
      body.add(beam, scale, fixedJaw, slider);
      body.add(at(hit(new THREE.BoxGeometry(17, 0.6, 1.2), id, 'scale'), CALIPER_ZERO_DX + 8.5 + 4.5, 0.3, -0.2));
      body.add(at(hit(new THREE.BoxGeometry(C.length, 0.5, C.beamW + 0.4), id), C.length / 2 - 8, 0.2, 0));
      // Las mordazas apuntan hacia el operador (−y de la mesada = +z de la escena).
      ring = selRing(5);
      group.add(ring);
      update = (ctx) => {
        const c = ctx.world.caliper;
        slider.position.x = CALIPER_ZERO_DX + c.jawMm / 10;
        (lock.material as THREE.MeshStandardMaterial) = c.locked ? orange : mats.darkMetal;
        lock.position.y = c.locked ? 0.7 : 0.85;
      };
      break;
    }
    case 'micrometer': {
      const M = GEOF101.micrometer;
      const frameMat = own(new THREE.MeshStandardMaterial({ color: 0x3f4c57, roughness: 0.45, metalness: 0.3 }));
      const arc = shadowed(new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.45, 10, 24, Math.PI), frameMat));
      arc.rotation.z = Math.PI;
      arc.position.set(0, M.anvilZ, 0);
      const footL = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, M.anvilZ - 0.4, 1.4), frameMat));
      footL.position.set(-2.8, (M.anvilZ - 0.4) / 2, 0);
      const footR = footL.clone();
      footR.position.x = 2.8;
      const anvil = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 14), mats.chrome));
      anvil.rotation.z = Math.PI / 2;
      anvil.position.set(-2.8, M.anvilZ, 0);
      const spindle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4, 14), mats.chrome));
      spindle.rotation.z = Math.PI / 2;
      const sleeve = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3, 18), mats.steel));
      sleeve.rotation.z = Math.PI / 2;
      sleeve.position.set(4.3, M.anvilZ, 0);
      const sleeveScale = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.5), own(new THREE.MeshBasicMaterial({ map: own(labelTexture(['0  5  10  15  20  25'], { band: '#dfe4e8', w: 256, h: 40, color: '#111' })) })));
      sleeveScale.position.set(4.3, M.anvilZ + 0.15, 0.56);
      const thimble = new THREE.Group();
      const tCyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 24), mats.steel));
      tCyl.rotation.z = Math.PI / 2;
      const tickMat = own(new THREE.MeshBasicMaterial({ color: 0x111111 }));
      for (let i = 0; i < 50; i += 5) {
        const tk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.03), tickMat);
        const a = (i / 50) * Math.PI * 2;
        tk.position.set(-1.1, 0.81 * Math.cos(a), 0.81 * Math.sin(a));
        thimble.add(tk);
      }
      thimble.add(tCyl);
      const ratchet = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 16), mats.darkMetal));
      ratchet.rotation.z = Math.PI / 2;
      const lock = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), orange));
      lock.position.set(2.2, M.anvilZ + 0.9, 0);
      body.add(arc, footL, footR, anvil, spindle, sleeve, sleeveScale, thimble, ratchet, lock);
      const hThimble = hit(new THREE.CylinderGeometry(1.1, 1.1, 2.8, 10), id, 'thimble');
      hThimble.rotation.z = Math.PI / 2;
      const hRatchet = hit(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 10), id, 'ratchet');
      hRatchet.rotation.z = Math.PI / 2;
      const hScale = hit(new THREE.BoxGeometry(3, 1.2, 1.4), id, 'scale');
      hScale.position.set(4.3, M.anvilZ, 0);
      const hLock = hit(new THREE.BoxGeometry(0.8, 1.2, 0.8), id, 'lock');
      hLock.position.set(2.2, M.anvilZ + 0.9, 0);
      body.add(hThimble, hRatchet, hScale, hLock, at(hit(new THREE.BoxGeometry(7, M.anvilZ + 1, 1.8), id), 0, (M.anvilZ + 1) / 2, 0));
      ring = selRing(5);
      group.add(ring);
      update = (ctx) => {
        const m = ctx.world.micrometer;
        const face = -2.4 + m.spindleMm / 10;
        spindle.position.set(face + 2, M.anvilZ, 0);
        const tx = Math.max(face + 4.6, 6.1);
        thimble.position.set(tx, M.anvilZ, 0);
        thimble.rotation.x = (m.spindleMm / ctx.world.params.micrometer.pitchMm) * Math.PI * 2;
        ratchet.position.set(tx + 1.85, M.anvilZ, 0);
        hThimble.position.set(tx, M.anvilZ, 0);
        hRatchet.position.set(tx + 1.85, M.anvilZ, 0);
        lock.rotation.z = m.locked ? 0.9 : 0;
        anvil.material = m.facesDirty ? mats.darkMetal : mats.chrome;
      };
      break;
    }
    case 'ruler': {
      const R = GEOF101.ruler;
      const marks: Array<[number, boolean, string?]> = [];
      for (let mm = 0; mm <= 300; mm += 1) marks.push([mm / 300, mm % 10 === 0, mm % 50 === 0 ? String(mm / 10) : undefined]);
      const tex = own(graduationTexture(marks, '#111111', { sub: 'cm' }));
      tex.center.set(0.5, 0.5);
      tex.rotation = -Math.PI / 2;
      const board = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.length, 0.3, R.w), own(new THREE.MeshStandardMaterial({ color: 0xf4e9c8, roughness: 0.7 }))));
      board.position.y = 0;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(R.length, R.w - 0.1), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.16;
      body.add(board, face);
      group.add(at(hit(new THREE.BoxGeometry(R.length, 0.6, R.w), id, 'scale'), 0, 0.1, 0));
      break;
    }

    // ── C: gravimetría y volumen ──
    case 'balance': {
      const B = GEOF101.balance;
      const shell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }))));
      shell.position.y = B.h / 2;
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.panR, B.panR, 0.25, seg), mats.steel));
      pan.position.set(0, B.panZ - 0.12, 2);
      const front = shadowed(new THREE.Mesh(new THREE.BoxGeometry(B.w - 2, 3, 1), own(new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.5 }))));
      front.position.set(0, 3, B.d / 2 - 0.2);
      const lcd = lcdTexture(320, 80);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(-2.5, 3, B.d / 2 + 0.32);
      const btn = (x: number, m: THREE.Material) => {
        const b = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2, 1.1, 0.6, 2, 0.2), m));
        b.position.set(x, 3, B.d / 2 + 0.4);
        return b;
      };
      const bubble = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), own(new THREE.MeshBasicMaterial({ color: 0x9fe0b0 })));
      bubble.rotation.x = -Math.PI / 2;
      bubble.position.set(7.5, B.h + 0.02, -9);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), own(new THREE.MeshBasicMaterial({ color: 0x1e5631 })));
      dot.rotation.x = -Math.PI / 2;
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['2000 g × 0,01 g'], { band: '#123a63', w: 256, h: 40 })) })));
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(-5, B.h + 0.02, -10);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['ON/OFF    TARA'], { band: '#3a4652', w: 256, h: 48 })) })));
      lbl.position.set(5.5, 1.1, B.d / 2 + 0.35);
      body.add(shell, pan, front, screen, btn(4.5, mats.rubberRed), btn(7.2, mats.plasticBlue), bubble, dot, cap, lbl);
      group.add(at(hit(new THREE.BoxGeometry(2.6, 1.8, 1.4), id, 'power'), 4.5, 3, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(2.6, 1.8, 1.4), id, 'tare'), 7.2, 3, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(2.6, 1, 2.6), id, 'level'), 7.5, B.h + 0.2, -9));
      group.add(at(hit(new THREE.BoxGeometry(10, 2.8, 1.4), id, 'display'), -2.5, 3, B.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(B.w, B.h, B.d), id), 0, B.h / 2, 0));
      ring = selRing(14);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        const b = w.balance;
        const shown = balanceDisplayG(w);
        if (!b.powered) lcd.set('', '#1b2a20');
        else lcd.set(Number.isFinite(shown) ? shown.toFixed(2) : '------', b.stable ? '#6ef08a' : '#f0c36e', b.stable ? 'g  ●' : 'g  ~');
        dot.position.set(7.5 + Math.min(0.6, b.levelErrorDeg * 0.25), B.h + 0.04, -9);
      };
      break;
    }
    case 'dish': {
      const D = GEOF101.dish;
      const dish = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r * 0.8, D.h, seg, 1, true), own(new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.3, side: THREE.DoubleSide }))));
      dish.position.y = D.h / 2;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(D.r * 0.8, seg), own(new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.35 })));
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      body.add(dish, bottom);
      group.add(at(hit(new THREE.CylinderGeometry(D.r + 0.2, D.r + 0.2, D.h, 12), id), 0, D.h / 2, 0));
      ring = selRing(D.r + 0.6);
      group.add(ring);
      break;
    }
    case 'gradCyl': {
      const G = GEOF101.gradCyl;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(G.outerR, G.outerR, G.h, seg, 1, true), mats.glass);
      glass.position.y = G.h / 2 + 0.6;
      glass.renderOrder = 3;
      const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.baseR, G.baseR, 0.6, 6), own(new THREE.MeshStandardMaterial({ color: 0x2f6fa6, roughness: 0.4 }))));
      foot.position.y = 0.3;
      const marks: Array<[number, boolean, string?]> = [];
      const spanMl = (G.h - G.floor) * GRADCYL_AREA;
      for (let ml = 0; ml <= 100; ml += 1) marks.push([(ml / spanMl) * ((G.h - G.floor) / G.h) + G.floor / G.h, ml % 10 === 0, ml % 10 === 0 ? String(ml) : undefined]);
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(G.outerR + 0.01, G.outerR + 0.01, G.h, seg, 1, true, -0.35, 0.7), own(new THREE.MeshBasicMaterial({ map: own(graduationTexture(marks, '#ffffff', { sub: '100 mL' })), transparent: true, depthWrite: false })));
      scale.position.y = G.h / 2 + 0.6;
      const waterMat = own(new THREE.MeshPhysicalMaterial({ color: 0x8fc2e6, emissive: 0x8fc2e6, emissiveIntensity: 0.12, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
      const water = new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r, 1, seg), waterMat);
      water.renderOrder = 2;
      const men = new THREE.Mesh(new THREE.TorusGeometry(G.r * 0.96, 0.08, 6, seg), own(new THREE.MeshBasicMaterial({ color: 0x2f6fa6, transparent: true, opacity: 0.85 })));
      men.rotation.x = Math.PI / 2;
      const foam = new THREE.Mesh(new THREE.CylinderGeometry(G.r * 0.98, G.r * 0.98, 1, seg), own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.8 })));
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 4), own(new THREE.MeshBasicMaterial({ color: 0x3a3a3a })));
      crack.position.set(0.4, 2.6, G.outerR + 0.02);
      crack.rotation.z = 0.4;
      const drip = new THREE.Mesh(new THREE.CircleGeometry(1, 20), own(new THREE.MeshPhysicalMaterial({ color: 0xa9cbe6, transparent: true, opacity: 0.5, roughness: 0.02 })));
      drip.rotation.x = -Math.PI / 2;
      drip.position.set(5, 0.04, 3);
      body.add(glass, foot, scale, water, men, foam, crack, drip);
      group.add(at(hit(new THREE.CylinderGeometry(G.outerR + 0.3, G.outerR + 0.3, G.h, 12), id, 'scale'), 0, G.h / 2 + 0.6, 0));
      group.add(at(hit(new THREE.CylinderGeometry(G.baseR, G.baseR, 0.8, 8), id, 'base'), 0, 0.4, 0));
      ring = selRing(G.baseR + 0.6);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        const zMen = meniscusZ(w) - w.objects.gradCyl01.pose.z;
        const fl = G.floor;
        water.scale.y = Math.max(0.001, zMen - fl);
        water.position.y = fl + (zMen - fl) / 2;
        // Nivel oscilante tras una entrada brusca (solo visual, del estado `unsettledUntil`).
        const wob = w.timeS < w.gradCyl.unsettledUntil && !ctx.reducedMotion ? Math.sin(ctx.t * 18) * 0.12 : 0;
        men.position.y = zMen + wob;
        foam.visible = w.gradCyl.foamMl > 0.05;
        foam.scale.y = Math.max(0.05, w.gradCyl.foamMl / GRADCYL_AREA);
        foam.position.y = zMen + foam.scale.y / 2;
        crack.visible = w.gradCyl.cracked;
        drip.visible = w.water.benchMl > 0.02;
        const r = Math.min(9, 1 + Math.sqrt(w.water.benchMl) * 1.4);
        drip.scale.set(r, r, 1);
      };
      break;
    }

    // ── D: mesa de fuerzas ──
    case 'forceTable': {
      const top = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, 0.6, seg * 2), own(new THREE.MeshStandardMaterial({ color: 0x8a9399, metalness: 0.5, roughness: 0.4 }))));
      top.position.y = T.topZ - 0.3;
      const face = new THREE.Mesh(new THREE.CircleGeometry(T.r - 0.2, seg * 2), own(new THREE.MeshStandardMaterial({ map: own(angleScaleTexture()), roughness: 0.7 })));
      face.rotation.x = -Math.PI / 2;
      face.position.y = T.topZ + 0.01;
      const column = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, T.topZ - 2, 14), mats.darkMetal));
      column.position.y = (T.topZ - 2) / 2 + 1;
      const base = new THREE.Group();
      const feet: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 + 0.5;
        const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 1, 1.6), mats.darkMetal));
        leg.position.set(6 * Math.cos(a), 0.9, -6 * Math.sin(a));
        leg.rotation.y = a;
        const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 12), mats.blackPlastic));
        foot.position.set(12 * Math.cos(a), 0.4, -12 * Math.sin(a));
        feet.push(foot);
        base.add(leg, foot);
      }
      const pin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(T.pinR, T.pinR, 3, 12), mats.chrome));
      const ringMesh = shadowed(new THREE.Mesh(new THREE.TorusGeometry(T.ringR, 0.12, 8, 24), mats.steel));
      ringMesh.rotation.x = Math.PI / 2;
      const strings = new THREE.LineSegments(new THREE.BufferGeometry(), own(new THREE.LineBasicMaterial({ color: 0xf5f0e0 })));
      strings.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 2 * 3 * 2), 3));
      strings.frustumCulled = false;
      // Cable del sensor (perno → caja) cuando está conectado.
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(18, 2, -10), new THREE.Vector3(42, 0.4, -16)]), 24, 0.18, 6), mats.blackPlastic);
      body.add(top, face, column, base, pin, ringMesh, strings, cable);
      const hTop = at(hit(new THREE.CylinderGeometry(T.r - 3, T.r - 3, 0.8, 16), id, 'top'), 0, T.topZ - 0.2, 0);
      const hScale = hit(new THREE.CylinderGeometry(T.r, T.r, 0.7, 24), id, 'scale');
      hScale.position.y = T.topZ - 0.25;
      const hPin = at(hit(new THREE.CylinderGeometry(0.6, 0.6, 3.4, 8), id, 'pin'), 0, T.topZ + 1.4, 0);
      const hRing = hit(new THREE.CylinderGeometry(1.3, 1.3, 1, 12), id, 'ring');
      const hFeet = feet.map((f) => at(hit(new THREE.CylinderGeometry(1.4, 1.4, 1.4, 8), id, 'feet'), f.position.x, 0.6, f.position.z));
      group.add(hRing, hPin, hTop, hScale, ...hFeet);
      update = (ctx) => {
        const w = ctx.world;
        const t = w.table;
        pin.position.y = T.topZ + (t.pinIn ? 1.4 : -1.2);
        const rp = ringPoint(w);
        const lx = rp.x - TABLE_CENTER.x;
        const ly = rp.y - TABLE_CENTER.y;
        ringMesh.position.set(lx, rp.z, -ly);
        hRing.position.set(lx, rp.z, -ly);
        // Hilos: anillo → rueda (tenso solo si hay carga) → portapesas.
        const pos = strings.geometry.attributes.position as THREE.BufferAttribute;
        let n = 0;
        const seg2 = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
          pos.setXYZ(n++, ax, az, -ay);
          pos.setXYZ(n++, bx, bz, -by);
        };
        for (const pid of PULLEYS) {
          const m = hangingOn(w, pid);
          if (!m.hangerId) continue;
          const pl = t.pulleys[pid];
          const wheel = rimPoint(pl.angleDeg + (pl.seated ? 0 : pl.looseOffsetDeg * 0.5), T.pulleyOut, T.topZ + 1.2);
          const wz = pl.threaded ? T.topZ + 1.2 : T.topZ + 0.4;
          seg2(lx, ly, rp.z, wheel.x - TABLE_CENTER.x, wheel.y - TABLE_CENTER.y, wz);
          const drop = rimPoint(pl.angleDeg, T.pulleyOut + 1);
          seg2(drop.x - TABLE_CENTER.x, drop.y - TABLE_CENTER.y, wz, drop.x - TABLE_CENTER.x, drop.y - TABLE_CENTER.y, hangerZ(w, pid));
        }
        if (t.dyn.onRim) {
          const a = rimPoint(t.dyn.angleDeg, 1, T.topZ + 1.2);
          seg2(lx, ly, rp.z, a.x - TABLE_CENTER.x, a.y - TABLE_CENTER.y, a.z);
        }
        pos.needsUpdate = true;
        strings.geometry.setDrawRange(0, n);
        cable.visible = t.sensor.connected;
      };
      break;
    }
    case 'pulley': {
      const clamp = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.2, 2.6, 2, 0.2), mats.darkMetal));
      clamp.position.set(T.r + 0.6, T.topZ - 0.6, 0);
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.5), mats.steel));
      arm.position.set(T.r + 1.6, T.topZ + 0.6, 0);
      const wheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.22, 8, 20), own(new THREE.MeshStandardMaterial({ color: 0xd9dde0, metalness: 0.4, roughness: 0.4 }))));
      wheel.position.set(T.r + T.pulleyOut + 0.1, T.topZ + 0.3, 0);
      const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 12), mats.blackPlastic));
      screw.rotation.x = Math.PI / 2;
      screw.position.set(T.r + 0.6, T.topZ - 1.2, 1.6);
      const pointer = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.12), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      pointer.position.set(T.r - 0.6, T.topZ + 0.03, 0);
      body.add(clamp, arm, wheel, screw, pointer);
      const hClamp = at(hit(new THREE.BoxGeometry(2.8, 2.6, 3), id, 'clamp'), T.r + 0.6, T.topZ - 0.6, 0);
      const hScrew = at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.8), id, 'screw'), T.r + 0.6, T.topZ - 1.2, 1.9);
      const hWheel = at(hit(new THREE.SphereGeometry(1.3, 8, 6), id, 'wheel'), T.r + T.pulleyOut + 0.1, T.topZ + 0.3, 0);
      body.add(hClamp, hScrew, hWheel);
      place = (ctx) => {
        const pl = ctx.world.table.pulleys[id];
        group.position.set(TABLE_CENTER.x, 0, -TABLE_CENTER.y);
        const ang = pl.angleDeg + (pl.seated ? 0 : pl.looseOffsetDeg * 0.5);
        body.rotation.set(0, (ang * Math.PI) / 180, 0);
        screw.position.z = pl.seated ? 1.6 : 2.1;
        (screw.material as THREE.Material) = pl.seated ? mats.blackPlastic : orange;
        wheel.rotation.z = ctx.reducedMotion ? 0 : ctx.world.table.ring.vx * 50;
        return true;
      };
      break;
    }
    case 'hanger': {
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 8), mats.steel));
      rod.position.y = 4.5;
      const plate = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.35, seg), mats.darkMetal));
      plate.position.y = 0.18;
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 6, 12, Math.PI * 1.5), mats.steel));
      hook.position.y = 9.3;
      body.add(rod, plate, hook);
      group.add(at(hit(new THREE.CylinderGeometry(1, 1, 9.6, 8), id), 0, 4.8, 0));
      ring = selRing(2.2);
      group.add(ring);
      place = (ctx) => {
        const p = hungPose(ctx.world, id);
        if (!p) return false;
        const sw = ctx.reducedMotion ? 0 : Math.max(-0.08, Math.min(0.08, ctx.world.table.ring.vx * 3));
        group.position.set(p.x, p.z, -p.y);
        group.rotation.set(0, 0, sw);
        return true;
      };
      break;
    }
    case 'slotMass': {
      const nominal = w0.masses[id]?.nominalG ?? 50;
      const r = 1.6 + Math.min(0.8, nominal / 400);
      const th = 0.25 + nominal / 320;
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, seg), nominal >= 100 ? brass : mats.steel));
      disc.position.y = th / 2;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(r, th + 0.02, 0.4), own(new THREE.MeshBasicMaterial({ color: 0x1b2025 })));
      slot.position.set(r / 2, th / 2, 0);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture([`${nominal} g`], { band: '#3a4652', w: 128, h: 48 })) })));
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(-r * 0.35, th + 0.01, 0);
      body.add(disc, slot, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(r + 0.2, r + 0.2, th + 0.6, 10), id), 0, th / 2, 0));
      place = (ctx) => {
        const p = hungPose(ctx.world, id);
        if (!p) return false;
        group.position.set(p.x, p.z, -p.y);
        return true;
      };
      break;
    }
    case 'massRack': {
      const R = GEOF101.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 1, R.d), mats.wood));
      base.position.y = 0.5;
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, 0.8), mats.wood));
      back.position.set(0, R.h / 2, -R.d / 2 + 0.4);
      body.add(base, back);
      group.add(at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id), 0, R.h / 2, 0));
      break;
    }

    // ── E: observación ──
    case 'dynamometer': {
      const D = GEOF101.dynamometer;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.length, 18), own(new THREE.MeshPhysicalMaterial({ color: 0xe9f2f8, transparent: true, opacity: 0.55, roughness: 0.1 }))));
      tube.rotation.z = Math.PI / 2;
      const scaleMarks: Array<[number, boolean, string?]> = [];
      for (let i = 0; i <= 80; i++) scaleMarks.push([i / 80, i % 10 === 0, i % 10 === 0 ? String(i / 10) : undefined]);
      const tx = own(graduationTexture(scaleMarks, '#123a63', { sub: 'N' }));
      tx.center.set(0.5, 0.5);
      tx.rotation = -Math.PI / 2;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(D.length * 0.8, 0.9), own(new THREE.MeshBasicMaterial({ map: tx, transparent: true })));
      scale.rotation.x = -Math.PI / 2;
      scale.position.y = D.r + 0.02;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, D.length, 10), mats.chrome));
      rod.rotation.z = Math.PI / 2;
      const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 1.4), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 14), mats.darkMetal));
      screw.rotation.z = Math.PI / 2;
      screw.position.x = D.length / 2 + 0.6;
      const zeroKnob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 10), mats.plasticBlue));
      zeroKnob.position.set(D.length / 2 - 1.5, D.r + 0.3, 0);
      const alignTab = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), orange));
      alignTab.position.set(-D.length / 2 + 1.5, D.r + 0.3, 0);
      const inner = new THREE.Group();
      inner.add(tube, scale, rod, indicator, screw, zeroKnob, alignTab);
      body.add(inner);
      const hBody = hit(new THREE.BoxGeometry(D.length - 4, 2, 2.2), id, 'body');
      const hScale = at(hit(new THREE.BoxGeometry(D.length * 0.6, 0.6, 1), id, 'scale'), -1, D.r + 0.3, 0);
      const hScrew = at(hit(new THREE.BoxGeometry(1.6, 1.8, 1.8), id, 'screw'), D.length / 2 + 0.6, 0, 0);
      const hZero = at(hit(new THREE.BoxGeometry(1, 1, 1), id, 'zero'), D.length / 2 - 1.5, D.r + 0.4, 0);
      const hAlign = at(hit(new THREE.BoxGeometry(1.2, 1, 1.2), id, 'align'), -D.length / 2 + 1.5, D.r + 0.4, 0);
      inner.add(hBody, hScale, hScrew, hZero, hAlign);
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const t = ctx.world.table;
        const F = dynamometerForceN(ctx.world);
        // Indicador: posición proporcional a la fuerza a lo largo de la escala (0–8 N).
        indicator.position.set(-D.length * 0.4 + Math.min(1, (F + t.dyn.zeroOffsetN) / 8) * D.length * 0.8, D.r + 0.1, 0);
        if (!t.dyn.onRim) {
          inner.rotation.set(0, 0, 0);
          return false;
        }
        // Montado: radial, del ancla (fuera del borde) hacia el anillo, a la altura del hilo.
        const mid = rimPoint(t.dyn.angleDeg, 2 + D.length / 2, T.topZ + 1.2);
        group.position.set(mid.x, mid.z, -mid.y);
        inner.rotation.set(0, (t.dyn.angleDeg * Math.PI) / 180 + Math.PI, ((t.dyn.alignDeg * Math.PI) / 180) * 0.5);
        return true;
      };
      break;
    }
    case 'sensorBox': {
      const S = GEOF101.sensorBox;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(S.w, S.h, S.d, 2, 0.3), own(new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: 0.5 }))));
      box.position.y = S.h / 2;
      const lcd = lcdTexture(256, 96);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(0, S.h * 0.62, S.d / 2 + 0.02);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0x444444 })));
      led.position.set(-S.w / 2 + 0.7, S.h - 0.6, S.d / 2 + 0.1);
      const mkBtn = (x: number, m: THREE.Material) => {
        const b = shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.6, 0.5, 2, 0.15), m));
        b.position.set(x, 0.9, S.d / 2 + 0.2);
        return b;
      };
      const plug = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 10), mats.blackPlastic));
      plug.rotation.x = Math.PI / 2;
      plug.position.set(-S.w / 2 - 0.3, S.h / 2, 0);
      plug.rotation.z = Math.PI / 2;
      const hookPost = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 8), mats.steel));
      hookPost.position.set(0, S.h + 1.5, -1);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['RANGO  Hz  REC  CAL'], { band: '#2b3640', w: 256, h: 32 })) })));
      lbl.position.set(0.4, 0.3, S.d / 2 + 0.02);
      body.add(box, screen, led, mkBtn(-1.8, mats.plasticYellow), mkBtn(-0.4, mats.plasticBlue), mkBtn(1.0, mats.rubberRed), mkBtn(2.4, mats.steel), plug, hookPost, lbl);
      group.add(at(hit(new THREE.BoxGeometry(1.4, 1, 1), id, 'range'), -1.8, 0.9, S.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(1.4, 1, 1), id, 'rate'), -0.4, 0.9, S.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(1.4, 1, 1), id, 'rec'), 1.0, 0.9, S.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(1.4, 1, 1), id, 'cal'), 2.4, 0.9, S.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(1.4, 1.4, 1.4), id, 'plug'), -S.w / 2 - 0.3, S.h / 2, 0));
      group.add(at(hit(new THREE.BoxGeometry(S.w, S.h, S.d), id), 0, S.h / 2, 0));
      ring = selRing(5);
      group.add(ring);
      update = (ctx) => {
        const s = ctx.world.table.sensor;
        const f = ctx.world.table.pinForce;
        (led.material as THREE.MeshBasicMaterial).color.setHex(!s.connected ? 0x444444 : s.capture ? 0xff3b30 : 0x34c759);
        if (!s.connected) lcd.set('', '#1b2a20');
        else {
          const mag = Math.min(s.rangeN, Math.hypot(f.x, f.y) * s.scale);
          lcd.set(`${mag.toFixed(2)} N`, s.capture ? '#ff8a80' : '#6ef08a', `${s.rangeN} N · ${s.rateHz} Hz${s.calibrated ? ' · CAL' : ''}`);
        }
      };
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
      if (!(place && place(ctx, ob))) {
        const p = ob.pose;
        group.position.set(p.x, p.z, -p.y);
        group.rotation.set(0, 0, ob.support === 'hand' ? -p.rotationRad : 0);
      }
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
