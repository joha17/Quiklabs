/**
 * Ilustraciones DIDÁCTICAS de B10 (no son microfotografías): cada región anotada del manifiesto se pinta con la textura de su tejido, en
 * milímetros reales y con patrón determinista por hash. Tinción clásica de hematoxilina y eosina: núcleos violetas y citoplasma rosado.
 * Lo `inferred` queda tenue y lo `unavailable` no se dibuja: los discos intercalares solo aparecen en el activo que los declara visibles.
 */
import { ANIMAL_ASSETS, type ObservationAssetManifest } from '../../../simulation/specimens/assets';
import { h, mapper, pathPoly, type ViewSpec } from './illustrations';

type Pen = (ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, inferred: boolean) => void;

const NUCLEUS = '#4b2a7b';

/** Fibras horizontales alineadas (mm): `branch` las ramifica como en el cardíaco. */
function fibers(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, o: { hMm: number; color: string; edge: string; branch: boolean }) {
  const m = mapper(a, v);
  const r = m.range(0.5, o.hMm);
  for (let j = r.j0; j <= r.j1; j++) {
    const [, y] = m.toPx(0, j * o.hMm);
    const hp = o.hMm * m.k * 0.86;
    ctx.fillStyle = o.color;
    ctx.fillRect(0, y - hp / 2, v.size, hp);
    ctx.fillStyle = o.edge;
    ctx.fillRect(0, y + hp / 2, v.size, Math.max(1, o.hMm * m.k * 0.14));
    if (!o.branch) continue;
    // Ramas oblicuas entre fibras vecinas.
    for (let i = r.i0; i <= r.i1; i++) {
      if (h(i, j, 41) < 0.45) continue;
      const [x, yy] = m.toPx((i + h(i, j, 42)) * 0.5, j * o.hMm);
      ctx.strokeStyle = o.color;
      ctx.lineWidth = hp * 0.72;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + hp * 1.6, yy + o.hMm * m.k);
      ctx.stroke();
    }
  }
}

/** Núcleos sobre las fibras: periféricos y múltiples (esquelético) o centrales y únicos (cardíaco, liso). */
function nuclei(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, o: { hMm: number; everyMm: number; offset: number; rx: number; ry: number; density: number }, faint: boolean) {
  const m = mapper(a, v);
  const r = m.range(o.everyMm, o.hMm);
  ctx.fillStyle = NUCLEUS;
  ctx.globalAlpha *= faint ? 0.35 : 1;
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      if (h(i, j, 7) > o.density) continue;
      const [x, y] = m.toPx((i + h(i, j, 8)) * o.everyMm, (j + o.offset * (h(i, j, 9) > 0.5 ? 1 : -1)) * o.hMm);
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(1.2, o.rx * m.k), Math.max(0.9, o.ry * m.k), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const skeletalPen: Pen = (ctx, a, v) => {
  const k = mapper(a, v).k;
  fibers(ctx, a, v, { hMm: 0.11, color: '#d9788f', edge: '#f4dde0', branch: false });
  // Estriaciones: bandas transversales a escala real; a bajo aumento no se resuelven y no se dibujan.
  const step = 0.012 * k;
  if (step >= 3) {
    ctx.strokeStyle = 'rgba(112,28,62,0.55)';
    ctx.lineWidth = Math.max(0.8, step * 0.3);
    for (let x = ((-v.centerMm[0] * k) % step); x < v.size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, v.size);
      ctx.stroke();
    }
  }
  nuclei(ctx, a, v, { hMm: 0.11, everyMm: 0.09, offset: 0.4, rx: 0.016, ry: 0.006, density: 0.8 }, false);
};

const cardiacPen = (discs: boolean): Pen => (ctx, a, v) => {
  const m = mapper(a, v);
  fibers(ctx, a, v, { hMm: 0.1, color: '#c9607d', edge: '#f1d6da', branch: true });
  const step = 0.012 * m.k;
  if (step >= 3) {
    ctx.strokeStyle = 'rgba(100,24,54,0.33)';
    ctx.lineWidth = Math.max(0.6, step * 0.22);
    for (let x = ((-v.centerMm[0] * m.k) % step); x < v.size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, v.size);
      ctx.stroke();
    }
  }
  nuclei(ctx, a, v, { hMm: 0.1, everyMm: 0.14, offset: 0, rx: 0.013, ry: 0.008, density: 0.6 }, false);
  // Discos: líneas oscuras escalonadas que cruzan la fibra, solo si el activo los resuelve.
  if (!discs || m.k * 0.1 < 24) return;
  const r = m.range(0.17, 0.1);
  ctx.strokeStyle = '#3d0d29';
  ctx.lineWidth = Math.max(1.4, m.k * 0.005);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const [x, y] = m.toPx((i + h(i, j, 77) * 0.6) * 0.17, (j - 0.43) * 0.1);
      const d = 0.1 * m.k * 0.86;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + d * 0.33);
      ctx.lineTo(x + d * 0.14, y + d * 0.33);
      ctx.lineTo(x + d * 0.14, y + d * 0.66);
      ctx.lineTo(x, y + d * 0.66);
      ctx.lineTo(x, y + d);
      ctx.stroke();
    }
  }
};

const smoothPen: Pen = (ctx, a, v) => {
  const m = mapper(a, v);
  ctx.fillStyle = '#e2a3ae';
  ctx.fillRect(0, 0, v.size, v.size);
  // Fibras fusiformes sin estriaciones.
  const r = m.range(0.16, 0.035);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const off = j % 2 ? 0.5 : 0;
      const [x, y] = m.toPx((i + off) * 0.16, j * 0.035);
      ctx.fillStyle = '#d4818f';
      ctx.beginPath();
      ctx.ellipse(x, y, 0.09 * m.k, 0.015 * m.k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(130,40,70,.5)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      if (h(i, j, 5) > 0.55) {
        ctx.fillStyle = NUCLEUS;
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(1.5, 0.02 * m.k), Math.max(0.8, 0.005 * m.k), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

/** Fondo con un patrón de células redondeadas, para las regiones epiteliales y parenquimatosas. */
function cells(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, o: { mm: number; fill: string; wall: string; nucleus?: string; squash?: number }) {
  const m = mapper(a, v);
  const px = o.mm * m.k;
  ctx.fillStyle = o.fill;
  ctx.fillRect(0, 0, v.size, v.size);
  if (px < 3) return;
  const sq = o.squash ?? 1;
  const r = m.range(o.mm, o.mm * sq);
  for (let i = r.i0; i <= r.i1; i++) {
    for (let j = r.j0; j <= r.j1; j++) {
      const [x, y] = m.toPx((i + (j % 2 ? 0.5 : 0) + (h(i, j, 3) - 0.5) * 0.2) * o.mm, (j + (h(i, j, 4) - 0.5) * 0.2) * o.mm * sq);
      ctx.strokeStyle = o.wall;
      ctx.lineWidth = Math.max(0.6, px * 0.06);
      ctx.beginPath();
      ctx.ellipse(x, y, px * 0.48, px * 0.48 * sq, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (o.nucleus && px > 7) {
        ctx.fillStyle = o.nucleus;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, px * 0.15), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Haces ondulados de colágeno con fibroblastos. */
function collagen(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec) {
  const m = mapper(a, v);
  ctx.fillStyle = '#f5e4e2';
  ctx.fillRect(0, 0, v.size, v.size);
  const r = m.range(0.5, 0.05);
  ctx.strokeStyle = '#d98ca0';
  ctx.lineWidth = Math.max(0.8, 0.012 * m.k);
  for (let j = r.j0; j <= r.j1; j++) {
    ctx.beginPath();
    for (let x = 0; x <= v.size; x += 8) {
      const mm = (x - v.size / 2) / m.k + v.centerMm[0];
      const [, y] = m.toPx(0, j * 0.05 + Math.sin(mm * 14 + j) * 0.02 + Math.sin(mm * 5 + j * 2) * 0.012);
      if (x) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  nuclei(ctx, a, v, { hMm: 0.13, everyMm: 0.2, offset: 0.2, rx: 0.018, ry: 0.006, density: 0.65 }, false);
}

const REGION: Record<string, { fill: string; wall: string; mm: number; nucleus?: string; squash?: number }> = {
  stratifiedEpithelium: { fill: '#eaa7b8', wall: '#a44b6c', mm: 0.05, nucleus: NUCLEUS, squash: 0.62 },
  basalLamina: { fill: '#7c2850', wall: '#7c2850', mm: 0.5 },
  collagenFibers: { fill: '#f3d9dc', wall: '#d48ba0', mm: 0.07 },
  neuronBody: { fill: '#8a5fa8', wall: '#513266', mm: 0.5 },
  spicule: { fill: '#f1ece0', wall: '#cdbda1', mm: 0.12 },
  choanocyte: { fill: '#c49bc0', wall: '#6c3f6a', mm: 0.018, nucleus: NUCLEUS },
  osculum: { fill: '#f6f3e8', wall: '#f6f3e8', mm: 0.5 },
  polyp: { fill: '#e7a2b2', wall: '#9e3f60', mm: 0.06, nucleus: NUCLEUS },
  tentacle: { fill: '#c9648a', wall: '#7b2a51', mm: 0.03 },
  mesoglea: { fill: '#f8e3ea', wall: '#f8e3ea', mm: 0.5 },
  animalEpidermis: { fill: '#b35a85', wall: '#6d2750', mm: 0.03, nucleus: NUCLEUS },
  gastrodermis: { fill: '#c0709a', wall: '#6d2750', mm: 0.04, nucleus: NUCLEUS },
  manubrium: { fill: '#c0709a', wall: '#6d2750', mm: 0.05 },
  cnidocyte: { fill: '#c9648a', wall: '#3d0d29', mm: 0.012 },
  auricleS: { fill: '#b98a6e', wall: '#6e4b37', mm: 0.3 },
  ocellusS: { fill: '#17120c', wall: '#17120c', mm: 0.5 },
  pharynxS: { fill: '#8c4a3f', wall: '#4d2a22', mm: 0.15 },
  gutBranch: { fill: '#a87552', wall: '#6d4a33', mm: 0.14 },
  oralSuckerS: { fill: '#874c3a', wall: '#3c2118', mm: 0.1 },
  ventralSuckerS: { fill: '#874c3a', wall: '#3c2118', mm: 0.1 },
  nematodeCuticle: { fill: '#f0a9bd', wall: '#b85a7d', mm: 0.5 },
  nematodeGut: { fill: '#d87d9c', wall: '#7c2850', mm: 0.03, nucleus: NUCLEUS },
  wormMuscle: { fill: '#cb6d8c', wall: '#7f2d52', mm: 0.03 },
  wormEpidermis: { fill: '#b35a85', wall: '#6d2750', mm: 0.03, nucleus: NUCLEUS },
  wormGut: { fill: '#dd9bb0', wall: '#8e3e60', mm: 0.05, nucleus: NUCLEUS },
  typhlosole: { fill: '#c97c9a', wall: '#7c2850', mm: 0.05 },
  setae: { fill: '#3a2616', wall: '#3a2616', mm: 0.5 },
  scolexS: { fill: '#c49a70', wall: '#7a5a3b', mm: 0.1 },
  hooks: { fill: '#3a2616', wall: '#3a2616', mm: 0.5 },
  proglottidS: { fill: '#dcbd8f', wall: '#7a5a3b', mm: 0.25 },
  carapace: { fill: '#e8d7a5', wall: '#9d8450', mm: 0.5 },
  compoundEye: { fill: '#20150d', wall: '#20150d', mm: 0.5 },
  antenna: { fill: '#b89b63', wall: '#6d5a36', mm: 0.5 },
  broodPouch: { fill: '#b5894f', wall: '#6d5a36', mm: 0.06 },
  bodyAppendage: { fill: '#a98a58', wall: '#6d5a36', mm: 0.5 },
  head: { fill: '#b39566', wall: '#6d5a36', mm: 0.5 },
  thorax: { fill: '#a68855', wall: '#5d4c2b', mm: 0.5 },
  abdomen: { fill: '#c2a776', wall: '#5d4c2b', mm: 0.5 },
  leg: { fill: '#94784a', wall: '#5d4c2b', mm: 0.5 },
  strobila: { fill: '#d78fa7', wall: '#8e3e60', mm: 0.1 },
  ephyra: { fill: '#e5a9bb', wall: '#8e3e60', mm: 0.08 },
  nit: { fill: '#e6d39b', wall: '#8d7a45', mm: 0.5 },
  nymph: { fill: '#b89b63', wall: '#6d5a36', mm: 0.5 },
};

/** Lo que el organismo no ocupa queda claro: es la luz del portaobjetos, no tejido. */
/** Contorno orgánico: redondea esquinas y ondula un poco los bordes rectos para que un tejido no parezca una caja. Las bandas se trazan tal cual. */
function softPoly(ctx: CanvasRenderingContext2D, pts: number[][], m: ReturnType<typeof mapper>) {
  if (pts.length > 32) return pathPoly(ctx, pts, m);
  let cur: Array<[number, number]> = [];
  pts.forEach(([u, w], i) => {
    const [nu, nw] = pts[(i + 1) % pts.length];
    const len = Math.hypot(nu - u, nw - w);
    const n = Math.max(1, Math.round(len / 0.05));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const wob = len > 0.1 ? (h(i, k, 71) - 0.5) * 0.012 : 0;
      cur.push(m.toPx(...m.nToMm(u + (nu - u) * t + wob, w + (nw - w) * t - wob)));
    }
  });
  for (let p = 0; p < 2; p++) {
    const next: Array<[number, number]> = [];
    cur.forEach(([x, y], i) => {
      const [nx, ny] = cur[(i + 1) % cur.length];
      next.push([x * 0.75 + nx * 0.25, y * 0.75 + ny * 0.25], [x * 0.25 + nx * 0.75, y * 0.25 + ny * 0.75]);
    });
    cur = next;
  }
  ctx.beginPath();
  cur.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function regions(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec) {
  const m = mapper(a, v);
  ctx.fillStyle = '#f4f1e7';
  ctx.fillRect(0, 0, v.size, v.size);
  a.annotations.forEach((an) => {
    if (an.evidence === 'unavailable') return;
    const look = REGION[an.structureId];
    if (!look) return;
    ctx.save();
    ctx.globalAlpha = an.evidence === 'inferred' ? 0.35 : 1;
    softPoly(ctx, an.polygonNormalized, m);
    ctx.clip('evenodd');
    cells(ctx, a, v, { mm: look.mm, fill: look.fill, wall: look.wall, nucleus: look.nucleus, squash: look.squash });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = an.evidence === 'inferred' ? 0.25 : 0.9;
    softPoly(ctx, an.polygonNormalized, m);
    ctx.strokeStyle = look.wall;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  });
}

const connectivePen: Pen = (ctx, a, v) => collagen(ctx, a, v);
const nervousPen: Pen = (ctx, a, v) => {
  const m = mapper(a, v);
  ctx.fillStyle = '#e9e2ee';
  ctx.fillRect(0, 0, v.size, v.size);
  // Prolongaciones finas y núcleos de glía; los somas los pinta el manifiesto.
  ctx.strokeStyle = '#7a5393';
  ctx.lineWidth = Math.max(0.7, m.k * 0.01);
  for (const [cu, cw] of [[0.36, 0.42], [0.68, 0.6]] as const) {
    for (let i = 0; i < 7; i++) {
      const [x0, y0] = m.toPx(...m.nToMm(cu, cw));
      const an = i * 0.9 + cu * 7;
      const [x1, y1] = m.toPx(...m.nToMm(cu + Math.cos(an) * 0.42, cw + Math.sin(an) * 0.42));
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + Math.sin(an * 3) * 26, (y0 + y1) / 2 - Math.cos(an * 3) * 26, x1, y1);
      ctx.stroke();
    }
  }
  nuclei(ctx, a, v, { hMm: 0.14, everyMm: 0.18, offset: 0.3, rx: 0.009, ry: 0.009, density: 0.5 }, false);
  regions2(ctx, a, v, ['neuronBody']);
  // Núcleo de la neurona: se distingue a 40X.
  for (const [cu, cw] of [[0.36, 0.42]] as const) {
    const [x, y] = m.toPx(...m.nToMm(cu, cw));
    ctx.fillStyle = '#f0e9f5';
    ctx.beginPath();
    ctx.arc(x, y, 0.07 * m.k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NUCLEUS;
    ctx.beginPath();
    ctx.arc(x, y, 0.02 * m.k, 0, Math.PI * 2);
    ctx.fill();
  }
};

function regions2(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, only: string[]) {
  const m = mapper(a, v);
  for (const an of a.annotations.filter((x) => only.includes(x.structureId))) {
    const look = REGION[an.structureId];
    pathPoly(ctx, an.polygonNormalized, m);
    ctx.fillStyle = look.fill;
    ctx.fill();
  }
}

/** Montajes totales: el organismo entero teñido y aclarado, no un parche de células. Sus partes caen sobre los polígonos anotados del manifiesto. */
type Draw = {
  poly(pts: Array<[number, number]>, fill: string, stroke?: string, lw?: number): void;
  oval(u: number, w: number, ru: number, rw: number, fill: string, stroke?: string, rot?: number): void;
  line(pts: Array<[number, number]>, color: string, lw: number): void;
};

function drawer(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec): Draw {
  const m = mapper(a, v);
  const scale = m.k * a.extentMm[0];
  const P = (u: number, w: number) => m.toPx(...m.nToMm(u, w));
  return {
    poly(pts, fill, stroke, lw = 0.004) {
      softPoly(ctx, pts, m);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(1, lw * scale);
        ctx.stroke();
      }
    },
    oval(u, w, ru, rw, fill, stroke, rot = 0) {
      const [x, y] = P(u, w);
      ctx.beginPath();
      ctx.ellipse(x, y, ru * scale, rw * scale, rot, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(1, 0.004 * scale);
        ctx.stroke();
      }
    },
    line(pts, color, lw) {
      ctx.beginPath();
      pts.forEach(([u, w], i) => {
        const [x, y] = P(u, w);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, lw * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
  };
}

const mirror = (half: Array<[number, number]>): Array<[number, number]> => [...half, ...[...half].reverse().map(([u, w]): [number, number] => [1 - u, w])];
const wholeMount = (paint: (d: Draw) => void): Pen => (ctx, a, v) => {
  ctx.fillStyle = '#f4f1e7';
  ctx.fillRect(0, 0, v.size, v.size);
  paint(drawer(ctx, a, v));
};
/** Intestino ramificado: tronco con divertículos laterales a ambos lados. */
function gutTree(d: Draw, u: number, w0: number, w1: number, reach: number, n: number, color: string, side: 0 | 1 | -1 = 0) {
  d.line([[u, w0], [u, w1]], color, 0.016);
  for (let i = 0; i < n; i++) {
    const w = w0 + ((i + 0.5) / n) * (w1 - w0);
    const r = reach * (0.75 + 0.25 * h(i, 3, 73));
    for (const s of side === 0 ? [1, -1] : [side]) {
      d.line([[u, w], [u + s * r * 0.55, w + 0.008], [u + s * r, w - 0.012]], color, 0.009);
      d.line([[u + s * r * 0.55, w + 0.008], [u + s * r * 0.85, w + 0.03]], color, 0.006);
    }
  }
}

const planariaPen = wholeMount((d) => {
  d.poly(mirror([[0.47, 0.09], [0.34, 0.11], [0.3, 0.15], [0.38, 0.22], [0.33, 0.45], [0.33, 0.7], [0.42, 0.88], [0.49, 0.93]]), '#d9b48e', '#9c7650');
  gutTree(d, 0.5, 0.21, 0.5, 0.15, 7, '#7d5634');
  gutTree(d, 0.43, 0.5, 0.86, 0.08, 7, '#7d5634', -1);
  gutTree(d, 0.57, 0.5, 0.86, 0.08, 7, '#7d5634', 1);
  d.oval(0.5, 0.61, 0.038, 0.1, '#a97a55', '#6f4c2e');
  d.oval(0.5, 0.72, 0.012, 0.012, '#6f4c2e');
  for (const u of [0.45, 0.55]) {
    d.oval(u, 0.17, 0.018, 0.018, '#f7f2e3', '#7d5634');
    d.oval(u, 0.17, 0.009, 0.009, '#20140c');
  }
});

const flukePen = wholeMount((d) => {
  d.poly(mirror([[0.47, 0.08], [0.42, 0.14], [0.31, 0.3], [0.28, 0.5], [0.34, 0.74], [0.45, 0.9], [0.49, 0.94]]), '#c99a78', '#8a5f42');
  gutTree(d, 0.41, 0.3, 0.86, 0.075, 12, '#6e4228', -1);
  gutTree(d, 0.59, 0.3, 0.86, 0.075, 12, '#6e4228', 1);
  d.line([[0.5, 0.17], [0.5, 0.23], [0.41, 0.3]], '#6e4228', 0.012);
  d.line([[0.5, 0.23], [0.59, 0.3]], '#6e4228', 0.012);
  d.oval(0.5, 0.14, 0.03, 0.03, '#a97a55', '#5f3a22');
  d.oval(0.5, 0.14, 0.012, 0.012, '#f0dfc8');
  d.oval(0.5, 0.26, 0.05, 0.05, '#a97a55', '#5f3a22');
  d.oval(0.5, 0.26, 0.022, 0.022, '#f0dfc8');
});

const cestodePen = wholeMount((d) => {
  // Cuello y cadena de proglótides, cada una más ancha y con su poro genital.
  d.poly(mirror([[0.47, 0.17], [0.48, 0.3]]), '#e8d6b2', '#a78c5e');
  const n = 9;
  for (let i = 0; i < n; i++) {
    const w0 = 0.3 + (i / n) * 0.62;
    const w1 = 0.3 + ((i + 1) / n) * 0.62;
    const half = 0.07 + (i / (n - 1)) * 0.07;
    d.poly([[0.5 - half * 0.86, w0], [0.5 + half * 0.86, w0], [0.5 + half, w1 - 0.004], [0.5 - half, w1 - 0.004]], '#ead9b6', '#a78c5e');
    d.oval(0.5, (w0 + w1) / 2, half * 0.42, (w1 - w0) * 0.26, '#b89663');
    d.oval(i % 2 ? 0.5 + half * 0.8 : 0.5 - half * 0.8, (w0 + w1) / 2, 0.007, 0.007, '#6e5230');
  }
  d.oval(0.5, 0.12, 0.07, 0.07, '#dcc8a0', '#a78c5e');
  for (const [u, w] of [[0.46, 0.13], [0.54, 0.13], [0.45, 0.09], [0.55, 0.09]] as const) d.oval(u, w, 0.019, 0.019, '#9c7a4a', '#6e5230');
  for (let i = 0; i < 12; i++) {
    const t = (i / 11) * Math.PI;
    const [u, w] = [0.5 + Math.cos(t) * 0.026, 0.07 - Math.sin(t) * 0.024];
    d.line([[u, w], [u + Math.cos(t) * 0.012, w - Math.sin(t) * 0.012]], '#4a3820', 0.004);
  }
});

const daphniaPen = wholeMount((d) => {
  // Vista lateral: caparazón transparente con espina caudal, ojo compuesto, antena bífida, bolsa incubadora y patas.
  d.line([[0.42, 0.25], [0.3, 0.26], [0.2, 0.22]], '#8a7a55', 0.014);
  d.line([[0.3, 0.26], [0.22, 0.29]], '#8a7a55', 0.012);
  d.line([[0.2, 0.22], [0.14, 0.2]], '#8a7a55', 0.005);
  d.line([[0.22, 0.29], [0.16, 0.31]], '#8a7a55', 0.005);
  d.poly([[0.5, 0.2], [0.68, 0.32], [0.78, 0.52], [0.72, 0.74], [0.56, 0.84], [0.42, 0.78], [0.28, 0.62], [0.26, 0.42], [0.36, 0.26]], '#ebe3c4', '#8f7f58', 0.006);
  d.line([[0.56, 0.84], [0.6, 0.93]], '#8f7f58', 0.008);
  d.line([[0.46, 0.3], [0.5, 0.55], [0.47, 0.76]], '#9a7b3d', 0.02);
  d.oval(0.5, 0.2, 0.05, 0.05, '#2a2622', '#111');
  d.oval(0.5, 0.42, 0.11, 0.11, '#e6d59c', '#8f7f58');
  for (const [u, w] of [[0.46, 0.39], [0.53, 0.38], [0.5, 0.44], [0.45, 0.46], [0.55, 0.46]] as const) d.oval(u, w, 0.02, 0.02, '#a8894c', '#6e5a2f');
  for (let i = 0; i < 5; i++) d.line([[0.44, 0.57 + i * 0.035], [0.54, 0.585 + i * 0.035], [0.57, 0.6 + i * 0.035]], '#8a7a55', 0.008);
});

const lousePen = wholeMount((d) => {
  // Vista dorsal: cabeza, tórax compacto con tres pares de patas y abdomen segmentado.
  for (const s of [1, -1]) {
    const U = (x: number) => 0.5 + s * x;
    d.line([[U(0.06), 0.16], [U(0.11), 0.15], [U(0.14), 0.19]], '#6e5230', 0.012);
    for (const [w, r] of [[0.31, 0.27], [0.36, 0.29], [0.41, 0.28]] as const) {
      d.line([[U(0.08), w], [U(r * 0.65), w - 0.03], [U(r), w + 0.04]], '#7a5c36', 0.016);
      d.oval(U(r), w + 0.045, 0.014, 0.012, '#4a3820');
    }
  }
  d.poly(mirror([[0.42, 0.14], [0.42, 0.25], [0.46, 0.28]]), '#c39f6e', '#6e5230');
  d.poly(mirror([[0.4, 0.28], [0.39, 0.42], [0.42, 0.45]]), '#b98f5d', '#6e5230');
  d.oval(0.5, 0.64, 0.18, 0.18, '#d3b483', '#6e5230');
  for (let i = 0; i < 6; i++) {
    const w = 0.5 + i * 0.05;
    const half = Math.sqrt(Math.max(0, 0.18 ** 2 - (w - 0.64) ** 2));
    d.line([[0.5 - half, w], [0.5 + half, w]], '#7a5c36', 0.004);
  }
  d.oval(0.44, 0.19, 0.012, 0.012, '#20140c');
  d.oval(0.56, 0.19, 0.012, 0.012, '#20140c');
});

const SPECIAL: Record<string, Pen> = {
  planariaWM: planariaPen,
  flukeWM: flukePen,
  cestodeWM: cestodePen,
  daphniaWM: daphniaPen,
  louseWM: lousePen,
  muscleSkeletal: skeletalPen,
  muscleFresh: (ctx, a, v) => {
    ctx.fillStyle = '#f3efe4';
    ctx.fillRect(0, 0, v.size, v.size);
    const m = mapper(a, v);
    const [, y0] = m.toPx(...m.nToMm(0, 0.25));
    const [, y1] = m.toPx(...m.nToMm(0, 0.75));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, v.size, y1 - y0);
    ctx.clip();
    fibers(ctx, a, v, { hMm: 0.14, color: '#d8a9a0', edge: '#f4e8df', branch: false });
    ctx.restore();
  },
  muscleCardiac: cardiacPen(false),
  muscleCardiacDiscs: cardiacPen(true),
  muscleSmooth: smoothPen,
  connective: connectivePen,
  nervous: nervousPen,
};

export function drawAnimalAsset(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, base: string): boolean {
  const key = ANIMAL_ASSETS[a.assetId] ? a.assetId : base;
  if (!ANIMAL_ASSETS[key]) return false;
  const pen = SPECIAL[key];
  if (pen) pen(ctx, a, v, false);
  else regions(ctx, a, v);
  return true;
}
