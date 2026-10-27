/**
 * Ilustraciones DIDÁCTICAS de B02 (no son microfotografías, §4.3): parénquima de frutos con cromoplastos, raspado de
 * papa con o sin Lugol, pulpa de pera con grupos de esclereidas y frotis bucal según el colorante. Misma convención
 * que `illustrations.ts`: milímetros reales de la muestra, patrón determinista por hash y solo lo que cae en el campo.
 * Lo que el manifiesto marca como inferido o no disponible se dibuja tenue o no se dibuja: nunca se insinúa evidencia.
 */
import type { ObservationAssetManifest } from '../../../simulation/specimens/assets';
import { h, inside, mapper, pathPoly, poly, type ViewSpec } from './illustrations';

interface Parenchyma {
  fill: string;
  wall: string;
  /** Plastidios pigmentados (cromoplastos) y su color. */
  plastid?: string;
  /** Gránulos de almidón: teñidos con Lugol (azul oscuro) o sin teñir (casi invisibles). */
  starch?: 'lugol' | 'plain';
  /** Esclereidas en el centro del fragmento y su tinte (eosina = rosado). */
  sclereids?: 'plain' | 'clear' | 'eosin' | 'faint';
  cellMm: number;
}

const PARENCHYMA: Record<string, Parenchyma> = {
  tomato: { fill: '#f6d5c8', wall: 'rgba(150, 70, 50, 0.7)', plastid: '#d8402a', cellMm: 0.16 },
  pepper: { fill: '#f8ecc4', wall: 'rgba(150, 120, 40, 0.65)', plastid: '#e8b218', cellMm: 0.12 },
  pepperRed: { fill: '#f6d8c8', wall: 'rgba(150, 80, 50, 0.65)', plastid: '#cc3a22', cellMm: 0.12 },
  carrot: { fill: '#f9dcc0', wall: 'rgba(160, 90, 30, 0.65)', plastid: '#ec7a12', cellMm: 0.07 },
  potatoPlain: { fill: '#f3efe2', wall: 'rgba(130, 120, 100, 0.55)', starch: 'plain', cellMm: 0.14 },
  potatoLugol: { fill: '#efe2c4', wall: 'rgba(120, 90, 50, 0.7)', starch: 'lugol', cellMm: 0.14 },
  pear: { fill: '#f2f0e0', wall: 'rgba(120, 120, 90, 0.55)', sclereids: 'plain', cellMm: 0.1 },
  pearClear: { fill: '#f2f0e0', wall: 'rgba(120, 120, 90, 0.55)', sclereids: 'clear', cellMm: 0.1 },
  pearEosin: { fill: '#f6dfe6', wall: 'rgba(170, 70, 110, 0.7)', sclereids: 'eosin', cellMm: 0.1 },
  guava: { fill: '#f6e6e0', wall: 'rgba(150, 110, 100, 0.5)', sclereids: 'faint', cellMm: 0.09 },
};

function drawParenchyma(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, p: Parenchyma) {
  const m = mapper(a, v);
  const region = poly(a, 'fruitCells');
  const scl = poly(a, 'sclereids');
  ctx.save();
  pathPoly(ctx, region, m);
  ctx.fillStyle = p.fill;
  ctx.fill();
  ctx.clip();
  const cw = p.cellMm;
  const r = m.range(cw, cw);
  if ((r.i1 - r.i0) * (r.j1 - r.j0) < 40000) {
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        // Celdas poligonales irregulares: centro desplazado por hash.
        const x0 = i * cw + (j % 2) * cw * 0.5;
        const y0 = j * cw * 0.87;
        const [u, w] = m.mmToN(x0, y0);
        if (!inside(u, w, region)) continue;
        const inScl = scl.length > 0 && p.sclereids && inside(u, w, scl);
        const [px, py] = m.toPx(x0, y0);
        const R = cw * 0.55 * m.k;
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const t = (Math.PI / 3) * s + h(i, j, 9) * 0.3;
          const rr = R * (0.85 + h(i + s, j, 3) * 0.25);
          const x = px + Math.cos(t) * rr;
          const y = py + Math.sin(t) * rr;
          if (s) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        if (inScl) {
          // Esclereida: pared secundaria gruesa (anillos) y lumen pequeño.
          const tint = p.sclereids === 'eosin' ? '#c2557f' : p.sclereids === 'faint' ? '#c9b9a8' : '#a08c62';
          ctx.fillStyle = p.sclereids === 'faint' ? 'rgba(200, 185, 170, 0.5)' : '#e6dcc4';
          ctx.fill();
          ctx.strokeStyle = tint;
          ctx.lineWidth = Math.max(1, R * (p.sclereids === 'clear' ? 0.5 : 0.38));
          ctx.stroke();
          if (R > 4 && p.sclereids !== 'faint') {
            ctx.strokeStyle = 'rgba(90, 70, 40, 0.5)';
            ctx.lineWidth = Math.max(0.5, R * 0.04);
            for (let c = 0; c < 4; c++) {
              const t = h(i, j, c) * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + Math.cos(t) * R * 0.7, py + Math.sin(t) * R * 0.7);
              ctx.stroke();
            }
          }
          continue;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + h(i, j) * 0.2})`;
        ctx.fill();
        if (R > 2.5) {
          ctx.strokeStyle = p.wall;
          ctx.lineWidth = Math.max(0.6, R * 0.06);
          ctx.stroke();
        }
        const dot = 0.006 * m.k;
        if (p.plastid && dot > 0.5) {
          ctx.fillStyle = p.plastid;
          const n = 14;
          for (let c = 0; c < n; c++) {
            const t = h(i, j, c) * Math.PI * 2;
            const d = R * (0.35 + 0.5 * h(j, i, c));
            ctx.beginPath();
            ctx.ellipse(px + Math.cos(t) * d, py + Math.sin(t) * d, dot * 1.3, dot * 0.7, t, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        const g = 0.012 * m.k;
        if (p.starch && g > 0.6) {
          // Gránulos ovoides con estrías; sin Lugol casi del color del citoplasma (§3.3).
          for (let c = 0; c < 7; c++) {
            const t = h(i, j, c + 20) * Math.PI * 2;
            const d = R * 0.5 * h(j, i, c + 20);
            const gx = px + Math.cos(t) * d;
            const gy = py + Math.sin(t) * d;
            const rr = g * (0.7 + 0.6 * h(i, c, j));
            ctx.beginPath();
            ctx.ellipse(gx, gy, rr * 1.3, rr, t, 0, Math.PI * 2);
            ctx.fillStyle = p.starch === 'lugol' ? '#26205a' : 'rgba(235, 232, 220, 0.85)';
            ctx.fill();
            if (p.starch === 'plain' && rr > 3) {
              ctx.strokeStyle = 'rgba(160, 155, 140, 0.35)';
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }
      }
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(110, 90, 70, 0.6)';
  ctx.lineWidth = Math.max(0.8, 0.008 * m.k);
  pathPoly(ctx, region, m);
  ctx.stroke();
}

/** Frotis bucal: células escamosas aplanadas; el colorante decide si se distinguen núcleo y citoplasma. */
function drawBuccal(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, stain: 'plain' | 'mb' | 'eosin') {
  const m = mapper(a, v);
  const region = poly(a, 'epithelialCells');
  ctx.save();
  pathPoly(ctx, region, m);
  ctx.clip();
  const cw = 0.09;
  const r = m.range(cw, cw);
  const cyto = stain === 'mb' ? 'rgba(120, 160, 215, 0.45)' : stain === 'eosin' ? 'rgba(235, 140, 170, 0.45)' : 'rgba(230, 228, 220, 0.35)';
  const edge = stain === 'mb' ? 'rgba(40, 70, 140, 0.8)' : stain === 'eosin' ? 'rgba(170, 60, 100, 0.7)' : 'rgba(150, 148, 140, 0.45)';
  if ((r.i1 - r.i0) * (r.j1 - r.j0) < 30000) {
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        if (h(i, j, 5) < 0.35) continue;
        const x0 = i * cw + (h(i, j, 1) - 0.5) * cw * 0.6;
        const y0 = j * cw + (h(j, i, 2) - 0.5) * cw * 0.6;
        const [u, w] = m.mmToN(x0, y0);
        if (!inside(u, w, region)) continue;
        const [px, py] = m.toPx(x0, y0);
        const R = cw * 0.5 * m.k;
        ctx.beginPath();
        for (let s = 0; s < 7; s++) {
          const t = (2 * Math.PI * s) / 7 + h(i, j, 7);
          const rr = R * (0.75 + h(i, s, j) * 0.4);
          const x = px + Math.cos(t) * rr;
          const y = py + Math.sin(t) * rr * 0.85;
          if (s) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = cyto;
        ctx.fill();
        if (R > 2.5) {
          ctx.strokeStyle = edge;
          ctx.lineWidth = Math.max(0.6, R * 0.04);
          ctx.stroke();
        }
        // Núcleo: nítido con azul de metileno, apenas insinuado con eosina, ausente sin teñir.
        const nr = R * 0.14;
        if (nr > 0.8 && stain !== 'plain') {
          ctx.beginPath();
          ctx.ellipse(px + (h(i, j, 3) - 0.5) * R * 0.3, py + (h(j, i, 4) - 0.5) * R * 0.3, nr * 1.2, nr, 0, 0, Math.PI * 2);
          ctx.fillStyle = stain === 'mb' ? 'rgba(25, 40, 120, 0.9)' : 'rgba(190, 110, 140, 0.35)';
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

/** Dibuja un activo de B02 (por su id base); devuelve false si no es de esta práctica. */
export function drawCellAsset(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, baseId: string): boolean {
  if (PARENCHYMA[baseId]) {
    drawParenchyma(ctx, a, v, PARENCHYMA[baseId]);
    return true;
  }
  if (baseId.startsWith('buccal')) {
    drawBuccal(ctx, a, v, baseId === 'buccalMB' ? 'mb' : baseId === 'buccalEosin' ? 'eosin' : 'plain');
    return true;
  }
  return false;
}
