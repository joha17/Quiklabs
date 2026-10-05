/**
 * Vistas 3D procedurales de la Práctica 4 (§4–§6): frascos rotulados con pictogramas, frascos gotero, goteros,
 * probetas graduadas (10,0 y 25,0 mL), beaker de 100 mL, tubos y gradilla, cápsula con residuo, varilla, sonda con
 * pantalla, piseta, contenedores de residuos, clavo con mapa de superficie (óxido/cobre), tira de Al, cinta de Mg
 * que arde, pinzas, lija, toalla, papel indicador y pantalla para Mg. SOLO leen el estado; no deciden nada.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { P4Object, P4World, VesselKind } from '../../simulation/reaction-world/types';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { graduationTexture, labelTexture, lcdTexture } from '../renderers/textures';
import { shellGeometry, wrapGeometry } from '../renderers/lathe';
import { markHeight } from '../physics/geometry';
import { LiquidView } from './liquid3d';
import { SHAPES4 } from './shapes';
import type { FrameCtx4 } from './ReactionLab3D';
import {
  AL_STRIP, CAPSULE_PROFILE, DROPPER, MG_RIBBON, NAIL, PROBE, PROFILE_OF, RACK4, ROD, SHIELD, TILE4, WASH_NOZZLE, WASTE_PROFILE,
} from '../../practices/practice-04/instruments';
import { REAGENTS } from '../../practices/practice-04/definition';

export interface ObjHandle4 {
  group: THREE.Group;
  update(ctx: FrameCtx4, o: P4Object): void;
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

/** Incandescencia solo cuando la temperatura lo justifica. */
function glowColor(tC: number, out: THREE.Color): number {
  if (tC < 480) return 0;
  const u = Math.min(1, (tC - 480) / 600);
  out.setRGB(1, 0.25 + 0.55 * u, 0.05 + 0.3 * u * u);
  return 0.4 + 2.2 * u;
}

const BAND: Record<string, string> = {
  hcl: '#c0392b', naoh10: '#1f6fbf', naoh15: '#0d4f99', naohX: '#1f6fbf', na2co3: '#7f8c8d', cacl2: '#8e7cc3', fecl3: '#b9770e', cuso4: '#2471a3',
  pheno: '#c2185b', water: '#2f7fd1',
};

function reagentLabel(w: P4World, reagent: string | null): THREE.CanvasTexture {
  const r = reagent ? REAGENTS[reagent] : null;
  if (reagent === 'naohX') return labelTexture(['NaOH', `${(w.params.naohSingle ?? 0.1).toFixed(2).replace('.', ',')} M`, 'Corrosivo'], { picto: 'warn', band: BAND.naohX, w: 256, h: 160 });
  if (!r) return labelTexture(['?'], {});
  const hz = r.hazards.length ? r.hazards.map((h) => ({ corrosive: 'Corrosivo', irritant: 'Irritante', harmful: 'Nocivo', flammable: 'Inflamable', environment: 'Peligro ambiental' })[h]).join(' · ') : '';
  if (reagent === 'pheno') return labelTexture([r.name, r.formula, hz], { picto: 'warn', band: BAND.pheno, w: 256, h: 160 });
  return labelTexture([r.formula, `${r.conc}`, hz || r.name], { picto: r.hazards.length ? 'warn' : undefined, band: BAND[reagent ?? ''] ?? '#2f7fd1', w: 256, h: 160 });
}

function lathe(prof: { outer: Array<[number, number]> }, seg: number, mat: THREE.Material): THREE.Mesh {
  const pts = prof.outer.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  return new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);
}

export function createObjVisual4(o: P4Object, w: P4World, q: QualityLevel, label: string): ObjHandle4 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle4['update'] = () => undefined;
  const id = o.id;
  const v = w.vessels[id];
  void label;

  /** Recipiente de vidrio con su contenido (y la vista de rotura). */
  const vesselGlass = (kind: VesselKind, name: string, opts: { meniscus?: boolean; mat?: THREE.Material; particles?: number } = {}) => {
    const prof = PROFILE_OF[kind]!;
    const sh = SHAPES4[kind]!;
    const glass = new THREE.Mesh(shellGeometry(`p4:${name}`, prof, seg), opts.mat ?? mats.glass);
    glass.renderOrder = 3;
    const liquid = new LiquidView(sh, `p4:${name}`, seg, { meniscus: opts.meniscus, maxParticles: opts.particles });
    disposables.push(liquid);
    // Vidrio roto: fragmentos en la mesada.
    const shards = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = 0.4 + (i % 3) * 0.3;
      const tri = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, s), new THREE.Vector2(s * 0.8, -s * 0.2), new THREE.Vector2(-s * 0.5, -s * 0.4)])), mats.glass);
      tri.rotation.x = -Math.PI / 2;
      tri.position.set(Math.cos(i * 2.1) * (0.8 + i * 0.3), 0.05, Math.sin(i * 2.1) * (0.8 + i * 0.3));
      shards.add(tri);
    }
    shards.visible = false;
    group.add(glass, liquid.root, shards);
    return { glass, liquid, prof, shards };
  };

  const updateVessel = (g: ReturnType<typeof vesselGlass>, ctx: FrameCtx4, ob: P4Object) => {
    const ves = ctx.world.vessels[id];
    const broken = !!ves?.broken;
    g.glass.visible = !broken;
    g.shards.visible = broken;
    if (broken) {
      g.liquid.root.visible = false;
      return;
    }
    g.liquid.update(ctx.look(id), ob.pose.quat ? 0 : ob.pose.rotationRad, ob.pose.z, ctx.t, ctx.reducedMotion);
  };

  switch (o.kind) {
    case 'bottle': {
      const g = vesselGlass('BOTTLE', `bottle:${v?.reagent}`, { particles: 40 });
      const tex = reagentLabel(w, v?.reagent ?? null);
      disposables.push(tex);
      const lab = new THREE.Mesh(wrapGeometry(g.prof.outerR + 0.02, 3.6, Math.PI * 0.9), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 }));
      lab.position.y = 4.3;
      const capM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.4, 20), new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6 })));
      capM.position.y = g.prof.rimY + 0.6;
      group.add(lab, capM);
      group.add(at(hit(new THREE.CylinderGeometry(g.prof.outerR + 0.2, g.prof.outerR + 0.2, g.prof.rimY + 1.5, 12), id), 0, (g.prof.rimY + 1.5) / 2, 0));
      ring = selRing(g.prof.outerR + 0.6);
      update = (ctx, ob) => {
        updateVessel(g, ctx, ob);
        // Al tomar el frasco para verter, la tapa se deja a un lado.
        capM.visible = ob.support !== 'hand';
      };
      break;
    }
    case 'dropperBottle': {
      const amber = v?.reagent === 'pheno';
      const g = vesselGlass('DROPPER_BOTTLE', `db:${v?.reagent}`, { mat: amber ? mats.amberGlass : mats.glass, particles: 30 });
      const tex = reagentLabel(w, v?.reagent ?? null);
      disposables.push(tex);
      const lab = new THREE.Mesh(wrapGeometry(g.prof.outerR + 0.02, 2.8, Math.PI * 0.9), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 }));
      lab.position.y = 3.2;
      group.add(lab);
      group.add(at(hit(new THREE.CylinderGeometry(g.prof.outerR + 0.2, g.prof.outerR + 0.2, g.prof.rimY + 1, 12), id), 0, (g.prof.rimY + 1) / 2, 0));
      ring = selRing(g.prof.outerR + 0.6);
      update = (ctx, ob) => updateVessel(g, ctx, ob);
      break;
    }
    case 'dropper': {
      // Origen = punta. Tubo de vidrio y perilla de goma; el líquido aspirado se ve en el tubo.
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(DROPPER.r, DROPPER.r * 0.45, DROPPER.length, 12, 1, true), mats.glass);
      tube.position.y = DROPPER.length / 2;
      tube.renderOrder = 3;
      const bulb = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(DROPPER.bulbR, DROPPER.bulbH - DROPPER.bulbR * 2, 6, 14), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 })));
      bulb.position.y = DROPPER.length + DROPPER.bulbH / 2 - 0.2;
      const collar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 })));
      collar.position.y = DROPPER.length - 0.3;
      const liqMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false });
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(DROPPER.r * 0.8, DROPPER.r * 0.4, 1, 10), liqMat);
      liq.renderOrder = 2;
      group.add(tube, bulb, collar, liq);
      group.add(at(hit(new THREE.CylinderGeometry(0.9, 0.9, DROPPER.length + DROPPER.bulbH, 10), id), 0, (DROPPER.length + DROPPER.bulbH) / 2, 0));
      disposables.push(liqMat);
      update = (ctx, ob) => {
        const ves = ctx.world.vessels[id];
        const ml = ves ? (ves.bulk.volL + ves.plume.volL) * 1000 : 0;
        const h = Math.min(DROPPER.length * 0.9, (ml / DROPPER.capacityMl) * DROPPER.length * 0.85);
        liq.visible = h > 0.05;
        liq.scale.y = Math.max(0.01, h);
        liq.position.y = h / 2 + 0.1;
        const a = ctx.look(id);
        if (a) liqMat.color.setRGB(a.bulkRgb[0] * 0.9, a.bulkRgb[1] * 0.95, a.bulkRgb[2]);
        // Acostado en la mesada; vertical en la mano o en su frasco.
        group.rotation.set(0, 0, ob.support === 'bench' || ob.support === 'falling' ? Math.PI / 2 : 0);
      };
      break;
    }
    case 'cylinder': {
      const kind = v?.kind ?? 'CYL10';
      const g = vesselGlass(kind, kind, { meniscus: true, particles: 40 });
      const sh = SHAPES4[kind]!;
      const big = kind === 'CYL25';
      const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(big ? 2.3 : 1.8, big ? 2.4 : 1.9, big ? 0.7 : 0.6, 6), mats.glass));
      foot.position.y = big ? 0.35 : 0.3;
      foot.renderOrder = 2;
      // Graduaciones: 10,0 mL cada 0,2 mL (rotuladas cada 1 mL); 25,0 mL cada 0,5 mL (rotuladas cada 5 mL).
      const y0 = sh.baseOffset;
      const top = markHeight(sh, big ? 27 : 11);
      const H = top - y0;
      const marks: Array<[number, boolean, string?]> = [];
      const step = big ? 0.5 : 0.2;
      for (let ml = step; ml <= (big ? 25 : 10) + 1e-6; ml += step) {
        const major = big ? Math.abs(ml % 5) < 1e-6 || Math.abs((ml % 5) - 5) < 1e-6 : Math.abs(ml - Math.round(ml)) < 1e-6;
        const mid = big ? Math.abs(ml - Math.round(ml)) < 1e-6 : Math.abs(ml * 2 - Math.round(ml * 2)) < 1e-6;
        marks.push([(markHeight(sh, ml) - y0) / H, major || mid, major ? String(Math.round(ml)) : undefined]);
      }
      const tex = graduationTexture(marks, '#123a63', { title: big ? '25 mL' : '10 mL', sub: big ? '±0,5 · 20 °C' : '±0,2 · 20 °C' });
      disposables.push(tex);
      const grad = new THREE.Mesh(wrapGeometry(g.prof.outerR + 0.012, H, Math.PI * 0.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 }));
      grad.position.y = y0 + H / 2;
      grad.renderOrder = 4;
      group.add(foot, grad);
      group.add(at(hit(new THREE.CylinderGeometry(g.prof.outerR + 0.5, g.prof.outerR + 0.5, g.prof.rimY + 0.3, 12), id), 0, (g.prof.rimY + 0.3) / 2, 0));
      ring = selRing(big ? 2.8 : 2.2);
      update = (ctx, ob) => updateVessel(g, ctx, ob);
      break;
    }
    case 'beaker': {
      const g = vesselGlass('BEAKER100', 'beaker100', { particles: 110 });
      const sh = SHAPES4.BEAKER100!;
      const y0 = sh.baseOffset;
      const H = markHeight(sh, 100) - y0;
      const marks: Array<[number, boolean, string?]> = [20, 40, 60, 80, 100].map((ml) => [(markHeight(sh, ml) - y0) / H, true, String(ml)]);
      for (const ml of [10, 30, 50, 70, 90]) marks.push([(markHeight(sh, ml) - y0) / H, false]);
      const tex = graduationTexture(marks, '#ffffff', { title: '100 mL', sub: 'BORO 3.3' });
      disposables.push(tex);
      const grad = new THREE.Mesh(wrapGeometry(g.prof.outerR + 0.012, H, Math.PI * 0.35), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 }));
      grad.position.y = y0 + H / 2;
      grad.rotation.y = 0.5;
      grad.renderOrder = 4;
      const spout = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 6, 12, Math.PI), mats.glass);
      spout.position.set(g.prof.outerR, g.prof.rimY, 0);
      spout.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      group.add(grad, spout);
      group.add(at(hit(new THREE.CylinderGeometry(g.prof.outerR + 0.3, g.prof.outerR + 0.3, g.prof.rimY + 0.3, 14), id), 0, (g.prof.rimY + 0.3) / 2, 0));
      ring = selRing(g.prof.outerR + 0.6);
      update = (ctx, ob) => updateVessel(g, ctx, ob);
      break;
    }
    case 'tube': {
      const g = vesselGlass('TUBE', 'tube', { particles: 60 });
      const tapeMat = new THREE.MeshStandardMaterial({ color: 0xfffbe6, roughness: 0.8 });
      const tape = new THREE.Mesh(wrapGeometry(g.prof.outerR + 0.012, 1.2, Math.PI * 0.7), tapeMat);
      tape.position.y = 12;
      tape.visible = false;
      group.add(tape);
      let lastLabel: string | null = null;
      group.add(at(hit(new THREE.CylinderGeometry(g.prof.outerR + 0.45, g.prof.outerR + 0.45, g.prof.rimY, 10), id), 0, g.prof.rimY / 2, 0));
      ring = selRing(1.4);
      update = (ctx, ob) => {
        updateVessel(g, ctx, ob);
        const lb = ctx.world.vessels[id]?.label ?? null;
        if (lb !== lastLabel) {
          lastLabel = lb;
          tape.visible = !!lb;
          tapeMat.map?.dispose();
          if (lb) {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 48;
            const gg = c.getContext('2d')!;
            gg.fillStyle = '#fffbe6';
            gg.fillRect(0, 0, 128, 48);
            gg.fillStyle = '#1a3d8f';
            gg.font = 'bold 30px Inter, Segoe UI, sans-serif';
            gg.textAlign = 'center';
            gg.textBaseline = 'middle';
            gg.fillText(lb.replace('x', ' (3 mL)'), 64, 25, 120);
            tapeMat.map = new THREE.CanvasTexture(c);
            tapeMat.map.colorSpace = THREE.SRGBColorSpace;
            tapeMat.needsUpdate = true;
          }
        }
      };
      break;
    }
    case 'capsule': {
      const g = vesselGlass('CAPSULE', 'capsule4', { mat: new THREE.MeshPhysicalMaterial({ color: 0xf8f6f0, roughness: 0.25, clearcoat: q === 'LOW' ? 0 : 0.8, emissive: 0x000000 }), particles: 70 });
      const porcelain = g.glass.material as THREE.MeshPhysicalMaterial;
      g.glass.renderOrder = 0;
      disposables.push(porcelain);
      shadowed(g.glass);
      // Residuo sólido (MgO blanco y, si quedó, Mg gris) como un montoncito en el fondo.
      const pileMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 1, emissive: 0x000000 });
      const pile = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20), pileMat);
      const metal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.25), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.4 }));
      group.add(pile, metal);
      group.add(at(hit(new THREE.CylinderGeometry(CAPSULE_PROFILE.outerR, CAPSULE_PROFILE.outerR * 0.5, CAPSULE_PROFILE.rimY + 0.3, 16), id), 0, CAPSULE_PROFILE.rimY / 2, 0));
      ring = selRing(CAPSULE_PROFILE.outerR + 0.4);
      const glow = new THREE.Color();
      update = (ctx, ob) => {
        updateVessel(g, ctx, ob);
        const ves = ctx.world.vessels.capsule;
        if (!ves) return;
        const solidG = ((ves.bulk.mol['MgO(s)'] ?? 0) + (ves.plume.mol['MgO(s)'] ?? 0)) * 40.3 + ((ves.bulk.mol['Mg(OH)2(s)'] ?? 0) + (ves.plume.mol['Mg(OH)2(s)'] ?? 0)) * 58.3;
        const ml = (ves.bulk.volL + ves.plume.volL) * 1000;
        // Sin agua, el residuo se ve como polvo; con agua se dispersa (lo dibuja el líquido turbio).
        pile.visible = solidG > 2e-4 && ml < 0.5;
        const r = Math.min(2.4, 0.6 + Math.cbrt(solidG / 0.05) * 1.2);
        pile.scale.set(r, Math.max(0.12, r * 0.3), r);
        pile.position.y = CAPSULE_PROFILE.bottomY + pile.scale.y / 2;
        const mgLeft = (ves.bulk.mol['Mg(s)'] ?? 0) + (ves.plume.mol['Mg(s)'] ?? 0);
        metal.visible = mgLeft > 2e-5;
        metal.position.y = CAPSULE_PROFILE.bottomY + 0.1;
        const e = glowColor(Math.max(ob.temperatureC, ves.residueTempC), glow);
        porcelain.emissive.copy(glow);
        porcelain.emissiveIntensity = e * 0.25;
        pileMat.emissive.copy(glow);
        pileMat.emissiveIntensity = e * 0.8;
      };
      break;
    }
    case 'washBottle': {
      const prof = PROFILE_OF.WASH_BOTTLE!;
      const body = shadowed(lathe(prof as never, seg, new THREE.MeshPhysicalMaterial({ color: 0xf3f6f8, roughness: 0.4, transparent: true, opacity: 0.8 })));
      const capM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 1.4, 16), mats.plasticBlue));
      capM.position.y = prof.rimY + 0.6;
      const nozzle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, prof.rimY + 1, 0), new THREE.Vector3(0, prof.rimY + 3.4, 0), new THREE.Vector3(WASH_NOZZLE.dx * 0.6, WASH_NOZZLE.z + 0.4, 0), new THREE.Vector3(WASH_NOZZLE.dx, WASH_NOZZLE.z, 0)]), 16, 0.18, 8), mats.plasticWhite);
      const tex = labelTexture(['H₂O', 'destilada'], { band: '#2f7fd1', w: 256, h: 128 });
      disposables.push(tex);
      const lab = new THREE.Mesh(wrapGeometry(prof.outerR + 0.02, 4, Math.PI * 0.7), new THREE.MeshStandardMaterial({ map: tex, transparent: true }));
      lab.position.y = 7;
      group.add(body, capM, nozzle, lab);
      group.add(at(hit(new THREE.CylinderGeometry(prof.outerR, prof.outerR, prof.rimY + 3, 12), id), 0, (prof.rimY + 3) / 2, 0));
      ring = selRing(prof.outerR + 0.5);
      break;
    }
    case 'waste': {
      const color = { waste_metals: 0x6c3483, waste_iron: 0xa04000, waste_acidbase: 0x1f618d, waste_solids: 0x616a6b, waste_glass: 0x17202a }[id] ?? 0x2c6e49;
      const bin = shadowed(lathe(WASTE_PROFILE as never, seg, new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide })));
      const lines: Record<string, string[]> = {
        waste_metals: ['METALES', 'Cu²⁺ · Cu · Fe'], waste_iron: ['SALES DE HIERRO', 'Fe³⁺ · Fe(OH)₃'], waste_acidbase: ['ÁCIDOS Y BASES', 'neutralizados'],
        waste_solids: ['SÓLIDOS', 'CaCO₃ · MgO · Mg(OH)₂'], waste_glass: ['VIDRIO ROTO', 'contenedor rígido'],
      };
      const tex = labelTexture(lines[id] ?? ['RESIDUOS'], { band: `#${color.toString(16).padStart(6, '0')}`, w: 256, h: 128 });
      disposables.push(tex);
      const lab = new THREE.Mesh(wrapGeometry(WASTE_PROFILE.outerR + 0.03, 4.2, Math.PI * 0.75), new THREE.MeshStandardMaterial({ map: tex, transparent: true }));
      lab.position.y = 7.5;
      const fillMat = new THREE.MeshStandardMaterial({ color: 0x5d6d7e, roughness: 0.3, transparent: true, opacity: 0.85 });
      const fill = new THREE.Mesh(new THREE.CircleGeometry(WASTE_PROFILE.mouthR - 0.05, 24), fillMat);
      fill.rotation.x = -Math.PI / 2;
      group.add(bin, lab, fill);
      group.add(at(hit(new THREE.CylinderGeometry(WASTE_PROFILE.outerR, WASTE_PROFILE.outerR, 12, 12), id), 0, 6, 0));
      ring = selRing(WASTE_PROFILE.outerR + 0.5);
      update = (ctx) => {
        const ves = ctx.world.vessels[id];
        const ml = ves ? (ves.bulk.volL + ves.plume.volL) * 1000 : 0;
        fill.visible = ml > 0.2;
        fill.position.y = 0.4 + Math.min(10, ml / 50);
        const a = ctx.look(id);
        if (a) fillMat.color.setRGB(a.bulkRgb[0] * 0.6, a.bulkRgb[1] * 0.6, a.bulkRgb[2] * 0.6);
      };
      break;
    }
    case 'sink': {
      // Desagüe del fregadero de la sala: solo un cartel y el volumen de selección.
      const tex = labelTexture(['DESAGÜE', 'nunca metales'], { band: '#7f8c8d', picto: 'warn', w: 256, h: 128 });
      disposables.push(tex);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ map: tex }));
      sign.position.set(0, 18, -24);
      group.add(sign);
      group.add(at(hit(new THREE.BoxGeometry(40, 3, 30), id), 0, 0.5, 0));
      break;
    }
    case 'rack': {
      const wood = mats.wood;
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(RACK4.hx * 2, 0.6, RACK4.hy * 2, 2, 0.2), wood));
      base.position.y = 0.3;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(RACK4.hx * 2, 0.5, RACK4.hy * 2), wood));
      top.position.y = RACK4.h;
      const legs: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const l = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, RACK4.h, RACK4.hy * 2), wood));
        l.position.set(s * (RACK4.hx - 0.3), RACK4.h / 2, 0);
        legs.push(l);
      }
      group.add(base, top, ...legs);
      for (let i = 0; i < RACK4.slots; i++) {
        const hm = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), new THREE.MeshBasicMaterial({ color: 0x2b1d12 }));
        hm.rotation.x = -Math.PI / 2;
        hm.position.set(-((RACK4.slots - 1) / 2) * RACK4.pitch + i * RACK4.pitch, RACK4.h + 0.26, 0);
        group.add(hm);
      }
      group.add(at(hit(new THREE.BoxGeometry(RACK4.hx * 2, 0.8, RACK4.hy * 2), id), 0, 0.4, 0));
      break;
    }
    case 'tile': {
      const slab = shadowed(new THREE.Mesh(new RoundedBoxGeometry(TILE4.half * 2, TILE4.h, TILE4.half * 2, 2, 0.25), new THREE.MeshStandardMaterial({ color: 0xe7dccb, roughness: 0.9 })));
      slab.position.y = TILE4.h / 2;
      group.add(slab);
      group.add(at(hit(new THREE.BoxGeometry(TILE4.half * 2, TILE4.h + 0.2, TILE4.half * 2), id), 0, TILE4.h / 2, 0));
      break;
    }
    case 'rod': {
      // Origen = extremo inferior.
      const inner = new THREE.Group();
      const rodM = new THREE.Mesh(new THREE.CylinderGeometry(ROD.r, ROD.r, ROD.length, 10), mats.glass);
      rodM.position.y = ROD.length / 2;
      rodM.renderOrder = 3;
      const shards = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const piece = new THREE.Mesh(new THREE.CylinderGeometry(ROD.r, ROD.r, 4 + i, 8), mats.glass);
        piece.rotation.z = Math.PI / 2;
        piece.position.set(i * 3 - 3, ROD.r, i * 0.8);
        shards.add(piece);
      }
      inner.add(rodM);
      group.add(inner, shards);
      inner.add(at(hit(new THREE.CylinderGeometry(0.8, 0.8, ROD.length, 8), id), 0, ROD.length / 2, 0));
      update = (ctx, ob) => {
        const broken = ctx.world.rod.broken;
        inner.visible = !broken;
        shards.visible = broken;
        if (ob.support.startsWith('in:')) inner.rotation.set(0, 0, -0.18);
        else if (ob.support === 'hand') inner.rotation.set(0.15, 0, -0.12);
        else inner.rotation.set(0, 0, Math.PI / 2);
      };
      break;
    }
    case 'probe': {
      // Origen = punta de la sonda. Vástago de acero y mango con pantalla (lectura 0,1 °C).
      const inner = new THREE.Group();
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(PROBE.r, PROBE.r * 0.8, PROBE.length - PROBE.handleLen, 12), mats.steel));
      stem.position.y = (PROBE.length - PROBE.handleLen) / 2;
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.6, PROBE.handleLen, 1.1, 2, 0.3), mats.plasticYellow));
      handle.position.y = PROBE.length - PROBE.handleLen / 2;
      const lcd = lcdTexture(256, 110);
      disposables.push(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ map: lcd.texture }));
      screen.position.set(0, PROBE.length - 1.6, 0.57);
      inner.add(stem, handle, screen);
      group.add(inner);
      inner.add(at(hit(new THREE.CylinderGeometry(1, 1, PROBE.length, 8), id), 0, PROBE.length / 2, 0));
      update = (ctx, ob) => {
        lcd.set(`${ctx.world.probe.readingC.toFixed(1)} °C`, '#6ef08a', 'T');
        if (ob.support.startsWith('in:')) inner.rotation.set(0, 0, 0.12);
        else if (ob.support === 'hand') inner.rotation.set(0.1, 0, 0.1);
        else inner.rotation.set(0, 0, Math.PI / 2);
      };
      break;
    }
    case 'nail':
    case 'alStrip': {
      // Origen = punta. Textura a lo largo con óxido, metal limpio y cobre depositado por segmento (§16.4).
      const isNail = o.kind === 'nail';
      const N = isNail ? NAIL.segments : AL_STRIP.segments;
      const L = isNail ? NAIL.length : AL_STRIP.length;
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = N * 8;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      disposables.push(tex);
      const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.5 });
      disposables.push(mat);
      const inner = new THREE.Group();
      const body = isNail
        ? new THREE.Mesh(new THREE.CylinderGeometry(NAIL.d / 2, NAIL.d / 2, L - 0.5, 12, 1), mat)
        : new THREE.Mesh(new THREE.BoxGeometry(AL_STRIP.w, L, AL_STRIP.t), mat);
      body.position.y = isNail ? 0.5 + (L - 0.5) / 2 : L / 2;
      inner.add(shadowed(body));
      if (isNail) {
        const tip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(NAIL.d / 2, 0.5, 12), mat));
        tip.rotation.x = Math.PI;
        tip.position.y = 0.25;
        const head = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(NAIL.headD / 2, NAIL.headD / 2, NAIL.headH, 16), mats.darkMetal));
        head.position.y = L + NAIL.headH / 2;
        inner.add(tip, head);
      }
      group.add(inner);
      inner.add(at(hit(new THREE.CylinderGeometry(0.7, 0.7, L + 0.4, 8), id), 0, L / 2, 0));
      let key = '';
      update = (ctx, ob) => {
        const m = ctx.world.metals[id];
        if (ob.support.startsWith('in:') || ob.support.startsWith('tongs:') || ob.support === 'hand') inner.rotation.set(0, 0, ob.support.startsWith('in:') ? 0.08 : 0);
        else inner.rotation.set(0, 0, Math.PI / 2);
        if (!m) return;
        const k = m.segments.map((s) => `${Math.round(s.oxide * 20)}:${Math.round(Math.min(1, s.cuMol * 63546 / 3) * 20)}`).join(',');
        if (k === key) return;
        key = k;
        const g = c.getContext('2d')!;
        for (let i = 0; i < N; i++) {
          const s = m.segments[i];
          const area = isNail ? Math.PI * NAIL.d * (L / N) : 2 * (AL_STRIP.w + AL_STRIP.t) * (L / N);
          const cov = Math.min(1, (s.cuMol * 63546) / area / 1.5);
          const base = isNail ? [118, 120, 124] : [205, 210, 214];
          const rust = [125, 70, 38];
          const cu = [176, 88, 52];
          const ox = isNail ? s.oxide : m.passivation * 0.15;
          const y = c.height - (i + 1) * 8;
          for (let px = 0; px < 32; px += 2) {
            for (let py = 0; py < 8; py += 2) {
              const n = ((px * 7 + py * 13 + i * 31) % 17) / 17;
              const isCu = n < cov * 1.1;
              const isRust = !isCu && n < ox;
              const col = isCu ? cu : isRust ? rust : base;
              const sh = 0.85 + 0.3 * ((px * 3 + py * 5 + i) % 7) / 7;
              g.fillStyle = `rgb(${Math.round(col[0] * sh)},${Math.round(col[1] * sh)},${Math.round(col[2] * sh)})`;
              g.fillRect(px, y + py, 2, 2);
            }
          }
        }
        tex.needsUpdate = true;
      };
      break;
    }
    case 'nailDish':
    case 'mgDish': {
      // Plato de las cintas: oscuro, para que la cinta metálica se distinga.
      const dish = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.4, 0.5, 28), o.kind === 'nailDish' ? mats.glass : new THREE.MeshStandardMaterial({ color: 0x2f3439, roughness: 0.7 })));
      dish.position.y = 0.25;
      dish.renderOrder = 2;
      const tex = labelTexture(o.kind === 'nailDish' ? ['Clavo de hierro', 'Fe(s)'] : ['Cinta de Mg', '3 cm · Mg(s)'], { band: o.kind === 'nailDish' ? '#5d6d7e' : '#95a5a6', w: 256, h: 96 });
      disposables.push(tex);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.9), new THREE.MeshStandardMaterial({ map: tex }));
      card.rotation.x = -Math.PI / 2;
      card.position.set(0, 0.02, 5);
      group.add(dish, card);
      group.add(at(hit(new THREE.CylinderGeometry(3.6, 3.6, 0.6, 12), id), 0, 0.3, 0));
      break;
    }
    case 'mgRibbon': {
      // Origen = extremo libre (el que entra a la llama); la cinta se extiende hacia −x (la pinza).
      const metalMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.85, roughness: 0.3, emissive: 0x000000 });
      const ashMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0 });
      const metal = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, MG_RIBBON.t * 2, MG_RIBBON.w), metalMat));
      const ash = new THREE.Mesh(new THREE.BoxGeometry(1, MG_RIBBON.t * 4, MG_RIBBON.w * 1.15), ashMat);
      const front = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      group.add(metal, ash, front);
      group.add(at(hit(new THREE.BoxGeometry(MG_RIBBON.length + 0.6, 0.8, 1.2), id), -MG_RIBBON.length / 2, 0, 0));
      disposables.push(metalMat, ashMat);
      const glow = new THREE.Color();
      update = (ctx, ob) => {
        const r = ctx.world.ribbons[id];
        if (!r) return;
        const hidden = ob.support.startsWith('in:') || ob.support.startsWith('disposed:');
        group.visible = !hidden;
        const Lm = MG_RIBBON.length * (1 - r.burnFrac);
        const La = MG_RIBBON.length * r.burnFrac;
        // Desde el extremo libre: primero ceniza (lo quemado), luego el metal hacia la pinza.
        ash.visible = La > 0.02;
        ash.scale.x = Math.max(0.01, La);
        ash.position.x = -La / 2;
        metal.visible = Lm > 0.02;
        metal.scale.x = Math.max(0.01, Lm);
        metal.position.x = -La - Lm / 2;
        const burning = r.phase === 'BRIGHT_COMBUSTION';
        front.visible = burning;
        front.position.x = -La;
        const e = glowColor(r.temperatureC, glow);
        metalMat.emissive.copy(glow);
        metalMat.emissiveIntensity = e * 0.5;
        ashMat.emissiveIntensity = r.phase === 'GLOWING_RESIDUE' ? 0.35 * Math.min(1, (r.temperatureC - 400) / 800) : 0;
        if (!ob.support.startsWith('tongs:')) group.rotation.set(0, 0.3, 0);
        else group.rotation.set(0, 0, 0);
      };
      break;
    }
    case 'tubeTongs':
    case 'crucibleTongs': {
      // Origen = punta (mandíbulas); los brazos van hacia el estudiante y hacia arriba.
      const crucible = o.kind === 'crucibleTongs';
      const len = crucible ? 23 : 18;
      const inner = new THREE.Group();
      const armL = new THREE.Group();
      const armR = new THREE.Group();
      const armMat = crucible ? mats.steel : new THREE.MeshStandardMaterial({ color: 0xb5835a, roughness: 0.6 });
      for (const [arm, s] of [[armL, 1], [armR, -1]] as const) {
        const jaw = shadowed(new THREE.Mesh(crucible ? new THREE.TorusGeometry(0.9, 0.12, 6, 12, Math.PI) : new THREE.BoxGeometry(0.25, 0.9, 1.6), crucible ? mats.steel : mats.darkMetal));
        if (crucible) jaw.rotation.y = Math.PI / 2;
        jaw.position.set(s * 0.25, 0, 0.6);
        const shaft = shadowed(new THREE.Mesh(crucible ? new THREE.CylinderGeometry(0.14, 0.14, len - 3, 8) : new THREE.BoxGeometry(0.35, 0.6, len - 3), armMat));
        if (crucible) shaft.rotation.x = Math.PI / 2;
        shaft.position.set(s * 0.25, 0, (len - 3) / 2 + 1.3);
        arm.add(jaw, shaft);
      }
      inner.add(armL, armR);
      group.add(inner);
      inner.add(at(hit(new THREE.BoxGeometry(3, 2, len), id), 0, 0, len / 2));
      const readyMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb000, emissiveIntensity: 0.6 });
      disposables.push(readyMat);
      const jawMat = (armL.children[0] as THREE.Mesh).material;
      update = (ctx, ob) => {
        const held = ob.support === 'hand';
        const holding = !!ctx.world.tongs[id]?.holding;
        inner.rotation.x = held ? -0.55 : 0;
        const open = holding ? 0.02 : held ? 0.12 : 0.08;
        armL.rotation.y = open;
        armR.rotation.y = -open;
        const m = ctx.clampReady && held && ctx.held === id ? readyMat : jawMat;
        (armL.children[0] as THREE.Mesh).material = m;
        (armR.children[0] as THREE.Mesh).material = m;
      };
      break;
    }
    case 'sandpaper': {
      const sheet = shadowed(new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 5.5), new THREE.MeshStandardMaterial({ color: 0xa67c52, roughness: 1 })));
      sheet.position.y = 0.04;
      group.add(sheet);
      group.add(at(hit(new THREE.BoxGeometry(7, 0.6, 5.5), id), 0, 0.3, 0));
      ring = selRing(4.5);
      break;
    }
    case 'towel': {
      const stack = shadowed(new THREE.Mesh(new RoundedBoxGeometry(9, 0.8, 7, 2, 0.15), new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 1 })));
      stack.position.y = 0.4;
      group.add(stack);
      group.add(at(hit(new THREE.BoxGeometry(9, 1, 7), id), 0, 0.5, 0));
      ring = selRing(5.5);
      break;
    }
    case 'phPaper': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4.5, 1.2, 2.2, 2, 0.15), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 })));
      box.position.y = 0.6;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 40;
      const g = c.getContext('2d')!;
      const cols = ['#d7191c', '#f17c4a', '#fec980', '#ffffbf', '#c7e9ad', '#80bfab', '#2b83ba', '#4b3a8f'];
      cols.forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect(i * 32, 0, 32, 40);
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      disposables.push(tex);
      const chart = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.7), new THREE.MeshBasicMaterial({ map: tex }));
      chart.rotation.x = -Math.PI / 2;
      chart.position.y = 1.22;
      group.add(box, chart);
      group.add(at(hit(new THREE.BoxGeometry(4.5, 1.4, 2.4), id), 0, 0.6, 0));
      ring = selRing(3);
      break;
    }
    case 'shield': {
      // Pantalla de policarbonato oscuro en un pie: se coloca entre la vista y la cinta de Mg (§13.1).
      const inner = new THREE.Group();
      const paneMat = new THREE.MeshPhysicalMaterial({ color: 0x2f3a2f, roughness: 0.1, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(SHIELD.halfW * 2, SHIELD.halfH * 2), paneMat);
      pane.position.y = SHIELD.standH + SHIELD.halfH;
      pane.renderOrder = 6;
      const frame = new THREE.Group();
      for (const [ww, hh, x, y] of [[SHIELD.halfW * 2 + 0.6, 0.5, 0, SHIELD.standH + SHIELD.halfH * 2 + 0.2], [SHIELD.halfW * 2 + 0.6, 0.5, 0, SHIELD.standH - 0.2], [0.5, SHIELD.halfH * 2, SHIELD.halfW + 0.2, SHIELD.standH + SHIELD.halfH], [0.5, SHIELD.halfH * 2, -SHIELD.halfW - 0.2, SHIELD.standH + SHIELD.halfH]]) {
        const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.6), mats.blackPlastic));
        b.position.set(x, y, 0);
        frame.add(b);
      }
      const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, SHIELD.standH, 10), mats.darkMetal));
      post.position.y = SHIELD.standH / 2;
      const foot = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 0.8, 5, 2, 0.2), mats.darkMetal));
      foot.position.y = 0.4;
      const tex = labelTexture(['PANTALLA', 'no mirar el Mg directamente'], { band: '#1f2a1f', w: 256, h: 80 });
      disposables.push(tex, paneMat);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.1), new THREE.MeshStandardMaterial({ map: tex }));
      plate.position.set(0, SHIELD.standH - 1.2, 0.31);
      inner.add(pane, frame, post, foot, plate);
      group.add(inner);
      inner.add(at(hit(new THREE.BoxGeometry(SHIELD.halfW * 2 + 1, SHIELD.standH + SHIELD.halfH * 2, 1.4), id), 0, (SHIELD.standH + SHIELD.halfH * 2) / 2, 0));
      const q4 = new THREE.Quaternion();
      const wp = new THREE.Vector3();
      update = (ctx, ob) => {
        // Colocada: de frente a la cámara (gira en el plano de la mesada); en reposo, según su pose.
        if (ob.support === 'stand' || ob.support === 'hand') {
          group.getWorldPosition(wp);
          inner.rotation.set(0, Math.atan2(ctx.camPos.x - wp.x, ctx.camPos.z - wp.z), 0);
        } else inner.rotation.set(0, ob.pose.rotationRad, 0);
        inner.updateWorldMatrix(true, false);
        const s = labShield;
        if (!s) return;
        pane.getWorldPosition(s.center);
        pane.getWorldQuaternion(q4);
        s.u.set(1, 0, 0).applyQuaternion(q4);
        s.v.set(0, 1, 0).applyQuaternion(q4);
        s.n.set(0, 0, 1).applyQuaternion(q4);
        s.halfW = SHIELD.halfW;
        s.halfH = SHIELD.halfH;
        s.on = ob.support === 'stand' || ob.support === 'hand';
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

/** Rectángulo de la pantalla para Mg (lo comparte la vista con el controlador a través de la fachada). */
let labShield: { on: boolean; center: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3; halfW: number; halfH: number } | null = null;
export function bindShieldRect(s: typeof labShield) {
  labShield = s;
}
