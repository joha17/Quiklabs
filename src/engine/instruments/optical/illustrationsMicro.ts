/**
 * Ilustraciones DIDÁCTICAS de B07 (no son microfotografías, PMIC-04): frotis bacteriano por variante (`GRAM_LOOK`), en
 * milímetros reales y con patrón determinista por hash. Además del color, los cocos llevan contorno y los bacilos forma
 * propia, así la lectura no depende solo del tono. También dibuja la imagen de una placa sellada a partir de sus colonias.
 */
import { GRAM_LOOK, type ObservationAssetManifest } from '../../../simulation/specimens/assets';
import type { Colony } from '../../../simulation/micro-world/model';
import { h, mapper, type ViewSpec } from './illustrations';

const CELL_MM = 0.05;

export function drawMicroAsset(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, base: string): boolean {
  const look = GRAM_LOOK[base];
  if (!look) return false;
  const m = mapper(a, v);
  ctx.fillStyle = look.field;
  ctx.fillRect(0, 0, v.size, v.size);
  const low = v.fovMm > 1;
  const r = m.range(CELL_MM, CELL_MM);
  const inExtent = (x: number, y: number) => Math.abs(x) < a.extentMm[0] / 2 && Math.abs(y) < a.extentMm[1] / 2;
  for (let i = r.i0; i <= r.i1; i++) {
    for (let j = r.j0; j <= r.j1; j++) {
      const x = i * CELL_MM + (h(i, j, 1) - 0.5) * CELL_MM;
      const y = j * CELL_MM + (h(i, j, 2) - 0.5) * CELL_MM;
      if (!inExtent(x, y)) continue;
      const [px, py] = m.toPx(x, y);
      const k = h(i, j, 3);
      if (look.dense) {
        ctx.fillStyle = k > 0.5 ? '#26163f' : '#55377a';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1.2, 0.024 * m.k), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (look.sparse) {
        if (k < 0.97) continue;
        ctx.fillStyle = '#7a5a9a';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, 0.006 * m.k), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const useCocci = look.cocci && (!look.rods || h(i, j, 4) > 0.5);
      const color = useCocci ? look.cocci : look.rods;
      if (!color || k < 0.25) continue;
      ctx.globalAlpha = look.faint ? 0.5 : 1;
      ctx.fillStyle = color;
      if (low) {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.7, 0.008 * m.k), 0, Math.PI * 2);
        ctx.fill();
      } else if (useCocci) {
        // Racimo de tres cocos.
        const rc = Math.max(1, 0.0055 * m.k);
        for (const [dx, dy] of [[0, 0], [1.7, 0.4], [0.7, 1.6]]) {
          ctx.beginPath();
          ctx.arc(px + dx * rc, py + dy * rc, rc, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Bacilo: cápsula alargada con orientación propia.
        const L = Math.max(4, 0.02 * m.k);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(h(i, j, 5) * Math.PI);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.4, 0.007 * m.k);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(-L / 2, 0);
        ctx.lineTo(L / 2, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }
  return true;
}

const PIGMENT: Record<Colony['pigment'], string> = { cream: '#efe3bd', yellow: '#e6c34a', dark: '#3a2c3a', none: '#e8e4d8' };

/** Placa vista desde arriba: medio, colonias y (si se pide) la colonia elegida. `size` en píxeles de la vista; `zoom` amplía desde el centro. */
export function drawPlate(ctx: CanvasRenderingContext2D, size: number, imagePx: number, medium: string, colonies: Colony[], zoom = 1, selected: string | null = null) {
  const k = (size / imagePx) * zoom;
  const toV = (u: number) => size / 2 + (u - imagePx / 2) * k;
  ctx.fillStyle = '#1f2328';
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, (imagePx / 2) * k * 0.98, 0, Math.PI * 2);
  ctx.fillStyle = medium === 'mEMB' ? '#5c2a4e' : '#d9c58a';
  ctx.fill();
  for (const c of colonies) {
    ctx.beginPath();
    ctx.arc(toV(c.x), toV(c.y), c.rPx * k, 0, Math.PI * 2);
    ctx.fillStyle = PIGMENT[c.pigment];
    ctx.fill();
    ctx.lineWidth = c.margin === 'undulate' ? 2.2 : 1;
    ctx.strokeStyle = c.id === selected ? '#ffb300' : 'rgba(40,30,20,.55)';
    if (c.id === selected) ctx.lineWidth = 3;
    ctx.stroke();
    // Brillo central: colonia convexa; plana, sin brillo.
    if (c.elevation === 'convex') {
      ctx.beginPath();
      ctx.arc(toV(c.x) - c.rPx * k * 0.3, toV(c.y) - c.rPx * k * 0.3, c.rPx * k * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fill();
    }
  }
}
