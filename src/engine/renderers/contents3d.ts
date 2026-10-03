/**
 * Contenido 3D de un recipiente a partir del estado del dominio (SOLO LECTURA) — §3.6:
 *  - líquido = volumen interior recortado por un PLANO HORIZONTAL del mundo (se mantiene horizontal al inclinar);
 *  - capas por fase (acuosa + aceite), turbidez por sólidos en suspensión, emulsión con gotas;
 *  - sedimento y trozos instanciados, partículas en suspensión/flotando, cristales de KNO₃ que aparecen
 *    gradualmente en posiciones de nucleación fijas por semilla, hielo flotante.
 */
import * as THREE from 'three';
import type { Vessel } from '../../simulation/entities/types';
import type { SubstanceId, SubstanceTable } from '../../simulation/substances/types';
import { aqueousVolumeMl, oilVolumeMl } from '../../simulation/solutions/mixture';
import { innerRadiusAt } from '../../practices/practice-02/instruments';
import { type VesselShape, liquidLevel } from '../physics/geometry';
import { cavityGeometry } from './lathe';
import { liquidMaterial } from './materials';
import { type FrameCtx, mixColor, seededPoints } from './frame';

/**
 * Agua: azul claro en lugar de casi incolora. El agua real es transparente, pero dentro de una probeta estrecha y
 * sobre la mesada oscura no se distinguía; con este tono se ve el volumen y el nivel sin confundirla con una disolución
 * coloreada (las turbias/coloreadas se mezclan a partir de este tono).
 */
const WATER = 0x4fa6ec;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const grainGeo = new THREE.DodecahedronGeometry(0.11, 0);
const chunkGeo = new THREE.DodecahedronGeometry(0.28, 0);
const suspGeo = new THREE.IcosahedronGeometry(0.06, 0);
const dropGeo = new THREE.SphereGeometry(0.14, 8, 6);
const crystalGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const iceGeo = new THREE.BoxGeometry(1, 1, 1);
const capGeo = new THREE.CircleGeometry(1, 40);
const ringGeo = new THREE.TorusGeometry(1, 0.025, 6, 40);

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, n: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.count = 0;
  m.castShadow = false;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

export class Contents3D {
  readonly root = new THREE.Group();
  private planeAq = new THREE.Plane(DOWN.clone(), 0);
  private planeOilTop = new THREE.Plane(DOWN.clone(), 0);
  private planeOilBottom = new THREE.Plane(UP.clone(), 0);
  private aq: THREE.Mesh;
  private aqMat: THREE.MeshPhysicalMaterial;
  private aqCap: THREE.Mesh;
  private aqCapMat: THREE.MeshPhysicalMaterial;
  private meniscus: THREE.Mesh;
  private oil: THREE.Mesh;
  private oilMat: THREE.MeshPhysicalMaterial;
  private oilCap: THREE.Mesh;
  private grains: THREE.InstancedMesh;
  private chunks: THREE.InstancedMesh;
  private susp: THREE.InstancedMesh;
  private drops: THREE.InstancedMesh;
  private crystals: THREE.InstancedMesh;
  private ice: THREE.InstancedMesh;
  private heap: THREE.Mesh;
  private heapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  private lastKey = '';
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private levelAq = 0;

  constructor(private id: string, private shape: VesselShape, name: string, seg: number) {
    const cav = cavityGeometry(name, shape.profile, seg);
    this.aqMat = liquidMaterial(WATER, 0.55, [this.planeAq]);
    this.aq = new THREE.Mesh(cav, this.aqMat);
    this.aq.renderOrder = 1;
    this.aqCapMat = liquidMaterial(WATER, 0.45, []);
    this.aqCapMat.side = THREE.DoubleSide;
    this.aqCap = new THREE.Mesh(capGeo, this.aqCapMat);
    this.aqCap.rotation.x = -Math.PI / 2;
    this.aqCap.renderOrder = 1;
    this.meniscus = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x1f5f96, transparent: true, opacity: 0.9, depthWrite: false }));
    this.meniscus.rotation.x = -Math.PI / 2;
    this.meniscus.renderOrder = 1;
    this.oilMat = liquidMaterial(0xf0d77a, 0.75, [this.planeOilTop, this.planeOilBottom]);
    this.oil = new THREE.Mesh(cav, this.oilMat);
    this.oil.renderOrder = 1;
    this.oilCap = new THREE.Mesh(capGeo, liquidMaterial(0xf0d77a, 0.8, []));
    this.oilCap.rotation.x = -Math.PI / 2;
    this.oilCap.renderOrder = 1;
    const solidMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    this.grains = instanced(grainGeo, solidMat, 180);
    this.chunks = instanced(chunkGeo, new THREE.MeshStandardMaterial({ color: 0xa9b1ba, metalness: 0.85, roughness: 0.35 }), 40);
    this.susp = instanced(suspGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 140);
    this.drops = instanced(dropGeo, new THREE.MeshPhysicalMaterial({ color: 0xf0d77a, roughness: 0.1, transparent: true, opacity: 0.85 }), 60);
    this.crystals = instanced(crystalGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.95 }), 110);
    this.ice = instanced(iceGeo, new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.12, transparent: true, opacity: 0.78, clearcoat: 1 }), 18);
    this.heap = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), this.heapMat);
    this.root.add(this.aq, this.aqCap, this.meniscus, this.oil, this.oilCap, this.heap, this.grains, this.chunks, this.susp, this.drops, this.crystals, this.ice);
    // Nombres estables para inspección (pruebas visuales: cristales graduales, líquido horizontal).
    this.crystals.name = `crystals:${id}`;
    this.aq.name = `liquid:${id}`;
  }

  /**
   * @param angle inclinación total (rad) del recipiente; @param pivotY altura del pivote en el mundo (escena).
   */
  update(v: Vessel, ctx: FrameCtx, angle: number, pivotY: number, visible: boolean) {
    const m = v.mix;
    const subs = ctx.subs;
    this.root.visible = visible;
    if (!visible) return;
    const aq = aqueousVolumeMl(m, subs);
    const oil = oilVolumeMl(m, subs);
    // Volumen de sedimento (eleva el nivel del líquido).
    let sedMl = 0;
    const sediment: Array<[SubstanceId, number]> = [];
    for (const k of Object.keys(m.solid) as SubstanceId[]) {
      const g = (m.solid[k] ?? 0) * (1 - Math.max(m.suspended[k] ?? 0, subs[k].particle.floatFraction));
      if (g > 0.0005) {
        sediment.push([k, g]);
        sedMl += (g / subs[k].densityGPerMl) * 1.6;
      }
    }
    const cryst = m.crystals?.massG ?? 0;
    if (cryst > 0) sedMl += (cryst / 2.11) * 1.6;
    const sh = this.shape;
    const upright = Math.abs(angle) < 0.08;
    const hasAq = aq > 0.004;
    this.levelAq = hasAq ? liquidLevel(sh, angle, aq + sedMl) : sh.baseOffset;
    const levelAll = oil > 0.002 ? liquidLevel(sh, angle, aq + sedMl + oil) : this.levelAq;
    // Planos de nivel en coordenadas del MUNDO: el líquido queda horizontal aunque el recipiente gire.
    this.planeAq.constant = pivotY + this.levelAq;
    this.planeOilTop.constant = pivotY + levelAll;
    this.planeOilBottom.constant = -(pivotY + this.levelAq);
    this.aq.visible = hasAq;
    this.oil.visible = oil > 0.002 && m.emulsion < 0.15;
    // Superficie (tapa) y menisco solo con el recipiente vertical (al inclinar se ve el volumen recortado).
    const rAq = innerRadiusAt(sh.profile, this.levelAq) - 0.02;
    this.aqCap.visible = hasAq && upright && !this.oil.visible;
    this.aqCap.position.set(0, this.levelAq, 0);
    this.aqCap.scale.setScalar(Math.max(0.01, rAq));
    this.meniscus.visible = hasAq && upright && v.type === 'GRADUATED_CYLINDER';
    this.meniscus.position.set(0, this.levelAq + 0.02, 0);
    this.meniscus.scale.setScalar(Math.max(0.01, rAq));
    const rOil = innerRadiusAt(sh.profile, levelAll) - 0.02;
    this.oilCap.visible = this.oil.visible && upright;
    this.oilCap.position.set(0, levelAll, 0);
    this.oilCap.scale.setScalar(Math.max(0.01, rOil));
    // Ondulación leve de la superficie al agitar (sin cambiar datos).
    if (upright && v.agitation > 0.1 && !ctx.reducedMotion) {
      this.aqCap.rotation.set(-Math.PI / 2 + Math.sin(ctx.t * 9) * 0.05 * v.agitation, Math.cos(ctx.t * 9) * 0.05 * v.agitation, 0);
    } else this.aqCap.rotation.set(-Math.PI / 2, 0, 0);

    // Color y turbidez de la fase acuosa.
    let tint = WATER;
    let alpha = 0.55;
    let dark = 0;
    let yellow = 0;
    for (const k of Object.keys(m.solid) as SubstanceId[]) {
      const s = (m.solid[k] ?? 0) * (m.suspended[k] ?? 0);
      if (subs[k].particle.kind === 'POWDER') {
        if (k === 'S8') yellow += s;
        else dark += s;
      }
    }
    const cDark = dark / Math.max(aq, 0.1);
    if (cDark > 0) {
      tint = mixColor(tint, 0x1c1c1e, Math.min(0.92, cDark * 25));
      alpha = Math.min(0.94, alpha + cDark * 22);
    }
    if (yellow > 0) tint = mixColor(tint, 0xf2d72c, Math.min(0.6, (yellow / Math.max(aq, 0.1)) * 15));
    if (m.emulsion > 0.1 && oil > 0) {
      tint = mixColor(tint, 0xf6f2e2, m.emulsion * 0.7);
      alpha = Math.min(0.9, alpha + m.emulsion * 0.45);
    }
    this.aqMat.color.setHex(tint);
    this.aqMat.emissive.setHex(tint); // la luz propia sigue al color (una suspensión de carbón no brilla en azul)
    this.aqMat.opacity = alpha;
    this.aqCapMat.color.setHex(mixColor(tint, 0xffffff, 0.25));
    this.aqCapMat.emissive.setHex(mixColor(tint, 0xffffff, 0.25));
    this.aqCapMat.opacity = Math.min(0.95, alpha + 0.12);
    const oilKey = Object.keys(m.oil)[0] as SubstanceId | undefined;
    if (oilKey) {
      this.oilMat.color.setHex(subs[oilKey].colorHex);
      (this.oilCap.material as THREE.MeshPhysicalMaterial).color.setHex(subs[oilKey].colorHex);
    }

    // Partículas: solo se recalculan cuando cambia el contenido visible.
    const key = [
      Object.entries(m.solid).map(([k, g]) => `${k}:${(g ?? 0).toFixed(3)}:${(m.suspended[k as SubstanceId] ?? 0).toFixed(2)}`).join(','),
      cryst.toFixed(4), m.crystals?.meanSizeMm.toFixed(2), Math.round(m.iceG), m.emulsion.toFixed(2), (aq + oil).toFixed(2), upright, ctx.quality,
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.layoutParticles(v, ctx, sediment, sedMl, upright);
  }

  private layoutParticles(v: Vessel, ctx: FrameCtx, sediment: Array<[SubstanceId, number]>, sedMl: number, upright: boolean) {
    const m = v.mix;
    const subs: SubstanceTable = ctx.subs;
    const sh = this.shape;
    const q = ctx.quality === 'LOW' ? 0.4 : ctx.quality === 'MEDIUM' ? 0.7 : 1;
    const d = this.dummy;
    const bottom = sh.baseOffset;
    const rBottom = Math.max(0.2, innerRadiusAt(sh.profile, bottom + 0.4) * 0.88);
    const heapH = Math.min((sh.h - bottom) * 0.45, Math.max(0.08, sedMl / (Math.PI * rBottom * rBottom)));
    // Montículo base del sedimento.
    const total = sediment.reduce((s, [, g]) => s + g, 0);
    if (sediment.length && sedMl > 0.05) {
      const main = sediment.slice().sort((a, b) => b[1] - a[1])[0][0];
      this.heapMat.color.setHex(subs[main].colorHex);
      this.heapMat.metalness = main === 'Zn' ? 0.7 : 0;
      this.heap.visible = true;
      this.heap.scale.set(rBottom * 0.95, heapH * 0.6, rBottom * 0.95);
      this.heap.position.set(0, bottom + (heapH * 0.6) / 2, 0);
    } else this.heap.visible = false;
    // Granos y trozos.
    let gi = 0;
    let ci = 0;
    for (const [sid, g] of sediment) {
      const def = subs[sid];
      const n = Math.round(Math.min(120, Math.sqrt(g / Math.max(total, 1e-6)) * 50 + g * 60) * q);
      const pts = seededPoints(this.id + sid + 'sed', n);
      for (const [a, b, c] of pts) {
        const ang = a * Math.PI * 2;
        const rad = Math.sqrt(b) * rBottom;
        const y = bottom + 0.05 + c * heapH * (1 - (rad / rBottom) ** 2 * 0.5);
        d.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
        d.rotation.set(a * 6, b * 6, c * 6);
        if (def.particle.kind === 'CHUNK') {
          if (ci >= this.chunks.instanceMatrix.count) continue;
          d.scale.setScalar(0.7 + c * 0.6);
          d.updateMatrix();
          this.chunks.setMatrixAt(ci++, d.matrix);
        } else {
          if (gi >= 180) continue;
          d.scale.setScalar(def.particle.kind === 'CRYSTAL' ? 0.8 + c * 0.6 : 0.6 + c * 0.5);
          d.updateMatrix();
          this.grains.setMatrixAt(gi, d.matrix);
          this.grains.setColorAt(gi++, this.color.setHex(def.colorHex));
        }
      }
    }
    this.grains.count = gi;
    this.chunks.count = ci;
    this.grains.instanceMatrix.needsUpdate = true;
    this.chunks.instanceMatrix.needsUpdate = true;
    if (this.grains.instanceColor) this.grains.instanceColor.needsUpdate = true;
    // Suspendidas y flotantes.
    let si = 0;
    const level = this.levelAq;
    const hasLiquid = m.waterG > 0.05;
    if (hasLiquid) {
      for (const sid of Object.keys(m.solid) as SubstanceId[]) {
        const def = subs[sid];
        const gs = (m.solid[sid] ?? 0) * (m.suspended[sid] ?? 0);
        const gf = (m.solid[sid] ?? 0) * def.particle.floatFraction;
        const ns = Math.round(Math.min(90, 6 + gs * 260) * q * (gs > 0.0005 ? 1 : 0));
        for (const [a, b, c] of seededPoints(this.id + sid + 'susp', ns)) {
          if (si >= 140) break;
          const y = bottom + 0.1 + b * Math.max(0.05, level - bottom - 0.2);
          const r = innerRadiusAt(sh.profile, y) * 0.85 * Math.sqrt(a);
          const ang = c * Math.PI * 2;
          d.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
          d.scale.setScalar(0.8 + c * 0.8);
          d.updateMatrix();
          this.susp.setMatrixAt(si, d.matrix);
          this.susp.setColorAt(si++, this.color.setHex(def.colorHex));
        }
        const nf = Math.round(Math.min(40, 4 + gf * 160) * q * (gf > 0.0005 && upright ? 1 : 0));
        for (const [a, b, c] of seededPoints(this.id + sid + 'float', nf)) {
          if (si >= 140) break;
          const r = innerRadiusAt(sh.profile, level) * 0.85 * Math.sqrt(a);
          const ang = b * Math.PI * 2;
          d.position.set(Math.cos(ang) * r, level - 0.03, Math.sin(ang) * r);
          d.scale.setScalar(1.2 + c);
          d.updateMatrix();
          this.susp.setMatrixAt(si, d.matrix);
          this.susp.setColorAt(si++, this.color.setHex(def.colorHex));
        }
      }
    }
    this.susp.count = si;
    this.susp.instanceMatrix.needsUpdate = true;
    if (this.susp.instanceColor) this.susp.instanceColor.needsUpdate = true;
    // Gotas de aceite (emulsión temporal: nunca disolución).
    let di = 0;
    if (m.emulsion > 0.15 && hasLiquid) {
      const n = Math.round(Math.min(60, 10 + m.emulsion * 50) * q);
      for (const [a, b, c] of seededPoints(this.id + 'emul', n)) {
        const y = bottom + 0.15 + b * Math.max(0.05, level - bottom - 0.3);
        const r = innerRadiusAt(sh.profile, y) * 0.8 * Math.sqrt(a);
        const ang = c * Math.PI * 2;
        d.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
        d.scale.setScalar(0.5 + c * 1.2);
        d.updateMatrix();
        this.drops.setMatrixAt(di++, d.matrix);
      }
    }
    this.drops.count = di;
    this.drops.instanceMatrix.needsUpdate = true;
    // Cristales de KNO₃: posiciones de nucleación fijas por semilla; aparecen al crecer la masa.
    let ki = 0;
    const cg = m.crystals?.massG ?? 0;
    if (cg > 0.0004 && m.crystals) {
      const n = Math.round(Math.min(110, Math.max(3, cg * 140)) * (0.6 + 0.4 * q));
      const size = Math.max(0.08, Math.min(0.5, m.crystals.meanSizeMm * 0.12));
      for (const [a, b, c] of seededPoints(this.id + 'cryst', n)) {
        const wall = c > 0.72;
        const y = wall ? bottom + 0.2 + b * Math.max(0.2, (hasLiquid ? level : bottom + 1) - bottom - 0.3) : bottom + 0.05 + b * 0.25;
        const rr = innerRadiusAt(sh.profile, y) * (wall ? 0.95 : 0.85 * Math.sqrt(a));
        const ang = a * Math.PI * 2 + c;
        d.position.set(Math.cos(ang) * rr, y, Math.sin(ang) * rr);
        d.rotation.set(b * 3, a * 6, c * 3);
        const s = size * (0.6 + c * 0.9);
        d.scale.set(s * 0.45, s * (2 + c * 2), s * 0.45);
        d.updateMatrix();
        this.crystals.setMatrixAt(ki++, d.matrix);
      }
    }
    this.crystals.count = ki;
    this.crystals.instanceMatrix.needsUpdate = true;
    // Hielo flotante.
    let ii = 0;
    if (m.iceG > 1 && upright) {
      const n = Math.max(1, Math.min(16, Math.round(m.iceG / 12)));
      const side = Math.max(0.6, Math.min(2.4, Math.cbrt(m.iceG / n / 0.92)));
      const rl = innerRadiusAt(sh.profile, Math.max(level, bottom + side)) - side * 0.7;
      for (const [a, b, c] of seededPoints(this.id + 'ice' + n, n)) {
        const r = Math.max(0, rl) * Math.sqrt(a);
        const ang = b * Math.PI * 2;
        const y = (hasLiquid ? level : bottom + side / 2 + c * side) - side * 0.35;
        d.position.set(Math.cos(ang) * r, Math.max(bottom + side / 2, y), Math.sin(ang) * r);
        d.rotation.set(c * 0.6, a * 3, b * 0.6);
        d.scale.setScalar(side * (0.8 + c * 0.3));
        d.updateMatrix();
        this.ice.setMatrixAt(ii++, d.matrix);
      }
    }
    this.ice.count = ii;
    this.ice.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.aqMat.dispose();
    this.aqCapMat.dispose();
    this.oilMat.dispose();
    this.heapMat.dispose();
  }
}
