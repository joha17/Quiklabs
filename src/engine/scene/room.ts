/**
 * Sala de laboratorio 3D procedural (decorativa, no interactiva): suelo, pared con azulejos y canaleta de servicios,
 * estante de reactivos, vitrinas con material de vidrio, campana de extracción, carteles, reloj, lavaojos,
 * fregadero con grifo, mesada de resina epoxi y muebles bajos con cajones. Instanciada para pocas llamadas de dibujo.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BENCH } from '../../practices/practice-02/definition';
import type { QualityLevel } from '../quality';
import { QUALITY } from '../quality';
import { clockTexture, epoxyTexture, floorTexture, labelTexture, posterTexture, tileTexture } from '../renderers/textures';

export const WALL_Z = -66.5;
export const BENCH_EXT = BENCH.length + 75;
export const FLOOR_Y = -88;

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Varias cajas iguales con una sola llamada de dibujo. */
function instancedBoxes(size: [number, number, number], mat: THREE.Material, positions: Array<[number, number, number]>, colors?: number[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), mat, positions.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  positions.forEach((p, i) => {
    d.position.set(...p);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    if (colors) m.setColorAt(i, c.setHex(colors[i % colors.length]));
  });
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** `variant`: cartelería de la práctica (la sala y la mesada son las mismas). */
export function createRoom(q: QualityLevel, variant: 'p2' | 'p3' = 'p2'): THREE.Group {
  const g = new THREE.Group();
  const detail = QUALITY[q].roomDetail;
  const L = BENCH.length;
  const D = BENCH.depth;

  // ── Suelo ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 700), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(300, FLOOR_Y, 150);
  floor.receiveShadow = true;
  g.add(floor);

  // ── Pared trasera: azulejos abajo, pintura arriba ──
  const tiles = tileTexture();
  tiles.repeat.set(1600 / 30, 30 / 15);
  const tileWall = new THREE.Mesh(new THREE.PlaneGeometry(1600, 30), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.35 }));
  tileWall.position.set(300, 15, WALL_Z);
  tileWall.receiveShadow = true;
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(1600, 160), new THREE.MeshStandardMaterial({ color: 0xe4ebe7, roughness: 0.95 }));
  paint.position.set(300, 110, WALL_Z - 0.01);
  paint.receiveShadow = true;
  const lowWall = new THREE.Mesh(new THREE.PlaneGeometry(1600, 90), new THREE.MeshStandardMaterial({ color: 0xcfd6db, roughness: 0.95 }));
  lowWall.position.set(300, -45, WALL_Z - 0.02);
  g.add(tileWall, paint, lowWall);
  // Moldura y techo
  g.add(box(1600, 6, 1.5, new THREE.MeshStandardMaterial({ color: 0xc9d1cd }), 300, 187, WALL_Z + 0.7, false));
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1600, 700), new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(300, 190, 150);
  g.add(ceiling);
  // Paneles de luz en el techo
  const lightPanels = instancedBoxes([60, 1, 30], new THREE.MeshBasicMaterial({ color: 0xffffff }), [-60, 100, 260, 420, 580, 740].map((x) => [x, 189.4, -10] as [number, number, number]));
  lightPanels.castShadow = false;
  g.add(lightPanels);

  // ── Canaleta de servicios con enchufes y llaves de gas ──
  const inHood = (x: number) => x > 345 && x < 560;
  g.add(box(1600, 4, 2, new THREE.MeshStandardMaterial({ color: 0xc3cbd2, roughness: 0.5 }), 300, 19, WALL_Z + 1, false));
  const outlets: Array<[number, number, number]> = [];
  for (let x = 20; x < L; x += 70) if (!inHood(x)) outlets.push([x, 19, WALL_Z + 2.1]);
  g.add(instancedBoxes([6, 3, 0.4], new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), outlets));
  const valves: Array<[number, number, number]> = [];
  for (let x = 55; x < L; x += 140) if (!inHood(x)) valves.push([x, 12, WALL_Z + 3]);
  g.add(instancedBoxes([3.6, 1.2, 1.2], new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }), valves));

  // ── Estante de reactivos con frascos (instanciados) ──
  // En la práctica del mechero no hay reactivos sobre la zona de la llama (§4.2): sin estante.
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0xa47a52, roughness: 0.7 });
  if (variant === 'p2') g.add(box(340, 1.5, 9, shelfMat, 160, 35, WALL_Z + 4.5));
  if (detail && variant === 'p2') {
    const bodies: Array<[number, number, number]> = [];
    const caps: Array<[number, number, number]> = [];
    const cols: number[] = [];
    const glassCols = [0x8b5a2b, 0xa0662a, 0xdfe9ef, 0x6d4c2a, 0xd6e6ef, 0x3b6e4a];
    let x = -5;
    let k = 0;
    while (x < 320) {
      bodies.push([x, 41.75, WALL_Z + 4.5]);
      caps.push([x, 47.5, WALL_Z + 4.5]);
      cols.push(glassCols[k % glassCols.length]);
      x += 8 + ((k * 7) % 5);
      k++;
    }
    const bottleBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.6, 2.6, 11.5, 16), new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.85 }), bodies.length);
    const capMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x1f262d }), caps.length);
    const labelMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.65, 2.65, 4, 16, 1, true, -0.9, 1.8), new THREE.MeshStandardMaterial({ color: 0xfaf6e8, side: THREE.DoubleSide }), bodies.length);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    bodies.forEach((p, i) => {
      d.position.set(...p);
      d.updateMatrix();
      bottleBody.setMatrixAt(i, d.matrix);
      bottleBody.setColorAt(i, c.setHex(cols[i]));
      d.position.set(p[0], p[1] - 0.5, p[2]);
      d.updateMatrix();
      labelMesh.setMatrixAt(i, d.matrix);
      d.position.set(...caps[i]);
      d.updateMatrix();
      capMesh.setMatrixAt(i, d.matrix);
    });
    bottleBody.castShadow = true;
    g.add(bottleBody, capMesh, labelMesh);
  }

  // ── Vitrinas superiores con material de vidrio ──
  const cabWood = new THREE.MeshStandardMaterial({ color: 0xb98d5f, roughness: 0.6 });
  const glassPane = new THREE.MeshPhysicalMaterial({ color: 0xdbe6ee, roughness: 0.05, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false });
  for (const [x0, x1] of variant === 'p2' ? [[-20, 120], [140, 300]] : [[-20, 100]]) {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    g.add(box(w, 70, 2, cabWood, cx, 93, WALL_Z + 1));
    g.add(box(w, 2.5, 26, cabWood, cx, 128.75, WALL_Z + 13));
    g.add(box(w, 2.5, 26, cabWood, cx, 57.25, WALL_Z + 13));
    g.add(box(2.5, 70, 26, cabWood, x0 + 1.25, 93, WALL_Z + 13));
    g.add(box(2.5, 70, 26, cabWood, x1 - 1.25, 93, WALL_Z + 13));
    g.add(box(w - 4, 1.2, 24, cabWood, cx, 91, WALL_Z + 13));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 4, 68), glassPane);
    pane.position.set(cx, 93, WALL_Z + 26);
    pane.renderOrder = 2;
    g.add(pane);
    if (detail) {
      // Material de vidrio dentro (erlenmeyers y vasos), instanciado.
      const flaskProfile = [new THREE.Vector2(0.01, 0), new THREE.Vector2(5, 0), new THREE.Vector2(5.2, 0.6), new THREE.Vector2(1.4, 9), new THREE.Vector2(1.4, 13)];
      const flask = new THREE.InstancedMesh(new THREE.LatheGeometry(flaskProfile, 16), new THREE.MeshPhysicalMaterial({ color: 0xcfe3f2, roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false }), 12);
      const d = new THREE.Object3D();
      let i = 0;
      for (const shelfY of [58.5, 92.2]) {
        for (let xx = x0 + 12; xx < x1 - 8 && i < 12; xx += 24) {
          d.position.set(xx, shelfY, WALL_Z + 12);
          d.scale.setScalar(0.8 + ((xx * 13) % 5) / 10);
          d.updateMatrix();
          flask.setMatrixAt(i++, d.matrix);
        }
      }
      flask.count = i;
      g.add(flask);
    }
  }

  // ── Carteles, reloj ──
  const poster = (tex: THREE.Texture, x: number, y: number, w = 18, h = 25) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    m.position.set(x, y, WALL_Z + 0.2);
    g.add(m);
  };
  poster(posterTexture('EPP', ['Bata · gafas', 'calzado cerrado'], '#1565c0', 'goggles'), 130, 75);
  if (variant === 'p3') {
    poster(posterTexture('GAS', ['Nunca buscar fugas', 'con una llama'], '#f2a900', 'ox'), 318, 60);
    poster(posterTexture('HCl', ['solo dentro de', 'la campana'], '#d0021b', 'nofood'), 318, 92);
  } else {
    poster(posterTexture('COMBURENTE', ['KNO₃: lejos de', 'combustibles'], '#f2a900', 'ox'), 318, 60);
    poster(posterTexture('PROHIBIDO', ['comer y beber'], '#d0021b', 'nofood'), 318, 92);
  }
  poster(posterTexture('LAVAOJOS', ['de emergencia'], '#1e8e4e', 'eye'), 605, 60, 16, 22);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6 }));
  clock.position.set(336, 135, WALL_Z + 0.5);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(9, 0.8, 8, 40), new THREE.MeshStandardMaterial({ color: 0x2b3238 }));
  rim.position.copy(clock.position);
  g.add(clock, rim);

  // ── Campana de extracción (estaciones D–E) ──
  const h0 = 352;
  const h1 = 552;
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0xe6eaed, roughness: 0.5 });
  const inner = new THREE.MeshStandardMaterial({ color: 0xd5dbe0, roughness: 0.6, metalness: 0.2 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(h1 - h0, 118), inner);
  back.position.set((h0 + h1) / 2, 59, WALL_Z + 0.3);
  back.receiveShadow = true;
  g.add(back);
  g.add(box(h1 - h0 + 8, 32, 30, hoodMat, (h0 + h1) / 2, 134, WALL_Z + 15));
  g.add(box(4, 150, 14, hoodMat, h0 - 2, 75, WALL_Z + 7));
  g.add(box(4, 150, 14, hoodMat, h1 + 2, 75, WALL_Z + 7));
  // Luz bajo la campana y guillotina levantada
  const lightStrip = new THREE.Mesh(new THREE.PlaneGeometry(h1 - h0 - 30, 4), new THREE.MeshBasicMaterial({ color: 0xfff8e1 }));
  lightStrip.rotation.x = Math.PI / 2;
  lightStrip.position.set((h0 + h1) / 2, 117.8, WALL_Z + 15);
  g.add(lightStrip);
  g.add(box(h1 - h0 - 10, 4, 1.5, new THREE.MeshStandardMaterial({ color: 0xbfc8cf, metalness: 0.3 }), (h0 + h1) / 2, 116, WALL_Z + 29, false));
  const hoodLabel = new THREE.Mesh(new THREE.PlaneGeometry(70, 9), new THREE.MeshStandardMaterial({ map: labelTexture(['CAMPANA DE EXTRACCIÓN', 'velocidad de cara 0,5 m/s'], { band: '#46637d', w: 512, h: 72 }) }));
  hoodLabel.position.set((h0 + h1) / 2, 136, WALL_Z + 30.1);
  g.add(hoodLabel);
  // Ranuras del deflector
  if (detail) {
    const slots: Array<[number, number, number]> = [];
    for (const y of [40, 62, 84]) for (let x = h0 + 25; x < h1 - 25; x += 9) slots.push([x, y, WALL_Z + 0.5]);
    g.add(instancedBoxes([5, 1.2, 0.2], new THREE.MeshStandardMaterial({ color: 0x7d868e }), slots));
  }

  // ── Mesada de resina epoxi (con extensión para el fregadero) ──
  const epoxy = epoxyTexture();
  epoxy.repeat.set(BENCH_EXT / 80, 1);
  const benchMat = new THREE.MeshPhysicalMaterial({ map: epoxy, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.4 });
  const top = new THREE.Mesh(new RoundedBoxGeometry(BENCH_EXT + 12, 3.2, D + 3, 2, 0.8), benchMat);
  top.position.set((BENCH_EXT - 12) / 2, -1.6, -(D + 3) / 2 + 0.5);
  top.receiveShadow = true;
  g.add(top);
  // Fregadero
  const sinkX = L + 40;
  g.add(box(44, 0.4, 34, new THREE.MeshStandardMaterial({ color: 0x5f686f, metalness: 0.7, roughness: 0.3 }), sinkX, 0.05, -34, false));
  const drain = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: 0.6 }));
  drain.rotation.x = -Math.PI / 2;
  drain.position.set(sinkX, 0.3, -30);
  g.add(drain);
  const faucetCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(sinkX, 0, -60), new THREE.Vector3(sinkX, 30, -60), new THREE.Vector3(sinkX, 36, -52), new THREE.Vector3(sinkX, 30, -44)]);
  const faucet = new THREE.Mesh(new THREE.TubeGeometry(faucetCurve, 24, 1, 10), new THREE.MeshStandardMaterial({ color: 0xe8edf1, metalness: 1, roughness: 0.15 }));
  faucet.castShadow = true;
  g.add(faucet);

  // ── Muebles bajo la mesada ──
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.55 });
  g.add(box(BENCH_EXT + 12, 84, D - 4, new THREE.MeshStandardMaterial({ color: 0xcdd5db }), (BENCH_EXT - 12) / 2, -46, -D / 2, false));
  const doors: Array<[number, number, number]> = [];
  const drawers: Array<[number, number, number]> = [];
  const handles: Array<[number, number, number]> = [];
  for (let x = -12 + 27.5; x < BENCH_EXT; x += 55) {
    drawers.push([x, -11, 0.6]);
    doors.push([x, -50, 0.6]);
    handles.push([x, -11, 1.6]);
  }
  g.add(instancedBoxes([52, 13, 1.2], cabMat, drawers));
  g.add(instancedBoxes([52, 62, 1.2], cabMat, doors));
  g.add(instancedBoxes([18, 1.4, 1], new THREE.MeshStandardMaterial({ color: 0x8a939b, metalness: 0.7, roughness: 0.3 }), handles));
  g.add(box(BENCH_EXT + 12, 6, 2, new THREE.MeshStandardMaterial({ color: 0x2b3238 }), (BENCH_EXT - 12) / 2, FLOOR_Y + 3, -1, false));
  if (q !== 'HIGH') simplifyMaterials(g, q);
  return g;
}

/**
 * La sala ocupa casi toda la pantalla: en GPU integradas su sombreado domina el costo del fotograma (§3.9).
 * Media: sin barniz (clearcoat) y paredes/suelo/techo mates con Lambert. Baja: todo lo no metálico con Lambert.
 */
function simplifyMaterials(g: THREE.Group, q: QualityLevel) {
  const cache = new Map<THREE.Material, THREE.Material>();
  const convert = (m: THREE.Material): THREE.Material => {
    const hit = cache.get(m);
    if (hit) return hit;
    let out: THREE.Material = m;
    if (m instanceof THREE.MeshStandardMaterial) {
      const common = { color: m.color, map: m.map, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, side: m.side };
      const matte = m.metalness < 0.5 && (q === 'LOW' || m.roughness >= 0.8);
      if (matte) out = new THREE.MeshLambertMaterial(common);
      else if (m instanceof THREE.MeshPhysicalMaterial) out = new THREE.MeshStandardMaterial({ ...common, roughness: m.roughness, metalness: m.metalness });
      if (out !== m) m.dispose();
    }
    cache.set(m, out);
    return out;
  };
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) mesh.material = convert(mesh.material);
  });
}
