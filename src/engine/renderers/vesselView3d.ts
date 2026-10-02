/**
 * Vistas 3D procedurales de recipientes y herramientas (§3.5): `createVesselVisual(v)` → VisualHandle.
 * Origen local = centro de la base del objeto; Y hacia arriba. Solo leen el estado; reemplazables por .glb.
 */
import * as THREE from 'three';
import type { Vessel } from '../../simulation/entities/types';
import type { SubstanceId } from '../../simulation/substances/types';
import { liquidVolumeMl, mixMassG } from '../../simulation/solutions/mixture';
import { FUNNEL_PAPER_RIM_Y, FUNNEL_STEM_CM, PROFILES } from '../../practices/practice-02/instruments';
import { SHAPES, markHeight } from '../physics/geometry';
import { VESSEL_DIM } from '../physics/dimensions';
import { cavityGeometry, shellGeometry, wrapGeometry } from './lathe';
import { Contents3D } from './contents3d';
import { type FrameCtx, seededPoints, visualPose } from './frame';
import { graduationTexture, labelTexture, tapeTexture } from './textures';
import { materials } from './materials';
import { QUALITY, type QualityLevel } from '../quality';
import { liquidMaterial } from './materials';

export interface VisualHandle {
  /** Grupo raíz (lo transforma el cuerpo rígido). */
  group: THREE.Group;
  update(ctx: FrameCtx, v: Vessel, pivotWorldY: number): void;
  dispose(): void;
}

const JAR_LABEL: Record<string, [string, string]> = {
  jar_zn: ['Zinc', 'Zn · granalla'], jar_graphite: ['Grafito', 'C · polvo'], jar_s: ['Azufre', 'S · polvo'],
  jar_nacl: ['Cloruro de sodio', 'NaCl'], jar_sucrose: ['Sacarosa', 'C₁₂H₂₂O₁₁'], jar_mix: ['Carbón + KNO₃', 'mezcla 1:5'],
  jar_kno3: ['Nitrato de potasio', 'KNO₃'], vial: ['Muestra', '2,50 g'],
};
const OXIDIZERS = new Set(['jar_mix', 'jar_kno3', 'vial']);

const ringSel = new THREE.RingGeometry(0.92, 1.0, 40);

function selectionRing(): THREE.Mesh {
  const m = new THREE.Mesh(ringSel, new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.renderOrder = 3;
  return m;
}

function labelPlane(tex: THREE.Texture, r: number, h: number, arc: number, y: number): THREE.Mesh {
  const m = new THREE.Mesh(wrapGeometry(r, h, arc), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, side: THREE.FrontSide }));
  m.position.y = y;
  return m;
}

function hitProxy(r: number, h: number, y0 = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), materials('LOW').hit);
  m.position.y = y0 + h / 2;
  return m;
}

function shardsGroup(seed: string, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  for (const [a, b, c] of seededPoints(seed + 'shards', 12)) {
    const s = 0.5 + c * 1.1;
    const shape = new THREE.Shape([new THREE.Vector2(0, s), new THREE.Vector2(s * 0.8, -s * 0.2), new THREE.Vector2(-s * 0.5, -s * 0.4)]);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    m.rotation.set(-Math.PI / 2 + (c - 0.5) * 0.3, 0, a * 6);
    m.position.set((a - 0.5) * 7, 0.05 + c * 0.1, (b - 0.5) * 5);
    g.add(m);
  }
  return g;
}

/** Recipientes con perfil de revolución y contenido. */
function profileVessel(v: Vessel, q: QualityLevel): VisualHandle {
  const mats = materials(q);
  const seg = QUALITY[q].latheSegments;
  const shape = SHAPES[v.type]!;
  const prof = shape.profile;
  const group = new THREE.Group();
  const anim = new THREE.Group();
  group.add(anim);
  const isGlass = prof.material === 'glass';
  const isWaste = v.type === 'WASTE';
  const isBucket = v.type === 'ICE_BUCKET';
  let shellMat: THREE.Material = isGlass ? mats.glass : v.type === 'PORCELAIN_DISH' ? mats.porcelain : mats.plasticWhite;
  if (isWaste) shellMat = new THREE.MeshStandardMaterial({ color: v.id === 'waste_solid' ? 0xf2c230 : 0x3f7fc0, roughness: 0.55 });
  if (isBucket) shellMat = new THREE.MeshStandardMaterial({ color: 0x3b6fb0, roughness: 0.6 });
  if (v.type === 'REAGENT_BOTTLE') shellMat = mats.amberGlass;
  const innerOverride = v.type === 'FUNNEL' ? ([[0.25, -FUNNEL_STEM_CM], [0.25, 0], [3.1, 4.0]] as Array<[number, number]>) : undefined;
  const shell = new THREE.Mesh(shellGeometry(v.type, prof, seg, innerOverride), shellMat);
  shell.castShadow = !isGlass;
  shell.receiveShadow = true;
  shell.renderOrder = isGlass ? 2 : 0;
  // Sombra suave también para el vidrio (malla opaca invisible que solo proyecta sombra).
  if (isGlass && QUALITY[q].shadows) {
    const sh = new THREE.Mesh(cavityGeometry(v.type + 'sh', prof, 12, -0.05), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    sh.castShadow = true;
    anim.add(sh);
  }
  anim.add(shell);
  const contents = new Contents3D(v.id, shape, v.type, seg);
  anim.add(contents.root);
  if (v.type === 'GRADUATED_CYLINDER') {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.6, 6), mats.glass);
    foot.position.y = 0.3;
    foot.renderOrder = 2;
    anim.add(foot);
    const marks: Array<[number, boolean, string?]> = [];
    const y0 = prof.bottomY;
    const H = prof.rimY - y0;
    for (let i = 1; i <= 50; i++) {
      const ml = i * 0.2;
      const vv = (markHeight(shape, ml) - y0) / H;
      marks.push([vv, i % 5 === 0, i % 10 === 0 ? String(ml) : undefined]);
    }
    const tex = graduationTexture(marks, '#123a63', { title: '10 mL', sub: '±0,2 · 20 °C' });
    anim.add(labelPlane(tex, prof.outerR + 0.012, H, 1.1, y0 + H / 2));
  }
  if (v.type === 'BEAKER') {
    const y0 = prof.bottomY;
    const H = prof.rimY - y0;
    const marks: Array<[number, boolean, string?]> = [10, 20, 30, 40, 50].map((ml) => [(markHeight(shape, ml) - y0) / H, true, String(ml)]);
    const tex = graduationTexture(marks, '#ffffff', { title: '50 mL', sub: 'BORO 3.3' });
    anim.add(labelPlane(tex, prof.outerR + 0.012, H, 0.9, y0 + H / 2));
  }
  if (v.type === 'REAGENT_JAR' || v.type === 'VIAL') {
    const lab = JAR_LABEL[v.id] ?? ['Reactivo', ''];
    const tex = labelTexture(v.type === 'VIAL' ? [lab[1]] : lab, { picto: OXIDIZERS.has(v.id) ? 'ox' : undefined });
    anim.add(labelPlane(tex, prof.outerR + 0.015, v.type === 'VIAL' ? 1.4 : 2.2, v.type === 'VIAL' ? 1.6 : 1.5, prof.rimY * 0.5));
    const thread = new THREE.Mesh(new THREE.TorusGeometry(prof.mouthR + 0.12, 0.12, 6, 28), mats.blackPlastic);
    thread.rotation.x = Math.PI / 2;
    thread.position.y = prof.rimY - 0.3;
    anim.add(thread);
  }
  if (v.type === 'REAGENT_BOTTLE') {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.8, 1.0, 20), mats.amberGlass);
    neck.position.y = prof.rimY + 0.5;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 20), mats.blackPlastic);
    cap.position.y = prof.rimY + 1.6;
    cap.castShadow = true;
    anim.add(neck, cap);
    anim.add(labelPlane(labelTexture([v.id === 'bottle_oil' ? 'Aceite' : 'Reactivo', 'uso de laboratorio']), prof.outerR + 0.015, 2.4, 1.6, 3.2));
  }
  if (v.type === 'WASH_BOTTLE') {
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(1.1, prof.outerR, 1.4, 24), mats.plasticWhite);
    shoulder.position.y = prof.rimY + 0.7;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.3, 20), mats.plasticBlue);
    cap.position.y = prof.rimY + 2.0;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, prof.rimY + 2.6, 0), new THREE.Vector3(1.0, prof.rimY + 5.4, 0), new THREE.Vector3(5.5, prof.rimY + 2.6, 0));
    const nozzle = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.16, 8), mats.plasticWhite);
    anim.add(shoulder, cap, nozzle);
    anim.add(labelPlane(labelTexture(['Agua destilada', 'H₂O'], { color: '#e8f3ff' }), prof.outerR + 0.02, 3, 1.4, prof.rimY * 0.5));
  }
  if (v.type === 'JUG') {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.45, 8, 24, Math.PI), mats.plasticWhite);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(prof.outerR, prof.rimY * 0.55, 0);
    anim.add(handle);
    anim.add(labelPlane(labelTexture(['Agua del grifo']), prof.outerR + 0.02, 2.5, 1.2, prof.rimY * 0.55));
  }
  if (isWaste) {
    anim.add(labelPlane(labelTexture([v.id === 'waste_solid' ? 'Residuos sólidos' : 'Residuos líquidos', 'no verter al desagüe'], { picto: 'warn' }), prof.outerR + 0.02, 3.4, 1.5, prof.rimY * 0.55));
  }
  if (isBucket) anim.add(labelPlane(labelTexture(['Hielo']), prof.outerR + 0.02, 2.2, 1.0, prof.rimY * 0.5));
  if (v.type === 'BATH') anim.add(labelPlane(labelTexture(['Baño (cristalizador)']), prof.outerR + 0.02, 1.6, 1.2, 1.5));

  // Papel de filtro dentro del embudo + torta de carbón.
  let paperCone: THREE.Mesh | null = null;
  let cake: THREE.Mesh | null = null;
  let tear: THREE.Mesh | null = null;
  let overflow: THREE.Mesh | null = null;
  let badPaperMat: THREE.MeshStandardMaterial | null = null;
  if (v.type === 'FUNNEL') {
    badPaperMat = (mats.paper as THREE.MeshStandardMaterial).clone();
    badPaperMat.color.setHex(0xfff2d6);
    const ph = FUNNEL_PAPER_RIM_Y - 0.12;
    const rTop = 0.25 + (3.1 - 0.25) * (ph / 4);
    paperCone = new THREE.Mesh(new THREE.ConeGeometry(rTop - 0.06, ph, seg, 1, true), mats.paper);
    paperCone.rotation.x = Math.PI;
    paperCone.position.y = ph / 2 + 0.12;
    // Lámina de líquido entre el papel y el vidrio (rebalse sin filtrar).
    overflow = new THREE.Mesh(
      new THREE.ConeGeometry(rTop - 0.02, ph + 0.3, seg, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x9cc6e6, transparent: true, opacity: 0.55, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    );
    overflow.rotation.x = Math.PI;
    overflow.position.y = (ph + 0.3) / 2 + 0.05;
    overflow.name = 'funnel:overflow';
    overflow.visible = false;
    anim.add(overflow);
    cake = new THREE.Mesh(new THREE.ConeGeometry(1, 1, seg, 1, false), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 }));
    cake.rotation.x = Math.PI;
    tear = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1.4), new THREE.MeshBasicMaterial({ color: 0x8a1a12, side: THREE.DoubleSide }));
    paperCone.name = 'funnel:paper';
    cake.name = 'funnel:cake';
    tear.name = 'funnel:tear';
    tear.position.set(0.4, 1.2, 0.95);
    tear.rotation.z = 0.5;
    anim.add(paperCone, cake, tear);
  }

  // Tubos: rótulo de cinta.
  let tape: THREE.Mesh | null = null;
  let tapeText = '';
  const ring = selectionRing();
  group.add(ring);
  const shards = shardsGroup(v.id, mats.glass);
  shards.visible = false;
  group.add(shards);
  const dim = VESSEL_DIM[v.type];
  const proxy = hitProxy(dim.footR + 0.25, dim.h + (v.type === 'FUNNEL' ? 0 : 0.3), v.type === 'FUNNEL' ? -FUNNEL_STEM_CM : 0);
  proxy.userData = { objId: v.id };
  anim.add(proxy);

  return {
    group,
    update(ctx, vv, pivotY) {
      const vp = visualPose(ctx, vv.id, vv.agitation, vv.agitationTool);
      const broken = vv.integrity === 0;
      const hidden = vv.support === 'glass_waste';
      group.visible = !hidden;
      anim.visible = !broken;
      shards.visible = broken;
      anim.position.set(vp.dx, vp.dz, -vp.dy);
      anim.rotation.z = -vp.rot;
      if (v.type === 'WASH_BOTTLE') {
        const s = ctx.squeezingId === vv.id ? 0.86 : vp.squeeze;
        anim.scale.set(s, 1, s);
      }
      if (isGlass) shell.material = v.type === 'REAGENT_BOTTLE' ? mats.amberGlass : vv.temperatureC > 60 ? mats.glassHot : mats.glass;
      // Contenido (el ángulo total incluye la animación; si está volcado y en reposo, no se dibuja líquido).
      const angle = vv.pose.rotationRad + vp.rot;
      const tipped = vv.tipped && !!vv.pose.quat;
      contents.update(vv, ctx, angle, pivotY + vp.dz, !broken && !tipped && !isWaste);
      // Rótulo del tubo.
      if (v.type === 'TEST_TUBE') {
        const want = vv.label ?? '';
        if (want !== tapeText) {
          tapeText = want;
          if (tape) {
            anim.remove(tape);
            ((tape.material as THREE.MeshStandardMaterial).map as THREE.Texture | null)?.dispose();
          }
          tape = want ? labelPlane(tapeTexture(want), prof.outerR + 0.015, 1.3, 1.5, prof.rimY - 2.2) : null;
          if (tape) anim.add(tape);
        }
      }
      // Papel en el embudo.
      if (paperCone && cake && tear) {
        const pid = vv.funnel?.paperId;
        const paper = pid ? ctx.world.vessels[pid] : undefined;
        paperCone.visible = !!paper;
        // Plegado defectuoso: tono propio (material aparte; el compartido no se modifica).
        paperCone.material = paper?.filter?.fold === 'CONE_BAD' && badPaperMat ? badPaperMat : paper?.filter?.wetted ? mats.wetPaper : mats.paper;
        // Rebalse: el líquido pasa por encima del borde del papel y baja entre papel y vidrio sin filtrar.
        overflow!.visible = !!paper && (!!paper.filter?.overflowed && liquidVolumeMl(vv.mix, ctx.subs) > 0.05);
        const carbon = paper?.mix.solid.CARBON ?? 0;
        cake.visible = !!paper && carbon > 0.002;
        const hh = Math.min(1.8, 0.35 + carbon * 2.6);
        const rr = 0.25 + (3.1 - 0.25) * (hh / 4) - 0.1;
        cake.scale.set(rr, hh, rr);
        cake.position.y = hh / 2 + 0.14;
        tear.visible = !!paper?.filter?.torn;
      }
      // Selección / encaje.
      const sel = ctx.selected === vv.id;
      const hov = ctx.hovered === vv.id;
      const snap = ctx.snapTarget === vv.id;
      ring.visible = (sel || hov || snap) && !hidden;
      (ring.material as THREE.MeshBasicMaterial).color.setHex(snap ? 0x2ecc71 : sel ? 0xffb000 : 0x5aa9ff);
      ring.scale.setScalar(dim.footR + 0.6);
    },
    dispose() {
      contents.dispose();
      badPaperMat?.dispose();
    },
  };
}

/** Herramientas y objetos sin perfil (espátula, pala, gotero, papel absorbente, papel de pesada, papel de filtro). */
function simpleVessel(v: Vessel, q: QualityLevel): VisualHandle {
  const mats = materials(q);
  const group = new THREE.Group();
  const anim = new THREE.Group();
  group.add(anim);
  const ring = selectionRing();
  group.add(ring);
  const dim = VESSEL_DIM[v.type];
  let proxy: THREE.Mesh;
  let updateFn: (ctx: FrameCtx, vv: Vessel) => void = () => undefined;

  if (v.type === 'SPATULA' || v.type === 'SCOOP') {
    const scoop = v.type === 'SCOOP';
    const L = scoop ? 9 : 14;
    const tool = new THREE.Group();
    if (scoop) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(L - 4, 0.5, 0.8), mats.plasticBlue);
      handle.position.set(-2, 0.4, 0);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(2.0, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a8fc8, roughness: 0.5, side: THREE.DoubleSide }));
      bowl.scale.set(1.2, 0.6, 1);
      bowl.position.set(L / 2 - 2, 1.4, 0);
      tool.add(handle, bowl);
    } else {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(L - 3, 0.12, 0.45), mats.steel);
      shaft.position.set(-1, 0.3, 0);
      const spoon = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc4ccd3, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }));
      spoon.scale.set(1.6, 0.35, 1);
      spoon.position.set(L / 2 - 1.8, 0.45, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.9), mats.steel);
      blade.position.set(-L / 2 + 0.6, 0.3, 0);
      tool.add(shaft, spoon, blade);
    }
    tool.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    anim.add(tool);
    const load = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    load.position.set(L / 2 - 1.8, 0.65, 0);
    load.scale.set(1.3, 0.45, 0.8);
    const ice = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), mats.ice);
      c.position.set(L / 2 - 2.8 + i * 0.7, 1.8 + (i % 2) * 0.5, (i % 2) * 0.6 - 0.3);
      ice.add(c);
    }
    anim.add(load, ice);
    proxy = hitProxy(1.4, 2.2);
    proxy.scale.set(L / 2.8, 1, 1);
    updateFn = (ctx, vv) => {
      const solid = Object.entries(vv.mix.solid);
      const total = solid.reduce((s, [, g]) => s + (g ?? 0), 0);
      load.visible = !scoop && total > 0.006;
      if (load.visible) {
        const main = solid.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0][0] as SubstanceId;
        (load.material as THREE.MeshStandardMaterial).color.setHex(ctx.subs[main].colorHex);
        const s = 0.8 + Math.min(1, total * 4);
        load.scale.set(1.3 * s, 0.45 * s, 0.8 * s);
      }
      ice.visible = scoop && vv.mix.iceG > 0;
    };
  } else if (v.type === 'DROPPER') {
    const tool = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.1, 6.5, 12), mats.glass);
    tube.position.y = 3.25;
    tube.renderOrder = 2;
    const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.4, 6, 12), mats.rubberRed);
    bulb.position.y = 7.4;
    bulb.castShadow = true;
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 1, 10), liquidMaterial(0xf0d77a, 0.85, []));
    tool.add(tube, bulb, fill);
    anim.add(tool);
    proxy = hitProxy(1.0, 9);
    updateFn = (ctx, vv) => {
      const upright = ctx.held === vv.id || (vv.support ?? '').startsWith('mouth:') || ctx.offset(vv.id) !== null;
      tool.rotation.z = upright ? 0 : Math.PI / 2;
      tool.position.set(upright ? 0 : 4, upright ? 0 : 0.45, 0);
      proxy.rotation.z = tool.rotation.z;
      proxy.position.set(upright ? 0 : 0, upright ? 4.5 : 0.5, 0);
      const vp = visualPose(ctx, vv.id);
      bulb.scale.set(vp.squeeze, 1, vp.squeeze);
      const vol = liquidVolumeMl(vv.mix, ctx.subs);
      fill.visible = vol > 0.005;
      const h = Math.min(1, vol) * 5;
      fill.scale.set(1, Math.max(0.01, h), 1);
      fill.position.y = 0.3 + h / 2;
      (fill.material as THREE.MeshPhysicalMaterial).color.setHex(Object.keys(vv.mix.oil).length ? 0xf0d77a : 0xcfe8ff);
    };
  } else if (v.type === 'TOWEL') {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 6.4), new THREE.MeshStandardMaterial({ color: i === 3 ? 0xfaf7ef : 0xebe5d6, roughness: 1 }));
      s.position.set(i * 0.12, 0.07 + i * 0.15, 0);
      s.castShadow = s.receiveShadow = true;
      anim.add(s);
    }
    const stain = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.35 }));
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.64;
    anim.add(stain);
    proxy = hitProxy(3.6, 1);
    updateFn = (_ctx, vv) => (stain.visible = mixMassG(vv.mix) > 0.003);
  } else if (v.type === 'WEIGH_PAPER') {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.05, 6), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.5 }));
    sheet.position.y = 0.03;
    sheet.receiveShadow = true;
    const heap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.95 }));
    const grains = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ roughness: 0.9 }), 80);
    grains.count = 0;
    anim.add(sheet, heap, grains);
    proxy = hitProxy(3.2, 1.2);
    let lastKey = '';
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    updateFn = (_ctx, vv) => {
      const solid = Object.values(vv.mix.solid).reduce((a, b) => a + (b ?? 0), 0);
      heap.visible = solid > 0.003;
      const rr = Math.min(2.6, 0.5 + Math.sqrt(solid) * 1.1);
      heap.scale.set(rr, rr * 0.45, rr);
      heap.position.y = 0.05 + rr * 0.225;
      const cf = (vv.mix.solid.CARBON ?? 0) / Math.max(solid, 1e-6);
      (heap.material as THREE.MeshStandardMaterial).color.setHex(cf > 0.1 ? 0x6e6e6e : 0xf3f4f6);
      const key = `${solid.toFixed(3)}|${cf.toFixed(2)}`;
      if (key !== lastKey) {
        lastKey = key;
        const pts = seededPoints(vv.id + 'heap', Math.min(80, Math.round(solid * 40)));
        let i = 0;
        for (const [a, b, c] of pts) {
          const ang = a * Math.PI * 2;
          const r = Math.sqrt(b) * rr;
          d.position.set(Math.cos(ang) * r, 0.05 + (1 - r / rr) * rr * 0.45 * 0.95, Math.sin(ang) * r);
          d.updateMatrix();
          grains.setMatrixAt(i, d.matrix);
          grains.setColorAt(i++, col.setHex(c < cf ? 0x1c1c1e : 0xf7f8fa));
        }
        grains.count = i;
        grains.instanceMatrix.needsUpdate = true;
        if (grains.instanceColor) grains.instanceColor.needsUpdate = true;
      }
    };
  } else {
    // FILTER_PAPER: plano → mitad → cuarto → cono abierto (§3.5).
    const flat = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40), mats.paper);
    flat.rotation.x = -Math.PI / 2;
    flat.position.y = 0.05;
    const half = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32, 0, Math.PI), mats.paper);
    half.rotation.x = -Math.PI / 2;
    half.position.y = 0.08;
    const quarter = new THREE.Mesh(new THREE.CircleGeometry(4.5, 20, 0, Math.PI / 2), mats.paper);
    quarter.rotation.x = -Math.PI / 2;
    quarter.position.set(-1.6, 0.1, 1.2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.8, 24, 1, true), mats.paper);
    cone.rotation.x = Math.PI;
    cone.position.y = 1.9;
    const crease = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 3.8), new THREE.MeshBasicMaterial({ color: 0xc9c9c0 }));
    crease.position.set(-0.6, 1.9, 1.3);
    crease.rotation.z = -0.3;
    const cake = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshStandardMaterial({ color: 0x1c1c1e }));
    cake.rotation.x = -Math.PI / 2;
    cake.position.y = 0.12;
    const tear = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), new THREE.MeshBasicMaterial({ color: 0x8a1a12 }));
    tear.rotation.x = -Math.PI / 2;
    tear.position.set(0.5, 0.13, 0.5);
    tear.rotation.z = 0.6;
    anim.add(flat, half, quarter, cone, crease, cake, tear);
    for (const m of [flat, half, quarter, cone]) m.castShadow = m.receiveShadow = true;
    proxy = hitProxy(4.5, 1.2);
    updateFn = (_ctx, vv) => {
      const fold = vv.filter?.fold ?? 'FLAT';
      const wet = vv.filter?.wetted;
      const m = wet ? mats.wetPaper : mats.paper;
      for (const p of [flat, half, quarter, cone]) p.material = m;
      flat.visible = fold === 'FLAT' || fold === 'CRUMPLED';
      half.visible = fold === 'HALF';
      quarter.visible = fold === 'QUARTER';
      cone.visible = crease.visible = fold === 'CONE_OK' || fold === 'CONE_BAD';
      (crease.material as THREE.MeshBasicMaterial).color.setHex(fold === 'CONE_BAD' ? 0xf5a623 : 0xc9c9c0);
      const carbon = vv.mix.solid.CARBON ?? 0;
      cake.visible = carbon > 0.003 && !cone.visible;
      cake.scale.setScalar(Math.min(2.5, 0.8 + carbon * 3));
      tear.visible = !!vv.filter?.torn && !cone.visible;
      proxy.scale.y = cone.visible ? 4 : 1;
    };
  }
  proxy.userData = { objId: v.id };
  anim.add(proxy);
  return {
    group,
    update(ctx, vv) {
      const vp = visualPose(ctx, vv.id, vv.agitation, vv.agitationTool);
      group.visible = vv.support !== 'glass_waste' && !(vv.type === 'FILTER_PAPER' && vv.support === 'funnel');
      anim.position.set(vp.dx, vp.dz, -vp.dy);
      anim.rotation.z = -vp.rot;
      updateFn(ctx, vv);
      const sel = ctx.selected === vv.id;
      const hov = ctx.hovered === vv.id;
      const snap = ctx.snapTarget === vv.id;
      ring.visible = sel || hov || snap;
      (ring.material as THREE.MeshBasicMaterial).color.setHex(snap ? 0x2ecc71 : sel ? 0xffb000 : 0x5aa9ff);
      ring.scale.setScalar(dim.footR + 0.6);
    },
    dispose() {},
  };
}

export function createVesselVisual(v: Vessel, q: QualityLevel): VisualHandle {
  return SHAPES[v.type] && v.type !== 'WEIGH_PAPER' ? profileVessel(v, q) : simpleVessel(v, q);
}

export { PROFILES };
