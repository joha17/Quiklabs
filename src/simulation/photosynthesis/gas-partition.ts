/**
 * Capilar y gas (§3.2, casos 8.2–8.3). El menisco es un indicador mecánico: `mm/h` es desplazamiento y los «µmol» son
 * EQUIVALENTES de cambio de volumen gaseoso, nunca una identificación química del O₂. Dominio puro.
 */
export const R_KPA = 8.314462618; // L·kPa·mol⁻¹·K⁻¹

export const capillaryAreaCm2 = (radiusCm: number) => Math.PI * radiusCm * radiusCm;
/** ΔV (mL) de una columna de Δh (mm). */
export const volumeFromDh = (dhMm: number, radiusCm: number) => capillaryAreaCm2(radiusCm) * (dhMm / 10);
/** Δh (mm) de un ΔV (mL). */
export const dhFromVolume = (mL: number, radiusCm: number) => (mL / capillaryAreaCm2(radiusCm)) * 10;
/** n (µmol) de un volumen de gas ideal (mL, kPa, K). */
export const molesFromVolume = (mL: number, pKPa: number, tK: number) => ((pKPa * (mL / 1000)) / (R_KPA * tK)) * 1e6;
export const volumeFromMoles = (umol: number, pKPa: number, tK: number) => ((umol / 1e6) * R_KPA * tK * 1000) / pKPa;
/** Pendiente geométrica (mm/h); 20 min = 1/3 h, nunca 0,167 h. */
export const slopeMmPerH = (dhMm: number, seconds: number) => (dhMm * 3600) / seconds;
/** Expansión térmica del espacio de cabeza (mL): lo que mueve el menisco sin que cambie la fotosíntesis. */
export const thermalVolume = (headMl: number, tK: number, t0K: number) => headMl * (tK / t0K - 1);
