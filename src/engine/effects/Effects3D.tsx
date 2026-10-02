/**
 * Efectos 3D efímeros (§3.5–3.6): chorro de vertido (cinta), gotas y salpicaduras, granos que caen, burbujas
 * de ebullición, goteo del embudo, vapor tenue, destellos de cristalización, charco en la mesada, anillo de
 * encaje, etiquetas flotantes de acción y la mano que abanica. SOLO leen el estado; se degradan por calidad.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab3D } from '../scene/context';
import { liquidVolumeMl, particulateMassG } from '../../simulation/solutions/mixture';
import { SHAPES, lipPoint, uprightLevelCm } from '../physics/geometry';
import { mouthOf, supportZones } from '../physics/supports';
import { FUNNEL_STEM_CM } from '../physics/dimensions';
import { toScene } from '../units';
import type { ParticleKind } from './particles';
import { ghostTexture, softDotTexture, textSpriteTexture } from '../renderers/textures';

const MAX_STREAMS = 6;
const KINDS: ParticleKind[] = ['grain', 'drop', 'splash', 'bubble', 'cube', 'spark', 'mist'];

export function Effects3D() {
  const lab = useLab3D();
  const root = useMemo(() => new THREE.Group(), []);
  const parts = useMemo(() => {
    const geos: Record<ParticleKind, THREE.BufferGeometry> = {
      grain: new THREE.DodecahedronGeometry(0.1, 0),
      drop: new THREE.SphereGeometry(0.16, 8, 6),
      splash: new THREE.SphereGeometry(0.08, 6, 4),
      bubble: new THREE.SphereGeometry(0.1, 8, 6),
      cube: new THREE.BoxGeometry(1, 1, 1),
      spark: new THREE.OctahedronGeometry(0.12, 0),
      mist: new THREE.SphereGeometry(0.5, 8, 6),
    };
    const mats: Record<ParticleKind, THREE.Material> = {
      grain: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      drop: new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.85 }),
      splash: new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.7 }),
      bubble: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transparent: true, opacity: 0.55, clearcoat: 1 }),
      cube: new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.1, transparent: true, opacity: 0.8 }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      mist: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }),
    };
    const meshes = {} as Record<ParticleKind, THREE.InstancedMesh>;
    for (const k of KINDS) {
      const m = new THREE.InstancedMesh(geos[k], mats[k], 400);
      m.count = 0;
      m.frustumCulled = false;
      root.add(m);
      meshes[k] = m;
    }
    return meshes;
  }, [root]);
  const streams = useMemo(() => {
    const list: THREE.Mesh[] = [];
    for (let i = 0; i < MAX_STREAMS; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.7, 1, 10, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.75, clearcoat: 1, depthWrite: false }));
      m.visible = false;
      root.add(m);
      list.push(m);
    }
    return list;
  }, [root]);
  const steam = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4.5, map: softDotTexture(), transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false;
    root.add(pts);
    return pts;
  }, [root]);
  const puddle = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.02, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    root.add(m);
    return m;
  }, [root]);
  const snapRing = useMemo(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 40), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    root.add(m);
    return m;
  }, [root]);
  const labels = useRef<Array<{ sprite: THREE.Sprite; text: string }>>([]);
  const ghosts = useMemo(() => ({
    hand: new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTexture('hand'), transparent: true, depthTest: false })),
    face: new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTexture('face'), transparent: true, depthTest: false })),
  }), []);
  ghosts.hand.scale.set(5, 5, 1);
  ghosts.face.scale.set(7, 7, 1);
  ghosts.hand.renderOrder = ghosts.face.renderOrder = 10;
  if (!ghosts.hand.parent) root.add(ghosts.hand, ghosts.face);
  const acc = useRef({ drip: new Map<string, number>(), bubble: new Map<string, number>(), crystal: new Map<string, number>() });
  const d = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.1);
    const w = lab.runtime.world;
    const subs = lab.runtime.ctx.subs;
    const ps = lab.particles;
    const rm = lab.host.reducedMotion();
    const t = state.clock.elapsedTime;
    ps.quality = lab.profile().particles;
    const surfaceZ = (id: string) => {
      const v = w.vessels[id];
      const sh = SHAPES[v.type];
      if (!sh) return mouthOf(v).z - 1;
      if (v.type === 'FUNNEL') return v.pose.z + 1.2;
      return v.pose.z + sh.baseOffset + Math.max(0.15, uprightLevelCm(sh, liquidVolumeMl(v.mix, subs)));
    };

    // ── Chorros de vertido: desde el pico hasta el punto de impacto (receptor o mesada) ──
    let si = 0;
    for (const sid in w.pours) {
      const pour = w.pours[sid];
      const src = w.vessels[sid];
      if (!src || si >= MAX_STREAMS) continue;
      let ox: number;
      let oz: number;
      if (src.type === 'WASH_BOTTLE') {
        ox = src.pose.x + 5.5;
        oz = src.pose.z + 17.6;
      } else {
        const sh = SHAPES[src.type];
        if (!sh) continue;
        const lp = lipPoint(sh, src.pose.rotationRad);
        ox = src.pose.x + lp[0];
        oz = src.pose.z + lp[1];
      }
      const endZ = pour.targetId && w.vessels[pour.targetId] ? surfaceZ(pour.targetId) : 0;
      if (pour.liquidRateMlS > 0 && liquidVolumeMl(src.mix, subs) > 0.001) {
        const m = streams[si++];
        const r = Math.max(0.08, Math.min(0.45, Math.sqrt(pour.liquidRateMlS) * 0.16));
        const len = Math.max(0.2, oz - endZ);
        const [X, Y, Z] = toScene(ox, src.pose.y, (oz + endZ) / 2);
        m.position.set(X, Y, Z);
        m.scale.set(r, len, r);
        m.visible = true;
        const dark = (src.mix.solid.CARBON ?? 0) * (src.mix.suspended.CARBON ?? 0) > 0.01;
        const oil = Object.keys(src.mix.oil).length > 0 && src.mix.waterG < 0.01;
        (m.material as THREE.MeshPhysicalMaterial).color.setHex(oil ? 0xf0d77a : dark ? 0x3a3a3c : 0xcfe8ff);
        if (!rm && Math.random() < dt * 20) ps.splash(ox, src.pose.y, endZ + 0.05, 0xcfe8ff, 2);
        if (!pour.targetId) lab.controller.spillPos = { x: ox, y: src.pose.y };
      }
      if (pour.solidRateGS > 0 && particulateMassG(src.mix) > 0.0005 && !rm) {
        const cols = (src.mix.solid.CARBON ?? 0) > 0.01 ? [0xf2f2f2, 0xf2f2f2, 0x1c1c1e] : [0xf2f2f2];
        ps.pourGrains(ox, src.pose.y, oz, endZ, cols, Math.max(1, Math.round(pour.solidRateGS * dt * 400)));
      }
    }
    for (let i = si; i < MAX_STREAMS; i++) streams[i].visible = false;

    // ── Efectos continuos por recipiente ──
    const steamPos = steam.geometry.getAttribute('position') as THREE.BufferAttribute;
    let sp = 0;
    for (const id in w.vessels) {
      const v = w.vessels[id];
      if (v.integrity === 0 || v.support === 'glass_waste' || lab.controller.held?.id === id) continue;
      const sh = SHAPES[v.type];
      const lv = liquidVolumeMl(v.mix, subs);
      if (v.funnel && v.funnel.dripRateMlPerS > 0.002 && !rm) {
        const a = (acc.current.drip.get(id) ?? 0) + dt * Math.min(12, v.funnel.dripRateMlPerS / 0.05);
        if (a >= 1) ps.drop(v.pose.x, v.pose.y, v.pose.z - FUNNEL_STEM_CM, v.funnel.dripTargetId ? surfaceZ(v.funnel.dripTargetId) : 0, 0xcfe8ff, 1);
        acc.current.drip.set(id, a % 1);
      }
      // Vapor tenue (no humo denso): solo con temperatura y agua suficientes.
      if (v.mix.waterG > 0.01 && v.temperatureC > 60) {
        const m = mouthOf(v);
        const inten = Math.min(1, (v.temperatureC - 60) / 40);
        const n = Math.round((rm ? 2 : 4 + inten * 8) * lab.profile().particles + 1);
        for (let i = 0; i < n && sp < 240; i++) {
          const ph = rm ? 0.5 : (t * 0.45 + i / n) % 1;
          const [X, Y, Z] = toScene(m.x + Math.sin(i * 2.3 + t * 1.3) * m.r * 0.5 + ph * 1.5, m.y + Math.cos(i * 1.7) * m.r * 0.4, m.z + 0.5 + ph * 8 * (0.5 + inten));
          steamPos.setXYZ(sp++, X, Y, Z);
        }
      }
      if (!sh || Math.abs(v.pose.rotationRad) > 0.1 || lv < 0.05 || v.mix.waterG < 0.05) continue;
      const base = v.pose.z + sh.baseOffset;
      const surf = base + uprightLevelCm(sh, lv);
      // Burbujas: nucleación en el fondo al calentar y ebullición cerca de 100 °C.
      if (v.temperatureC > 75 && !rm) {
        const rate = v.temperatureC > 98 ? 40 : (v.temperatureC - 75) * 0.9;
        const a = (acc.current.bubble.get(id) ?? 0) + dt * rate * (v.support === 'hotplate' ? 1 : 0.3);
        let n = Math.floor(a);
        acc.current.bubble.set(id, a - n);
        while (n-- > 0) {
          const ang = Math.random() * Math.PI * 2;
          const rr = sh.r * 0.8 * Math.sqrt(Math.random());
          ps.bubble(v.pose.x + Math.cos(ang) * rr, v.pose.y + Math.sin(ang) * rr, base + 0.15, surf, v.temperatureC > 98 ? 0.9 + Math.random() : 0.5);
        }
      }
      // Destellos al crecer los cristales.
      const cm = v.mix.crystals?.massG ?? 0;
      const prev = acc.current.crystal.get(id) ?? cm;
      if (cm - prev > 0.0004 && !rm && Math.random() < 0.5) ps.spark(v.pose.x + (Math.random() - 0.5) * sh.r * 1.4, v.pose.y - sh.r, base + 0.3 + Math.random() * 0.8);
      acc.current.crystal.set(id, cm);
    }
    for (let i = sp; i < 240; i++) steamPos.setXYZ(i, 0, -1000, 0);
    steamPos.needsUpdate = true;

    // ── Partículas → mallas instanciadas por tipo ──
    ps.update(rm ? dt * 3 : dt);
    const counts: Record<ParticleKind, number> = { grain: 0, drop: 0, splash: 0, bubble: 0, cube: 0, spark: 0, mist: 0 };
    for (const p of ps.list) {
      const m = parts[p.kind];
      const i = counts[p.kind];
      if (i >= 400) continue;
      const [X, Y, Z] = toScene(p.x, p.y, p.z);
      d.position.set(X, Y, Z);
      const fade = Math.max(0.05, 1 - p.age / p.life);
      const s = p.kind === 'cube' ? p.size : p.kind === 'bubble' ? p.size : p.kind === 'mist' ? p.size * (1 + p.age * 2) : p.size * (p.kind === 'splash' ? fade : 1);
      d.scale.setScalar(s);
      d.rotation.set(p.age * 3, p.age * 2, 0);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      if (p.kind === 'grain') m.setColorAt(i, col.setHex(p.color));
      counts[p.kind] = i + 1;
    }
    for (const k of KINDS) {
      parts[k].count = counts[k];
      parts[k].visible = counts[k] > 0;
      parts[k].instanceMatrix.needsUpdate = true;
      if (parts[k].instanceColor) parts[k].instanceColor.needsUpdate = true;
    }

    // ── Charco ──
    if (w.bench.spillMl > 0.05) {
      const r = Math.min(14, 1.2 + Math.sqrt(w.bench.spillMl) * 2.2);
      const [X, , Z] = toScene(lab.controller.spillPos.x, lab.controller.spillPos.y, 0);
      puddle.position.set(X, 0.04, Z);
      puddle.scale.setScalar(r);
      puddle.visible = true;
      (puddle.material as THREE.MeshPhysicalMaterial).color.setHex(w.bench.spillOpen ? 0xffc9c4 : 0xcfe8ff);
    } else puddle.visible = false;

    // ── Anillo de la zona de encaje ──
    const z = lab.controller.snapZone;
    if (lab.controller.held && z) {
      const [X, Y, Z] = toScene(z.x, z.y, z.z + 0.05);
      snapRing.position.set(X, Y, Z);
      snapRing.scale.setScalar(Math.max(1, z.snapR * 0.7));
      snapRing.visible = true;
    } else snapRing.visible = false;
    if (lab.controller.held && lab.host.guidedHints()) {
      // Modo guiado: todas las zonas disponibles (contorno de ayuda).
      void supportZones;
    }

    // ── Etiquetas flotantes ──
    const L = lab.animator.labels;
    while (labels.current.length < L.length) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      s.renderOrder = 11;
      root.add(s);
      labels.current.push({ sprite: s, text: '' });
    }
    labels.current.forEach((slot, i) => {
      const l = L[i];
      if (!l) {
        slot.sprite.visible = false;
        return;
      }
      const key = `${l.text}|${l.color}`;
      if (slot.text !== key) {
        slot.text = key;
        slot.sprite.material.map?.dispose();
        slot.sprite.material.map = textSpriteTexture(l.text, `#${l.color.toString(16).padStart(6, '0')}`);
        slot.sprite.material.needsUpdate = true;
      }
      const u = l.age / l.life;
      const [X, Y, Z] = toScene(l.x, l.y, l.z + u * 4);
      slot.sprite.position.set(X, Y, Z);
      slot.sprite.scale.set(8, 2, 1);
      slot.sprite.material.opacity = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      slot.sprite.visible = true;
    });

    // ── Mano que abanica / cara (oler directo) ──
    ghosts.hand.visible = ghosts.face.visible = false;
    for (const g of lab.animator.ghosts) {
      const u = g.age / g.life;
      const fade = u < 0.15 ? u / 0.15 : u > 0.85 ? (1 - u) / 0.15 : 1;
      const s = g.kind === 'hand' ? ghosts.hand : ghosts.face;
      const wave = g.kind === 'hand' ? Math.sin(g.age * 14) * 1.4 : 0;
      const [X, Y, Z] = toScene(g.x + 2.5 + wave, g.y - 2, g.z + (g.kind === 'hand' ? 2.5 : 4));
      s.position.set(X, Y, Z);
      s.material.opacity = fade;
      s.material.rotation = g.kind === 'hand' ? wave * 0.15 : 0;
      s.visible = true;
    }
  });

  return <primitive object={root} />;
}
