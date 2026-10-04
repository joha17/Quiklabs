/**
 * Generador de incógnitas (§18): la semilla fija número, identidad, intensidad (±10 %) y una leve contaminación
 * de fondo que no vuelve ambigua una ejecución correcta. Evita repetir una identidad mientras el historial
 * (si se conoce) no haya completado el conjunto. La identidad no cambia al recargar: se guarda en el mundo.
 */
import { hashRandom, hashRange } from '../../simulation/core/rng';
import type { UnknownSample } from '../../simulation/flame-world/types';
import type { CationId } from './cation-profiles';

export const BASIC_UNKNOWN_POOL: CationId[] = ['Li+', 'Na+', 'K+', 'Ca2+', 'Cu2+', 'Ba2+'];

export function generateUnknown(seed: number, history: string[] = []): UnknownSample {
  const used = new Set(history.slice(-(BASIC_UNKNOWN_POOL.length - 1)));
  const pool = BASIC_UNKNOWN_POOL.filter((c) => !used.has(c));
  const list = pool.length ? pool : BASIC_UNKNOWN_POOL;
  const cation = list[Math.floor(hashRandom(seed, 'unknown:identity') * list.length) % list.length];
  const number = 100 + Math.floor(hashRandom(seed, 'unknown:number') * 900);
  const intensityFactor = hashRange(seed, 'unknown:intensity', 0.9, 1.1);
  // Fondo de Na muy leve (agua de preparación): 0,05–0,2 % de la sal, nunca dominante en una prueba limpia
  // salvo en la propia incógnita de K, donde se reduce para no ocultarla sin filtro.
  const naBg = cation === 'Na+' ? 0 : hashRange(seed, 'unknown:bg', 0.0005, 0.002) * (cation === 'K+' ? 0.3 : 1);
  return { number, cation, intensityFactor, background: naBg > 0 ? { 'Na+': naBg } : {} };
}
