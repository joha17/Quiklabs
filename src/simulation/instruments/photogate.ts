/**
 * Fotocompuerta de haz con cronómetro, reutilizable (F102 §4 B, §6). El haz es una línea transversal al carril en la
 * posición `s` del índice de la base; lo bloquea la BANDERA real del carro (ancho físico, no una velocidad perfecta):
 *
 * - Un cruce es el intervalo en que |s_bandera − s_haz| < w/2. Los instantes de entrada y salida se interpolan dentro
 *   del subpaso (lineal; a 2 m/s el error es < 10 µs, menor que la resolución de 0,1 ms).
 * - Compuerta girada: el haz cruza la bandera oblicuamente (ancho efectivo w / cos α); a más de 8° el haz pasa por
 *   encima de la punta de la bandera y el cruce no se registra (F102-E03).
 * - El cronómetro cuantiza a su resolución; con ruido declarado suma un temblor gaussiano al disparo.
 */

export interface GateTimerParams {
  resolutionS: number;
  /** Desviación del disparo (s), 0 salvo escenario de sensor ruidoso. */
  jitterS: number;
  /** Ángulo a partir del cual el haz no corta la bandera (°). */
  missYawDeg: number;
}

export interface GateState {
  /** Posición del haz a lo largo del carril (m desde la cara del lanzador). */
  s: number;
  /** Giro de la compuerta respecto de la normal al carril (°). */
  yawDeg: number;
  onTrack: boolean;
  blocked: boolean;
  /** Cruces desde el arranque del cronómetro: [entrada, salida] (s), salida null mientras sigue bloqueado. */
  events: Array<[number, number | null]>;
}

export function newGate(s: number, yawDeg = 0, onTrack = true): GateState {
  return { s, yawDeg, onTrack, blocked: false, events: [] };
}

/** Ancho efectivo que ve el haz (m) o 0 si el haz no corta la bandera. */
export function effectiveFlagWidth(flagW: number, yawDeg: number, p: GateTimerParams): number {
  const a = Math.abs(yawDeg);
  if (a > p.missYawDeg) return 0;
  return flagW / Math.cos((a * Math.PI) / 180);
}

/**
 * Avanza una compuerta en un subpaso en que el centro de la bandera pasa de `s0` a `s1` entre `t0` y `t0 + h`.
 * Devuelve true si cambió el estado de bloqueo (para el aviso en vivo).
 */
export function updateGate(g: GateState, s0: number, s1: number, t0: number, h: number, flagW: number, p: GateTimerParams, timerStart: number | null): boolean {
  if (!g.onTrack) {
    g.blocked = false;
    return false;
  }
  const w = effectiveFlagWidth(flagW, g.yawDeg, p);
  const inside = (s: number) => w > 0 && Math.abs(s - g.s) < w / 2;
  const was = g.blocked;
  const now = inside(s1);
  if (was === now) {
    // Una bandera muy rápida podría entrar y salir en el mismo subpaso: se registran ambos bordes.
    if (!now && w > 0 && Math.min(s0, s1) < g.s - w / 2 && Math.max(s0, s1) > g.s + w / 2 && timerStart !== null) {
      const tIn = crossTime(s0, s1, t0, h, s1 > s0 ? g.s - w / 2 : g.s + w / 2);
      const tOut = crossTime(s0, s1, t0, h, s1 > s0 ? g.s + w / 2 : g.s - w / 2);
      g.events.push([tIn - timerStart, tOut - timerStart]);
    }
    return false;
  }
  g.blocked = now;
  if (timerStart === null) return true;
  // Borde cruzado: el más cercano a s0 en la dirección del movimiento.
  const edge = now ? (s1 > s0 ? g.s - w / 2 : g.s + w / 2) : s1 > s0 ? g.s + w / 2 : g.s - w / 2;
  const t = crossTime(s0, s1, t0, h, edge) - timerStart;
  if (now) g.events.push([t, null]);
  else {
    const last = g.events[g.events.length - 1];
    if (last && last[1] === null) last[1] = t;
  }
  return true;
}

function crossTime(s0: number, s1: number, t0: number, h: number, edge: number): number {
  const ds = s1 - s0;
  const f = Math.abs(ds) < 1e-12 ? 0 : Math.max(0, Math.min(1, (edge - s0) / ds));
  return t0 + f * h;
}

/** Tiempo que muestra el cronómetro: cuantizado a la resolución, con el temblor ya sumado. */
export function timerIndication(t: number | null, p: GateTimerParams, jitter = 0): number | null {
  if (t === null || !Number.isFinite(t)) return null;
  const v = t + jitter * p.jitterS;
  const dec = Math.max(0, Math.ceil(-Math.log10(p.resolutionS) - 1e-9));
  return Number((Math.round(v / p.resolutionS) * p.resolutionS).toFixed(dec));
}
