/**
 * B10 — coherencia entre lo que se dibuja y lo que se evalúa. Las láminas de montaje total se pintan a mano sobre los polígonos del
 * manifiesto: si no coinciden, un estudiante señala bien una estructura y se la rechazan. Se pinta en un lienzo falso que registra las formas.
 */
import { describe, expect, it } from 'vitest';
import { ANIMAL_ASSETS, circleHitsPolygon } from '../../simulation/specimens/assets';
import { drawAnimalAsset } from '../../engine/instruments/optical/illustrationsAnimal';
import { ANATOMY_MODELS } from '../../simulation/animal-world/catalog';
import { SPECIMEN_BUILDERS } from '../../engine/anatomy/specimens';

type Shape = { pts: Array<[number, number]>; kind: 'fill' | 'stroke'; lw: number; color: string; ell?: [number, number, number, number] };

function record(assetId: string, size = 1000) {
  const a = ANIMAL_ASSETS[assetId];
  const shapes: Shape[] = [];
  let pts: Array<[number, number]> = [];
  let ell: Shape['ell'];
  const ctx: any = new Proxy({ fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1 }, {
    get(t: any, k: string) {
      if (k in t) return t[k];
      if (k === 'beginPath') return () => { pts = []; ell = undefined; };
      if (k === 'moveTo' || k === 'lineTo') return (x: number, y: number) => void pts.push([x, y]);
      if (k === 'ellipse') return (x: number, y: number, rx: number, ry: number) => void (ell = [x, y, rx, ry]);
      if (k === 'arc') return (x: number, y: number, r: number) => void (ell = [x, y, r, r]);
      if (k === 'fill') return () => void shapes.push({ pts, ell, kind: 'fill', lw: 0, color: t.fillStyle });
      if (k === 'stroke') return () => void shapes.push({ pts, ell, kind: 'stroke', lw: t.lineWidth, color: t.strokeStyle });
      return () => {};
    },
    set(t: any, k: string, v: unknown) { t[k] = v; return true; },
  });
  // Campo que abarca el activo completo: de px a coordenadas normalizadas es una escala directa.
  drawAnimalAsset(ctx, a, { assetId, centerMm: [0, 0], fovMm: a.extentMm[0], size }, assetId);
  return shapes.map((s) => ({ ...s, pts: s.pts.map(([x, y]): [number, number] => [x / size, y / size]), ell: s.ell?.map((n) => n / size) as Shape['ell'], lw: s.lw / size }));
}

const inPoly = (u: number, v: number, p: Array<[number, number]>) => {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (p[i][1] > v !== p[j][1] > v && u < ((p[j][0] - p[i][0]) * (v - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) r = !r;
  return r;
};
const nearLine = (u: number, v: number, p: Array<[number, number]>, d: number) => p.slice(1).some(([x1, y1], i) => {
  const [x0, y0] = p[i];
  const L = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1e-9;
  const t = Math.max(0, Math.min(1, ((u - x0) * (x1 - x0) + (v - y0) * (y1 - y0)) / L));
  return Math.hypot(u - x0 - t * (x1 - x0), v - y0 - t * (y1 - y0)) <= d;
});
const painted = (u: number, v: number, s: ReturnType<typeof record>) => s.some((x) => {
  if (x.ell) return ((u - x.ell[0]) / x.ell[2]) ** 2 + ((v - x.ell[1]) / x.ell[3]) ** 2 <= 1;
  return x.kind === 'fill' ? inPoly(u, v, x.pts) : nearLine(u, v, x.pts, Math.max(x.lw, 0.004));
});
const centroid = (p: number[][]) => [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];

/** Rasgos dibujados que un estudiante señalaría, en coordenadas normalizadas de la lámina. */
const DRAWN: Record<string, Record<string, Array<[number, number]>>> = {
  planariaWM: {
    auricleS: [[0.33, 0.13], [0.67, 0.13]], ocellusS: [[0.45, 0.17], [0.55, 0.17]], pharynxS: [[0.5, 0.55], [0.5, 0.68]],
    gutBranch: [[0.5, 0.3], [0.38, 0.28], [0.62, 0.28], [0.43, 0.7], [0.57, 0.7], [0.36, 0.7], [0.64, 0.7]],
  },
  flukeWM: {
    oralSuckerS: [[0.5, 0.14]], ventralSuckerS: [[0.5, 0.26]],
    gutBranch: [[0.41, 0.5], [0.59, 0.5], [0.34, 0.5], [0.66, 0.5], [0.335, 0.6], [0.665, 0.6]],
  },
  cestodeWM: { scolexS: [[0.5, 0.12], [0.46, 0.13]], hooks: [[0.5, 0.05], [0.476, 0.06], [0.524, 0.06]], proglottidS: [[0.5, 0.35], [0.5, 0.88], [0.38, 0.88], [0.62, 0.88]] },
  daphniaWM: {
    carapace: [[0.5, 0.6], [0.72, 0.55]], compoundEye: [[0.5, 0.2]], antenna: [[0.3, 0.26], [0.22, 0.29], [0.2, 0.22], [0.14, 0.2]],
    broodPouch: [[0.5, 0.42]], bodyAppendage: [[0.5, 0.6], [0.56, 0.68]],
  },
  louseWM: {
    head: [[0.5, 0.2]], thorax: [[0.5, 0.36]], abdomen: [[0.5, 0.64]], antenna: [[0.39, 0.155], [0.61, 0.155], [0.36, 0.19], [0.64, 0.19]],
    leg: [[0.3245, 0.28], [0.6755, 0.28], [0.23, 0.35], [0.77, 0.35], [0.21, 0.4], [0.79, 0.4], [0.22, 0.45], [0.78, 0.45]],
  },
};

describe('B10: lámina dibujada contra lámina evaluada', () => {
  for (const [id, parts] of Object.entries(DRAWN)) {
    const shapes = record(id);
    const a = ANIMAL_ASSETS[id];
    it(`${id}: señalar lo dibujado acierta`, () => {
      for (const [structure, points] of Object.entries(parts)) {
        const polys = a.annotations.filter((x) => x.structureId === structure).map((x) => x.polygonNormalized);
        expect(polys.length, structure).toBeGreaterThan(0);
        for (const [u, v] of points) {
          expect(painted(u, v, shapes), `${structure} no está pintado en ${u},${v}`).toBe(true);
          expect(polys.some((p) => circleHitsPolygon(u, v, 0.012, p)), `${structure} rechazado en ${u},${v}`).toBe(true);
        }
      }
    });
    it(`${id}: toda estructura evaluada tiene algo pintado`, () => {
      for (const an of a.annotations) {
        const [u, v] = centroid(an.polygonNormalized);
        expect(painted(u, v, shapes), `${an.structureId} en ${u},${v}`).toBe(true);
      }
    });
    it(`${id}: toda estructura evaluada aparece en la lista de rasgos`, () => {
      expect(a.annotations.map((x) => x.structureId).filter((s) => !parts[s])).toEqual([]);
    });
  }
  it('cada lámina del catálogo pinta sus estructuras sin reventar', () => {
    for (const id of Object.keys(ANIMAL_ASSETS)) expect(() => record(id), id).not.toThrow();
  });
  it('los modelos declaran mallas: ningún rótulo señala la nada', () => {
    for (const m of ANATOMY_MODELS.filter((x) => x.group !== 'track')) expect(SPECIMEN_BUILDERS[m.id], m.id).toBeTruthy();
  });
});
