/**
 * Balanza de triple brazo reutilizable (§7): pesas de 100 g (muescas), 10 g (muescas) y fina 0–10 g; tornillo de cero;
 * desnivel; fiel como oscilador amortiguado `I·θ¨ + b·θ˙ + k·θ = τ_carga − τ_pesas + ruido` con ruido de aire de
 * Ornstein–Uhlenbeck y empuje de una carga caliente. La lectura es la suma de las pesas con el fiel quieto en la marca.
 */

export interface TripleBeamParams {
  capacityG: number;
  resolutionG: number;
  uncertaintyG: number;
  pointerPeriodS: number;
  pointerDamping: number;
  /** g de desequilibrio que llevan el fiel al tope. */
  pointerSpanG: number;
  hotLiftGPerK: number;
  hotFluctuationGPerK: number;
  allowedDeltaC: number;
}

export const DEFAULT_TRIPLE_BEAM: TripleBeamParams = {
  capacityG: 610, resolutionG: 0.1, uncertaintyG: 0.05, pointerPeriodS: 1.7, pointerDamping: 0.18, pointerSpanG: 0.6,
  hotLiftGPerK: 0.0035, hotFluctuationGPerK: 0.0012, allowedDeltaC: 3,
};

export interface TripleBeamState {
  riders: [number, number, number];
  zeroScrewG: number;
  zeroErrorG: number;
  levelErrorDeg: number;
  /** Objeto en el platillo. */
  panObjectId: string | null;
  /** El objeto toca la carcasa (lectura falsa). */
  touchingHousing: boolean;
  noiseG: number;
  quietS: number;
  pointer: number;
  pointerVel: number;
  airCurrent: number;
  vibration: number;
  calibratedAt: number | null;
  stable: boolean;
  disturbedAt: number;
}

export function newTripleBeam(zeroErrorG: number, opts: Partial<TripleBeamState> = {}): TripleBeamState {
  return {
    riders: [0, 0, 0], zeroScrewG: 0, zeroErrorG, levelErrorDeg: 0, panObjectId: null, touchingHousing: false, noiseG: 0, quietS: 0, pointer: 0, pointerVel: 0,
    airCurrent: 0.03, vibration: 0.02, calibratedAt: null, stable: true, disturbedAt: 0, ...opts,
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface BeamLoad {
  massG: number;
  temperatureC: number;
}

/** Desequilibrio aparente (g) que ve el fiel. */
export function beamNet(b: TripleBeamState, load: BeamLoad, ambientC: number, p: TripleBeamParams, noise: number): number {
  const hot = Math.max(0, load.temperatureC - ambientC);
  const lift = p.hotLiftGPerK * hot;
  const level = b.levelErrorDeg * 0.06 + load.massG * b.levelErrorDeg * 0.0005;
  // Un objeto que toca la carcasa descarga parte de su peso en ella.
  const touch = b.touchingHousing ? -Math.min(load.massG * 0.04, 3) : 0;
  return load.massG + touch + (b.zeroErrorG - b.zeroScrewG) + level - lift + noise - (b.riders[0] + b.riders[1] + b.riders[2]);
}

/** Masa que equilibra el fiel ahora mismo (sin ruido): lo que un estudiante cuidadoso encontraría con las pesas. */
export function beamTarget(b: TripleBeamState, load: BeamLoad, ambientC: number, p: TripleBeamParams): number {
  return beamNet(b, load, ambientC, p, 0) + b.riders[0] + b.riders[1] + b.riders[2];
}

export const zeroOk = (b: TripleBeamState) => Math.abs(b.zeroErrorG - b.zeroScrewG + b.levelErrorDeg * 0.06) <= 0.05;

/** Un paso del fiel. `gauss` es una normal estándar aproximada. */
export function stepTripleBeam(b: TripleBeamState, load: BeamLoad, ambientC: number, p: TripleBeamParams, dt: number, timeS: number, gauss: number) {
  const hot = Math.max(0, load.temperatureC - ambientC);
  const noiseAmp = p.hotFluctuationGPerK * hot + b.airCurrent * 0.06 + b.vibration * 0.01;
  const tau = 1.5;
  b.noiseG += (-b.noiseG / tau) * dt + noiseAmp * Math.sqrt((2 * dt) / tau) * gauss;
  const over = load.massG > p.capacityG;
  const eq = over ? 1 : clamp(beamNet(b, load, ambientC, p, b.noiseG) / p.pointerSpanG, -1, 1);
  const w0 = (2 * Math.PI) / p.pointerPeriodS;
  b.pointerVel += (-w0 * w0 * (b.pointer - eq) - 2 * p.pointerDamping * w0 * b.pointerVel) * dt;
  b.pointer += b.pointerVel * dt;
  if (b.pointer > 1.1) {
    b.pointer = 1.1;
    if (b.pointerVel > 0) b.pointerVel *= -0.3;
  }
  if (b.pointer < -1.1) {
    b.pointer = -1.1;
    if (b.pointerVel < 0) b.pointerVel *= -0.3;
  }
  const quiet = Math.abs(eq) < 0.95 && Math.abs(b.pointerVel) < 0.08 && Math.abs(b.pointer - eq) < 0.05 && noiseAmp < 0.025 && timeS - b.disturbedAt > 0.5;
  b.quietS = quiet ? b.quietS + dt : 0;
  b.stable = b.quietS >= 1;
  return { over };
}

export type ReadingInvalid = 'UNSTABLE' | 'HOT_LOAD' | 'NOT_CALIBRATED' | 'OVERLOAD' | 'EMPTY' | 'TOUCHING';

export const roundTo = (v: number, res: number) => Math.round(v / res) * res;

/** Validez de una lectura (§7.3–7.4). */
export function readingValidity(b: TripleBeamState, load: BeamLoad, ambientC: number, p: TripleBeamParams) {
  const riders = b.riders[0] + b.riders[1] + b.riders[2];
  const centered = Math.abs(b.pointer) < 0.06;
  const zeroCheck = !b.panObjectId && riders < 1e-9;
  const calibrated = b.calibratedAt !== null && zeroOk(b);
  let invalid: ReadingInvalid | undefined;
  if (load.massG > p.capacityG) invalid = 'OVERLOAD';
  else if (load.temperatureC > ambientC + p.allowedDeltaC) invalid = 'HOT_LOAD';
  else if (!b.stable || !centered) invalid = 'UNSTABLE';
  else if (b.touchingHousing) invalid = 'TOUCHING';
  else if (!calibrated && !zeroCheck) invalid = 'NOT_CALIBRATED';
  else if (!b.panObjectId && !zeroCheck) invalid = 'EMPTY';
  return { displayed: Math.round(roundTo(riders, p.resolutionG) * 1000) / 1000, centered, zeroCheck, calibrated, invalid };
}

/** Fija un valor de pesa respetando las muescas (100 g y 10 g) o la resolución (pesa fina). */
export function riderValue(beam: 0 | 1 | 2, v: number): number {
  if (beam === 0) return clamp(Math.round(v / 100) * 100, 0, 500);
  if (beam === 1) return clamp(Math.round(v / 10) * 10, 0, 90);
  return clamp(Math.round(v * 100) / 100, 0, 10);
}
