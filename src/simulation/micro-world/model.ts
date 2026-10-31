/**
 * Modelos puros de B07 (§3.2, §8): índices ILUSTRATIVOS de retención de Gram (didácticos, no predicen un ensayo real),
 * diámetro calibrado con su incertidumbre, geometría del trazado digital y la disposición determinista de colonias de
 * cada placa. No hay crecimiento, incubación ni recetas: las colonias son datos del recurso virtual.
 */
import { clamp } from '../core/math';

export type MediumId = 'mNA' | 'mEMB' | 'mNB';
export type GramClass = 'pos' | 'neg' | 'mixed' | 'incompatible';

/** Ficha autorizada de cada medio. */
export const MEDIA: Record<MediumId, { name: string; consistency: 'solid' | 'liquid'; formulation: 'complex'; func: 'general' | 'selectiveDifferential' }> = {
  mNA: { name: 'nutrientAgar', consistency: 'solid', formulation: 'complex', func: 'general' },
  mEMB: { name: 'emb', consistency: 'solid', formulation: 'complex', func: 'selectiveDifferential' },
  mNB: { name: 'nutrientBroth', consistency: 'liquid', formulation: 'complex', func: 'general' },
};

const r9 = (v: number) => Math.round(v * 1e9) / 1e9;
/** Retención didáctica del primario en una célula positiva: R₊(u) = clamp(0,92 − 0,60·máx(0, u − 1), 0, 1). */
export const retentionPos = (u: number) => r9(clamp(0.92 - 0.6 * Math.max(0, u - 1), 0, 1));
/** Retención didáctica en una negativa: R₋(u) = clamp(0,12 + 0,75·máx(0, 1 − u), 0, 1). */
export const retentionNeg = (u: number) => r9(clamp(0.12 + 0.75 * Math.max(0, 1 - u), 0, 1));

/** Diámetro D = n·s y u_D = √((s·u_n)² + (n·u_s)²) (mm). */
export function colonyDiameter(n: number, s: number, uN: number, uS: number) {
  return { mm: r9(n * s), uMm: r9(Math.sqrt((s * uN) ** 2 + (n * uS) ** 2)) };
}

/** Aumento total nominal: ocular × objetivo (100X de objetivo son 1000X totales). */
export const totalMagnification = (ocularX: number, objectiveX: number) => ocularX * objectiveX;

export interface StreakMetrics {
  lengthCm: number;
  overlap01: number;
  zones: number;
  /** Separación ilustrativa: más zonas recorridas y menos solapamiento. No predice un recuento. */
  separation01: number;
  outside: boolean;
}

const GRID_CM = 0.25;
const STEP_CM = 0.1;
/** Recorrido reciente que no cuenta como solapamiento: la línea no se pisa a sí misma al avanzar. */
const TRAIL_CM = 0.6;

/** Geometría de un trazado sobre la placa de Ø 9 cm (origen en el centro, cm): cada celda repisada cuenta como solape. */
export function streakMetrics(strokes: number[][][], radiusCm = 4.5): StreakMetrics {
  const visited = new Map<string, number>();
  const quadrants = new Set<number>();
  let s = 0;
  let samples = 0;
  let over = 0;
  let outside = false;
  const visit = (x: number, y: number) => {
    if (Math.hypot(x, y) > radiusCm) outside = true;
    quadrants.add((x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0));
    const key = `${Math.floor(x / GRID_CM)}:${Math.floor(y / GRID_CM)}`;
    const seen = visited.get(key);
    samples += 1;
    if (seen !== undefined && s - seen > TRAIL_CM) over += 1;
    if (seen === undefined || s - seen > TRAIL_CM) visited.set(key, s);
  };
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const [ax, ay] = stroke[i - 1];
      const [bx, by] = stroke[i];
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(d / STEP_CM));
      for (let k = 0; k < n; k++) {
        visit(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
        s += d / n;
      }
    }
    // Levantar el asa corta el trazo reciente: el siguiente tramo sí puede pisar el anterior.
    s += TRAIL_CM + 0.01;
  }
  const overlap01 = samples ? r9(over / samples) : 0;
  return { lengthCm: r9(Math.round(s * 1000) / 1000), overlap01, zones: quadrants.size, separation01: r9(clamp((quadrants.size / 4) * (1 - overlap01), 0, 1)), outside };
}

/** Clase de colonia en la imagen de la placa (px sobre una imagen de `PLATE_IMAGE_PX`). */
export interface Colony {
  id: string;
  x: number;
  y: number;
  rPx: number;
  form: 'circular' | 'irregular';
  margin: 'entire' | 'undulate';
  elevation: 'convex' | 'flat' | 'raised';
  surface: 'smooth' | 'rough';
  pigment: 'cream' | 'yellow' | 'dark' | 'none';
  gram: GramClass;
  /** Borde parcialmente tapado por otra colonia o el rótulo (exige declararlo al medir). */
  hiddenEdge?: boolean;
}

export type PlateProfile = 'isolated' | 'typical' | 'confluent' | 'pigmented' | 'mixed' | 'blank' | 'emb' | 'incompatible';

/** Imagen de la placa: Ø 90 mm a 0,025 mm/px. */
export const PLATE_IMAGE_PX = 3600;
export const PLATE_MM_PER_PX = 0.025;

const hash = (s: string, i: number) => {
  let h = 2166136261 ^ i;
  for (let c = 0; c < s.length; c++) h = Math.imul(h ^ s.charCodeAt(c), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};

/** Colonias deterministas de una placa según su perfil (nunca se generan con el azar del mundo). */
export function plateLayout(plateId: string, profile: PlateProfile): Colony[] {
  if (profile === 'blank') return [];
  const n = profile === 'isolated' ? 9 : profile === 'confluent' ? 34 : 18;
  const out: Colony[] = [];
  const c = PLATE_IMAGE_PX / 2;
  const R = c * 0.82;
  for (let i = 0; i < n * 8 && out.length < n; i++) {
    const a = hash(plateId, i * 3 + 1) * Math.PI * 2;
    const d = Math.sqrt(hash(plateId, i * 3 + 2)) * R;
    const rPx = profile === 'confluent' ? 170 + hash(plateId, i * 3 + 3) * 60 : 55 + hash(plateId, i * 3 + 3) * 45;
    const x = Math.round(c + Math.cos(a) * d);
    const y = Math.round(c + Math.sin(a) * d);
    // Confluentes: se tocan. Los demás perfiles dejan siempre aire entre colonias: medir exige no fundirlas.
    if (profile !== 'confluent' && out.some((o) => Math.hypot(o.x - x, o.y - y) < o.rPx + rPx + 60)) continue;
    const idx = out.length;
    const isEmb = profile === 'emb';
    const pig = profile === 'pigmented' ? (idx % 2 ? 'yellow' : 'cream') : isEmb ? 'dark' : 'cream';
    const gram: GramClass = profile === 'incompatible' ? 'incompatible' : profile === 'mixed' ? (idx % 3 === 0 ? 'neg' : 'pos') : isEmb ? 'neg' : 'pos';
    out.push({
      id: `${plateId}-c${idx + 1}`, x, y, rPx: Math.round(rPx),
      form: isEmb ? 'circular' : idx % 5 === 4 ? 'irregular' : 'circular', margin: idx % 5 === 4 ? 'undulate' : 'entire', elevation: isEmb ? 'flat' : 'convex', surface: isEmb ? 'smooth' : idx % 5 === 4 ? 'rough' : 'smooth',
      pigment: pig, gram, hiddenEdge: idx % 7 === 6,
    });
  }
  return out;
}
