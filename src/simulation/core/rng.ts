/**
 * Generador pseudoaleatorio determinista (mulberry32).
 * El estado es un entero de 32 bits serializable: se guarda con el intento (§4.9).
 */
export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}

/** Contenedor mutable mínimo para consumir aleatorios dentro de un paso. */
export interface RngHolder {
  rng: number;
}

export function rand(h: RngHolder): number {
  const r = nextRandom(h.rng);
  h.rng = r.state;
  return r.value;
}

/** Aleatorio uniforme en [a, b]. */
export function randRange(h: RngHolder, a: number, b: number): number {
  return a + (b - a) * rand(h);
}

/** Valor reproducible derivado de la semilla y una clave (no consume estado). */
export function hashRandom(seed: number, key: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return nextRandom(h).value;
}

export function hashRange(seed: number, key: string, a: number, b: number): number {
  return a + (b - a) * hashRandom(seed, key);
}

export function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}
