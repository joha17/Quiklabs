/**
 * Micrómetro de exteriores 0–25 mm, reutilizable (F101 §4, §6). Modelo de tornillo en milímetros y newtons:
 *
 * - El tambor gira; el husillo avanza `paso · giro/360°` (paso 0,5 mm, 50 divisiones → 0,01 mm). La magnitud la da
 *   la ROTACIÓN ANGULAR del mando, no el recorrido del puntero (§14).
 * - Al tocar la pieza (o el yunque, si está vacío), el giro adicional ya no avanza: carga el arco y la pieza con
 *   `F = k (contacto − husillo)`. El trinquete patina a su par nominal (fuerza constante); el tambor directo no tiene
 *   límite (F101-E04).
 * - La graduación está ajustada a la fuerza nominal del trinquete: con más fuerza la lectura sale menor (arco
 *   estirado), con menos, algo mayor. Las caras sucias suman el espesor del residuo (F101-E05).
 */

export interface MicrometerParams {
  rangeMm: number;
  pitchMm: number;
  resolutionMm: number;
  /** Rigidez del arco + pieza en la dirección del husillo (N/mm). */
  frameNPerMm: number;
  /** Fuerza a la que patina el trinquete (N) y fuerza nominal con la que se graduó el instrumento (N). */
  ratchetN: number;
  nominalN: number;
  /** Fuerza máxima que se puede aplicar a mano con el tambor (N). */
  maxForceN: number;
  /** A partir de esta fuerza la medida se considera sobreapretada (N). */
  forceLimitN: number;
  parallaxDeg: number;
}

export interface MicrometerState {
  /** Posición física del husillo (distancia entre caras si el arco fuera rígido, mm). */
  spindleMm: number;
  forceN: number;
  locked: boolean;
  zeroBiasMm: number;
  zeroChecked: boolean;
  facesDirty: boolean;
  residueMm: number;
  /** Pieza entre las caras: su extensión (mm) o null si está vacío. */
  part: { id: string; extentMm: number } | null;
  /** Mando con el que se cerró por última vez. */
  lastDrive: 'thimble' | 'ratchet';
  /** El trinquete patinó en el último cierre (se oyen los clics). */
  slipped: boolean;
}

export function newMicrometer(zeroBiasMm = 0, residueMm = 0): MicrometerState {
  return { spindleMm: 12, forceN: 0, locked: false, zeroBiasMm, zeroChecked: false, facesDirty: residueMm > 0, residueMm, part: null, lastDrive: 'ratchet', slipped: false };
}

/** Distancia a la que las caras tocan (pieza + residuo, mm). */
export function micrometerContactMm(m: MicrometerState): number {
  return (m.part?.extentMm ?? 0) + (m.facesDirty ? m.residueMm : 0);
}

/** Gira el tambor o el trinquete `deltaDeg` (positivo cierra). */
export function turnMicrometer(m: MicrometerState, deltaDeg: number, via: 'thimble' | 'ratchet', p: MicrometerParams): void {
  if (m.locked) return;
  m.lastDrive = via;
  const contact = micrometerContactMm(m);
  // Posición «libre» que tendría el husillo sin contacto (la carga actual se descuenta).
  const free = m.spindleMm - (m.forceN > 0 ? m.forceN / p.frameNPerMm : 0);
  const target = Math.min(p.rangeMm, free - (p.pitchMm * deltaDeg) / 360);
  if (target >= contact) {
    m.spindleMm = target;
    m.forceN = 0;
    m.slipped = false;
    return;
  }
  let F = Math.min(p.maxForceN, (contact - target) * p.frameNPerMm);
  if (via === 'ratchet' && F > p.ratchetN) {
    F = p.ratchetN;
    m.slipped = true;
  } else m.slipped = false;
  m.forceN = F;
  m.spindleMm = contact - F / p.frameNPerMm;
}

/** Lo que indica la graduación (mm, sin cuantizar). */
export function micrometerIndicationMm(m: MicrometerState, p: MicrometerParams): number {
  return m.spindleMm + (m.forceN > 0 ? p.nominalN / p.frameNPerMm : 0) + m.zeroBiasMm;
}

export function micrometerReadingMm(m: MicrometerState, p: MicrometerParams, viewDeg: number): { value: number; parallax: boolean } {
  const parallax = Math.abs(viewDeg) > p.parallaxDeg;
  const shift = parallax ? Math.sign(viewDeg) * p.resolutionMm : 0;
  const q = Math.round((micrometerIndicationMm(m, p) + shift) / p.resolutionMm) * p.resolutionMm;
  return { value: Number(q.toFixed(3)), parallax };
}
