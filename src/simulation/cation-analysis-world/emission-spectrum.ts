/**
 * Emisión a la llama de la Práctica 9 (§3.2, §6.3) `[MODELO]`. El color NO es una etiqueta del recipiente: sale del
 * espectro calculado con los moles que realmente llegan a la zona emisora.
 *
 *   I(λ) = fondo(λ) + Σ_i n_i·η_i·Σ_j A_ij·perfil(λ − λ_ij, σ_ij)
 *   XYZ = ∫ I(λ)·(x̄, ȳ, z̄)(λ) dλ     RGB_lineal = M_sRGB·XYZ     contraste = Y/(Y + k·luz_ambiente)
 *
 * Catálogo de líneas y bandas `[VALIDAR]`: posiciones de referencia conocidas (Na 589,0/589,6; K 766,5/769,9 y
 * 404,4/404,7; Li 670,8 y 610,4; Sr 460,7 y bandas de SrOH ~606/646/682; Ca: bandas de CaOH ~554/622; Fe débil) con
 * pesos relativos y eficiencias DIDÁCTICAS que deben calibrarse con una fuente espectroscópica antes de publicar.
 * Funciones de igualación de color: ajuste analítico de Wyman, Sloan y Shirley (2013) a CIE 1931 2°.
 */
import type { Mol, SpeciesId } from './species';

export type EmitterId = 'Na+' | 'K+' | 'Li+' | 'Sr2+' | 'Ca2+' | 'Fe3+';
export const EMITTERS: EmitterId[] = ['Na+', 'K+', 'Li+', 'Sr2+', 'Ca2+', 'Fe3+'];

export interface Line {
  nm: number;
  weight: number;
  widthNm: number;
}

/** Eficiencia de emisión visible por mol (didáctica) y líneas/bandas de cada emisor. */
export const LINE_CATALOG: Record<EmitterId, { efficiency: number; lines: Line[] }> = {
  'Na+': { efficiency: 1.0, lines: [{ nm: 589.0, weight: 1.0, widthNm: 1.2 }, { nm: 589.6, weight: 0.5, widthNm: 1.2 }] },
  'K+': { efficiency: 0.3, lines: [{ nm: 766.5, weight: 1.0, widthNm: 1.5 }, { nm: 769.9, weight: 0.5, widthNm: 1.5 }, { nm: 404.4, weight: 0.5, widthNm: 1.2 }, { nm: 404.7, weight: 0.25, widthNm: 1.2 }] },
  'Li+': { efficiency: 2.0, lines: [{ nm: 670.8, weight: 1.0, widthNm: 1.5 }, { nm: 610.4, weight: 0.05, widthNm: 1.5 }] },
  'Sr2+': { efficiency: 1.5, lines: [{ nm: 460.7, weight: 0.12, widthNm: 1.2 }, { nm: 606, weight: 0.45, widthNm: 6 }, { nm: 646, weight: 0.5, widthNm: 8 }, { nm: 682, weight: 1.0, widthNm: 8 }] },
  'Ca2+': { efficiency: 0.8, lines: [{ nm: 554, weight: 0.35, widthNm: 10 }, { nm: 622, weight: 1.0, widthNm: 10 }, { nm: 422.7, weight: 0.02, widthNm: 1.2 }] },
  'Fe3+': { efficiency: 0.02, lines: [{ nm: 527, weight: 0.3, widthNm: 3 }, { nm: 438, weight: 0.2, widthNm: 3 }, { nm: 495, weight: 0.2, widthNm: 3 }] },
};

/** Fondo de la llama (bandas de CH y C₂ de una llama de gas azulada), independiente de la muestra. */
export const FLAME_BACKGROUND: Line[] = [{ nm: 431, weight: 0.05, widthNm: 4 }, { nm: 516, weight: 0.03, widthNm: 6 }, { nm: 470, weight: 0.02, widthNm: 30 }];

const g = (x: number, mu: number, s1: number, s2: number) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};
/** CIE 1931 2° (ajuste multilobular de Wyman et al., 2013). */
export const cmf = (nm: number) => ({
  x: 1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2),
  y: 0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1),
  z: 1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8),
});

/** Cantidad emitiendo (mol·s⁻¹ que atraviesan la zona emisora) por emisor → intensidad de cada línea (u.a.). */
export function lineIntensities(emitting: Partial<Record<EmitterId, number>>, scale = 1e6): Array<{ emitter: EmitterId | 'flame'; nm: number; widthNm: number; intensity: number }> {
  const out: Array<{ emitter: EmitterId | 'flame'; nm: number; widthNm: number; intensity: number }> = [];
  for (const l of FLAME_BACKGROUND) out.push({ emitter: 'flame', nm: l.nm, widthNm: l.widthNm, intensity: l.weight });
  for (const e of EMITTERS) {
    const n = emitting[e] ?? 0;
    if (!(n > 0)) continue;
    const c = LINE_CATALOG[e];
    for (const l of c.lines) out.push({ emitter: e, nm: l.nm, widthNm: l.widthNm, intensity: n * scale * c.efficiency * l.weight });
  }
  return out;
}

/** Integra el espectro con las funciones de igualación → XYZ. */
export function spectrumXYZ(lines: ReturnType<typeof lineIntensities>) {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let nm = 380; nm <= 780; nm += 1) {
    let I = 0;
    for (const l of lines) {
      const t = (nm - l.nm) / l.widthNm;
      if (Math.abs(t) < 6) I += (l.intensity * Math.exp(-0.5 * t * t)) / (l.widthNm * Math.sqrt(2 * Math.PI));
    }
    if (I === 0) continue;
    const c = cmf(nm);
    X += I * c.x;
    Y += I * c.y;
    Z += I * c.z;
  }
  return { X, Y, Z };
}

/** XYZ → sRGB lineal normalizado (cromaticidad) y luminancia. */
export function xyzToRgb({ X, Y, Z }: { X: number; Y: number; Z: number }) {
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  // Fuera de gama: se desatura sumando blanco (mantiene el tono).
  const m = Math.min(r, gg, b);
  if (m < 0) {
    r -= m;
    gg -= m;
    b -= m;
  }
  const max = Math.max(r, gg, b, 1e-12);
  return { r: r / max, g: gg / max, b: b / max, Y };
}

export type ColorCategory = 'none' | 'blue' | 'violet' | 'lilac' | 'red' | 'crimson' | 'orange' | 'yellow' | 'green' | 'white';

/** Codificación sRGB (gamma) de un color lineal: el tono percibido se juzga en el espacio codificado. */
export const encode = (c: { r: number; g: number; b: number; Y?: number }) => {
  const f = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  return { r: f(c.r), g: f(c.g), b: f(c.b), Y: c.Y ?? 0 };
};

/** Tono (0–360°) y saturación de un RGB normalizado. */
export function hueSat(c: { r: number; g: number; b: number }) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === c.r) h = 60 * (((c.g - c.b) / d) % 6);
    else if (max === c.g) h = 60 * ((c.b - c.r) / d + 2);
    else h = 60 * ((c.r - c.g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max > 0 ? d / max : 0 };
}

/**
 * Categoría percibida: depende del tono, de la saturación y del contraste con la luz ambiental de la zona de
 * observación (§6.3). Una señal débil frente a mucha luz se ve «sin color» aunque esté en el espectro.
 */
export function perceive(lines: ReturnType<typeof lineIntensities>, ambientPct: number, contrastK = 0.06) {
  const xyz = spectrumXYZ(lines);
  const sample = lines.filter((l) => l.emitter !== 'flame');
  const xyzS = spectrumXYZ(sample);
  const rgb = encode(xyzToRgb(xyz));
  // Brillo aparente: X+Y+Z (da peso al rojo y al violeta, donde la luminancia fotópica sola los subestima) `[MODELO]`.
  const bright = xyzS.X + xyzS.Y + xyzS.Z;
  const contrast = bright / (bright + contrastK * (ambientPct / 100) + 0.003);
  const sampleRgb = encode(xyzToRgb(xyzS));
  const { h, s } = hueSat(sampleRgb);
  let category: ColorCategory;
  if (contrast < 0.12) category = 'none';
  else if (s < 0.15) category = 'white';
  else if (h >= 250 && h < 290) category = 'violet';
  else if (h >= 290 && h < 335) category = 'lilac';
  else if (h >= 335 || h < 8) category = 'crimson';
  else if (h < 20) category = 'red';
  else if (h < 30) category = 'orange';
  else if (h < 70) category = 'yellow';
  else if (h < 170) category = 'green';
  else category = 'blue';
  return { category, contrast, hue: h, saturation: s, rgb, sampleRgb, luminance: xyz.Y, sampleLuminance: bright };
}

/** Moles de cada emisor en un inventario (para la zona emisora). */
export function emittersIn(m: Mol): Partial<Record<EmitterId, number>> {
  const out: Partial<Record<EmitterId, number>> = {};
  for (const e of EMITTERS) {
    const n = m[e as SpeciesId] ?? 0;
    if (n > 0) out[e] = n;
  }
  return out;
}
