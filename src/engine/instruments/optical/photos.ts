/**
 * Fotografías reales del ocular cargadas para la práctica abierta (fase 2): `muestra:objetivo` → imagen. Las pone la
 * aplicación al abrir B01/B02 (fotos del curso o generales) y las dibuja el ocular en lugar de la ilustración.
 *
 * Escala: el lado menor de la foto es el campo visual del objetivo (FN / M_obj), con el centro de la foto en el centro
 * de la muestra. Al mover la platina, la foto se repite en espejo para que el campo nunca quede cortado; el ocular
 * solo la usa mientras el dominio dice que hay muestra bajo el campo.
 */
import { photoAssetKey } from '../../../practices/photo-slots';

export interface EyepiecePhotoSource {
  assetId: string;
  objective: number;
  url: string;
}

interface Entry {
  img: HTMLImageElement;
  /** Mosaico 2×2 en espejo, girado 180° (el ocular dibuja en el marco invertido del compuesto). */
  tile: HTMLCanvasElement | null;
}

/** Lado menor (px) de la foto dentro del mosaico. */
export const TILE_SHORT = 512;

let photos = new Map<string, Entry>();
let version = 0;
let generation = 0;

const key = (assetId: string, objective: number) => `${photoAssetKey(assetId)}:${objective}`;

/** Reemplaza las fotos de la práctica; cada imagen que termina de cargar sube la versión (el ocular se redibuja). */
export function setEyepiecePhotos(list: EyepiecePhotoSource[]) {
  const gen = ++generation;
  photos = new Map();
  version++;
  if (typeof Image === 'undefined') return;
  for (const p of list) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (gen !== generation) return;
      photos.set(key(p.assetId, p.objective), { img, tile: null });
      version++;
    };
    img.src = p.url;
  }
}

export const eyepiecePhotosVersion = () => version;

/** Mosaico listo para la muestra y el objetivo, o null (se usa la ilustración). */
export function eyepiecePhoto(assetId: string | null | undefined, objective: number | null | undefined): HTMLCanvasElement | null {
  if (!assetId || !objective || assetId.startsWith('missing:')) return null;
  const e = photos.get(key(assetId, objective));
  if (!e) return null;
  e.tile ??= buildTile(e.img);
  return e.tile;
}

function buildTile(img: HTMLImageElement): HTMLCanvasElement {
  const k = TILE_SHORT / Math.min(img.naturalWidth, img.naturalHeight);
  const w = Math.round(img.naturalWidth * k);
  const h = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = 2 * w;
  c.height = 2 * h;
  const ctx = c.getContext('2d')!;
  // Las cuatro celdas comparten la esquina (w, h): (−1, −1) es la foto girada 180°; las otras, sus espejos.
  for (const [a, d] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    ctx.setTransform(a, 0, 0, d, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

/**
 * Dibuja la foto en el marco ya invertido del ocular: el punto de la muestra `p` (mm) cae en `size/2 + (p − centro)·k`,
 * igual que la ilustración, así la platina la desplaza en el mismo sentido.
 */
export function drawPhoto(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, centerMm: [number, number], fovMm: number, size: number) {
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  const s = size / TILE_SHORT;
  const k = size / fovMm;
  // Origen del mosaico: el centro de la primera foto (girada) queda en el centro de la muestra.
  const w = tile.width / 2;
  const h = tile.height / 2;
  pattern.setTransform(new DOMMatrix().translate(size / 2 - centerMm[0] * k - (w / 2) * s, size / 2 - centerMm[1] * k - (h / 2) * s).scale(s));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, size, size);
}
