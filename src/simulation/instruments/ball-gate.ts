/**
 * Fotopuerta para esferas, reutilizable (F103 §4 B, §6). El haz es una recta transversal a la trayectoria; lo bloquea la
 * esfera real durante el tiempo en que la CUERDA que corta el haz pasa por él:
 *
 * - Con el haz a una distancia `off` del centro de la esfera, la cuerda mide c = 2 √(r² − off²): una fotopuerta mal
 *   centrada ve una cuerda menor que el diámetro y la velocidad d/Δt sale sobreestimada (F103-E02, F103-S11).
 * - Si |off| ≥ r el haz no se corta: no hay tiempo (evento `gateMiss`).
 * - El temporizador cuenta pulsos de su reloj de muestreo: Δt se cuantiza a 1/f. Con pocas muestras durante el bloqueo
 *   la medida pierde resolución (F103-E24).
 * - Los instantes de entrada y salida se resuelven sobre el movimiento real de la esfera (parábola en el primer tramo).
 */

export interface BallGateParams {
  /** Frecuencias de muestreo disponibles del temporizador (Hz). */
  rates: readonly number[];
  /** Muestras mínimas durante un bloqueo para considerar resuelta la medida. */
  minSamples: number;
}

export interface BallGateCrossing {
  /** Instantes (s, reloj de simulación) de entrada y salida del haz; null si el haz no se cortó. */
  tIn: number | null;
  tOut: number | null;
  /** Cuerda efectiva cortada (m). */
  chord: number;
}

/** Cuerda que la esfera de radio `r` presenta a un haz desplazado `off` de su centro (m); 0 si no lo corta. */
export function chordOf(r: number, off: number): number {
  if (!(r > 0) || !Number.isFinite(off) || Math.abs(off) >= r) return 0;
  return 2 * Math.sqrt(r * r - off * off);
}

/**
 * Cruce del haz situado a `sGate` m de la boca, a lo largo del eje de salida, por una esfera que sale de la boca en
 * `t0` con rapidez `v0` y desaceleración axial `aAxis` (componente de la gravedad a lo largo del eje, g sen θ).
 */
export function gateCrossing(t0: number, v0: number, aAxis: number, sGate: number, r: number, off: number): BallGateCrossing {
  const c = chordOf(r, off);
  if (c <= 0 || !(v0 > 0)) return { tIn: null, tOut: null, chord: 0 };
  // s(t) = v0 t − ½ a t²: instante en que el centro llega a s.
  const at = (s: number) => {
    if (Math.abs(aAxis) < 1e-12) return s / v0;
    const disc = v0 * v0 - 2 * aAxis * s;
    return disc <= 0 ? NaN : (v0 - Math.sqrt(disc)) / aAxis;
  };
  const tIn = at(sGate - c / 2);
  const tOut = at(sGate + c / 2);
  if (!Number.isFinite(tIn) || !Number.isFinite(tOut)) return { tIn: null, tOut: null, chord: c };
  return { tIn: t0 + tIn, tOut: t0 + tOut, chord: c };
}

/** Tiempo que cuenta el temporizador muestreando a `rateHz` (s): pulsos enteros de reloj, con el temblor sumado. */
export function sampledInterval(dt: number, rateHz: number, jitterS = 0): number {
  if (!Number.isFinite(dt) || !(rateHz > 0)) return NaN;
  const n = Math.round((dt + jitterS) * rateHz);
  return Number((n / rateHz).toFixed(Math.max(0, Math.ceil(Math.log10(rateHz)))));
}

/** ¿El bloqueo quedó resuelto con suficientes muestras? */
export const resolvedAt = (dt: number, rateHz: number, p: BallGateParams) => Number.isFinite(dt) && dt * rateHz >= p.minSamples;
