/**
 * Geometría de los modelos 3D de B10 (§4.6, §4.7). Cada `region` coincide con las del catálogo puro (`animal-world/catalog.ts`): una prueba
 * comprueba que todas existan. Los ejes son los del catálogo: +x cabeza o rostro, +y dorso, +z lado izquierdo. Son modelos didácticos
 * hechos por el motor, no escaneos; muestran con claridad solo lo que se evalúa.
 */
import { TorusGeometry as TORUS } from 'three';
import { Kit, bilateral, mat, type V3 } from './kit';

type Build = (k: Kit) => void;

const skin = (c: number, r = 0.75) => mat(c, r);
const BONE = 0xe6dcc3;
const DARK = 0x1c1712;
const TOOTH = 0xf4efdc;

// ─────────────────────────── Invertebrados ───────────────────────────

const planaria: Build = (k) => {
  const body = skin(0x7a6655);
  // Cuerpo aplanado, dorso oscuro y cabeza triangular.
  k.loft('d', [{ x: -4, ry: 0.05, rz: 0.15 }, { x: -3, ry: 0.16, rz: 0.75 }, { x: 0, ry: 0.2, rz: 0.95 }, { x: 2.2, ry: 0.18, rz: 0.75 }, { x: 2.8, ry: 0.13, rz: 0.45 }, { x: 3.3, ry: 0.13, rz: 0.75 }, { x: 3.8, ry: 0.06, rz: 0.2 }], body);
  bilateral((s) => {
    k.cone('a', 0.26, 0.75, [3.35, 0, s * 0.55], [0.1, 0, s], skin(0x8c7662));
    k.ball('b', [0.09, 0.05, 0.09], [3.15, 0.15, s * 0.2], mat(0x0c0c0c, 0.3));
    k.ball('b', [0.2, 0.02, 0.2], [3.15, 0.15, s * 0.2], mat(0xe7e0cf));
  });
  k.loft('c', [{ x: -1.2, y: -0.2, ry: 0.05, rz: 0.12 }, { x: -0.3, y: -0.27, ry: 0.12, rz: 0.2 }, { x: 0.5, y: -0.22, ry: 0.06, rz: 0.12 }], skin(0xd9b5a3));
};

const fluke: Build = (k) => {
  const body = skin(0xb5805f);
  k.loft('c', [{ x: -3.4, ry: 0.04, rz: 0.1 }, { x: -2.2, ry: 0.13, rz: 0.75 }, { x: 0, ry: 0.17, rz: 1.25 }, { x: 1.3, ry: 0.15, rz: 1 }, { x: 2.0, ry: 0.12, rz: 0.42 }, { x: 3, ry: 0.1, rz: 0.26 }, { x: 3.4, ry: 0.04, rz: 0.1 }], body);
  const rim = skin(0xe3c1a8);
  k.add('a', torus(0.17, 0.05), rim, [3.1, -0.1, 0], [Math.PI / 2, 0, 0]);
  k.ball(null, [0.09, 0.02, 0.09], [3.1, -0.11, 0], mat(DARK));
  k.add('b', torus(0.3, 0.08), rim, [1.6, -0.15, 0], [Math.PI / 2, 0, 0]);
  k.ball(null, [0.18, 0.02, 0.18], [1.6, -0.16, 0], mat(DARK));
};

const nematode: Build = (k) => {
  const pts: V3[] = [[-4.5, 0.15, 0.4], [-2.8, 0, -0.3], [-1, 0.1, 0.25], [1, 0, -0.2], [2.9, 0.1, 0.2], [4.3, 0.05, -0.2]];
  k.tube('c', pts, 0.26, skin(0xe7d8ba, 0.4));
  k.cone('a', 0.26, 0.45, [4.3, 0.05, -0.2], [1, 0, -0.1], skin(0xcdb893));
  k.cone('b', 0.26, 0.9, [-4.5, 0.15, 0.4], [-1, 0.1, 0.2], skin(0xcdb893));
};

const cestode: Build = (k) => {
  const neckM = skin(0xeadcc0);
  k.ball('a', [0.35, 0.35, 0.35], [4.3, 0, 0], skin(0xdac7a0));
  // Ventosas y corona de ganchos: lo que define al escólex.
  for (const a of [0.8, 2.4, 3.9, 5.5]) k.ball('a', [0.11, 0.11, 0.11], [4.38, Math.sin(a) * 0.31, Math.cos(a) * 0.31], skin(0x8b6f47));
  k.loft('b', [{ x: 4.05, ry: 0.12, rz: 0.12 }, { x: 3.1, ry: 0.07, rz: 0.13 }], neckM);
  // Proglótides: cada vez más anchas; se pliegan con suavidad.
  for (let i = 0; i < 16; i++) {
    const w = 0.15 + i * 0.033;
    const l = 0.13 + i * 0.03;
    // Cada proglótide empieza donde acaba la anterior: es una cadena, no piezas sueltas.
    const x = 3.1 - (i * 0.13 + (i * (i - 1) * 0.03) / 2 + l / 2);
    k.tooth('c', [l * 1.06, 0.07, w * 2], [x, Math.sin(i * 0.5) * 0.14, 0], skin(i % 2 ? 0xf0e4cc : 0xe2d3b0), [0, 0, Math.cos(i * 0.5) * 0.1]);
  }
};

const earthworm: Build = (k) => {
  const pink = skin(0xb5736d, 0.5);
  const dark = skin(0xa0615d, 0.5);
  const N = 34;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = 4.3 - t * 8.6;
    const r = 0.22 + 0.18 * Math.sin(Math.min(1, t * 1.4) * Math.PI) + (t > 0.7 ? -0.08 * ((t - 0.7) / 0.3) : 0);
    const clitellum = i >= 7 && i <= 11;
    if (clitellum) continue;
    k.add('b', torus(r * 0.72, r * 0.34), i % 2 ? pink : dark, [x, Math.sin(t * 7) * 0.12, Math.cos(t * 5) * 0.22], [0, Math.PI / 2, 0]);
  }
  // El clitelo es liso, más grueso y más claro: abarca varios segmentos sin marcarlos.
  const t0 = 7 / (N - 1);
  const t1 = 11 / (N - 1);
  const X = (t: number) => 4.3 - t * 8.6;
  const Y = (t: number) => Math.sin(t * 7) * 0.12;
  const Z = (t: number) => Math.cos(t * 5) * 0.22;
  k.tube('c', [[X(t0), Y(t0), Z(t0)], [X((t0 + t1) / 2), Y((t0 + t1) / 2), Z((t0 + t1) / 2)], [X(t1), Y(t1), Z(t1)]], 0.46, skin(0xd9a58e, 0.6));
  k.cone('a', 0.2, 0.32, [4.35, Y(0), Z(0)], [1, 0, 0], skin(0xc98a80, 0.5));
};

const legFrom = (k: Kit, region: string, base: V3, knee: V3, foot: V3, r: number, m: ReturnType<typeof mat>) => k.tube(region, [base, knee, foot], r, m);

const grasshopper: Build = (k) => {
  const g = skin(0x7c9a3f, 0.6);
  const gd = skin(0x5f7d2e, 0.6);
  k.ball('a', [0.62, 0.72, 0.56], [3.05, 0.1, 0], skin(0x8aa84a, 0.55));
  bilateral((s) => {
    k.ball('a', [0.28, 0.36, 0.1], [3.25, 0.32, s * 0.5], mat(0x3b2f19, 0.25));
    k.tube('d', [[3.45, 0.68, s * 0.2], [3.95, 1.5, s * 0.5], [4.8, 2.1, s * 0.9]], 0.05, gd);
  });
  k.loft('b', [{ x: 2.5, ry: 0.55, rz: 0.55 }, { x: 1.7, ry: 0.78, rz: 0.72 }, { x: 0.7, ry: 0.72, rz: 0.72 }], g);
  for (let i = 0; i < 8; i++) {
    const x0 = 0.7 - i * 0.48;
    k.loft('c', [{ x: x0, ry: 0.68 - i * 0.05, rz: 0.66 - i * 0.05 }, { x: x0 - 0.46, ry: 0.63 - i * 0.05, rz: 0.61 - i * 0.05 }], i % 2 ? g : gd);
  }
  bilateral((s) => {
    // Tegmina sobre el dorso.
    k.sheet('e', [[1.9, 0], [0, 0.42], [-3.1, 0.2], [-3.2, -0.1], [0, -0.3]], skin(0x93ad58, 0.5), [0, 0.75, s * 0.42], [Math.PI / 2 - s * 0.3, 0, 0]);
    legFrom(k, 'f', [2.2, -0.45, s * 0.45], [2.65, -1.05, s * 0.95], [2.3, -1.9, s * 1.2], 0.08, gd);
    legFrom(k, 'f', [1.2, -0.55, s * 0.5], [0.95, -1.15, s * 1.05], [0.7, -1.9, s * 1.3], 0.08, gd);
    // Pata saltadora: fémur grande y tibia con espinas.
    k.loft('f', [{ x: 0.6, y: -0.25, ry: 0.28, rz: 0.2 }, { x: -1.2, y: 0.85, ry: 0.28, rz: 0.2 }, { x: -2.5, y: 1.35, ry: 0.11, rz: 0.1 }].map((r) => ({ ...r })), g).position.z = s * 0.85;
    k.tube('f', [[-2.5, 1.35, s * 0.85], [-1.6, -0.2, s * 1], [-1.1, -1.9, s * 1.15]], 0.07, gd);
  });
};

const butterfly: Build = (k) => {
  const body = skin(0x2d241c, 0.8);
  k.ball('d', [0.3, 0.26, 0.26], [2.25, 0, 0], body);
  k.loft('e', [{ x: 2, ry: 0.28, rz: 0.28 }, { x: 1, ry: 0.42, rz: 0.4 }, { x: 0.4, ry: 0.35, rz: 0.34 }], skin(0x3d3026, 0.95));
  k.loft('f', [{ x: 0.4, ry: 0.28, rz: 0.26 }, { x: -1, ry: 0.27, rz: 0.26 }, { x: -2.7, ry: 0.05, rz: 0.05 }], skin(0x4a3a2c, 0.8));
  bilateral((s) => {
    const fore = mat(0xd9731f, 0.45);
    const hind = mat(0xc4611a, 0.45);
    k.sheet('b', [[1.1, 0], [1.2, 1.1], [0.6, 3.1], [-1.4, 4.8], [-2.4, 2.9], [-0.9, 0.2]], fore, [0, 0.12, s * 0.2], [s * Math.PI / 2 - s * 0.14, 0, 0]);
    k.sheet('b', [[-0.7, 0], [-1.2, 2.5], [-2.9, 3.3], [-4, 1.5], [-2.8, 0]], hind, [0.25, 0.1, s * 0.2], [s * Math.PI / 2 - s * 0.14, 0, 0]);
    for (const [x, z] of [[-1.1, 3.9], [-0.4, 2.9], [-2.9, 2.1]] as const) k.ball('b', [0.3, 0.05, 0.3], [x, 0.14 + Math.abs(z) * 0.14, s * (z + 0.2)], mat(0x1a120c, 0.5));
    k.tube('c', [[2.45, 0.2, s * 0.1], [3.3, 0.8, s * 0.42], [4.3, 1.15, s * 0.82]], 0.03, body);
    k.ball('c', [0.09, 0.09, 0.09], [4.32, 1.16, s * 0.84], body);
    legFrom(k, 'g', [1.5, -0.3, s * 0.2], [1.8, -0.75, s * 0.55], [1.5, -1.25, s * 0.75], 0.03, body);
    legFrom(k, 'g', [0.9, -0.3, s * 0.2], [0.8, -0.8, s * 0.6], [0.5, -1.25, s * 0.82], 0.03, body);
  });
  // Probóscide enrollada bajo la cabeza.
  const pts: V3[] = Array.from({ length: 14 }, (_, i) => {
    const a = i * 0.75;
    const r = 0.42 - i * 0.024;
    return [2.5 + Math.cos(a) * r, -0.54 + Math.sin(a) * r, 0] as V3;
  });
  k.tube('a', pts, 0.03, skin(0x8a6b3a, 0.6));
};

const arachLegs = (k: Kit, region: string, spread: number, reach: number, r: number, m: ReturnType<typeof mat>, x0 = 0.9) => {
  bilateral((s) => {
    for (let i = 0; i < 4; i++) {
      const a = 0.85 - i * 0.62;
      const dx = Math.sin(a) * reach;
      const dz = Math.cos(a) * reach;
      k.tube(region, [[x0 - i * 0.14, 0, s * 0.42], [x0 + dx * 0.42, spread, s * (0.42 + dz * 0.42)], [x0 + dx * 0.72, spread * 0.8, s * (0.42 + dz * 0.72)], [x0 + dx, -1, s * (0.42 + dz)]], r, m);
    }
  });
};

const spider: Build = (k) => {
  const c = skin(0x4c3a2b, 0.55);
  const a = skin(0x69503b, 0.5);
  k.ball('a', [0.92, 0.5, 0.72], [0.82, 0, 0], c);
  k.loft(null, [{ x: 0.1, ry: 0.15, rz: 0.15 }, { x: -0.2, ry: 0.13, rz: 0.13 }], c);
  k.ball('b', [1.5, 1.05, 1.15], [-1.5, 0.12, 0], a);
  for (const [x, z] of [[-0.8, 0.28], [-1.4, 0.42], [-2.05, 0.28]] as const) bilateral((s) => k.ball('b', [0.13, 0.04, 0.13], [x, 1.1 - Math.abs(x + 1.5) * 0.28, s * z], skin(0x3a2c1f)));
  arachLegs(k, 'e', 1.15, 3.4, 0.075, c);
  bilateral((s) => {
    k.tube('c', [[1.65, 0, s * 0.15], [1.92, -0.15, s * 0.16]], 0.12, skin(0x322419));
    k.cone('c', 0.06, 0.28, [1.92, -0.2, s * 0.16], [0.1, -1, -s * 0.2], mat(0x100b07, 0.3));
    k.tube('d', [[1.55, 0.05, s * 0.34], [2.15, 0.42, s * 0.6], [2.72, 0.14, s * 0.7]], 0.07, a);
    k.ball('d', [0.13, 0.1, 0.1], [2.76, 0.12, s * 0.71], c);
  });
};

const scorpion: Build = (k) => {
  const b = skin(0x8b6a34, 0.45);
  const d = skin(0x705325, 0.45);
  k.loft('a', [{ x: 2.6, ry: 0.16, rz: 0.48 }, { x: 1.6, ry: 0.28, rz: 0.72 }, { x: 0.95, ry: 0.28, rz: 0.78 }], b);
  for (let i = 0; i < 7; i++) {
    const x = 0.95 - i * 0.44;
    const r = 0.76 - i * 0.04;
    k.loft('b', [{ x, ry: 0.27, rz: r }, { x: x - 0.42, ry: 0.26, rz: r - 0.03 }], i % 2 ? b : d);
  }
  // Metasoma: la «cola» de cinco segmentos, arqueada sobre el cuerpo.
  const cx = -2.2;
  const pts: V3[] = [];
  for (let i = 0; i <= 5; i++) {
    const a = -0.1 + i * 0.5;
    pts.push([cx - Math.cos(a) * 1.5 + 0.3, 0.3 + Math.sin(a) * 1.8, 0]);
  }
  for (let i = 0; i < 5; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    k.ball('c', [Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.56, 0.22 - i * 0.01, 0.22 - i * 0.01], [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0], i % 2 ? b : d, [0, 0, Math.atan2(q[1] - p[1], q[0] - p[0])]);
  }
  const tip = pts[5];
  k.ball('e', [0.28, 0.2, 0.2], [tip[0] + 0.15, tip[1] + 0.05, 0], skin(0xa17f46, 0.4));
  k.cone('e', 0.08, 0.5, [tip[0] + 0.32, tip[1] - 0.02, 0], [1, -1.2, 0], mat(0x1a120a, 0.3));
  arachLegs(k, 'd', 0.55, 1.9, 0.06, d, 1.2);
  bilateral((s) => {
    k.tube('d', [[2.3, 0, s * 0.45], [2.95, 0.05, s * 1.1], [3.55, 0.05, s * 0.9]], 0.11, b);
    k.ball('d', [0.5, 0.15, 0.27], [4.0, 0.05, s * 0.8], b, [0, s * 0.2, 0]);
    k.cone('d', 0.1, 0.55, [4.35, 0.05, s * 0.88], [1, 0, s * 0.02], d);
    k.cone('d', 0.09, 0.45, [4.32, 0.05, s * 0.64], [1, 0, s * 0.28], d);
  });
};

const opilion: Build = (k) => {
  const b = skin(0x6d4e33, 0.55);
  // Cuerpo compacto de una pieza: sin la cintura de las arañas.
  k.ball('a', [0.92, 0.55, 0.72], [0, 0, 0], b);
  k.ball('c', [0.14, 0.15, 0.14], [0.4, 0.58, 0], skin(0x332418));
  bilateral((s) => k.ball('c', [0.05, 0.05, 0.05], [0.44, 0.67, s * 0.11], mat(0x050505, 0.2)));
  arachLegs(k, 'b', 1.6, 4.3, 0.035, skin(0x3a2a1c, 0.6), 0.2);
};

// ─────────────────────────── Vertebrados ───────────────────────────

const fin = (k: Kit, region: string, outline: Array<[number, number]>, m: ReturnType<typeof mat>, at: V3, rot: V3 = [0, 0, 0]) => k.sheet(region, outline, m, at, rot);

const boneFish: Build = (k) => {
  const b = skin(0x8fa4a8, 0.35);
  k.loft(null, [{ x: 4, ry: 0.2, rz: 0.1 }, { x: 3.2, ry: 0.72, rz: 0.4 }, { x: 1.8, ry: 1.2, rz: 0.56 }, { x: 0, ry: 1.3, rz: 0.6 }, { x: -2, ry: 0.85, rz: 0.4 }, { x: -3.6, ry: 0.26, rz: 0.13 }], b, 22);
  const fins = mat(0x6f8c9c, 0.5);
  fin(k, 'b', [[1.1, 0], [0.5, 0.9], [-1.5, 0.75], [-1.9, 0]], fins, [0, 1.15, -0.015]);
  fin(k, 'c', [[0.3, 0.05], [-1.35, 1.2], [-1, 0], [-1.35, -1.2], [0.3, -0.05]], fins, [-3.6, 0, -0.015]);
  bilateral((s) => {
    k.ball('a', [0.75, 0.82, 0.08], [2.42, -0.05, s * 0.5], skin(0x7a9096, 0.3), [0, s * 0.25, 0]);
    fin(k, 'd', [[0, 0], [-1.05, 0.28], [-1.1, -0.55], [-0.15, -0.3]], fins, [1.55, -0.45, s * 0.62], [s * 0.4, 0, 0]);
    k.tube('e', [[1.7, 0.25, s * 0.565], [0, 0.3, s * 0.62], [-1.7, 0.1, s * 0.44], [-3.3, 0, s * 0.16]], 0.025, skin(0x303d42));
    k.ball('g', [0.26, 0.26, 0.05], [3.0, 0.3, s * 0.42], mat(0xe9dc9a, 0.3));
    k.ball('g', [0.14, 0.14, 0.05], [3.02, 0.3, s * 0.45], mat(0x0a0a0a, 0.2));
  });
  fin(k, 'b', [[0, 0], [-0.8, -0.55], [-1.2, 0]], fins, [-1.2, -0.95, -0.015]);
  k.ball('f', [0.2, 0.12, 0.13], [3.95, -0.05, 0], mat(0x4a2c2c, 0.5));
};

const cartFish: Build = (k) => {
  const b = skin(0x6d7680, 0.75);
  k.loft(null, [{ x: 4.6, ry: 0.1, rz: 0.1 }, { x: 3.4, y: 0, ry: 0.45, rz: 0.45 }, { x: 1.8, ry: 0.72, rz: 0.72 }, { x: 0, ry: 0.78, rz: 0.72 }, { x: -2, ry: 0.45, rz: 0.4 }, { x: -3.3, ry: 0.2, rz: 0.16 }], b, 22);
  k.ball('f', [0.9, 0.3, 0.38], [4.05, 0.03, 0], skin(0x7b8590, 0.7));
  const fins = skin(0x59626c, 0.8);
  fin(k, 'b', [[0.9, 0], [0, 1.3], [-0.8, 0.9], [-0.8, 0]], fins, [0.5, 0.65, -0.015]);
  fin(k, 'b', [[0.4, 0], [-0.1, 0.5], [-0.5, 0]], fins, [-1.7, 0.35, -0.015]);
  // Cola heterocerca: el lóbulo superior, con la columna, mucho más largo.
  fin(k, 'c', [[0.3, 0.1], [-1.4, 1.9], [-1.0, 0.25], [-0.4, -0.15], [-0.65, -0.9], [0.3, -0.1]], fins, [-3.3, 0, -0.015]);
  bilateral((s) => {
    for (let i = 0; i < 5; i++) k.box('a', [0.055, 0.56, 0.05], [2.3 - i * 0.25, 0.02, s * (0.67 + i * 0.012)], mat(0x1a1d20, 0.8), [s * 0.06, 0, 0.05]);
    k.ball('e', [0.09, 0.08, 0.03], [2.85, 0.42, s * 0.5], mat(0x101214, 0.6));
    k.ball(null, [0.15, 0.13, 0.05], [3.3, 0.28, s * 0.38], mat(0x08090a, 0.2));
    fin(k, 'd', [[0.5, 0], [-1, -1.55], [-1.35, -1.1], [-0.6, 0]], fins, [1.1, -0.42, s * 0.55], [s * 0.85, 0, 0]);
  });
  k.box(null, [0.42, 0.04, 0.5], [3.7, -0.27, 0], mat(0x1a1d20, 0.8));
};

const frog: Build = (k) => {
  const b = skin(0x5f8f47, 0.45);
  const belly = skin(0x8fb36f, 0.5);
  k.loft('b', [{ x: 1.2, y: 0.25, ry: 0.72, rz: 0.72 }, { x: 0, y: 0.15, ry: 0.85, rz: 0.92 }, { x: -1.4, y: -0.1, ry: 0.72, rz: 0.82 }, { x: -2, y: -0.2, ry: 0.32, rz: 0.4 }], b);
  k.loft('a', [{ x: 1.15, y: 0.25, ry: 0.68, rz: 0.72 }, { x: 2.1, y: 0.28, ry: 0.42, rz: 0.72 }, { x: 2.8, y: 0.2, ry: 0.13, rz: 0.26 }], skin(0x689a4e, 0.45));
  k.ball(null, [0.55, 0.2, 0.55], [1.95, -0.15, 0], belly);
  bilateral((s) => {
    k.ball('a', [0.27, 0.27, 0.24], [1.95, 0.68, s * 0.5], skin(0x55803f, 0.4));
    k.ball('a', [0.17, 0.17, 0.08], [2, 0.72, s * 0.7], mat(0x14100a, 0.15));
    k.ball('e', [0.23, 0.23, 0.04], [1.25, 0.4, s * 0.72], skin(0x8a8a58, 0.4));
    k.tube('c', [[0.85, -0.3, s * 0.68], [1.2, -0.85, s * 1.1], [1.55, -1.15, s * 1.15]], 0.13, b);
    for (const a of [-0.5, 0, 0.5]) k.tube('c', [[1.55, -1.15, s * 1.15], [1.55 + Math.cos(a) * 0.45, -1.2, s * (1.15 + Math.sin(a) * 0.4)]], 0.04, belly);
    k.tube('d', [[-1.4, -0.2, s * 0.75], [-0.5, 0.25, s * 1.5], [-1.85, -0.55, s * 1.55], [-0.7, -1.15, s * 1.5]], 0.2, b, 0.45);
    for (const a of [-0.8, -0.3, 0.2, 0.7]) k.tube('d', [[-0.7, -1.15, s * 1.5], [-0.7 + Math.cos(a) * 1.05, -1.2, s * (1.5 + Math.sin(a) * 0.6)]], 0.045, belly);
  });
};

const lizard: Build = (k) => {
  const b = skin(0x7b7a3f, 0.7);
  k.loft('c', [{ x: 2, ry: 0.42, rz: 0.48 }, { x: 0.8, ry: 0.5, rz: 0.72 }, { x: -0.6, ry: 0.48, rz: 0.72 }, { x: -1.5, ry: 0.32, rz: 0.42 }], b);
  k.loft('a', [{ x: 2, ry: 0.36, rz: 0.42 }, { x: 2.8, ry: 0.28, rz: 0.4 }, { x: 3.6, y: -0.05, ry: 0.11, rz: 0.16 }], skin(0x88873f, 0.65));
  k.loft('d', [{ x: -1.5, ry: 0.32, rz: 0.42 }, { x: -3, y: -0.05, ry: 0.15, rz: 0.2 }, { x: -5, y: -0.1, ry: 0.03, rz: 0.04 }], b);
  // Escamas en el dorso: se notan al mirar por arriba.
  for (let i = 0; i < 12; i++) {
    for (let j = -2; j <= 2; j++) k.ball('b', [0.12, 0.05, 0.1], [1.8 - i * 0.3, 0.46 - Math.abs(j) * 0.06, j * 0.22], skin(i % 2 ? 0x5e5d2e : 0x6d6c35, 0.5));
  }
  bilateral((s) => {
    k.ball('a', [0.11, 0.11, 0.05], [2.85, 0.15, s * 0.36], mat(0x0c0a05, 0.15));
    k.tube('e', [[1.2, -0.25, s * 0.6], [1.5, -0.45, s * 1.2], [1.85, -0.7, s * 1.5]], 0.11, b);
    k.tube(null, [[-1.15, -0.2, s * 0.5], [-1.5, -0.35, s * 1.1], [-1.25, -0.7, s * 1.55]], 0.13, b);
    for (const a of [-0.5, 0, 0.5]) k.tube('e', [[1.85, -0.7, s * 1.5], [1.85 + Math.cos(a) * 0.4, -0.72, s * (1.5 + Math.sin(a) * 0.3)]], 0.03, b);
  });
};

const mammal: Build = (k) => {
  const fur = skin(0x8c6239, 0.95);
  const darker = skin(0x6e4b2b, 0.95);
  k.loft('e', [{ x: 2.1, y: 0.45, ry: 0.72, rz: 0.72 }, { x: 1, y: 0.42, ry: 0.92, rz: 0.82 }], fur);
  k.loft('d', [{ x: 1, y: 0.42, ry: 0.92, rz: 0.82 }, { x: -0.3, y: 0.3, ry: 0.92, rz: 0.82 }], fur);
  k.loft('e', [{ x: -0.3, y: 0.3, ry: 0.92, rz: 0.82 }, { x: -2, y: 0.38, ry: 0.88, rz: 0.72 }, { x: -2.6, y: 0.42, ry: 0.42, rz: 0.4 }], fur);
  k.loft(null, [{ x: 1.9, y: 0.65, ry: 0.5, rz: 0.48 }, { x: 2.6, y: 1.35, ry: 0.42, rz: 0.42 }], fur);
  k.loft('f', [{ x: 2.35, y: 1.42, ry: 0.56, rz: 0.48 }, { x: 3.35, y: 1.25, ry: 0.32, rz: 0.3 }, { x: 3.85, y: 1.12, ry: 0.15, rz: 0.17 }], skin(0x9c7044, 0.95));
  k.ball('f', [0.1, 0.08, 0.1], [3.92, 1.13, 0], mat(0x0c0806, 0.25));
  k.tube(null, [[-2.55, 0.65, 0], [-3.2, 0.5, 0.05], [-3.6, -0.2, 0]], 0.11, darker, 0.4);
  bilateral((s) => {
    k.ball('f', [0.1, 0.1, 0.05], [3, 1.48, s * 0.38], mat(0x0c0806, 0.15));
    k.cone('a', 0.24, 0.55, [2.35, 1.9, s * 0.3], [-0.2, 1, s * 0.3], darker);
    k.loft('b', [{ x: 1.25, y: -0.1, ry: 0.32, rz: 0.26 }, { x: 1.3, y: -1, ry: 0.15, rz: 0.15 }], fur).position.z = s * 0.55;
    k.tube('b', [[1.3, -1, s * 0.55], [1.3, -1.95, s * 0.55]], 0.11, darker);
    k.ball('b', [0.2, 0.1, 0.15], [1.42, -2, s * 0.55], darker);
    k.loft('c', [{ x: -1.95, y: 0, ry: 0.5, rz: 0.3 }, { x: -2.15, y: -0.95, ry: 0.18, rz: 0.15 }], fur).position.z = s * 0.5;
    k.tube('c', [[-2.15, -0.95, s * 0.5], [-1.95, -1.95, s * 0.5]], 0.11, darker);
    k.ball('c', [0.2, 0.1, 0.15], [-1.82, -2, s * 0.5], darker);
  });
};

// ─────────────────────────── Aves ───────────────────────────

type BeakDraw = (k: Kit, x: number, y: number) => void;
type FootDraw = (k: Kit, x: number, z: number, y: number) => void;

const yel = () => skin(0xd9a73a, 0.45);
const blk = () => skin(0x26221d, 0.4);

const BEAKS: Record<string, BeakDraw> = {
  // Corto y cónico: abre semillas.
  seed: (k, x, y) => k.loft('a', [{ x, y, ry: 0.28, rz: 0.26 }, { x: x + 0.6, y: y - 0.02, ry: 0.02, rz: 0.02 }], skin(0xa86b2a, 0.45)),
  // Ganchudo: desgarra.
  hook: (k, x, y) => {
    const pts: V3[] = [[x, y + 0.04, 0], [x + 0.42, y + 0.1, 0], [x + 0.7, y - 0.08, 0], [x + 0.68, y - 0.42, 0]];
    k.tube('a', pts, 0.13, blk(), 0.3);
    k.ball('a', [0.22, 0.15, 0.17], [x + 0.03, y + 0.04, 0], yel());
  },
  // Ancho y aplanado, con lamelas: filtra.
  filter: (k, x, y) => {
    k.loft('a', [{ x, y, ry: 0.17, rz: 0.26 }, { x: x + 0.65, y: y - 0.07, ry: 0.07, rz: 0.3 }, { x: x + 1.1, y: y - 0.08, ry: 0.04, rz: 0.24 }], skin(0xdf8f2a, 0.5));
    for (let i = 0; i < 6; i++) bilateral((s) => k.box('a', [0.03, 0.05, 0.015], [x + 0.25 + i * 0.13, y - 0.13, s * (0.26 - i * 0.006)], blk()));
  },
  // Largo y muy fino: alcanza el néctar.
  nectar: (k, x, y) => k.loft('a', [{ x, y, ry: 0.06, rz: 0.06 }, { x: x + 2.1, y: y + 0.1, ry: 0.012, rz: 0.012 }], blk(), 8),
  // Largo y curvo: sondea el barro.
  probe: (k, x, y) => k.tube('a', [[x, y, 0], [x + 0.9, y - 0.05, 0], [x + 1.6, y - 0.42, 0], [x + 2.05, y - 0.95, 0]], 0.06, skin(0x3a2f27, 0.45), 0.4),
  // Sin forma funcional marcada: no se evalúa (§3.6).
  plain: (k, x, y) => k.loft('a', [{ x, y, ry: 0.17, rz: 0.22 }, { x: x + 0.7, y: y - 0.05, ry: 0.05, rz: 0.1 }], skin(0x6e6253, 0.5)),
};

const toe = (k: Kit, x: number, z: number, y: number, a: number, len: number, r: number, m: ReturnType<typeof mat>) => k.tube('d', [[x, y, z], [x + Math.cos(a) * len, y, z + Math.sin(a) * len]], r, m);

const FEET: Record<string, FootDraw> = {
  // Tres dedos adelante y uno atrás, largo, para cerrar sobre la percha.
  perching: (k, x, z, y) => {
    const m = skin(0x4a3b2d, 0.6);
    for (const a of [-0.45, 0, 0.45]) toe(k, x, z, y, a, 0.5, 0.035, m);
    toe(k, x, z, y, Math.PI, 0.5, 0.04, m);
  },
  // Dedos delanteros unidos por membrana.
  webbed: (k, x, z, y) => {
    const m = skin(0xdf8f2a, 0.55);
    for (const a of [-0.55, 0, 0.55]) toe(k, x, z, y, a, 0.85, 0.035, m);
    k.sheet('d', [[0, 0], [0.72, 0.53], [0.85, 0], [0.72, -0.53]], m, [x, y, z], [Math.PI / 2, 0, 0]);
  },
  // Dedos fuertes con garras curvas.
  raptorial: (k, x, z, y) => {
    const m = yel();
    for (const a of [-0.55, 0, 0.55, Math.PI]) {
      toe(k, x, z, y, a, 0.6, 0.08, m);
      k.cone('d', 0.075, 0.42, [x + Math.cos(a) * 0.6, y, z + Math.sin(a) * 0.6], [Math.cos(a), -0.7, Math.sin(a)], blk());
    }
  },
  // Dedos muy largos y delgados que reparten el peso en lo blando.
  wading: (k, x, z, y) => {
    const m = skin(0x56624a, 0.6);
    for (const a of [-0.65, 0, 0.65]) toe(k, x, z, y, a, 1.15, 0.03, m);
    toe(k, x, z, y, Math.PI, 0.55, 0.03, m);
  },
  // Pocos dedos, cortos y gruesos, sin dedo trasero.
  cursorial: (k, x, z, y) => {
    const m = skin(0x847866, 0.75);
    for (const a of [-0.38, 0, 0.38]) toe(k, x, z, y, a, 0.8, 0.13, m);
  },
};

const bird = (o: { beak: string; foot: string; body: number; wing: number; breast: number; legLen: number; scale?: number; tailLong?: number; legR?: number }): Build => (k) => {
  const body = skin(o.body, 0.85);
  const wing = skin(o.wing, 0.85);
  const legs = o.foot === 'webbed' ? skin(0xdf8f2a, 0.55) : o.foot === 'raptorial' ? yel() : skin(0x4a3b2d, 0.6);
  const legY = -0.65;
  const shift = o.legLen * 0.45;
  k.root.position.y = shift;
  k.loft('f', [{ x: 1.25, y: 0.55, ry: 0.42, rz: 0.48 }, { x: 0.3, y: 0.35, ry: 0.78, rz: 0.72 }, { x: -1, y: 0.05, ry: 0.55, rz: 0.56 }, { x: -1.9, y: 0, ry: 0.17, rz: 0.26 }], body);
  k.ball('e', [0.75, 0.7, 0.62], [0.82, 0.18, 0], skin(o.breast, 0.9));
  k.ball(null, [0.56, 0.54, 0.5], [1.5, 0.92, 0], body);
  BEAKS[o.beak](k, 1.98, 0.88);
  const tl = o.tailLong ?? 1.6;
  k.sheet('c', [[0, 0.25], [-tl, 0.3], [-tl, -0.3], [0, -0.25]], skin(o.wing, 0.8), [-1.72, 0, 0], [Math.PI / 2, 0, 0]);
  bilateral((s) => {
    k.ball(null, [0.13, 0.13, 0.04], [1.72, 1.02, s * 0.41], mat(0x0a0a0a, 0.15));
    // Ala plegada: remeras escalonadas sobre el flanco.
    k.ball('b', [1.3, 0.48, 0.1], [-0.3, 0.32, s * 0.68], wing, [0, s * 0.08, -0.25]);
    for (let i = 0; i < 4; i++) k.ball('b', [0.72 + i * 0.05, 0.13, 0.045], [-1.15 - i * 0.14, 0.02 + i * 0.1, s * (0.6 - i * 0.02)], skin(i % 2 ? o.wing : o.body, 0.75), [0, 0, -0.22]);
    // Tarso: entre el cuerpo y el pie.
    k.tube(null, [[0.2, -0.3, s * 0.3], [0.05, legY - 0.1, s * 0.33]], (o.legR ?? 0.07) * 1.5, body);
    k.tube('d', [[0.05, legY - 0.1, s * 0.33], [0.22, legY - o.legLen, s * 0.33]], o.legR ?? 0.05, legs);
    FEET[o.foot](k, 0.22, s * 0.33, legY - o.legLen);
  });
};

// ─────────────────────────── Cráneos ───────────────────────────

interface SkullOpts {
  /** Largo del rostro, alturas y anchura. */
  rostrum: number;
  heightBack: number;
  heightSnout: number;
  width: number;
  /** Largos del diastema y de la serie de dientes de la mejilla. */
  diastema: number;
  orbitX: number;
  orbitY: number;
}

/** Teeth: columna de dientes por lado con su región; `x` medida hacia el rostro. */
function cheekRow(k: Kit, region: string, x0: number, n: number, step: number, yTop: number, h: number, z: number, m: ReturnType<typeof mat>, rot: 'up' | 'down') {
  for (let i = 0; i < n; i++) {
    const x = x0 - i * step;
    bilateral((s) => k.tooth(region, [step * 0.88, h, 0.3], [x, yTop + (rot === 'down' ? -h / 2 : h / 2), s * z], m));
  }
}

function skullBase(k: Kit, o: SkullOpts, regs: { maxilla?: string; premaxilla?: string; occipital?: string; orbit: string; foramen: string; zyg?: string; mandible: string }) {
  const bone = skin(BONE, 0.8);
  const boneB = skin(0xd9cdb1, 0.8);
  // Neurocráneo atrás, rostro alargado adelante.
  k.loft(null, [{ x: -2.7, y: 0.45, ry: o.heightBack * 0.55, rz: o.width * 0.72 }, { x: -1.9, y: 0.4, ry: o.heightBack, rz: o.width }, { x: -0.8, y: 0.4, ry: o.heightBack * 0.95, rz: o.width * 1.02 }], bone, 22);
  k.loft(regs.maxilla ?? null, [{ x: -0.8, y: 0.34, ry: o.heightBack * 0.88, rz: o.width }, { x: o.rostrum * 0.42, y: 0.2, ry: (o.heightBack + o.heightSnout) * 0.42, rz: o.width * 0.68 }, { x: o.rostrum * 0.82, y: 0.08, ry: o.heightSnout * 0.82, rz: o.width * 0.44 }], boneB, 20);
  k.loft(regs.premaxilla ?? null, [{ x: o.rostrum * 0.82, y: 0.08, ry: o.heightSnout * 0.8, rz: o.width * 0.44 }, { x: o.rostrum, y: -0.02, ry: o.heightSnout * 0.55, rz: o.width * 0.34 }, { x: o.rostrum + 0.3, y: -0.12, ry: 0.02, rz: o.width * 0.16 }], bone, 20);
  // Atrás: placa occipital y foramen magno, que solo se ven de espaldas.
  k.ball(regs.occipital ?? null, [0.1, o.heightBack * 0.75, o.width * 0.72], [-2.7, 0.45, 0], boneB);
  k.ball(regs.foramen, [0.04, 0.26, 0.3], [-2.82, 0.0, 0], mat(DARK, 0.95));
  bilateral((s) => {
    k.add(regs.orbit, torus(0.42, 0.09), skin(0xf0e8d2, 0.7), [o.orbitX, o.orbitY, s * o.width * 0.88], [0, 0, 0]);
    k.ball(regs.orbit, [0.38, 0.38, 0.08], [o.orbitX, o.orbitY, s * o.width * 0.84], mat(DARK, 0.95));
    k.ball(null, [0.2, 0.13, 0.03], [o.rostrum * 0.62, o.heightSnout + 0.25, s * o.width * 0.4], mat(0x57503f, 0.9));
    if (regs.zyg) k.tube(regs.zyg, [[o.orbitX + 0.35, o.orbitY - 0.5, s * o.width * 0.88], [o.orbitX - 0.5, o.orbitY - 0.6, s * o.width * 1.1], [-1.9, o.orbitY - 0.3, s * o.width * 0.86]], 0.1, skin(0xf0e8d2, 0.7));
  });
  // Mandíbula: placa con rama ascendente hasta la articulación y cuerpo que converge en la sínfisis.
  const len = o.rostrum * 0.96 + 1.7;
  const ramus: Array<[number, number]> = [[-0.1, 0.12], [0.32, 0.1], [0.5, -0.5], [1.15, -0.98], [len * 0.55, -1.02], [len - 0.1, -0.98], [len, -1.18], [len * 0.92, -1.42], [len * 0.5, -1.48], [0.5, -1.56], [-0.28, -1.3], [-0.3, -0.5]];
  const yaw = Math.atan((o.width * 0.8 - 0.2) / len);
  bilateral((s) => k.sheet(regs.mandible, ramus, skin(0xddd2b6, 0.75), [-1.7, 0, s * o.width * 0.8 - 0.05], [0, s * yaw, 0], 0.1));
  // Abertura nasal y paladar al que se anclan los dientes de arriba.
  k.ball(null, [0.05, o.heightSnout * 0.42, o.width * 0.22], [o.rostrum + 0.12, 0.02, 0], mat(DARK, 0.95));
  k.loft(null, [{ x: -0.9, y: -0.12, ry: 0.16, rz: o.width * 0.72 }, { x: o.rostrum * 0.5, y: -0.16, ry: 0.13, rz: o.width * 0.56 }, { x: o.rostrum * 0.98, y: -0.18, ry: 0.09, rz: o.width * 0.3 }], boneB, 16);
}

const skullHorse: Build = (k) => {
  const o: SkullOpts = { rostrum: 4.1, heightBack: 0.95, heightSnout: 0.32, width: 0.82, diastema: 1.3, orbitX: -1.05, orbitY: 0.95 };
  skullBase(k, o, { maxilla: 'j', premaxilla: 'k', occipital: 'i', orbit: 'f', foramen: 'h', zyg: 'g', mandible: 'l' });
  const t = skin(TOOTH, 0.45);
  // Serie larga de dientes hipsodontos con la mesa plana; premolares primero, molares atrás.
  cheekRow(k, 'd', 1.75, 3, 0.36, -0.22, 0.46, 0.42, t, 'down');
  cheekRow(k, 'e', 0.65, 3, 0.36, -0.22, 0.46, 0.46, t, 'down');
  cheekRow(k, 'd', 1.75, 3, 0.36, -1.08, 0.34, 0.38, t, 'up');
  cheekRow(k, 'e', 0.65, 3, 0.36, -1.08, 0.34, 0.42, t, 'up');
  // Incisivos arriba y abajo.
  for (const dz of [0.08, 0.22, 0.36]) {
    bilateral((s) => {
      k.tooth('a', [0.28, 0.32, 0.12], [o.rostrum + 0.12, -0.42, s * dz], t);
      k.tooth('a', [0.28, 0.32, 0.12], [o.rostrum * 0.96 + 0.14, -0.95, s * dz * 0.86], t);
    });
  }
  // Canino pequeño (machos) dentro de un diastema largo, sin dientes: lo señala el puente desnudo.
  bilateral((s) => {
    k.cone('b', 0.1, 0.25, [3.25, -0.2, s * 0.32], [0, -1, 0], t);
    k.box('c', [1.05, 0.04, 0.2], [2.5, -0.3, s * 0.38], mat(0xb9ad8f, 0.85));
  });
};

const skullCow: Build = (k) => {
  const o: SkullOpts = { rostrum: 3.4, heightBack: 1.1, heightSnout: 0.42, width: 1.02, diastema: 1.1, orbitX: -1.3, orbitY: 1.05 };
  skullBase(k, o, { maxilla: 'j', premaxilla: 'k', occipital: 'i', orbit: 'f', foramen: 'h', mandible: 'l' });
  const t = skin(TOOTH, 0.45);
  cheekRow(k, 'd', 1.1, 3, 0.3, -0.22, 0.46, 0.52, t, 'down');
  cheekRow(k, 'e', 0.2, 3, 0.34, -0.22, 0.46, 0.58, t, 'down');
  cheekRow(k, 'd', 1.1, 3, 0.3, -1.08, 0.34, 0.46, t, 'up');
  cheekRow(k, 'e', 0.2, 3, 0.34, -1.08, 0.34, 0.5, t, 'up');
  // Sin incisivos arriba: rodete dentario. Los cuatro pares de abajo (el canino va incorporado) en abanico.
  k.ball('a', [0.32, 0.07, 0.34], [o.rostrum + 0.1, -0.2, 0], skin(0xc5a58f, 0.85));
  for (const dz of [0.07, 0.2, 0.33, 0.46]) bilateral((s) => k.tooth('b', [0.3, 0.14, 0.11], [o.rostrum * 0.96 + 0.15, -1, s * dz * 0.86], t, [0, s * dz * 0.8, 0.45]));
  bilateral((s) => {
    k.box('c', [1.05, 0.04, 0.24], [1.95, -0.3, s * 0.45], mat(0xb9ad8f, 0.85));
    k.tube('g', [[-2.1, 1.45, s * 0.7], [-2.3, 2.1, s * 1.5], [-1.85, 3.05, s * 1.95]], 0.3, skin(0xcbbf9e, 0.7), 0.25);
  });
};

const skullDog: Build = (k) => {
  const o: SkullOpts = { rostrum: 2.5, heightBack: 1.05, heightSnout: 0.42, width: 0.95, diastema: 0, orbitX: -0.3, orbitY: 0.75 };
  skullBase(k, o, { orbit: 'e', foramen: 'h', zyg: 'f', mandible: 'i' });
  const t = skin(TOOTH, 0.4);
  // Cresta sagital: inserción del temporal.
  k.sheet('g', [[0.3, 0], [-0.8, 0.28], [-2.6, 0.25], [-2.8, 0]], skin(0xe0d5b8, 0.75), [0, 1.26, -0.015]);
  bilateral((s) => {
    k.cone('b', 0.13, 0.62, [2.05, -0.3, s * 0.38], [0.05, -1, 0], t);
    k.cone('b', 0.12, 0.55, [2.3, -1.05, s * 0.28], [-0.05, 1, 0], t);
    // Premolares cortantes y carnicera grande; molares detrás.
    for (const [x, h] of [[1.7, 0.2], [1.35, 0.26], [1, 0.3], [0.55, 0.52]] as const) k.cone('c', 0.17, h, [x, -0.32, s * 0.4], [0, -1, 0], t);
    for (const [x, h] of [[1.7, 0.2], [1.35, 0.22], [0.95, 0.27], [0.5, 0.35]] as const) k.cone('c', 0.16, h, [x, -1.03, s * 0.36], [0, 1, 0], t);
    for (const x of [0.1, -0.2]) {
      k.tooth('d', [0.24, 0.2, 0.3], [x, -0.42, s * 0.46], t);
      k.tooth('d', [0.24, 0.2, 0.28], [x, -1.0, s * 0.4], t);
    }
  });
  for (const dz of [0.06, 0.17, 0.27]) bilateral((s) => {
    k.tooth('a', [0.13, 0.22, 0.08], [2.8, -0.3, s * dz], t);
    k.tooth('a', [0.12, 0.2, 0.08], [2.42, -0.95, s * dz * 0.9], t);
  });
};

const skullPig: Build = (k) => {
  const o: SkullOpts = { rostrum: 3.0, heightBack: 1.35, heightSnout: 0.32, width: 0.88, diastema: 0.5, orbitX: -0.65, orbitY: 1.1 };
  skullBase(k, o, { orbit: 'e', foramen: 'g', zyg: 'f', mandible: 'h' });
  const t = skin(TOOTH, 0.4);
  bilateral((s) => {
    // Colmillo: canino que crece hacia afuera y arriba. Solo aquí tiene sentido llamarlo así (§3.9).
    k.tube('b', [[2.3, -1.05, s * 0.35], [2.5, -0.4, s * 0.68], [2.25, 0.3, s * 0.98]], 0.13, skin(0xf1e6c5, 0.35), 0.3);
    k.tube('b', [[2.45, -0.3, s * 0.36], [2.3, -0.42, s * 0.6], [1.95, -0.18, s * 0.78]], 0.1, skin(0xf1e6c5, 0.35), 0.35);
    for (const x of [1.65, 1.3, 0.97]) {
      k.tooth('c', [0.28, 0.24, 0.26], [x, -0.42, s * 0.45], t);
      k.tooth('c', [0.28, 0.24, 0.26], [x, -1.0, s * 0.4], t);
    }
    // Molares de cúspides redondas (bunodontos).
    for (const x of [0.6, 0.22, -0.2]) {
      k.tooth('d', [0.35, 0.22, 0.35], [x, -0.42, s * 0.5], t);
      for (const dx of [-0.08, 0.08]) k.ball('d', [0.08, 0.08, 0.08], [x + dx, -0.56, s * 0.5], t);
      k.tooth('d', [0.35, 0.22, 0.32], [x, -1.0, s * 0.44], t);
    }
  });
  for (const dz of [0.07, 0.19, 0.3]) bilateral((s) => {
    k.tooth('a', [0.2, 0.22, 0.09], [3.25, -0.32, s * dz], t);
    k.tooth('a', [0.28, 0.1, 0.09], [2.85, -1, s * dz * 0.9], t, [0, 0, 0.3]);
  });
};

function torus(r: number, tube: number) {
  return new TORUS(r, tube, 8, 22);
}


export const SPECIMEN_BUILDERS: Record<string, Build> = {
  planaria, fluke, nematode, cestode, earthworm, grasshopper, butterfly, spider, scorpion, opilion,
  boneFish, cartFish, frog, lizard, mammal,
  birdFinch: bird({ beak: 'seed', foot: 'perching', body: 0x8a6d44, wing: 0x5e4629, breast: 0xc9a06b, legLen: 0.7 }),
  birdRaptor: bird({ beak: 'hook', foot: 'raptorial', body: 0x5a4632, wing: 0x3a2d21, breast: 0xc9b89e, legLen: 0.8, legR: 0.1 }),
  birdDuck: bird({ beak: 'filter', foot: 'webbed', body: 0x706559, wing: 0x45413c, breast: 0x8a6448, legLen: 0.55, tailLong: 1.1, legR: 0.07 }),
  birdHummingbird: bird({ beak: 'nectar', foot: 'perching', body: 0x2f7a5d, wing: 0x3b3b3f, breast: 0xd8dcd0, legLen: 0.28, legR: 0.03 }),
  birdWader: bird({ beak: 'probe', foot: 'wading', body: 0x8c7d68, wing: 0x655a4a, breast: 0xdad0bd, legLen: 2.3, legR: 0.045 }),
  birdRunner: bird({ beak: 'plain', foot: 'cursorial', body: 0x6e675d, wing: 0x4c473f, breast: 0x9c9383, legLen: 2.1, tailLong: 0.6, legR: 0.16 }),
  skullHorse, skullCow, skullDog, skullPig,
};
