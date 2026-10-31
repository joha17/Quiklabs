/**
 * Ilustraciones DIDÁCTICAS de B09 (no son microfotografías): cada región anotada del manifiesto se pinta con la textura de su
 * tejido, en milímetros reales y con patrón determinista por hash, así lo que se ve coincide con lo que puede rotularse. Las
 * láminas fijas llevan la tinción clásica (leñoso rojo, celulósico verde); las secciones frescas, tonos naturales; Wiesner solo
 * colorea de rojo `lignifiedWall`. Lo `inferred` queda tenue y lo `unavailable` no se dibuja: la imagen nunca inventa detalle.
 */
import { PLANT_ASSETS, type ObservationAssetManifest } from '../../../simulation/specimens/assets';
import { h, mapper, pathPoly, type ViewSpec } from './illustrations';

interface Look { fill: string; wall: string; cellMm: number; kind: 'round' | 'brick' | 'palisade' | 'vessel' | 'none' | 'dots' }

/** Lámina fija: safranina (lignificado rojo) y verde rápido (celulósico). */
const FIXED: Record<string, Look> = {
  epidermis: { fill: '#bfd8a4', wall: '#55803f', cellMm: 0.03, kind: 'brick' },
  epidermalCells: { fill: '#e4edcf', wall: '#7f9d62', cellMm: 0.07, kind: 'brick' },
  cortex: { fill: '#d6e6bd', wall: '#7fa066', cellMm: 0.05, kind: 'round' },
  parenchyma: { fill: '#dcebc6', wall: '#86a86d', cellMm: 0.055, kind: 'round' },
  pith: { fill: '#e5efd3', wall: '#8fae76', cellMm: 0.07, kind: 'round' },
  collenchyma: { fill: '#b9d796', wall: '#4f7f38', cellMm: 0.028, kind: 'round' },
  sclerenchyma: { fill: '#c9456a', wall: '#7c1436', cellMm: 0.014, kind: 'round' },
  stele: { fill: '#c8dcae', wall: '#6d9455', cellMm: 0.03, kind: 'round' },
  endodermis: { fill: '#a7c781', wall: '#4d7a36', cellMm: 0.022, kind: 'brick' },
  pericycle: { fill: '#b7d290', wall: '#5e8a45', cellMm: 0.016, kind: 'brick' },
  casparian: { fill: '#b0536d', wall: '#7c1436', cellMm: 0.02, kind: 'none' },
  vascularBundle: { fill: '#c5dbaa', wall: '#67904e', cellMm: 0.02, kind: 'round' },
  xylem: { fill: '#e7a5b4', wall: '#b01f4c', cellMm: 0.026, kind: 'vessel' },
  phloem: { fill: '#8fbf74', wall: '#3f7029', cellMm: 0.01, kind: 'round' },
  cambium: { fill: '#79ac5f', wall: '#3a6b28', cellMm: 0.008, kind: 'brick' },
  bark: { fill: '#a8804f', wall: '#5e4326', cellMm: 0.04, kind: 'brick' },
  growthRing: { fill: '#a81f4a', wall: '#a81f4a', cellMm: 0.02, kind: 'none' },
  palisade: { fill: '#8fc26c', wall: '#487a2f', cellMm: 0.035, kind: 'palisade' },
  spongy: { fill: '#d4e8ba', wall: '#6f9c50', cellMm: 0.05, kind: 'round' },
  mesophyll: { fill: '#a6cf82', wall: '#588a3c', cellMm: 0.04, kind: 'round' },
  cuticle: { fill: '#e7c24d', wall: '#e7c24d', cellMm: 0.01, kind: 'none' },
  stoma: { fill: '#f4f3e4', wall: '#3a6b28', cellMm: 0.01, kind: 'none' },
  guardCells: { fill: '#6da84f', wall: '#2f5f20', cellMm: 0.012, kind: 'none' },
  rootCap: { fill: '#c7d8a4', wall: '#6f8f50', cellMm: 0.04, kind: 'round' },
  meristem: { fill: '#b4cc8a', wall: '#587a3a', cellMm: 0.018, kind: 'brick' },
  elongationZone: { fill: '#d7e5bb', wall: '#7f9d62', cellMm: 0.03, kind: 'palisade' },
  nucleus: { fill: 'transparent', wall: '#2e3f6a', cellMm: 0.018, kind: 'dots' },
  sclereids: { fill: '#d9cda2', wall: '#8b7a47', cellMm: 0.02, kind: 'round' },
  lignifiedWall: { fill: '#c42d55', wall: '#7c1436', cellMm: 0.016, kind: 'vessel' },
};

/** Sección fresca sin colorante: lo lignificado no tiene rojo de ninguna clase. */
const FRESH: Record<string, Partial<Look>> = {
  xylem: { fill: '#e6edcf', wall: '#8ca06a' },
  sclerenchyma: { fill: '#dfe7c5', wall: '#8f9f6d' },
  phloem: { fill: '#cfe2ac', wall: '#83a35e' },
  vascularBundle: { fill: '#c9dfa4', wall: '#7b9d59' },
  mesophyll: { fill: '#79b257', wall: '#3f7a2b' },
  parenchyma: { fill: '#eef3d6', wall: '#a3b985' },
  epidermis: { fill: '#b9d78f', wall: '#5e8a3f' },
  collenchyma: { fill: '#c6df9d', wall: '#67934a' },
};

function cells(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, look: Look, seed: number) {
  const m = mapper(a, v);
  const px = look.cellMm * m.k;
  // Por debajo de ~3 px la textura no se resuelve: queda solo el tono del tejido.
  if (look.kind === 'none' || px < 3) return;
  const wc = look.kind === 'palisade' ? look.cellMm * 0.7 : look.cellMm;
  const hc = look.kind === 'palisade' ? look.cellMm * 2.4 : look.kind === 'brick' ? look.cellMm * 0.65 : look.cellMm;
  const r = m.range(wc, hc);
  ctx.strokeStyle = look.wall;
  ctx.lineWidth = Math.max(0.6, look.kind === 'vessel' ? px * 0.16 : px * 0.07);
  for (let i = r.i0; i <= r.i1; i++) {
    for (let j = r.j0; j <= r.j1; j++) {
      const off = j % 2 ? 0.5 : 0;
      const [x, y] = m.toPx((i + off + (h(i, j, seed) - 0.5) * 0.25) * wc, (j + (h(i, j, seed + 1) - 0.5) * 0.25) * hc);
      if (look.kind === 'dots') {
        if (h(i, j, seed + 2) < 0.45) continue;
        ctx.fillStyle = look.wall;
        ctx.beginPath();
        ctx.arc(x, y, px * 0.22, 0, Math.PI * 2);
        ctx.fill();
      } else if (look.kind === 'round' || look.kind === 'vessel') {
        ctx.beginPath();
        ctx.arc(x, y, (look.kind === 'vessel' ? 0.34 : 0.46) * px * (0.8 + 0.3 * h(i, j, seed + 3)), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x - (wc * m.k) / 2, y - (hc * m.k) / 2, wc * m.k, hc * m.k);
      }
    }
  }
}

function parallelVeins(ctx: CanvasRenderingContext2D, v: ViewSpec, a: ObservationAssetManifest) {
  const m = mapper(a, v);
  ctx.fillStyle = '#dfe7cc';
  ctx.fillRect(0, 0, v.size, v.size);
  const W = a.extentMm[0];
  const L = a.extentMm[1];
  ctx.fillStyle = '#5f9a44';
  ctx.beginPath();
  const [x0, y0] = m.toPx(-W * 0.2, -L * 0.45);
  const [x1, y1] = m.toPx(W * 0.2, L * 0.45);
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.fill();
  // Nervios paralelos a lo largo de la lámina.
  for (let i = -6; i <= 6; i++) {
    const [px, py0] = m.toPx((i / 6) * W * 0.19, -L * 0.45);
    const [, py1] = m.toPx((i / 6) * W * 0.19, L * 0.45);
    ctx.strokeStyle = i === 0 ? '#2f5f20' : '#3f7a2b';
    ctx.lineWidth = Math.max(0.7, (i === 0 ? 0.012 : 0.005) * W * m.k);
    ctx.beginPath();
    ctx.moveTo(px, py0);
    ctx.lineTo(px, py1);
    ctx.stroke();
  }
}

export function drawPlantAsset(ctx: CanvasRenderingContext2D, a: ObservationAssetManifest, v: ViewSpec, base: string): boolean {
  if (base === 'leafParallel') {
    parallelVeins(ctx, v, a);
    return true;
  }
  if (!PLANT_ASSETS[base] && !PLANT_ASSETS[a.assetId]) return false;
  const fresh = a.sampleKind === 'fresh';
  const m = mapper(a, v);
  ctx.fillStyle = fresh ? '#f3f2e6' : '#f1efe4';
  ctx.fillRect(0, 0, v.size, v.size);
  a.annotations.forEach((an, idx) => {
    if (an.evidence === 'unavailable') return;
    const look = { ...(FIXED[an.structureId] ?? FIXED.parenchyma), ...(fresh ? FRESH[an.structureId] : {}) } as Look;
    ctx.save();
    // Lo que no se distingue del todo queda tenue, nunca como una región nítida.
    ctx.globalAlpha = an.evidence === 'inferred' ? 0.4 : 1;
    pathPoly(ctx, an.polygonNormalized, m);
    ctx.clip('evenodd');
    if (look.fill !== 'transparent') {
      ctx.fillStyle = look.fill;
      ctx.fillRect(0, 0, v.size, v.size);
    }
    cells(ctx, a, v, look, 11 + idx * 7);
    ctx.restore();
  });
  return true;
}
