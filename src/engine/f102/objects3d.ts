/**
 * Vistas 3D procedurales de F102: carril de aluminio con regla en cm, pie roscado y tope final; carro con bandera,
 * gancho y ruedas que giran con el recorrido; lanzador de émbolo; fotocompuertas en U con LED; temporizador con
 * pantalla; polea fuera del borde con el cordel (tenso o flojo, en la ranura o fuera) hasta el portapesas; registrador
 * de cinta con la tira (floja o tensa); inclinómetro digital; torre de caída con escala, electroimán, fotocelda con su
 * tapa y cronómetro, almohadilla, esferas, filtros cónicos y sensor de movimiento. SOLO leen el estado; cada pieza
 * funcional tiene un colisionador invisible simple (`userData {objId, part}`) para el rayo.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F102Object, F102World } from '../../simulation/f102-world/types';
import { GEOF102, trackX } from '../../simulation/f102-world/geometry';
import { bodyProps, filterStack, hanging } from '../../simulation/f102-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { labelTexture, lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F102Lab3D';
import { PULLEY_AXIS, RAIL_TOP, TR, TW, cartPos, filterPose, gatePos, hangerHook, hungPose, magnetPoleZ, plungerX, railZAt, towerBodyPose } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F102Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const DEG = Math.PI / 180;

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

/** Regla en cm de `lenCm`, con el cero en el borde `zeroRight` (el carril cuenta desde el lanzador, a la derecha). */
function rulerTexture(lenCm: number, zeroRight: boolean, px = 24): THREE.CanvasTexture {
  const W = Math.min(4096, Math.round(lenCm * px));
  const k = W / lenCm;
  return canvasTex(W, 64, (g) => {
    g.fillStyle = '#f3ecd8';
    g.fillRect(0, 0, W, 64);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.textAlign = 'center';
    g.font = 'bold 20px sans-serif';
    for (let mm = 0; mm <= lenCm * 10; mm++) {
      const x = zeroRight ? W - mm * (k / 10) : mm * (k / 10);
      const major = mm % 10 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, major ? 26 : mm % 5 === 0 ? 18 : 11);
      g.stroke();
      if (major && (mm / 10) % 5 === 0) g.fillText(String(mm / 10), Math.max(12, Math.min(W - 12, x)), 50);
    }
  });
}

/** Escala vertical de la torre en cm desde el haz de la fotocelda (0–150). */
function towerScaleTexture(): THREE.CanvasTexture {
  return canvasTex(96, 3072, (g) => {
    const H = 3072;
    const k = H / 155;
    g.fillStyle = '#f7f7f2';
    g.fillRect(0, 0, 96, H);
    g.strokeStyle = '#111';
    g.fillStyle = '#111';
    g.font = 'bold 22px sans-serif';
    for (let mm = 0; mm <= 1550; mm++) {
      const y = H - mm * (k / 10);
      const major = mm % 10 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(major ? 34 : mm % 5 === 0 ? 24 : 14, y);
      g.stroke();
      if (major && (mm / 10) % 5 === 0) g.fillText(String(mm / 10), 40, y + 8);
    }
  });
}

function line(color: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 24), 3));
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  l.frustumCulled = false;
  return l;
}

function setLine(l: THREE.Line, pts: Array<[number, number, number]>) {
  const pos = l.geometry.attributes.position as THREE.BufferAttribute;
  pts.slice(0, 24).forEach((p, i) => pos.setXYZ(i, p[0], p[1], p[2]));
  l.geometry.setDrawRange(0, Math.min(24, pts.length));
  pos.needsUpdate = true;
}

/** Bench (cm) → coordenadas de escena dentro de un grupo sin transformar. */
const S = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

export function createObjVisualF(o: F102Object, w0: F102World, q: QualityLevel): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F102Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xc8cdd2, metalness: 0.7, roughness: 0.35 }));
  const blue = own(new THREE.MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.45 }));
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.45 }));
  const foam = own(new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.95 }));
  const paperMat = own(new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9, side: THREE.DoubleSide }));
  const body = new THREE.Group();
  group.add(body);
  const lcdScreen = (w: number, h: number, pw = 256, ph = 96) => {
    const lcd = lcdTexture(pw, ph);
    own(lcd.texture);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
    return { lcd, mesh: m };
  };
  const button = (r: number, mat: THREE.Material) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 14), mat));

  switch (o.kind) {
    // ── A/B: carril, lanzador, carro, compuertas ──
    case 'track': {
      const L = TR.length;
      const pivot = new THREE.Group();
      // El grupo se ubica en el pie lejano (pivote); el carril se dibuja desde allí.
      const off = (TR.xLauncher - L / 2) - TR.footFarX;
      const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L, 2.2, TR.w), alu));
      rail.position.set(off, RAIL_TOP - 1.1, 0);
      const groove = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 1), mats.darkMetal);
      groove.position.set(off, RAIL_TOP + 0.02, 0);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.6), own(new THREE.MeshBasicMaterial({ map: own(rulerTexture(L, true)) })));
      strip.position.set(off, RAIL_TOP - 1.1, TR.w / 2 + 0.02);
      const stop = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 5, TR.w), mats.darkMetal));
      stop.position.set(trackX(TR.endS) - TR.footFarX - 0.75, RAIL_TOP + 1.5, 0);
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 6), mats.rubberRed);
      bumper.position.set(trackX(TR.endS) - TR.footFarX + 0.3, RAIL_TOP + 1.5, 0);
      pivot.add(rail, groove, strip, stop, bumper);
      for (const fx of [TR.footFarX, TR.footLauncherX]) {
        const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, RAIL_TOP - 2.2, TR.w + 4), mats.darkMetal));
        leg.position.set(fx - TR.footFarX, (RAIL_TOP - 2.2) / 2, 0);
        pivot.add(leg);
      }
      const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 16), mats.blackPlastic));
      screw.position.set(TR.footLauncherX - TR.footFarX, 1.1, TR.w / 2 + 3);
      body.add(pivot, screw);
      pivot.add(at(hit(new THREE.BoxGeometry(L, 3, TR.w), id, 'rail'), off, RAIL_TOP - 1.5, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 3), id, 'foot'), TR.footLauncherX - TR.footFarX, 1.1, TR.w / 2 + 3));
      place = (ctx) => {
        group.position.set(TR.footFarX, 0, -TR.y);
        pivot.rotation.z = -ctx.world.track.angleDeg * DEG;
        screw.rotation.y = ctx.world.track.footMm * 2 * Math.PI;
        return true;
      };
      break;
    }
    case 'launcher': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 4, 7, 2, 0.4), mats.darkMetal));
      box.position.set(GEOF102.launcher.len / 2, 2.5, 0);
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 12), mats.chrome));
      rod.rotation.z = Math.PI / 2;
      const face = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.5, 18), mats.blackPlastic));
      face.rotation.z = Math.PI / 2;
      const latch = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), red));
      latch.position.set(GEOF102.launcher.len / 2, 5, 2.4);
      const notches = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), own(new THREE.MeshBasicMaterial({ map: own(labelTexture(['0  1  2  3 cm'], { band: '#333', w: 256, h: 48 })) })));
      notches.position.set(GEOF102.launcher.len / 2, 2.5, 3.52);
      body.add(box, rod, face, latch, notches);
      const hPlunger = hit(new THREE.BoxGeometry(3, 3, 3), id, 'plunger');
      body.add(hPlunger, at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'latch'), GEOF102.launcher.len / 2, 5, 2.4));
      place = (ctx) => {
        const w = ctx.world;
        const z0 = railZAt(w, TR.xLauncher);
        group.position.set(TR.xLauncher, z0 - RAIL_TOP + 1, -TR.y);
        const fx = plungerX(w) - TR.xLauncher;
        face.position.set(fx, 2.5, 0);
        rod.position.set(fx + 3, 2.5, 0);
        hPlunger.position.set(fx, 2.5, 0);
        latch.position.y = w.launcher.latched ? 5 : 5.6;
        return true;
      };
      break;
    }
    case 'cart': {
      const C = GEOF102.cart;
      const chassis = shadowed(new THREE.Mesh(new RoundedBoxGeometry(C.len, C.h - 1.2, C.w, 2, 0.4), blue));
      chassis.position.y = 1.2 + (C.h - 1.2) / 2;
      const wheels: THREE.Mesh[] = [];
      for (const dx of [-3.4, 3.4]) {
        for (const dz of [-C.w / 2 + 0.3, C.w / 2 - 0.3]) {
          const wh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(C.wheelR, C.wheelR, 0.6, 16), mats.blackPlastic));
          wh.rotation.x = Math.PI / 2;
          wh.position.set(dx, C.wheelR, dz);
          wheels.push(wh);
          body.add(wh);
        }
      }
      const flagW = w0.cart.flagW * 100;
      const flag = new THREE.Group();
      const flagPlate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(flagW, C.flagH, 0.15), own(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }))));
      flagPlate.position.y = C.flagH / 2;
      flag.add(flagPlate);
      flag.position.y = C.h;
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 6, 12), mats.steel));
      hook.position.set(-C.len / 2 - 0.4, C.hookZ, 0);
      const tapeClip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 1.4), mats.steel));
      tapeClip.position.set(C.len / 2 + 0.2, 2, 0);
      body.add(chassis, flag, hook, tapeClip);
      body.add(at(hit(new THREE.BoxGeometry(C.len, C.h, C.w), id, 'body'), 0, C.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(Math.max(1.2, flagW), C.flagH, 1), id, 'flag'), 0, C.h + C.flagH / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.6, 1.6, 2), id, 'hook'), -C.len / 2 - 0.5, C.hookZ, 0));
      ring = selRing(7);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const p = cartPos(w);
        group.position.set(p.x, p.z, -p.y);
        group.rotation.set(0, 0, -w.track.angleDeg * DEG);
        for (const wh of wheels) wh.rotation.y = ctx.reducedMotion ? 0 : -w.cart.wheelRad;
        flag.rotation.x = w.cart.flagBent ? 0.35 : 0;
        return true;
      };
      break;
    }
    case 'gate': {
      const G = GEOF102.gate;
      const frame = new THREE.Group();
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(G.baseHalfCm * 2, 1, G.w), mats.darkMetal));
      base.position.y = -0.5;
      const postA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, G.h, 1.6), mats.blackPlastic));
      postA.position.set(0, G.h / 2, -G.w / 2 + 0.8);
      const postB = postA.clone();
      postB.position.z = G.w / 2 - 0.8;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, G.w), mats.blackPlastic));
      top.position.y = G.h;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, G.w - 3, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.5 })));
      beam.rotation.x = Math.PI / 2;
      beam.position.y = G.beamDz;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0x444444 })));
      led.position.set(0, G.h + 1, 0);
      const index = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.6), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      index.position.set(0, -0.6, TR.w / 2 + 0.4);
      const cable = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 6), mats.blackPlastic));
      cable.rotation.x = Math.PI / 2;
      cable.position.set(0, G.h, -G.w / 2 - 5);
      frame.add(base, postA, postB, top, beam, led, cable);
      body.add(frame, index);
      frame.add(at(hit(new THREE.BoxGeometry(1.8, G.h, 1.8), id, 'head'), 0, G.h / 2, G.w / 2 - 0.8));
      frame.add(at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'plug'), 0, G.h, -G.w / 2 + 0.8));
      body.add(at(hit(new THREE.BoxGeometry(G.baseHalfCm * 2, 1.4, 3), id, 'base'), 0, -0.4, -G.w / 2 + 1.5));
      body.add(at(hit(new THREE.BoxGeometry(0.8, 1.2, 1.2), id, 'index'), 0, -0.6, TR.w / 2 + 0.4));
      body.add(at(hit(new THREE.BoxGeometry(0.8, 1.2, 1.2), id, 'edge'), G.baseHalfCm, -0.6, TR.w / 2 + 0.4));
      ring = selRing(4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const p = gatePos(w, id);
        const g = w.gates[id];
        group.position.set(p.x, p.z, -p.y);
        frame.rotation.y = g.yawDeg * DEG;
        (led.material as THREE.MeshBasicMaterial).color.setHex(g.blocked ? 0xff3b30 : w.gateTimer.connected[id] ? 0x34c759 : 0x444444);
        cable.visible = w.gateTimer.connected[id];
        return true;
      };
      break;
    }
    case 'gateTimer': {
      const G = GEOF102.gateTimer;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(G.w, G.h, G.d, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = G.h / 2;
      const { lcd, mesh } = lcdScreen(9, 2.6, 320, 96);
      mesh.position.set(0, G.h * 0.62, G.d / 2 + 0.02);
      const bArm = button(0.6, mats.plasticBlue);
      bArm.rotation.x = Math.PI / 2;
      bArm.position.set(-3, 1.2, G.d / 2 + 0.2);
      const bRead = button(0.6, mats.plasticYellow);
      bRead.rotation.x = Math.PI / 2;
      bRead.position.set(3, 1.2, G.d / 2 + 0.2);
      body.add(box, mesh, bArm, bRead);
      body.add(at(hit(new THREE.BoxGeometry(2, 2, 1.2), id, 'arm'), -3, 1.2, G.d / 2 + 0.3));
      body.add(at(hit(new THREE.BoxGeometry(2, 2, 1.2), id, 'read'), 3, 1.2, G.d / 2 + 0.3));
      body.add(at(hit(new THREE.BoxGeometry(G.w, G.h, G.d), id, 'body'), 0, G.h / 2, 0));
      update = (ctx) => {
        const gt = ctx.world.gateTimer;
        const n = Object.values(ctx.world.gates).reduce((s, g) => s + g.events.length, 0);
        lcd.set(gt.running ? 'ARMADO' : 'LISTO', gt.running ? '#f0c36e' : '#6ef08a', gt.running ? `${n} cruces` : 'compuertas A · B');
      };
      break;
    }
    case 'cartBar': {
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 3), mats.steel));
      bar.position.y = 0.75;
      body.add(bar);
      body.add(at(hit(new THREE.BoxGeometry(8.4, 2, 3.4), id), 0, 0.8, 0));
      place = (ctx, ob) => {
        if (ob.support !== 'cart01') return false;
        const w = ctx.world;
        const p = cartPos(w);
        const k = w.cart.bars.indexOf(id);
        group.position.set(p.x, p.z + GEOF102.cart.h + k * 1.5, -p.y + 2.6);
        return true;
      };
      break;
    }
    // ── C: polea, cordel, portapesas, cinta ──
    case 'pulley': {
      const clamp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 6, 6), mats.darkMetal));
      clamp.position.set(2.5, -1, 0);
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.8), mats.steel));
      arm.position.set(0.5, 0, 0);
      const wheel = new THREE.Group();
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(GEOF102.pulley.r, GEOF102.pulley.r, 0.8, seg), own(new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.5 }))));
      disc.rotation.x = Math.PI / 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(GEOF102.pulley.r * 1.8, 0.3, 0.9), mats.darkMetal);
      wheel.add(disc, spoke);
      body.add(clamp, arm, wheel);
      body.add(at(hit(new THREE.SphereGeometry(GEOF102.pulley.r + 0.6, 10, 8), id, 'wheel'), 0, 0, 0));
      // Cordel: del gancho del carro a la polea y de la polea al portapesas (líneas en coordenadas de mesada).
      const str = line(0xf5f0dc);
      group.add(str);
      place = (ctx) => {
        const w = ctx.world;
        const z0 = railZAt(w, 0) - RAIL_TOP;
        body.position.set(PULLEY_AXIS.x, PULLEY_AXIS.z + z0, -PULLEY_AXIS.y);
        wheel.rotation.z = ctx.reducedMotion ? 0 : w.string.wheelRad;
        group.position.set(0, 0, 0);
        const st = w.string;
        str.visible = st.attached;
        if (st.attached) {
          const c = cartPos(w);
          const hookX = c.x - GEOF102.cart.len / 2 - 0.4;
          const dy = st.onWheel ? 0 : 1.6;
          const top: [number, number, number] = S(PULLEY_AXIS.x, PULLEY_AXIS.y + dy, PULLEY_AXIS.z + z0 + GEOF102.pulley.r);
          const pts: Array<[number, number, number]> = [S(hookX, c.y, c.z + GEOF102.cart.hookZ)];
          if (hanging(w) || w.objects.hanger01?.support === 'floor') {
            const h = hangerHook(w);
            const sag = !st.taut && !st.landed ? 0.8 : st.landed ? 3 : 0;
            for (let i = 1; i < 8; i++) {
              const u = i / 8;
              pts.push(S(hookX + (PULLEY_AXIS.x - hookX) * u, c.y + dy * u, c.z + GEOF102.cart.hookZ + (top[1] - c.z - GEOF102.cart.hookZ) * u - sag * Math.sin(Math.PI * u)));
            }
            pts.push(top);
            pts.push(S(PULLEY_AXIS.x - GEOF102.pulley.r, PULLEY_AXIS.y + dy, PULLEY_AXIS.z + z0));
            pts.push(S(h.x, h.y + dy, h.z + z0));
          } else {
            pts.push(S(hookX - 6, c.y, c.z - 1));
          }
          setLine(str, pts);
        }
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
        group.position.set(p.x, p.z, -p.y);
        return true;
      };
      break;
    }
    case 'slotMass': {
      const nominal = w0.masses[id]?.nominalG ?? 10;
      const r = 1.5 + Math.min(0.6, nominal / 100);
      const th = 0.25 + nominal / 160;
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, seg), nominal >= 50 ? own(new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 })) : mats.steel));
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
      const R = GEOF102.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 1, R.d), mats.wood));
      base.position.y = 0.5;
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, 0.8), mats.wood));
      back.position.set(0, R.h / 2, -R.d / 2 + 0.4);
      body.add(base, back);
      group.add(at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id), 0, R.h / 2, 0));
      break;
    }
    case 'tapeTimer': {
      const G = GEOF102.tapeTimer;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(G.w, G.h, G.d, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.55 }))));
      box.position.y = G.h / 2;
      const sw = button(0.7, red);
      sw.rotation.x = Math.PI / 2;
      sw.position.set(2, G.h * 0.6, G.d / 2 + 0.2);
      const knob = button(0.6, mats.blackPlastic);
      knob.position.set(-2, G.h + 0.2, 0);
      const roll = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 16), paperMat));
      roll.rotation.x = Math.PI / 2;
      roll.position.set(2, G.h + 1.4, 0);
      body.add(box, sw, knob, roll);
      body.add(at(hit(new THREE.BoxGeometry(2, 2, 1.2), id, 'switch'), 2, G.h * 0.6, G.d / 2 + 0.3));
      body.add(at(hit(new THREE.BoxGeometry(2, 1.4, 2), id, 'tension'), -2, G.h + 0.2, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 2.4), id, 'tape'), 2, G.h + 1.4, 0));
      body.add(at(hit(new THREE.BoxGeometry(G.w, G.h, G.d), id, 'body'), 0, G.h / 2, 0));
      const strip = line(0xd8cfb0);
      group.add(strip);
      update = (ctx) => {
        const w = ctx.world;
        (sw.material as THREE.Material) = w.tape.running ? mats.rubberRed : red;
        strip.visible = w.tape.attached;
        if (!w.tape.attached) return;
        const c = cartPos(w);
        const rear = c.x + GEOF102.cart.len / 2 + 0.4;
        const from = ctx.world.objects.tapeTimer01.pose;
        const pts: Array<[number, number, number]> = [];
        const sag = w.tape.slack ? 1.6 : 0;
        for (let i = 0; i <= 10; i++) {
          const u = i / 10;
          pts.push([(rear - from.x) * u, G.h * 0.8 + (c.z + 2 - G.h * 0.8) * u - sag * Math.sin(Math.PI * u), 0]);
        }
        setLine(strip, pts);
      };
      break;
    }
    case 'inclinometer': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(10, 2.2, 3, 2, 0.3), own(new THREE.MeshStandardMaterial({ color: 0xf2b134, roughness: 0.5 }))));
      box.position.y = 1.1;
      const { lcd, mesh } = lcdScreen(4.4, 1.6, 192, 72);
      mesh.position.set(-1.6, 1.3, 1.52);
      const bZero = button(0.45, mats.blackPlastic);
      bZero.rotation.x = Math.PI / 2;
      bZero.position.set(3, 1.1, 1.6);
      body.add(box, mesh, bZero);
      body.add(at(hit(new THREE.BoxGeometry(1.4, 1.4, 1.2), id, 'zero'), 3, 1.1, 1.7));
      body.add(at(hit(new THREE.BoxGeometry(10, 2.2, 3), id, 'body'), 0, 1.1, 0));
      ring = selRing(6);
      group.add(ring);
      place = (ctx, ob) => {
        if (ob.support !== 'track01') return false;
        const w = ctx.world;
        const z = railZAt(w, ob.pose.x);
        group.position.set(ob.pose.x, z + 0.3, -ob.pose.y);
        group.rotation.set(0, 0, -w.track.angleDeg * DEG);
        return true;
      };
      update = (ctx, ob) => {
        const w = ctx.world;
        const onTrack = ob.support === 'track01';
        const shown = Math.round(((onTrack ? w.track.angleDeg : 0) + w.inclinometer.offsetDeg) * 10) / 10;
        lcd.set(`${shown.toFixed(1)}°`, '#6ef08a', w.inclinometer.zeroed ? 'ZERO' : '');
        if (!onTrack) group.rotation.set(0, 0, 0);
      };
      break;
    }
    // ── D: torre de caída ──
    case 'tower': {
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(TW.baseW, TW.baseH, TW.baseD), mats.darkMetal));
      base.position.y = TW.baseH / 2;
      const colDy = TW.colY - TW.y;
      const col = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, TW.height, 3), alu));
      col.position.set(0, TW.height / 2, -colDy);
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 155), own(new THREE.MeshBasicMaterial({ map: own(towerScaleTexture()) })));
      scale.position.set(0, TW.beamZ + 155 / 2, -colDy + 1.52);
      body.add(base, col, scale);
      body.add(at(hit(new THREE.BoxGeometry(3.2, TW.height, 3.2), id, 'scale'), 0, TW.height / 2, -colDy));
      body.add(at(hit(new THREE.BoxGeometry(TW.baseW, TW.baseH + 0.4, TW.baseD), id, 'base'), 0, TW.baseH / 2, 0));
      break;
    }
    case 'magnet': {
      const colDy = TW.colY - TW.y;
      const slider = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), mats.darkMetal));
      slider.position.set(0, 2, -colDy);
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 14), mats.blackPlastic));
      knob.rotation.z = Math.PI / 2;
      knob.position.set(3.2, 2, -colDy);
      // El brazo pivota en la columna: con el brazo adentro, la bobina queda sobre el eje de caída.
      const arm = new THREE.Group();
      arm.position.set(0, 0, -colDy);
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, colDy), alu));
      bar.position.set(0, 3, colDy / 2);
      const coil = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 3, 16), own(new THREE.MeshStandardMaterial({ color: 0xb5651d, metalness: 0.5, roughness: 0.4 }))));
      coil.position.set(0, 1.5, colDy);
      arm.add(bar, coil, at(hit(new THREE.BoxGeometry(2, 2, colDy + 2), id, 'arm'), 0, 2.5, colDy / 2 + 1));
      const sw = button(0.6, mats.plasticBlue);
      sw.rotation.x = Math.PI / 2;
      sw.position.set(-2, 2, -colDy + 2.6);
      body.add(slider, knob, arm, sw);
      body.add(at(hit(new THREE.BoxGeometry(5.4, 4.4, 5.4), id, 'slider'), 0, 2, -colDy));
      body.add(at(hit(new THREE.BoxGeometry(2, 2, 2.2), id, 'clamp'), 3.4, 2, -colDy));
      body.add(at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.2), id, 'switch'), -2, 2, -colDy + 2.7));
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(TW.x, magnetPoleZ(w), -TW.y);
        // El brazo gira 90° alrededor de la columna para dejar libre el eje (y el cono del sensor).
        arm.rotation.y = w.magnet.armIn ? 0 : Math.PI / 2;
        knob.position.x = w.magnet.clampTight ? 3.2 : 3.8;
        (coil.material as THREE.MeshStandardMaterial).emissive?.setHex(w.magnet.on ? 0x331100 : 0x000000);
        (sw.material as THREE.Material) = w.magnet.on ? mats.rubberRed : mats.plasticBlue;
        return true;
      };
      break;
    }
    case 'photocell': {
      const hw = GEOF102.tower.beamHalfCm + 1.5;
      const em = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), mats.blackPlastic));
      em.position.set(-hw, 0, 0);
      const rc = em.clone();
      rc.position.x = hw;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, hw * 2, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.5 })));
      beam.rotation.z = Math.PI / 2;
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 12), red));
      cap.rotation.z = Math.PI / 2;
      const timer = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 4, 5, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      timer.position.set(TW.baseW / 2 + 6, 2 - TW.beamZ, 4);
      const { lcd, mesh } = lcdScreen(6.4, 2, 256, 80);
      mesh.position.set(TW.baseW / 2 + 6, 2.6 - TW.beamZ, 6.52);
      const bArm = button(0.5, mats.plasticBlue);
      bArm.rotation.x = Math.PI / 2;
      bArm.position.set(TW.baseW / 2 + 4, 0.9 - TW.beamZ, 6.6);
      body.add(em, rc, beam, cap, timer, mesh, bArm);
      body.add(at(hit(new THREE.BoxGeometry(2.2, 2.2, 2.2), id, 'cap'), hw + 1.2, 0, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.4, 1.4, 1.2), id, 'arm'), TW.baseW / 2 + 4, 0.9 - TW.beamZ, 6.7));
      body.add(at(hit(new THREE.BoxGeometry(6.4, 2.2, 1.2), id, 'read'), TW.baseW / 2 + 6, 2.6 - TW.beamZ, 6.7));
      update = (ctx) => {
        const w = ctx.world;
        cap.position.set(w.photocellCapped ? hw - 1.4 : hw + 1.6, w.photocellCapped ? 0 : -2.4, 0);
        beam.visible = !w.photocellCapped;
        const ft = w.fallTimer;
        const shown = ft.startS === null ? 0 : ft.stopS !== null ? ft.stopS - ft.startS : ft.running ? w.timeS - ft.startS : 0;
        lcd.set(shown.toFixed(4), ft.armed ? (ft.running ? '#f0c36e' : '#6ef08a') : '#4a6a50', ft.armed ? 's · ARMADO' : 's');
      };
      break;
    }
    case 'pad': {
      const pad = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(TW.padR, TW.padR, TW.padTop - TW.baseH, seg), foam));
      pad.position.y = (TW.padTop - TW.baseH) / 2;
      body.add(pad);
      body.add(at(hit(new THREE.CylinderGeometry(TW.padR, TW.padR, TW.padTop - TW.baseH + 0.3, 12), id), 0, (TW.padTop - TW.baseH) / 2, 0));
      break;
    }
    case 'sphere': {
      const hollow = id === 'sphereS' && w0.scenarios.includes('F102-S11_drag_sphere');
      const r = hollow ? 2 : id === 'sphereS' ? 1 : 1.27;
      const ball = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), hollow ? own(new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4 })) : mats.chrome));
      ball.position.y = r;
      body.add(ball);
      group.add(at(hit(new THREE.SphereGeometry(r + 0.3, 10, 8), id), 0, r, 0));
      ring = selRing(r + 0.8);
      group.add(ring);
      place = (ctx) => {
        const p = towerBodyPose(ctx.world, id);
        if (!p) return false;
        group.position.set(p.x, p.z, -p.y);
        return true;
      };
      break;
    }
    // ── E: filtros y sensor ──
    case 'motionSensor': {
      const colDy = TW.colY - TW.y;
      const armBar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, colDy), alu));
      armBar.position.set(0, 2.6, -colDy / 2);
      const head = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 3, 6, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x1f3b57, roughness: 0.5 }))));
      const mesh0 = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), own(new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.4, roughness: 0.6 })));
      mesh0.rotation.x = Math.PI / 2;
      mesh0.position.y = -1.52;
      head.add(box, mesh0);
      const { lcd, mesh } = lcdScreen(5.4, 1.8, 256, 80);
      mesh.position.set(0, 0.2, 3.02);
      head.add(mesh);
      const btns: Array<[string, number]> = [['plug', -2.2], ['range', -0.8], ['rate', 0.6], ['cal', 2]];
      for (const [part, x] of btns) {
        const b = button(0.4, part === 'plug' ? mats.blackPlastic : mats.plasticYellow);
        b.position.set(x, 1.7, 1.6);
        head.add(b, at(hit(new THREE.BoxGeometry(1.2, 1, 1.2), id, part), x, 1.7, 1.6));
      }
      const rec = button(0.5, red);
      rec.position.set(2.2, 1.7, -1.6);
      head.add(rec, at(hit(new THREE.BoxGeometry(1.4, 1, 1.4), id, 'rec'), 2.2, 1.7, -1.6));
      head.add(at(hit(new THREE.BoxGeometry(6, 3, 6), id, 'head'), 0, 0, 0));
      body.add(armBar, head);
      update = (ctx) => {
        const s = ctx.world.motion;
        head.rotation.z = -s.aimDeg * DEG;
        (rec.material as THREE.Material) = s.capture ? mats.rubberRed : red;
        if (!s.connected) lcd.set('', '#1b2a20');
        else lcd.set(s.capture ? 'REC' : 'LISTO', s.capture ? '#ff8a80' : '#6ef08a', `${s.range === 'near' ? '0,15–1 m' : '0,15–6 m'} · ${s.rateHz} Hz${s.calibrated ? ' · CAL' : ''}`);
      };
      place = () => {
        group.position.set(TW.x, TW.sensorZ, -TW.y);
        return true;
      };
      break;
    }
    case 'filter': {
      const f = GEOF102.filter;
      const cone = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r * 0.45, f.h, seg, 1, true), paperMat));
      cone.position.y = f.h / 2;
      const ball = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), paperMat));
      ball.position.y = 2.4;
      body.add(cone, ball);
      group.add(at(hit(new THREE.CylinderGeometry(f.r, f.r * 0.45, f.h + 0.4, 12), id), 0, f.h / 2, 0));
      ring = selRing(f.r + 0.6);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const stacked = !!w.filters[ob.support];
        const p = stacked || ob.support === 'magnet01' || ob.support === 'air' ? filterPose(w, id) : null;
        if (!p) return false;
        group.position.set(p.x, p.z, -p.y);
        const fall = w.fall;
        const base = filterStack(w, id)[0];
        if (fall && fall.id === base && fall.tumbling && !fall.landed && !ctx.reducedMotion) {
          const ph = (w.timeS - fall.releasedS) * 2 * Math.PI * 2.5;
          group.rotation.set(0.5 * Math.sin(ph), 0, 0.5 * Math.cos(ph));
        } else group.rotation.set(0, 0, 0);
        return true;
      };
      update = (ctx) => {
        const cr = ctx.world.filters[id].crumpled;
        cone.visible = !cr;
        ball.visible = cr;
        const props = bodyProps(ctx.world, id);
        void props;
      };
      break;
    }
    case 'returnTray': {
      const T = GEOF102.tray;
      const tray = shadowed(new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.6, T.d), mats.blackPlastic));
      tray.position.y = 0.3;
      const rimA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(T.w, T.h, 0.6), mats.blackPlastic));
      rimA.position.set(0, T.h / 2, T.d / 2);
      const rimB = rimA.clone();
      rimB.position.z = -T.d / 2;
      body.add(tray, rimA, rimB);
      group.add(at(hit(new THREE.BoxGeometry(T.w, T.h, T.d), id), 0, T.h / 2, 0));
      break;
    }
  }

  group.traverse((c) => {
    const m = c as THREE.Mesh;
    if ((m.isMesh || (c as THREE.Line).isLine) && m.geometry) disposables.push(m.geometry);
    if ((c as THREE.Line).isLine) disposables.push((c as THREE.Line).material as THREE.Material);
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
