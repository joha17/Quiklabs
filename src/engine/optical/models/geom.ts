/**
 * Utilidades de geometría para los instrumentos de B01: perillas moleteadas, piezas torneadas (revólver, objetivos,
 * oculares), perfiles extruidos con canto redondeado (brazo, base, cabezal) y fusión de cada conjunto rígido en una
 * malla por material (presupuesto de llamadas de dibujo, §17.15).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Cilindro moleteado a lo largo de Y: estrías alternas (relieve de agarre de una perilla). */
export function knurled(r: number, h: number, ribs = 18, depth = 0.07): THREE.BufferGeometry {
  const seg = ribs * 2;
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < r * 0.5) continue;
    const a = Math.atan2(x, z);
    const k = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * seg) % seg;
    if (k % 2) {
      pos.setX(i, x * (1 - depth));
      pos.setZ(i, z * (1 - depth));
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Pieza torneada: perfil [radio, altura] alrededor de Y. */
export function lathe(profile: Array<[number, number]>, seg = 24): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
}

/**
 * Perfil lateral (u = z local, v = y) extruido a lo ancho en X, centrado en x = 0, con canto biselado redondeado.
 */
export function sideProfile(draw: (s: THREE.Shape) => void, width: number, bevel = 0.5, curveSegments = 10): THREE.BufferGeometry {
  const s = new THREE.Shape();
  draw(s);
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}

/** Planta (u = x, v = −z local) extruida hacia arriba desde y = 0, con canto redondeado. */
export function plan(draw: (s: THREE.Shape) => void, height: number, bevel = 0.5, curveSegments = 10): THREE.BufferGeometry {
  const s = new THREE.Shape();
  draw(s);
  const depth = Math.max(0.01, height - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

/** Rectángulo de esquinas redondeadas centrado en (cx, cy). */
export function roundedRect(s: THREE.Shape, cx: number, cy: number, w: number, h: number, r: number) {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
}

/** Malla colocada (posición y giro) para armar conjuntos legibles antes de fusionarlos. */
export function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

const KEEP = new Set(['position', 'normal', 'uv']);

/**
 * Fusiona las mallas visibles de `root` (sin los volúmenes de selección ni los hijos marcados `keep`) en una malla por
 * material, en el marco de `root`. Las mallas fusionadas se retiran; el resto del árbol se conserva.
 */
export function mergeRigid(root: THREE.Object3D): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const taken: THREE.Mesh[] = [];
  root.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.userData.objId || m.userData.keep || Array.isArray(m.material)) return;
    for (let p = m.parent; p && p !== root; p = p.parent) if (p.userData.keep) return;
    let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
    g.clearGroups();
    const list = byMat.get(m.material) ?? [];
    list.push(g);
    byMat.set(m.material, list);
    taken.push(m);
  });
  for (const m of taken) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  const out: THREE.Mesh[] = [];
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}
