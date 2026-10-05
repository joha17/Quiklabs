/**
 * Contenido 3D de un recipiente de la Práctica 4 a partir de su apariencia calculada por el dominio (SOLO LECTURA):
 *  - líquido = cavidad del perfil recortada por un PLANO HORIZONTAL del mundo (horizontal aunque se incline);
 *  - color por transmitancia (Beer–Lambert con la concentración y el espesor reales) y turbidez por el sólido
 *    suspendido; penacho local (remolino rosado, mezcla sin agitar) y nube de precipitado donde se forma;
 *  - partículas en suspensión (flóculos más grandes en los precipitados gelatinosos), sedimento que llena el fondo
 *    con la forma real del recipiente y burbujas de CO₂.
 */
import * as THREE from 'three';
import type { InstrumentProfile } from '../../practices/practice-02/instruments';
import { innerRadiusAt } from '../../practices/practice-02/instruments';
import type { VesselAppearance } from '../../simulation/reaction-world/world';
import { liquidLevel, type VesselShape } from '../physics/geometry';
import { cavityGeometry } from '../renderers/lathe';
import { liquidMaterial } from '../renderers/materials';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const partGeo = new THREE.IcosahedronGeometry(1, 0);
const bubbleGeo = new THREE.SphereGeometry(1, 8, 6);
const capGeo = new THREE.CircleGeometry(1, 36);
const ringGeo = new THREE.TorusGeometry(1, 0.03, 6, 36);
const blobGeo = new THREE.SphereGeometry(1, 16, 12);

/** Tinte del agua (casi incolora, con un leve azul para que el volumen se lea sobre la mesada). */
const WATER_TINT = new THREE.Color(0.66, 0.83, 1.0);

function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class LiquidView {
  readonly root = new THREE.Group();
  private plane = new THREE.Plane(DOWN.clone(), 0);
  private sedPlane = new THREE.Plane(DOWN.clone(), 0);
  private liquid: THREE.Mesh;
  private liqMat: THREE.MeshPhysicalMaterial;
  private cap: THREE.Mesh;
  private capMat: THREE.MeshPhysicalMaterial;
  private meniscus: THREE.Mesh;
  private sediment: THREE.Mesh;
  private sedMat: THREE.MeshStandardMaterial;
  private plume: THREE.Mesh;
  private plumeMat: THREE.MeshBasicMaterial;
  private cloud: THREE.Mesh;
  private cloudMat: THREE.MeshStandardMaterial;
  private parts: THREE.InstancedMesh;
  private partMat: THREE.MeshStandardMaterial;
  private bubbles: THREE.InstancedMesh;
  private seeds: Array<[number, number, number, number]> = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private level = 0;

  constructor(private shape: VesselShape, name: string, seg: number, private opts: { meniscus?: boolean; maxParticles?: number; capR?: number } = {}) {
    const cav = cavityGeometry(name, shape.profile, seg);
    this.liqMat = liquidMaterial(0xffffff, 0.4, [this.plane]);
    this.liqMat.emissiveIntensity = 0.12;
    this.liquid = new THREE.Mesh(cav, this.liqMat);
    this.liquid.renderOrder = 1;
    this.capMat = liquidMaterial(0xffffff, 0.4, []);
    this.cap = new THREE.Mesh(capGeo, this.capMat);
    this.cap.rotation.x = -Math.PI / 2;
    this.cap.renderOrder = 1;
    this.meniscus = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x5d7f9e, transparent: true, opacity: 0.85, depthWrite: false }));
    this.meniscus.rotation.x = -Math.PI / 2;
    this.meniscus.renderOrder = 1;
    this.sedMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, clippingPlanes: [this.sedPlane] });
    this.sediment = new THREE.Mesh(cavityGeometry(name, shape.profile, seg, 0.05), this.sedMat);
    this.plumeMat = new THREE.MeshBasicMaterial({ color: 0xff66cc, transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [this.plane] });
    this.plume = new THREE.Mesh(blobGeo, this.plumeMat);
    this.plume.renderOrder = 2;
    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 1, depthWrite: false, clippingPlanes: [this.plane] });
    this.cloud = new THREE.Mesh(blobGeo, this.cloudMat);
    this.cloud.renderOrder = 2;
    const n = opts.maxParticles ?? 90;
    this.partMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, clippingPlanes: [this.plane] });
    this.parts = new THREE.InstancedMesh(partGeo, this.partMat, n);
    this.parts.count = 0;
    this.parts.frustumCulled = false;
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbles = new THREE.InstancedMesh(bubbleGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.55, clippingPlanes: [this.plane] }), 24);
    this.bubbles.count = 0;
    this.bubbles.frustumCulled = false;
    const r = rnd(name.length * 7919 + n);
    for (let i = 0; i < n; i++) this.seeds.push([r(), r(), r(), r()]);
    this.root.add(this.liquid, this.cap, this.meniscus, this.sediment, this.plume, this.cloud, this.parts, this.bubbles);
    this.liquid.name = `liquid:${name}`;
  }

  /**
   * @param angle inclinación del recipiente (rad); @param pivotY altura del pivote (base) en la escena;
   * @param t tiempo para la animación (remolinos, partículas, burbujas).
   */
  update(a: VesselAppearance | null, angle: number, pivotY: number, t: number, reduced: boolean) {
    const sh = this.shape;
    const prof: InstrumentProfile = sh.profile;
    const ml = a?.liquidMl ?? 0;
    const has = ml > 0.004;
    this.root.visible = !!a && (has || a.sedimentMl > 0.0005);
    if (!a || !this.root.visible) return;
    const upright = Math.abs(angle) < 0.06;
    // Nivel del líquido (incluye el volumen aparente del sedimento).
    const sedMl = Math.min(a.sedimentMl, sh.fullVolumeMl * 0.9);
    this.level = has ? liquidLevel(sh, angle, ml + sedMl) : sh.baseOffset;
    this.plane.constant = pivotY + this.level;
    // ── Color del líquido: transmitancia × tinte del agua, mezclado con lo suspendido ──
    const tr = a.bulkRgb;
    const turb = a.turbidity;
    this.col.setRGB(tr[0] * WATER_TINT.r, tr[1] * WATER_TINT.g, tr[2] * WATER_TINT.b);
    const sc = a.suspendedRgb;
    this.col.lerp(new THREE.Color(sc[0], sc[1], sc[2]), turb);
    const absorb = 1 - (tr[0] + tr[1] + tr[2]) / 3;
    this.liqMat.color.copy(this.col);
    this.liqMat.emissive.copy(this.col);
    this.liqMat.opacity = Math.min(0.95, 0.4 + 0.5 * absorb + 0.6 * turb);
    this.liquid.visible = has;
    const r = innerRadiusAt(prof, this.level) - 0.02;
    this.cap.visible = has && upright && this.level < prof.rimY - 0.02;
    this.cap.position.set(0, this.level, 0);
    this.cap.scale.setScalar(Math.max(0.01, r));
    this.capMat.color.copy(this.col);
    this.capMat.opacity = Math.min(0.95, this.liqMat.opacity + 0.05);
    this.meniscus.visible = !!this.opts.meniscus && this.cap.visible;
    this.meniscus.position.set(0, this.level - 0.05, 0);
    this.meniscus.scale.setScalar(Math.max(0.01, r));
    // ── Sedimento: la cavidad recortada a la altura que ocupa el sólido depositado ──
    const sedLevel = sedMl > 0.0005 ? liquidLevel(sh, angle, sedMl) : sh.baseOffset;
    this.sediment.visible = sedMl > 0.0005;
    this.sedPlane.constant = pivotY + sedLevel;
    this.sedMat.color.setRGB(a.sedimentRgb[0], a.sedimentRgb[1], a.sedimentRgb[2]);
    // ── Penacho: lo recién añadido sin mezclar (p. ej. remolinos rosados) ──
    const pr = a.plumeRgb;
    const diff = Math.abs(pr[0] - tr[0]) + Math.abs(pr[1] - tr[1]) + Math.abs(pr[2] - tr[2]);
    const plumeOn = has && a.plumeFrac > 0.004 && diff > 0.08;
    this.plume.visible = plumeOn;
    if (plumeOn) {
      const rr = Math.max(0.2, Math.min(r * 0.8, r * (0.35 + 1.2 * a.plumeFrac)));
      const wob = reduced ? 0 : Math.sin(t * 2.3) * 0.15;
      this.plume.position.set(Math.cos(t * 0.9) * r * 0.25, Math.max(sh.baseOffset + rr * 0.5, this.level - rr * 0.6), Math.sin(t * 0.9) * r * 0.25);
      this.plume.scale.set(rr * (1 + wob), rr * 0.55, rr * (1 - wob));
      this.plume.rotation.y = reduced ? 0 : t * 1.4;
      this.plumeMat.color.setRGB(pr[0] * WATER_TINT.r, pr[1] * WATER_TINT.g, pr[2] * WATER_TINT.b);
      this.plumeMat.opacity = Math.min(0.85, diff * 0.9);
    }
    // ── Nube del precipitado recién formado (donde se encuentran los reactivos) ──
    const cloudOn = has && a.localizedCloud > 0.05;
    this.cloud.visible = cloudOn;
    if (cloudOn) {
      const rr = r * (0.5 + 0.4 * (1 - a.localizedCloud));
      this.cloud.position.set(0, Math.max(sh.baseOffset + rr * 0.4, this.level - rr * 0.7), 0);
      this.cloud.scale.set(rr, rr * 0.6, rr);
      this.cloudMat.color.setRGB(sc[0], sc[1], sc[2]);
      this.cloudMat.opacity = Math.min(0.9, a.localizedCloud * 0.9);
    }
    // ── Partículas en suspensión ──
    const max = this.seeds.length;
    const count = has ? Math.min(max, Math.round(max * Math.min(1, turb * 1.6))) : 0;
    this.parts.count = count;
    if (count > 0) {
      this.partMat.color.setRGB(sc[0], sc[1], sc[2]);
      const y0 = sh.baseOffset + 0.1;
      const H = Math.max(0.1, this.level - y0);
      const size = sh.profile.mouthR < 1 ? 0.04 : 0.07;
      for (let i = 0; i < count; i++) {
        const [u, v, w2, k] = this.seeds[i];
        const fall = reduced ? 0 : ((t * (0.02 + 0.05 * k)) % 1);
        const yy = y0 + H * ((v + 1 - fall) % 1);
        const rad = (innerRadiusAt(prof, yy) - 0.08) * Math.sqrt(u);
        const ang = w2 * Math.PI * 2 + (reduced ? 0 : t * 0.15 * (k - 0.5));
        this.dummy.position.set(Math.cos(ang) * rad, yy, Math.sin(ang) * rad);
        this.dummy.scale.setScalar(size * (0.6 + k * 1.2));
        this.dummy.rotation.set(u * 6, v * 6, 0);
        this.dummy.updateMatrix();
        this.parts.setMatrixAt(i, this.dummy.matrix);
      }
      this.parts.instanceMatrix.needsUpdate = true;
    }
    // ── Burbujas de gas ──
    const nb = has && a.bubbling && !reduced ? 18 : 0;
    this.bubbles.count = nb;
    if (nb) {
      const y0 = sh.baseOffset + 0.2;
      const H = Math.max(0.1, this.level - y0);
      for (let i = 0; i < nb; i++) {
        const [u, v, w2, k] = this.seeds[i % this.seeds.length];
        const yy = y0 + H * ((v + t * (0.5 + k)) % 1);
        const rad = (innerRadiusAt(prof, yy) - 0.1) * Math.sqrt(u) * 0.8;
        this.dummy.position.set(Math.cos(w2 * 6.28) * rad, yy, Math.sin(w2 * 6.28) * rad);
        this.dummy.scale.setScalar(0.04 + 0.04 * k);
        this.dummy.updateMatrix();
        this.bubbles.setMatrixAt(i, this.dummy.matrix);
      }
      this.bubbles.instanceMatrix.needsUpdate = true;
    }
    void UP;
  }

  liquidTopY(): number {
    return this.level;
  }

  dispose() {
    this.liqMat.dispose();
    this.capMat.dispose();
    this.sedMat.dispose();
    this.plumeMat.dispose();
    this.cloudMat.dispose();
    this.partMat.dispose();
    this.parts.dispose();
    this.bubbles.dispose();
  }
}
