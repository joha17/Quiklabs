/**
 * Piezas procedurales de los modelos anatómicos de B10: secciones elípticas unidas a lo largo de un eje, tubos, láminas y conos. Cada
 * malla lleva la región del catálogo en `userData.region` (`null`: parte del cuerpo que no se evalúa). Solo dibuja; no decide nada.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];

export interface Ring {
  x: number;
  y?: number;
  /** Semialto y semiancho de la sección. */
  ry: number;
  rz: number;
}

export function mat(color: number, roughness = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide, ...extra });
}

/** Interpola anillos intermedios (Catmull-Rom) para que el perfil sea una curva y no una sucesión de conos. */
function smoothRings(rings: Ring[], steps = 4): Ring[] {
  if (rings.length < 3) return rings;
  const at = (i: number) => rings[Math.max(0, Math.min(rings.length - 1, i))];
  const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  const out: Ring[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push({
        x: cr(p0.x, p1.x, p2.x, p3.x, t),
        y: cr(p0.y ?? 0, p1.y ?? 0, p2.y ?? 0, p3.y ?? 0, t),
        ry: Math.max(0.005, cr(p0.ry, p1.ry, p2.ry, p3.ry, t)),
        rz: Math.max(0.005, cr(p0.rz, p1.rz, p2.rz, p3.rz, t)),
      });
    }
  }
  out.push(rings[rings.length - 1]);
  return out;
}

/** Suaviza un contorno cerrado cortando sus esquinas (Chaikin). */
function roundOutline(o: Array<[number, number]>, passes = 2): Array<[number, number]> {
  let cur = o;
  for (let p = 0; p < passes; p++) {
    const next: Array<[number, number]> = [];
    cur.forEach(([x, y], i) => {
      const [nx, ny] = cur[(i + 1) % cur.length];
      next.push([x * 0.75 + nx * 0.25, y * 0.75 + ny * 0.25], [x * 0.25 + nx * 0.75, y * 0.25 + ny * 0.75]);
    });
    cur = next;
  }
  return cur;
}

/** Superficie que une anillos elípticos sucesivos; los extremos se cierran con un abanico. */
export function loftGeometry(input: Ring[], seg = 18): THREE.BufferGeometry {
  const rings = smoothRings(input);
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of rings) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(r.x, (r.y ?? 0) + Math.sin(a) * r.ry, Math.cos(a) * r.rz);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      idx.push(a, b, a + seg, b, b + seg, a + seg);
    }
  }
  const cap = (ring: number, flip: boolean) => {
    const c = pos.length / 3;
    const r = rings[ring];
    pos.push(r.x, r.y ?? 0, 0);
    // Vértices propios de la tapa: no contaminan las normales del costado, y dos tramos seguidos no marcan una costura.
    const rim = pos.length / 3;
    for (let j = 0; j < seg; j++) pos.push(pos[(ring * seg + j) * 3], pos[(ring * seg + j) * 3 + 1], pos[(ring * seg + j) * 3 + 2]);
    for (let j = 0; j < seg; j++) {
      const a = rim + j;
      const b = rim + ((j + 1) % seg);
      if (flip) idx.push(c, b, a);
      else idx.push(c, a, b);
    }
  };
  cap(0, false);
  cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Kit {
  readonly root = new THREE.Group();

  add(region: string | null, geo: THREE.BufferGeometry, m: THREE.Material, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...at);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    mesh.userData.region = region;
    this.root.add(mesh);
    return mesh;
  }

  loft(region: string | null, rings: Ring[], m: THREE.Material, seg = 18) {
    return this.add(region, loftGeometry(rings, seg), m);
  }

  ball(region: string | null, r: V3, at: V3, m: THREE.Material, rot: V3 = [0, 0, 0]) {
    return this.add(region, new THREE.SphereGeometry(1, 18, 14), m, at, rot, r);
  }

  box(region: string | null, s: V3, at: V3, m: THREE.Material, rot: V3 = [0, 0, 0]) {
    return this.add(region, new THREE.BoxGeometry(...s), m, at, rot);
  }

  /** Tubo por una curva suave; `taper` afina hacia el final con tramos cada vez más delgados. */
  tube(region: string | null, pts: V3[], r: number, m: THREE.Material, taper = 1) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const tubular = Math.max(8, pts.length * 5);
    const radial = 8;
    const g = new THREE.TubeGeometry(curve, tubular, r, radial);
    if (taper !== 1) {
      // TubeGeometry deja (tubular + 1) anillos de (radial + 1) vértices: cada uno se acerca a la curva según avanza.
      const pos = g.attributes.position;
      const c = new THREE.Vector3();
      const v = new THREE.Vector3();
      for (let i = 0; i <= tubular; i++) {
        curve.getPointAt(i / tubular, c);
        const f = 1 - (1 - taper) * (i / tubular);
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(f).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
        }
      }
      g.computeVertexNormals();
    }
    return this.add(region, g, m);
  }

  /** Lámina plana a partir de un contorno en el plano local XY, colocada con posición y giro. */
  sheet(region: string | null, outline: Array<[number, number]>, m: THREE.Material, at: V3, rot: V3 = [0, 0, 0], thick = 0.03) {
    const s = new THREE.Shape();
    roundOutline(outline).forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const bevel = thick > 0.05 ? { bevelEnabled: true, bevelSize: thick * 0.3, bevelThickness: thick * 0.3, bevelSegments: 2 } : { bevelEnabled: false };
    return this.add(region, new THREE.ExtrudeGeometry(s, { depth: thick, curveSegments: 6, ...bevel }), m, at, rot);
  }

  /** Pieza dental: caja de aristas redondeadas. */
  tooth(region: string | null, s: V3, at: V3, m: THREE.Material, rot: V3 = [0, 0, 0]) {
    return this.add(region, new RoundedBoxGeometry(s[0], s[1], s[2], 2, Math.min(...s) * 0.28), m, at, rot);
  }

  /** Cono con la base en `at` y la punta hacia `dir`. */
  cone(region: string | null, r: number, len: number, at: V3, dir: V3, m: THREE.Material) {
    const d = new THREE.Vector3(...dir).normalize();
    const g = new THREE.ConeGeometry(r, len, 8);
    g.translate(0, len / 2, 0);
    const mesh = this.add(region, g, m, at);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    return mesh;
  }
}

/** Lo mismo a ambos lados del cuerpo (espejo en z). */
export function bilateral(fn: (s: 1 | -1) => void) {
  fn(1);
  fn(-1);
}
