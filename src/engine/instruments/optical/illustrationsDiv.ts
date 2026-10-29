/**
 * Ilustraciones DIDÁCTICAS de B06 (no son microfotografías, §4.3): epidermis de Tradescantia con estomas, Euglena y
 * Paramecium vivos (o tras Lugol o nigrosina), bacilos en cadenas, filamentos de cianobacterias y frotis sanguíneo.
 * Se dibujan EXACTAMENTE sobre las posiciones de `DIV_LAYOUT` y las regiones del manifiesto (así una marca del
 * estudiante cae donde la ve); lo que el manifiesto declara inferido se dibuja tenue y lo no disponible no se dibuja.
 * Mismas convenciones que `illustrations.ts`: milímetros reales, patrón determinista por hash.
 */
import { DIV_LAYOUT, structureStatus, type ObservationAssetManifest } from '../../../simulation/specimens/assets';
import { h, inside, mapper, pathPoly, poly, type ViewSpec } from './illustrations';

type M = ReturnType<typeof mapper>;
const alphaOf = (a: ObservationAssetManifest, s: Parameters<typeof structureStatus>[1]) => {
  const st = structureStatus(a, s);
  return st === 'visible' ? 1 : st === 'inferred' ? 0.35 : 0;
};

/** Elipse en coordenadas normalizadas del activo (mismo convenio que `ellipse` del manifiesto). */
function nEllipse(ctx: CanvasRenderingContext2D, m: M, a: ObservationAssetManifest, cx: number, cy: number, rx: number, ry: number, rot: number) {
  const [px, py] = m.toPx(...m.nToMm(cx, cy));
  ctx.beginPath();
  ctx.ellipse(px, py, rx * a.extentMm[0] * m.k, ry * a.extentMm[1] * m.k, rot, 0, Math.PI * 2);
}
function nCircle(ctx: CanvasRenderingContext2D, m: M, a: ObservationAssetManifest, cx: number, cy: number, r: number) {
  const [px, py] = m.toPx(...m.nToMm(cx, cy));
  ctx.beginPath();
  ctx.arc(px, py, r * a.extentMm[0] * m.k, 0, Math.PI * 2);
}

function drawTradescantia(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec) {
  const m = mapper(a, v);
  const region = poly(a, 'epidermalCells');
  ctx.save();
  pathPoly(ctx, region, m);
  ctx.fillStyle = '#efe6f2';
  ctx.fill();
  ctx.clip();
  // Células epidérmicas alargadas e irregulares (con antocianina tenue en algunas).
  const cw = 0.12;
  const ch = 0.07;
  const r = m.range(cw, ch);
  if ((r.i1 - r.i0) * (r.j1 - r.j0) < 40000) {
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const x0 = i * cw + (j % 2) * cw * 0.5;
        const y0 = j * ch;
        const [u, w] = m.mmToN(x0, y0);
        if (!inside(u, w, region)) continue;
        const [px, py] = m.toPx(x0, y0);
        ctx.beginPath();
        ctx.rect(px - (cw / 2) * m.k, py - (ch / 2) * m.k, cw * m.k, ch * m.k);
        ctx.fillStyle = h(i, j, 4) < 0.25 ? 'rgba(170, 110, 190, 0.35)' : 'rgba(240, 232, 244, 0.5)';
        ctx.fill();
        if (cw * m.k > 3) {
          ctx.strokeStyle = 'rgba(110, 80, 120, 0.6)';
          ctx.lineWidth = Math.max(0.5, cw * m.k * 0.03);
          ctx.stroke();
        }
      }
    }
  }
  // Estomas: dos células oclusivas arriñonadas alrededor del poro (tenues si el recurso no los distingue).
  const al = Math.max(alphaOf(a, 'stoma'), 0.25);
  for (const [x, y] of DIV_LAYOUT.stomata) {
    ctx.globalAlpha = al;
    nEllipse(ctx, m, a, x, y, 0.045, 0.05, 0);
    ctx.fillStyle = 'rgba(120, 170, 90, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 100, 50, 0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
    nEllipse(ctx, m, a, x, y, 0.008, 0.022, 0);
    ctx.fillStyle = 'rgba(40, 40, 40, 0.75)';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawCulture(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, kind: 'euglena' | 'paramecium', treat: 'live' | 'lugol' | 'nigrosin') {
  const m = mapper(a, v);
  ctx.save();
  // Fondo del medio (oscuro con nigrosina: contraste negativo) y la burbuja de aire típica del cultivo.
  ctx.fillStyle = treat === 'nigrosin' ? '#3a3a3e' : treat === 'lugol' ? '#f1e2c2' : '#eef4f2';
  ctx.fillRect(0, 0, v.size, v.size);
  const [bx, by, br] = DIV_LAYOUT.cultureBubble;
  nCircle(ctx, m, a, bx, by, br);
  ctx.strokeStyle = 'rgba(30, 30, 30, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const body = treat === 'lugol' ? 'rgba(160, 110, 50, 0.8)' : treat === 'nigrosin' ? 'rgba(240, 240, 235, 0.9)' : kind === 'euglena' ? 'rgba(120, 180, 90, 0.75)' : 'rgba(215, 205, 180, 0.7)';
  const edge = treat === 'nigrosin' ? 'rgba(250, 250, 250, 1)' : 'rgba(70, 80, 60, 0.85)';
  for (const [x, y, rx, ry, rot] of DIV_LAYOUT[kind]) {
    nEllipse(ctx, m, a, x, y, rx, ry, rot);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (kind === 'euglena') {
      ctx.globalAlpha = alphaOf(a, 'chloroplasts');
      for (let s = 0; s < 8; s++) {
        const t = (s / 8) * 2 - 1;
        nEllipse(ctx, m, a, x + Math.cos(rot) * rx * 0.6 * t, y + Math.sin(rot) * rx * 0.6 * t + (h(s, 1) - 0.5) * ry * 0.6, 0.006, 0.004, rot);
        ctx.fillStyle = '#2f7a2a';
        ctx.fill();
      }
      ctx.globalAlpha = alphaOf(a, 'eyespot');
      nCircle(ctx, m, a, x + Math.cos(rot) * rx * 0.7, y + Math.sin(rot) * rx * 0.7, 0.005);
      ctx.fillStyle = '#d0302a';
      ctx.fill();
    } else {
      ctx.globalAlpha = alphaOf(a, 'macronucleus');
      nEllipse(ctx, m, a, x, y, rx * 0.25, ry * 0.4, rot);
      ctx.fillStyle = 'rgba(120, 90, 110, 0.8)';
      ctx.fill();
      ctx.globalAlpha = Math.max(0.5, alphaOf(a, 'foodVacuole'));
      for (let s = 0; s < 5; s++) {
        nCircle(ctx, m, a, x + (h(s, 2) - 0.5) * rx, y + (h(s, 3) - 0.5) * ry, 0.006);
        ctx.strokeStyle = 'rgba(90, 90, 70, 0.7)';
        ctx.stroke();
      }
      ctx.globalAlpha = alphaOf(a, 'contractileVacuole');
      nCircle(ctx, m, a, x + Math.cos(rot) * rx * 0.6, y + Math.sin(rot) * rx * 0.6, 0.011);
      ctx.fillStyle = 'rgba(200, 225, 240, 0.9)';
      ctx.fill();
      ctx.globalAlpha = alphaOf(a, 'cilia');
      nEllipse(ctx, m, a, x, y, rx * 1.08, ry * 1.2, rot);
      ctx.setLineDash([1.5, 2]);
      ctx.strokeStyle = 'rgba(60, 60, 50, 0.8)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBacteria(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, cyano: boolean) {
  const m = mapper(a, v);
  const region = poly(a, cyano ? 'cyanoFilament' : 'bacilli');
  ctx.save();
  ctx.fillStyle = cyano ? '#f1f4ea' : '#f6eef4';
  ctx.fillRect(0, 0, v.size, v.size);
  pathPoly(ctx, region, m);
  ctx.clip();
  const step = cyano ? 0.06 : 0.025;
  const r = m.range(step, step);
  if ((r.i1 - r.i0) * (r.j1 - r.j0) < 60000) {
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        if (h(i, j, 6) < (cyano ? 0.7 : 0.55)) continue;
        const x0 = i * step + (h(i, j, 1) - 0.5) * step;
        const y0 = j * step + (h(j, i, 2) - 0.5) * step;
        const [u, w] = m.mmToN(x0, y0);
        if (!inside(u, w, region)) continue;
        const [px, py] = m.toPx(x0, y0);
        const ang = h(i, j, 8) * Math.PI;
        // Bacilos (≈ 1 × 4 µm) en cadenas cortas; cianobacterias: tricomas de células redondeadas con algún heterocisto.
        const n = cyano ? 6 : 1 + Math.floor(h(i, j, 9) * 3);
        const L = (cyano ? 0.006 : 0.004) * m.k;
        const W = (cyano ? 0.005 : 0.0012) * m.k;
        for (let s = 0; s < n; s++) {
          const cx = px + Math.cos(ang) * L * 1.1 * s;
          const cy = py + Math.sin(ang) * L * 1.1 * s;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(0.6, L / 2), Math.max(0.4, W / 2), ang, 0, Math.PI * 2);
          ctx.fillStyle = cyano ? (s === 3 ? 'rgba(200, 190, 110, 0.9)' : 'rgba(60, 130, 90, 0.85)') : 'rgba(110, 40, 140, 0.85)';
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

function drawBlood(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, stain: 'normal' | 'weak' | 'raw') {
  const m = mapper(a, v);
  ctx.save();
  ctx.fillStyle = '#faf4f2';
  ctx.fillRect(0, 0, v.size, v.size);
  const rbc = stain === 'raw' ? 'rgba(225, 200, 190, 0.6)' : stain === 'weak' ? 'rgba(230, 170, 165, 0.7)' : 'rgba(220, 120, 120, 0.85)';
  for (const [x, y] of DIV_LAYOUT.rbc) {
    nCircle(ctx, m, a, x, y, 0.035);
    ctx.fillStyle = rbc;
    ctx.fill();
    // Palidez central del disco bicóncavo.
    nCircle(ctx, m, a, x, y, 0.014);
    ctx.fillStyle = 'rgba(250, 235, 232, 0.7)';
    ctx.fill();
  }
  const wa = alphaOf(a, 'leukocyte');
  for (const [i, [x, y]] of DIV_LAYOUT.wbc.entries()) {
    ctx.globalAlpha = Math.max(0.3, wa);
    nCircle(ctx, m, a, x, y, 0.05);
    ctx.fillStyle = 'rgba(225, 210, 230, 0.85)';
    ctx.fill();
    ctx.globalAlpha = Math.max(0.2, alphaOf(a, 'nucleus'));
    if (i === 0) {
      // Núcleo segmentado (lóbulos) y núcleo redondo grande: solo forma, sin rótulo.
      for (let s = 0; s < 3; s++) {
        nCircle(ctx, m, a, x - 0.02 + s * 0.02, y + (s % 2 ? 0.01 : -0.008), 0.012);
        ctx.fillStyle = stain === 'raw' ? 'rgba(170, 160, 170, 0.6)' : 'rgba(80, 40, 120, 0.9)';
        ctx.fill();
      }
    } else {
      nCircle(ctx, m, a, x, y, 0.035);
      ctx.fillStyle = stain === 'raw' ? 'rgba(170, 160, 170, 0.6)' : 'rgba(70, 40, 120, 0.9)';
      ctx.fill();
    }
  }
  ctx.globalAlpha = alphaOf(a, 'platelet');
  for (const [x, y] of DIV_LAYOUT.plt) {
    nCircle(ctx, m, a, x, y, 0.01);
    ctx.fillStyle = 'rgba(130, 80, 160, 0.9)';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Dibuja un activo de B06 (por su id base); devuelve false si no es de esta práctica. */
export function drawDivAsset(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, baseId: string): boolean {
  switch (baseId) {
    case 'tradescantia': case 'tradescantiaBlur': drawTradescantia(ctx, a, v); return true;
    case 'euglena': case 'euglenaVisible': drawCulture(ctx, a, v, 'euglena', 'live'); return true;
    case 'euglenaLugol': drawCulture(ctx, a, v, 'euglena', 'lugol'); return true;
    case 'paramecium': case 'parameciumFine': drawCulture(ctx, a, v, 'paramecium', 'live'); return true;
    case 'parameciumNigrosin': drawCulture(ctx, a, v, 'paramecium', 'nigrosin'); return true;
    case 'parameciumLugol': drawCulture(ctx, a, v, 'paramecium', 'lugol'); return true;
    case 'bacillus': drawBacteria(ctx, a, v, false); return true;
    case 'cyano': drawBacteria(ctx, a, v, true); return true;
    case 'blood': case 'bloodDifferential': drawBlood(ctx, a, v, 'normal'); return true;
    case 'bloodLowContrast': case 'bloodWrightWeak': drawBlood(ctx, a, v, 'weak'); return true;
    case 'bloodRaw': drawBlood(ctx, a, v, 'raw'); return true;
  }
  return false;
}
