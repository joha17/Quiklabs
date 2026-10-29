/**
 * Cinética y metrología propias de B05 (§3, §8). Funciones PURAS en unidades explícitas que COMPLEMENTAN la química
 * compartida de `biochem/model.ts` (B04): gas máximo de la catalasa con V = nRT/P, reparto del O₂ entre colector,
 * venteo y disuelto, lectura del colector graduado (resolución, cero/escala, saturación), inhibición competitiva y no
 * competitiva del modelo matemático autorizado, Beer–Lambert del NADH y tasa inicial por mínimos cuadrados sobre la
 * ventana que elige el estudiante. Los números de los casos §8 son pruebas de aritmética, no predicciones de un hígado.
 */

/** R en kPa·L/(mol·K) (§8.1). */
export const R_KPA_L = 8.314462618;
export const P_STD_KPA = 101.325;
export const T_STD_K = 298.15;
/** Masa molar de la unidad anhidroglucosilo, del agua y de la maltosa (g/mol, §8.2). */
export const M_GLUCOSYL = 162.14;
export const M_WATER = 18.015;
export const M_MALTOSE = 342.3;

/** Volumen de gas seco (mL) de n mol a T y P: V = nRT/P (§3.1). */
export const gasMl = (nMol: number, tK = T_STD_K, pKPa = P_STD_KPA) => ((nMol * R_KPA_L * tK) / pKPa) * 1000;

/** Moles de gas (mol) que ocupan V mL a T y P (inversa de `gasMl`). */
export const gasMol = (vMl: number, tK = T_STD_K, pKPa = P_STD_KPA) => ((vMl / 1000) * pKPa) / (R_KPA_L * tK);

/** O₂ máximo (mol) de un volumen de H₂O₂: 2 H₂O₂ → 2 H₂O + O₂ (§8.1: 10,00 mL de 0,1000 M → 5,000e-4 mol). */
export const o2MaxMol = (h2o2Ml: number, molarity: number, consumed01 = 1) => ((h2o2Ml / 1000) * molarity * consumed01) / 2;

/** Indicación ideal del colector con su eficiencia de captación (mL): el resto del gas NO se pierde del balance. */
export const collectedIdealMl = (nMol: number, efficiency01: number, tK = T_STD_K, pKPa = P_STD_KPA) => gasMl(nMol, tK, pKPa) * efficiency01;

/** Unidades glucosilo (mol) de una masa de almidón (g) y agua de hidrólisis hacia maltosa ideal (§8.2, caso aritmético). */
export const glucosylMol = (starchG: number) => starchG / M_GLUCOSYL;
export const maltoseIdeal = (glucosylMol0: number) => ({ maltoseMol: glucosylMol0 / 2, waterMol: glucosylMol0 / 2, maltoseG: (glucosylMol0 / 2) * M_MALTOSE, waterG: (glucosylMol0 / 2) * M_WATER });

/** Michaelis–Menten aparente y las dos familias del modelo matemático autorizado (§3.2, §8.3). Mismas unidades de S, Km, I y Ki. */
export const mm = (vmax: number, s: number, km: number) => (s <= 0 ? 0 : (vmax * s) / (km + s));
export const competitive = (vmax: number, s: number, km: number, i: number, ki: number) => (s <= 0 ? 0 : (vmax * s) / (km * (1 + i / ki) + s));
export const noncompetitive = (vmax: number, s: number, km: number, i: number, ki: number) => mm(vmax / (1 + i / ki), s, km);

/** Beer–Lambert (§8.4): A340 = ε·l·c + A_blanco; c en mol/L, l en cm. */
export const a340 = (nadhM: number, pathCm = 1, epsilon = 6220, blank = 0) => epsilon * pathCm * nadhM + blank;
/** Concentración de NADH (mol/L) desde la absorbancia corregida por el blanco. */
export const nadhFromA = (aRaw: number, aBlank: number, pathCm = 1, epsilon = 6220) => (aRaw - aBlank) / (epsilon * pathCm);

/** Fracción activa tras desnaturalizar (§3.2): a(t+Δt) = a(t)·exp(−k·Δt), irreversible. */
export const activeAfter = (a: number, kDen: number, dtS: number) => a * Math.exp(-kDen * dtS);

/**
 * Reparto del O₂ formado en un paso (mmol): primero se satura el líquido; del gas libre, con el colector conectado y la
 * llave abierta llega `eff·(1 − fuga)` al colector y el resto se ventea. Con el tubo tapado sin salida el gas queda
 * atrapado (sobrepresión). Conserva: disuelto + colectado + venteado + atrapado = formado.
 */
export function partitionO2(
  formedMmol: number,
  room: { dissolvedRoomMmol: number; collector: boolean; stopcockOpen: boolean; stoppered: boolean; efficiency01: number; leak01: number },
): { dissolved: number; collected: number; vented: number; trapped: number } {
  const dissolved = Math.min(formedMmol, Math.max(0, room.dissolvedRoomMmol));
  const gas = formedMmol - dissolved;
  if (gas <= 0) return { dissolved, collected: 0, vented: 0, trapped: 0 };
  if (room.collector) {
    if (!room.stopcockOpen) return { dissolved, collected: 0, vented: 0, trapped: gas };
    const collected = gas * room.efficiency01 * (1 - room.leak01);
    return { dissolved, collected, vented: gas - collected, trapped: 0 };
  }
  if (room.stoppered) return { dissolved, collected: 0, vented: 0, trapped: gas };
  return { dissolved, collected: 0, vented: gas, trapped: 0 };
}

/**
 * Lectura del colector graduado (mL): cero desplazado y factor de escala (SC06), paralaje del ojo, saturación en el
 * fondo de escala (C15) y redondeo a la división. `full` indica que la columna llegó al tope.
 */
export function collectorReading(trueMl: number, c: { offsetMl: number; scale: number; capacityMl: number; resolutionMl: number; parallaxMlPerDeg: number; eyeDeg: number }): { value: number; full: boolean } {
  const full = trueMl >= c.capacityMl - 1e-9;
  const shown = Math.min(trueMl, c.capacityMl) * c.scale + c.offsetMl + c.parallaxMlPerDeg * c.eyeDeg;
  const clamped = Math.max(0, Math.min(c.capacityMl, shown));
  return { value: Math.round(clamped / c.resolutionMl) * c.resolutionMl, full };
}

/** Pendiente por mínimos cuadrados de (t, y) dentro de [from, to] (unidades de y por unidad de t); null si hay < 2 puntos. */
export function slopeIn(points: Array<{ t: number; y: number }>, from = -Infinity, to = Infinity): number | null {
  const p = points.filter((q) => q.t >= from - 1e-9 && q.t <= to + 1e-9);
  if (p.length < 2) return null;
  const mt = p.reduce((a, q) => a + q.t, 0) / p.length;
  const my = p.reduce((a, q) => a + q.y, 0) / p.length;
  const den = p.reduce((a, q) => a + (q.t - mt) ** 2, 0);
  if (den <= 1e-12) return null;
  return p.reduce((a, q) => a + (q.t - mt) * (q.y - my), 0) / den;
}

/**
 * pH que se lee con una tira universal: redondeo a la resolución visual de la carta (1 unidad; 2 con tiras limitadas,
 * SC11), dentro de 1–14. La tira no da decimales: el estudiante registra la clase de color.
 */
export const stripPH = (pH: number, resolution = 1) => Math.max(1, Math.min(14, Math.round(pH / resolution) * resolution));
