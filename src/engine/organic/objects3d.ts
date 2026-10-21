/**
 * Vistas 3D procedurales de la Práctica 8 (§14.1): vidrio con perfil de torno (balón, Erlenmeyer, embudo de
 * separación, kitasato, probetas, viales), líquidos recortados por planos horizontales a la altura que calcula el
 * dominio (fase de abajo, interfase y fase de arriba, emulsión, color por composición), cristales y desecante, placa
 * con baño, baño de hielo, condensador con su agua, Büchner con papel, estufa, módulo de fracciones, analizador,
 * aparato de punto de fusión, balanza, termómetro digital y mechero. SOLO leen el estado: nunca deciden que algo
 * reaccionó, se separó o se secó.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Mol, P08Object, P08World, SpeciesId, Vessel08 } from '../../simulation/organic-world/types';
import { GEO08, type VesselShape08 } from '../../simulation/organic-world/geometry';
import { levels08, phasesOf, pressureKPa, vesselMl } from '../../simulation/organic-world/world';
import { SPECIES, liquidMl, massG } from '../../simulation/organic-chemistry/species';
import { quantize } from '../../simulation/metrology/uncertainty';
import type { QualityLevel } from '../quality';
import { liquidMaterial, materials } from '../renderers/materials';
import { graduationTexture, labelTexture, lcdTexture } from '../renderers/textures';
import type { FrameCtx08 } from './OrganicLab3D';
import { RIM_Z } from './layout';

export interface ObjHandle08 {
  group: THREE.Group;
  update(ctx: FrameCtx08, o: P08Object): void;
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
type Profile = Array<[number, number]>;

const AQ = 0x8fc2e6;

/** Color de una fase según su composición (no es una medición: es lo que se vería). */
export function phaseColor(m: Mol): number {
  const g = massG(m);
  if (g <= 0) return AQ;
  const f = (s: SpeciesId) => ((m[s] ?? 0) * SPECIES[s].molarMass) / g;
  if (f('H2O') > 0.5) return f('NaSal') > 0.01 ? 0xbfd8ea : AQ;
  if (f('IAAc') + f('IAA') > 0.4) return 0xf4e7b0;
  if (f('MeSal') > 0.4) return 0xf1e9cc;
  if (f('MeOH') > 0.4) return 0xe6eef2;
  return 0xefe9d6;
}

/** Perfiles interiores (radio, altura sobre la base) de cada forma: el vidrio y el líquido usan el mismo. */
export function profileOf(shape: VesselShape08): Profile {
  const G = GEO08;
  const cyl = (r: number, h: number, floor = 0.3): Profile => [[0.01, floor], [r, floor], [r, h]];
  switch (shape) {
    case 'roundFlask': {
      const R = G.roundFlask.bulbH / 2;
      const pts: Profile = [];
      for (let i = 0; i <= 14; i++) {
        const a = -Math.PI / 2 + (i / 14) * (Math.PI - 0.32);
        pts.push([Math.max(0.01, R * Math.cos(a)), G.roundFlask.floor + R + R * Math.sin(a)]);
      }
      pts.push([G.roundFlask.neckR, G.roundFlask.bulbH + 0.9], [G.roundFlask.neckR, G.roundFlask.h]);
      return pts;
    }
    case 'erlenmeyer': {
      const E = G.erlenmeyer;
      return [[0.01, E.floor], [E.r, E.floor], [E.r * 0.95, E.floor + 1], [E.mouthR, E.h * 0.72], [E.mouthR, E.h]];
    }
    case 'sepFunnel': {
      const F = G.sepFunnel;
      return [[0.12, -F.stemLen], [0.18, 0], [0.5, 0.6], [F.r * 0.8, 6], [F.r, 9.5], [F.r * 0.8, 12.5], [1.0, 14], [1.0, F.h]];
    }
    case 'kitasato': {
      const K = G.kitasato;
      return [[0.01, K.floor], [K.r, K.floor], [K.r * 0.95, K.floor + 1], [1.6, K.h * 0.7], [1.6, K.h]];
    }
    case 'filterPaper': return [[0.01, 0.05], [G.filterPaper.r, 0.05], [G.filterPaper.r, 1.2]];
    case 'watchGlass': return [[0.01, 0.1], [G.watchGlass.r * 0.8, 0.5], [G.watchGlass.r, 0.8]];
    case 'beaker50': return cyl(G.beaker50.r, G.beaker50.h, G.beaker50.floor);
    case 'beaker100': return cyl(G.beaker100.r, G.beaker100.h, G.beaker100.floor);
    case 'cyl10': return cyl(G.cyl10.r, G.cyl10.h, G.cyl10.floor);
    case 'cyl25': return cyl(G.cyl25.r, G.cyl25.h, G.cyl25.floor);
    case 'vial': return cyl(G.vial.r, G.vial.h, G.vial.floor);
    case 'bottle250': return cyl(G.bottle250.r, G.bottle250.h, G.bottle250.floor);
    case 'bottle100': return cyl(G.bottle100.r, G.bottle100.h, G.bottle100.floor);
    case 'dropperBottle': return cyl(G.dropperBottle.r, G.dropperBottle.h, G.dropperBottle.floor);
    case 'jar': return cyl(G.jar.r, G.jar.h, G.jar.floor);
    case 'waste': return cyl(G.waste.r, G.waste.h, G.waste.floor);
    case 'plasticCup': return cyl(G.plasticCup.r, G.plasticCup.h, G.plasticCup.floor);
    case 'washBottle': return cyl(G.washBottle.r - 0.3, G.washBottle.h * 0.8, 0.5);
    case 'bath': return cyl(G.bath.r, G.bath.h, G.bath.floor);
    case 'iceBath': return cyl(8, G.iceBath.h, 0.5);
  }
}

const lathe = (p: Profile, seg: number, grow = 0) => new THREE.LatheGeometry(p.map(([r, y]) => new THREE.Vector2(r + grow, y)), seg);

/**
 * Líquido de un recipiente: dos fases recortadas por planos horizontales a las alturas del dominio, y el sólido
 * (cristales o desecante) como un montículo en el fondo. Los planos están en coordenadas del mundo: con el recipiente
 * inclinado el nivel sigue horizontal.
 */
function liquidOf(id: string, profile: Profile, seg: number, own: Own) {
  const top = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const iface = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const ifaceUp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const geo = lathe(profile.map(([r, y]) => [Math.max(0.01, r - 0.04), y] as [number, number]), seg);
  const lowMat = own(liquidMaterial(AQ, 0.6, [iface]));
  const upMat = own(liquidMaterial(0xf4e7b0, 0.55, [top, ifaceUp]));
  const low = new THREE.Mesh(geo, lowMat);
  const up = new THREE.Mesh(geo, upMat);
  low.renderOrder = 2;
  up.renderOrder = 2;
  const solidMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  const floorY = profile[0][1];
  const r0 = Math.max(0.5, Math.min(...profile.filter(([, y]) => y > floorY + 0.3).map(([r]) => r), profile[1][0]) * 0.8);
  const solid = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.7, r0, 1, 14), solidMat);
  const g = new THREE.Group();
  g.add(low, up, solid);
  const wp = new THREE.Vector3();
  return {
    group: g,
    geo,
    set(ctx: FrameCtx08, parent: THREE.Object3D) {
      const w = ctx.world;
      const v = w.vessels[id];
      if (!v) return;
      parent.getWorldPosition(wp);
      const lv = levels08(w, id);
      const o = w.objects[id];
      const dz = wp.y - (o?.pose.z ?? 0);
      const ph = phasesOf(v);
      const has = vesselMl(v) > 0.005;
      const two = ph.twoPhases && liquidMl(ph.top) > 0.01;
      const ifz = two ? lv.interface : lv.surface;
      // Planos: «constant» = −altura con normal hacia abajo (conserva lo de abajo).
      top.constant = lv.surface + dz;
      iface.constant = ifz + dz;
      ifaceUp.constant = -(ifz + dz);
      low.visible = has;
      up.visible = has && two;
      const emul = v.emulsion01;
      lowMat.color.setHex(phaseColor(two ? ph.bottom : v.liq));
      lowMat.emissive.copy(lowMat.color);
      upMat.color.setHex(phaseColor(ph.top));
      upMat.emissive.copy(upMat.color);
      lowMat.opacity = 0.55 + 0.35 * Math.min(1, emul + (massG(v.solid) > 0.05 && v.stir01 > 0.2 ? 0.4 : 0));
      upMat.opacity = 0.5 + 0.35 * emul;
      // Sólido: cristales (blancos), precursor o desecante (grumos al hidratarse).
      const sg = massG(v.solid);
      solid.visible = sg > 0.003;
      if (solid.visible) {
        const hydrated = (v.solid.Na2SO4w ?? 0) > 0.2 * (v.solid.Na2SO4 ?? 1e9);
        solidMat.color.setHex(hydrated ? 0xdce6ec : 0xfafafa);
        const h = Math.min(2.4, 0.1 + Math.cbrt(sg) * 0.45);
        solid.scale.y = h;
        solid.position.y = floorY + h / 2 + (v.stir01 > 0.2 && !ctx.reducedMotion ? 0.04 * Math.sin(ctx.t * 20) : 0);
      }
    },
  };
}

function labelPlane(lines: string[], w: number, h: number, own: Own, band = '#123a63') {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(lines, { band, w: 256, h: 96 })), roughness: 0.6 })));
}

function lcd(w: number, h: number, own: Own, px = [256, 80] as [number, number]) {
  const t = lcdTexture(px[0], px[1]);
  own(t.texture);
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshBasicMaterial({ map: t.texture }))), set: t.set };
}

const fmtC = (c: number) => `${quantize(c, 0.1).toFixed(1)}`;

export function createObjVisual08(o: P08Object, w0: P08World, q: QualityLevel, labelText = ''): ObjHandle08 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture | { dispose(): void }> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle08['update'] = () => undefined;
  const id = o.id;
  const own: Own = (m) => {
    disposables.push(m);
    return m;
  };
  const tiltable = new THREE.Group();
  group.add(tiltable);
  const vessel0: Vessel08 | undefined = w0.vessels[id];

  /** Recipiente de vidrio de torno con su líquido, rótulo y escala opcional. */
  const glassVessel = (shape: VesselShape08, opts: { scale?: THREE.Texture; mat?: THREE.Material; label?: string; band?: string } = {}) => {
    const prof = profileOf(shape);
    const glass = new THREE.Mesh(lathe(prof, seg, 0.1), opts.mat ?? mats.glass);
    glass.renderOrder = 3;
    tiltable.add(glass);
    const liq = liquidOf(id, prof, seg, own);
    disposables.push(liq.geo);
    tiltable.add(liq.group);
    const h = RIM_Z[shape];
    const rMax = Math.max(...prof.map(([r]) => r));
    if (opts.scale) {
      const span = h - prof[0][1];
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(rMax + 0.12, rMax + 0.12, span, seg, 1, true, -Math.PI * 0.22, Math.PI * 0.44), own(new THREE.MeshBasicMaterial({ map: opts.scale, transparent: true, depthWrite: false })));
      sc.position.y = prof[0][1] + span / 2;
      tiltable.add(sc);
    }
    if (opts.label) {
      const lbl = labelPlane(opts.label.split('\n'), Math.min(4.4, rMax * 1.6), 1.6, own, opts.band);
      lbl.position.set(0, Math.max(1, h * 0.35), rMax + 0.16);
      tiltable.add(lbl);
    }
    const minY = Math.min(...prof.map(([, y]) => y));
    tiltable.add(at(hit(new THREE.CylinderGeometry(rMax + 0.5, rMax + 0.5, h - minY + 0.6, 10), id), 0, (h + minY) / 2, 0));
    ring = selRing(rMax + 1);
    group.add(ring);
    return (ctx: FrameCtx08) => liq.set(ctx, tiltable);
  };

  /** Escala de una probeta: divisiones del parámetro del dominio. */
  const cylScale = (shape: 'cyl10' | 'cyl25') => {
    const G = GEO08[shape];
    const area = Math.PI * G.r * G.r;
    const span = G.h - G.floor;
    const div = shape === 'cyl10' ? 0.1 : 0.5;
    const cap = shape === 'cyl10' ? 10 : 25;
    const marks: Array<[number, boolean, string?]> = [];
    for (let i = 0; i * div <= cap * 1.1; i++) {
      const ml = i * div;
      const major = Math.abs(ml % (shape === 'cyl10' ? 1 : 5)) < 1e-6;
      marks.push([ml / area / span, major, major && ml > 0 ? String(Math.round(ml)) : undefined]);
    }
    return own(graduationTexture(marks, '#123a63', { sub: `${cap} mL · ${String(div).replace('.', ',')}` }));
  };

  switch (o.kind) {
    case 'roundFlask': {
      const upd = glassVessel('roundFlask', { label: id === 'fracPot' ? 'Balón\ndestilación' : '50 mL' });
      update = (ctx) => upd(ctx);
      break;
    }
    case 'erlenmeyer':
      update = glassVessel('erlenmeyer', { label: 'Secado' });
      break;
    case 'beaker':
      update = glassVessel(vessel0?.shape ?? 'beaker100', { label: labelText });
      break;
    case 'vial':
      update = glassVessel('vial', { label: labelText });
      break;
    case 'plasticCup':
      update = glassVessel('plasticCup', { mat: mats.plasticWhite, label: labelText });
      break;
    case 'cylinder': {
      const shape = (vessel0?.shape ?? 'cyl10') as 'cyl10' | 'cyl25';
      const G = GEO08[shape];
      const upd = glassVessel(shape, { scale: cylScale(shape) });
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.baseR, G.baseR + 0.2, 0.7, 6), mats.glass));
      base.position.y = 0.35;
      tiltable.add(base);
      update = upd;
      break;
    }
    case 'kitasato': {
      const upd = glassVessel('kitasato', { label: 'Filtrado' });
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 8), mats.glass);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(2.6, GEO08.kitasato.h * 0.8, 0);
      const hose = shadowed(new THREE.Mesh(new THREE.TorusGeometry(6, 0.35, 6, 24, Math.PI * 0.6), mats.rubberRed));
      hose.position.set(8, GEO08.kitasato.h * 0.8 - 2, -3);
      hose.rotation.set(0, 0.8, 0);
      tiltable.add(arm, hose);
      update = upd;
      break;
    }
    case 'sepFunnel': {
      const upd = glassVessel('sepFunnel', { label: '125 mL' });
      const F = GEO08.sepFunnel;
      const plug = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.2, 12), mats.plasticWhite));
      plug.position.y = F.h + 0.5;
      const cock = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.6), mats.plasticBlue));
      cock.position.y = -2.2;
      tiltable.add(plug, cock);
      tiltable.add(at(hit(new THREE.BoxGeometry(3.4, 1.4, 1.6), id, 'valve'), 0, -2.2, 0));
      tiltable.add(at(hit(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 10), id, 'stopper'), 0, F.h + 0.5, 0));
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 1, 6), own(new THREE.MeshBasicMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.8 })));
      tiltable.add(stream);
      update = (ctx) => {
        upd(ctx);
        const v = ctx.world.vessels[id];
        plug.visible = !!v?.stoppered;
        const open = (v?.valve01 ?? 0) > 0.05;
        cock.rotation.y = open ? Math.PI / 2 : 0;
        stream.visible = open && !!v && vesselMl(v) > 0.02;
        stream.scale.y = 6;
        stream.position.y = -F.stemLen - 3;
        // Sacudida visible al agitar (salvo «reducir movimiento»).
        const shake = v && v.stir01 > 0.5 && !ctx.reducedMotion ? 0.25 * Math.sin(ctx.t * 28) : 0;
        tiltable.rotation.x = shake;
        // Aviso visual de presión acumulada (el valor lo calcula el dominio).
        plug.scale.y = pressureKPa(ctx.world) > ctx.world.params.funnelVentKPa ? 1.3 : 1;
      };
      break;
    }
    case 'filterPaper': {
      const P = GEO08.filterPaper;
      const fine = id === 'fpFine';
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r, 0.08, seg), own(new THREE.MeshStandardMaterial({ color: fine ? 0xf7f7f2 : 0xe9e0cc, roughness: 0.95 }))));
      disc.position.y = 0.04;
      const heapMat = own(new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.95 }));
      const heap = new THREE.Mesh(new THREE.CylinderGeometry(P.r * 0.55, P.r * 0.85, 1, 18), heapMat);
      const wet = new THREE.Mesh(new THREE.CircleGeometry(P.r * 0.9, 24), own(new THREE.MeshBasicMaterial({ color: 0x9fc6e4, transparent: true, opacity: 0.45 })));
      wet.rotation.x = -Math.PI / 2;
      wet.position.y = 0.1;
      const tag = labelPlane([fine ? 'Poro fino' : 'Poro grueso'], 2.6, 0.7, own, fine ? '#1e8e4e' : '#8d6e63');
      tag.rotation.x = -Math.PI / 2;
      tag.position.set(0, 0.1, P.r + 0.6);
      tiltable.add(disc, heap, wet, tag, at(hit(new THREE.CylinderGeometry(P.r + 0.3, P.r + 0.3, 1.2, 12), id), 0, 0.6, 0));
      ring = selRing(P.r + 0.8);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.vessels[id];
        if (!v) return;
        const g = massG(v.solid);
        heap.visible = g > 0.01;
        const h = Math.min(1.4, 0.1 + Math.cbrt(g) * 0.5);
        heap.scale.y = h;
        heap.position.y = 0.08 + h / 2;
        wet.visible = massG(v.liq) > 0.02;
        wet.position.y = heap.visible ? 0.1 + h : 0.1;
        (heapMat as THREE.MeshStandardMaterial).color.setHex(massG(v.liq) > 0.05 * Math.max(0.01, g) ? 0xe2ecf2 : 0xfafafa);
      };
      break;
    }
    case 'watchGlass': {
      const G = GEO08.watchGlass;
      const dish = shadowed(new THREE.Mesh(new THREE.SphereGeometry(G.r * 1.6, seg, 8, 0, Math.PI * 2, Math.PI * 0.82, Math.PI * 0.18), mats.glass));
      dish.rotation.x = Math.PI;
      dish.position.y = G.r * 1.6;
      const heapMat = own(new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.9 }));
      const heap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14), heapMat);
      const wet = new THREE.Mesh(new THREE.CircleGeometry(G.r * 0.6, 20), own(new THREE.MeshBasicMaterial({ color: 0xa8d0ee, transparent: true, opacity: 0.5 })));
      wet.rotation.x = -Math.PI / 2;
      wet.position.y = 0.3;
      group.add(dish, heap, wet, at(hit(new THREE.CylinderGeometry(G.r + 0.2, G.r + 0.2, 1.2, 12), id), 0, 0.6, 0));
      ring = selRing(G.r + 0.6);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.vessels[id];
        const g = v ? massG(v.solid) : 0;
        heap.visible = g > 0.002;
        const s = Math.min(1.6, 0.35 + Math.cbrt(g) * 0.9);
        heap.scale.set(s, s * 0.6, s);
        heap.position.y = 0.2 + s * 0.3;
        wet.visible = !!v && liquidMl(v.liq) > 0.01;
      };
      break;
    }
    case 'bottle':
    case 'jar': {
      const shape = vessel0?.shape ?? 'bottle100';
      const prof = profileOf(shape);
      const r = Math.max(...prof.map(([x]) => x));
      const h = prof[prof.length - 1][1];
      const solids = o.kind === 'jar';
      const dropper = shape === 'dropperBottle';
      const amber = !!vessel0 && (dropper || (vessel0.liq.MeOH ?? 0) > 0 || (vessel0.liq.AA ?? 0) > 0);
      const glassMat = amber ? mats.amberGlass : mats.glass;
      const glass = new THREE.Mesh(lathe(prof, seg, 0.1), glassMat);
      glass.renderOrder = 3;
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(solids ? r - 0.2 : dropper ? 0.6 : 1.1, r + 0.1, solids ? 0.4 : 1.6, seg, 1, true), glassMat);
      shoulder.position.y = h + (solids ? 0.2 : 0.8);
      const capR = solids ? r - 0.1 : dropper ? 0.7 : 1.3;
      const capMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, dropper ? 1.4 : 0.9, 16), solids ? mats.blackPlastic : dropper ? mats.blackPlastic : mats.rubberRed));
      const capZ = RIM_Z[shape] + 0.45;
      capMesh.position.y = capZ;
      const lbl = labelPlane(labelText.split('\n'), Math.min(4.6, r * 1.8), solids ? 1.8 : 2.4, own, labelText.includes('⚠') ? '#b71c1c' : '#123a63');
      lbl.position.set(0, h * 0.5, r + 0.14);
      tiltable.add(glass, shoulder, capMesh, lbl);
      const liq = liquidOf(id, prof, seg, own);
      disposables.push(liq.geo);
      tiltable.add(liq.group);
      tiltable.add(at(hit(new THREE.CylinderGeometry(r + 0.4, r + 0.4, h + 2, 10), id), 0, (h + 2) / 2, 0));
      tiltable.add(at(hit(new THREE.CylinderGeometry(capR + 0.4, capR + 0.4, 1.6, 10), id, 'cap'), 0, capZ, 0));
      ring = selRing(r + 1);
      group.add(ring);
      update = (ctx) => {
        liq.set(ctx, tiltable);
        capMesh.visible = !!ctx.world.vessels[id]?.capped;
      };
      break;
    }
    case 'waste': {
      const band = o.label === 'org' ? '#b8860b' : o.label === 'solid' ? '#6d4c41' : o.label === 'acid' ? '#c62828' : '#1565c0';
      const upd = glassVessel('waste', { label: labelText || 'Residuos', band });
      update = upd;
      break;
    }
    case 'washBottle': {
      const W = GEO08.washBottle;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(W.r, W.r + 0.2, W.h * 0.8, seg), mats.plasticWhite));
      body.position.y = W.h * 0.4;
      const capM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 12), mats.plasticBlue));
      capM.position.y = W.h * 0.8 + 0.6;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 8), mats.plasticWhite));
      tube.position.set(1.8, W.h * 0.8 + 3.2, 0);
      tube.rotation.z = -0.7;
      const lbl = labelPlane(['H₂O', 'destilada'], 4, 2, own, '#2f7fd1');
      lbl.position.set(0, W.h * 0.4, W.r + 0.12);
      group.add(body, capM, tube, lbl, at(hit(new THREE.CylinderGeometry(W.r + 0.6, W.r + 0.6, W.h + 2, 10), id), 0, (W.h + 2) / 2, 0));
      break;
    }
    case 'spatula': {
      const L = 16;
      const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, L * 0.55, 10), own(new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.6 }))));
      handle.rotation.z = Math.PI / 2;
      handle.position.x = L * 0.22;
      const blade = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L * 0.45, 0.08, 0.9), mats.steel));
      blade.position.x = -L * 0.27;
      const load = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })));
      load.position.set(-L * 0.42, 0.25, 0);
      const inner = new THREE.Group();
      inner.add(handle, blade, load);
      group.add(inner, at(hit(new THREE.BoxGeometry(L, 1, 1.4), id), 0, 0.3, 0));
      update = (ctx, ob) => {
        const g = massG(ctx.world.spatula.load);
        load.visible = g > 0.001;
        load.scale.setScalar(0.5 + Math.cbrt(g) * 1.2);
        const lying = ob.support === 'bench';
        inner.rotation.set(0, 0, lying ? 0 : Math.PI / 2 - 0.25);
        inner.position.set(lying ? 0 : 0.4, lying ? 0 : L * 0.42, 0);
      };
      break;
    }
    case 'dropper': {
      const len = 12;
      const tipLen = 3;
      const rr = 0.45;
      const inner = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rr + 0.08, rr + 0.08, len - tipLen, 10, 1, true), mats.glass);
      barrel.position.y = tipLen + (len - tipLen) / 2;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.06, tipLen, 8, 1, true), mats.glass);
      tip.position.y = tipLen / 2;
      const bulb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), mats.rubberRed));
      bulb.position.y = len + 0.8;
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: AQ, roughness: 0.05, transparent: true, opacity: 0.75, depthWrite: false }));
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 1, 10), liqMat);
      inner.add(barrel, tip, bulb, liq, at(hit(new THREE.CylinderGeometry(0.8, 0.8, len + 2, 8), id), 0, (len + 2) / 2, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const d = ctx.world.droppers[id];
        const ml = d ? liquidMl(d.content) : 0;
        const hh = ml / (Math.PI * rr * rr);
        liq.visible = hh > 0.02;
        liq.scale.y = Math.max(0.001, hh);
        liq.position.y = tipLen + hh / 2;
        liqMat.color.setHex(d ? phaseColor(d.content) : AQ);
        const sq = d && d.squeeze01 > 0;
        bulb.scale.set(sq ? 0.8 : 1, sq ? 1.2 : 1.5, sq ? 0.8 : 1);
        inner.rotation.set(0, 0, ob.support === 'bench' ? -Math.PI / 2 : 0);
      };
      break;
    }
    case 'thermometer': {
      // Termómetro digital con sonda: la pantalla muestra lo que indica (con su sesgo), no la temperatura real.
      const inner = new THREE.Group();
      const probe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 14, 8), mats.steel));
      probe.position.y = 7;
      const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.6, 4, 1.2, 2, 0.3), mats.plasticYellow));
      head.position.y = 16;
      const scr = lcd(2.1, 1.1, own, [192, 96]);
      scr.mesh.position.set(0, 16.6, 0.62);
      inner.add(probe, head, scr.mesh, at(hit(new THREE.CylinderGeometry(0.7, 0.7, 18, 8), id), 0, 9, 0), at(hit(new THREE.BoxGeometry(2.8, 4.2, 1.6), id, 'display'), 0, 16, 0));
      group.add(inner);
      update = (ctx, ob) => {
        scr.set(fmtC(ctx.world.thermometer.shownC), '#6ef08a', '°C');
        inner.rotation.set(0, 0, ob.support === 'bench' ? -Math.PI / 2 : 0);
        inner.position.y = ob.support === 'bench' ? 0.6 : 0;
      };
      break;
    }
    case 'condenser': {
      // Condensador de reflujo: camisa de agua con el tubo interior y mangueras (azules cuando circula el agua).
      const C = GEO08.condenser;
      const inner = new THREE.Group();
      const jacket = new THREE.Mesh(new THREE.CylinderGeometry(C.r + 0.5, C.r + 0.5, C.h * 0.8, seg, 1, true), mats.glass);
      jacket.position.y = C.h * 0.5;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, C.h, 10, 1, true), mats.glass);
      tube.position.y = C.h / 2;
      const waterMat = own(new THREE.MeshPhysicalMaterial({ color: 0x5aa7e0, transparent: true, opacity: 0.0, depthWrite: false }));
      const water = new THREE.Mesh(new THREE.CylinderGeometry(C.r + 0.42, C.r + 0.42, C.h * 0.78, seg), waterMat);
      water.position.y = C.h * 0.5;
      const hoseMat = own(new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.6 }));
      const hoseIn = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), hoseMat));
      hoseIn.rotation.z = Math.PI / 2;
      hoseIn.position.set(3.2, C.h * 0.18, 0);
      const hoseOut = hoseIn.clone();
      hoseOut.position.y = C.h * 0.82;
      const tap = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mats.plasticBlue));
      tap.position.set(6.4, C.h * 0.18, 0);
      inner.add(jacket, tube, water, hoseIn, hoseOut, tap);
      inner.add(at(hit(new THREE.CylinderGeometry(C.r + 0.9, C.r + 0.9, C.h, 8), id), 0, C.h / 2, 0), at(hit(new THREE.BoxGeometry(2.2, 2.2, 2.2), id, 'water'), 6.4, C.h * 0.18, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const on = ctx.world.reflux.waterOn;
        waterMat.opacity = on ? 0.45 : 0;
        hoseMat.color.setHex(on ? 0x2f7fd1 : 0x9aa4ad);
        const lying = ob.support === 'bench';
        inner.rotation.set(0, 0, lying ? -Math.PI / 2 : 0);
        inner.position.y = lying ? 1 : 0;
      };
      break;
    }
    case 'corkRing': {
      const c = shadowed(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.6, 10, 24), own(new THREE.MeshStandardMaterial({ color: 0xa47448, roughness: 0.9 }))));
      c.rotation.x = Math.PI / 2;
      c.position.y = 0.6;
      group.add(c, at(hit(new THREE.CylinderGeometry(3, 3, 1.2, 12), id), 0, 0.6, 0));
      break;
    }
    case 'funnelRing': {
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 45, 10), mats.steel));
      rod.position.set(0, 22.5, -6);
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(10, 1, 14), mats.darkMetal));
      base.position.set(0, 0.5, -3);
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 6), mats.steel));
      arm.position.set(0, 18, -3);
      const ringM = shadowed(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.25, 8, 24), mats.steel));
      ringM.rotation.x = Math.PI / 2;
      ringM.position.y = 18;
      group.add(rod, base, arm, ringM, at(hit(new THREE.BoxGeometry(2, 45, 2), id), 0, 22.5, -6));
      break;
    }
    case 'plate': {
      // Placa calefactora 25 × 25 cm con agitador: perilla de consigna, ON, agitación y pantalla (consigna y baño).
      const P = GEO08.plate;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(P.w, P.h, P.d, 3, 0.8), mats.enamel));
      body.position.y = P.h / 2;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(P.w - 3, 0.4, P.d - 3), mats.porcelain));
      top.position.y = P.h + 0.2;
      const scr = lcd(8, 2.4, own, [320, 96]);
      scr.mesh.position.set(-4, P.h * 0.55, P.d / 2 + 0.05);
      const knob = (x: number, m: THREE.Material) => at(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), m)), x, P.h * 0.55, P.d / 2 + 0.5);
      const kOn = knob(4, mats.rubberRed);
      const kDown = knob(6.8, mats.blackPlastic);
      const kUp = knob(9.4, mats.blackPlastic);
      const kStir = knob(4, mats.plasticBlue);
      kStir.position.y = P.h * 0.22;
      for (const k of [kOn, kDown, kUp, kStir]) k.rotation.x = Math.PI / 2;
      const lbl = labelPlane(['ON   −   +     °C · AGIT.'], 9, 0.9, own, '#3a4652');
      lbl.position.set(5, P.h * 0.85, P.d / 2 + 0.05);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), own(new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff3b30, emissiveIntensity: 0 })));
      led.position.set(10.5, P.h * 0.22, P.d / 2 + 0.2);
      group.add(body, top, scr.mesh, kOn, kDown, kUp, kStir, lbl, led);
      group.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 1.6), id, 'power'), 4, P.h * 0.55, P.d / 2 + 0.5));
      group.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 1.6), id, 'down'), 6.8, P.h * 0.55, P.d / 2 + 0.5));
      group.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 1.6), id, 'up'), 9.4, P.h * 0.55, P.d / 2 + 0.5));
      group.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 1.6), id, 'stir'), 4, P.h * 0.22, P.d / 2 + 0.5));
      group.add(at(hit(new THREE.BoxGeometry(P.w, P.h, P.d), id), 0, P.h / 2, 0));
      ring = selRing(15);
      group.add(ring);
      update = (ctx) => {
        const pl = ctx.world.plate;
        scr.set(pl.on ? `${Math.round(pl.setpointC)}` : '--', pl.on ? '#f0c36e' : '#555', `consigna °C · agit ${Math.round(pl.stir01 * 100)} %`);
        (led.material as THREE.MeshStandardMaterial).emissiveIntensity = pl.on ? 1.6 : 0;
        kStir.rotation.y = pl.stir01 * 4;
      };
      break;
    }
    case 'bath': {
      // Baño de agua sobre la placa: el agua tiñe de cálido con la temperatura del baño (estado del dominio).
      const B = GEO08.bath;
      // Cubeta de vidrio: el balón sumergido se ve dentro del baño.
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(B.r + 0.3, B.r + 0.1, B.h, seg, 1, true), mats.glass);
      pot.renderOrder = 3;
      pot.position.y = B.h / 2;
      const waterMat = own(new THREE.MeshPhysicalMaterial({ color: AQ, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false }));
      const water = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r, B.h * 0.75, seg), waterMat);
      water.position.y = B.h * 0.375;
      const steamMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      const steam = new THREE.Mesh(new THREE.CylinderGeometry(B.r * 0.8, B.r, 4, 16, 1, true), steamMat);
      steam.position.y = B.h + 2;
      const bar = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.6, 4, 8), mats.plasticWhite));
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 0.6;
      group.add(pot, water, steam, bar, at(hit(new THREE.CylinderGeometry(B.r + 0.4, B.r + 0.4, B.h, 12), id), 0, B.h / 2, 0));
      update = (ctx) => {
        const T = ctx.world.plate.bathTempC;
        const k = Math.max(0, Math.min(1, (T - 25) / 75));
        waterMat.color.setHex(AQ).lerp(new THREE.Color(0xe6b08a), k * 0.5);
        steamMat.opacity = T > 70 && !ctx.reducedMotion ? 0.12 + 0.05 * Math.sin(ctx.t * 2) : 0;
        if (!ctx.reducedMotion) bar.rotation.y += ctx.world.plate.stir01 * ctx.dt * 20;
      };
      break;
    }
    case 'iceBath': {
      const I = GEO08.iceBath;
      const tub = shadowed(new THREE.Mesh(new RoundedBoxGeometry(I.w, I.h, I.d, 3, 1), own(new THREE.MeshPhysicalMaterial({ color: 0xdfeaf3, transparent: true, opacity: 0.55, roughness: 0.2 }))));
      tub.position.y = I.h / 2;
      const water = new THREE.Mesh(new THREE.BoxGeometry(I.w - 1, I.h * 0.6, I.d - 1), own(new THREE.MeshPhysicalMaterial({ color: 0xbfe0f5, transparent: true, opacity: 0.5, depthWrite: false })));
      water.position.y = I.h * 0.3;
      group.add(tub, water);
      for (let k = 0; k < 10; k++) {
        const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mats.ice);
        cube.position.set(((k * 37) % 13) - 6, I.h * 0.6, ((k * 23) % 11) - 5);
        cube.rotation.set(k, k * 0.6, 0);
        group.add(cube);
      }
      group.add(at(hit(new THREE.BoxGeometry(I.w, I.h, I.d), id), 0, I.h / 2, 0));
      ring = selRing(11);
      group.add(ring);
      break;
    }
    case 'buchner': {
      const B = GEO08.buchner;
      const bowl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r * 0.85, B.h, seg, 1, true), mats.porcelain));
      bowl.position.y = B.h / 2;
      const plateM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.r * 0.85, B.r * 0.85, 0.2, seg), mats.porcelain));
      plateM.position.y = 0.2;
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, B.stemLen, 10), mats.porcelain));
      stem.position.y = -B.stemLen / 2;
      const gasket = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.4, 1.4, 14), own(new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }))));
      gasket.position.y = -0.8;
      group.add(bowl, plateM, stem, gasket, at(hit(new THREE.CylinderGeometry(B.r + 0.3, B.r + 0.3, B.h, 12), id), 0, B.h / 2, 0), at(hit(new THREE.BoxGeometry(3.6, 1.8, 3.6), id, 'seal'), 0, -0.8, 0));
      update = (ctx) => {
        gasket.scale.setScalar(ctx.world.filtration.sealed ? 1 : 0.85);
        (gasket.material as THREE.MeshStandardMaterial).color.setHex(ctx.world.filtration.sealed ? 0x1e1e1e : 0x777777);
      };
      break;
    }
    case 'vacuumPump': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(9, 7, 7, 3, 0.8), mats.darkMetal));
      body.position.y = 3.5;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), own(new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x3bff59, emissiveIntensity: 0 })));
      led.position.set(-2.6, 5, 3.6);
      const btn = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2, 1.2, 0.6, 2, 0.2), mats.rubberRed));
      btn.position.set(0.5, 5, 3.6);
      const lbl = labelPlane(['VACÍO'], 4, 1, own, '#3a4652');
      lbl.position.set(0, 2.2, 3.55);
      group.add(body, led, btn, lbl, at(hit(new THREE.BoxGeometry(2.6, 1.8, 1.2), id, 'power'), 0.5, 5, 3.6), at(hit(new THREE.BoxGeometry(9, 7, 7), id), 0, 3.5, 0));
      update = (ctx) => {
        (led.material as THREE.MeshStandardMaterial).emissiveIntensity = ctx.world.filtration.vacuum ? 1.8 : 0;
        if (ctx.world.filtration.vacuum && !ctx.reducedMotion) body.position.x = 0.03 * Math.sin(ctx.t * 60);
      };
      break;
    }
    case 'oven': {
      const O = GEO08.oven;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(O.w, O.h, O.d, 3, 0.8), mats.enamel));
      body.position.y = O.h / 2;
      const cavity = new THREE.Mesh(new THREE.BoxGeometry(O.w - 4, O.h * 0.55, 0.2), own(new THREE.MeshStandardMaterial({ color: 0x26292c, emissive: 0xff7a2a, emissiveIntensity: 0 })));
      cavity.position.set(0, O.h * 0.4, O.d / 2 + 0.02);
      const scr = lcd(7, 2, own, [256, 72]);
      scr.mesh.position.set(-5, O.h * 0.86, O.d / 2 + 0.05);
      const btn = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.6, 2, 0.2), mats.rubberRed));
      btn.position.set(8, O.h * 0.86, O.d / 2 + 0.3);
      group.add(body, cavity, scr.mesh, btn, at(hit(new THREE.BoxGeometry(2.8, 1.8, 1.2), id, 'power'), 8, O.h * 0.86, O.d / 2 + 0.3), at(hit(new THREE.BoxGeometry(O.w, O.h, O.d), id), 0, O.h / 2, 0));
      ring = selRing(17);
      group.add(ring);
      update = (ctx) => {
        const on = ctx.world.oven.on;
        scr.set(on ? `${ctx.world.params.ovenTempC}` : 'OFF', on ? '#f0c36e' : '#555', 'estufa °C');
        (cavity.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.35 : 0;
      };
      break;
    }
    case 'fractionModule': {
      // Módulo de recuperación por fracciones (curricular): corte inferior y superior, progreso y colector.
      const F = GEO08.fractionModule;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(F.w, F.h * 0.45, F.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.5 }))));
      body.position.y = (F.h * 0.45) / 2;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, F.h * 0.55, 12, 1, true), mats.glass);
      column.position.set(-8, F.h * 0.45 + GEO08.roundFlask.h + F.h * 0.2, 0);
      column.scale.y = 0.7;
      const scr = lcd(12, 3, own, [384, 96]);
      scr.mesh.position.set(4, F.h * 0.3, F.d / 2 + 0.05);
      const btns: Array<[string, number, number]> = [['loDown', -10, 0.12], ['loUp', -7.6, 0.12], ['hiDown', -4.4, 0.12], ['hiUp', -2, 0.12], ['run', 12, 0.3]];
      for (const [part, x, yy] of btns) {
        const b = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2, 1.2, 0.6, 2, 0.2), part === 'run' ? mats.rubberRed : mats.blackPlastic));
        b.position.set(x, F.h * yy + 0.6, F.d / 2 + 0.3);
        group.add(b, at(hit(new THREE.BoxGeometry(2.4, 1.6, 1.2), id, part), x, F.h * yy + 0.6, F.d / 2 + 0.3));
      }
      const lbl = labelPlane(['inf − +   sup − +            INICIAR'], 26, 1, own, '#3a4652');
      lbl.position.set(0, F.h * 0.06, F.d / 2 + 0.05);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.2), own(new THREE.MeshBasicMaterial({ color: 0x6ef08a })));
      bar.position.set(4, F.h * 0.18, F.d / 2 + 0.06);
      group.add(body, column, scr.mesh, lbl, bar, at(hit(new THREE.BoxGeometry(F.w, F.h * 0.45, F.d), id), 0, (F.h * 0.45) / 2, 0));
      ring = selRing(19);
      group.add(ring);
      update = (ctx) => {
        const fr = ctx.world.fractions;
        scr.set(`${Math.round(fr.cutLoC)}–${Math.round(fr.cutHiC)}`, fr.running ? '#f0c36e' : '#6ef08a', fr.running ? `recolectando ${Math.round(fr.progress01 * 100)} %` : 'corte °C');
        bar.scale.x = Math.max(0.01, fr.progress01 * 11);
        bar.position.x = 4 - 5.5 + (fr.progress01 * 11) / 2;
      };
      break;
    }
    case 'analyzer': {
      const A = GEO08.analyzer;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(A.w, A.h, A.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.45 }))));
      body.position.y = A.h / 2;
      const port = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 12), mats.chrome));
      port.position.set(6, A.h + 0.3, 0);
      const scr = lcd(12, 4, own, [384, 128]);
      scr.mesh.position.set(-2, A.h * 0.62, A.d / 2 + 0.05);
      const b1 = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.2, 0.6, 2, 0.2), mats.plasticBlue));
      b1.position.set(-5, A.h * 0.22, A.d / 2 + 0.3);
      const b2 = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.2, 0.6, 2, 0.2), mats.plasticYellow));
      b2.position.set(0, A.h * 0.22, A.d / 2 + 0.3);
      const lbl = labelPlane(['PUREZA     DENSIDAD'], 9, 0.8, own, '#3a4652');
      lbl.position.set(-2.5, A.h * 0.08, A.d / 2 + 0.05);
      group.add(body, port, scr.mesh, b1, b2, lbl);
      group.add(at(hit(new THREE.BoxGeometry(3.8, 1.6, 1.2), id, 'purity'), -5, A.h * 0.22, A.d / 2 + 0.3), at(hit(new THREE.BoxGeometry(3.8, 1.6, 1.2), id, 'density'), 0, A.h * 0.22, A.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(A.w, A.h, A.d), id), 0, A.h / 2, 0));
      ring = selRing(13);
      group.add(ring);
      update = (ctx) => {
        const a = ctx.world.analyzer;
        const last = [...ctx.world.readingOrder].reverse().map((rid) => ctx.world.readings[rid]).find((r) => r.kind === 'purity' || r.kind === 'density');
        if (a.readyAt !== null) scr.set('···', '#f0c36e', `analizando ${a.method}`);
        else if (Object.keys(a.sample).length) scr.set('LISTO', '#6ef08a', 'muestra cargada');
        else if (last) scr.set(last.kind === 'purity' ? `${last.value.toFixed(1)} %` : `${last.value.toFixed(3)}`, '#6ef08a', last.kind === 'purity' ? 'pureza (m/m)' : 'g/mL');
        else scr.set('---', '#6ef08a', 'sin muestra');
      };
      break;
    }
    case 'mpApparatus': {
      const M = GEO08.mpApparatus;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(M.w, M.h, M.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.5 }))));
      body.position.y = M.h / 2;
      const scr = lcd(10, 3, own, [320, 96]);
      scr.mesh.position.set(0, M.h * 0.7, M.d / 2 + 0.05);
      const b = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3, 1.2, 0.6, 2, 0.2), mats.rubberRed));
      b.position.set(0, M.h * 0.3, M.d / 2 + 0.3);
      const lbl = labelPlane(['PUNTO DE FUSIÓN'], 9, 0.9, own, '#263238');
      lbl.position.set(0, M.h * 0.12, M.d / 2 + 0.05);
      group.add(body, scr.mesh, b, lbl, at(hit(new THREE.BoxGeometry(3.6, 1.6, 1.2), id, 'run'), 0, M.h * 0.3, M.d / 2 + 0.3), at(hit(new THREE.BoxGeometry(M.w, M.h, M.d), id), 0, M.h / 2, 0));
      ring = selRing(10);
      group.add(ring);
      update = (ctx) => {
        const a = ctx.world.analyzer;
        const last = [...ctx.world.readingOrder].reverse().map((rid) => ctx.world.readings[rid]).find((r) => r.kind === 'mp');
        if (a.readyAt !== null && a.method === 'mp') scr.set('↑ °C', '#f0c36e', 'calentando');
        else if (last) scr.set(`${last.value.toFixed(1)}–${(last.value2 ?? last.value).toFixed(1)}`, '#6ef08a', 'intervalo °C');
        else scr.set('---', '#6ef08a', 'intervalo °C');
      };
      break;
    }
    case 'balance': {
      // Granataria electrónica 25 × 18 cm: platillo, pantalla de 0,001 g (simulada), ON/OFF y TARA.
      const B = GEO08.balance;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(B.w, 7.4, B.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }))));
      body.position.set(0, 3.7, 0);
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.pan / 2, B.pan / 2, 0.3, 32), mats.steel));
      pan.position.set(0, B.panZ - 0.15, -1);
      const scr = lcd(10, 2.4, own, [320, 80]);
      scr.mesh.position.set(-3, 3.2, B.d / 2 + 0.32);
      const btn = (x: number, m: THREE.Material) => at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.6, 2, 0.2), m)), x, 3.2, B.d / 2 + 0.4);
      const lbl = labelPlane(['ON/OFF    TARA'], 6.4, 1.1, own, '#3a4652');
      lbl.position.set(7.5, 1.2, B.d / 2 + 0.35);
      group.add(body, pan, scr.mesh, btn(6, mats.rubberRed), btn(9, mats.plasticBlue), lbl);
      group.add(at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'power'), 6, 3.2, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'tare'), 9, 3.2, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(11, 3, 1.4), id, 'display'), -3, 3.2, B.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(B.w, 7.4, B.d), id), 0, 3.7, 0));
      ring = selRing(15);
      group.add(ring);
      update = (ctx) => {
        const b = ctx.world.balance;
        const p = ctx.world.params.balance;
        const shown = quantize(b.shownG, p.resolutionG);
        if (!b.powered) scr.set('', '#1b2a20');
        else scr.set(b.shownG > p.capacityG ? '- OL -' : shown.toFixed(3), b.stable ? '#6ef08a' : '#f0c36e', b.stable ? 'g  ●' : 'g  ~');
      };
      break;
    }
    case 'burner': {
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 1, 16), mats.darkMetal));
      base.position.y = 0.5;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 9, 12), mats.chrome));
      tube.position.y = 5.5;
      const tag = labelPlane(['NO USAR', 'sin llama'], 3.6, 1.6, own, '#b71c1c');
      tag.position.set(0, 3, 3.45);
      group.add(base, tube, tag, at(hit(new THREE.CylinderGeometry(1.2, 1.2, 10, 8), id, 'ignite'), 0, 5, 0), at(hit(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 10), id), 0, 0.6, 0));
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
      const poster = labelPlane(['EPP: gafas · bata', 'guantes · cabello'], 14, 3.6, own, '#1e8e4e');
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
      // El condensador y el termómetro montados en el balón lo acompañan (el dominio solo guarda el apoyo).
      const host = ob.support === 'rf' && (ob.kind === 'condenser' || ob.kind === 'thermometer') ? ctx.world.objects.rf : null;
      const p = host ? { x: host.pose.x + (ob.kind === 'thermometer' ? 1.1 : 0), y: host.pose.y, z: host.pose.z + (ob.kind === 'condenser' ? GEO08.roundFlask.h - 0.5 : 1), rotationRad: 0 } : ob.pose;
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
