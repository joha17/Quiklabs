/**
 * Vistas 3D procedurales de la Práctica 6: balanza de triple brazo (módulo compartido), probeta de 100 mL con escala y
 * menisco, botella de agua destilada, piseta, calorímetro de vaso con tapa, termómetros con pantalla (muestran su
 * lectura con retardo), agitador, tubos con clavos o perdigones, frascos de metal, espátula, plantilla calentadora,
 * beaker del baño, pinza, gradilla, toalla, lavadero y la estación de la bomba calorimétrica (recipiente, unidad de
 * control, oxígeno, balanza analítica y muestras). SOLO leen el estado; no deciden nada.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { P6Object, P6World } from '../../simulation/calorimetry-world/types';
import { displayedValue, piecesAt, tubeTempC } from '../../simulation/calorimetry-world/world';
import { METALS } from '../../simulation/calorimetry/materials';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { graduationTexture, labelTexture, lcdTexture, tapeTexture } from '../renderers/textures';
import { GEO6 } from '../../practices/practice-06/definition';
import { createTripleBeamVisual } from '../instruments/tripleBeam3d';
import type { FrameCtx6 } from './CalorLab3D';

export interface ObjHandle6 {
  group: THREE.Group;
  update(ctx: FrameCtx6, o: P6Object): void;
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

const WATER = 0x7fb6e0;

/** Rótulo corto del estado de la bomba en su pantalla. */
const STAGE_SHORT: Record<string, string> = {
  UNASSEMBLED: 'SIN ARMAR', SAMPLE_LOADED: 'MUESTRA', WIRE_CONNECTED: 'ALAMBRE', SEALED: 'CERRADA', LEAK_TESTED: 'HERMÉTICA', OXYGEN_CHARGED: 'O₂ CARGADO',
  SUBMERGED: 'SUMERGIDA', BASELINE_STABLE: 'LÍNEA BASE', ARMED: 'ARMADA', IGNITED: 'IGNICIÓN', TEMPERATURE_RISE: 'ASCENSO', COMPLETE: 'COMPLETA', COOLED: 'ENFRIADA',
  DEPRESSURIZED: 'SIN PRESIÓN', OPENED: 'ABIERTA',
};

/** Columna de agua dentro de un cilindro, con menisco cóncavo opcional. */
function waterColumn(r: number, seg: number, own: <T extends THREE.Material>(m: T) => T, meniscus = false) {
  const mat = own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), mat);
  col.renderOrder = 2;
  const g = new THREE.Group();
  g.add(col);
  let men: THREE.Mesh | null = null;
  if (meniscus) {
    // Menisco: anillo que sube junto a la pared (agua «moja» el vidrio).
    men = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, r * 0.06, 6, seg), own(new THREE.MeshBasicMaterial({ color: 0x3f7fb2, transparent: true, opacity: 0.8 })));
    men.rotation.x = Math.PI / 2;
    g.add(men);
  }
  return {
    group: g,
    set(h: number, floor: number) {
      g.visible = h > 0.02;
      col.scale.y = Math.max(0.001, h);
      col.position.y = floor + h / 2;
      if (men) men.position.y = floor + h + r * 0.03;
    },
  };
}

export function createObjVisual6(o: P6Object, w0: P6World, q: QualityLevel): ObjHandle6 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle6['update'] = () => undefined;
  const id = o.id;
  const own = <T extends THREE.Material | THREE.Texture>(m: T): T => {
    disposables.push(m);
    return m;
  };
  /** Las vasijas se inclinan al verter (giro en el plano frontal). */
  const tiltable = new THREE.Group();

  switch (o.kind) {
    case 'balance': {
      const bal = createTripleBeamVisual(id, mats, seg, own, hitMat());
      group.add(bal.group);
      update = (ctx) => bal.update(ctx.world.balance, ctx.dt, ctx.selected === id);
      break;
    }

    case 'cylinder': {
      const G = GEO6.cylinder;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.12, G.r + 0.12, G.h + G.floor, seg, 1, true), mats.glass);
      glass.position.y = (G.h + G.floor) / 2;
      glass.renderOrder = 3;
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.baseR, G.baseR + 0.2, 0.8, 6), mats.glass));
      base.position.y = 0.4;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(G.r + 0.12, 0.12, 6, seg), mats.glass);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = G.h + G.floor;
      // Escala: 0–100 mL; cada mL una marca, cada 10 mL rotulada.
      const marks: Array<[number, boolean, string?]> = [];
      const hFor = (ml: number) => (ml / (Math.PI * G.r * G.r)) / G.h;
      for (let ml = 0; ml <= 100; ml += 1) marks.push([hFor(ml) * 0.98 + 0.01, ml % 10 === 0, ml % 10 === 0 ? String(ml) : undefined]);
      const tex = own(graduationTexture(marks, '#123a63', { sub: '100 mL · 20 °C' }));
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.14, G.r + 0.14, G.h, seg, 1, true, -Math.PI * 0.18, Math.PI * 0.36), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      scale.position.y = G.floor + G.h / 2;
      const water = waterColumn(G.r, seg, own, true);
      tiltable.add(glass, base, lip, scale, water.group);
      tiltable.add(at(hit(new THREE.CylinderGeometry(G.baseR, G.baseR, G.h + 1.5, 10), id), 0, (G.h + 1.5) / 2, 0));
      group.add(tiltable);
      ring = selRing(G.baseR + 0.6);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.vessels.cylinder;
        water.set(v.waterG / v.areaCm2, G.floor);
      };
      break;
    }

    case 'waterBottle': {
      const G = GEO6.bottle;
      const plastic = own(new THREE.MeshPhysicalMaterial({ color: 0xe8f1f8, roughness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }));
      const body = new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r, G.h * 0.8, seg, 1, true), plastic);
      body.position.y = G.h * 0.4;
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(1.6, G.r, G.h * 0.15, seg, 1, true), plastic);
      shoulder.position.y = G.h * 0.8 + G.h * 0.075;
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.4, 16), mats.plasticBlue));
      cap.position.y = G.h * 0.95 + 0.7;
      const water = waterColumn(G.r - 0.1, seg, own);
      const lbl = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.03, G.r + 0.03, 6, seg, 1, true, -0.7, 1.4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['H₂O', 'agua destilada'], { band: '#2f7fd1', w: 256, h: 96 })), roughness: 0.7 })));
      lbl.position.y = G.h * 0.45;
      tiltable.add(body, shoulder, cap, water.group, lbl);
      tiltable.add(at(hit(new THREE.CylinderGeometry(G.r + 0.3, G.r + 0.3, G.h, 10), id), 0, G.h / 2, 0));
      group.add(tiltable);
      update = (ctx) => {
        const v = ctx.world.vessels.water_bottle;
        water.set(Math.min(G.h * 0.8, v.waterG / v.areaCm2), 0.4);
      };
      break;
    }

    case 'washBottle': {
      const plastic = mats.plasticWhite;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 12, seg), plastic));
      body.position.y = 6;
      const capM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 12), mats.plasticBlue));
      capM.position.y = 12.6;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 8), mats.plasticWhite));
      tube.position.set(1.8, 15.2, 0);
      tube.rotation.z = -0.7;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['H₂O', 'destilada'], { band: '#2f7fd1', w: 128, h: 64 })) })));
      lbl.position.set(0, 6, 3.12);
      group.add(body, capM, tube, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(3.6, 3.6, 15, 10), id), 0, 7.5, 0));
      break;
    }

    case 'cup': {
      // Dos vasos de espuma anidados, con tapa de dos orificios (termómetro y agitador).
      const G = GEO6.cup;
      const foam = own(new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.95 }));
      const outer = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.outerR + 0.3, G.outerR - 0.6, G.h + 1.2, seg, 1, true), foam));
      outer.position.y = (G.h + 1.2) / 2;
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.15, G.r - 0.5, G.h, seg, 1, true), own(new THREE.MeshStandardMaterial({ color: 0xebe8e0, roughness: 0.95, side: THREE.BackSide })));
      inner.position.y = G.floor + G.h / 2;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(G.outerR - 0.6, seg), foam);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      const water = new THREE.Mesh(new THREE.CircleGeometry(G.r - 0.2, seg), own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.75 })));
      water.rotation.x = -Math.PI / 2;
      const lidG = new THREE.Group();
      const lidMat = own(new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6 }));
      const lidDisc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.outerR + 0.5, G.outerR + 0.5, 0.5, seg), lidMat));
      const holes = [-1.4, 1.4].map((x) => at(new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), own(new THREE.MeshBasicMaterial({ color: 0x2b2b2b }))), x, 0.26, 0));
      holes.forEach((h) => (h.rotation.x = -Math.PI / 2));
      lidG.add(lidDisc, ...holes);
      lidG.add(hit(new THREE.CylinderGeometry(G.outerR + 0.8, G.outerR + 0.8, 1.2, 12), id, 'lid'));
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Calorímetro', 'vaso de espuma'], { band: '#1f6f6b', w: 256, h: 80 })) })));
      lbl.position.set(0, 4.5, G.outerR + 0.05);
      // Metal dentro (visible con la tapa abierta).
      const metal = new THREE.Group();
      group.add(outer, inner, floor, water, lidG, lbl, metal);
      group.add(at(hit(new THREE.CylinderGeometry(G.outerR + 0.4, G.outerR, G.h + 1.2, 12), id, 'body'), 0, (G.h + 1.2) / 2, 0));
      ring = selRing(G.outerR + 1.2);
      group.add(ring);
      let shown = -1;
      update = (ctx) => {
        const w = ctx.world;
        const v = w.vessels.cup;
        const h = v.waterG / v.areaCm2;
        water.visible = h > 0.05;
        water.position.y = G.floor + h;
        // Tapa: puesta o apoyada al costado.
        if (w.cal.lidClosed) {
          lidG.position.set(0, G.h + 1.35, 0);
          lidG.rotation.set(0, 0, 0);
        } else {
          lidG.position.set(G.outerR + 4.5, 0.3, 1);
          lidG.rotation.set(0, 0, 0);
        }
        const ps = piecesAt(w, 'cup');
        if (ps.length !== shown) {
          shown = ps.length;
          metal.clear();
          ps.forEach((p, i) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 8), new THREE.MeshStandardMaterial({ color: METALS[p.metal].color, metalness: 0.7, roughness: 0.4 }));
            m.rotation.z = Math.PI / 2;
            m.rotation.y = i * 1.3;
            m.position.set(Math.cos(i * 2.4) * 1.4, G.floor + 0.3 + (i % 3) * 0.3, Math.sin(i * 2.4) * 1.4);
            metal.add(m);
          });
        }
      };
      break;
    }

    case 'thermometer': {
      // Termómetro digital de sonda: vaina de acero, mango y pantalla con la lectura (con retardo).
      const inner = new THREE.Group();
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 14, 10), mats.chrome));
      stem.position.y = 7;
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 5.5, 1.4, 3, 0.4), own(new THREE.MeshStandardMaterial({ color: id === 'therm_cal' ? 0x1f6f6b : 0xb8321f, roughness: 0.5 }))));
      handle.position.y = 16.5;
      const lcd = lcdTexture(192, 72);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.8), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(0, 17.4, 0.71);
      inner.add(stem, handle, screen);
      inner.add(at(hit(new THREE.BoxGeometry(2.6, 6, 2), id, 'display'), 0, 16.5, 0));
      inner.add(at(hit(new THREE.CylinderGeometry(0.8, 0.8, 14, 8), id), 0, 7, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const th = ctx.world.thermos[id];
        const v = displayedValue(ctx.world, id);
        lcd.set(th.broken ? '----' : `${v.toFixed(1)}`, '#6ef08a', '°C');
        // Apoyado en la mesada: acostado; en un recipiente: vertical, hundido según la profundidad.
        if (ob.support === 'bench') {
          inner.rotation.set(0, 0, Math.PI / 2);
          inner.position.set(8, 0.6, 0);
        } else {
          inner.rotation.set(0, 0, 0);
          inner.position.set(0, 0, 0);
        }
      };
      break;
    }

    case 'stirrer': {
      const inner = new THREE.Group();
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 14, 6), mats.steel));
      rod.position.y = 7;
      const loop = shadowed(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.1, 6, 24), mats.steel));
      loop.rotation.x = Math.PI / 2;
      loop.position.y = 0.6;
      const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), mats.blackPlastic));
      knob.position.y = 14.3;
      inner.add(rod, loop, knob);
      inner.add(at(hit(new THREE.CylinderGeometry(1.2, 1.2, 15, 8), id), 0, 7.5, 0));
      group.add(inner);
      let phase = 0;
      update = (ctx, ob) => {
        if (ob.support === 'bench') {
          inner.rotation.set(0, 0, Math.PI / 2);
          inner.position.set(7, 0.6, 0);
          return;
        }
        inner.rotation.set(0, 0, 0);
        // Sube y baja al agitar (la agitación es real: cambia la transferencia de calor).
        phase += ctx.dt * (4 + 10 * ctx.world.cal.stir);
        inner.position.set(0, ob.support === 'cup' ? Math.sin(phase) * 1.5 * ctx.world.cal.stir : 0, 0);
      };
      break;
    }

    case 'tube': {
      const G = GEO6.tube;
      const inner = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(G.outerR, G.outerR, G.length - G.outerR, seg, 1, true), mats.glass);
      glass.position.y = G.outerR + (G.length - G.outerR) / 2;
      glass.renderOrder = 4;
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(G.outerR, seg, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.glass);
      bottom.position.y = G.outerR;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(G.outerR + 0.04, 0.09, 8, seg), mats.glass);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = G.length;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7), own(new THREE.MeshStandardMaterial({ map: own(tapeTexture(id === 'tube_fe' ? 'Fe' : w0.params.unknownCode)) })));
      tag.position.set(0, G.length - 3, G.outerR + 0.01);
      const metal = new THREE.Group();
      const water = waterColumn(G.outerR - G.wall, 12, own);
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 4, 0.04), own(new THREE.MeshBasicMaterial({ color: 0x333333 })));
      crack.position.set(0, 4, G.outerR);
      crack.rotation.z = 0.4;
      inner.add(glass, bottom, lip, tag, metal, water.group, crack);
      inner.add(at(hit(new THREE.CylinderGeometry(G.outerR * 1.8, G.outerR * 1.8, G.length, 10), id), 0, G.length / 2, 0));
      tiltable.add(inner);
      group.add(tiltable);
      ring = selRing(2);
      group.add(ring);
      let key = '';
      update = (ctx) => {
        const w = ctx.world;
        const t = w.tubes[id];
        const ps = piecesAt(w, `tube:${id}`);
        const k = ps.map((p) => p.id).join(',');
        if (k !== key) {
          key = k;
          metal.clear();
          ps.forEach((p, i) => {
            const m = METALS[p.metal];
            const nail = p.metal === 'Fe' || p.metal === 'steel';
            const geo = nail ? new THREE.CylinderGeometry(0.16, 0.16, 3.2, 6) : new THREE.CylinderGeometry(0.38, 0.38, 0.75, 10);
            const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.color, metalness: 0.75, roughness: 0.35 }));
            const layer = nail ? Math.floor(i / 4) : Math.floor(i / 3);
            const a = i * 2.1;
            mesh.position.set(Math.cos(a) * 0.35, 0.6 + (nail ? 1.7 + layer * 0.5 : 0.4 + layer * 0.72), Math.sin(a) * 0.35);
            if (nail) mesh.rotation.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
            metal.add(mesh);
          });
        }
        water.set(t.waterG / 2.5, 0.3);
        crack.visible = t.cracked && t.inspected;
      };
      break;
    }

    case 'jar': {
      const metalId = id === 'jar_fe' ? 'Fe' : w0.params.unknownMetal;
      const jarMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 7, seg, 1, true), jarMat);
      jar.position.y = 3.5;
      const heap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3, 2.2, seg), own(new THREE.MeshStandardMaterial({ color: METALS[metalId].color, metalness: 0.6, roughness: 0.5 }))));
      heap.position.y = 1.1;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(id === 'jar_fe' ? ['Fe', 'clavos de hierro'] : [`Metal ${w0.params.unknownCode}`, 'incógnito'], { band: id === 'jar_fe' ? '#5b6570' : '#8e44ad', w: 256, h: 96 })) })));
      lbl.position.set(0, 4.6, 3.25);
      group.add(jar, heap, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(3.6, 3.6, 7.5, 10), id), 0, 3.7, 0));
      update = (ctx) => {
        const n = piecesAt(ctx.world, `jar:${id}`).length;
        heap.scale.y = Math.max(0.05, n / 16);
        heap.position.y = 1.1 * heap.scale.y;
      };
      break;
    }

    case 'spatula': {
      const inner = new THREE.Group();
      const blade = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 0.12, 1.3, 2, 0.05), mats.steel));
      blade.position.set(4.5, 0.1, 0);
      const spoon = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.steel));
      spoon.scale.set(1.3, 0.35, 1);
      spoon.position.set(8.4, 0.18, 0);
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 0.7, 1.1, 2, 0.25), mats.wood));
      handle.position.set(-3, 0.35, 0);
      const load = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8), own(new THREE.MeshStandardMaterial({ color: 0x8b8e93, metalness: 0.7, roughness: 0.4 })));
      load.rotation.z = Math.PI / 2;
      load.position.set(8.4, 0.5, 0);
      inner.add(blade, spoon, handle, load);
      inner.add(at(hit(new THREE.BoxGeometry(18, 1.8, 2.2), id), 1.5, 0.4, 0));
      group.add(inner);
      update = (ctx) => {
        const p = piecesAt(ctx.world, 'spatula')[0];
        load.visible = !!p;
        if (p) (load.material as THREE.MeshStandardMaterial).color.setHex(METALS[p.metal].color);
      };
      break;
    }

    case 'hotplate': {
      const G = GEO6.plate;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(G.w, G.h - 0.6, G.d + 4, 3, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.5 }))));
      body.position.set(0, (G.h - 0.6) / 2, 2);
      const topMat = own(new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6, emissive: 0x000000 }));
      const top = shadowed(new THREE.Mesh(new RoundedBoxGeometry(G.w - 1, 0.6, G.d - 1, 2, 0.2), topMat));
      top.position.y = G.h - 0.3;
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 20), mats.blackPlastic));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(-3, G.h * 0.45, G.d / 2 + 4.2);
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.1), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      notch.position.set(0, 0.5, 0.52);
      knob.add(notch);
      const pilot = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), own(new THREE.MeshBasicMaterial({ color: 0x333333 })));
      pilot.position.set(3, G.h * 0.45, G.d / 2 + 4.02);
      const hot = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['SUPERFICIE CALIENTE'], { band: '#d0021b', w: 256, h: 64 })) })));
      hot.position.set(4, G.h * 0.75, G.d / 2 + 4.02);
      const scaleTex = own(labelTexture(['0  1  2  3  4  5'], { band: '#3c4650', w: 192, h: 48 }));
      const scaleP = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), own(new THREE.MeshStandardMaterial({ map: scaleTex })));
      scaleP.position.set(-3, G.h * 0.45 - 1.9, G.d / 2 + 4.02);
      group.add(body, top, knob, pilot, hot, scaleP);
      group.add(at(hit(new THREE.CylinderGeometry(1.8, 1.8, 2, 10), id, 'knob'), -3, G.h * 0.45, G.d / 2 + 4.4));
      group.add(at(hit(new THREE.BoxGeometry(G.w, G.h, G.d + 4), id), 0, G.h / 2, 2));
      const glowC = new THREE.Color();
      update = (ctx) => {
        const pl = ctx.world.plate;
        knob.rotation.y = -pl.knob * Math.PI * 1.5;
        (pilot.material as THREE.MeshBasicMaterial).color.setHex(pl.knob > 0.01 ? 0xff7a1a : 0x333333);
        // Señal discreta de calor (no sustituye la medición): el disco se oscurece levemente.
        const u = THREE.MathUtils.clamp((pl.plateC - 60) / 340, 0, 1);
        glowC.setRGB(0.85 - 0.25 * u, 0.84 - 0.32 * u, 0.81 - 0.36 * u);
        topMat.color.copy(glowC);
      };
      break;
    }

    case 'beaker': {
      const G = GEO6.beaker;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(G.outerR, G.outerR, G.h + G.floor, seg, 1, true), mats.glass);
      glass.position.y = (G.h + G.floor) / 2;
      glass.renderOrder = 3;
      const floorM = new THREE.Mesh(new THREE.CircleGeometry(G.outerR, seg), mats.glass);
      floorM.rotation.x = -Math.PI / 2;
      floorM.position.y = 0.05;
      const marks: Array<[number, boolean, string?]> = [];
      for (let ml = 50; ml <= 400; ml += 50) marks.push([(ml / (Math.PI * G.r * G.r)) / G.h, ml % 100 === 0, ml % 100 === 0 ? String(ml) : undefined]);
      const tex = own(graduationTexture(marks, '#ffffff', { title: '400 mL' }));
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(G.outerR + 0.02, G.outerR + 0.02, G.h, seg, 1, true, -0.4, 0.8), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      scale.position.y = G.floor + G.h / 2;
      const water = waterColumn(G.r, seg, own);
      // Burbujas de la ebullición.
      const bubbles = new THREE.Group();
      const bMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      for (let i = 0; i < 14; i++) bubbles.add(new THREE.Mesh(new THREE.SphereGeometry(0.15 + (i % 3) * 0.06, 6, 4), bMat));
      tiltable.add(glass, floorM, scale, water.group, bubbles);
      tiltable.add(at(hit(new THREE.CylinderGeometry(G.outerR + 0.3, G.outerR + 0.3, G.h, 10), id), 0, G.h / 2, 0));
      group.add(tiltable);
      ring = selRing(G.outerR + 0.8);
      group.add(ring);
      let ph = 0;
      update = (ctx) => {
        const w = ctx.world;
        const v = w.vessels.beaker;
        const h = v.waterG / v.areaCm2;
        water.set(h, G.floor);
        const T = v.waterC;
        const vig = w.bath.vigor;
        const nucleation = T > 85 ? (T - 85) / 15 : 0;
        bubbles.visible = h > 0.3 && (vig > 0.02 || nucleation > 0.2) && !ctx.reducedMotion;
        ph += ctx.dt * (1 + 4 * vig);
        bubbles.children.forEach((b, i) => {
          const u = ((ph * (0.6 + (i % 5) * 0.15) + i * 0.37) % 1);
          b.position.set(Math.cos(i * 2.3) * G.r * 0.7, G.floor + u * h, Math.sin(i * 2.3) * G.r * 0.7);
          b.visible = i < 4 + vig * 10 + nucleation * 3;
        });
      };
      break;
    }

    case 'tubeTongs': {
      const wood = mats.wood;
      const armA = shadowed(new THREE.Mesh(new RoundedBoxGeometry(17, 0.6, 1.2, 2, 0.2), wood));
      const armB = armA.clone();
      armA.position.set(8.5, 0.5, 0.75);
      armB.position.set(8.5, 0.5, -0.75);
      const spring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 6, 14), mats.steel));
      spring.position.set(3, 0.5, 0);
      const tipA = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.2, 6, 14, Math.PI), mats.steel));
      tipA.position.set(17, 0.5, 0);
      tipA.rotation.x = Math.PI / 2;
      group.add(armA, armB, spring, tipA);
      group.add(at(hit(new THREE.BoxGeometry(19, 2, 3), id), 9, 0.6, 0));
      break;
    }

    case 'rack': {
      const ceramic = own(new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.6 }));
      const topPlate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(16, 0.8, 6, 2, 0.2), ceramic));
      topPlate.position.y = 7.5;
      const basePlate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(16, 0.8, 6, 2, 0.2), ceramic));
      basePlate.position.y = 0.4;
      const sides = [-7.6, 7.6].map((x) => shadowed(at(new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.5, 6), ceramic), x, 4, 0)));
      group.add(topPlate, basePlate, ...sides);
      group.add(at(hit(new THREE.BoxGeometry(16, 8.2, 6), id), 0, 4.1, 0));
      break;
    }

    case 'towel': {
      const cloth = shadowed(new THREE.Mesh(new RoundedBoxGeometry(14, 0.4, 10, 2, 0.15), own(new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 1 }))));
      cloth.position.y = 0.2;
      group.add(cloth);
      group.add(at(hit(new THREE.BoxGeometry(14, 1, 10), id), 0, 0.5, 0));
      break;
    }

    case 'sink': {
      const steel = mats.steel;
      const basin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(GEO6.sink.r, GEO6.sink.r - 2, GEO6.sink.h, seg, 1, true), own(new THREE.MeshStandardMaterial({ color: 0xbfc5ca, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }))));
      basin.position.y = GEO6.sink.h / 2;
      const drain = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), own(new THREE.MeshBasicMaterial({ color: 0x222222 })));
      drain.rotation.x = -Math.PI / 2;
      drain.position.y = 0.1;
      const tap = shadowed(new THREE.Mesh(new THREE.TorusGeometry(4, 0.4, 8, 16, Math.PI), steel));
      tap.position.set(0, GEO6.sink.h + 4, -GEO6.sink.r + 1);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Lavadero', 'agua y metal frío'], { band: '#2f7fd1', w: 256, h: 64 })) })));
      lbl.position.set(0, GEO6.sink.h + 0.5, GEO6.sink.r + 0.1);
      group.add(basin, drain, tap, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(GEO6.sink.r, GEO6.sink.r, GEO6.sink.h, 12), id), 0, GEO6.sink.h / 2, 0));
      break;
    }

    case 'bomb': {
      // Recipiente de combustión: cuerpo de acero, cabezal, válvula y electrodos.
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 10, seg), mats.chrome));
      body.position.y = 5;
      const head = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 2, seg), mats.steel));
      head.position.y = 11;
      const valve = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 10), mats.darkMetal));
      valve.position.set(1.2, 12.8, 0);
      const elec = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8), own(new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.8, roughness: 0.3 }))));
      elec.position.set(-1.2, 12.7, 0);
      group.add(body, head, valve, elec);
      group.add(at(hit(new THREE.CylinderGeometry(3.8, 3.8, 13, 10), id), 0, 6.5, 0));
      update = (ctx) => {
        // Sumergida: dentro de la unidad (no se ve).
        group.visible = !ctx.world.bomb.inBucket;
      };
      break;
    }

    case 'bombUnit': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(30, 22, 24, 3, 1), own(new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.45 }))));
      body.position.y = 11;
      const lidMat = own(new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.4, metalness: 0.3 }));
      const lid = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1.2, seg), lidMat));
      lid.position.set(-4, 22.6, 0);
      const lcd = lcdTexture(256, 96);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(7, 15, 12.05);
      const btnArm = shadowed(at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 16), own(new THREE.MeshStandardMaterial({ color: 0xf2a900 }))), 4.5, 8.5, 12.2));
      btnArm.rotation.x = Math.PI / 2;
      const btnFire = shadowed(at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 16), own(new THREE.MeshStandardMaterial({ color: 0xd0021b }))), 9.5, 8.5, 12.2));
      btnFire.rotation.x = Math.PI / 2;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Bomba calorimétrica', 'simulación educativa'], { band: '#3c4650', w: 256, h: 64 })) })));
      lbl.position.set(-6, 5, 12.05);
      group.add(body, lid, screen, btnArm, btnFire, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(1.6, 1.6, 2, 10), id, 'arm'), 4.5, 8.5, 12.4));
      group.add(at(hit(new THREE.CylinderGeometry(1.6, 1.6, 2, 10), id, 'ignite'), 9.5, 8.5, 12.4));
      group.add(at(hit(new THREE.CylinderGeometry(8.5, 8.5, 2, 12), id, 'lid'), -4, 22.6, 0));
      group.add(at(hit(new THREE.BoxGeometry(30, 22, 24), id), 0, 11, 0));
      update = (ctx) => {
        const b = ctx.world.bomb;
        lcd.set(b.inBucket ? b.displayedC.toFixed(3) : '--.---', b.stage === 'ARMED' ? '#ffb347' : '#6ef08a', STAGE_SHORT[b.stage] ?? '');
        lid.position.y = b.lidClosed ? 22.6 : 24.5;
        lid.rotation.z = b.lidClosed ? 0 : -0.5;
      };
      break;
    }

    case 'oxygen': {
      const cyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 40, seg), own(new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.5 }))));
      cyl.position.y = 20;
      const dome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(4, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2), own(new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }))));
      dome.position.y = 40;
      const reg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 16), mats.chrome));
      reg.rotation.x = Math.PI / 2;
      reg.position.set(0, 45, 1.2);
      const gauge = lcdTexture(160, 64);
      own(gauge.texture);
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), own(new THREE.MeshBasicMaterial({ map: gauge.texture })));
      face.position.set(0, 45, 1.75);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['O₂', 'virtual · sin grasas'], { band: '#2e7d32', w: 256, h: 96 })) })));
      lbl.position.set(0, 24, 4.05);
      group.add(cyl, dome, reg, face, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(2, 2, 3, 10), id, 'valve'), 0, 45, 1));
      group.add(at(hit(new THREE.CylinderGeometry(4.4, 4.4, 46, 10), id), 0, 23, 0));
      update = (ctx) => gauge.set(`${ctx.world.bomb.pressureAtm.toFixed(0)}`, '#6ef08a', 'atm');
      break;
    }

    case 'analyticBalance': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(16, 4, 20, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.5 }))));
      body.position.y = 2;
      const shield = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 14), own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false })));
      shield.position.set(0, 10, -1);
      const lcd = lcdTexture(256, 72);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.8), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(0, 2.2, 10.05);
      group.add(body, shield, screen);
      group.add(at(hit(new THREE.BoxGeometry(16, 16, 20), id), 0, 8, 0));
      update = (ctx) => {
        const r = ctx.world.bomb.sampleReadingG;
        lcd.set(r === null ? '0.0000' : r.toFixed(4), '#6ef08a', 'g');
      };
      break;
    }

    case 'foodDish': {
      const dish = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4, 3, 1, seg), mats.porcelain));
      dish.position.y = 0.5;
      const pieces = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const p = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), own(new THREE.MeshStandardMaterial({ color: 0xc89b5c, roughness: 0.8 }))));
        p.scale.set(1, 0.7, 1.4);
        p.position.set(Math.cos(i * 2.2) * (i % 3), 1.2, Math.sin(i * 2.2) * (i % 3));
        pieces.add(p);
      }
      group.add(dish, pieces);
      group.add(at(hit(new THREE.CylinderGeometry(4.2, 4.2, 2, 10), id), 0, 1, 0));
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
      // Las vasijas se inclinan al verter; el resto gira en el plano de la mesada.
      tiltable.rotation.set(0, 0, -p.rotationRad);
      if (ob.kind === 'tube' && (ob.support === 'bench')) tiltable.rotation.set(0, 0, -Math.PI / 2);
      group.visible = ob.support !== 'disposed';
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Temperatura de contacto del tubo (para avisos visuales discretos). */
export const tubeHot = (w: P6World, id: string) => tubeTempC(w.tubes[id]) > w.params.ambientC + 25;
