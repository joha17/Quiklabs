/**
 * Vistas 3D procedurales de la Práctica 9 (§4, §13): tubos con líquido, suspensión y sedimento (blanco del SrSO₄,
 * pardo del Fe(OH)₃) a la altura que calcula el dominio, gradilla, centrífuga con tapa y rotor que gira, campana de
 * extracción TRIDIMENSIONAL (paredes, mampara a su altura real, conducto, indicador de extracción y regulador de luz
 * LOCAL que solo oscurece su interior), emisor con la llama virtual coloreada por el espectro calculado, asa de nicromio,
 * vidrio de reloj virtual (con su fisura) y portamuestras refractario, goteros, pipeta, balanza y turbidímetro.
 * SOLO leen el estado: nunca deciden qué precipitó ni qué color tiene la llama.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { P09Object, P09World } from '../../simulation/cation-analysis-world/types';
import { GEO09, type VesselShape09 } from '../../simulation/cation-analysis-world/geometry';
import { flameView, flowStatus, levels09, sashOK, vesselMl } from '../../simulation/cation-analysis-world/world';
import { massG, volumeMl } from '../../simulation/cation-analysis-world/species';
import { quantize } from '../../simulation/metrology/uncertainty';
import type { QualityLevel } from '../quality';
import { liquidMaterial, materials } from '../renderers/materials';
import { labelTexture, lcdTexture } from '../renderers/textures';
import type { FrameCtx09 } from './CationLab3D';
import { RIM_Z } from './layout';
import { rackSlot } from '../../practices/practice-09/definition';

export interface ObjHandle09 {
  group: THREE.Group;
  update(ctx: FrameCtx09, o: P09Object): void;
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

const WATER = 0x9cc8ea;

/** Tinte del líquido: amarillo pálido con Fe³⁺ disuelto (observación, no medida). */
function liquidTint(ctx: FrameCtx09, id: string): number {
  const v = ctx.world.vessels[id];
  if (!v) return WATER;
  const fe = (v.liq['Fe3+'] ?? 0) / Math.max(vesselMl(v) / 1000, 1e-9);
  return fe > 0.005 ? 0xe8d48a : WATER;
}

function labelPlane(lines: string[], w: number, h: number, own: Own, band = '#123a63') {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(lines, { band, w: 256, h: 96 })), roughness: 0.6 })));
}

function dynamicLabel(w: number, h: number, own: Own, band = '#123a63') {
  const mat = own(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  let last = '';
  return {
    mesh,
    set(text: string) {
      if (text === last) return;
      last = text;
      mat.map?.dispose();
      mat.map = text ? labelTexture(text.split('\n'), { band, w: 256, h: 96 }) : null;
      mesh.visible = !!text;
      mat.needsUpdate = true;
    },
    dispose() {
      mat.map?.dispose();
    },
  };
}

function lcd(w: number, h: number, own: Own, px = [256, 80] as [number, number]) {
  const t = lcdTexture(px[0], px[1]);
  own(t.texture);
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshBasicMaterial({ map: t.texture }))), set: t.set };
}

export function createObjVisual09(o: P09Object, w0: P09World, q: QualityLevel, labelText = ''): ObjHandle09 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture | { dispose(): void }> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle09['update'] = () => undefined;
  const id = o.id;
  const own: Own = (m) => {
    disposables.push(m);
    return m;
  };
  const tiltable = new THREE.Group();
  group.add(tiltable);
  const vessel0 = w0.vessels[id];

  /**
   * Recipiente cilíndrico de vidrio: líquido recortado por el plano del nivel del dominio, nube de suspensión y
   * sedimento (sólido compacto) con el color del sólido que más hay.
   */
  const glassVessel = (shape: VesselShape09, r: number, h: number, floor: number, opts: { mat?: THREE.Material; label?: boolean; round?: boolean } = {}) => {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.1, r + 0.1, h - (opts.round ? r : 0), seg, 1, true), opts.mat ?? mats.glass);
    glass.position.y = (h + (opts.round ? r : 0)) / 2;
    glass.renderOrder = 3;
    tiltable.add(glass);
    if (opts.round) {
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(r + 0.1, seg, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), opts.mat ?? mats.glass);
      bottom.position.y = r;
      tiltable.add(bottom);
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const liqMat = own(liquidMaterial(WATER, 0.55, [plane]));
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.03, r - 0.03, h, seg), liqMat);
    liq.position.y = h / 2;
    liq.renderOrder = 2;
    const cloudMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [plane] }));
    const cloud = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.05, r - 0.05, h, seg), cloudMat);
    cloud.position.y = h / 2;
    cloud.renderOrder = 2;
    const pelletMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
    const pellet = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.6, 1, seg), pelletMat);
    tiltable.add(liq, cloud, pellet);
    tiltable.add(at(hit(new THREE.CylinderGeometry(r + 0.5, r + 0.5, h + 0.6, 10), id), 0, (h + 0.6) / 2, 0));
    ring = selRing(r + 0.9);
    group.add(ring);
    const wp = new THREE.Vector3();
    return (ctx: FrameCtx09) => {
      const v = ctx.world.vessels[id];
      if (!v) return;
      tiltable.getWorldPosition(wp);
      const lv = levels09(ctx.world, id);
      const dz = wp.y - (ctx.world.objects[id]?.pose.z ?? 0);
      plane.constant = lv.surface + dz;
      const has = vesselMl(v) > 0.005;
      liq.visible = has;
      cloud.visible = has;
      liqMat.color.setHex(liquidTint(ctx, id));
      liqMat.emissive.copy(liqMat.color);
      const fe = v.solid['FeOH3(s)'] ?? 0;
      const sr = v.solid['SrSO4(s)'] ?? 0;
      const solidColor = fe * 107 > sr * 184 ? 0x8a4b1e : 0xf4f4f0;
      // Suspensión: turbidez visible proporcional a la masa suspendida (g) por volumen; 1 mg en 3 mL ya se ve.
      const ml = Math.max(vesselMl(v), 0.01);
      const suspG = (v.solid['FeOH3(s)'] ?? 0) * 106.9 * (v.suspended['FeOH3(s)'] ?? 1) + (v.solid['SrSO4(s)'] ?? 0) * 183.7 * (v.suspended['SrSO4(s)'] ?? 1);
      cloudMat.color.setHex(solidColor);
      cloudMat.opacity = Math.min(0.75, (suspG / ml) * 1500);
      const ph = lv.pellet - lv.floor;
      pellet.visible = ph > 0.02;
      pellet.scale.y = Math.max(0.001, ph);
      pellet.position.y = floor + ph / 2;
      pelletMat.color.setHex(solidColor);
      void shape;
    };
  };

  switch (o.kind) {
    case 'tube': {
      const T = GEO09.tube;
      const upd = glassVessel('tube', T.r, T.h, T.floor, { round: true });
      const lbl = dynamicLabel(1.5, 0.9, own);
      lbl.mesh.position.set(0, T.h - 2.5, T.outerR + 0.02);
      disposables.push(lbl);
      tiltable.add(lbl.mesh);
      update = (ctx) => {
        upd(ctx);
        lbl.set(ctx.world.vessels[id]?.label ?? id);
        // Sacudida visible al agitar (salvo movimiento reducido).
        const v = ctx.world.vessels[id];
        tiltable.rotation.x = v && v.stir01 > 0 && !ctx.reducedMotion ? 0.15 * Math.sin(ctx.t * 30) : 0;
      };
      break;
    }
    case 'cylinder': {
      const C = GEO09.cylinder;
      const upd = glassVessel('cylinder', C.r, C.h, C.floor);
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(C.baseR, C.baseR + 0.2, 0.7, 6), mats.glass));
      base.position.y = 0.35;
      const lbl = labelPlane(['10 mL · 0,2'], 2, 0.8, own);
      lbl.position.set(0, C.h * 0.6, C.outerR + 0.05);
      tiltable.add(base, lbl);
      update = upd;
      break;
    }
    case 'beaker': {
      const B = GEO09.beaker;
      update = glassVessel('beaker', B.r, B.h, B.floor);
      break;
    }
    case 'bottle':
    case 'dropperBottle':
    case 'washBottle': {
      const shape = vessel0?.shape ?? 'bottle';
      const spec = o.kind === 'washBottle' ? { r: GEO09.washBottle.r, h: GEO09.washBottle.h * 0.8, floor: 0.5 } : o.kind === 'dropperBottle' ? GEO09.dropperBottle : GEO09.bottle;
      const mat = o.kind === 'washBottle' ? mats.plasticWhite : o.kind === 'dropperBottle' ? mats.amberGlass : mats.glass;
      const upd = glassVessel(shape, spec.r, spec.h, spec.floor, { mat });
      const capR = o.kind === 'dropperBottle' ? 0.55 : o.kind === 'washBottle' ? 1.3 : 1.2;
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, o.kind === 'dropperBottle' ? 1.6 : 1, 14), o.kind === 'dropperBottle' ? mats.rubberRed : mats.blackPlastic));
      cap.position.y = RIM_Z[shape] + 0.5;
      if (o.kind === 'washBottle') {
        const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 8), mats.plasticWhite));
        tube.position.set(1.8, spec.h + 3, 0);
        tube.rotation.z = -0.7;
        tiltable.add(tube);
      }
      const band = id === 'dbSO4' || id === 'dbOH' ? '#2e7d32' : id === 'dbH2O' ? '#1565c0' : id === 'smp1' ? '#6b2fb3' : '#123a63';
      const lbl = labelPlane(labelText.split('\n'), Math.min(4.6, spec.r * 1.8), spec.r > 2 ? 2.2 : 1.6, own, band);
      lbl.position.set(0, spec.h * 0.45, spec.r + 0.13);
      tiltable.add(cap, lbl, at(hit(new THREE.CylinderGeometry(capR + 0.4, capR + 0.4, 1.8, 10), id, 'cap'), 0, RIM_Z[shape] + 0.5, 0));
      update = (ctx) => {
        upd(ctx);
        cap.visible = ctx.world.vessels[id]?.capped !== false;
      };
      break;
    }
    case 'waste': {
      const R = GEO09.waste;
      const upd = glassVessel('waste', R.r, R.h, R.floor);
      const lbl = labelPlane([labelText || 'Residuos'], 6, 2.2, own, o.label === 'sol' ? '#6d4c41' : '#1565c0');
      lbl.position.set(0, R.h * 0.72, R.r + 0.2);
      tiltable.add(lbl);
      update = upd;
      break;
    }
    case 'cleanCup': {
      const C = GEO09.cleanCup;
      const upd = glassVessel('cleanCup', C.r, C.h, 0.3, { mat: mats.porcelain });
      const lbl = labelPlane(['Limpieza del asa'], 4.4, 1, own, '#455a64');
      lbl.position.set(0, C.h + 1.2, 0);
      tiltable.add(lbl);
      update = upd;
      break;
    }
    case 'rack': {
      const R = GEO09.rack;
      const mat = own(new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.6 }));
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.6, R.d), mat));
      top.position.y = R.h;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.5, R.d), mat));
      base.position.y = 0.25;
      for (const x of [-R.w / 2 + 0.4, R.w / 2 - 0.4]) group.add(at(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, R.h, R.d), mat)), x, R.h / 2, 0));
      for (let i = 0; i < R.slots; i++) {
        const s = rackSlot(i);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(GEO09.tube.outerR + 0.15, 16), own(new THREE.MeshBasicMaterial({ color: 0x4a5560 })));
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(s.x - o.pose.x, R.h + 0.31, -(s.y - o.pose.y));
        group.add(hole);
      }
      group.add(top, base, at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id), 0, R.h / 2, 0));
      break;
    }
    case 'pipette': {
      const P = GEO09.pipette;
      const inner = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(P.r, 0.08, P.length * 0.85, 10, 1, true), mats.glass);
      barrel.position.y = (P.length * 0.85) / 2;
      const bulb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), mats.rubberRed));
      bulb.scale.set(1, 1.5, 1);
      bulb.position.y = P.length * 0.85 + 1.2;
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.75, depthWrite: false }));
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(P.r - 0.05, P.r - 0.05, 1, 10), liqMat);
      inner.add(barrel, bulb, liq, at(hit(new THREE.CylinderGeometry(0.8, 0.8, P.length, 8), id), 0, P.length / 2, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const ml = volumeMl(ctx.world.pipette.content);
        const hh = (ml / 5) * P.length * 0.7;
        liq.visible = hh > 0.02;
        liq.scale.y = Math.max(0.001, hh);
        liq.position.y = 1 + hh / 2;
        bulb.scale.set(ctx.world.pipette.squeeze01 !== 0 ? 0.8 : 1, ctx.world.pipette.squeeze01 !== 0 ? 1.2 : 1.5, 1);
        inner.rotation.set(0, 0, ob.support === 'bench' ? -Math.PI / 2 : 0);
      };
      break;
    }
    case 'loop': {
      // Asa de nicromio: mango, varilla y aro; incandescente al calentarse (temperatura del dominio).
      const L = GEO09.loop;
      const inner = new THREE.Group();
      const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, L.length * 0.45, 10), own(new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.6 }))));
      handle.position.y = L.length * 0.75;
      const wireMat = own(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.3, emissive: 0xff5a1f, emissiveIntensity: 0 }));
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L.length * 0.5, 6), wireMat);
      wire.position.y = L.length * 0.27;
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 16), wireMat);
      ringM.position.y = 0.2;
      inner.add(handle, wire, ringM, at(hit(new THREE.CylinderGeometry(0.8, 0.8, L.length, 8), id), 0, L.length / 2, 0));
      group.add(inner);
      update = (ctx, ob) => {
        wireMat.emissiveIntensity = Math.max(0, Math.min(2, (ctx.world.loop.tempC - 200) / 300));
        inner.rotation.set(0, 0, ob.support === 'bench' ? -Math.PI / 2 : 0);
        inner.position.y = ob.support === 'bench' ? 0.4 : 0;
      };
      break;
    }
    case 'watchGlass':
    case 'refractoryCup': {
      const glass = o.kind === 'watchGlass';
      const G = glass ? GEO09.watchGlass : GEO09.refractoryCup;
      const body = shadowed(glass
        ? new THREE.Mesh(new THREE.SphereGeometry(G.r * 1.6, seg, 8, 0, Math.PI * 2, Math.PI * 0.82, Math.PI * 0.18), mats.glass)
        : new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r * 0.8, G.h, seg), own(new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.9 }))));
      if (glass) {
        body.rotation.x = Math.PI;
        body.position.y = G.r * 1.6;
      } else body.position.y = G.h / 2;
      const filmMat = own(new THREE.MeshBasicMaterial({ color: 0xa8d0ee, transparent: true, opacity: 0.5 }));
      const film = new THREE.Mesh(new THREE.CircleGeometry(G.r * 0.55, 20), filmMat);
      film.rotation.x = -Math.PI / 2;
      film.position.y = glass ? 0.32 : G.h + 0.02;
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(G.r * 1.6, 0.08), own(new THREE.MeshBasicMaterial({ color: 0x222222 })));
      crack.rotation.set(-Math.PI / 2, 0, 0.6);
      crack.position.y = 0.4;
      // Rótulo permanente del modo virtual (§4.1, §10).
      const tag = labelPlane(glass ? ['Representación virtual'] : ['Refractario'], 4.2, 0.8, own, glass ? '#b71c1c' : '#5d4037');
      tag.rotation.x = -Math.PI / 2;
      tag.position.set(0, 0.05, G.r + 1);
      group.add(body, film, crack, tag, at(hit(new THREE.CylinderGeometry(G.r + 0.3, G.r + 0.3, 1.4, 12), id), 0, 0.7, 0));
      ring = selRing(G.r + 0.8);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.vessels[id];
        film.visible = !!v && (vesselMl(v) > 0.005 || massG(v.solid) > 1e-8);
        filmMat.color.setHex(v && vesselMl(v) > 0.005 ? 0xa8d0ee : 0xe8e2d0);
        crack.visible = glass && ctx.world.flame.glassCracked;
      };
      break;
    }
    case 'emitter': {
      // Emisor tipo Bunsen VIRTUAL con rejilla: la llama toma el color del espectro calculado (flameView).
      const E = GEO09.emitter;
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(E.r, E.r + 0.4, 1, 18), mats.darkMetal));
      base.position.y = 0.5;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, E.h - 2, 12), mats.chrome));
      tube.position.y = (E.h - 2) / 2 + 1;
      const grid = shadowed(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.15, 6, 20), mats.steel));
      grid.rotation.x = Math.PI / 2;
      grid.position.y = E.padZ - 0.2;
      // Color del espectro calculado (sRGB codificado), sin tono de la escena ni contorno: la llama no es un sólido.
      const flameMat = own(new THREE.MeshBasicMaterial({ color: 0x6aa0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 16, 1, true), flameMat);
      flame.position.y = E.h + 3.5;
      flame.renderOrder = 6;
      const coreMat = own(new THREE.MeshBasicMaterial({ color: 0x3a6dff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5, 12, 1, true), coreMat);
      core.position.y = E.h + 1.3;
      core.renderOrder = 7;
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 12), mats.rubberRed));
      knob.rotation.z = Math.PI / 2;
      knob.position.set(E.r + 0.6, 0.8, 0);
      const tag = labelPlane(['Llama VIRTUAL'], 4, 0.9, own, '#b71c1c');
      tag.position.set(0, 1.6, E.r + 0.45);
      group.add(base, tube, grid, flame, core, knob, tag);
      group.add(at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'ignite'), E.r + 0.6, 0.8, 0), at(hit(new THREE.CylinderGeometry(E.r, E.r, E.h, 10), id), 0, E.h / 2, 0));
      ring = selRing(E.r + 1);
      group.add(ring);
      update = (ctx) => {
        const lit = ctx.world.flame.ignited;
        const view = flameView(ctx.world);
        flame.visible = lit;
        core.visible = lit;
        if (!lit) return;
        // Llama sola (azul) mezclada con el color de la muestra según su contraste: lo mismo que se registra al observar.
        const k = Math.min(1, view.contrast * 1.4);
        const sm = Math.max(view.sampleRgb.r, view.sampleRgb.g, view.sampleRgb.b, 1e-6);
        flameMat.color.setRGB(view.rgb.r * (1 - k) + (view.sampleRgb.r / sm) * k, view.rgb.g * (1 - k) + (view.sampleRgb.g / sm) * k, view.rgb.b * (1 - k) + (view.sampleRgb.b / sm) * k, THREE.SRGBColorSpace);
        flameMat.opacity = 0.35 + 0.5 * Math.min(1, view.contrast + 0.1);
        coreMat.opacity = 0.55;
        const flick = ctx.reducedMotion ? 1 : 1 + 0.06 * Math.sin(ctx.t * 23) + 0.04 * Math.sin(ctx.t * 37);
        // La extracción cambia la forma aparente de la llama, nunca su composición (§6.3).
        flame.scale.set(1, flick * (flowStatus(ctx.world) === 'valid' ? 1 : 0.7), 1);
      };
      break;
    }
    case 'hood': {
      // Campana de extracción 3D (§4): paredes, superficie, mampara a su altura real, conducto, indicador y luz local.
      const H = GEO09.hood;
      const W = H.x1 - H.x0;
      const D = H.depth;
      const wallMat = own(new THREE.MeshStandardMaterial({ color: 0x9fb0bb, roughness: 0.6, side: THREE.DoubleSide }));
      const inMat = own(new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.8, side: THREE.DoubleSide }));
      const back = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(W, 90), inMat));
      back.position.set(0, 45, -30);
      const left = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 95, D), wallMat));
      left.position.set(-W / 2, 47, 0);
      const right = left.clone();
      right.position.x = W / 2;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W + 2, 3, D), wallMat));
      top.position.set(0, 95, 0);
      const duct = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 60, 20), wallMat));
      duct.position.set(0, 125, -12);
      const floorM = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, D - 2), own(new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.9 })));
      floorM.rotation.x = -Math.PI / 2;
      floorM.position.y = 0.05;
      const sash = new THREE.Mesh(new THREE.BoxGeometry(W - 4, 50, 0.6), own(new THREE.MeshPhysicalMaterial({ color: 0xd8ecf6, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false })));
      sash.renderOrder = 4;
      const sashFrame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W - 4, 2, 1.2), mats.darkMetal));
      // Consola de control al frente, a la altura de la mesada (visible desde las estaciones B y C), siempre
      // iluminada: la luz local de observación no la oscurece (§4, §14).
      const cx = -W / 2 + 24;
      const cz = D / 2 - 5;
      const consoleBox = shadowed(new THREE.Mesh(new RoundedBoxGeometry(30, 4, 7, 2, 0.6), mats.darkMetal));
      consoleBox.position.set(cx, 2, cz);
      const panel = lcd(11, 3.4, own, [352, 108]);
      panel.mesh.rotation.x = -0.9;
      panel.mesh.position.set(cx - 7, 4.15, cz + 1.2);
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x3bff59 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), ledMat);
      led.position.set(cx - 14, 4.4, cz + 1.2);
      const btn = (x: number, m: THREE.Material) => at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.6, 1, 2.2, 2, 0.3), m)), cx + x, 4.4, cz + 1.4);
      const bFan = btn(1, mats.plasticBlue);
      const bUp = btn(4.5, mats.blackPlastic);
      const bDown = btn(8, mats.blackPlastic);
      const bLight = btn(12, mats.plasticYellow);
      const lbl = labelPlane(['EXTRAC.   ▲  ▼ MAMPARA   LUZ'], 15, 1.4, own, '#263238');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(cx + 6.5, 4.05, cz + 3.1);
      const note = labelPlane(['Llama y vidrio de reloj: representación VIRTUAL.', 'No reproducir fuera del simulador.'], 44, 4, own, '#b71c1c');
      note.position.set(0, 42, -29.8);
      group.add(back, left, right, top, duct, floorM, sash, sashFrame, consoleBox, panel.mesh, led, bFan, bUp, bDown, bLight, lbl, note);
      const hb = (x: number, part: string) => group.add(at(hit(new THREE.BoxGeometry(3.2, 2, 3), id, part), cx + x, 4.4, cz + 1.4));
      hb(1, 'fan');
      hb(4.5, 'sashUp');
      hb(8, 'sashDown');
      hb(12, 'light');
      group.add(at(hit(new THREE.BoxGeometry(30, 4, 7), id), cx, 2, cz));
      update = (ctx) => {
        const w = ctx.world;
        const st = flowStatus(w);
        ledMat.color.setHex(st === 'valid' ? 0x3bff59 : st === 'low' ? 0xffb300 : 0xff3b30);
        panel.set(st === 'valid' ? 'OK' : st === 'low' ? 'BAJO' : 'OFF', st === 'valid' ? '#6ef08a' : '#f0c36e', `mampara ${Math.round(w.hood.sashCm)} cm ${sashOK(w) ? '' : '▲'} · luz ${w.hood.lightPct} %`);
        const sy = 6 + w.hood.sashCm;
        sash.position.set(0, sy + 25, D / 2 - 1);
        sashFrame.position.set(0, sy, D / 2 - 1);
        // Solo el interior de la campana se oscurece; la sala, el HUD y la señalización no cambian.
        const k = w.hood.lightPct / 100;
        inMat.color.setRGB(0.81 * (0.25 + 0.75 * k), 0.85 * (0.25 + 0.75 * k), 0.86 * (0.25 + 0.75 * k));
      };
      break;
    }
    case 'centrifuge': {
      const C = GEO09.centrifuge;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(C.w, C.h * 0.6, C.d, 3, 1.2), mats.enamel));
      body.position.y = (C.h * 0.6) / 2;
      const well = new THREE.Mesh(new THREE.CylinderGeometry(C.rotorR + 1, C.rotorR + 1, 0.2, 32), own(new THREE.MeshStandardMaterial({ color: 0x263238 })));
      well.position.y = C.h * 0.6 + 0.05;
      const rotor = new THREE.Group();
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(C.rotorR, C.rotorR, 1, 32), mats.steel));
      rotor.add(disc);
      for (let i = 0; i < C.slots; i++) {
        const a = (i * Math.PI) / 2;
        const holder = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.2, 12), mats.darkMetal);
        holder.position.set(Math.cos(a) * 4.5, 0.6, -Math.sin(a) * 4.5);
        rotor.add(holder);
      }
      rotor.position.y = C.h * 0.6;
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, C.h * 0.6, -C.d / 2);
      const lid = shadowed(new THREE.Mesh(new RoundedBoxGeometry(C.w - 1, 1.2, C.d - 1, 2, 0.5), own(new THREE.MeshPhysicalMaterial({ color: 0xb0bec5, transparent: true, opacity: 0.55, roughness: 0.2 }))));
      lid.position.set(0, 0.6, (C.d - 1) / 2);
      lidPivot.add(lid);
      const scr = lcd(9, 3, own, [288, 96]);
      scr.mesh.position.set(-4, C.h * 0.35, C.d / 2 + 0.05);
      const bLid = at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(3, 1.6, 0.8, 2, 0.3), mats.plasticBlue)), 5, C.h * 0.4, C.d / 2 + 0.3);
      const bSpin = at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(3, 1.6, 0.8, 2, 0.3), mats.rubberRed)), 9.5, C.h * 0.4, C.d / 2 + 0.3);
      const lbl = labelPlane(['TAPA   GIRAR'], 8, 1, own, '#263238');
      lbl.position.set(7.2, C.h * 0.22, C.d / 2 + 0.05);
      group.add(body, well, rotor, lidPivot, scr.mesh, bLid, bSpin, lbl);
      group.add(at(hit(new THREE.BoxGeometry(3.6, 2.2, 1.4), id, 'lid'), 5, C.h * 0.4, C.d / 2 + 0.3), at(hit(new THREE.BoxGeometry(3.6, 2.2, 1.4), id, 'spin'), 9.5, C.h * 0.4, C.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(C.w, C.h * 0.6, C.d), id), 0, (C.h * 0.6) / 2, 0));
      ring = selRing(17);
      group.add(ring);
      update = (ctx) => {
        const c = ctx.world.centrifuge;
        lidPivot.rotation.x = c.lidClosed ? 0 : -1.25;
        if (!ctx.reducedMotion) rotor.rotation.y += (c.rpm / 60) * 2 * Math.PI * ctx.dt * 0.05;
        scr.set(`${Math.round(c.rpm)}`, c.rpm > 1 ? '#f0c36e' : '#6ef08a', c.spinUntil !== null ? `rpm · ${Math.max(0, Math.round(c.spinUntil - ctx.world.timeS))} s` : 'rpm');
      };
      break;
    }
    case 'balance': {
      const B = GEO09.balance;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(B.w, 7.4, B.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }))));
      body.position.set(0, 3.7, 0);
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.pan / 2, B.pan / 2, 0.3, 32), mats.steel));
      pan.position.set(0, B.panZ - 0.15, -1);
      const scr = lcd(10, 2.4, own, [320, 80]);
      scr.mesh.position.set(-3, 3.2, B.d / 2 + 0.32);
      const btn = (x: number, m: THREE.Material) => at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.6, 2, 0.2), m)), x, 3.2, B.d / 2 + 0.4);
      const lbl = labelPlane(['ON/OFF    TARA'], 6.4, 1.1, own, '#3a4652');
      lbl.position.set(6, 1.2, B.d / 2 + 0.35);
      group.add(body, pan, scr.mesh, btn(5, mats.rubberRed), btn(8, mats.plasticBlue), lbl);
      group.add(at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'power'), 5, 3.2, B.d / 2 + 0.4), at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'tare'), 8, 3.2, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(11, 3, 1.4), id, 'display'), -3, 3.2, B.d / 2 + 0.3), at(hit(new THREE.BoxGeometry(B.w, 7.4, B.d), id), 0, 3.7, 0));
      ring = selRing(14);
      group.add(ring);
      update = (ctx) => {
        const b = ctx.world.balance;
        const p = ctx.world.params.balance;
        if (!b.powered) scr.set('', '#1b2a20');
        else scr.set(quantize(b.shownG, p.resolutionG).toFixed(2), b.stable ? '#6ef08a' : '#f0c36e', b.stable ? 'g  ●' : 'g  ~');
      };
      break;
    }
    case 'turbidimeter': {
      const T = GEO09.turbidimeter;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(T.w, T.h, T.d, 3, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.5 }))));
      body.position.y = T.h / 2;
      const slot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 14), own(new THREE.MeshBasicMaterial({ color: 0x111111 })));
      slot.position.y = T.h + 0.05;
      const scr = lcd(7, 2.2, own);
      scr.mesh.position.set(0, T.h * 0.55, T.d / 2 + 0.05);
      const b = at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.2, 0.6, 2, 0.2), mats.plasticYellow)), 4.5, T.h * 0.25, T.d / 2 + 0.3);
      group.add(body, slot, scr.mesh, b, at(hit(new THREE.BoxGeometry(3, 1.8, 1.2), id, 'read'), 4.5, T.h * 0.25, T.d / 2 + 0.3), at(hit(new THREE.BoxGeometry(T.w, T.h, T.d), id), 0, T.h / 2, 0));
      update = (ctx) => {
        const last = [...ctx.world.readingOrder].reverse().map((rid) => ctx.world.readings[rid]).find((r) => r.kind === 'turbidity');
        scr.set(last ? `${last.value}` : '---', '#6ef08a', 'UT (u. arbitrarias)');
      };
      break;
    }
    case 'spectroCam': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(9, 7, 7, 3, 0.6), mats.darkMetal));
      body.position.y = 3.5;
      const lens = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 16), mats.blackPlastic));
      lens.rotation.z = Math.PI / 2;
      lens.position.set(-5, 4, 0);
      const scr = lcd(7, 2.2, own);
      scr.mesh.position.set(0, 5, 3.55);
      const bRead = at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.1, 0.6, 2, 0.2), mats.plasticBlue)), -2, 1.8, 3.6);
      const bGain = at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.1, 0.6, 2, 0.2), mats.blackPlastic)), 2, 1.8, 3.6);
      group.add(body, lens, scr.mesh, bRead, bGain);
      group.add(at(hit(new THREE.BoxGeometry(3, 1.6, 1.2), id, 'read'), -2, 1.8, 3.6), at(hit(new THREE.BoxGeometry(3, 1.6, 1.2), id, 'gain'), 2, 1.8, 3.6), at(hit(new THREE.BoxGeometry(9, 7, 7), id), 0, 3.5, 0));
      update = (ctx) => {
        const last = [...ctx.world.readingOrder].reverse().map((rid) => ctx.world.readings[rid]).find((r) => r.kind === 'spectrum');
        scr.set(last ? `${last.value} líneas` : 'ESPECTRO', last && !last.valid ? '#f06e6e' : '#6ef08a', 'vista espectral virtual');
      };
      break;
    }
    case 'ppeTray': {
      const tray = shadowed(new THREE.Mesh(new RoundedBoxGeometry(30, 2, 20, 3, 0.6), mats.plasticWhite));
      tray.position.y = 1;
      const goggles = shadowed(new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.5, 8, 20), own(new THREE.MeshPhysicalMaterial({ color: 0x9ad0f5, transparent: true, opacity: 0.7 }))));
      goggles.scale.set(1.6, 0.8, 1);
      goggles.rotation.x = -Math.PI / 2;
      goggles.position.set(-7, 2.5, -4);
      const gloves = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 1, 8), own(new THREE.MeshStandardMaterial({ color: 0x5c6bc0, roughness: 0.7 }))));
      gloves.position.set(5, 2.5, -4);
      const poster = labelPlane(['EPP: gafas · bata · guantes'], 18, 3, own, '#1e8e4e');
      poster.rotation.x = -Math.PI / 2;
      poster.position.set(0, 2.06, 6);
      group.add(tray, goggles, gloves, poster, at(hit(new THREE.BoxGeometry(30, 3, 20), id), 0, 1.5, 0));
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
      const p = ob.pose;
      group.position.set(p.x, p.z, -p.y);
      group.rotation.set(0, 0, 0);
      tiltable.rotation.set(tiltable.rotation.x, 0, -p.rotationRad);
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
