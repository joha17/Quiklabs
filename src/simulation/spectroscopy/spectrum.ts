/**
 * Dominio espectral (Práctica 3, §9.3–9.5): espectros simplificados por componentes (líneas y bandas),
 * transmisión de filtros, integración con funciones de igualación CIE 1931 y conversión a color de pantalla.
 * Ningún color se elige por nombre de reactivo: todo color sale de un espectro.
 */
import { clamp, interpolateTable } from '../core/math';

/** Rejilla visible (nm): 380–780 cada 1 nm. */
export const NM_MIN = 380;
export const NM_MAX = 780;
export const NM_STEP = 1;
export const N_BINS = Math.round((NM_MAX - NM_MIN) / NM_STEP) + 1;

export type Spectrum = Float32Array;

export interface SpectralComponent {
  centerNm: number;
  /** Desviación típica de la gaussiana (nm); las líneas se ensanchan un poco por la resolución del modelo. */
  widthNm: number;
  relativeIntensity: number;
  type: 'LINE' | 'BAND';
}

export interface ObservationResult {
  spectrum: Spectrum;
  linearRgb: [number, number, number];
  displayRgb: [number, number, number];
  /** Luminancia relativa (Y) antes del mapeo de tonos. */
  intensity: number;
  dominantWavelengthNm?: number;
  /** 0–1: qué tan concluyente es la observación (señal frente a fondo). */
  confidence: number;
}

export const nmAt = (i: number): number => NM_MIN + i * NM_STEP;

export function emptySpectrum(): Spectrum {
  return new Float32Array(N_BINS);
}

/** Suma `scale × componente` (gaussiana normalizada a área = relativeIntensity). */
export function addComponent(s: Spectrum, c: SpectralComponent, scale: number): void {
  if (scale === 0 || c.relativeIntensity === 0) return;
  const sigma = Math.max(c.widthNm, 0.8);
  const norm = (c.relativeIntensity * scale) / (sigma * Math.sqrt(2 * Math.PI));
  const lo = Math.max(0, Math.floor((c.centerNm - 4 * sigma - NM_MIN) / NM_STEP));
  const hi = Math.min(N_BINS - 1, Math.ceil((c.centerNm + 4 * sigma - NM_MIN) / NM_STEP));
  for (let i = lo; i <= hi; i++) {
    const d = (nmAt(i) - c.centerNm) / sigma;
    s[i] += norm * Math.exp(-0.5 * d * d);
  }
}

export function addComponents(s: Spectrum, comps: readonly SpectralComponent[], scale: number): void {
  for (const c of comps) addComponent(s, c, scale);
}

/** s += k·o */
export function addScaled(s: Spectrum, o: Spectrum, k: number): void {
  if (k === 0) return;
  for (let i = 0; i < N_BINS; i++) s[i] += o[i] * k;
}

/** Radiancia espectral relativa de un cuerpo negro (ley de Planck), normalizada a máximo 1 en el visible. */
export function planckSpectrum(tempK: number): Spectrum {
  const s = emptySpectrum();
  const c2 = 1.4388e7; // nm·K
  let max = 0;
  for (let i = 0; i < N_BINS; i++) {
    const l = nmAt(i);
    s[i] = 1 / (l ** 5 * (Math.exp(c2 / (l * tempK)) - 1));
    if (s[i] > max) max = s[i];
  }
  if (max > 0) for (let i = 0; i < N_BINS; i++) s[i] /= max;
  return s;
}

/** Curva de transmisión tabulada [nm, T] → espectro de transmisión 0–1. */
export function transmissionCurve(table: ReadonlyArray<readonly [number, number]>): Spectrum {
  const s = emptySpectrum();
  for (let i = 0; i < N_BINS; i++) s[i] = clamp(interpolateTable(table, nmAt(i)), 0, 1);
  return s;
}

/** Espectro observado a través de un filtro: S·T·limpieza (la suciedad reduce la transmisión en todo el visible). */
export function applyFilter(s: Spectrum, t: Spectrum, cleanliness = 1): Spectrum {
  const out = emptySpectrum();
  const k = clamp(0.35 + 0.65 * cleanliness, 0, 1);
  for (let i = 0; i < N_BINS; i++) out[i] = s[i] * t[i] * k;
  return out;
}

/** Mezcla parcial: alineación 0–1 del filtro (parte de la llama queda filtrada). */
export function blendFiltered(s: Spectrum, t: Spectrum, alignment: number, cleanliness = 1): Spectrum {
  const f = applyFilter(s, t, cleanliness);
  const a = clamp(alignment, 0, 1);
  for (let i = 0; i < N_BINS; i++) f[i] = s[i] * (1 - a) + f[i] * a;
  return f;
}

// ── Funciones de igualación CIE 1931 (observador 2°), tabuladas cada 10 nm ──
// (Los ajustes analíticos fallan en el rojo profundo, justo donde caen las líneas del K a 766/770 nm.)
const CIE_1931: ReadonlyArray<readonly [number, number, number]> = [
  [0.001368, 0.000039, 0.00645], [0.004243, 0.00012, 0.02005], [0.01431, 0.000396, 0.06785], [0.04351, 0.00121, 0.2074],
  [0.13438, 0.004, 0.6456], [0.2839, 0.0116, 1.3856], [0.34828, 0.023, 1.74706], [0.3362, 0.038, 1.77211],
  [0.2908, 0.06, 1.6692], [0.19536, 0.09098, 1.28764], [0.09564, 0.13902, 0.81295], [0.03201, 0.20802, 0.46518],
  [0.0049, 0.323, 0.272], [0.0093, 0.503, 0.1582], [0.06327, 0.71, 0.07825], [0.1655, 0.862, 0.04216],
  [0.2904, 0.954, 0.0203], [0.43345, 0.99495, 0.00875], [0.5945, 0.995, 0.0039], [0.7621, 0.952, 0.0021],
  [0.9163, 0.87, 0.00165], [1.0263, 0.757, 0.0011], [1.0622, 0.631, 0.0008], [1.0026, 0.503, 0.00034],
  [0.85445, 0.381, 0.00019], [0.6424, 0.265, 0.00005], [0.4479, 0.175, 0.00002], [0.2835, 0.107, 0],
  [0.1649, 0.061, 0], [0.0874, 0.032, 0], [0.04677, 0.017, 0], [0.0227, 0.00821, 0], [0.011359, 0.004102, 0],
  [0.00579, 0.002091, 0], [0.002899, 0.001047, 0], [0.00144, 0.00052, 0], [0.00069, 0.000249, 0],
  [0.000332, 0.00012, 0], [0.000166, 0.00006, 0], [0.000083, 0.00003, 0], [0.000042, 0.000015, 0],
];

/** Interpolación logarítmica entre puntos de la tabla (las colas decaen de forma exponencial). */
export function cieXyz(nm: number): [number, number, number] {
  const f = clamp((nm - 380) / 10, 0, CIE_1931.length - 1);
  const i = Math.min(CIE_1931.length - 2, Math.floor(f));
  const u = f - i;
  const a = CIE_1931[i];
  const b = CIE_1931[i + 1];
  const mix = (p: number, q: number) => (p > 0 && q > 0 ? p * (q / p) ** u : p + (q - p) * u);
  return [mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2])];
}

const CMF: Array<[number, number, number]> = Array.from({ length: N_BINS }, (_, i) => cieXyz(nmAt(i)));
/** Normalización: un espectro plano de valor 1 tiene Y = 1. */
const Y_NORM = 1 / CMF.reduce((a, c) => a + c[1] * NM_STEP, 0);

export function spectrumToXyz(s: Spectrum): [number, number, number] {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let i = 0; i < N_BINS; i++) {
    const v = s[i];
    if (v === 0) continue;
    const c = CMF[i];
    X += v * c[0];
    Y += v * c[1];
    Z += v * c[2];
  }
  const k = Y_NORM * NM_STEP;
  return [X * k, Y * k, Z * k];
}

export function xyzToLinearSrgb([X, Y, Z]: [number, number, number]): [number, number, number] {
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
}

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/**
 * Exposición y mapeo de tonos que conserva el tono: los valores negativos (fuera de gama) se recortan,
 * y el brillo se comprime con 1 − e^(−L): una emisión débil se ve tenue y una intensa no satura igual.
 */
export function toDisplay(lin: [number, number, number], exposure = 1): [number, number, number] {
  const r = Math.max(0, lin[0] * exposure);
  const g2 = Math.max(0, lin[1] * exposure);
  const b = Math.max(0, lin[2] * exposure);
  const l = Math.max(r, g2, b);
  if (l <= 1e-9) return [0, 0, 0];
  const k = (1 - Math.exp(-l)) / l;
  return [encode(clamp(r * k, 0, 1)), encode(clamp(g2 * k, 0, 1)), encode(clamp(b * k, 0, 1))];
}

/** Longitud de onda dominante (intersección con el locus espectral desde el blanco D65); indefinida para púrpuras. */
export function dominantWavelength([X, Y, Z]: [number, number, number]): number | undefined {
  const sum = X + Y + Z;
  if (sum <= 1e-9) return undefined;
  const x = X / sum - 0.3127;
  const y = Y / sum - 0.329;
  const len = Math.hypot(x, y);
  if (len < 0.01) return undefined;
  let best = -2;
  let bestNm: number | undefined;
  for (let i = 0; i < N_BINS; i += 2) {
    const c = CMF[i];
    const cs = c[0] + c[1] + c[2];
    if (cs <= 1e-6) continue;
    const lx = c[0] / cs - 0.3127;
    const ly = c[1] / cs - 0.329;
    const cos = (lx * x + ly * y) / (Math.hypot(lx, ly) * len);
    if (cos > best) {
      best = cos;
      bestNm = nmAt(i);
    }
  }
  return best > 0.995 ? bestNm : undefined;
}

/** Observación completa de un espectro (el fondo sirve para estimar la confianza). */
export function observe(s: Spectrum, exposure: number, background?: Spectrum): ObservationResult {
  const xyz = spectrumToXyz(s);
  const lin = xyzToLinearSrgb(xyz);
  const display = toDisplay(lin, exposure);
  let confidence = 1;
  if (background) {
    const yb = spectrumToXyz(background)[1];
    const signal = Math.max(0, xyz[1] - yb);
    confidence = clamp((signal * exposure) / 0.25, 0, 1);
  }
  return { spectrum: s, linearRgb: lin, displayRgb: display, intensity: xyz[1] * exposure, dominantWavelengthNm: dominantWavelength(xyz), confidence };
}

/** Pico espectral ponderado por la sensibilidad visual (para pruebas y la vista docente). */
export function peaks(s: Spectrum, n = 3, minSepNm = 6): number[] {
  const idx = Array.from({ length: N_BINS }, (_, i) => i).sort((a, b) => s[b] - s[a]);
  const out: number[] = [];
  for (const i of idx) {
    if (s[i] <= 0) break;
    const nm = nmAt(i);
    if (out.every((p) => Math.abs(p - nm) >= minSepNm)) out.push(nm);
    if (out.length >= n) break;
  }
  return out;
}

export function spectrumAt(s: Spectrum, nm: number): number {
  const i = Math.round((nm - NM_MIN) / NM_STEP);
  return i >= 0 && i < N_BINS ? s[i] : 0;
}

/** Integral de la señal en una ventana [a, b] nm. */
export function bandEnergy(s: Spectrum, a: number, b: number): number {
  let e = 0;
  for (let i = 0; i < N_BINS; i++) {
    const l = nmAt(i);
    if (l >= a && l <= b) e += s[i] * NM_STEP;
  }
  return e;
}

/**
 * Nombre de la región cromática percibida (accesibilidad y coherencia de la libreta). Parte del color de pantalla,
 * que a su vez proviene del espectro; nunca del nombre de la sal.
 */
export type ColorRegion =
  | 'sin_color' | 'blanquecino' | 'rojo' | 'carmin' | 'rojo_anaranjado' | 'anaranjado' | 'amarillo_anaranjado' | 'amarillo' | 'amarillo_verdoso'
  | 'verde' | 'verde_azulado' | 'azul' | 'violeta' | 'lila';

export function colorRegion(rgb: [number, number, number]): ColorRegion {
  const [r, g2, b] = rgb;
  const mx = Math.max(r, g2, b);
  if (mx < 0.18) return 'sin_color';
  const mn = Math.min(r, g2, b);
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  if (sat < 0.16) return 'blanquecino';
  const d = mx - mn;
  let h = mx === r ? 60 * (((g2 - b) / d) % 6) : mx === g2 ? 60 * ((b - r) / d + 2) : 60 * ((r - g2) / d + 4);
  if (h < 0) h += 360;
  if (h < 8) return 'rojo';
  if (h < 18) return 'rojo_anaranjado';
  if (h < 26) return 'anaranjado';
  if (h < 40) return 'amarillo_anaranjado';
  if (h < 62) return 'amarillo';
  if (h < 112) return 'amarillo_verdoso';
  if (h < 150) return 'verde';
  if (h < 195) return 'verde_azulado';
  if (h < 250) return 'azul';
  if (h < 285) return 'violeta';
  if (h < 335) return 'lila';
  return 'carmin';
}
