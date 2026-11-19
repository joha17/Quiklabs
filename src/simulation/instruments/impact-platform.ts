/**
 * Plataforma sensora de impacto con reloj de evento, reutilizable (F103 §4 D, §6). Una placa cuadrada registra cada
 * contacto (posición en su propia escala y tiempo) desde que se arma:
 *
 * - La posición se expresa en cm desde el borde de origen de la placa (x a lo largo de la pista, y transversal desde el
 *   eje), cuantizada a la resolución de la rejilla. Sin calibrar la escala con las esquinas patrón, las posiciones salen
 *   multiplicadas por el factor de fábrica (F103-E27).
 * - Recién movida, la placa vibra: un contacto antes de que se asiente da una posición incierta (F103-E17).
 * - El reloj de evento tiene dos rangos: corto (1 s, 0,1 ms) y largo (10 s, 1 ms). Un vuelo más largo que el rango corto
 *   satura (`clipped`, F103-E22). Un retraso propio del sensor desplaza todos los tiempos (F103-S09).
 */

export interface PlatformClockRange {
  maxS: number;
  resolutionS: number;
}

export interface ImpactPlatformParams {
  sizeM: number;
  gridResolutionCm: number;
  uncalScale: number;
  settleS: number;
  latencyS: number;
  ranges: { short: PlatformClockRange; long: PlatformClockRange };
}

export type ClockRange = 'short' | 'long';

const quant = (x: number, res: number) => {
  const dec = Math.max(0, Math.ceil(-Math.log10(res) - 1e-9));
  return Number((Math.round(x / res) * res).toFixed(dec));
};

/** ¿El punto (m, suelo) cae dentro de la placa centrada en (cx, cy)? */
export function onPlatform(x: number, y: number, cx: number, cy: number, p: ImpactPlatformParams, margin = 0): boolean {
  const h = p.sizeM / 2 + margin;
  return Math.abs(x - cx) <= h && Math.abs(y - cy) <= h;
}

/** Posición indicada (cm) de un contacto, desde el borde de origen (x) y desde el eje de la placa (y). */
export function platformIndication(x: number, y: number, cx: number, cy: number, scale: number, p: ImpactPlatformParams, noiseCm = 0): { xCm: number; yCm: number } {
  const x0 = cx - p.sizeM / 2;
  return {
    xCm: quant(((x - x0) * 100 + noiseCm) * scale, p.gridResolutionCm),
    yCm: quant(((y - cy) * 100 + noiseCm * 0.5) * scale, p.gridResolutionCm),
  };
}

/** Tiempo que muestra el reloj de evento (s) y si saturó en el rango elegido. */
export function clockIndication(t: number, range: ClockRange, p: ImpactPlatformParams): { s: number; clipped: boolean } {
  const r = p.ranges[range];
  if (!Number.isFinite(t)) return { s: NaN, clipped: false };
  const v = t + p.latencyS;
  if (v > r.maxS) return { s: r.maxS, clipped: true };
  return { s: quant(v, r.resolutionS), clipped: false };
}
