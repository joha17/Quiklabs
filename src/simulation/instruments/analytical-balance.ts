/**
 * Balanza analítica (§8): cabina con puertas, nivel de burbuja, tara, estabilización con retardo, corrientes de aire
 * (ruido de Ornstein–Uhlenbeck) con las puertas abiertas, deriva lenta y capacidad. La pantalla muestra la carga
 * neta (carga − tara) redondeada a la resolución; una lectura solo vale con la pantalla estable y las puertas cerradas.
 */

export interface AnalyticalBalanceParams {
  capacityG: number;
  resolutionG: number;
  uncertaintyG: number;
  /** Constante de tiempo de la pantalla (s). */
  settleS: number;
  /** Ruido (g) con las puertas abiertas y cerradas. */
  noiseOpenG: number;
  noiseClosedG: number;
  /** Error por grado de desnivel: sesgo fijo (g/°) y relativo a la carga (1/°). */
  levelOffsetGPerDeg: number;
  levelRelPerDeg: number;
  /** Deriva del cero (g/min) desde la última tara. */
  driftGPerMin: number;
}

export const DEFAULT_ANALYTICAL: AnalyticalBalanceParams = {
  capacityG: 220, resolutionG: 0.0001, uncertaintyG: 0.0002, settleS: 0.35, noiseOpenG: 0.0012, noiseClosedG: 0.00004,
  levelOffsetGPerDeg: 0.0006, levelRelPerDeg: 0.0012, driftGPerMin: 0.00003,
};

export interface AnalyticalBalanceState {
  levelErrorDeg: number;
  doorsOpen: boolean;
  tareG: number;
  /** Instante de la última tara (para la deriva). */
  taredAt: number | null;
  panObjectId: string | null;
  /** Valor que se muestra (antes de redondear). */
  shownG: number;
  /** Valor de referencia de la ventana de estabilidad. */
  refG: number;
  noiseG: number;
  quietS: number;
  stable: boolean;
  disturbedAt: number;
  /** El objeto en el platillo toca las paredes de la cabina. */
  touching: boolean;
}

export function newAnalyticalBalance(opts: Partial<AnalyticalBalanceState> = {}): AnalyticalBalanceState {
  return { levelErrorDeg: 0, doorsOpen: false, tareG: 0, taredAt: null, panObjectId: null, shownG: 0, refG: 0, noiseG: 0, quietS: 0, stable: true, disturbedAt: 0, touching: false, ...opts };
}

/** Lo que la balanza «cree» que hay en el platillo (sin ruido): carga con el error de nivel y la deriva. */
export function balanceIndication(b: AnalyticalBalanceState, loadG: number, p: AnalyticalBalanceParams, timeS: number): number {
  const lvl = Math.abs(b.levelErrorDeg);
  const level = lvl * p.levelOffsetGPerDeg + loadG * lvl * p.levelRelPerDeg;
  const drift = b.taredAt === null ? 0 : (p.driftGPerMin * (timeS - b.taredAt)) / 60;
  const touch = b.touching ? -Math.min(loadG * 0.02, 0.5) : 0;
  return loadG + level + drift + touch - b.tareG;
}

export function stepAnalyticalBalance(b: AnalyticalBalanceState, loadG: number, p: AnalyticalBalanceParams, dt: number, timeS: number, gauss: number) {
  const amp = b.doorsOpen ? p.noiseOpenG : p.noiseClosedG;
  const tau = 1.0;
  b.noiseG += (-b.noiseG / tau) * dt + amp * Math.sqrt((2 * dt) / tau) * gauss;
  const target = balanceIndication(b, loadG, p, timeS) + b.noiseG;
  b.shownG += (target - b.shownG) * Math.min(1, dt / p.settleS);
  // El filtro de la pantalla «engancha» el valor final cuando ya está dentro de unas pocas divisiones.
  if (Math.abs(target - b.shownG) < 3 * p.resolutionG && !b.doorsOpen) b.shownG = target;
  // Estable: la lectura se queda dentro de ±2 divisiones durante 1,5 s, con las puertas cerradas.
  const inBand = Math.abs(b.shownG - b.refG) <= 2 * p.resolutionG;
  if (!inBand) b.refG = b.shownG;
  const quiet = inBand && !b.doorsOpen && timeS - b.disturbedAt > 0.4 && loadG <= p.capacityG;
  b.quietS = quiet ? b.quietS + dt : 0;
  b.stable = b.quietS >= 1.5;
}

export const displayedBalance = (b: AnalyticalBalanceState, p: AnalyticalBalanceParams, loadG: number) =>
  loadG > p.capacityG ? NaN : Math.round(b.shownG / p.resolutionG) * p.resolutionG;

export type BalanceInvalid = 'UNSTABLE' | 'DOORS_OPEN' | 'OVERLOAD' | 'NOT_TARED' | 'TOUCHING';

export function balanceValidity(b: AnalyticalBalanceState, p: AnalyticalBalanceParams, loadG: number): BalanceInvalid | undefined {
  if (loadG > p.capacityG) return 'OVERLOAD';
  if (b.doorsOpen) return 'DOORS_OPEN';
  if (!b.stable) return 'UNSTABLE';
  if (b.touching) return 'TOUCHING';
  if (b.taredAt === null) return 'NOT_TARED';
  return undefined;
}
