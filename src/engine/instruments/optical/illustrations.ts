/**
 * Ilustraciones DIDÁCTICAS de los activos estándar (no son microfotografías, §4.3): se dibujan en canvas 2D a partir
 * de la geometría del manifiesto (contornos y regiones anotadas), en milímetros reales de la muestra. Solo se dibuja
 * lo que cae en el campo; el detalle que el manifiesto no declara observable a un aumento se dibuja pero no cuenta como
 * evidencia (la evidencia es del dominio). Deterministas: el patrón celular sale de un hash, no de Math.random.
 * Para fotografías reales se reemplaza `drawAsset` por la textura publicada (misma interfaz de vista).
 */
import { assetById, baseAssetId, type ObservationAssetManifest } from '../../../simulation/specimens/assets';
import { drawCellAsset } from './illustrationsCell';

export interface ViewSpec {
  assetId: string;
  /** Centro del campo en mm desde el centro de la imagen del activo, y diámetro del campo (mm). */
  centerMm: [number, number];
  fovMm: number;
  /** Lado del lienzo (px). */
  size: number;
}

export const h = (i: number, j: number, k = 0) => {
  let x = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export function poly(a: ObservationAssetManifest, structure: string): number[][] {
  return a.annotations.find((x) => x.structureId === structure)?.polygonNormalized ?? [];
}

export function inside(x: number, y: number, p: number[][]): boolean {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1] + 1e-12) + p[i][0]) r = !r;
  }
  return r;
}

/** Transformación mm (de la imagen) → px del lienzo. */
export function mapper(a: ObservationAssetManifest, v: ViewSpec) {
  const k = v.size / v.fovMm;
  const toPx = (xmm: number, ymm: number): [number, number] => [v.size / 2 + (xmm - v.centerMm[0]) * k, v.size / 2 + (ymm - v.centerMm[1]) * k];
  const nToMm = (u: number, w: number): [number, number] => [(u - 0.5) * a.extentMm[0], (w - 0.5) * a.extentMm[1]];
  const mmToN = (x: number, y: number): [number, number] => [x / a.extentMm[0] + 0.5, y / a.extentMm[1] + 0.5];
  const range = (cellW: number, cellH: number) => ({
    i0: Math.floor((v.centerMm[0] - v.fovMm / 2) / cellW) - 1, i1: Math.ceil((v.centerMm[0] + v.fovMm / 2) / cellW) + 1,
    j0: Math.floor((v.centerMm[1] - v.fovMm / 2) / cellH) - 1, j1: Math.ceil((v.centerMm[1] + v.fovMm / 2) / cellH) + 1,
  });
  return { k, toPx, nToMm, mmToN, range };
}

export function pathPoly(ctx: CanvasRenderingContext2D, pts: number[][], m: ReturnType<typeof mapper>) {
  ctx.beginPath();
  pts.forEach(([u, w], i) => {
    const [x, y] = m.toPx(...m.nToMm(u, w));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
}

function drawElodea(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec) {
  const m = mapper(a, v);
  // Protoplasto relativo a la pared (B03): 1 turgente, menor en plasmólisis.
  const shrink = a.assetId === 'elodeaPlasmo' ? 0.55 : a.assetId === 'elodeaPlasmoMild' ? 0.82 : 1;
  const leaf = poly(a, 'leafBlade');
  ctx.save();
  pathPoly(ctx, leaf, m);
  ctx.fillStyle = '#b8d99a';
  ctx.fill();
  ctx.clip();
  const cw = 0.045;
  const ch = 0.13;
  const r = m.range(cw, ch);
  const wallPx = cw * m.k;
  if ((r.i1 - r.i0) * (r.j1 - r.j0) < 30000) {
    for (let i = r.i0; i <= r.i1; i++) {
      for (let j = r.j0; j <= r.j1; j++) {
        const off = (i % 2) * ch * 0.5;
        const x0 = i * cw;
        const y0 = j * ch + off;
        const [u, w] = m.mmToN(x0 + cw / 2, y0 + ch / 2);
        if (!inside(u, w, leaf)) continue;
        const mid = Math.abs(x0 + cw / 2) < 0.12;
        const [px, py] = m.toPx(x0, y0);
        const W = (mid ? cw * 0.6 : cw) * m.k;
        const H = ch * m.k;
        ctx.fillStyle = mid ? '#9cc483' : `hsl(${95 + h(i, j) * 12}, 45%, ${70 + h(j, i) * 6}%)`;
        if (shrink < 1 && !mid) {
          // Plasmólisis (B03): la pared queda en su sitio y el protoplasto se retrae, dejando el espacio claro.
          ctx.fillStyle = '#e4efd8';
          ctx.fillRect(px, py, W, H);
          const k = shrink * (0.92 + 0.08 * h(i, j, 7));
          const pw = W * Math.min(1, k + 0.12);
          const ph = H * k;
          const cx = px + W / 2 + (h(j, i, 3) - 0.5) * (W - pw) * 0.6;
          const cy = py + H / 2 + (h(i, j, 5) - 0.5) * (H - ph) * 0.6;
          ctx.fillStyle = `hsl(${100 + h(i, j) * 10}, 50%, ${58 + h(j, i) * 6}%)`;
          ctx.beginPath();
          ctx.ellipse(cx, cy, pw / 2, ph / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          if (wallPx > 3) {
            ctx.strokeStyle = 'rgba(40, 90, 30, 0.75)';
            ctx.lineWidth = Math.max(0.6, wallPx * 0.06);
            ctx.strokeRect(px, py, W, H);
          }
          const dot = 0.0055 * m.k;
          if (dot > 0.6) {
            ctx.fillStyle = '#2b6e1a';
            for (let c = 0; c < 12; c++) {
              const a = h(i, j, c) * Math.PI * 2;
              const rr = 0.25 + 0.6 * h(j, i, c);
              ctx.beginPath();
              ctx.ellipse(cx + Math.cos(a) * rr * (pw / 2 - dot), cy + Math.sin(a) * rr * (ph / 2 - dot), dot, dot * 0.7, a, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          continue;
        }
        ctx.fillRect(px, py, W, H);
        if (wallPx > 3) {
          ctx.strokeStyle = 'rgba(40, 90, 30, 0.75)';
          ctx.lineWidth = Math.max(0.6, wallPx * 0.06);
          ctx.strokeRect(px, py, W, H);
        }
        // Cloroplastos a lo largo de las paredes.
        const dot = 0.0055 * m.k;
        if (dot > 0.6 && !mid) {
          ctx.fillStyle = '#2f7d1e';
          const n = a.assetId === 'elodeaDense' ? 18 : 10;
          for (let c = 0; c < n; c++) {
            const t = h(i, j, c);
            const side = c % 4;
            const cx = side === 0 ? px + dot * 1.4 : side === 1 ? px + W - dot * 1.4 : px + t * W;
            const cy = side < 2 ? py + t * H : side === 2 ? py + dot * 1.4 : py + H - dot * 1.4;
            ctx.beginPath();
            ctx.ellipse(cx, cy, dot, dot * 0.7, t * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }
  ctx.restore();
  // Dientes del margen.
  ctx.strokeStyle = 'rgba(60, 110, 40, 0.9)';
  ctx.lineWidth = Math.max(0.8, 0.01 * m.k);
  pathPoly(ctx, leaf, m);
  ctx.stroke();
}

/** `feulgen`: B04, citoplasma casi incoloro y núcleos magenta (solo el ADN toma el Schiff). */
function drawOnion(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, stained: boolean, feulgen = false) {
  const m = mapper(a, v);
  const region = poly(a, 'epidermalCells');
  ctx.save();
  pathPoly(ctx, region, m);
  ctx.fillStyle = feulgen ? '#f1e6ec' : stained ? '#d9c2e8' : '#ece9e2';
  ctx.fill();
  ctx.clip();
  const cw = 0.28;
  const ch = 0.07;
  const r = m.range(cw, ch);
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const off = (j % 2) * cw * 0.5;
      const x0 = i * cw + off;
      const y0 = j * ch;
      const [px, py] = m.toPx(x0, y0);
      const W = cw * m.k;
      const H = ch * m.k;
      ctx.fillStyle = feulgen ? `hsl(330, 18%, ${89 + h(j, i) * 4}%)` : stained ? `hsl(${280 + h(i, j) * 10}, 35%, ${78 + h(j, i) * 6}%)` : `hsl(40, 10%, ${88 + h(i, j) * 4}%)`;
      ctx.fillRect(px, py, W, H);
      if (H > 2.5) {
        ctx.strokeStyle = feulgen ? 'rgba(150, 100, 125, 0.6)' : stained ? 'rgba(90, 40, 120, 0.8)' : 'rgba(120, 115, 100, 0.55)';
        ctx.lineWidth = Math.max(0.6, 0.006 * m.k);
        ctx.strokeRect(px, py, W, H);
      }
      const nr = 0.012 * m.k;
      if (stained && nr > 0.8) {
        ctx.fillStyle = feulgen ? 'rgba(185, 20, 115, 0.9)' : 'rgba(70, 20, 100, 0.85)';
        ctx.beginPath();
        ctx.ellipse(px + W * (0.3 + h(i, j, 1) * 0.4), py + H * 0.5, nr * 1.3, nr, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawCrossSection(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, kind: 'corn' | 'root') {
  const m = mapper(a, v);
  const R = 0.42 * a.extentMm[0];
  const [ox, oy] = m.toPx(0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(ox, oy, R * m.k, 0, Math.PI * 2);
  ctx.fillStyle = kind === 'corn' ? '#f3d9c7' : '#e8d3e8';
  ctx.fill();
  ctx.strokeStyle = kind === 'corn' ? '#a0522d' : '#6c3483';
  ctx.lineWidth = Math.max(1.5, 0.05 * m.k);
  ctx.stroke();
  ctx.clip();
  // Parénquima.
  const cs = 0.06;
  const r = m.range(cs, cs);
  if (cs * m.k > 2.2) {
    ctx.strokeStyle = 'rgba(150, 90, 80, 0.35)';
    ctx.lineWidth = 0.6;
    for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) {
      const [px, py] = m.toPx(i * cs + (j % 2) * cs * 0.5, j * cs * 0.86);
      ctx.beginPath();
      ctx.arc(px, py, cs * m.k * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (kind === 'corn') {
    // Haces vasculares dispersos (monocotiledónea), con dos vasos grandes de xilema.
    for (let n = 0; n < 60; n++) {
      const rr = Math.sqrt(h(n, 7)) * R * 0.85;
      const t = h(n, 3) * Math.PI * 2;
      const [px, py] = m.toPx(rr * Math.cos(t), rr * Math.sin(t));
      const s = 0.1 * m.k;
      ctx.fillStyle = 'rgba(150, 60, 50, 0.55)';
      ctx.beginPath();
      ctx.ellipse(px, py, s, s * 1.2, t, 0, Math.PI * 2);
      ctx.fill();
      if (s > 4) {
        ctx.fillStyle = '#fff7f0';
        for (const dx of [-0.4, 0.4]) {
          ctx.beginPath();
          ctx.arc(px + dx * s, py - 0.2 * s, s * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(80, 140, 60, 0.7)';
        ctx.beginPath();
        ctx.arc(px, py + 0.5 * s, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Estela central con xilema en estrella.
    const sr = 0.1 * a.extentMm[0] * m.k;
    ctx.fillStyle = 'rgba(120, 50, 140, 0.45)';
    ctx.beginPath();
    ctx.arc(ox, oy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a235a';
    ctx.lineWidth = Math.max(1, sr * 0.12);
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(t) * sr * 0.85, oy + Math.sin(t) * sr * 0.85);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLeafStereo(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec) {
  const m = mapper(a, v);
  const outline = poly(a, 'venation');
  ctx.save();
  pathPoly(ctx, outline, m);
  ctx.fillStyle = '#3f8f3a';
  ctx.fill();
  ctx.clip();
  // Nervadura principal y secundarias.
  ctx.strokeStyle = '#a5d67a';
  const [tx, ty] = m.toPx(...m.nToMm(0.5, 0.08));
  const [bx, by] = m.toPx(...m.nToMm(0.5, 0.95));
  ctx.lineWidth = Math.max(1.5, 0.5 * m.k);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.8, 0.2 * m.k);
  for (let i = 0; i < 9; i++) {
    const w = 0.18 + i * 0.08;
    for (const s of [-1, 1]) {
      const [x0, y0] = m.toPx(...m.nToMm(0.5, w));
      const [x1, y1] = m.toPx(...m.nToMm(0.5 + s * 0.26, w - 0.08));
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, y0, x1, y1);
      ctx.stroke();
    }
  }
  // Tricomas: pelos finos, solo distinguibles con zoom alto.
  const hair = 0.25 * m.k;
  if (hair > 3) {
    ctx.strokeStyle = 'rgba(235, 245, 220, 0.8)';
    ctx.lineWidth = 0.7;
    const step = 0.9;
    const r = m.range(step, step);
    for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) {
      const [px, py] = m.toPx(i * step + h(i, j) * step, j * step + h(j, i) * step);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + hair * (h(i, j, 2) - 0.5), py - hair);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#2e6b2a';
  ctx.lineWidth = Math.max(1, 0.15 * m.k);
  pathPoly(ctx, outline, m);
  ctx.stroke();
}

function drawInsect(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, shiny: boolean) {
  const m = mapper(a, v);
  const shell = shiny ? '#1f8a4c' : '#4a2f1b';
  const legs = poly(a, 'leg');
  ctx.strokeStyle = '#1a1209';
  ctx.lineWidth = Math.max(1.2, 0.25 * m.k);
  for (let i = 0; i + 1 < legs.length; i += 2) {
    const [x0, y0] = m.toPx(...m.nToMm(legs[i][0], legs[i][1]));
    const [x1, y1] = m.toPx(...m.nToMm(legs[i + 1][0], legs[i + 1][1]));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  const ant = poly(a, 'antenna');
  ctx.lineWidth = Math.max(1, 0.12 * m.k);
  for (const [i0, i1] of [[0, 1], [5, 6]]) {
    const [x0, y0] = m.toPx(...m.nToMm(ant[i0][0], ant[i0][1]));
    const [x1, y1] = m.toPx(...m.nToMm(ant[i1][0], ant[i1][1]));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  for (const [part, color] of [['abdomen', shell], ['wing', shell], ['thorax', shiny ? '#16703c' : '#3a2414']] as const) {
    pathPoly(ctx, poly(a, part), m);
    ctx.fillStyle = color;
    ctx.fill();
  }
  // Sutura de los élitros y brillo.
  const [sx, sy] = m.toPx(...m.nToMm(0.5, 0.44));
  const [ex, ey] = m.toPx(...m.nToMm(0.5, 0.86));
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = Math.max(0.8, 0.08 * m.k);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  const [hx, hy] = m.toPx(...m.nToMm(0.5, 0.24));
  ctx.fillStyle = shiny ? '#1c7a42' : '#2e1d10';
  ctx.beginPath();
  ctx.arc(hx, hy, 0.08 * a.extentMm[0] * m.k, 0, Math.PI * 2);
  ctx.fill();
  // Ojos compuestos (facetas a zoom alto).
  for (const s of [-1, 1]) {
    const [ox, oy] = m.toPx(...m.nToMm(0.5 + s * 0.065, 0.23));
    const r = 0.03 * a.extentMm[0] * m.k;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 12) {
      ctx.strokeStyle = 'rgba(200,200,200,0.35)';
      ctx.lineWidth = 0.6;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        if (i * i + j * j > 9) continue;
        ctx.beginPath();
        ctx.arc(ox + i * r * 0.28, oy + j * r * 0.28, r * 0.13, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

/** Dibuja el activo en el campo pedido (el lienzo ya tiene el fondo y el recorte circular). */
export function drawAsset(ctx: CanvasRenderingContext2D, v: ViewSpec) {
  const a = assetById(v.assetId);
  if (!a) return;
  switch (baseAssetId(a.assetId)) {
    case 'elodea': case 'elodeaDense': case 'elodeaPlasmoMild': case 'elodeaPlasmo': return drawElodea(ctx, a, v);
    case 'onion': return drawOnion(ctx, a, v, true);
    case 'onionPlain': return drawOnion(ctx, a, v, false);
    case 'feulgenOnion': return drawOnion(ctx, a, v, true, true);
    case 'cornStem': return drawCrossSection(ctx, a, v, 'corn');
    case 'rootTip': return drawCrossSection(ctx, a, v, 'root');
    case 'leaf': return drawLeafStereo(ctx, a, v);
    case 'insect': return drawInsect(ctx, a, v, false);
    case 'insectShiny': return drawInsect(ctx, a, v, true);
    default: drawCellAsset(ctx, a, v, baseAssetId(a.assetId));
  }
}
