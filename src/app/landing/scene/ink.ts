/**
 * Estética de «dibujo lineal» para la escena de la página de inicio: rellenos planos con dos tonos, contorno de tinta
 * (casco invertido) y aristas de 2 px, y vidrio transparente cuyo borde se dibuja con tinta según el ángulo de visión.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export const PALETTE = {
  paper: 0xebe8e2,
  white: 0xf8f7f4,
  ink: 0x0f1b1d,
  grey: 0xc9c6bf,
  steel: 0xd9dad6,
  teal: 0x2b8c88,
  tealLight: 0x5fbcb3,
  coral: 0xf05a4a,
  yellow: 0xf6be18,
  pink: 0xe2408a,
  blue: 0x3d7fe0,
  flame: 0x6aa8ff,
  flameCore: 0x8ef0ff,
} as const;

/** Materiales de línea compartidos (necesitan la resolución del lienzo). */
export class InkKit {
  readonly lineMats: LineMaterial[] = [];
  private gradient: THREE.DataTexture;
  private hullMats = new Map<number, THREE.MeshBasicMaterial>();

  constructor() {
    // Sombreado de dos tonos (relleno plano con una sombra suave), como una ilustración.
    const data = new Uint8Array([200, 200, 200, 255, 255, 255, 255, 255]);
    this.gradient = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
    this.gradient.minFilter = THREE.NearestFilter;
    this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;
  }

  line(width = 2, color: number = PALETTE.ink, opacity = 1): LineMaterial {
    const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, worldUnits: false });
    this.lineMats.push(m);
    return m;
  }

  setResolution(w: number, h: number) {
    for (const m of this.lineMats) m.resolution.set(w, h);
  }

  fill(color: number, opts: { opacity?: number } = {}): THREE.MeshToonMaterial {
    return new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 });
  }

  /** Casco invertido: dibuja la silueta engrosando la malla hacia afuera y mostrando solo sus caras traseras. */
  hull(thickness: number): THREE.MeshBasicMaterial {
    const hit = this.hullMats.get(thickness);
    if (hit) return hit;
    const m = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });
    m.onBeforeCompile = (s) => {
      s.uniforms.uThick = { value: thickness };
      s.vertexShader = `uniform float uThick;\n${s.vertexShader}`.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uThick;');
    };
    m.customProgramCacheKey = () => `hull-${thickness}`;
    this.hullMats.set(thickness, m);
    return m;
  }

  /** Vidrio: casi transparente en el centro y con borde de tinta donde la superficie se ve de canto. */
  glass(opts: { tint?: number; alpha?: number } = {}): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uFill: { value: new THREE.Color(opts.tint ?? PALETTE.white) },
        uInk: { value: new THREE.Color(PALETTE.ink) },
        uAlpha: { value: opts.alpha ?? 0.22 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFill;
        uniform vec3 uInk;
        uniform float uAlpha;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float rim = smoothstep(0.83, 0.9, f);
          float sheen = smoothstep(0.45, 0.6, f) * 0.18;
          gl_FragColor = vec4(mix(uFill, uInk, rim), clamp(uAlpha + sheen + rim, 0.0, 1.0));
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /** Malla con relleno plano, contorno grueso y aristas marcadas. */
  solid(geo: THREE.BufferGeometry, color: number, opts: { outline?: number; edges?: number | false; lineWidth?: number } = {}): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, this.fill(color)));
    const t = opts.outline ?? 0.06;
    if (t > 0) g.add(new THREE.Mesh(geo, this.hull(t)));
    if (opts.edges !== false) g.add(this.edges(geo, opts.edges ?? 30, opts.lineWidth ?? 2));
    return g;
  }

  /** Aristas de 2 px donde el ángulo entre caras supera `threshold` grados. */
  edges(geo: THREE.BufferGeometry, threshold = 30, width = 2): LineSegments2 {
    const lg = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geo, threshold));
    return new LineSegments2(lg, this.line(width));
  }

  /** Polilínea de 2 px (por ejemplo, graduaciones o el contorno de un círculo). */
  polyline(points: THREE.Vector3[], width = 2, color: number = PALETTE.ink, closed = false): LineSegments2 {
    const pos: number[] = [];
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const lg = new LineSegmentsGeometry().setPositions(pos);
    return new LineSegments2(lg, this.line(width, color));
  }
}

/** Perfil de revolución en puntos (r, y). */
export const lathe = (pts: Array<[number, number]>, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Interpola el radio de un perfil a una altura (para recortar el líquido dentro del recipiente). */
export function radiusAt(profile: Array<[number, number]>, y: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1][0];
}

/** Perfil del líquido: el interior del recipiente hasta el nivel `level`, con la superficie plana. */
export function liquidProfile(inner: Array<[number, number]>, level: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [r, y] of inner) {
    if (y >= level) break;
    out.push([r, y]);
  }
  out.push([radiusAt(inner, level), level], [0, level]);
  return out;
}
