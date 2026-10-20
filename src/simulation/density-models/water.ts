/**
 * Densidad del agua pura a ~1 atm en función de la temperatura (Práctica 1, §3.4). Es la aproximación racional que
 * propone la especificación (de tipo Thiesen); su procedencia metrológica está PENDIENTE DE VALIDAR antes de usarla
 * como referencia oficial (decisión P01-6). Se usa solo entre 0 y 40 °C: fuera de ese intervalo se rechaza (no se
 * extrapola a ebullición ni a disoluciones). Tiene su máximo cerca de 3,98 °C.
 */

export const WATER_T_MIN_C = 0;
export const WATER_T_MAX_C = 40;

/** ¿La temperatura está dentro del dominio del modelo? */
export const waterModelValid = (tC: number) => Number.isFinite(tC) && tC >= WATER_T_MIN_C && tC <= WATER_T_MAX_C;

/** ρ(T) del agua en g/mL; NaN fuera de 0–40 °C (nunca extrapola en silencio). */
export function rhoWaterGPerMl(tC: number): number {
  if (!waterModelValid(tC)) return NaN;
  return 1 - ((tC + 288.9414) / (508929.2 * (tC + 68.12963))) * (tC - 3.9863) ** 2;
}

/**
 * ρ(T) acotada al dominio para el estado interno del mundo (una muestra nunca sale de 0–40 °C en la práctica, pero el
 * motor no debe producir NaN si un escenario la lleva al borde).
 */
export const rhoWaterClamped = (tC: number) => rhoWaterGPerMl(Math.max(WATER_T_MIN_C, Math.min(WATER_T_MAX_C, tC)));

/** Volumen (mL) de una masa de agua (g) a la temperatura dada. */
export const waterVolumeMl = (massG: number, tC: number) => massG / rhoWaterClamped(tC);

/** Masa (g) de un volumen de agua (mL) a la temperatura dada. */
export const waterMassG = (volumeMl: number, tC: number) => volumeMl * rhoWaterClamped(tC);
