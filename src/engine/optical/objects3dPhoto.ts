/**
 * Vistas 3D procedurales de los objetos propios de B08 (§4, §14): tubos con capilar y menisco, baño, lámparas, pantallas,
 * ramas de Elodea, indicador con el color del dominio, campana, mortero, frascos, papel con sus bandas (textura) y residuos.
 * Solo leen el estado del dominio; lo dibujado sale de los mismos datos dimensionales. Vidrio sin `transmission`.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { GEO_B08 } from '../../simulation/photo-world/geometry';
import { bandsOf, btbColorOf } from '../../simulation/photo-world/world';
import type { MaterialSet } from '../renderers/materials';
import type { CellVisual } from './objects3dCell';
import { hitMesh } from './parts';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;
type Label = (lines: string[], w: number, h: number, band: string) => THREE.Mesh;

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
const flat = (m: THREE.Mesh, x: number, y: number, z: number) => {
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
};

export const BTB_RGB: Record<string, number> = { yellow: 0xe8c832, green: 0x4f9e5a, blue: 0x2f6fc4 };
export const BAND_CSS: Record<string, string> = { orange: '#e8891c', yellow: '#e6c81e', paleYellow: '#eddc6a', blueGreen: '#1f7a55', yellowGreen: '#8bab2c', oliveGreen: '#55792f', ink: '#4a3f8f' };

/** Dibuja el cromatograma con la escala del papel: origen, frente y bandas. La usan la escena y el panel. */
export function drawPaper(ctx: CanvasRenderingContext2D, W: number, H: number, w: PhotoWorld) {
  const q = w.photo.paper;
  const L = w.params.photo!.paperLengthMm;
  const y = (mm: number) => H - (mm / L) * H;
  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(0, 0, W, H);
  if (q.originMm !== null) {
    ctx.strokeStyle = q.originTool === 'pen' ? '#3949ab' : '#666';
    ctx.lineWidth = Math.max(1, H / 300);
    ctx.beginPath();
    ctx.moveTo(0, y(q.originMm));
    ctx.lineTo(W, y(q.originMm));
    ctx.stroke();
  }
  if (q.spots && !q.hung) {
    ctx.fillStyle = '#2e6b3a';
    ctx.beginPath();
    ctx.arc(W / 2, y(q.originMm ?? 20), (q.large ? 0.34 : 0.18) * W, 0, Math.PI * 2);
    ctx.fill();
  }
  if (q.hung && q.frontMm > 0 && (q.removedAt === null || q.frontMarkMm === null) && !q.frontLost) {
    ctx.fillStyle = 'rgba(120,160,210,.2)';
    ctx.fillRect(0, y(q.frontMm), W, H - y(q.frontMm));
  }
  for (const b of bandsOf(w)) {
    ctx.globalAlpha = Math.max(0.2, Math.min(1, b.intensity * 2.2));
    ctx.fillStyle = BAND_CSS[b.color] ?? '#888';
    const h = (b.widthMm / L) * H;
    ctx.fillRect(W * 0.08, y(b.centerMm) - h / 2, W * 0.84, h);
  }
  ctx.globalAlpha = 1;
  if (q.frontMarkMm !== null) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, H / 300);
    ctx.beginPath();
    ctx.moveTo(0, y(q.frontMarkMm));
    ctx.lineTo(W, y(q.frontMarkMm));
    ctx.stroke();
  }
}

export function buildPhotoObject(o: OpticalObject, w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: Label, seg: number): CellVisual | null {
  const id = o.id;
  const G = GEO_B08;
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }));
  const glass = (opacity = 0.34) => own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity, roughness: 0.08, depthWrite: false }));
  const plaque = (text: string, width: number, band: string, z: number) => flat(label([text], width, 1.2, band), 0, 0.05, z);
  const world = (c: { world?: OpticalWorld; w?: OpticalWorld }) => (c.world ?? c.w) as PhotoWorld;
  const hit = (geo: THREE.BufferGeometry, y: number) => at(hitMesh(geo, id), 0, y, 0);
  switch (o.kind) {
    case 'hypothesisBoard': {
      const b = box(26, 16, 0.8, std(0xf5f5f0));
      b.position.y = 8;
      b.rotation.x = -0.25;
      group.add(b, plaque(o.label ?? '', 12, '#2e7d32', 3));
      group.add(hit(new THREE.BoxGeometry(26, 16, 3), 8));
      return { ringR: 14 };
    }
    case 'sprigTray': {
      const T = G.tray;
      const b = box(T.w, T.h, T.d, std(0x7fb0a0));
      b.position.y = T.h / 2;
      group.add(b, plaque(o.label ?? '', 11, '#00695c', T.d / 2 + 1));
      group.add(hit(new THREE.BoxGeometry(T.w, T.h, T.d), T.h / 2));
      return { ringR: T.w / 2 + 1 };
    }
    case 'elodeaSprig': {
      const green = std((w0 as PhotoWorld).photo?.sprigs[id]?.damaged ? 0x8a8a3c : 0x2f8f3e, { roughness: 0.8 });
      const stem = cyl(0.08, 4.5, green, 6);
      stem.position.y = 2.2;
      group.add(stem);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 4), green);
        leaf.scale.set(1, 0.25, 0.5);
        leaf.position.set(Math.cos(i * 2.1) * 0.35, 0.5 + i * 0.6, Math.sin(i * 2.1) * 0.35);
        leaf.rotation.y = i * 2.1;
        group.add(leaf);
      }
      group.add(hit(new THREE.CylinderGeometry(1, 1, 5, 8), 2.5));
      return { ringR: 1.6 };
    }
    case 'gasRack':
    case 'btbRack': {
      const R = G.rack;
      const m = std(0xb0bec5);
      const w = o.kind === 'gasRack' ? R.w : R.w + 4;
      group.add(at(box(w, 0.5, R.d, m), 0, 0.25, 0), at(box(w, 0.5, R.d, m), 0, R.h - 0.25, 0));
      for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) group.add(at(box(0.5, R.h, R.d, m), x, R.h / 2, 0));
      group.add(plaque(o.label ?? '', 11, '#37474f', R.d / 2 + 1));
      group.add(hit(new THREE.BoxGeometry(w, 1, R.d), 0.5));
      return { ringR: w / 2 + 1 };
    }
    case 'gasTube': {
      const T = G.tube;
      const tube = cyl(T.r, T.h, glass(), seg);
      tube.position.y = T.h / 2;
      const liquid = cyl(T.r * 0.9, 1, std(0xb7dcec, { transparent: true, opacity: 0.55 }), seg);
      liquid.visible = false;
      const stopper = cyl(T.r * 1.05, 1.4, std(0x4e342e), seg);
      stopper.position.y = T.h + 0.7;
      stopper.visible = false;
      // Capilar graduado: vidrio horizontal y columna cuyo extremo es la lectura del dominio.
      const cap = new THREE.Group();
      const capLen = 18;
      const capGlass = cyl(0.3, capLen, glass(0.4), 10);
      capGlass.rotation.z = Math.PI / 2;
      capGlass.position.x = capLen / 2;
      const column = cyl(0.17, 1, std(0xd84315), 8);
      column.rotation.z = Math.PI / 2;
      const zero = box(0.08, 0.9, 0.1, std(0x222222));
      zero.position.x = capLen / 2;
      cap.add(capGlass, column, zero);
      for (let k = 1; k < 9; k++) cap.add(at(box(0.04, k % 5 ? 0.45 : 0.7, 0.08, std(0x333333)), capLen / 2 + (k - 4.5) * 1.9, 0, 0));
      cap.position.set(0, T.h + 1.5, 0);
      cap.visible = false;
      group.add(liquid, tube, stopper, cap, plaque(o.label ?? '', 5, '#0277bd', T.r + 1));
      group.add(hit(new THREE.CylinderGeometry(T.r + 0.3, T.r + 0.3, T.h + 2, 10), (T.h + 2) / 2));
      return {
        ringR: T.r + 1,
        update: (ctx) => {
          const t = world(ctx as never).photo.tubes[id];
          const h = (t.mL / T.capacityMl) * T.h;
          liquid.visible = h > 0.05;
          liquid.scale.y = Math.max(0.01, h);
          liquid.position.y = h / 2;
          stopper.visible = t.stopper01 > 0;
          stopper.position.y = T.h + 0.7 + (1 - t.stopper01) * 1.2;
          cap.visible = t.capConnected;
          cap.rotation.z = (t.levelDeg * Math.PI) / 180;
          const pos = Math.max(0.1, Math.min(capLen - 0.1, capLen / 2 + t.hMm * 0.19));
          column.scale.y = pos;
          column.position.x = pos / 2;
        },
      };
    }
    case 'thermalTank': {
      const T = G.tank;
      const water = box(T.w - 0.6, T.h * 0.75, T.d - 0.6, std(0x8ccbe0, { transparent: true, opacity: 0.4, depthWrite: false }));
      water.position.y = (T.h * 0.75) / 2;
      const shell = new THREE.Mesh(new RoundedBoxGeometry(T.w, T.h, T.d, 2, 0.3), glass(0.18));
      shell.position.y = T.h / 2;
      const base = box(T.w, 0.4, T.d, std(0x90a4ae));
      base.position.y = 0.2;
      group.add(base, water, shell, plaque(o.label ?? '', 12, '#01579b', T.d / 2 + 1.2));
      group.add(hit(new THREE.BoxGeometry(T.w, 2, T.d), 1));
      return { ringR: T.w / 2 + 1 };
    }
    case 'plantLamp': {
      const L = G.lamp;
      const base = cyl(L.r, 1, std(0x37474f), seg);
      base.position.y = 0.5;
      const pole = cyl(0.4, L.h, std(0x546e7a, { metalness: 0.5 }), 10);
      pole.position.y = L.h / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4.5, seg, 1, true), std(0x455a64, { side: THREE.DoubleSide }));
      head.rotation.x = -0.97;
      head.position.set(0, L.h - 1.5, 1.5);
      const bulbMat = std(0xfff3c4, { emissive: 0xfff0b0, emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), bulbMat);
      bulb.position.set(0, L.h - 2.5, 2.2);
      // Sin luz real: un punto de luz por lámpara encendida pesa poco, pero aquí basta el emisivo y el halo.
      const halo = new THREE.Mesh(new THREE.ConeGeometry(5, 18, 16, 1, true), own(new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })));
      halo.rotation.x = -0.97;
      halo.position.set(0, L.h - 8, 10.6);
      halo.visible = false;
      group.add(base, pole, head, bulb, halo, plaque(o.label ?? '', 9, '#ef6c00', L.r + 1));
      group.add(hit(new THREE.CylinderGeometry(L.r, L.r, L.h, 10), L.h / 2));
      return {
        ringR: L.r + 1,
        update: (ctx) => {
          const l = world(ctx as never).photo.lamps[id];
          bulbMat.emissiveIntensity = l.on ? 0.4 + (l.powerPct / 100) * 1.4 : 0;
          halo.visible = l.on;
        },
      };
    }
    case 'darkCover': {
      const C = G.cover;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, C.h, seg, 1, true), std(0x9ea7ad, { metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }));
      c.position.y = C.h / 2;
      group.add(c, plaque(o.label ?? '', 6, '#424242', C.r + 1));
      group.add(hit(new THREE.CylinderGeometry(C.r, C.r, C.h, 8), C.h / 2));
      return { ringR: C.r + 1 };
    }
    case 'btbTube': {
      const T = G.btb;
      const tube = cyl(T.r, T.h, glass(), seg);
      tube.position.y = T.h / 2;
      const m = std(0xcfe8f5, { transparent: true, opacity: 0.8, roughness: 0.3 });
      const liquid = cyl(T.r * 0.88, 1, m, seg);
      liquid.visible = false;
      group.add(liquid, tube);
      group.add(hit(new THREE.CylinderGeometry(T.r + 0.3, T.r + 0.3, T.h, 8), T.h / 2));
      return {
        ringR: T.r + 0.8,
        update: (ctx) => {
          const w = world(ctx as never);
          const t = w.photo.btb[id];
          const h = (t.mL / T.capacityMl) * T.h;
          liquid.visible = h > 0.05;
          liquid.scale.y = Math.max(0.01, h);
          liquid.position.y = h / 2;
          m.color.setHex(t.drops > 0 ? BTB_RGB[btbColorOf(w, id)] : 0xcfe8f5);
        },
      };
    }
    case 'btbDropper': {
      const D = G.dropper;
      const b = cyl(D.r, D.h, std(0x2f6fc4, { transparent: true, opacity: 0.85, roughness: 0.25 }), seg);
      b.position.y = D.h / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.5, 10), mats.blackPlastic);
      tip.position.y = D.h + 0.75;
      group.add(b, tip, plaque(o.label ?? '', 6, '#1565c0', D.r + 1));
      group.add(hit(new THREE.CylinderGeometry(D.r, D.r, D.h + 1.5, 8), (D.h + 1.5) / 2));
      return { ringR: D.r + 0.8 };
    }
    case 'co2Dispenser': {
      const D = G.dispenser;
      const b = new THREE.Mesh(new RoundedBoxGeometry(D.w, D.h, D.d, 2, 0.5), std(0x607d8b));
      b.position.y = D.h / 2;
      const nozzle = cyl(0.3, 5, std(0x263238), 8);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, D.h - 3, D.d / 2 + 2.5);
      group.add(b, nozzle, plaque(o.label ?? '', 9, '#37474f', D.d / 2 + 1.2));
      group.add(hit(new THREE.BoxGeometry(D.w, D.h, D.d), D.h / 2));
      return { ringR: D.w / 2 + 1 };
    }
    case 'fumeHood': {
      const H = G.hood;
      const m = std(0xe4e8ea);
      const clear = glass(0.14);
      group.add(at(box(H.w, 0.6, H.d, std(0xc7ced2)), 0, 0.02, 0));
      group.add(at(box(H.w, H.h, 0.8, m), 0, H.h / 2, -H.d / 2));
      for (const x of [-H.w / 2, H.w / 2]) group.add(at(box(0.8, H.h, H.d, clear), x, H.h / 2, 0));
      group.add(at(box(H.w, 2, H.d, m), 0, H.h, 0));
      // Mampara levantada: sin tapar la mesa desde la cámara.
      group.add(at(box(H.w, 10, 0.3, clear), 0, H.h - 6, H.d / 2));
      const vent = box(H.w * 0.5, 2.5, 0.4, std(0x37474f));
      vent.position.set(0, H.h - 8, -H.d / 2 + 0.7);
      group.add(vent, plaque(o.label ?? '', 10, '#b71c1c', H.d / 2 - 1));
      group.add(hit(new THREE.BoxGeometry(H.w, 1.2, H.d), 0.1));
      return { ringR: 12 };
    }
    case 'solventBottle': {
      const B = G.bottle;
      const color = id === 'bW' ? 0xbfe3f2 : id === 'bE' ? 0xe0d3a2 : id === 'bA' ? 0xd7dfe8 : 0xefe6c0;
      const b = cyl(B.r, B.h, std(color, { transparent: true, opacity: 0.75, roughness: 0.25 }), seg);
      b.position.y = B.h / 2;
      const cap = cyl(B.r * 0.55, 1.6, mats.blackPlastic, 12);
      cap.position.y = B.h + 0.8;
      group.add(b, cap, plaque(o.label ?? '', 7, id === 'bW' ? '#0277bd' : '#c62828', B.r + 1));
      group.add(hit(new THREE.CylinderGeometry(B.r, B.r, B.h + 1.6, 10), (B.h + 1.6) / 2));
      return {
        ringR: B.r + 1,
        update: (ctx) => {
          cap.position.y = B.h + 0.8 + (world(ctx as never).photo.solvents[id]?.open ? 2.2 : 0);
        },
      };
    }
    case 'leafBalance': {
      const B = G.balance;
      const b = new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h - 1, B.d, 2, 0.5), std(0xeceff1));
      b.position.y = (B.h - 1) / 2;
      const pan = cyl(5.5, 0.4, std(0xb0bec5, { metalness: 0.7, roughness: 0.35 }), seg);
      pan.position.y = B.h - 0.2;
      group.add(b, pan, plaque(o.label ?? '', 7, '#37474f', B.d / 2 + 1));
      group.add(hit(new THREE.BoxGeometry(B.w, B.h, B.d), B.h / 2));
      return { ringR: B.w / 2 + 1 };
    }
    case 'mortar': {
      const M = G.mortar;
      const pts = [[1.5, 0], [M.r * 0.6, 0.1], [M.r, M.h], [M.r - 0.5, M.h], [M.r * 0.5, 0.9], [0, 0.7]].map(([x, y]) => new THREE.Vector2(x, y));
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), std(0xf1efe8, { roughness: 0.85, side: THREE.DoubleSide }));
      const pest = cyl(0.6, 8, std(0xe3e0d6), 10);
      pest.position.set(1.6, 4.5, 0);
      pest.rotation.z = -0.45;
      const pulp = cyl(M.r * 0.55, 0.4, std(0x2f7d3a, { roughness: 0.9 }), seg);
      pulp.position.y = 1;
      pulp.visible = false;
      group.add(bowl, pulp, pest, plaque(o.label ?? '', 6, '#5d4037', M.r + 1));
      group.add(hit(new THREE.CylinderGeometry(M.r, M.r, M.h, 10), M.h / 2));
      return {
        ringR: M.r + 1,
        update: (ctx) => {
          const l = world(ctx as never).photo.leaf;
          pulp.visible = l.transferredG > 0 && l.strokes > 3;
        },
      };
    }
    case 'spinachLeaf': {
      const shape = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), std(0x2e7d32, { roughness: 0.85 }));
      shape.scale.set(1, 0.08, 1.5);
      shape.position.y = 0.2;
      group.add(shape);
      group.add(hit(new THREE.BoxGeometry(5, 1, 7), 0.5));
      return {
        ringR: 4,
        update: (ctx) => {
          shape.visible = !(world(ctx as never).photo.leaf.strokes > 3);
        },
      };
    }
    case 'sepTube': {
      const S = G.sep;
      const tube = cyl(S.r, S.h, glass(), seg);
      tube.position.y = S.h / 2;
      const lower = cyl(S.r * 0.88, 1, std(0xb7dcec, { transparent: true, opacity: 0.6 }), seg);
      const upper = cyl(S.r * 0.88, 1, std(0x2c8a3e, { transparent: true, opacity: 0.8 }), seg);
      const cap = cyl(S.r * 1.05, 1.1, std(0xc62828), seg);
      group.add(lower, upper, tube, cap, plaque(o.label ?? '', 7, '#2e7d32', S.r + 1));
      group.add(hit(new THREE.CylinderGeometry(S.r + 0.3, S.r + 0.3, S.h, 10), S.h / 2));
      return {
        ringR: S.r + 1,
        update: (ctx) => {
          const w = world(ctx as never);
          const s = w.photo.sep;
          const k = S.h / 14;
          const lo = s.waterMl * k;
          const up = (s.acetoneMl + s.hydroMl) * k * (s.aspirated ? 0.3 : 1);
          lower.visible = lo > 0.05;
          lower.scale.y = Math.max(0.01, lo);
          lower.position.y = lo / 2;
          upper.visible = up > 0.05;
          upper.scale.y = Math.max(0.01, up);
          upper.position.y = lo + up / 2;
          (upper.material as THREE.MeshStandardMaterial).color.setHex(s.mix01 > 0 ? 0x2c8a3e : 0xd9e2e8);
          cap.position.y = S.h + 0.5 + (s.closed ? 0 : 1.5);
        },
      };
    }
    case 'extractVial': {
      const v = cyl(1.2, 4, glass(0.4), seg);
      v.position.y = 2;
      const liq = cyl(1, 2.4, std(0x1f7a39, { transparent: true, opacity: 0.85 }), seg);
      liq.position.y = 1.3;
      group.add(liq, v, plaque(o.label ?? '', 6, '#2e7d32', 2.4));
      group.add(hit(new THREE.CylinderGeometry(1.5, 1.5, 4, 8), 2));
      return {
        ringR: 2.2,
        update: (ctx) => {
          liq.visible = world(ctx as never).photo.vialReady;
          // Una vez en el residuo queda dentro del bidón: no se dibuja sobre la tapa.
          group.visible = w0.objects[id] !== undefined && world(ctx as never).objects[id].support !== 'organicWaste';
        },
      };
    }
    case 'paperStand': {
      const S = G.stand;
      const b = box(S.w, S.h, S.d, std(0xd7ccc8));
      b.position.y = S.h / 2;
      const ruler = box(S.w * 0.92, 0.2, 1.2, std(0xf5e6a8));
      ruler.position.set(0, S.h + 0.1, S.d / 2 - 1);
      group.add(b, ruler, plaque(o.label ?? '', 8, '#5d4037', S.d / 2 + 1));
      group.add(hit(new THREE.BoxGeometry(S.w, S.h + 0.3, S.d), S.h / 2));
      return { ringR: S.w / 2 + 1 };
    }
    case 'chromPaper': {
      const P = G.paper;
      const hasCanvas = typeof document !== 'undefined';
      const canvas = hasCanvas ? document.createElement('canvas') : null;
      if (canvas) {
        canvas.width = 32;
        canvas.height = 440;
      }
      const tex = canvas ? own(new THREE.CanvasTexture(canvas)) : null;
      if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      const m = std(0xf7f4ea, { map: tex ?? undefined, side: THREE.DoubleSide, roughness: 0.9 });
      // Tumbado sobre el tablero (eje mayor en X) o colgado en el tubo.
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.l), m);
      group.add(sheet);
      group.add(hit(new THREE.BoxGeometry(P.l, 1.2, P.w + 1), 0.4));
      let lastKey = '';
      return {
        ringR: 4,
        update: (ctx, ob) => {
          const w = world(ctx as never);
          const q = w.photo.paper;
          const key = `${q.spots}|${q.originMm}|${q.frontMarkMm}|${Math.floor(q.frontMm / 2)}|${q.removedAt}|${q.frontLost}`;
          if (canvas && tex && key !== lastKey) {
            lastKey = key;
            const c2 = canvas.getContext('2d');
            if (c2) {
              drawPaper(c2, canvas.width, canvas.height, w);
              tex.needsUpdate = true;
            }
          }
          sheet.visible = q.cut && ob.support !== 'organicWaste';
          if (ob.support === 'devTube') {
            sheet.rotation.set(0, 0, 0);
            sheet.position.set(0, P.l / 2, 0);
          } else {
            sheet.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
            sheet.position.set(0, 0.06, 0);
            sheet.scale.y = 0.75;
          }
          if (ob.support === 'devTube') sheet.scale.y = 1;
        },
      };
    }
    case 'devTube': {
      const D = G.devTube;
      const tube = cyl(D.r, D.h, glass(0.22), seg);
      tube.position.y = D.h / 2;
      const liq = cyl(D.r * 0.9, 1, std(0xe0d3a2, { transparent: true, opacity: 0.6 }), seg);
      liq.visible = false;
      const lid = cyl(D.r * 1.1, 0.8, std(0x37474f), seg);
      group.add(liq, tube, lid, plaque(o.label ?? '', 8, '#6a1b9a', D.r + 1.2));
      group.add(hit(new THREE.CylinderGeometry(D.r + 0.3, D.r + 0.3, D.h, 10), D.h / 2));
      return {
        ringR: D.r + 1,
        update: (ctx) => {
          const q = world(ctx as never).photo.paper;
          const h = q.eluentMm / 10;
          liq.visible = h > 0;
          liq.scale.y = Math.max(0.01, h);
          liq.position.y = h / 2;
          lid.position.y = D.h + (q.chamberClosed ? 0.4 : 4);
        },
      };
    }
    case 'organicWaste':
    case 'drainSink': {
      const W = G.waste;
      const organic = o.kind === 'organicWaste';
      const b = cyl(W.r, organic ? W.h : 3, std(organic ? 0xef6c00 : 0x90a4ae), seg);
      b.position.y = (organic ? W.h : 3) / 2;
      group.add(b, plaque(o.label ?? '', 8, organic ? '#e65100' : '#455a64', W.r + 1));
      group.add(hit(new THREE.CylinderGeometry(W.r, W.r, organic ? W.h : 3, 10), (organic ? W.h : 3) / 2));
      return { ringR: W.r + 1 };
    }
  }
  return null;
}
