/**
 * Vistas 3D procedurales de la Práctica 3 (§4.1, §5): mechero con partes identificables, toma de gas, encendedor,
 * cápsula con hollín, pinza, placa refractaria, asas de nicromio, tubos, gradilla, soporte de asas, vidrio de cobalto,
 * estación de limpieza y elementos de seguridad. SOLO leen el estado (lo dibujan); no deciden nada.
 * Cada malla de selección lleva `userData = { objId, part }` (las partes del mechero se identifican sobre el modelo).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Practice3Object } from '../../simulation/flame-world/types';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { labelTexture, lcdTexture, tapeTexture } from '../renderers/textures';
import type { FrameCtx3 } from './FlameLab3D';
import { BURNER, CAPSULE, GAS_TAP, GLASS, HCL_VIAL, HOLDER, LIGHTER, LOOP, RACK, RINSE, TILE, TUBE } from '../../practices/practice-03/instruments';
import { toScene } from '../units';

export interface ObjHandle {
  group: THREE.Group;
  update(ctx: FrameCtx3, o: Practice3Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;

function hit(geo: THREE.BufferGeometry, objId: string, part?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, hitMat());
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

/** Brillo de un metal según su temperatura (incandescencia solo cuando corresponde, §5.1). */
function glowColor(tC: number, out: THREE.Color): number {
  if (tC < 480) return 0;
  const u = Math.min(1, (tC - 480) / 600);
  out.setRGB(1, 0.25 + 0.55 * u, 0.05 + 0.3 * u * u);
  return 0.4 + 2.2 * u;
}

const metalBrass = () => new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.85, roughness: 0.32 });

/** Etiqueta pequeña con texto (rótulos de tubos y asas). */
function tagPlane(text: string, w: number, h: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tapeTexture(text), roughness: 0.8 }));
}

export function createObjVisual(o: Practice3Object, q: QualityLevel, label: string): ObjHandle {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle['update'] = () => undefined;
  const id = o.id;

  switch (o.kind) {
    case 'burner': {
      const base = shadowed(new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(0.001, 0), new THREE.Vector2(BURNER.baseR, 0), new THREE.Vector2(BURNER.baseR, 0.35), new THREE.Vector2(BURNER.baseR - 1.6, BURNER.baseH),
        new THREE.Vector2(1.1, BURNER.baseH + 0.25), new THREE.Vector2(0.001, BURNER.baseH + 0.25),
      ], seg), mats.darkMetal));
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0xc4ccd3, metalness: 0.9, roughness: 0.28, emissive: 0x000000 });
      const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(BURNER.barrelR, BURNER.barrelR, BURNER.mouthZ - BURNER.baseH, seg, 1, true), barrelMat));
      barrel.position.y = (BURNER.mouthZ + BURNER.baseH) / 2;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(BURNER.barrelR - 0.06, 0.07, 8, seg), mats.steel);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = BURNER.mouthZ;
      const inside = new THREE.Mesh(new THREE.CircleGeometry(BURNER.barrelR - 0.08, seg), new THREE.MeshBasicMaterial({ color: 0x0c0d0e }));
      inside.rotation.x = -Math.PI / 2;
      inside.position.y = BURNER.mouthZ - 0.25;
      // Entradas de aire (ranuras en el cañón) y collar regulador que las cubre al girar.
      const slotMat = new THREE.MeshBasicMaterial({ color: 0x050607 });
      const slots = new THREE.Group();
      for (const a of [0, Math.PI]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9), slotMat);
        s.position.set(Math.sin(a) * (BURNER.barrelR + 0.01), BURNER.collarZ, Math.cos(a) * (BURNER.barrelR + 0.01));
        s.rotation.y = a;
        slots.add(s);
      }
      const collarMat = metalBrass();
      const collar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(BURNER.barrelR + 0.18, BURNER.barrelR + 0.18, BURNER.collarH, seg, 1, true), collarMat));
      collar.position.y = BURNER.collarZ;
      const collarHoles = new THREE.Group();
      for (const a of [0, Math.PI]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.95), slotMat);
        s.position.set(Math.sin(a) * (BURNER.barrelR + 0.19), 0, Math.cos(a) * (BURNER.barrelR + 0.19));
        s.rotation.y = a;
        collarHoles.add(s);
      }
      const knurl = new THREE.Mesh(new THREE.TorusGeometry(BURNER.barrelR + 0.2, 0.05, 6, seg), collarMat);
      knurl.rotation.x = Math.PI / 2;
      knurl.position.y = -BURNER.collarH / 2 + 0.1;
      const collarPivot = new THREE.Group();
      collarPivot.position.y = BURNER.collarZ;
      collarPivot.add(collarHoles, knurl);
      collar.position.y = 0;
      collarPivot.add(collar);
      // Entrada lateral de gas con espiga, orientada según BURNER.inlet (hacia la llave de mesa).
      const il = Math.hypot(BURNER.inlet.dx, BURNER.inlet.dy) || 1;
      const ux = BURNER.inlet.dx / il;
      const uy = BURNER.inlet.dy / il;
      const along = (d: number) => toScene(ux * d, uy * d, BURNER.inlet.z);
      const dirScene = new THREE.Vector3(...toScene(ux, uy, 0)).normalize();
      const inlet = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 3.2, 16), mats.steel));
      inlet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirScene);
      const [ix, iy, iz] = along(il - 1.4);
      inlet.position.set(ix, iy, iz);
      for (let k = 0; k < 3; k++) {
        const barb = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 16), mats.steel);
        barb.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirScene);
        const [bx, by, bz] = along(il - 0.4 - k * 0.5);
        barb.position.set(bx, by, bz);
        group.add(barb);
      }
      // Válvula de aguja (perilla al frente, sobre la base).
      const knobPivot = new THREE.Group();
      const [kx, ky, kz] = toScene(BURNER.needleKnob.dx, BURNER.needleKnob.dy, BURNER.needleKnob.z);
      knobPivot.position.set(kx, ky, kz);
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.8, 16), mats.blackPlastic));
      knob.rotation.x = Math.PI / 2;
      const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      pointer.position.set(0, 0.3, 0.42);
      knobPivot.add(knob, pointer);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 10), mats.steel);
      stem.rotation.x = Math.PI / 2;
      stem.position.set(kx, ky, kz - 0.8);
      // Brillo interior del retroceso (llama dentro del cañón).
      const fbLight = new THREE.Mesh(new THREE.CylinderGeometry(BURNER.barrelR - 0.08, BURNER.barrelR - 0.08, 2.2, 16), new THREE.MeshBasicMaterial({ color: 0x3a6dff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      fbLight.position.y = BURNER.collarZ + 0.6;
      group.add(base, barrel, lip, inside, slots, collarPivot, inlet, knobPivot, stem, fbLight);
      // Selección por partes (§6.1): la identificación usa la geometría real.
      const hb = hit(new THREE.CylinderGeometry(BURNER.baseR, BURNER.baseR, BURNER.baseH + 0.3, 16), id, 'base');
      hb.position.y = (BURNER.baseH + 0.3) / 2;
      const hBarrel = hit(new THREE.CylinderGeometry(BURNER.barrelR + 0.3, BURNER.barrelR + 0.3, BURNER.mouthZ - 6.2, 12), id, 'barrel');
      hBarrel.position.y = 5 + (BURNER.mouthZ - 6.2) / 2 - 0.4;
      const hMouth = hit(new THREE.CylinderGeometry(BURNER.barrelR + 0.45, BURNER.barrelR + 0.45, 1.2, 12), id, 'mouth');
      hMouth.position.y = BURNER.mouthZ - 0.4;
      const hCollar = hit(new THREE.CylinderGeometry(BURNER.barrelR + 0.6, BURNER.barrelR + 0.6, BURNER.collarH * 0.55, 12), id, 'airCollar');
      hCollar.position.y = BURNER.collarZ - BURNER.collarH * 0.22;
      const hInlets = hit(new THREE.CylinderGeometry(BURNER.barrelR + 0.62, BURNER.barrelR + 0.62, BURNER.collarH * 0.45, 12), id, 'airInlets');
      hInlets.position.y = BURNER.collarZ + BURNER.collarH * 0.27;
      const hInlet = hit(new THREE.BoxGeometry(1.6, 1.6, 3.8), id, 'gasInlet');
      hInlet.position.set(ix, iy, iz);
      hInlet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirScene);
      const hKnob = hit(new THREE.SphereGeometry(1.15, 10, 8), id, 'needleValve');
      hKnob.position.set(kx, ky, kz + 0.2);
      group.add(hb, hBarrel, hMouth, hCollar, hInlets, hInlet, hKnob);
      ring = selRing(BURNER.baseR + 0.6);
      const glow = new THREE.Color();
      update = (ctx) => {
        const b = ctx.world.burner;
        collarPivot.rotation.y = b.airCollar * (Math.PI * 0.55);
        // Las ranuras quedan visibles en la medida en que el collar las descubre.
        slots.scale.x = Math.max(0.02, b.airCollar);
        knobPivot.rotation.z = -b.needleGasValve * Math.PI * 1.5;
        const e = glowColor(b.bodyTemperatureC + 150, glow);
        barrelMat.emissive.copy(glow);
        barrelMat.emissiveIntensity = e * 0.12;
        const fb = b.flameState === 'FLASHBACK';
        (fbLight.material as THREE.MeshBasicMaterial).opacity = fb ? 0.55 + 0.25 * Math.sin(ctx.t * 30) : 0;
      };
      break;
    }
    case 'gasTap': {
      // Llave de gas de la mesa sobre la canaleta (palanca amarilla: paralela al tubo = abierta).
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3.2, 3, 2.6, 2, 0.4), mats.steel));
      const nozzle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 3.4, 14), mats.steel));
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, -0.6, 2.4);
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.6, 0);
      const lever = shadowed(new THREE.Mesh(new RoundedBoxGeometry(5.5, 0.6, 1, 2, 0.2), mats.plasticYellow));
      lever.position.x = 2.4;
      pivot.add(lever);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(7, 3), new THREE.MeshStandardMaterial({ map: labelTexture(['GAS', 'propano'], { band: '#f2c230', w: 256, h: 110 }) }));
      plate.position.set(0, 4.2, -0.5);
      group.add(body, nozzle, pivot, plate);
      const h1 = hit(new THREE.BoxGeometry(7.5, 3.5, 3.5), id, 'tableValve');
      h1.position.set(1.5, 1.4, 0.6);
      group.add(h1);
      update = (ctx) => {
        pivot.rotation.y = -ctx.world.burner.tableGasValve * (Math.PI / 2);
      };
      break;
    }
    case 'lighter': {
      // Encendedor largo: el origen es la punta; el mango queda hacia el estudiante y a la izquierda.
      const inner = new THREE.Group();
      const nozzle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 13, 12), mats.steel));
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.x = -6.5;
      const grip = shadowed(new THREE.Mesh(new RoundedBoxGeometry(LIGHTER.length - 13, 2.2, 1.4, 2, 0.4), new THREE.MeshStandardMaterial({ color: 0xd8382e, roughness: 0.5 })));
      grip.position.set(-13 - (LIGHTER.length - 13) / 2, -0.6, 0);
      const trigger = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.8), mats.blackPlastic);
      trigger.position.set(-14.2, -1.9, 0);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 10), flameMat);
      flame.position.set(0.3, 0.7, 0);
      inner.add(nozzle, grip, trigger, flame);
      group.add(inner);
      const h1 = hit(new THREE.BoxGeometry(LIGHTER.length, 2.6, 2), id);
      h1.position.x = -LIGHTER.length / 2;
      inner.add(h1);
      update = (ctx, ob) => {
        const held = ob.support === 'hand';
        // En la mano apunta hacia la boca (inclinado); en la mesada queda acostado.
        inner.rotation.set(0, held ? -0.4 : 0.25, held ? -0.35 : 0);
        const on = ctx.world.lighter.sparking;
        flameMat.opacity = on ? 0.75 + 0.2 * Math.sin(ctx.t * 40) : 0;
        flame.scale.setScalar(on ? 1 + 0.15 * Math.sin(ctx.t * 23) : 1);
      };
      break;
    }
    case 'ruler': {
      // Escala visual temporal (§6.5): regla vertical de 0 a 20 cm sobre la boca.
      const tex = rulerTexture();
      disposables.push(tex);
      const rulerMesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, 21, 0.25), [mats.wood, mats.wood, mats.wood, mats.wood, new THREE.MeshStandardMaterial({ map: tex }), mats.wood]));
      rulerMesh.position.y = BURNER.mouthZ + 10.5 - 0.0;
      const foot = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4, 0.8, 4, 2, 0.2), mats.darkMetal));
      foot.position.y = 0.4;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, BURNER.mouthZ, 8), mats.steel);
      post.position.y = BURNER.mouthZ / 2;
      group.add(rulerMesh, foot, post);
      const h1 = hit(new THREE.BoxGeometry(4, BURNER.mouthZ + 21, 4), id);
      h1.position.y = (BURNER.mouthZ + 21) / 2;
      group.add(h1);
      ring = selRing(2.6);
      break;
    }
    case 'backdrop': {
      const board = shadowed(new THREE.Mesh(new RoundedBoxGeometry(46, 42, 1, 2, 0.4), new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.95 })));
      board.position.y = 21.5;
      const feet: THREE.Mesh[] = [];
      for (const x of [-18, 18]) {
        const f = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 8), mats.darkMetal));
        f.position.set(x, 0.5, 0);
        feet.push(f);
      }
      group.add(board, ...feet);
      const h1 = hit(new THREE.BoxGeometry(46, 42, 1.4), id);
      h1.position.y = 21.5;
      group.add(h1);
      break;
    }
    case 'tile': {
      const tex = tileTexture();
      disposables.push(tex);
      const slab = shadowed(new THREE.Mesh(new RoundedBoxGeometry(TILE.half * 2, TILE.h, TILE.half * 2, 2, 0.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })));
      slab.position.y = TILE.h / 2;
      group.add(slab);
      const h1 = hit(new THREE.BoxGeometry(TILE.half * 2, TILE.h + 0.2, TILE.half * 2), id);
      h1.position.y = TILE.h / 2;
      group.add(h1);
      break;
    }
    case 'capsule': {
      const prof = [
        new THREE.Vector2(0.001, 0), new THREE.Vector2(CAPSULE.bottomR, 0), new THREE.Vector2(CAPSULE.bottomR + 0.9, 0.35),
        new THREE.Vector2(CAPSULE.rimR - 0.4, CAPSULE.height * 0.75), new THREE.Vector2(CAPSULE.rimR, CAPSULE.height), new THREE.Vector2(CAPSULE.rimR - 0.25, CAPSULE.height + 0.05),
        new THREE.Vector2(CAPSULE.rimR - 0.55, CAPSULE.height * 0.78), new THREE.Vector2(CAPSULE.bottomR + 0.6, 0.55), new THREE.Vector2(0.001, 0.4),
      ];
      const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xf8f6f0, roughness: 0.25, clearcoat: q === 'LOW' ? 0 : 0.8, emissive: 0x000000 });
      const dish = shadowed(new THREE.Mesh(new THREE.LatheGeometry(prof, seg), porcelain));
      // Spout (pico de vertido) para leer la orientación.
      const spout = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), porcelain);
      spout.position.set(CAPSULE.rimR, CAPSULE.height, 0);
      // Hollín: película oscura en la cara inferior; su opacidad sigue a la cobertura del dominio (§8.2).
      const sootTex = sootTexture();
      disposables.push(sootTex);
      const sootMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1, transparent: true, opacity: 0, alphaMap: sootTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const soot = new THREE.Mesh(new THREE.LatheGeometry(prof.slice(0, 5).map((p) => new THREE.Vector2(p.x * 1.012 + 0.01, p.y - 0.005)), seg), sootMat);
      group.add(dish, spout, soot);
      const h1 = hit(new THREE.CylinderGeometry(CAPSULE.rimR, CAPSULE.bottomR, CAPSULE.height + 0.3, 16), id);
      h1.position.y = CAPSULE.height / 2;
      group.add(h1);
      ring = selRing(CAPSULE.rimR + 0.4);
      const glow = new THREE.Color();
      update = (ctx, ob) => {
        const c = ctx.world.capsule;
        sootMat.opacity = Math.min(1, c.sootCoverage * 1.35);
        sootMat.color.setHex(c.sootCoverage > 0.35 ? 0x0a0a0a : 0x3a3a3a);
        const e = glowColor(ob.temperatureC, glow);
        porcelain.emissive.copy(glow);
        porcelain.emissiveIntensity = e * 0.25;
      };
      break;
    }
    case 'tongs': {
      // Pinza para crisol: el origen es la punta (mandíbulas); los brazos van hacia el estudiante y hacia arriba.
      const inner = new THREE.Group();
      const armL = new THREE.Group();
      const armR = new THREE.Group();
      for (const [arm, s] of [[armL, 1], [armR, -1]] as const) {
        const jaw = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 12, Math.PI), mats.steel));
        jaw.rotation.y = Math.PI / 2;
        jaw.position.set(s * 0.25, 0, 0.6);
        const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 20, 8), mats.steel));
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(s * 0.25, 0, 10.8);
        const loopHandle = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.15, 6, 14), mats.steel);
        loopHandle.position.set(s * 1.1, 0, 21.5);
        loopHandle.rotation.x = Math.PI / 2;
        arm.add(jaw, shaft, loopHandle);
      }
      inner.add(armL, armR);
      group.add(inner);
      const h1 = hit(new THREE.BoxGeometry(3, 2, 23), id);
      h1.position.set(0, 0, 11);
      inner.add(h1);
      ring = null;
      update = (ctx, ob) => {
        const held = ob.support === 'hand';
        const holding = !!ctx.world.tongs[id]?.holding;
        inner.rotation.x = held ? -0.55 : 0;
        const open = holding ? 0.02 : held ? 0.12 : 0.08;
        armL.rotation.y = open;
        armR.rotation.y = -open;
        const tint = ctx.clampReady && held ? 0xffd166 : 0xc4ccd3;
        (armL.children[0] as THREE.Mesh).material = tint === 0xc4ccd3 ? mats.steel : readyMat;
        (armR.children[0] as THREE.Mesh).material = (armL.children[0] as THREE.Mesh).material;
      };
      const readyMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb000, emissiveIntensity: 0.6 });
      disposables.push(readyMat);
      break;
    }
    case 'loop': {
      // Asa de nicromio: el origen es el centro del aro. Alambre + mango con rótulo.
      const inner = new THREE.Group();
      const wireMat = new THREE.MeshStandardMaterial({ color: 0x8d8f91, metalness: 0.8, roughness: 0.35, emissive: 0x000000 });
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(LOOP.ringR, 0.045, 6, 16), wireMat);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, LOOP.wireLen, 6), wireMat);
      wire.position.y = -LOOP.ringR - LOOP.wireLen / 2;
      const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, LOOP.handleLen, 12), new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.6 })));
      handle.position.y = -LOOP.ringR - LOOP.wireLen - LOOP.handleLen / 2;
      const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1, 10), metalBrass());
      ferrule.position.y = -LOOP.ringR - LOOP.wireLen - 0.3;
      const tag = tagPlane(label, 1.9, 0.9);
      tag.position.set(0, -LOOP.ringR - LOOP.wireLen - 2.6, 0.45);
      inner.add(ringM, wire, handle, ferrule, tag);
      group.add(inner);
      const h1 = hit(new THREE.CylinderGeometry(0.9, 0.9, LOOP.wireLen + LOOP.handleLen + 1, 8), id);
      h1.position.y = -(LOOP.wireLen + LOOP.handleLen) / 2;
      inner.add(h1);
      const glow = new THREE.Color();
      update = (ctx, ob) => {
        const l = ctx.world.loops[id];
        // Orientación: vertical en su soporte, inclinada hacia el estudiante en la mano, acostada en la mesada.
        if (ob.support.startsWith('holder:')) inner.rotation.set(0, 0, 0);
        else if (ob.support === 'hand') inner.rotation.set(0.25, 0, Math.PI / 2 + 0.35);
        else inner.rotation.set(-Math.PI / 2 + 0.04, 0, 0.4);
        if (!l) return;
        const e = glowColor(l.temperatureC, glow);
        wireMat.emissive.copy(glow);
        wireMat.emissiveIntensity = e;
        wireMat.color.setHex(l.oxideCondition > 0.5 ? 0x5d5148 : 0x8d8f91);
      };
      break;
    }
    case 'tube': {
      const outer = [new THREE.Vector2(0.001, 0), new THREE.Vector2(TUBE.outerR * 0.7, 0.05), new THREE.Vector2(TUBE.outerR, 0.6), new THREE.Vector2(TUBE.outerR, TUBE.height), new THREE.Vector2(TUBE.outerR + 0.1, TUBE.height + 0.08)];
      const glassMesh = new THREE.Mesh(new THREE.LatheGeometry(outer, seg), mats.glass);
      glassMesh.renderOrder = 3;
      const liqMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fb, roughness: 0.08, transparent: true, opacity: 0.2, depthWrite: false });
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.innerR, TUBE.innerR * 0.75, 1, seg), liqMat);
      liquid.renderOrder = 2;
      const menisc = new THREE.Mesh(new THREE.CircleGeometry(TUBE.innerR, seg), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
      menisc.rotation.x = -Math.PI / 2;
      const tape = tagPlane(label.length > 10 ? label.replace('Incógnita ', '') : label, 1.5, 0.75);
      tape.position.set(0, TUBE.height * 0.68, TUBE.outerR + 0.02);
      group.add(glassMesh, liquid, menisc, tape);
      const h1 = hit(new THREE.CylinderGeometry(TUBE.outerR + 0.5, TUBE.outerR + 0.5, TUBE.height, 10), id);
      h1.position.y = TUBE.height / 2;
      group.add(h1);
      update = (ctx) => {
        const s = ctx.world.solutions[id];
        if (!s) return;
        const h = Math.max(0.001, s.volumeMl * TUBE.cmPerMl);
        liquid.visible = menisc.visible = s.volumeMl > 0.02;
        liquid.scale.y = h;
        liquid.position.y = TUBE.bottomZ + h / 2;
        menisc.position.y = TUBE.bottomZ + h;
        liqMat.color.setHex(s.displayColor);
        liqMat.opacity = s.displayOpacity;
      };
      break;
    }
    case 'rack': {
      const wood = mats.wood;
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(RACK.hx * 2, 0.6, RACK.hy * 2, 2, 0.2), wood));
      base.position.y = 0.3;
      const top = new THREE.Mesh(new THREE.BoxGeometry(RACK.hx * 2, 0.5, RACK.hy * 2), wood);
      top.position.y = RACK.h;
      shadowed(top);
      const legs: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const l = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, RACK.h, RACK.hy * 2), wood));
        l.position.set(s * (RACK.hx - 0.3), RACK.h / 2, 0);
        legs.push(l);
      }
      const holes = new THREE.Group();
      for (let i = 0; i < RACK.slots; i++) {
        const hm = new THREE.Mesh(new THREE.CircleGeometry(TUBE.outerR + 0.15, 16), new THREE.MeshBasicMaterial({ color: 0x2b1d12 }));
        hm.rotation.x = -Math.PI / 2;
        hm.position.set(-((RACK.slots - 1) / 2) * RACK.pitch + i * RACK.pitch, RACK.h + 0.26, 0);
        holes.add(hm);
      }
      group.add(base, top, ...legs, holes);
      const h1 = hit(new THREE.BoxGeometry(RACK.hx * 2, 0.8, RACK.hy * 2), id);
      h1.position.y = 0.4;
      group.add(h1);
      break;
    }
    case 'loopHolder': {
      const block = shadowed(new THREE.Mesh(new RoundedBoxGeometry(HOLDER.hx * 2, HOLDER.h, HOLDER.hy * 2, 2, 0.3), new THREE.MeshStandardMaterial({ color: 0x3d5a73, roughness: 0.6 })));
      block.position.y = HOLDER.h / 2;
      const tex = labelTexture(['SOPORTE DE ASAS', 'una ranura por disolución'], { band: '#3d5a73', w: 512, h: 96 });
      disposables.push(tex);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(HOLDER.hx * 2 - 1, 1.6), new THREE.MeshStandardMaterial({ map: tex }));
      plate.position.set(0, HOLDER.h * 0.5, HOLDER.hy + 0.02);
      group.add(block, plate);
      for (let i = 0; i < HOLDER.slots; i++) {
        const x = -((HOLDER.slots - 1) / 2) * HOLDER.pitch + i * HOLDER.pitch;
        const slot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: 0x0d1720 }));
        slot.rotation.x = -Math.PI / 2;
        slot.position.set(x, HOLDER.h + 0.01, 0);
        group.add(slot);
      }
      const h1 = hit(new THREE.BoxGeometry(HOLDER.hx * 2, HOLDER.h, HOLDER.hy * 2), id);
      h1.position.y = HOLDER.h / 2;
      group.add(h1);
      break;
    }
    case 'glass': {
      // Vidrio azul de cobalto en marco con asa. El origen es el centro del vidrio.
      const inner = new THREE.Group();
      const paneMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1a8c, roughness: 0.08, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(GLASS.halfW * 2, GLASS.halfH * 2), paneMat);
      pane.renderOrder = 6;
      const frameMat = mats.blackPlastic;
      const frame = new THREE.Group();
      for (const [w, h, x, y] of [[GLASS.halfW * 2 + 0.6, 0.4, 0, GLASS.halfH + 0.2], [GLASS.halfW * 2 + 0.6, 0.4, 0, -GLASS.halfH - 0.2], [0.4, GLASS.halfH * 2, GLASS.halfW + 0.2, 0], [0.4, GLASS.halfH * 2, -GLASS.halfW - 0.2, 0]]) {
        const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), frameMat));
        b.position.set(x, y, 0);
        frame.add(b);
      }
      const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, GLASS.handleLen, 10), frameMat));
      handle.position.y = -GLASS.halfH - GLASS.handleLen / 2;
      inner.add(pane, frame, handle);
      group.add(inner);
      const h1 = hit(new THREE.BoxGeometry(GLASS.halfW * 2 + 1, GLASS.halfH * 2 + GLASS.handleLen, 1.2), id);
      h1.position.y = -GLASS.handleLen / 2;
      inner.add(h1);
      const wp = new THREE.Vector3();
      const q4 = new THREE.Quaternion();
      update = (ctx, ob) => {
        const held = ob.support === 'hand' || ob.support === 'stand';
        if (held) {
          // En la mano (o sostenido frente a la vista), el vidrio queda de frente a la cámara.
          group.getWorldPosition(wp);
          const dx = ctx.camPos.x - wp.x;
          const dz = ctx.camPos.z - wp.z;
          const dy = ctx.camPos.y - wp.y;
          inner.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)) * -1, Math.atan2(dx, dz), 0, 'YXZ');
        } else inner.rotation.set(-Math.PI / 2, 0.3, 0, 'YXZ');
        paneMat.opacity = 0.58 + 0.25 * (1 - ctx.world.glass.cleanliness);
        // Rectángulo del vidrio en la escena (para el filtrado por fragmento y la alineación).
        inner.updateWorldMatrix(true, false);
        const g = ctx.glass;
        pane.getWorldPosition(g.center);
        pane.getWorldQuaternion(q4);
        g.u.set(1, 0, 0).applyQuaternion(q4);
        g.v.set(0, 1, 0).applyQuaternion(q4);
        g.n.set(0, 0, 1).applyQuaternion(q4);
        g.halfW = GLASS.halfW;
        g.halfH = GLASS.halfH;
        g.on = held;
      };
      break;
    }
    case 'cloth': {
      const geo = new THREE.PlaneGeometry(9, 7, 8, 6);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.7) * 0.18 + Math.cos(pos.getY(i) * 2.1) * 0.12);
      geo.computeVertexNormals();
      const cloth = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4f86c6, roughness: 1, side: THREE.DoubleSide })));
      cloth.rotation.x = -Math.PI / 2;
      cloth.position.y = 0.25;
      group.add(cloth);
      const h1 = hit(new THREE.BoxGeometry(9, 1, 7), id);
      h1.position.y = 0.4;
      group.add(h1);
      break;
    }
    case 'soapBottle': {
      const bottle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 9, 16), new THREE.MeshPhysicalMaterial({ color: 0xbfe7f5, transparent: true, opacity: 0.7, roughness: 0.2 })));
      bottle.position.y = 4.5;
      const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.2, 2, 1.6, 2, 0.3), mats.plasticWhite));
      head.position.y = 10;
      const tex = labelTexture(['Agua jabonosa', 'prueba de fugas'], { band: '#2f7fd1', w: 256, h: 128 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, 4.5, 1.82);
      group.add(bottle, head, lab);
      const h1 = hit(new THREE.CylinderGeometry(2, 2, 11.5, 10), id);
      h1.position.y = 5.75;
      group.add(h1);
      break;
    }
    case 'rinseBeaker': {
      const prof = [new THREE.Vector2(0.001, 0), new THREE.Vector2(RINSE.r, 0), new THREE.Vector2(RINSE.r, RINSE.h), new THREE.Vector2(RINSE.r + 0.2, RINSE.h + 0.1)];
      const gl = new THREE.Mesh(new THREE.LatheGeometry(prof, seg), mats.glass);
      gl.renderOrder = 3;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(RINSE.r - 0.1, RINSE.r - 0.1, RINSE.waterZ, seg), new THREE.MeshPhysicalMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
      water.position.y = RINSE.waterZ / 2;
      const tex = labelTexture(['H₂O destilada', 'enjuague'], { band: '#2f7fd1', w: 256, h: 120 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.5), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, RINSE.h * 0.6, RINSE.r + 0.03);
      group.add(gl, water, lab);
      const h1 = hit(new THREE.CylinderGeometry(RINSE.r, RINSE.r, RINSE.h, 12), id);
      h1.position.y = RINSE.h / 2;
      group.add(h1);
      break;
    }
    case 'waste': {
      const bin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4, 12, 20), new THREE.MeshStandardMaterial({ color: 0x2c6e49, roughness: 0.6 })));
      bin.position.y = 6;
      const tex = labelTexture(['RESIDUOS', 'disoluciones de sales'], { band: '#2c6e49', w: 256, h: 120 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.3), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, 7, 4.42);
      group.add(bin, lab);
      const h1 = hit(new THREE.CylinderGeometry(4.5, 4.5, 12, 10), id);
      h1.position.y = 6;
      group.add(h1);
      break;
    }
    case 'hclVial': {
      // HCl concentrado: vial pequeño, estable, rotulado y con tapa, dentro de la campana (§15.3).
      const holder = shadowed(new THREE.Mesh(new RoundedBoxGeometry(5, 1.8, 5, 2, 0.3), new THREE.MeshStandardMaterial({ color: 0x9aa5ae, roughness: 0.5 })));
      holder.position.y = 0.9;
      const vial = new THREE.Mesh(new THREE.CylinderGeometry(HCL_VIAL.r, HCL_VIAL.r, HCL_VIAL.h, 16), mats.amberGlass);
      vial.position.y = HCL_VIAL.h / 2;
      vial.renderOrder = 3;
      const acid = new THREE.Mesh(new THREE.CylinderGeometry(HCL_VIAL.r - 0.12, HCL_VIAL.r - 0.12, HCL_VIAL.h * 0.5, 16), new THREE.MeshPhysicalMaterial({ color: 0xf3f1d0, transparent: true, opacity: 0.4, depthWrite: false }));
      acid.position.y = HCL_VIAL.h * 0.27;
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(HCL_VIAL.r + 0.15, HCL_VIAL.r + 0.15, 1, 16), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 })));
      const tex = labelTexture(['HCl conc.', 'CORROSIVO'], { picto: 'warn', band: '#c0392b', w: 256, h: 128 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, HCL_VIAL.h * 0.62, HCL_VIAL.r + 0.02);
      group.add(holder, vial, acid, cap, lab);
      const h1 = hit(new THREE.CylinderGeometry(2.5, 2.5, HCL_VIAL.h + 1.5, 10), id);
      h1.position.y = (HCL_VIAL.h + 1.5) / 2;
      group.add(h1);
      update = (ctx) => {
        const open = ctx.world.hcl.open;
        cap.position.set(open ? 3.2 : 0, open ? 0.5 : HCL_VIAL.h + 0.5, 0);
      };
      break;
    }
    case 'extinguisher': {
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 24, 20), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4 })));
      body.position.y = 12;
      const top = shadowed(new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), body.material));
      top.position.y = 24;
      const valve = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.4), mats.darkMetal));
      valve.position.y = 27.5;
      const horn = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 12, 1, true), mats.blackPlastic);
      horn.position.set(2.8, 22, 1.6);
      horn.rotation.z = Math.PI;
      const tex = labelTexture(['EXTINTOR', 'CO₂ — tipo B/C'], { band: '#c62828', w: 256, h: 140 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, 13, 3.22);
      group.add(body, top, valve, horn, lab);
      const h1 = hit(new THREE.CylinderGeometry(3.4, 3.4, 29, 10), id);
      h1.position.y = 14.5;
      group.add(h1);
      break;
    }
    case 'blanket': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(12, 14, 4, 2, 0.5), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.5 })));
      box.position.z = 2;
      const tex = labelTexture(['MANTA', 'IGNÍFUGA'], { band: '#7a0f0f', color: '#fff6f0', w: 256, h: 200 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, 0, 4.02);
      const tabs = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x1f1f1f }));
      tabs.position.set(0, -7.6, 3);
      group.add(box, lab, tabs);
      const h1 = hit(new THREE.BoxGeometry(12, 16, 5), id);
      h1.position.set(0, -0.5, 2);
      group.add(h1);
      break;
    }
    case 'emergencyStop': {
      const plate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 8, 1.2, 2, 0.3), mats.plasticYellow));
      plate.position.z = 0.6;
      const mush = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1.4, 24), new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.35, emissive: 0x000000 })));
      mush.rotation.x = Math.PI / 2;
      mush.position.z = 1.9;
      const tex = labelTexture(['CORTE', 'DE GAS'], { band: '#d32f2f', w: 256, h: 120 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 2.2), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, 5.6, 0.2);
      group.add(plate, mush, lab);
      const h1 = hit(new THREE.BoxGeometry(8, 11, 3), id);
      h1.position.set(0, 1.2, 1.4);
      group.add(h1);
      update = (ctx) => {
        const off = !ctx.world.burner.supplyOn;
        mush.position.z = off ? 1.3 : 1.9;
        const m = mush.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(off ? 0x660000 : 0x000000);
      };
      break;
    }
    case 'extractor': {
      // Extractor de pared sobre la mesada + interruptor con testigo.
      const grill = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 2, 32), new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.5 })));
      grill.rotation.x = Math.PI / 2;
      grill.position.set(0, 52, 1);
      const fan = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7, 0.2), mats.darkMetal);
        blade.position.y = 3.5;
        const arm = new THREE.Group();
        arm.rotation.z = (i * Math.PI) / 2;
        arm.add(blade);
        fan.add(arm);
      }
      fan.position.set(0, 52, 1.6);
      const sw = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4.4, 6.5, 1, 2, 0.3), mats.plasticWhite));
      sw.position.z = 0.5;
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshBasicMaterial({ color: 0x2a3a2f }));
      led.position.set(0, 2.2, 1.05);
      const rocker = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.6), mats.blackPlastic);
      rocker.position.set(0, -0.6, 1.2);
      const tex = labelTexture(['EXTRACCIÓN'], { band: '#46637d', w: 256, h: 80 });
      disposables.push(tex);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.8), new THREE.MeshStandardMaterial({ map: tex }));
      lab.position.set(0, 4.6, 0.2);
      group.add(grill, fan, sw, led, rocker, lab);
      const h1 = hit(new THREE.BoxGeometry(6, 10, 2.5), id);
      h1.position.set(0, 1, 1);
      group.add(h1);
      update = (ctx) => {
        const on = ctx.world.room.extractionOn;
        (led.material as THREE.MeshBasicMaterial).color.setHex(on ? 0x3cff6b : 0x2a3a2f);
        rocker.rotation.x = on ? -0.25 : 0.25;
        if (on && !ctx.reducedMotion) fan.rotation.z -= ctx.dt * 18;
      };
      break;
    }
    case 'coDetector': {
      // Detector de CO y gas combustible (§4.1): el CO no se ve; solo se mide.
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(9, 6.5, 1.6, 2, 0.4), mats.plasticWhite));
      body.position.z = 0.8;
      const lcd = lcdTexture(320, 120);
      disposables.push(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.6), new THREE.MeshBasicMaterial({ map: lcd.texture }));
      screen.position.set(0, 0.6, 1.62);
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0x1d3a24 }));
      led.position.set(-3.3, -2.3, 1.62);
      group.add(body, screen, led);
      const h1 = hit(new THREE.BoxGeometry(9, 6.5, 2.5), id);
      h1.position.z = 1;
      group.add(h1);
      let last = '';
      update = (ctx) => {
        const r = ctx.world.room;
        const p = ctx.world.params;
        const lel = Math.min(99, (r.gasAccumMl / p.gasBlockMl) * 25);
        const text = `CO ${Math.round(r.coPpm)} ppm`;
        const small = `GAS ${lel.toFixed(0)} % LIE`;
        const color = r.coPpm > p.coAlarmPpm || r.gasAccumMl > p.gasAlarmMl ? '#ff6b5e' : r.coPpm > p.coWarnPpm || r.gasAccumMl > p.gasWarnMl ? '#ffc861' : '#6ef08a';
        const key = `${text}|${small}|${color}`;
        if (key !== last) {
          last = key;
          lcd.set(text, color, small);
        }
        const alarm = r.alarm && Math.sin(ctx.t * 10) > 0;
        (led.material as THREE.MeshBasicMaterial).color.setHex(alarm ? 0xff3b30 : 0x1d3a24);
      };
      break;
    }
    case 'atomizer': {
      const inner = new THREE.Group();
      const bottle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 7, 14), new THREE.MeshPhysicalMaterial({ color: 0xe9f2f7, transparent: true, opacity: 0.75, roughness: 0.2 })));
      bottle.position.y = 3.5;
      const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.8, 2.6, 2, 0.3), mats.blackPlastic));
      head.position.set(0, 8.2, 0.4);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8), mats.steel);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 8.6, 1.9);
      const tape = tagPlane(label.replace('Atomizador ', ''), 1.8, 0.85);
      tape.position.set(0, 3.5, 1.52);
      inner.add(bottle, head, nozzle, tape);
      group.add(inner);
      const h1 = hit(new THREE.CylinderGeometry(1.8, 1.8, 9.5, 10), id);
      h1.position.y = 4.75;
      inner.add(h1);
      update = (ctx) => {
        const a = ctx.world.atomizers[id];
        // La boquilla apunta en la dirección `yaw` (en el plano de la mesada).
        if (a) inner.rotation.y = Math.PI / 2 + a.yawRad - Math.PI;
      };
      break;
    }
  }

  if (ring) group.add(ring);
  const ringRef = ring;
  return {
    group,
    update(ctx, ob) {
      if (ringRef) ringRef.visible = ctx.selected === id || ctx.hovered === id || ctx.held === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

function rulerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 840;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4ecd8';
  g.fillRect(0, 0, 64, 840);
  g.fillStyle = '#1d2329';
  g.font = 'bold 22px Inter, Segoe UI, sans-serif';
  // 21 cm de regla; 0 a la altura de la boca (abajo), 40 px por cm.
  for (let mm = 0; mm <= 200; mm += 5) {
    const y = 840 - 20 - mm * 4;
    const major = mm % 10 === 0;
    g.fillRect(0, y - 1, major ? 30 : 16, 2);
    if (major && mm % 20 === 0) g.fillText(String(mm / 10), 34, y + 8);
  }
  g.fillStyle = '#c0392b';
  g.fillRect(0, 840 - 20 - 100 * 4 - 2, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e7dccb';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(120,100,80,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Máscara del hollín: mancha irregular más densa en el centro de la base (no un disco perfecto). */
function sootTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  // En la LatheGeometry, la coordenada v recorre el perfil (centro → borde).
  // Con flipY, la parte superior del lienzo corresponde al borde de la cápsula (v = 1) y la inferior al centro de la base.
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#101010');
  grd.addColorStop(0.45, '#c8c8c8');
  grd.addColorStop(1, '#ffffff');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // Irregularidad en franjas horizontales (iguales en todo el contorno: sin costura en la malla de revolución).
  for (let y = 0; y < 70; y += 3) {
    g.fillStyle = `rgba(0,0,0,${((y * 37) % 11) / 30})`;
    g.fillRect(0, y, 128, 2);
  }
  return new THREE.CanvasTexture(c);
}

export const GAS_TAP_Z = GAS_TAP.z;
