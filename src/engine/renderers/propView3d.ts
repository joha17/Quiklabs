/**
 * Vistas 3D de instrumentos no-recipiente (§3.5): placa, balanza, soporte con aro, gradilla, bandeja,
 * varilla, sonda, vidrio de reloj y pinza. Solo leen el estado.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Prop } from '../../simulation/entities/types';
import { SHAPES } from '../physics/geometry';
import { RING_GRIP_Z, RING_OFFSET_X, RING_R, PROP_DIM } from '../physics/dimensions';
import { WATCH_GLASS } from '../../practices/practice-02/instruments';
import { type FrameCtx, seededPoints, visualPose } from './frame';
import { materials } from './materials';
import { sphericalCap } from './lathe';
import { lcdTexture, woodTexture } from './textures';
import type { QualityLevel } from '../quality';

export interface PropHandle {
  group: THREE.Group;
  update(ctx: FrameCtx, p: Prop): void;
}

function hit(geo: THREE.BufferGeometry, objId: string, part?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, materials('LOW').hit);
  m.userData = { objId, part };
  return m;
}

function selRing(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.93, r, 48), new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    (c as THREE.Mesh).castShadow = true;
    (c as THREE.Mesh).receiveShadow = true;
  });
  return o;
}

export function createPropVisual(p: Prop, q: QualityLevel): PropHandle {
  const mats = materials(q);
  const group = new THREE.Group();
  const anim = new THREE.Group();
  group.add(anim);
  const dim = PROP_DIM[p.kind] ?? { footR: 2, h: 1 };
  const ring = selRing(dim.footR * 0.9);
  group.add(ring);
  let updateFn: (ctx: FrameCtx, p: Prop) => void = () => undefined;

  switch (p.kind) {
    case 'hotplate': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(16, 4, 16, 3, 0.6), mats.enamel));
      body.position.y = 2.4;
      const feet = new THREE.Group();
      for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 10), mats.blackPlastic);
        f.position.set(x, 0.2, z);
        feet.add(f);
      }
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.4, emissive: 0xff3b10, emissiveIntensity: 0 });
      const plate = new THREE.Mesh(new RoundedBoxGeometry(13.4, 0.3, 13.4, 2, 0.4), plateMat);
      plate.position.y = 4.3;
      plate.receiveShadow = true;
      const coil = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.12, 6, 48), new THREE.MeshStandardMaterial({ color: 0xb5bcc2, emissive: 0xff7a3d, emissiveIntensity: 0 }));
      coil.rotation.x = -Math.PI / 2;
      coil.position.y = 4.47;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(15, 2.6, 0.3), mats.blackPlastic);
      panel.position.set(0, 2.3, 8.05);
      const lcd = lcdTexture(256, 96);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.7), new THREE.MeshBasicMaterial({ map: lcd.texture }));
      screen.position.set(-3.4, 2.3, 8.22);
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.9, 24), mats.blackPlastic));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(4.5, 2.3, 8.6);
      const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      pointer.position.set(0, 0.45, 0.46);
      const knobPivot = new THREE.Group();
      knobPivot.position.set(4.5, 2.3, 9.06);
      knobPivot.add(pointer);
      const ledOn = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0x2a3a2f }));
      ledOn.position.set(-6.6, 2.8, 8.22);
      const ledHot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0x3a2a2a }));
      ledHot.position.set(-6.6, 1.8, 8.22);
      const glow = new THREE.PointLight(0xff5a1f, 0, 30, 2);
      glow.position.set(0, 6, 0);
      anim.add(body, feet, plate, coil, panel, screen, knob, knobPivot, ledOn, ledHot, glow);
      const hb = hit(new THREE.BoxGeometry(16, 4.6, 16), p.id);
      hb.position.y = 2.3;
      const hk = hit(new THREE.SphereGeometry(1.8, 8, 6), p.id, 'knob');
      hk.position.set(4.5, 2.3, 8.8);
      anim.add(hb, hk);
      updateFn = (ctx) => {
        const hp = ctx.world.devices.hotplate;
        const glowF = Math.max(0, Math.min(1, (hp.plateTempC - 60) / 250));
        plateMat.color.setHex(glowF > 0.02 ? 0x8a3b26 : 0xc9ced3);
        plateMat.emissiveIntensity = glowF * 0.9;
        (coil.material as THREE.MeshStandardMaterial).emissiveIntensity = glowF * 2;
        glow.intensity = glowF * 1500;
        lcd.set(`${hp.powerPct}%`, hp.powerPct > 0 ? '#ff9a6b' : '#6ef08a', 'POTENCIA');
        knobPivot.rotation.z = -(-Math.PI * 0.75 + (hp.powerPct / 100) * Math.PI * 1.5);
        (ledOn.material as THREE.MeshBasicMaterial).color.setHex(hp.powerPct > 0 ? 0x3cff6b : 0x2a3a2f);
        (ledHot.material as THREE.MeshBasicMaterial).color.setHex(hp.plateTempC > 50 ? 0xff3b30 : 0x3a2a2a);
      };
      break;
    }
    case 'balance': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(14, 4.5, 18, 3, 0.5), new THREE.MeshStandardMaterial({ color: 0xf0f2f4, roughness: 0.4 })));
      body.position.y = 2.25;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 10), mats.steel);
      post.position.set(0, 4.8, -1);
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.25, 40), mats.steel));
      pan.position.set(0, 5.1, -1);
      const lcd = lcdTexture(320, 96);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.9), new THREE.MeshBasicMaterial({ map: lcd.texture }));
      screen.position.set(-2.2, 2.5, 9.02);
      screen.rotation.x = -0.15;
      const tare = new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.3, 0.5, 2, 0.2), mats.plasticBlue);
      tare.position.set(4.4, 2.5, 9.0);
      const bubble = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0xbfe6c3 }));
      bubble.position.set(5.6, 4.55, -7.5);
      anim.add(body, post, pan, screen, tare, bubble);
      const hb = hit(new THREE.BoxGeometry(14, 5.4, 18), p.id);
      hb.position.y = 2.7;
      const ht = hit(new THREE.BoxGeometry(3.2, 2.2, 1.6), p.id, 'tare');
      ht.position.set(4.4, 2.5, 9.2);
      anim.add(hb, ht);
      updateFn = (ctx) => lcd.set(ctx.balanceText, '#6ef08a', 'TARA → 0,00 g');
      break;
    }
    case 'stand': {
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(15, 1.2, 9.5, 2, 0.3), mats.darkMetal));
      base.position.y = 0.6;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 36, 16), mats.chrome));
      rod.position.set(-4, 18, 0);
      const holder = new THREE.Group();
      const boss = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), mats.darkMetal));
      boss.position.set(-4, 0, 0);
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8), mats.steel);
      screw.rotation.z = Math.PI / 2;
      screw.position.set(-5.6, 0, 0);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12), mats.blackPlastic);
      knob.rotation.z = Math.PI / 2;
      knob.position.set(-6.8, 0, 0);
      const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, RING_OFFSET_X + 4 - RING_R, 10), mats.steel));
      arm.rotation.z = Math.PI / 2;
      arm.position.set((-4 + RING_OFFSET_X - RING_R) / 2, 0, 0);
      const ringM = shadowed(new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.22, 10, 40), mats.steel));
      ringM.rotation.x = Math.PI / 2;
      ringM.position.set(RING_OFFSET_X, 0, 0);
      holder.add(boss, screw, knob, arm, ringM);
      anim.add(base, rod, holder);
      const hb = hit(new THREE.BoxGeometry(15, 2, 9.5), p.id);
      hb.position.y = 1;
      const hr = hit(new THREE.CylinderGeometry(1.2, 1.2, 36, 8), p.id);
      hr.position.set(-4, 18, 0);
      anim.add(hb, hr);
      updateFn = (ctx) => {
        holder.position.y = ctx.world.devices.stand.ringHeightCm;
        void RING_GRIP_Z;
      };
      break;
    }
    case 'rack': {
      const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.7 });
      const basePlate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 6), wood));
      basePlate.position.y = 0.3;
      const posts = [-12.5, 12.5].map((x) => {
        const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 7, 5), wood));
        m.position.set(x, 3.5, 0);
        return m;
      });
      // Placa superior con 6 agujeros (forma extruida).
      const shape = new THREE.Shape();
      shape.moveTo(-13, -3);
      shape.lineTo(13, -3);
      shape.lineTo(13, 3);
      shape.lineTo(-13, 3);
      shape.lineTo(-13, -3);
      for (let i = 0; i < 6; i++) {
        const h = new THREE.Path();
        h.absarc(-10 + i * 4, 0, 1.05, 0, Math.PI * 2, true);
        shape.holes.push(h);
      }
      const top = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), wood));
      top.rotation.x = -Math.PI / 2;
      top.position.y = 6.4;
      anim.add(basePlate, ...posts, top);
      const hb = hit(new THREE.BoxGeometry(27, 7.2, 6.2), p.id);
      hb.position.y = 3.6;
      anim.add(hb);
      break;
    }
    case 'tray': {
      const mat = new THREE.MeshStandardMaterial({ color: 0x7d93a8, roughness: 0.6 });
      const bottom = shadowed(new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, 5), mat));
      bottom.position.y = 0.15;
      const walls = [[0, 2.5, 28, 0.3], [0, -2.5, 28, 0.3], [14, 0, 0.3, 5], [-14, 0, 0.3, 5]].map(([x, z, w, d]) => {
        const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), mat));
        m.position.set(x, 0.8, z);
        return m;
      });
      anim.add(bottom, ...walls);
      const hb = hit(new THREE.BoxGeometry(28, 1.6, 5), p.id);
      hb.position.y = 0.8;
      anim.add(hb);
      break;
    }
    case 'rod': {
      const glassRod = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 18, 12), mats.glass);
      glassRod.renderOrder = 2;
      const tips = [-9, 9].map((y) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mats.glass);
        s.position.y = y;
        return s;
      });
      const rodG = new THREE.Group();
      rodG.add(glassRod, ...tips);
      const broken = new THREE.Group();
      for (const [a, b] of seededPoints('rodshards', 6)) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.5, 8), mats.glass);
        m.rotation.set(Math.PI / 2, 0, a * 6);
        m.position.set((a - 0.5) * 8, 0.3, (b - 0.5) * 3);
        broken.add(m);
      }
      anim.add(rodG, broken);
      const hr = hit(new THREE.CylinderGeometry(0.9, 0.9, 18, 8), p.id);
      anim.add(hr);
      updateFn = (ctx) => {
        const rod = ctx.world.devices.rod;
        broken.visible = rod.integrity === 0;
        rodG.visible = rod.integrity === 1;
        const inV = rod.vesselId && ctx.world.vessels[rod.vesselId];
        // Dentro de un recipiente: casi vertical, apoyada en el borde. Sobre la mesada: tumbada.
        if (inV) {
          rodG.rotation.set(0, 0, -0.12);
          rodG.position.set(0.6, 9, 0);
        } else {
          rodG.rotation.set(0, 0, Math.PI / 2);
          rodG.position.set(0, 0.3, 0);
        }
        hr.rotation.copy(rodG.rotation);
        hr.position.copy(rodG.position);
      };
      break;
    }
    case 'probe': {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 12, 10), mats.steel);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 3, 12), mats.blackPlastic);
      const probeG = new THREE.Group();
      stem.position.y = 6;
      handle.position.y = 13.5;
      probeG.add(stem, handle);
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 3.6, 2, 2, 0.4), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 })));
      const lcd = lcdTexture(256, 96);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.7), new THREE.MeshBasicMaterial({ map: lcd.texture }));
      screen.position.z = 1.02;
      box.add(screen);
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x1d2329, roughness: 0.8 });
      let cable: THREE.Mesh | null = null;
      anim.add(probeG, box);
      const hp = hit(new THREE.CylinderGeometry(1.2, 1.2, 15, 8), p.id);
      const hbx = hit(new THREE.BoxGeometry(6.4, 4, 2.4), p.id);
      anim.add(hp, hbx);
      let lastCable = '';
      updateFn = (ctx) => {
        const pr = ctx.world.devices.probe;
        const inV = pr.vesselId && ctx.world.vessels[pr.vesselId];
        if (inV) {
          probeG.rotation.set(0, 0, 0);
          probeG.position.set(0, pr.touchingBottom ? 0 : 0.8, 0);
          box.position.set(6, 14, 2);
        } else {
          probeG.rotation.set(0, 0, Math.PI / 2);
          probeG.position.set(7, 0.45, 0);
          box.position.set(-6, 1.8, 3);
        }
        box.rotation.set(0, 0, 0);
        hp.rotation.copy(probeG.rotation);
        hp.position.copy(probeG.position).add(new THREE.Vector3(inV ? 0 : -6, inV ? 7 : 0, 0));
        hbx.position.copy(box.position);
        lcd.set(ctx.probeReading === null ? '--.- °C' : `${ctx.probeReading.toFixed(1)} °C`, '#6ef08a', 'SONDA T');
        const key = `${!!inV}|${pr.touchingBottom}`;
        if (key !== lastCable) {
          lastCable = key;
          if (cable) anim.remove(cable);
          const a = inV ? new THREE.Vector3(0, 15, 0) : new THREE.Vector3(-8.5, 0.45, 0);
          const b = box.position.clone().add(new THREE.Vector3(-2.6, 0, 0));
          const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 3, 0));
          cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.12, 6), cableMat);
          anim.add(cable);
        }
      };
      break;
    }
    case 'watch_glass': {
      const cap = new THREE.Mesh(sphericalCap(WATCH_GLASS.diameter / 2, WATCH_GLASS.height), mats.glass);
      cap.renderOrder = 2;
      const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }), 24);
      drops.count = 0;
      const d = new THREE.Object3D();
      seededPoints('cond', 24).forEach(([a, b], i) => {
        const r = Math.sqrt(a) * 2.6;
        d.position.set(Math.cos(b * 6.28) * r, 0.1 + (r / 3) ** 2, Math.sin(b * 6.28) * r);
        d.updateMatrix();
        drops.setMatrixAt(i, d.matrix);
      });
      anim.add(cap, drops);
      const hb = hit(new THREE.CylinderGeometry(3.2, 3.2, 1.2, 12), p.id);
      hb.position.y = 0.6;
      anim.add(hb);
      updateFn = (ctx) => {
        const covered = Object.values(ctx.world.vessels).find((v) => v.cover !== 'NONE' && v.integrity === 1);
        // Sobre la cápsula: apoyado en el borde, desplazado (abertura) y con gotitas de condensación si hay vapor.
        if (covered) {
          const sh = SHAPES.PORCELAIN_DISH!;
          anim.position.y = sh.h - 0.15;
          anim.rotation.z = 0.08;
          drops.count = covered.mix.waterG > 0.05 && covered.temperatureC > 70 ? 24 : 0;
        } else {
          anim.position.y = 0;
          anim.rotation.z = 0;
          drops.count = 0;
        }
        drops.instanceMatrix.needsUpdate = true;
      };
      break;
    }
    case 'tongs': {
      const mat = new THREE.MeshStandardMaterial({ color: 0x6f7982, metalness: 0.8, roughness: 0.35 });
      const armA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 0.5), mat));
      armA.position.set(0, 0.3, 0.6);
      armA.rotation.y = 0.12;
      const armB = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 0.5), mat));
      armB.position.set(0, 0.3, -0.6);
      armB.rotation.y = -0.12;
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10), mats.darkMetal);
      pivot.position.set(1, 0.35, 0);
      anim.add(armA, armB, pivot);
      const hb = hit(new THREE.BoxGeometry(12.5, 1, 2.4), p.id);
      hb.position.y = 0.4;
      anim.add(hb);
      updateFn = (ctx) => mat.color.setHex(ctx.world.devices.hand.mode === 'TONGS' ? 0xffb000 : 0x6f7982);
      break;
    }
    default: {
      const hb = hit(new THREE.BoxGeometry(2, 1, 2), p.id);
      anim.add(hb);
    }
  }

  return {
    group,
    update(ctx, pp) {
      const vp = visualPose(ctx, pp.id);
      group.visible = pp.support !== 'glass_waste';
      if (pp.kind !== 'watch_glass') {
        anim.position.set(vp.dx, vp.dz, -vp.dy);
      }
      updateFn(ctx, pp);
      const sel = ctx.selected === pp.id;
      const hov = ctx.hovered === pp.id;
      ring.visible = (sel || hov) && pp.kind !== 'tray';
      (ring.material as THREE.MeshBasicMaterial).color.setHex(sel ? 0xffb000 : 0x5aa9ff);
    },
  };
}
